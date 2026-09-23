import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from src.services.employee_handover_service import (
    get_employee_workload,
    execute_employee_handover,
    EmployeeHandoverIn,
)
from src.db.models import Employee, User, LeadPipeline, Customer


def _row(value):
    result = MagicMock()
    result.mappings.return_value.first.return_value = value
    return result


def _all_rows(rows):
    result = MagicMock()
    result.mappings.return_value.all.return_value = [dict(r) for r in rows]
    return result


class EmployeeHandoverTests(unittest.TestCase):
    def test_get_workload_employee_not_found(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        with self.assertRaises(HTTPException) as ctx:
            get_employee_workload(db, "non_existent_emp")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_get_workload_has_active_items(self):
        db = MagicMock()
        mock_emp = MagicMock(spec=Employee)
        mock_emp.id = "emp_1"
        mock_emp.full_name = "Nguyễn Văn A"
        mock_emp.user_id = "user_1"
        mock_emp.is_active = True

        db.query.return_value.filter.return_value.first.return_value = mock_emp

        # Mock db.execute for nodes and checklists
        node_data = [
            {
                "task_node_id": "tn_1",
                "node_code": "K02",
                "node_status": "in_progress",
                "contract_id": "c_1",
                "contract_code": "HD-001",
                "customer_name": "Khách A",
                "role_code": "MAIN",
                "is_primary": True,
                "node_name": "Đo đạc hiện trạng",
            }
        ]
        checklist_data = [
            {
                "checklist_result_id": "ck_1",
                "checklist_name": "Biên bản hiện trạng",
                "checklist_status": "in_progress",
                "task_node_id": "tn_1",
                "node_code": "K02",
                "contract_code": "HD-001",
            }
        ]

        exec_results = [_all_rows(node_data), _all_rows(checklist_data)]
        db.execute.side_effect = exec_results

        # Mock CRM leads query
        mock_lead = MagicMock(spec=LeadPipeline)
        mock_lead.id = "lead_1"
        mock_lead.source = "Web"
        mock_lead.status = "Tiếp cận"
        mock_lead.requirements = "Tách thửa"
        mock_cust = MagicMock(spec=Customer)
        mock_cust.name = "Nguyễn Thị B"
        mock_cust.phone = "0901234567"

        db.query.return_value.outerjoin.return_value.filter.return_value.order_by.return_value.all.return_value = [
            (mock_lead, mock_cust)
        ]

        res = get_employee_workload(db, "emp_1")
        self.assertTrue(res["has_active_work"])
        self.assertEqual(res["active_nodes_count"], 1)
        self.assertEqual(res["active_checklists_count"], 1)
        self.assertEqual(res["active_leads_count"], 1)
        self.assertEqual(res["total_active_work"], 3)
        self.assertEqual(res["employee_name"], "Nguyễn Văn A")

    def test_get_workload_zero_items(self):
        db = MagicMock()
        mock_emp = MagicMock(spec=Employee)
        mock_emp.id = "emp_2"
        mock_emp.full_name = "Trần Thị C"
        mock_emp.user_id = "user_2"
        mock_emp.is_active = True

        db.query.return_value.filter.return_value.first.return_value = mock_emp
        db.execute.side_effect = [_all_rows([]), _all_rows([])]
        db.query.return_value.outerjoin.return_value.filter.return_value.order_by.return_value.all.return_value = []

        res = get_employee_workload(db, "emp_2")
        self.assertFalse(res["has_active_work"])
        self.assertEqual(res["total_active_work"], 0)

    def test_execute_handover_validation_errors(self):
        db = MagicMock()
        mock_from_emp = MagicMock(spec=Employee)
        mock_from_emp.id = "emp_1"
        mock_from_emp.full_name = "Nguyễn Văn A"

        db.query.return_value.filter.return_value.first.return_value = mock_from_emp

        # Case 1: Missing to_employee_id in reassign mode
        with self.assertRaises(HTTPException) as ctx1:
            execute_employee_handover(
                db, "emp_1",
                EmployeeHandoverIn(to_employee_id=None, mode="reassign"),
                actor_id="admin_1"
            )
        self.assertEqual(ctx1.exception.status_code, 422)

        # Case 2: Reassigning to self
        with self.assertRaises(HTTPException) as ctx2:
            execute_employee_handover(
                db, "emp_1",
                EmployeeHandoverIn(to_employee_id="emp_1", mode="reassign"),
                actor_id="admin_1"
            )
        self.assertEqual(ctx2.exception.status_code, 422)

        # Case 3: Target employee not found or inactive
        db.query.return_value.filter.return_value.first.side_effect = [mock_from_emp, None]
        with self.assertRaises(HTTPException) as ctx3:
            execute_employee_handover(
                db, "emp_1",
                EmployeeHandoverIn(to_employee_id="emp_unknown", mode="reassign"),
                actor_id="admin_1"
            )
        self.assertEqual(ctx3.exception.status_code, 404)

    @patch("src.services.employee_handover_service.sync_contract_read_model_after_write")
    @patch("src.services.employee_handover_service.revoke_all_user_tokens")
    def test_execute_handover_reassign_success(self, mock_revoke, mock_sync):
        db = MagicMock()
        mock_from_emp = MagicMock(spec=Employee)
        mock_from_emp.id = "emp_1"
        mock_from_emp.full_name = "Nguyễn Văn A"
        mock_from_emp.user_id = "user_1"
        mock_from_emp.is_active = True

        mock_to_emp = MagicMock(spec=Employee)
        mock_to_emp.id = "emp_2"
        mock_to_emp.full_name = "Lê Văn B"
        mock_to_emp.user_id = "user_2"
        mock_to_emp.is_active = True

        mock_user_1 = MagicMock(spec=User)
        mock_user_1.id = "user_1"
        mock_user_1.is_active = True

        def mock_query_first(*args, **kwargs):
            return mock_from_emp

        db.query.return_value.filter.return_value.first.side_effect = [
            mock_from_emp,  # from_emp lookup
            mock_to_emp,    # to_emp lookup
            mock_user_1,    # user lookup during deactivate
        ]

        # Active nodes for emp_1
        active_nodes_data = [
            {"task_node_id": "tn_1", "role_code": "MAIN", "is_primary": True}
        ]
        db.execute.return_value.mappings.return_value.all.return_value = active_nodes_data
        db.execute.return_value.first.return_value = None  # to_emp not already assigned

        # CRM leads query
        mock_lead = MagicMock(spec=LeadPipeline)
        mock_lead.id = "lead_1"
        mock_lead.assigned_to = "user_1"
        db.query.return_value.filter.return_value.all.return_value = [mock_lead]

        payload = EmployeeHandoverIn(
            to_employee_id="emp_2",
            mode="reassign",
            handover_contracts=True,
            handover_crm=True,
            deactivate_after=True,
            reason="Nghỉ thai sản",
        )

        res = execute_employee_handover(db, "emp_1", payload, actor_id="admin_1")

        self.assertEqual(res["status"], "success")
        self.assertEqual(res["reassigned_nodes_count"], 1)
        self.assertEqual(res["reassigned_leads_count"], 1)
        self.assertTrue(res["deactivated"])
        self.assertFalse(mock_from_emp.is_active)
        self.assertFalse(mock_user_1.is_active)
        mock_revoke.assert_called_once_with("user_1")
        mock_sync.assert_called_once_with(db)
        self.assertEqual(mock_lead.assigned_to, "user_2")

    @patch("src.services.employee_handover_service.sync_contract_read_model_after_write")
    def test_execute_handover_pool_success(self, mock_sync):
        db = MagicMock()
        mock_from_emp = MagicMock(spec=Employee)
        mock_from_emp.id = "emp_1"
        mock_from_emp.full_name = "Nguyễn Văn A"
        mock_from_emp.user_id = None
        mock_from_emp.is_active = True

        db.query.return_value.filter.return_value.first.return_value = mock_from_emp

        active_nodes_data = [
            {"task_node_id": "tn_1", "role_code": "MAIN", "is_primary": True}
        ]
        db.execute.return_value.mappings.return_value.all.return_value = active_nodes_data

        payload = EmployeeHandoverIn(
            mode="pool",
            handover_contracts=True,
            handover_crm=False,
            deactivate_after=False,
            reason="Nhả lại việc do sự cố",
        )

        res = execute_employee_handover(db, "emp_1", payload, actor_id="admin_1")
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["reassigned_nodes_count"], 1)
        self.assertEqual(res["reassigned_leads_count"], 0)
        self.assertFalse(res["deactivated"])
        self.assertTrue(mock_from_emp.is_active)


if __name__ == "__main__":
    unittest.main()

