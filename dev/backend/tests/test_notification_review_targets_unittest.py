import unittest
from datetime import datetime, timezone

from src.routes import routes_notifications


class NotificationReviewTargetTests(unittest.TestCase):
    def test_manager_review_items_carry_exact_checklist_and_debt_targets(self):
        self.assertTrue(
            hasattr(routes_notifications, "_manager_review_notifications"),
            "Notification mapper must expose exact review targets",
        )
        created_at = datetime(2026, 9, 7, 8, 30, tzinfo=timezone.utc)
        items = routes_notifications._manager_review_notifications(
            checklist_rows=[{
                "ref_id": "CHECKLIST-RESULT-1",
                "checklist_name": "Tiếp nhận hồ sơ",
                "contract_id": "HD-1",
                "service_line_id": "SL-1",
                "node_key": "node-k01",
                "task_node_id": "TASK-K01",
                "created_at": created_at,
            }],
            debt_rows=[{
                "request_id": "DEBT-REQUEST-1",
                "contract_id": "HD-1",
                "service_line_id": "SL-1",
                "node_key": "node-k06",
                "task_node_id": "TASK-K06",
                "remaining_amount_snapshot": 2_500_000,
                "created_at": created_at,
            }],
        )

        self.assertEqual(items[0]["target_type"], "checklist_review")
        self.assertEqual(items[0]["target_id"], "CHECKLIST-RESULT-1")
        self.assertEqual(items[0]["task_node_id"], "TASK-K01")
        self.assertEqual(items[1]["target_type"], "debt_review")
        self.assertEqual(items[1]["target_id"], "DEBT-REQUEST-1")
        self.assertEqual(items[1]["task_node_id"], "TASK-K06")
        self.assertIn("2,500,000", items[1]["label"])

    def test_employee_node_queries_are_defined_and_consistent(self):
        self.assertTrue(hasattr(routes_notifications, "_EMPLOYEE_NODE_TODO_QUERY"))
        self.assertTrue(hasattr(routes_notifications, "_EMPLOYEE_NODE_START_QUERY"))
        self.assertIs(
            routes_notifications._EMPLOYEE_NODE_START_QUERY,
            routes_notifications._EMPLOYEE_NODE_TODO_QUERY,
        )

    def test_get_notifications_summary_executes_for_employee_without_name_error(self):
        from unittest.mock import MagicMock
        mock_db = MagicMock()
        mock_db.execute.return_value.scalar.return_value = "EMP-001"
        mock_db.execute.return_value.mappings.return_value.all.return_value = []
        mock_employee = MagicMock()
        mock_employee.id = "EMP-001"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_employee

        mock_user = MagicMock()
        mock_user.id = "USER-001"

        res = routes_notifications.get_notifications_summary(db=mock_db, user=mock_user)
        self.assertIn("count", res)
        self.assertIn("items", res)

    def test_get_notifications_summary_maps_employee_node_start_items(self):
        from unittest.mock import MagicMock
        from datetime import datetime, timezone
        mock_db = MagicMock()
        now = datetime(2026, 9, 17, 9, 0, tzinfo=timezone.utc)

        def mock_execute_side_effect(query, params=None):
            m = MagicMock()
            if query is routes_notifications._EMPLOYEE_NODE_TODO_QUERY:
                m.mappings.return_value.all.return_value = [{
                    "node_key": "k01",
                    "node_name": "Tiếp nhận hồ sơ",
                    "status": "ready",
                    "contract_id": "HD-001",
                    "service_line_id": "SL-001",
                    "task_node_id": "TN-001",
                    "created_at": now,
                }]
            else:
                m.mappings.return_value.all.return_value = []
                m.scalar.return_value = None
            return m

        mock_db.execute.side_effect = mock_execute_side_effect
        mock_employee = MagicMock()
        mock_employee.id = "EMP-001"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_employee

        mock_user = MagicMock()
        mock_user.id = "USER-001"

        res = routes_notifications.get_notifications_summary(db=mock_db, user=mock_user)
        self.assertEqual(res["count"], 1)
        self.assertEqual(res["items"][0]["type"], "node_start")
        self.assertEqual(res["items"][0]["node_key"], "k01")
        self.assertIn("cần bắt đầu", res["items"][0]["label"])


if __name__ == "__main__":
    unittest.main()
