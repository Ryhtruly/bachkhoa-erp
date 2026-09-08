import unittest

from pydantic import ValidationError

from src.db.models import AdvanceRequest, PayrollPeriod
from src.finance.access import can_view_employee_payroll, is_payroll_all_role
from src.finance.domain_rules import is_posted_transaction_status
from src.finance.schemas import AdvanceCreateIn, AdvanceRequestIn
from src.routes.routes_user_admin import CreateAccountIn


class AccountingPolicyTests(unittest.TestCase):
    def test_only_accountant_or_director_can_view_all_payroll(self):
        self.assertTrue(is_payroll_all_role("Accountant"))
        self.assertTrue(is_payroll_all_role("admin"))
        self.assertFalse(is_payroll_all_role("Director"))
        self.assertFalse(is_payroll_all_role("director"))
        self.assertFalse(is_payroll_all_role("giam_doc"))
        self.assertFalse(is_payroll_all_role("giám đốc"))
        self.assertFalse(is_payroll_all_role("sales"))
        self.assertFalse(is_payroll_all_role("survey_staff"))
        self.assertFalse(is_payroll_all_role("legal_staff"))

    def test_account_creation_rejects_non_canonical_role(self):
        for role_name in (None, "", "employee", "director", "giam_doc", "giám đốc", "kế toán", "ke_toan"):
            with self.subTest(role_name=role_name):
                with self.assertRaises(ValidationError):
                    CreateAccountIn(
                        username="employee-test",
                        email="employee-test@example.com",
                        role_name=role_name,
                    )

    def test_account_creation_accepts_canonical_roles(self):
        for role_name in ("admin", "accountant", "sales", "survey_staff", "legal_staff"):
            payload = CreateAccountIn(
                username=f"employee-{role_name}",
                email=f"employee-{role_name}@example.com",
                role_name=role_name,
            )
            self.assertEqual(payload.role_name, role_name)

    def test_non_privileged_user_can_view_only_own_payroll(self):
        self.assertTrue(
            can_view_employee_payroll(
                actor_employee_id="emp-1",
                target_employee_id="emp-1",
                can_view_all=False,
            )
        )
        self.assertFalse(
            can_view_employee_payroll(
                actor_employee_id="emp-1",
                target_employee_id="emp-2",
                can_view_all=False,
            )
        )
        self.assertTrue(
            can_view_employee_payroll(
                actor_employee_id=None,
                target_employee_id="emp-2",
                can_view_all=True,
            )
        )

    def test_pending_or_legacy_null_transaction_is_not_posted(self):
        self.assertTrue(is_posted_transaction_status("COMPLETED"))
        self.assertTrue(is_posted_transaction_status("Đã duyệt"))
        self.assertFalse(is_posted_transaction_status("PENDING"))
        self.assertFalse(is_posted_transaction_status(None))
        self.assertFalse(is_posted_transaction_status(""))

    def test_official_advance_voucher_dto_carries_request_id(self):
        voucher = AdvanceCreateIn(
            request_id="ar-1", amount=100000, payer_payee="Nhân viên"
        )
        self.assertEqual(voucher.request_id, "ar-1")

    def test_advance_request_has_positive_amount_and_payroll_snapshot(self):
        with self.assertRaises(ValidationError):
            AdvanceRequestIn(amount=0, note="Đi công tác")
        self.assertIn("snapshot", PayrollPeriod.__table__.columns)
        self.assertEqual(AdvanceRequest.__tablename__, "advance_requests")


if __name__ == "__main__":
    unittest.main()
