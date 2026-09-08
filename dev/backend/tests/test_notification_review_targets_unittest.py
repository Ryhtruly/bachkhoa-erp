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


if __name__ == "__main__":
    unittest.main()
