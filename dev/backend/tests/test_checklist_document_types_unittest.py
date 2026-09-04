import unittest
from unittest.mock import MagicMock

from src.dossiers.checklist_document_types import (
    DocumentTypeStatus,
    SOURCE_LABELS,
    checklist_context,
    progress,
)


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


if __name__ == "__main__":
    unittest.main()
