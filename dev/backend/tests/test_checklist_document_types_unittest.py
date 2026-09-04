import json
import unittest
from contextlib import nullcontext
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from src.dossiers import checklist_document_types


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

    def test_approved_type_is_locked(self):
        add_files = required_function(self, "add_files")
        db = DocumentTypeDb({**self.type_row, "status": "approved"})
        with self.assertRaises(HTTPException) as caught:
            add_files(
                db, document_type_id="DT-1",
                uploads=[("one.pdf", "application/pdf", b"1")], actor_id="NV-1",
            )
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(db.savepoints, 0)

    def test_rejected_type_returns_to_draft_after_successful_file_change(self):
        add_files = required_function(self, "add_files")
        db = DocumentTypeDb({**self.type_row, "status": "rejected", "file_count": 1})
        with patch.object(checklist_document_types, "ensure_bucket"), \
             patch.object(checklist_document_types, "upload_file", return_value="stored"):
            result = add_files(
                db, document_type_id="DT-1",
                uploads=[("replacement.pdf", "application/pdf", b"new")], actor_id="NV-1",
            )
        self.assertEqual(result[0]["file_count"], 2)
        status_updates = [(sql, params) for sql, params in db.calls if "set status = 'draft'" in sql]
        self.assertEqual(len(status_updates), 1)
        self.assertIn("rejection_reason = null", status_updates[0][0])

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

    def test_remove_file_is_locked_after_approval(self):
        remove_file = required_function(self, "remove_file")
        db = DocumentTypeDb({**self.type_row, "status": "approved", "file_count": 1})

        with self.assertRaises(HTTPException) as caught:
            remove_file(
                db, document_type_id="DT-1", document_id="D-1", actor_id="NV-1",
            )

        self.assertEqual(caught.exception.status_code, 409)

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
        self.assertEqual(
            sum("from public.dossier_documents d" in sql for sql, _ in db.calls), 0,
        )

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


if __name__ == "__main__":
    unittest.main()
