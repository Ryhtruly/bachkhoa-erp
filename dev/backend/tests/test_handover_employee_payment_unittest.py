"""Unit tests for Employee Handover Payment submission, Director quick approve, and capability matching."""

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from src.dossiers import handover
from src.routes import routes_handover


class HandoverCapabilityAndPaymentTests(unittest.TestCase):
    def test_is_handover_node_matches_capability_handover(self):
        # 1. Node with capability_code = HANDOVER and no is_handover
        node_with_cap = {
            "node_code": "N03",
            "capability_code": "HANDOVER",
            "node_def": {},
        }
        self.assertTrue(handover.is_handover_node(node_with_cap))

        # 2. Node with capability in node_def = HANDOVER
        node_with_def_cap = {
            "node_code": "N03",
            "node_def": {"capability": "HANDOVER"},
        }
        self.assertTrue(handover.is_handover_node(node_with_def_cap))

        # 3. Node with is_handover = True
        node_with_flag = {
            "node_code": "STEP_X",
            "node_def": {"is_handover": True},
        }
        self.assertTrue(handover.is_handover_node(node_with_flag))

        # 4. Standard node (e.g. SURVEY_FIELD)
        standard_node = {
            "node_code": "N01",
            "capability_code": "SURVEY_FIELD",
            "node_def": {"capability": "SURVEY_FIELD"},
        }
        self.assertFalse(handover.is_handover_node(standard_node))

    def test_lane_b_can_record_payment_false_when_debt_is_settled(self):
        db = MagicMock()
        node_data = {
            "id": "TN-01",
            "node_key": "k06",
            "node_code": "N03",
            "capability_code": "HANDOVER",
            "status": "in_progress",
            "started_at": None,
            "execution_data": {},
            "workflow_instance_id": "WI-1",
            "defined_by_revision_id": "REV-1",
            "service_line_id": "SL-1",
            "contract_id": "HD-014",
            "service_type": "Đo vẽ",
            "total_value": 10000000,
            "customer_name": "Nguyen Van A",
            "node_def": {"is_handover": True},
        }

        with patch.object(handover, "_node_or_404", return_value=node_data), \
             patch.object(handover, "submission_gate", return_value={"is_open": True, "reason": None}), \
             patch.object(handover, "debt_summary", return_value={"remaining": 0, "is_settled": True, "gate_open": True, "paid": 10000000, "total_value": 10000000}), \
             patch.object(handover, "_current_debt_request", return_value=None), \
             patch.object(handover, "_checklist_submission_state", return_value={"all_approved": True, "ready_for_acceptance": True}), \
             patch.object(handover, "installments", return_value=[]), \
             patch.object(handover, "_split_handover_roles", return_value=([{"user_id": "U-EMP-1", "full_name": "Quoc"}], [])):

            state = handover.get_state(db, "TN-01", user_id="U-EMP-1")
            self.assertFalse(state["lane_b"]["can_record_payment"])

    def test_record_payment_blocks_unassigned_user_without_finance_create(self):
        db = MagicMock()
        user = MagicMock(id="U-RANDOM")

        with patch("src.dossiers.actor_guard.is_director", return_value=False), \
             patch("src.dossiers.actor_guard.employee_of", return_value={"id": "EMP-99"}), \
             patch("src.dossiers.actor_guard.is_assigned_to_node", return_value=False), \
             patch("src.routes.routes_handover.check_user_permission", return_value=False):

            with self.assertRaises(HTTPException) as ctx:
                routes_handover.record_payment(
                    task_node_id="TN-01",
                    amount=1000000,
                    payment_method="Chuyển khoản",
                    payer_name="Khach",
                    note=None,
                    receipt_files=[],
                    db=db,
                    user=user,
                )
            self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
