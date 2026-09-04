import unittest
from unittest.mock import MagicMock, patch

from src.dossiers import checklist_document_types


DocumentTypeStatus = checklist_document_types.DocumentTypeStatus
SOURCE_LABELS = checklist_document_types.SOURCE_LABELS
checklist_context = checklist_document_types.checklist_context
progress = checklist_document_types.progress


def rows(value):
    db = MagicMock()
    db.execute.return_value.mappings.return_value.all.return_value = value
    return db


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


class ConfiguredDocumentTypeMaterializationTests(unittest.TestCase):
    def test_graph_outputs_materialize_from_catalog_once(self):
        result = MagicMock()
        result.fetchall.side_effect = [
            [("TYPE-1",), ("TYPE-2",)],
            [],
        ]
        db = MagicMock()
        db.execute.return_value = result

        first = checklist_document_types.materialize_configured_types(
            db, "CR-1", actor_id="DIRECTOR-1"
        )
        second = checklist_document_types.materialize_configured_types(
            db, "CR-1", actor_id="DIRECTOR-1"
        )

        self.assertEqual(first, 2)
        self.assertEqual(second, 0)
        query, params = db.execute.call_args_list[0].args
        emitted_query = str(query).lower()
        self.assertIn("output_documents", emitted_query)
        self.assertIn("join public.document_checklist_templates t", emitted_query)
        self.assertIn("t.name", emitted_query)
        self.assertIn("t.source", emitted_query)
        self.assertIn("'configured'", emitted_query)
        self.assertIn("on conflict", emitted_query)
        self.assertEqual(params, {
            "checklist_result_id": "CR-1",
            "actor_id": "DIRECTOR-1",
        })

    def test_amended_node_uses_active_revision_before_defined_revision_is_rebased(self):
        db = MagicMock()
        db.execute.return_value.fetchall.return_value = []

        checklist_document_types.materialize_configured_types(db, "CR-NEW")

        query = str(db.execute.call_args.args[0]).lower()
        self.assertIn("join public.workflow_instances", query)
        self.assertIn("wi.active_revision_id", query)
        self.assertIn("r_active.graph", query)
        self.assertIn("r_defined.graph", query)


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


if __name__ == "__main__":
    unittest.main()
