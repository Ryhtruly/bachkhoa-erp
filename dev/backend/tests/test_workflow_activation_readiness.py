"""Isolated tests for workflow activation readiness.

This test file runs all domain logic and dependency-stubbed execution inside an
isolated child subprocess. The parent process (which runs pytest or unittest)
never injects fake sqlalchemy, fastapi, pydantic, or src modules into global
`sys.modules`, protecting the parent test suite from import poisoning.
"""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import unittest

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_FILE = Path(__file__).resolve()


def _child_entrypoint(scenario_name: str) -> None:
    """Execute the scenario inside an isolated child subprocess."""
    import importlib.util
    import types
    from unittest.mock import MagicMock, patch

    # 1. Stub third-party dependencies inside child process only
    for pkg in [
        "sqlalchemy",
        "sqlalchemy.dialects",
        "sqlalchemy.dialects.postgresql",
        "sqlalchemy.exc",
        "sqlalchemy.orm",
        "fastapi",
        "pydantic",
        "redis",
        "redis.asyncio",
        "dotenv",
    ]:
        if pkg not in sys.modules:
            class DynamicModule(types.ModuleType):
                def __init__(self, name: str):
                    super().__init__(name)
                    self.__path__ = []

                def __getattr__(self, name: str):
                    val = MagicMock()
                    setattr(self, name, val)
                    return val

            sys.modules[pkg] = DynamicModule(pkg)

    if not hasattr(sys.modules["sqlalchemy"], "text"):
        sys.modules["sqlalchemy"].text = lambda sql: sql
    if not hasattr(sys.modules["sqlalchemy.orm"], "Session"):
        sys.modules["sqlalchemy.orm"].Session = object
    if not hasattr(sys.modules["sqlalchemy.exc"], "NoResultFound"):
        sys.modules["sqlalchemy.exc"].NoResultFound = type("NoResultFound", (Exception,), {})

    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    if "src" not in sys.modules:
        sys.modules["src"] = types.ModuleType("src")
        sys.modules["src"].__path__ = [str(BACKEND_DIR / "src")]

    if "src.contracts" not in sys.modules:
        contracts_pkg = types.ModuleType("src.contracts")
        contracts_pkg.__path__ = [str(BACKEND_DIR / "src" / "contracts")]
        sys.modules["src.contracts"] = contracts_pkg

    if "src.contracts.workflow_runtime" not in sys.modules:
        runtime_path = BACKEND_DIR / "src" / "contracts" / "workflow_runtime.py"
        spec = importlib.util.spec_from_file_location("src.contracts.workflow_runtime", runtime_path)
        workflow_runtime = importlib.util.module_from_spec(spec)
        sys.modules["src.contracts.workflow_runtime"] = workflow_runtime
        spec.loader.exec_module(workflow_runtime)
    else:
        workflow_runtime = sys.modules["src.contracts.workflow_runtime"]

    def _graph_with_output_templates(template_ids):
        output_documents = [{"template_id": template_id} for template_id in template_ids]
        return {
            "start_node": "node-1",
            "nodes": {
                "node-1": {
                    "task_code": "K02",
                    "name": "Đo vẽ",
                    "transitions": {},
                    "assignments": [{"employee_id": "emp-1", "role_code": "MAIN", "is_primary": True}],
                    "checklist": [{
                        "key": "c1",
                        "name": "Biên bản",
                        "required": True,
                        "output_documents": output_documents,
                        "compensation": {"is_payable": False},
                    }],
                }
            },
        }

    def _mapping_one(row):
        result = MagicMock()
        result.mappings.return_value.one.return_value = row
        return result

    class _ChildScenarios(unittest.TestCase):
        def test_unallocated_mandatory_documents_only_ask_for_confirmation(self):
            """Giấy chưa gán vào bước nào KHÔNG chặn kích hoạt.

            Danh mục giấy của Master Data là bộ CHUẨN cho cả Gói. Một hợp đồng
            cụ thể có quyền chạy ít bước hơn — khách chỉ thuê đo vẽ rồi nhận bản
            vẽ, không làm pháp lý. Ép quy trình đó dùng hết mọi loại giấy của gói
            là bắt Giám đốc dựng thêm bước chỉ để thoả một danh sách.
            """
            db = MagicMock()
            graph = _graph_with_output_templates([])
            with patch("src.dossiers.register.applicable_templates", return_value=[
                {"id": "TPL_REQUIRED_1", "name": "Sổ đỏ gốc", "is_required": True},
                {"id": "TPL_REQUIRED_2", "name": "CCCD", "is_required": True},
            ]):
                with self.assertRaises(workflow_runtime.WorkflowActivationReadinessError) as caught:
                    workflow_runtime.activate_workflow(
                        db,
                        service_line_id="line-1",
                        graph=graph,
                        source_workflow_version_id=None,
                        change_reason=None,
                        actor_id="director-1",
                    )
            readiness = caught.exception.readiness
            # Không còn blocker nào — chỉ hỏi lại rồi cho đi tiếp.
            self.assertEqual(readiness["blockers"], [])
            self.assertTrue(readiness["requires_confirmation"])
            thieu_giay = [w for w in readiness["warnings"]
                          if w["code"] == "MANDATORY_OUTPUT_UNALLOCATED"]
            self.assertEqual(
                [item["template_id"] for item in thieu_giay],
                ["TPL_REQUIRED_1", "TPL_REQUIRED_2"],
            )
            # Vẫn dừng trước khi ghi: người dùng phải xác nhận đã.
            db.execute.assert_not_called()

        def test_fully_allocated_activation_continues_existing_success_path(self):
            db = MagicMock()
            db.execute.side_effect = [
                _mapping_one({"id": "wi-1", "status": "running", "active_revision_id": "rev-active"}),
            ]
            graph = _graph_with_output_templates(["TPL_REQUIRED_1", "TPL_REQUIRED_2"])
            with patch.object(workflow_runtime, "_collect_activation_readiness", create=True, return_value={
                "blockers": [],
                "warnings": [],
                "requires_confirmation": False,
                "code": "ACTIVATION_READY",
                "message": "",
            }), patch.object(workflow_runtime, "save_workflow_draft", return_value={
                "id": "rev-2",
                "workflow_instance_id": "wi-1",
                "revision_no": 2,
                "graph": graph,
            }), patch.object(workflow_runtime, "_apply_workflow_amendment", return_value={
                "instance_id": "wi-1",
                "revision_id": "rev-2",
                "amended": True,
                "node_count": 1,
            }):
                result = workflow_runtime.activate_workflow(
                    db,
                    service_line_id="line-1",
                    graph=graph,
                    source_workflow_version_id=None,
                    change_reason=None,
                    actor_id="director-1",
                )
            self.assertEqual(result["instance_id"], "wi-1")
            self.assertEqual(result["node_count"], 1)

        def test_missing_piece_rate_only_warns_and_requires_explicit_confirmation(self):
            db = MagicMock()
            graph = _graph_with_output_templates(["TPL_REQUIRED_1"])
            readiness = {
                "blockers": [],
                "warnings": [{
                    "code": "MISSING_PIECE_RATE_MAPPING",
                    "node_key": "node-1",
                    "node_name": "Đo vẽ",
                }],
                "requires_confirmation": True,
                "code": "ACTIVATION_CONFIRMATION_REQUIRED",
                "message": "Thiếu cấu hình khoán",
            }
            with patch.object(workflow_runtime, "_collect_activation_readiness", create=True, return_value=readiness), patch.object(
                workflow_runtime,
                "save_workflow_draft",
                side_effect=AssertionError("save_workflow_draft must not run before warning confirmation"),
            ):
                with self.assertRaises(workflow_runtime.WorkflowActivationReadinessError) as caught:
                    workflow_runtime.activate_workflow(
                        db,
                        service_line_id="line-1",
                        graph=graph,
                        source_workflow_version_id=None,
                        change_reason=None,
                        actor_id="director-1",
                    )
            self.assertTrue(caught.exception.readiness["requires_confirmation"])
            self.assertEqual(caught.exception.readiness["warnings"][0]["code"], "MISSING_PIECE_RATE_MAPPING")
            db.execute.assert_not_called()

        def test_warning_confirmation_allows_activation(self):
            db = MagicMock()
            db.execute.side_effect = [
                _mapping_one({"id": "wi-1", "status": "running", "active_revision_id": "rev-active"}),
            ]
            graph = _graph_with_output_templates(["TPL_REQUIRED_1"])
            readiness = {
                "blockers": [],
                "warnings": [{
                    "code": "MISSING_PIECE_RATE_MAPPING",
                    "node_key": "node-1",
                    "node_name": "Đo vẽ",
                }],
                "requires_confirmation": True,
                "code": "ACTIVATION_CONFIRMATION_REQUIRED",
                "message": "Thiếu cấu hình khoán",
            }
            with patch.object(workflow_runtime, "_collect_activation_readiness", create=True, return_value=readiness), patch.object(
                workflow_runtime,
                "save_workflow_draft",
                return_value={"id": "rev-2", "workflow_instance_id": "wi-1", "revision_no": 2, "graph": graph},
            ), patch.object(
                workflow_runtime,
                "_apply_workflow_amendment",
                return_value={"instance_id": "wi-1", "revision_id": "rev-2", "node_count": 1, "amended": True},
            ):
                result = workflow_runtime.activate_workflow(
                    db,
                    service_line_id="line-1",
                    graph=graph,
                    source_workflow_version_id=None,
                    change_reason=None,
                    actor_id="director-1",
                    confirm_warnings=True,
                )
            self.assertEqual(result["instance_id"], "wi-1")
            self.assertEqual(result["warnings"][0]["code"], "MISSING_PIECE_RATE_MAPPING")

        def test_mixed_invalid_request_has_no_partial_writes(self):
            db = MagicMock()
            graph = _graph_with_output_templates([])
            readiness = {
                "blockers": [
                    {"code": "MANDATORY_OUTPUT_UNALLOCATED", "template_id": "TPL_REQUIRED_1", "template_name": "Sổ đỏ gốc"}
                ],
                "warnings": [
                    {"code": "MISSING_PIECE_RATE_MAPPING", "node_key": "node-1", "node_name": "Đo vẽ"}
                ],
                "requires_confirmation": False,
                "code": "ACTIVATION_READINESS_FAILED",
                "message": "Thiếu phân bổ",
            }
            with patch.object(workflow_runtime, "_collect_activation_readiness", create=True, return_value=readiness), patch.object(
                workflow_runtime,
                "save_workflow_draft",
                side_effect=AssertionError("save_workflow_draft must not run when blockers exist"),
            ):
                with self.assertRaises(workflow_runtime.WorkflowActivationReadinessError):
                    workflow_runtime.activate_workflow(
                        db,
                        service_line_id="line-1",
                        graph=graph,
                        source_workflow_version_id=None,
                        change_reason=None,
                        actor_id="director-1",
                    )
            db.execute.assert_not_called()

        def test_collect_activation_readiness_detects_blockers_and_warnings(self):
            db = MagicMock()
            graph = _graph_with_output_templates([])
            with patch("src.dossiers.register.applicable_templates", return_value=[
                {"id": "TPL_REQUIRED_1", "name": "Sổ đỏ gốc", "is_required": True},
                {"id": "TPL_OPTIONAL_1", "name": "Giấy uỷ quyền", "is_required": False},
            ]):
                readiness = workflow_runtime._collect_activation_readiness(
                    db,
                    service_line_id="line-1",
                    graph=graph,
                )
            self.assertEqual(readiness["code"], "ACTIVATION_CONFIRMATION_REQUIRED")
            self.assertEqual(readiness["blockers"], [])
            self.assertTrue(readiness["requires_confirmation"])

            # Hai loại cảnh báo khác nhau, phải phân biệt được: thiếu khoán là
            # nhân viên mất tiền; thiếu giấy có thể chỉ là quy trình không cần.
            ma = sorted(item["code"] for item in readiness["warnings"])
            self.assertEqual(ma, ["MANDATORY_OUTPUT_UNALLOCATED", "MISSING_PIECE_RATE_MAPPING"])
            thieu_giay = [w for w in readiness["warnings"]
                          if w["code"] == "MANDATORY_OUTPUT_UNALLOCATED"]
            self.assertEqual(thieu_giay[0]["template_id"], "TPL_REQUIRED_1")
            # Giấy KHÔNG bắt buộc thì không cảnh báo — nếu không mọi quy trình
            # đều đỏ và cảnh báo mất hết ý nghĩa.
            self.assertNotIn("TPL_OPTIONAL_1", [w.get("template_id") for w in readiness["warnings"]])

        def test_collect_activation_readiness_ready_when_clean(self):
            db = MagicMock()
            graph = {
                "start_node": "node-1",
                "nodes": {
                    "node-1": {
                        "task_code": "K02",
                        "name": "Đo vẽ",
                        "transitions": {},
                        "assignments": [{"employee_id": "emp-1", "role_code": "MAIN", "is_primary": True}],
                        "checklist": [{
                            "key": "c1",
                            "name": "Biên bản",
                            "required": True,
                            "output_documents": [{"template_id": "TPL_REQUIRED_1"}],
                            "compensation": {"is_payable": True, "work_item_id": "work-1"},
                        }],
                    }
                },
            }
            with patch("src.dossiers.register.applicable_templates", return_value=[
                {"id": "TPL_REQUIRED_1", "name": "Sổ đỏ gốc", "is_required": True},
            ]):
                readiness = workflow_runtime._collect_activation_readiness(
                    db,
                    service_line_id="line-1",
                    graph=graph,
                )
            self.assertEqual(readiness["code"], "ACTIVATION_READY")
            self.assertEqual(readiness["blockers"], [])
            self.assertEqual(readiness["warnings"], [])
            self.assertFalse(readiness["requires_confirmation"])

    suite = unittest.TestSuite()
    if scenario_name == "all":
        for attr in dir(_ChildScenarios):
            if attr.startswith("test_"):
                suite.addTest(_ChildScenarios(attr))
    else:
        suite.addTest(_ChildScenarios(scenario_name))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)


class WorkflowActivationReadinessTests(unittest.TestCase):
    """Parent test suite running isolated child subprocesses."""

    def _run_child_scenario(self, scenario_name: str) -> None:
        env = os.environ.copy()
        env["PYTHONPATH"] = str(BACKEND_DIR)
        proc = subprocess.run(
            [sys.executable, str(TEST_FILE), "--child-scenario", scenario_name],
            cwd=str(BACKEND_DIR),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            self.fail(
                f"Child scenario '{scenario_name}' failed with exit code {proc.returncode}.\n"
                f"--- STDOUT ---\n{proc.stdout}\n"
                f"--- STDERR ---\n{proc.stderr}"
            )

    def test_parent_process_sys_modules_isolation(self):
        """Parent process sys.modules state must be preserved with identical presence and object identity."""
        tracked_modules = [
            "sqlalchemy",
            "sqlalchemy.dialects",
            "sqlalchemy.dialects.postgresql",
            "sqlalchemy.exc",
            "sqlalchemy.orm",
            "fastapi",
            "pydantic",
            "redis",
            "redis.asyncio",
            "dotenv",
            "src",
            "src.contracts",
            "src.contracts.workflow_runtime",
        ]
        sentinel = object()
        before_state = {mod: sys.modules.get(mod, sentinel) for mod in tracked_modules}

        self._run_child_scenario("test_collect_activation_readiness_ready_when_clean")

        for mod in tracked_modules:
            after_state = sys.modules.get(mod, sentinel)
            self.assertIs(
                after_state,
                before_state[mod],
                f"Parent process sys.modules entry for '{mod}' was altered during child scenario execution",
            )

    def test_unallocated_mandatory_documents_only_ask_for_confirmation(self):
        self._run_child_scenario("test_unallocated_mandatory_documents_only_ask_for_confirmation")

    def test_fully_allocated_activation_continues_existing_success_path(self):
        self._run_child_scenario("test_fully_allocated_activation_continues_existing_success_path")

    def test_missing_piece_rate_only_warns_and_requires_explicit_confirmation(self):
        self._run_child_scenario("test_missing_piece_rate_only_warns_and_requires_explicit_confirmation")

    def test_warning_confirmation_allows_activation(self):
        self._run_child_scenario("test_warning_confirmation_allows_activation")

    def test_mixed_invalid_request_has_no_partial_writes(self):
        self._run_child_scenario("test_mixed_invalid_request_has_no_partial_writes")

    def test_collect_activation_readiness_detects_blockers_and_warnings(self):
        self._run_child_scenario("test_collect_activation_readiness_detects_blockers_and_warnings")

    def test_collect_activation_readiness_ready_when_clean(self):
        self._run_child_scenario("test_collect_activation_readiness_ready_when_clean")


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--child-scenario":
        _child_entrypoint(sys.argv[2])
    else:
        unittest.main()
