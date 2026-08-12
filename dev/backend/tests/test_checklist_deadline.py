import unittest
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from src.employee_portal.service import checklist_submission_state


class ChecklistDeadlineTests(unittest.TestCase):
    def setUp(self):
        self.deadline = datetime(2026, 8, 11, 10, 0, tzinfo=timezone.utc)

    def test_on_time_submission_uses_normal_approval(self):
        status, is_overdue, reason = checklist_submission_state(
            deadline_at=self.deadline,
            submitted_at=self.deadline,
            late_reason=None,
        )
        self.assertEqual(status, "pending_approval")
        self.assertFalse(is_overdue)
        self.assertIsNone(reason)

    def test_late_submission_requires_reason(self):
        with self.assertRaises(HTTPException) as context:
            checklist_submission_state(
                deadline_at=self.deadline,
                submitted_at=self.deadline + timedelta(seconds=1),
                late_reason="",
            )
        self.assertEqual(context.exception.status_code, 422)

    def test_late_submission_uses_late_approval_state(self):
        status, is_overdue, reason = checklist_submission_state(
            deadline_at=self.deadline,
            submitted_at=self.deadline + timedelta(hours=2),
            late_reason="Khách giao tài liệu trễ",
        )
        self.assertEqual(status, "late_pending_approval")
        self.assertTrue(is_overdue)
        self.assertEqual(reason, "Khách giao tài liệu trễ")


if __name__ == "__main__":
    unittest.main()
