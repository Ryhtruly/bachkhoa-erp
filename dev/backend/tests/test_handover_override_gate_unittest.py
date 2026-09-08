"""Regression tests for the K06 debt-request and manual acceptance gate."""

import inspect
import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from src.contracts import workflow_runtime
from src.core import redis_utils
from src.dossiers import handover
from src.employee_portal.service import EmployeePortalService
from src.routes import routes_handover


class _HandoverResult:
    def __init__(self, *, rows=None, scalar=None):
        self._rows = list(rows or [])
        self._scalar = scalar

    def mappings(self):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def scalar_one(self):
        return self._scalar


class _HandoverSubmitDb:
    """Stateful boundary double for K06 plus the real runtime-type submit helper."""

    def __init__(self, types):
        self.types = {item["id"]: dict(item) for item in types}
        self.calls = []
        self.node_update_data = None

    def execute(self, query, params=None):
        sql = " ".join(str(query).lower().split())
        self.calls.append(sql)
        if "with locked_checklists as materialized" in sql:
            active = [item for item in self.types.values() if item.get("is_active", True)]
            missing = [item["name"] for item in active if not item.get("files")]
            if not missing:
                for item in active:
                    if item["status"] in ("draft", "rejected"):
                        item.update(status="pending_review", rejection_reason=None)
            return _HandoverResult(rows=[{
                "missing_types": missing,
                "unresolved_checklists": [],
                "total": len(active),
                "approved": sum(item["status"] == "approved" for item in active),
                "pending_review": sum(item["status"] == "pending_review" for item in active),
            }])
        if "max(attempt_no)" in sql:
            return _HandoverResult(scalar=1)
        if "insert into public.task_node_acceptances" in sql:
            return _HandoverResult(scalar="ACC-K06")
        if "update public.task_nodes" in sql and "execution_data" in sql:
            self.node_update_data = json.loads(params["data"])
        return _HandoverResult()


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
        self.db = _HandoverSubmitDb([{
            "id": "DT-DRAFT", "name": "Biên bản bàn giao",
            "status": "draft", "files": ["DOC-1"],
        }])
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
        self.assertEqual(self.db.types["DT-DRAFT"]["status"], "draft")
        self.assertFalse(any("with locked_checklists as materialized" in sql for sql in self.db.calls))

    def test_unauthorized_handover_submit_does_not_transition_runtime_types(self):
        db = _HandoverSubmitDb([{
            "id": "DT-REJECTED", "name": "Phiếu giao nhận",
            "status": "rejected", "rejection_reason": "Thiếu chữ ký",
            "files": ["DOC-1"],
        }])
        with patch.object(handover, "_node_or_404", return_value=self.node), \
             patch.object(handover, "submission_gate", return_value={"is_open": True}), \
             patch.object(handover, "_split_handover_roles", return_value=([{"user_id": "USER-OTHER"}], [])), \
             patch.object(handover, "debt_summary") as debt:
            with self.assertRaises(HTTPException) as caught:
                handover.submit_handover_for_acceptance(
                    db, "TN-K06", actor_id="USER-NV", note=None
                )

        self.assertEqual(caught.exception.status_code, 403)
        self.assertEqual(db.types["DT-REJECTED"]["status"], "rejected")
        self.assertFalse(any("with locked_checklists as materialized" in sql for sql in db.calls))
        debt.assert_not_called()

    def test_paid_handover_submits_runtime_types_and_preserves_approved(self):
        db = _HandoverSubmitDb([
            {"id": "DT-DRAFT", "name": "A", "status": "draft", "files": ["DOC-1"]},
            {"id": "DT-REJECTED", "name": "B", "status": "rejected",
             "rejection_reason": "Mờ", "files": ["DOC-2"]},
            {"id": "DT-APPROVED", "name": "C", "status": "approved", "files": ["DOC-3"]},
        ])
        debt = {"remaining": 0, "is_settled": True, "gate_open": True}
        with patch.object(handover, "_node_or_404", return_value=self.node), \
             patch.object(handover, "submission_gate", return_value={"is_open": True}), \
             patch.object(handover, "_split_handover_roles", return_value=([{"user_id": "USER-NV"}], [])), \
             patch.object(handover, "debt_summary", return_value=debt), \
             patch.object(handover, "_checklist_submission_state", return_value={
                 "total": 1, "ready_for_acceptance": True,
             }):
            result = handover.submit_handover_for_acceptance(
                db, "TN-K06", actor_id="USER-NV", note="Bàn giao"
            )

        self.assertEqual(result["status"], "submitted")
        self.assertEqual(db.types["DT-DRAFT"]["status"], "pending_review")
        self.assertEqual(db.types["DT-REJECTED"]["status"], "pending_review")
        self.assertIsNone(db.types["DT-REJECTED"]["rejection_reason"])
        self.assertEqual(db.types["DT-APPROVED"]["status"], "approved")
        self.assertFalse(db.node_update_data["handover"]["used_debt_override"])
        self.assertEqual(db.node_update_data["handover"]["remaining_at_submission"], 0)

    def test_approved_debt_handover_still_submits_runtime_types(self):
        db = _HandoverSubmitDb([{
            "id": "DT-DRAFT", "name": "Biên bản", "status": "draft", "files": ["DOC-1"],
        }])
        debt = {"remaining": 5_000_000, "is_settled": False, "gate_open": True}
        with patch.object(handover, "_node_or_404", return_value=self.node), \
             patch.object(handover, "submission_gate", return_value={"is_open": True}), \
             patch.object(handover, "_split_handover_roles", return_value=([{"user_id": "USER-NV"}], [])), \
             patch.object(handover, "debt_summary", return_value=debt), \
             patch.object(handover, "_checklist_submission_state", return_value={
                 "total": 1, "ready_for_acceptance": True,
             }):
            result = handover.submit_handover_for_acceptance(
                db, "TN-K06", actor_id="USER-NV", note=None
            )

        self.assertEqual(result["status"], "submitted")
        self.assertEqual(db.types["DT-DRAFT"]["status"], "pending_review")
        self.assertTrue(db.node_update_data["handover"]["used_debt_override"])
        self.assertEqual(
            db.node_update_data["handover"]["remaining_at_submission"],
            5_000_000,
        )

    def test_zero_file_runtime_type_blocks_handover_submission(self):
        db = _HandoverSubmitDb([{
            "id": "DT-EMPTY", "name": "Biên bản bàn giao",
            "status": "draft", "files": [],
        }])
        debt = {"remaining": 0, "is_settled": True, "gate_open": True}
        with patch.object(handover, "_node_or_404", return_value=self.node), \
             patch.object(handover, "submission_gate", return_value={"is_open": True}), \
             patch.object(handover, "_split_handover_roles", return_value=([{"user_id": "USER-NV"}], [])), \
             patch.object(handover, "debt_summary", return_value=debt), \
             patch.object(handover, "_checklist_submission_state", return_value={
                 "total": 1, "ready_for_acceptance": True,
             }):
            with self.assertRaises(HTTPException) as caught:
                handover.submit_handover_for_acceptance(
                    db, "TN-K06", actor_id="USER-NV", note=None
                )

        self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(db.types["DT-EMPTY"]["status"], "draft")
        self.assertFalse(any("insert into public.task_node_acceptances" in sql for sql in db.calls))

    def test_checklist_document_authorization_does_not_use_handover_debt_gate(self):
        employee = SimpleNamespace(id="EMP-1")
        with patch.object(
            EmployeePortalService,
            "_authorized_checklist_for_submission",
            return_value=object(),
        ) as normal_authorization, patch.object(
            handover,
            "ensure_handover_work_gate_open",
        ) as debt_gate:
            EmployeePortalService.authorize_checklist_evidence_submission(
                self.db,
                employee,
                "TN-K06",
                "CR-1",
                evidence_provided=True,
            )

        debt_gate.assert_not_called()
        normal_authorization.assert_called_once_with(
            self.db,
            employee,
            "TN-K06",
            "CR-1",
            evidence_provided=True,
            lock=False,
        )

    def test_rejecting_debt_request_requires_a_reason_before_database_update(self):
        with self.assertRaises(HTTPException) as caught:
            handover.review_debt_request(
                self.db,
                "REQ-1",
                decision="rejected",
                review_note="   ",
                actor_id="DIRECTOR-1",
            )

        self.assertEqual(caught.exception.status_code, 422)
        self.assertIn("lý do", caught.exception.detail.lower())
        self.db.execute.assert_not_called()

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

    def test_checklist_submission_state_query_includes_runtime_types(self):
        result = MagicMock()
        result.mappings.return_value.first.return_value = {
            "total": 1,
            "blocking": 0,
            "approved": 0,
        }
        self.db.execute.return_value = result

        checklist_state = handover._checklist_submission_state(self.db, "TN-K06")

        executed_sql = " ".join(str(self.db.execute.call_args[0][0]).split())
        self.assertIn("checklist_runtime_summary", executed_sql)
        self.assertIn("checklist_result_document_types", executed_sql)
        self.assertTrue(checklist_state["ready_for_acceptance"])

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
