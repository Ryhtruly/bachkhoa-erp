"""Regression tests for the K06 debt-request and manual acceptance gate."""

import unittest
import inspect
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from src.contracts import workflow_runtime
from src.core import redis_utils
from src.dossiers import handover
from src.routes import routes_handover


class HandoverOverrideGateTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.node = {
            "id": "TN-K06",
            "status": "in_progress",
            "execution_data": {},
            "contract_id": "HD-001",
            "total_value": 10_000_000,
            "node_def": {"is_handover": True, "transitions": {}},
        }

    def test_legacy_override_does_not_turn_financial_debt_into_settled(self):
        payment = MagicMock()
        payment.mappings.return_value.first.return_value = {
            "approved_amount": 5_000_000,
            "pending_amount": 0,
        }
        override = MagicMock()
        override.mappings.return_value.first.return_value = {
            "completion_override": True,
            "completion_override_reason": "Cho phép giao trước",
        }
        request = MagicMock()
        request.mappings.return_value.first.return_value = None
        self.db.execute.side_effect = [payment, override, request]

        debt = handover.debt_summary(
            self.db, "HD-001", 10_000_000, task_node_id="TN-K06"
        )

        self.assertFalse(debt["is_settled"])
        self.assertTrue(debt["gate_open"])
        self.assertEqual(debt["remaining"], 5_000_000)

    def test_submit_acceptance_cannot_bypass_missing_debt_approval(self):
        debt = {"remaining": 5_000_000, "is_settled": False, "gate_open": False}
        with patch.object(handover, "_node_or_404", return_value=self.node), \
             patch.object(handover, "submission_gate", return_value={"is_open": True}), \
             patch.object(handover, "_split_handover_roles", return_value=([{"user_id": "USER-NV"}], [])), \
             patch.object(handover, "debt_summary", return_value=debt):
            with self.assertRaises(HTTPException) as caught:
                handover.submit_handover_for_acceptance(
                    self.db, "TN-K06", actor_id="USER-NV", note=None
                )

        # 423 Locked — cùng mã với ensure_handover_work_gate_open, vì cùng một
        # nguyên nhân: hợp đồng còn nợ và chưa có duyệt ngoại lệ.
        self.assertEqual(caught.exception.status_code, 423)
        self.assertIn("5,000,000", caught.exception.detail)
        self.assertIn("xin duyệt nợ", caught.exception.detail)

    def test_checklist_upload_is_locked_server_side_while_debt_request_is_missing(self):
        debt = {"remaining": 5_000_000, "is_settled": False, "gate_open": False}
        with patch.object(handover, "_node_or_404", return_value=self.node), \
             patch.object(handover, "debt_summary", return_value=debt):
            with self.assertRaises(HTTPException) as caught:
                handover.ensure_handover_work_gate_open(self.db, "TN-K06")

        self.assertEqual(caught.exception.status_code, 423)
        self.assertIn("Xin duyệt nợ", caught.exception.detail)

    def test_checklist_upload_is_unlocked_after_director_approval(self):
        debt = {"remaining": 5_000_000, "is_settled": False, "gate_open": True}
        with patch.object(handover, "_node_or_404", return_value=self.node), \
             patch.object(handover, "debt_summary", return_value=debt):
            result = handover.ensure_handover_work_gate_open(self.db, "TN-K06")

        self.assertTrue(result["gate_open"])

    def test_accounting_query_keeps_approved_debt_request_visible_after_settlement(self):
        source = inspect.getsource(handover.outstanding_handovers)

        self.assertIn("handover_debt_requests", source)
        self.assertIn("is_financially_settled", source)
        self.assertIn("has_handover_debt_approval", source)

    def test_handover_delivery_condition_turns_green_only_after_every_checklist_is_approved(self):
        result = MagicMock()
        result.mappings.return_value.first.return_value = {
            "total": 2,
            "blocking": 0,
            "approved": 2,
        }
        self.db.execute.return_value = result

        checklist_state = handover._checklist_submission_state(self.db, "TN-K06")

        self.assertTrue(checklist_state["ready_for_acceptance"])
        self.assertTrue(checklist_state["all_approved"])

    def test_debt_request_exposes_protected_attachment_without_storage_key(self):
        result = MagicMock()
        result.mappings.return_value.first.return_value = {
            "id": "REQ-1",
            "task_node_id": "TN-K06",
            "remaining_amount_snapshot": 5_000_000,
            "commitment_file": {
                "id": "FILE-1",
                "filename": "cam-ket.pdf",
                "content_type": "application/pdf",
                "size": 128,
                "object_key": "private/do-not-leak.pdf",
            },
        }
        self.db.execute.return_value = result

        debt_request = handover._current_debt_request(self.db, "TN-K06")

        self.assertNotIn("commitment_file", debt_request)
        self.assertEqual(
            debt_request["commitment_attachment"]["url"],
            "/api/handover/debt-requests/REQ-1/commitment",
        )
        self.assertNotIn("object_key", debt_request["commitment_attachment"])

    def test_commitment_download_denies_user_who_is_not_requester_or_director(self):
        result = MagicMock()
        result.mappings.return_value.first.return_value = {
            "requester_user_id": "USER-REQUESTER",
            "commitment_file": {
                "id": "FILE-1",
                "filename": "cam-ket.pdf",
                "object_key": "private/cam-ket.pdf",
            },
        }
        self.db.execute.return_value = result

        with patch.object(routes_handover, "check_user_permission", return_value=False), \
             patch.object(routes_handover, "get_finance_file") as get_file:
            with self.assertRaises(HTTPException) as caught:
                routes_handover.view_debt_commitment(
                    "REQ-1",
                    db=self.db,
                    user=SimpleNamespace(id="USER-OTHER"),
                )

        self.assertEqual(caught.exception.status_code, 403)
        get_file.assert_not_called()


class HandoverFinalizationTests(unittest.TestCase):
    @staticmethod
    def _result(*, first=None, scalar_one=None, scalars_all=None):
        result = MagicMock()
        result.mappings.return_value.first.return_value = first
        result.first.return_value = first
        result.scalar_one.return_value = scalar_one
        result.scalars.return_value.all.return_value = scalars_all or []
        return result

    def _handover_node(self, *, delivered=False):
        return {
            "id": "TN-K06",
            "status": "in_progress",
            "node_key": "handover",
            "workflow_instance_id": "WF-1",
            "contract_id": "HD-001",
            "total_value": 10_000_000,
            "execution_data": {"handover": {"delivered_at": "2026-08-21T10:00:00Z"}} if delivered else {},
            "is_handover": True,
            "requires_gov_submission": False,
            # Bước bàn giao không khai tài liệu đầu ra — cột này phải là false để
            # cổng duyệt tài liệu không đụng tới K06.
            "has_output_documents": False,
            "dossier_status": None,
            "gov_receipt_code": None,
            "gov_submission_status": None,
            "transitions": {"COMPLETED": "archive"},
        }

    def test_handover_waits_when_checklists_pass_but_debt_gate_is_closed(self):
        db = MagicMock()
        db.execute.side_effect = [
            self._result(first=self._handover_node()),
            self._result(first=None),
        ]

        with patch.object(workflow_runtime, "_workflow_handover_gate_open", return_value=False):
            result = workflow_runtime.auto_finalize_node_if_ready(
                db, task_node_id="TN-K06", actor_id="DIRECTOR"
            )

        self.assertFalse(result["finalized"])
        self.assertFalse(result.get("submitted", False))
        self.assertEqual(result["reason"], "chờ thu đủ hoặc duyệt nợ")
        self.assertEqual(db.execute.call_count, 2)

    def test_handover_cannot_use_generic_node_submission_endpoint(self):
        db = MagicMock()
        db.execute.return_value = self._result(first={
            "id": "TN-K06",
            "status": "in_progress",
            "is_handover": True,
            # Cổng tạm dừng chạy trước cổng bàn giao. Bước này không tạm dừng,
            # nên nó phải đi tiếp tới đúng câu chặn của K06.
            "pause_reason_type": None,
        })

        with patch.object(workflow_runtime, "_require_node_assignment"):
            with self.assertRaises(workflow_runtime.WorkflowValidationError) as caught:
                workflow_runtime.submit_task_node_for_acceptance(
                    db,
                    task_node_id="TN-K06",
                    employee_id="EMP-1",
                    actor_id="USER-1",
                    note=None,
                )

        self.assertIn("luồng bàn giao K06", str(caught.exception))

    def test_handover_auto_accepts_when_checklists_pass_and_debt_gate_is_open(self):
        db = MagicMock()
        db.execute.side_effect = [
            self._result(first=self._handover_node()),
            self._result(first=None),
            self._result(scalar_one=1),
            self._result(scalar_one="ACC-K06"),
            self._result(),
            self._result(),
        ]
        with patch.object(workflow_runtime, "_workflow_handover_gate_open", return_value=True), \
             patch.object(workflow_runtime, "review_task_node_acceptance", return_value={"status": "accepted"}) as review:
            result = workflow_runtime.auto_finalize_node_if_ready(
                db, task_node_id="TN-K06", actor_id="DIRECTOR"
            )

        self.assertTrue(result["finalized"])
        review.assert_called_once_with(
            db,
            acceptance_id="ACC-K06",
            decision="accepted",
            outcome="COMPLETED",
            review_note="Tự nghiệm thu khi mọi checklist đã được duyệt",
            actor_id="DIRECTOR",
        )


class HandoverRealtimeCacheTests(unittest.TestCase):
    def test_money_change_invalidates_handover_debt_cache(self):
        with patch.object(redis_utils, "invalidate_cache") as invalidate:
            redis_utils.invalidate_money_caches()

        invalidate.assert_any_call("bachkhoa:handover:*")


if __name__ == "__main__":
    unittest.main()
