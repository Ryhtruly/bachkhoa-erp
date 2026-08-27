import sys
import types
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

for pkg in [
    'sqlalchemy',
    'sqlalchemy.dialects',
    'sqlalchemy.dialects.postgresql',
    'sqlalchemy.exc',
    'sqlalchemy.orm',
    'fastapi',
    'pydantic',
    'redis',
    'redis.asyncio',
    'dotenv',
]:
    if pkg not in sys.modules:
        class DynamicModule(types.ModuleType):
            def __init__(self, name):
                super().__init__(name)
                self.__path__ = []

            def __getattr__(self, name):
                val = MagicMock()
                setattr(self, name, val)
                return val

        sys.modules[pkg] = DynamicModule(pkg)

if not hasattr(sys.modules['sqlalchemy'], 'text'):
    sys.modules['sqlalchemy'].text = lambda sql: sql
if not hasattr(sys.modules['sqlalchemy.orm'], 'Session'):
    sys.modules['sqlalchemy.orm'].Session = object
if not hasattr(sys.modules['sqlalchemy.exc'], 'NoResultFound'):
    sys.modules['sqlalchemy.exc'].NoResultFound = type('NoResultFound', (Exception,), {})

import importlib.util
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

if 'src' not in sys.modules:
    sys.modules['src'] = types.ModuleType('src')
    sys.modules['src'].__path__ = [str(BACKEND_DIR / 'src')]

if 'src.contracts' not in sys.modules:
    contracts_pkg = types.ModuleType('src.contracts')
    contracts_pkg.__path__ = [str(BACKEND_DIR / 'src' / 'contracts')]
    sys.modules['src.contracts'] = contracts_pkg

if 'src.contracts.workflow_runtime' not in sys.modules:
    runtime_path = BACKEND_DIR / 'src' / 'contracts' / 'workflow_runtime.py'
    spec = importlib.util.spec_from_file_location('src.contracts.workflow_runtime', runtime_path)
    workflow_runtime = importlib.util.module_from_spec(spec)
    sys.modules['src.contracts.workflow_runtime'] = workflow_runtime
    spec.loader.exec_module(workflow_runtime)
else:
    workflow_runtime = sys.modules['src.contracts.workflow_runtime']


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


class WorkflowActivationReadinessTests(unittest.TestCase):
    def test_unallocated_mandatory_checklist_blocks_atomically(self):
        db = MagicMock()
        graph = _graph_with_output_templates([])
        with patch("src.dossiers.register.applicable_templates", return_value=[
            {"id": "TPL_REQUIRED_1", "name": "Sổ đỏ gốc", "is_required": True},
            {"id": "TPL_REQUIRED_2", "name": "CCCD", "is_required": True},
        ]), patch.object(
            workflow_runtime,
            "save_workflow_draft",
            side_effect=AssertionError("save_workflow_draft must not run when readiness has blockers"),
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
        readiness = caught.exception.readiness
        self.assertTrue(readiness["blockers"])
        self.assertEqual(
            [item["template_id"] for item in readiness["blockers"]],
            ["TPL_REQUIRED_1", "TPL_REQUIRED_2"],
        )
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
        self.assertEqual(readiness["code"], "ACTIVATION_READINESS_FAILED")
        self.assertEqual(len(readiness["blockers"]), 1)
        self.assertEqual(readiness["blockers"][0]["template_id"], "TPL_REQUIRED_1")
        self.assertEqual(len(readiness["warnings"]), 1)
        self.assertEqual(readiness["warnings"][0]["code"], "MISSING_PIECE_RATE_MAPPING")
        self.assertFalse(readiness["requires_confirmation"])

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


if __name__ == "__main__":
    unittest.main()
