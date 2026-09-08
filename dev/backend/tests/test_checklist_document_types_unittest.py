import json
import unittest
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from src.dossiers import checklist_document_types, register, slot_requests


DocumentTypeStatus = checklist_document_types.DocumentTypeStatus
SOURCE_LABELS = checklist_document_types.SOURCE_LABELS
checklist_context = checklist_document_types.checklist_context
progress = checklist_document_types.progress


def rows(value):
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = value
    return db


def required_function(test_case, name):
    function = getattr(checklist_document_types, name, None)
    test_case.assertTrue(callable(function), f"missing {name}")
    return function


def first(value):
    result = MagicMock()
    result.mappings.return_value.first.return_value = value
    return result


class DocumentTypeDb:
    def __init__(self, type_row, *, inserted_type=None, document_row=None):
        self.type_row = type_row
        self.inserted_type = inserted_type
        self.document_row = document_row
        self.calls = []
        self.savepoints = 0

    def execute(self, query, params=None):
        sql = " ".join(str(query).lower().split())
        self.calls.append((sql, params or {}))
        if "insert into public.checklist_result_document_types" in sql:
            return first(self.inserted_type)
        if "from public.checklist_result_document_types t" in sql and "for update" in sql:
            return first(self.type_row)
        if "from public.dossier_documents d" in sql and "for update" in sql:
            return first(self.document_row)
        if "returning f.document_id" in sql:
            return first({"document_id": (params or {}).get("document_id")})
        return MagicMock()

    def begin_nested(self):
        self.savepoints += 1
        return nullcontext()


class ChecklistDocumentTypeStatusTests(unittest.TestCase):
    def test_runtime_status_values_match_the_database_contract(self):
        self.assertEqual(
            [status.value for status in DocumentTypeStatus],
            ["draft", "pending_review", "approved", "rejected"],
        )

    def test_source_labels_use_runtime_user_facing_copy(self):
        self.assertEqual(
            SOURCE_LABELS,
            {
                "KHACH_HANG": "Khách hàng cung cấp",
                "CONG_TY": "Công ty soạn/lập",
                "CO_QUAN": "Pháp lý",
            },
        )


class ChecklistDocumentTypeProgressTests(unittest.TestCase):
    def test_checklist_is_100_only_when_every_active_type_is_approved(self):
        db = rows([
            {"status": "approved", "file_count": 2},
            {"status": "pending_review", "file_count": 1},
        ])

        self.assertEqual(progress(db, "CR-1"), {
            "approved": 1, "total": 2, "percent": 50, "is_complete": False,
        })

    def test_empty_document_checklist_is_not_publishable_to_cabinet(self):
        self.assertEqual(progress(rows([]), "CR-EMPTY")["is_complete"], False)

    def test_rejected_and_missing_file_types_never_count_as_approved(self):
        db = rows([
            {"status": "rejected", "file_count": 2},
            {"status": "approved", "file_count": 0},
            {"status": "approved", "file_count": 1},
        ])

        self.assertEqual(progress(db, "CR-2"), {
            "approved": 1, "total": 3, "percent": 33, "is_complete": False,
        })


class ChecklistCabinetSchemaCompatibilityTests(unittest.TestCase):
    def test_old_database_without_runtime_tables_returns_empty_cabinet(self):
        db = MagicMock()
        db.execute.return_value.scalar.return_value = False

        self.assertEqual(register.checklist_cabinet_by_node(db, "SL-1"), [])

        self.assertEqual(db.execute.call_count, 1)
        probe_sql = " ".join(str(db.execute.call_args.args[0]).lower().split())
        self.assertIn("to_regclass", probe_sql)
        self.assertIn("checklist_result_document_types", probe_sql)
        self.assertIn("checklist_result_document_type_files", probe_sql)


class _ProfileResult:
    def __init__(self, *, rows=None, first=None):
        self._rows = list(rows or [])
        self._first = first

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._first


class _ProfileSerializationDb:
    def __init__(self, service):
        self.service = service
        self.execute_calls = []
        self.tasks = [{
            "id": "NODE-1", "node_key": "survey", "node_code": "K02",
            "node_name": "Khảo sát", "node_description": None,
            "node_definition": {}, "is_handover": False,
            "requires_gov_submission": False, "pause_reason_type": None,
            "paused_at": None, "paused_note": None, "paused_seconds": 0,
            "allow_pause": True, "allow_gov_tracking": False,
            "cluster_code": "SURVEY", "rework_deadline_at": None,
            "status": "rework_required", "outcome": None, "started_at": None,
            "submitted_at": None, "deadline_at": None, "is_overdue": False,
            "completed_at": None, "execution_data": {}, "role_code": "MAIN",
            "is_primary": True, "service_line_id": "SL-1",
            "contract_id": "HD-1", "priority": "NORMAL",
        }]
        self.checklists = [
            {
                "id": "CR-1", "task_node_id": "NODE-1", "checklist_key": "anh-moc",
                "checklist_name": "Ảnh mốc", "is_required": True,
                "status": "failed", "require_evidence": True,
                "approver_role": "DIRECTOR", "is_overdue": False,
                "late_reason": None, "director_note": "Chụp lại ảnh mờ",
                "submitted_at": None, "evidence_data": {},
                "output_documents": [], "review_by_template": {},
            },
            {
                "id": "CR-2", "task_node_id": "NODE-1", "checklist_key": "bien-ban",
                "checklist_name": "Biên bản", "is_required": True,
                "status": "pending", "require_evidence": False,
                "approver_role": "DIRECTOR", "is_overdue": False,
                "late_reason": None, "director_note": None,
                "submitted_at": None, "evidence_data": {},
                "output_documents": [], "review_by_template": {},
            },
        ]
        self.document_types = [
            {
                "id": "CRT-1", "checklist_result_id": "CR-1", "template_id": None,
                "name": "Ảnh mốc phụ", "source": "CONG_TY",
                "origin": "EMPLOYEE_CREATED", "status": "rejected",
                "rejection_reason": "Ảnh mờ",
            },
            {
                "id": "CRT-2", "checklist_result_id": "CR-1",
                "template_id": "TPL-BB", "name": "Biên bản ranh giới",
                "source": "CO_QUAN", "origin": "CONFIGURED",
                "status": "approved", "rejection_reason": None,
            },
        ]
        self.files = [
            {"document_type_id": "CRT-1", "document_id": "D-1", "file_name": "moc-1.jpg", "content_type": "image/jpeg", "status": "approved", "change_reason": None, "rejection_reason": None},
            {"document_type_id": "CRT-1", "document_id": "D-2", "file_name": "moc-2.jpg", "content_type": "image/jpeg", "status": "rejected", "change_reason": "Chụp lại trang hai", "rejection_reason": "Ảnh mờ"},
            {"document_type_id": "CRT-1", "document_id": "D-3", "file_name": "moc-3.png", "content_type": "image/png", "status": "draft", "change_reason": None, "rejection_reason": None},
            {"document_type_id": "CRT-2", "document_id": "D-4", "file_name": "bien-ban.pdf", "content_type": "application/pdf", "status": "approved", "change_reason": None, "rejection_reason": None},
        ]

    def execute(self, query, params=None):
        self.execute_calls.append((query, params or {}))
        if query is self.service._TASKS_QUERY:
            return _ProfileResult(rows=self.tasks)
        if query is self.service._TASK_ASSIGNEES_QUERY:
            return _ProfileResult(rows=[])
        if query is self.service._TASK_CHECKLIST_QUERY:
            return _ProfileResult(rows=self.checklists)
        if query is getattr(self.service, "_CHECKLIST_DOCUMENT_TYPES_QUERY", None):
            return _ProfileResult(rows=self.document_types)
        if query is getattr(self.service, "_CHECKLIST_DOCUMENT_TYPE_FILES_QUERY", None):
            return _ProfileResult(rows=self.files)
        if query is self.service._CURRENT_PAYROLL_QUERY:
            return _ProfileResult(first={
                "base_salary": 0, "tasks_completed": 0,
                "piece_amount": 0, "adjustment_amount": 0,
            })
        raise AssertionError(f"Unexpected profile query: {query}")

    def query(self, model):
        query = MagicMock()
        query.filter.return_value = query
        query.order_by.return_value = query
        query.first.return_value = (
            SimpleNamespace(email="nhan-vien@example.test")
            if model.__name__ == "User" else None
        )
        query.all.return_value = []
        return query


class EmployeeProfileDocumentTypeSerializationTests(unittest.TestCase):
    @staticmethod
    def _employee():
        return SimpleNamespace(
            id="EMP-1", user_id="USER-1", department_id=None,
            full_name="Nhân viên", avatar_url=None, department="Survey",
            job_title="Kỹ thuật", join_date=None, base_salary=0, is_active=True,
        )

    def test_profile_returns_every_active_type_file_and_progress_in_two_batched_queries(self):
        from src.employee_portal import service

        db = _ProfileSerializationDb(service)

        with patch.object(service, "_held_items", return_value=[]), \
             patch.object(service, "runtime_schema_ready", return_value=True, create=True):
            profile = service.EmployeePortalService.build_profile(db, self._employee())

        checklist = profile["tasks"][0]["checklist"][0]
        self.assertEqual(checklist["document_types"][0], {
            "id": "CRT-1",
            "template_id": None,
            "name": "Ảnh mốc phụ",
            "source": "CONG_TY",
            "source_label": "Công ty soạn/lập",
            "origin": "EMPLOYEE_CREATED",
            "status": "rejected",
            "rejection_reason": "Ảnh mờ",
            "files": [
                {"document_id": "D-1", "file_name": "moc-1.jpg", "content_type": "image/jpeg", "change_reason": None},
                {"document_id": "D-2", "file_name": "moc-2.jpg", "content_type": "image/jpeg", "change_reason": "Chụp lại trang hai"},
                {"document_id": "D-3", "file_name": "moc-3.png", "content_type": "image/png", "change_reason": None},
            ],
            "file_count": 3,
        })
        self.assertEqual(checklist["document_type_progress"], {
            "approved": 1, "total": 2, "percent": 50, "is_complete": False,
        })
        self.assertEqual(
            profile["tasks"][0]["checklist"][1]["document_type_progress"],
            {"approved": 0, "total": 0, "percent": 0, "is_complete": False},
        )

        type_calls = [
            call for call in db.execute_calls
            if call[0] is getattr(service, "_CHECKLIST_DOCUMENT_TYPES_QUERY", None)
        ]
        file_calls = [
            call for call in db.execute_calls
            if call[0] is getattr(service, "_CHECKLIST_DOCUMENT_TYPE_FILES_QUERY", None)
        ]
        self.assertEqual(len(type_calls), 1)
        self.assertEqual(len(file_calls), 1)
        self.assertEqual(type_calls[0][1], {"checklist_result_ids": ["CR-1", "CR-2"]})
        self.assertEqual(file_calls[0][1], {"checklist_result_ids": ["CR-1", "CR-2"]})

    def test_profile_omits_runtime_key_before_schema_migration_so_legacy_rows_render(self):
        from src.employee_portal import service

        db = _ProfileSerializationDb(service)
        with patch.object(service, "_held_items", return_value=[]), \
             patch.object(service, "runtime_schema_ready", return_value=False, create=True):
            profile = service.EmployeePortalService.build_profile(db, self._employee())

        for checklist in profile["tasks"][0]["checklist"]:
            self.assertNotIn("document_types", checklist)
            self.assertNotIn("document_type_progress", checklist)
        queried = [query for query, _ in db.execute_calls]
        self.assertNotIn(service._CHECKLIST_DOCUMENT_TYPES_QUERY, queried)
        self.assertNotIn(service._CHECKLIST_DOCUMENT_TYPE_FILES_QUERY, queried)


class ChecklistDocumentTypeContextTests(unittest.TestCase):
    def test_context_is_derived_from_checklist_id_server_side(self):
        expected = {
            "checklist_result_id": "CR-1",
            "contract_id": "CONTRACT-1",
            "service_line_id": "SL-1",
            "service_package_id": "PKG-1",
            "service_package_name": "Gói tách thửa",
            "task_type_id": "TYPE-1",
            "task_type_name": "Đo vẽ hiện trạng",
            "task_node_id": "NODE-1",
            "node_code": "K02",
        }
        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = expected

        self.assertEqual(checklist_context(db, "CR-1"), expected)
        query, params = db.execute.call_args.args
        emitted_query = str(query).lower()
        self.assertIn("from public.task_node_checklist_results", emitted_query)
        self.assertIn("join public.task_nodes", emitted_query)
        self.assertIn("join public.workflow_instances", emitted_query)
        self.assertIn("join public.service_lines", emitted_query)
        self.assertIn("join public.task_types", emitted_query)
        self.assertIn("join public.service_packages", emitted_query)
        self.assertEqual(params, {"id": "CR-1"})


class ConfiguredDocumentTypeMigrationTests(unittest.TestCase):
    def test_backfill_uses_only_each_nodes_immutable_defining_revision(self):
        migration_path = next(
            parent / "supabase/migrations/20260904090000_checklist_document_types.sql"
            for parent in Path(__file__).resolve().parents
            if (parent / "supabase/migrations").is_dir()
        )
        migration = migration_path.read_text(encoding="utf-8").lower()

        self.assertIn("r_defined.id = n.defined_by_revision_id", migration)
        self.assertNotIn("r_active.graph", migration)
        self.assertNotIn("wi.active_revision_id", migration)

    def test_per_file_review_migration_keeps_independent_publish_state_and_audit(self):
        migration_path = next(
            parent / "supabase/migrations/20260905110000_per_file_document_approval.sql"
            for parent in Path(__file__).resolve().parents
            if (parent / "supabase/migrations").is_dir()
        )
        migration = migration_path.read_text(encoding="utf-8").lower()

        self.assertIn("add column status", migration)
        self.assertIn("pending_review", migration)
        self.assertIn("add column change_reason", migration)
        self.assertIn("add column rejection_reason", migration)
        self.assertIn("add column reviewed_by", migration)
        self.assertIn("add column reviewed_at", migration)
        self.assertIn("checklist_result_document_types", migration)

    def test_per_file_migration_backfills_legacy_checklist_files_and_verdicts(self):
        migration_path = next(
            parent / "supabase/migrations/20260905110000_per_file_document_approval.sql"
            for parent in Path(__file__).resolve().parents
            if (parent / "supabase/migrations").is_dir()
        )
        migration = migration_path.read_text(encoding="utf-8").lower()

        self.assertIn("checklist_result_document_links legacy", migration)
        self.assertIn("legacy.review_status", migration)
        self.assertIn("dossier_document_links", migration)
        self.assertIn("on conflict (document_type_id, document_id) where is_active", migration)
        self.assertIn("update public.checklist_result_document_types", migration)


class ExactComboSuggestionTests(unittest.TestCase):
    def test_suggestions_use_exact_combo_scope_and_return_context_labels(self):
        context = {
            "checklist_result_id": "CR-1",
            "contract_id": "CONTRACT-1",
            "service_line_id": "SL-1",
            "service_package_id": "PKG-1",
            "service_package_name": "Gói tách thửa",
            "task_type_id": "TYPE-1",
            "task_type_name": "Đo vẽ hiện trạng",
            "task_node_id": "NODE-1",
            "node_code": "K02",
        }
        db = rows([{
            "template_id": "TPL-CCCD",
            "name": "CCCD/CMND",
            "source": "KHACH_HANG",
        }])

        with patch.object(checklist_document_types, "checklist_context", return_value=context):
            result = checklist_document_types.exact_combo_suggestions(db, "CR-1")

        self.assertEqual(result, {
            "data": [{
                "template_id": "TPL-CCCD",
                "name": "CCCD/CMND",
                "source": "KHACH_HANG",
                "source_label": "Khách hàng cung cấp",
            }],
            "context": {
                "service_package_name": "Gói tách thửa",
                "task_type_name": "Đo vẽ hiện trạng",
                "node_code": "K02",
            },
        })
        query, params = db.execute.call_args.args
        emitted_query = str(query).lower()
        self.assertIn("a.applicability_type = 'combo'", emitted_query)
        self.assertIn("a.service_package_id = :service_package_id", emitted_query)
        self.assertIn("a.task_type_id = :task_type_id", emitted_query)
        self.assertIn("a.node_code = :node_code", emitted_query)
        self.assertIn("a.is_default", emitted_query)
        self.assertIn("coalesce(t.is_active, true)", emitted_query)
        self.assertEqual(params, {
            "service_package_id": "PKG-1",
            "task_type_id": "TYPE-1",
            "node_code": "K02",
        })


class AddChecklistDocumentTypeTests(unittest.TestCase):
    context = {
        "checklist_result_id": "CR-1",
        "contract_id": "HD-1",
        "service_line_id": "SL-1",
        "service_package_id": "PKG-1",
        "task_type_id": "TYPE-1",
        "task_node_id": "NODE-1",
        "node_code": "K02",
    }

    def test_existing_template_ignores_forged_name_and_source(self):
        add_type = required_function(self, "add_type")
        db = DocumentTypeDb(None, inserted_type={"id": "DT-1"})
        suggestions = {"data": [{
            "template_id": "TPL-CCCD", "name": "CCCD", "source": "KHACH_HANG",
            "source_label": "Khách hàng cung cấp",
        }], "context": {}}

        with patch.object(checklist_document_types, "checklist_context", return_value=self.context), \
             patch.object(checklist_document_types, "exact_combo_suggestions", return_value=suggestions):
            result = add_type(
                db, checklist_result_id="CR-1", template_id="TPL-CCCD",
                name="Tên giả", source="CONG_TY", actor_id="NV-1",
            )

        self.assertEqual((result["name"], result["source"]), ("CCCD", "KHACH_HANG"))
        insert_params = next(params for sql, params in db.calls if "insert into public.checklist_result_document_types" in sql)
        self.assertEqual(insert_params["name"], "CCCD")
        self.assertEqual(insert_params["source"], "KHACH_HANG")

    def test_selected_template_must_belong_to_exact_combo(self):
        add_type = required_function(self, "add_type")
        db = DocumentTypeDb(None)
        with patch.object(checklist_document_types, "checklist_context", return_value=self.context), \
             patch.object(checklist_document_types, "exact_combo_suggestions", return_value={"data": [], "context": {}}):
            with self.assertRaises(HTTPException) as caught:
                add_type(
                    db, checklist_result_id="CR-1", template_id="TPL-OTHER",
                    actor_id="NV-1",
                )
        self.assertEqual(caught.exception.status_code, 409)

    def test_new_type_rejects_unknown_source(self):
        add_type = required_function(self, "add_type")
        db = DocumentTypeDb(None)
        with patch.object(checklist_document_types, "checklist_context", return_value=self.context):
            with self.assertRaises(HTTPException) as caught:
                add_type(
                    db, checklist_result_id="CR-1", name="Ảnh mốc phụ",
                    source="NGUON_BIA", actor_id="NV-1",
                )
        self.assertEqual(caught.exception.status_code, 422)

    def test_duplicate_normalized_name_and_source_is_rejected(self):
        add_type = required_function(self, "add_type")
        db = DocumentTypeDb(None, inserted_type=None)
        with patch.object(checklist_document_types, "checklist_context", return_value=self.context):
            with self.assertRaises(HTTPException) as caught:
                add_type(
                    db, checklist_result_id="CR-1", name="  CCCD  ",
                    source="KHACH_HANG", actor_id="NV-1",
                )
        self.assertEqual(caught.exception.status_code, 409)

    def test_same_name_different_source_is_allowed(self):
        add_type = required_function(self, "add_type")
        db = DocumentTypeDb(None, inserted_type={"id": "DT-2"})
        with patch.object(checklist_document_types, "checklist_context", return_value=self.context):
            result = add_type(
                db, checklist_result_id="CR-1", name="Giấy xác nhận",
                source="CO_QUAN", actor_id="NV-1",
            )
        self.assertEqual(result["source"], "CO_QUAN")
        self.assertEqual(result["name"], "Giấy xác nhận")


class ChecklistDocumentTypeFileTests(unittest.TestCase):
    type_row = {
        "id": "DT-1", "checklist_result_id": "CR-1", "template_id": None,
        "name": "Ảnh mốc", "source": "CONG_TY", "status": "draft",
        "contract_id": "HD-1", "service_line_id": "SL-1",
        "task_node_id": "NODE-1", "node_code": "K02", "file_count": 0,
    }

    def test_one_type_accepts_three_files_without_official_links(self):
        add_files = required_function(self, "add_files")
        db = DocumentTypeDb(dict(self.type_row))
        uploads = [
            ("moc-1.jpg", "image/jpeg", b"one"),
            ("moc-2.png", "image/png", b"two"),
            ("bien-ban.pdf", "application/pdf", b"three"),
        ]
        with patch.object(checklist_document_types, "ensure_bucket"), \
             patch.object(checklist_document_types, "upload_file", return_value="stored"):
            result = add_files(db, document_type_id="DT-1", uploads=uploads, actor_id="NV-1")

        self.assertEqual([item["status"] for item in result], ["success"] * 3)
        self.assertEqual(result[-1]["file_count"], 3)
        link_inserts = [sql for sql, _ in db.calls if "insert into public.checklist_result_document_type_files" in sql]
        self.assertEqual(len(link_inserts), 3)
        all_sql = " ".join(sql for sql, _ in db.calls)
        self.assertNotIn("insert into public.dossier_document_links", all_sql)
        self.assertNotIn("insert into public.checklist_result_document_links", all_sql)

    def test_each_file_uses_a_savepoint_and_failure_does_not_erase_successes(self):
        add_files = required_function(self, "add_files")
        db = DocumentTypeDb(dict(self.type_row))
        with patch.object(checklist_document_types, "ensure_bucket"), \
             patch.object(
                 checklist_document_types, "upload_file",
                 side_effect=["stored-1", RuntimeError("storage down"), "stored-3"],
             ):
            result = add_files(
                db, document_type_id="DT-1",
                uploads=[
                    ("one.pdf", "application/pdf", b"1"),
                    ("two.pdf", "application/pdf", b"2"),
                    ("three.pdf", "application/pdf", b"3"),
                ], actor_id="NV-1",
            )

        self.assertEqual([item["status"] for item in result], ["success", "failed", "success"])
        self.assertEqual(db.savepoints, 3)
        self.assertEqual(
            sum("insert into public.checklist_result_document_type_files" in sql for sql, _ in db.calls),
            2,
        )

    def test_db_failure_after_upload_deletes_only_failed_object_without_masking_error(self):
        add_files = required_function(self, "add_files")

        class FailSecondDocumentInsertDb(DocumentTypeDb):
            def execute(self, query, params=None):
                sql = " ".join(str(query).lower().split())
                if (
                    "insert into public.dossier_documents" in sql
                    and (params or {}).get("file_name") == "two.pdf"
                ):
                    self.calls.append((sql, params or {}))
                    raise RuntimeError("document insert failed")
                return super().execute(query, params)

        db = FailSecondDocumentInsertDb(dict(self.type_row))
        with patch.object(checklist_document_types, "ensure_bucket"), \
             patch.object(checklist_document_types, "upload_file", return_value="stored") as upload, \
             patch.object(checklist_document_types, "delete_file", side_effect=RuntimeError("cleanup failed")) as delete, \
             self.assertLogs(checklist_document_types.logger, level="WARNING") as logs:
            result = add_files(
                db, document_type_id="DT-1",
                uploads=[
                    ("one.pdf", "application/pdf", b"1"),
                    ("two.pdf", "application/pdf", b"2"),
                ], actor_id="NV-1",
            )

        first_key = upload.call_args_list[0].args[1]
        failed_key = upload.call_args_list[1].args[1]
        self.assertEqual([item["status"] for item in result], ["success", "failed"])
        self.assertEqual(result[1]["error"], "document insert failed")
        self.assertEqual(result[0]["file_count"], 1)
        delete.assert_called_once_with(failed_key)
        self.assertIn("Could not compensate failed checklist document upload", logs.output[0])
        self.assertNotEqual(first_key, failed_key)
        self.assertEqual(
            sum("insert into public.checklist_result_document_type_files" in sql for sql, _ in db.calls),
            1,
        )

    def test_invalid_extension_and_oversized_file_are_reported_per_file(self):
        add_files = required_function(self, "add_files")
        db = DocumentTypeDb(dict(self.type_row))
        result = add_files(
            db, document_type_id="DT-1",
            uploads=[
                ("virus.exe", None, b"MZ"),
                ("huge.pdf", "application/pdf", b"x" * (25 * 1024 * 1024 + 1)),
            ], actor_id="NV-1",
        )
        self.assertEqual([item["status"] for item in result], ["failed", "failed"])
        self.assertTrue(all(item["error"] for item in result))
        self.assertEqual(db.savepoints, 0)

    def test_approved_type_requires_reason_before_adding_new_files(self):
        add_files = required_function(self, "add_files")
        db = DocumentTypeDb({
            **self.type_row,
            "status": "approved",
            "file_count": 1,
            "approved_file_count": 1,
        })
        with self.assertRaises(HTTPException) as caught:
            add_files(
                db, document_type_id="DT-1",
                uploads=[("one.pdf", "application/pdf", b"1")], actor_id="NV-1",
            )
        self.assertEqual(caught.exception.status_code, 422)
        self.assertIn("lý do", str(caught.exception.detail).lower())
        self.assertEqual(db.savepoints, 0)

    def test_approved_type_accepts_new_draft_files_without_touching_old_approved_files(self):
        add_files = required_function(self, "add_files")
        db = DocumentTypeDb({
            **self.type_row,
            "status": "approved",
            "file_count": 1,
            "approved_file_count": 1,
        })

        with patch.object(checklist_document_types, "ensure_bucket"), \
             patch.object(checklist_document_types, "upload_file", return_value="stored"):
            result = add_files(
                db,
                document_type_id="DT-1",
                uploads=[("mat-sau.pdf", "application/pdf", b"new")],
                actor_id="NV-1",
                change_reason="Bổ sung mặt sau theo yêu cầu khách hàng",
            )

        self.assertEqual(result[0].get("review_status"), "draft")
        self.assertEqual(
            result[0].get("change_reason"),
            "Bổ sung mặt sau theo yêu cầu khách hàng",
        )
        file_insert = next(
            (sql, params) for sql, params in db.calls
            if "insert into public.checklist_result_document_type_files" in sql
        )
        self.assertIn("status, change_reason", file_insert[0])
        self.assertEqual(file_insert[1]["change_reason"], result[0]["change_reason"])
        self.assertFalse(any(
            "update public.checklist_result_document_type_files" in sql
            for sql, _ in db.calls
        ))

    def test_rejected_type_returns_to_draft_after_successful_file_change(self):
        add_files = required_function(self, "add_files")
        db = DocumentTypeDb({
            **self.type_row,
            "status": "rejected",
            "rejection_reason": "Ảnh mờ, cần chụp lại trang hai",
            "file_count": 2,
            "approved_file_count": 1,
        })
        with patch.object(checklist_document_types, "ensure_bucket"), \
             patch.object(checklist_document_types, "upload_file", return_value="stored"):
            result = add_files(
                db, document_type_id="DT-1",
                uploads=[("replacement.pdf", "application/pdf", b"new")], actor_id="NV-1",
            )
        self.assertEqual(result[0]["file_count"], 3)
        self.assertIsNone(result[0]["change_reason"])
        status_updates = [(sql, params) for sql, params in db.calls if "set status = 'draft'" in sql]
        self.assertEqual(len(status_updates), 1)
        self.assertNotIn("rejection_reason = null", status_updates[0][0])

    def test_remove_file_soft_deactivates_link_and_document(self):
        remove_file = required_function(self, "remove_file")
        db = DocumentTypeDb({**self.type_row, "file_count": 1})

        result = remove_file(
            db, document_type_id="DT-1", document_id="D-1", actor_id="NV-1",
        )

        self.assertEqual(result["file_count"], 0)
        all_sql = " ".join(sql for sql, _ in db.calls)
        self.assertIn("update public.checklist_result_document_type_files f", all_sql)
        self.assertIn("is_active = false", all_sql)
        self.assertIn("update public.dossier_documents", all_sql)
        self.assertIn("doc_status = 'da_go'", all_sql)

    def test_remove_approved_file_requires_change_reason(self):
        remove_file = required_function(self, "remove_file")
        db = DocumentTypeDb({**self.type_row, "status": "approved", "file_count": 1})

        with self.assertRaises(HTTPException) as caught:
            remove_file(
                db, document_type_id="DT-1", document_id="D-1", actor_id="NV-1",
            )

        self.assertEqual(caught.exception.status_code, 422)
        self.assertIn("lý do", str(caught.exception.detail).lower())

    def test_remove_approved_file_records_reason_and_returns_type_to_draft(self):
        remove_file = required_function(self, "remove_file")
        db = DocumentTypeDb({**self.type_row, "status": "approved", "file_count": 1})

        result = remove_file(
            db, document_type_id="DT-1", document_id="D-1", actor_id="NV-1",
            change_reason="  Thay bằng bản ký mới  ",
        )

        self.assertEqual(result["change_reason"], "Thay bằng bản ký mới")
        remove_call = next(
            (sql, params) for sql, params in db.calls
            if "returning f.document_id" in sql
        )
        self.assertIn("change_reason = :change_reason", remove_call[0])
        self.assertEqual(remove_call[1]["change_reason"], "Thay bằng bản ký mới")
        self.assertTrue(any("set status = 'draft'" in sql for sql, _ in db.calls))

    def test_remove_from_rejected_type_returns_it_to_draft(self):
        remove_file = required_function(self, "remove_file")
        db = DocumentTypeDb({**self.type_row, "status": "rejected", "file_count": 1})

        remove_file(
            db, document_type_id="DT-1", document_id="D-1", actor_id="NV-1",
        )

        status_updates = [sql for sql, _ in db.calls if "set status = 'draft'" in sql]
        self.assertEqual(len(status_updates), 1)


class AttachExistingRawDocumentTests(unittest.TestCase):
    def test_customer_raw_document_is_attached_to_runtime_type_and_leaves_raw_warehouse(self):
        attach_existing_file = required_function(self, "attach_existing_file")
        type_row = {
            "id": "DT-CCCD", "checklist_result_id": "CR-1", "template_id": "TPL-CCCD",
            "name": "CCCD", "source": "KHACH_HANG", "status": "draft",
            "contract_id": "HD-1", "service_line_id": "SL-1", "task_node_id": "NODE-1",
            "node_code": "K01", "file_count": 0,
        }
        document_row = {
            "id": "D-RAW", "file_name": "cccd.jpg", "doc_status": "DANG_DUNG",
            "scope": "CONTRACT", "slot_id": None, "has_active_links": False,
            "has_active_type_link": False,
        }
        db = DocumentTypeDb(type_row, document_row=document_row)
        with patch("src.dossiers.slot_requests.assert_document_not_reserved") as reserved:
            result = attach_existing_file(
                db, document_type_id="DT-CCCD", document_id="D-RAW", actor_id="NV-1",
            )

        reserved.assert_called_once_with(db, "D-RAW")
        self.assertEqual(result["document_type_id"], "DT-CCCD")
        all_sql = " ".join(sql for sql, _ in db.calls)
        self.assertIn("insert into public.checklist_result_document_type_files", all_sql)
        self.assertIn("set scope = 'service_line'", all_sql)
        self.assertNotIn("insert into public.dossier_document_links", all_sql)
        self.assertNotIn("insert into public.checklist_result_document_links", all_sql)

    def test_raw_attachment_writes_legacy_link_audit_with_document_actor_and_context(self):
        attach_existing_file = required_function(self, "attach_existing_file")
        type_row = {
            "id": "DT-CCCD", "checklist_result_id": "CR-1", "template_id": "TPL-CCCD",
            "name": "CCCD", "source": "KHACH_HANG", "status": "draft",
            "contract_id": "HD-1", "service_line_id": "SL-1", "task_node_id": "NODE-1",
            "node_code": "K01", "file_count": 0,
        }
        document_row = {
            "id": "D-RAW", "file_name": "cccd.jpg", "doc_status": "DANG_DUNG",
            "scope": "CONTRACT", "slot_id": None, "has_active_links": False,
            "has_active_type_link": False,
        }
        db = DocumentTypeDb(type_row, document_row=document_row)

        with patch("src.dossiers.slot_requests.assert_document_not_reserved"):
            attach_existing_file(
                db, document_type_id="DT-CCCD", document_id="D-RAW", actor_id="NV-1",
            )

        audit_calls = [
            (sql, params) for sql, params in db.calls
            if "insert into public.audit_log" in sql
        ]
        self.assertEqual(len(audit_calls), 1)
        audit_sql, audit_params = audit_calls[0]
        self.assertIn("'dossier_document'", audit_sql)
        self.assertEqual(audit_params["action"], "LINK_SOURCE_DOCUMENT")
        self.assertEqual(audit_params["document_id"], "D-RAW")
        self.assertEqual(audit_params["actor"], "NV-1")
        self.assertEqual(json.loads(audit_params["payload"]), {
            "document_type_id": "DT-CCCD",
            "checklist_result_id": "CR-1",
            "contract_id": "HD-1",
            "service_line_id": "SL-1",
            "task_node_id": "NODE-1",
        })

    def test_raw_document_cannot_target_company_type(self):
        attach_existing_file = required_function(self, "attach_existing_file")
        db = DocumentTypeDb({
            "id": "DT-COMPANY", "checklist_result_id": "CR-1", "source": "CONG_TY",
            "status": "draft", "contract_id": "HD-1", "service_line_id": "SL-1",
            "task_node_id": "NODE-1", "node_code": "K01", "file_count": 0,
        })
        with self.assertRaises(HTTPException) as caught:
            attach_existing_file(
                db, document_type_id="DT-COMPANY", document_id="D-RAW", actor_id="NV-1",
            )
        self.assertEqual(caught.exception.status_code, 409)

    def test_raw_document_must_belong_to_the_types_contract(self):
        attach_existing_file = required_function(self, "attach_existing_file")
        db = DocumentTypeDb({
            "id": "DT-CCCD", "checklist_result_id": "CR-1", "source": "KHACH_HANG",
            "status": "draft", "contract_id": "HD-1", "service_line_id": "SL-1",
            "task_node_id": "NODE-1", "node_code": "K01", "file_count": 0,
        }, document_row=None)

        with self.assertRaises(HTTPException) as caught:
            attach_existing_file(
                db, document_type_id="DT-CCCD", document_id="D-OTHER", actor_id="NV-1",
            )

        self.assertEqual(caught.exception.status_code, 409)


class _RuntimeResult:
    def __init__(self, *, rows=None, scalar=None):
        self._rows = list(rows or [])
        self._scalar = scalar

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows

    def scalar(self):
        return self._scalar

    def scalar_one(self):
        return self._scalar


class RuntimeReviewDb:
    """Small stateful DB double for the runtime-type state machine."""

    def __init__(
        self, types, *, node_status="submitted", checklist_status="pending_approval",
        transitions=None, pending_acceptance_id=None,
    ):
        self.types = {item["id"]: dict(item) for item in types}
        self.node_status = node_status
        self.checklist_status = checklist_status
        self.transitions = transitions or {}
        self.pending_acceptance_id = pending_acceptance_id
        self.calls = []
        self.templates = {}
        self.applicabilities = set()
        self.slots = {}
        self.dossier_links = set()
        self.checklist_links = set()
        self.context = {
            "checklist_result_id": "CR-1",
            "contract_id": "HD-1",
            "service_line_id": "SL-1",
            "service_package_id": "PKG-1",
            "service_package_name": "Gói tách thửa",
            "task_type_id": "TYPE-1",
            "task_type_name": "Đo vẽ hiện trạng",
            "task_node_id": "NODE-1",
            "node_code": "K02",
        }

    def execute(self, query, params=None):
        sql = " ".join(str(query).lower().split())
        params = params or {}
        self.calls.append((sql, params))

        if "with locked_checklists as materialized" in sql:
            missing = [
                item["name"] for item in self.types.values()
                if item.get("is_active", True) and not item.get("files")
            ]
            changed = 0
            allow_missing = bool(params.get("allow_missing"))
            if not missing or allow_missing:
                for item in self.types.values():
                    if item.get("is_active", True) and item["status"] in ("draft", "rejected"):
                        if not allow_missing or item.get("files"):
                            item.update(status="pending_review", rejection_reason=None)
                            changed += 1
            checklist_ready = self.checklist_status in (
                "pending_approval", "late_pending_approval", "approved",
                "late_approved", "not_applicable",
            )
            runtime_types_resolve_checklist = (
                "as uses_runtime_types" in sql
                and any(item.get("is_active", True) for item in self.types.values())
            )
            return _RuntimeResult(rows=[{
                "missing_types": missing,
                "unresolved_checklists": (
                    [] if checklist_ready or runtime_types_resolve_checklist
                    else ["Checklist runtime"]
                ),
                "total": len(self.types),
                "approved": sum(item["status"] == "approved" for item in self.types.values()),
                "pending_review": sum(
                    item["status"] == "pending_review" for item in self.types.values()
                ),
            }])
        if "from public.task_node_checklist_results cr" in sql and "for update" in sql:
            return _RuntimeResult(rows=[{
                "id": "CR-1", "task_node_id": "NODE-1", "node_status": self.node_status,
            }])
        if "select 1 from public.task_node_checklist_results" in sql and "for update" in sql:
            return _RuntimeResult(scalar=1, rows=[{"locked": 1}])
        if "from public.task_node_checklist_results cr" in sql and "service_package_id" in sql:
            return _RuntimeResult(rows=[self.context])
        if "from public.checklist_result_document_types t" in sql and "for update of t" in sql:
            if params.get("type_id") or params.get("id"):
                type_id = params.get("type_id") or params.get("id")
                item = self.types.get(type_id)
                row = None if item is None else {
                    **item,
                    "task_node_id": "NODE-1",
                    "node_status": self.node_status,
                    "file_count": len(item.get("files", [])),
                }
                return _RuntimeResult(rows=[row] if row else [])
            return _RuntimeResult(rows=[
                {**item, "file_count": len(item.get("files", []))}
                for item in self.types.values() if item.get("is_active", True)
            ])
        if "select t.status" in sql and "group by t.id" in sql:
            return _RuntimeResult(rows=[
                {"status": item["status"], "file_count": len(item.get("files", []))}
                for item in self.types.values() if item.get("is_active", True)
            ])
        if "set status = 'pending_review'" in sql:
            changed = []
            for item in self.types.values():
                if item.get("is_active", True) and item["status"] in ("draft", "rejected"):
                    item.update(status="pending_review", rejection_reason=None)
                    changed.append({"id": item["id"]})
            return _RuntimeResult(rows=changed)
        if "set status = :status" in sql and "checklist_result_document_types" in sql:
            item = self.types[params["type_id"]]
            item.update(
                status=params["status"],
                rejection_reason=params.get("reason"),
                reviewed_by=params.get("actor_id"),
            )
            return _RuntimeResult(rows=[{"id": item["id"]}])
        if "from public.task_node_acceptances" in sql and "status = 'pending'" in sql:
            return _RuntimeResult(scalar=self.pending_acceptance_id)
        if "->'transitions'" in sql:
            return _RuntimeResult(scalar=self.transitions)
        if "from public.document_checklist_templates" in sql:
            matches = [
                template for template in self.templates.values()
                if template["name"].strip().lower() == params["name"].strip().lower()
                and template["source"] == params["source"]
                and template["is_active"]
            ]
            return _RuntimeResult(rows=matches)
        if "insert into public.document_checklist_templates" in sql:
            template_id = f"TPL-NEW-{len(self.templates) + 1}"
            self.templates[template_id] = {
                "id": template_id,
                "name": params["name"],
                "source": params["source"],
                "is_active": True,
                "is_required": False,
                "needs_original": False,
                "default_quantity": 1,
                "note": None,
            }
            return _RuntimeResult(scalar=template_id)
        if "insert into public.document_template_applicabilities" in sql:
            self.applicabilities.add((
                params["template_id"], params["service_package_id"],
                params["task_type_id"], params["node_code"],
            ))
            return _RuntimeResult()
        if "set promoted_template_id" in sql:
            self.types[params["type_id"]]["promoted_template_id"] = params["template_id"]
            return _RuntimeResult()
        if "insert into public.dossier_document_slots" in sql:
            slot_id = f"SLOT-{len(self.slots) + 1}"
            self.slots[slot_id] = params["type_id"]
            return _RuntimeResult(scalar=slot_id)
        if "set slot_id" in sql and "checklist_result_document_types" in sql:
            self.types[params["type_id"]]["slot_id"] = params["slot_id"]
            return _RuntimeResult()
        if "insert into public.dossier_document_links" in sql:
            type_id = params["type_id"]
            for document_id in self.types[type_id].get("files", []):
                self.dossier_links.add((document_id, params["slot_id"]))
            return _RuntimeResult()
        if "insert into public.checklist_result_document_links" in sql:
            type_id = params["type_id"]
            for document_id in self.types[type_id].get("files", []):
                self.checklist_links.add(("CR-1", document_id))
            return _RuntimeResult()
        return _RuntimeResult()


class SubmitRuntimeDocumentTypesTests(unittest.TestCase):
    def test_submission_treats_a_pending_runtime_checklist_as_filled_when_every_type_has_files(self):
        submit = required_function(self, "submit_types_for_node")
        db = RuntimeReviewDb([{
            "id": "DT-FILLED", "name": "CCCD", "source": "KHACH_HANG",
            "origin": "CONFIGURED", "status": "draft", "files": ["D-1"],
        }], checklist_status="pending")

        result = submit(db, "NODE-1", "USER-1")

        self.assertNotIn("unresolved_checklists", result)
        self.assertEqual(result["pending_review"], 1)

    def test_submission_rejects_an_active_type_without_files_before_any_status_write(self):
        submit = required_function(self, "submit_types_for_node")
        db = RuntimeReviewDb([{
            "id": "DT-EMPTY", "name": "Biên bản", "source": "CONG_TY",
            "origin": "EMPLOYEE_CREATED", "status": "draft", "files": [],
        }])

        with self.assertRaises(HTTPException) as caught:
            submit(db, "NODE-1", "USER-1")

        self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(db.types["DT-EMPTY"]["status"], "draft")

    def test_submission_accepts_missing_files_when_allow_missing_is_true(self):
        submit = required_function(self, "submit_types_for_node")
        db = RuntimeReviewDb([
            {"id": "DT-FILLED", "name": "Bản vẽ", "source": "CONG_TY", "origin": "CONFIGURED",
             "status": "draft", "files": ["D-1"]},
            {"id": "DT-EMPTY", "name": "Biên bản", "source": "KHACH_HANG", "origin": "CONFIGURED",
             "status": "draft", "files": []},
        ])

        result = submit(db, "NODE-1", "USER-1", allow_missing=True)

        self.assertEqual(result["pending_review"], 1)
        self.assertEqual(db.types["DT-FILLED"]["status"], "pending_review")
        self.assertEqual(db.types["DT-EMPTY"]["status"], "draft")

    def test_submission_moves_draft_and_rejected_together_and_preserves_approved(self):
        submit = required_function(self, "submit_types_for_node")
        db = RuntimeReviewDb([
            {"id": "DT-DRAFT", "name": "A", "source": "CONG_TY", "origin": "CONFIGURED",
             "status": "draft", "rejection_reason": None, "files": ["D-1"]},
            {"id": "DT-REJECTED", "name": "B", "source": "CO_QUAN", "origin": "EMPLOYEE_CREATED",
             "status": "rejected", "rejection_reason": "Ảnh mờ", "files": ["D-2"]},
            {"id": "DT-APPROVED", "name": "C", "source": "KHACH_HANG", "origin": "CONFIGURED",
             "status": "approved", "rejection_reason": None, "files": ["D-3"]},
        ])

        result = submit(db, "NODE-1", "USER-1")

        self.assertEqual(result, {"total": 3, "pending_review": 2, "approved": 1})
        self.assertEqual(db.types["DT-DRAFT"]["status"], "pending_review")
        self.assertEqual(db.types["DT-REJECTED"]["status"], "pending_review")
        self.assertIsNone(db.types["DT-REJECTED"]["rejection_reason"])
        self.assertEqual(db.types["DT-APPROVED"]["status"], "approved")

    def test_submission_moves_the_type_to_pending_review_without_file_verdict_writes(self):
        submit = required_function(self, "submit_types_for_node")
        db = RuntimeReviewDb([{
            "id": "DT-MIXED", "name": "CCCD", "source": "KHACH_HANG",
            "origin": "CONFIGURED", "status": "draft", "files": ["D-OLD", "D-NEW"],
        }])

        submit(db, "NODE-1", "USER-1")

        emitted = " ".join(sql for sql, _ in db.calls)
        self.assertNotIn("update public.checklist_result_document_type_files", emitted)
        self.assertIn("set status = 'pending_review'", emitted)


class ReviewRuntimeDocumentTypeTests(unittest.TestCase):
    def test_reject_requires_nonblank_reason(self):
        review = required_function(self, "review_type")
        with self.assertRaises(HTTPException) as caught:
            review(
                RuntimeReviewDb([]), checklist_result_id="CR-1", type_id="DT-1",
                decision="rejected", reason="  ", actor_id="DIRECTOR",
            )
        self.assertEqual(caught.exception.status_code, 422)

    def test_review_is_allowed_only_while_node_is_submitted(self):
        review = required_function(self, "review_type")
        db = RuntimeReviewDb([{
            "id": "DT-1", "name": "Biên bản", "source": "CONG_TY",
            "origin": "EMPLOYEE_CREATED", "status": "pending_review", "files": ["D-1"],
        }], node_status="rework_required")
        with self.assertRaises(HTTPException) as caught:
            review(
                db, checklist_result_id="CR-1", type_id="DT-1",
                decision="approved", reason=None, actor_id="DIRECTOR",
            )
        self.assertEqual(caught.exception.status_code, 409)

    def test_approve_requires_an_active_file(self):
        review = required_function(self, "review_type")
        db = RuntimeReviewDb([{
            "id": "DT-1", "name": "Biên bản", "source": "CONG_TY",
            "origin": "EMPLOYEE_CREATED", "status": "pending_review", "files": [],
        }])
        with self.assertRaises(HTTPException) as caught:
            review(
                db, checklist_result_id="CR-1", type_id="DT-1",
                decision="approved", reason=None, actor_id="DIRECTOR",
            )
        self.assertEqual(caught.exception.status_code, 422)

    def test_approval_records_verdict_on_the_type_without_individual_file_verdicts(self):
        review = required_function(self, "review_type")
        db = RuntimeReviewDb([{
            "id": "DT-1", "name": "CCCD", "source": "KHACH_HANG",
            "origin": "CONFIGURED", "status": "pending_review",
            "files": ["D-OLD", "D-NEW"],
        }])

        with patch.object(
            checklist_document_types,
            "promote_completed_checklist_types",
            return_value=[],
        ):
            review(
                db, checklist_result_id="CR-1", type_id="DT-1",
                decision="approved", reason=None, actor_id="DIRECTOR",
            )

        file_updates = [
            (sql, params) for sql, params in db.calls
            if "update public.checklist_result_document_type_files" in sql
        ]
        self.assertEqual(file_updates, [])

    def test_approving_last_type_auto_accepts_node_and_generates_completion(self):
        review = required_function(self, "review_type")
        db = RuntimeReviewDb([{
            "id": "DT-1", "name": "CCCD", "source": "KHACH_HANG",
            "origin": "CONFIGURED", "status": "pending_review", "files": ["D-1"],
        }], pending_acceptance_id="ACC-1")

        with patch(
            "src.contracts.workflow_runtime.review_task_node_acceptance",
            return_value={
                "task_node_id": "NODE-1", "status": "accepted",
                "entitlement_count": 1, "entitlement_amount": 300000,
            },
        ) as accept_node, patch.object(
            checklist_document_types,
            "promote_completed_checklist_types",
            return_value=[],
        ):
            result = review(
                db, checklist_result_id="CR-1", type_id="DT-1",
                decision="approved", reason=None, actor_id="DIRECTOR",
            )

        accept_node.assert_called_once_with(
            db,
            acceptance_id="ACC-1",
            decision="accepted",
            outcome=None,
            review_note="Tự hoàn tất khi mọi loại giấy trong Node đã đạt",
            actor_id="DIRECTOR",
        )
        self.assertTrue(result["node_finalized"])
        self.assertEqual(result["node_status"], "accepted")
        self.assertEqual(result["entitlement_count"], 1)
        self.assertTrue(any(
            "update public.task_node_checklist_results cr" in sql
            and "set status = case" in sql
            and "pending_approval" in sql
            for sql, _params in db.calls
        ))

    def test_reject_returns_node_through_existing_rework_path_without_deleting_type_or_files(self):
        review = required_function(self, "review_type")
        db = RuntimeReviewDb([{
            "id": "DT-1", "name": "Ảnh mốc", "source": "CONG_TY",
            "origin": "EMPLOYEE_CREATED", "status": "pending_review", "files": ["D-1", "D-2"],
        }])
        with patch(
            "src.contracts.workflow_runtime.review_task_node_acceptance",
            return_value={"task_node_id": "NODE-1", "status": "rework_required"},
        ), patch(
            "src.contracts.workflow_runtime.flush_node_review_batch",
            return_value={"task_node_id": "NODE-1", "node_status_changed": True},
        ) as flush_batch:
            result = review(
                db, checklist_result_id="CR-1", type_id="DT-1",
                decision="rejected", reason="Ảnh trang hai bị mờ", actor_id="DIRECTOR",
            )

        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["rejection_reason"], "Ảnh trang hai bị mờ")
        self.assertEqual(result["task_node_id"], "NODE-1")
        self.assertEqual(result["node_status"], "rework_required")
        self.assertEqual(db.types["DT-1"]["files"], ["D-1", "D-2"])
        self.assertNotIn("delete from", " ".join(sql for sql, _ in db.calls))
        flush_batch.assert_called_once_with(
            db, task_node_id="NODE-1", actor_id="DIRECTOR",
            runtime_batch=[{
                "review_status": "rejected",
                "rejection_reason": "Ảnh trang hai bị mờ",
                "checklist_name": "Ảnh mốc",
                "checklist_result_id": "CR-1",
                "document_name": "Ảnh mốc",
            }],
        )

    def test_reject_waits_for_remaining_types_before_returning_node(self):
        review = required_function(self, "review_type")
        db = RuntimeReviewDb([
            {
                "id": "DT-BAD", "name": "Ảnh mốc", "source": "CONG_TY",
                "origin": "CONFIGURED", "status": "pending_review", "files": ["D-1"],
            },
            {
                "id": "DT-WAIT", "name": "Biên bản", "source": "CONG_TY",
                "origin": "CONFIGURED", "status": "pending_review", "files": ["D-2"],
            },
        ])
        with patch(
            "src.contracts.workflow_runtime.flush_node_review_batch",
        ) as flush_batch:
            result = review(
                db, checklist_result_id="CR-1", type_id="DT-BAD",
                decision="rejected", reason="Ảnh bị mờ", actor_id="DIRECTOR",
            )

        self.assertEqual(result["node_status"], "submitted")
        self.assertEqual(result["status"], "rejected")
        flush_batch.assert_not_called()

    def test_last_approval_returns_node_when_another_type_was_rejected(self):
        review = required_function(self, "review_type")
        db = RuntimeReviewDb([
            {
                "id": "DT-BAD", "name": "Ảnh mốc", "source": "CONG_TY",
                "origin": "CONFIGURED", "status": "rejected",
                "rejection_reason": "Ảnh bị mờ", "files": ["D-1"],
            },
            {
                "id": "DT-LAST", "name": "Biên bản", "source": "CONG_TY",
                "origin": "CONFIGURED", "status": "pending_review", "files": ["D-2"],
            },
        ])
        with patch(
            "src.contracts.workflow_runtime.flush_node_review_batch",
            return_value={"task_node_id": "NODE-1", "node_status_changed": True},
        ) as flush_batch:
            result = review(
                db, checklist_result_id="CR-1", type_id="DT-LAST",
                decision="approved", reason=None, actor_id="DIRECTOR",
            )

        self.assertEqual(result["node_status"], "rework_required")
        flush_batch.assert_called_once()
        rejected_batch = flush_batch.call_args.kwargs["runtime_batch"]
        self.assertEqual(len(rejected_batch), 1)
        self.assertEqual(rejected_batch[0]["document_name"], "Ảnh mốc")


class CompletedChecklistPromotionTests(unittest.TestCase):
    def _complete_db(self):
        return RuntimeReviewDb([
            {"id": "DT-CONFIG", "name": "CCCD", "source": "KHACH_HANG",
             "origin": "CONFIGURED", "status": "approved", "template_id": "TPL-CONFIG",
             "promoted_template_id": None, "slot_id": None, "files": ["D-1"]},
            {"id": "DT-NEW", "name": "Ảnh mốc phụ", "source": "CONG_TY",
             "origin": "EMPLOYEE_CREATED", "status": "pending_review", "template_id": None,
             "promoted_template_id": None, "slot_id": None, "files": ["D-2", "D-3"]},
        ])

    def test_approving_last_type_promotes_only_employee_created_and_materializes_official_links(self):
        review = required_function(self, "review_type")
        db = self._complete_db()

        result = review(
            db, checklist_result_id="CR-1", type_id="DT-NEW",
            decision="approved", reason=None, actor_id="DIRECTOR",
        )

        self.assertEqual(result["progress"], {
            "approved": 2, "total": 2, "percent": 100, "is_complete": True,
        })
        promoted_id = db.types["DT-NEW"]["promoted_template_id"]
        self.assertEqual(result["promoted_template_ids"], [promoted_id])
        self.assertIsNone(db.types["DT-CONFIG"]["promoted_template_id"])
        self.assertEqual(db.applicabilities, {(promoted_id, "PKG-1", "TYPE-1", "K02")})
        self.assertEqual(len(db.slots), 2)
        self.assertEqual(len(db.dossier_links), 3)
        self.assertEqual(len(db.checklist_links), 3)
        self.assertNotIn("upload", " ".join(sql for sql, _ in db.calls))
        self.assertNotIn("insert into public.dossier_documents", " ".join(sql for sql, _ in db.calls))
        official_link_sql = next(
            sql for sql, _ in db.calls
            if "insert into public.checklist_result_document_links" in sql
        )
        dossier_link_sql = next(
            sql for sql, _ in db.calls
            if "insert into public.dossier_document_links" in sql
        )
        self.assertIn("t.status = 'approved'", dossier_link_sql)
        self.assertIn("t.status = 'approved'", official_link_sql)
        self.assertIn("review_status", official_link_sql)
        self.assertIn("'approved'", official_link_sql)
        self.assertIn("reviewed_by", official_link_sql)
        self.assertIn("reviewed_at", official_link_sql)

    def test_rerunning_completed_promotion_reuses_template_scope_slots_and_links(self):
        review = required_function(self, "review_type")
        promote = required_function(self, "promote_completed_checklist_types")
        db = self._complete_db()
        review(
            db, checklist_result_id="CR-1", type_id="DT-NEW",
            decision="approved", reason=None, actor_id="DIRECTOR",
        )
        counts_before = (
            len(db.templates), len(db.applicabilities), len(db.slots),
            len(db.dossier_links), len(db.checklist_links),
        )

        promoted_again = promote(db, "CR-1", "DIRECTOR")

        self.assertEqual(promoted_again, [db.types["DT-NEW"]["promoted_template_id"]])
        self.assertEqual(counts_before, (
            len(db.templates), len(db.applicabilities), len(db.slots),
            len(db.dossier_links), len(db.checklist_links),
        ))


class ExactComboPromotionHelperTests(unittest.TestCase):
    def test_helper_writes_all_three_combo_dimensions_and_reuses_the_template(self):
        promote = getattr(slot_requests, "promote_template_for_combo", None)
        self.assertTrue(callable(promote), "missing promote_template_for_combo")
        db = RuntimeReviewDb([])

        first_id = promote(
            db, name="Ảnh mốc phụ", source="CONG_TY",
            service_package_id="PKG-1", task_type_id="TYPE-1", node_code="K02",
            actor_id="DIRECTOR",
        )
        second_id = promote(
            db, name="Ảnh mốc phụ", source="CONG_TY",
            service_package_id="PKG-1", task_type_id="TYPE-1", node_code="K02",
            actor_id="DIRECTOR",
        )

        self.assertEqual(first_id, second_id)
        self.assertEqual(len(db.templates), 1)
class PaperlessChecklistSubmissionTests(unittest.TestCase):
    def test_submit_paperless_checklist_with_reason_updates_status_and_persists_note(self):
        from src.employee_portal.service import EmployeePortalService
        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.return_value = {
            "id": "CR-PL-1",
            "checklist_name": "Đóng hồ sơ",
            "status": "pending",
            "deadline_at": None,
            "evidence_data": {},
            "require_evidence": False,
            "node_status": "in_progress",
        }
        employee = SimpleNamespace(id="EMP-1", user_id="U-1")

        result = EmployeePortalService.submit_checklist_evidence(
            db=db,
            employee=employee,
            task_node_id="TN-1",
            checklist_result_id="CR-PL-1",
            evidence_url=None,
            file_name=None,
            note="Đã đóng hồ sơ và lưu kho",
            late_reason=None,
            submitted_at=SimpleNamespace(isoformat=lambda: "2026-09-07T12:00:00Z"),
        )
        self.assertEqual(result["id"], "CR-PL-1")
        # Kiểm tra db.execute có update note = coalesce(:note, note)
        calls = [str(c[0][0]).lower() for c in db.execute.call_args_list]
        update_call = next(c for c in calls if "update public.task_node_checklist_results" in c)
        self.assertIn("note = coalesce(:note, note)", update_call)


if __name__ == "__main__":
    unittest.main()
