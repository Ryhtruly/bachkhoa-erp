from datetime import date, datetime, timezone, timedelta
from fastapi import HTTPException
from sqlalchemy.orm import Session
from types import SimpleNamespace

from src.db.database import SessionLocal
from src.db.models import (
    CashflowTransaction, Contract, Customer, Receivable,
    User, Role, UserRole, RolePermission, FinanceSetting, FundOpeningBalance
)
from src.finance.services import FinanceService, counts_toward_receivable
from src.finance.repository import FinanceRepository
from src.finance.domain_rules import check_closed_period, check_cash_balance
from src.dossiers.actor_guard import is_director

def run_finance_audit_tests():
    db = SessionLocal()
    try:
        print("--- [1] Testing is_director helper ---")
        # Ensure admin user exists and is recognized as director
        admin = db.query(User).filter(User.username == "admin").first()
        if admin:
            assert is_director(db, admin.id) is True, "Admin must be recognized as director"
            print("  ✓ Admin is director: PASS")

        print("--- [2] Testing counts_toward_receivable logic ---")
        assert counts_toward_receivable("Hoàn thành", "Thu") is True
        assert counts_toward_receivable("Chờ duyệt", "Thu") is False
        assert counts_toward_receivable("Đã hủy", "Thu") is False
        assert counts_toward_receivable("Từ chối", "Thu") is False
        assert counts_toward_receivable("Hoàn thành", "Chi") is False
        print("  ✓ Receivable counting rules: PASS")

        print("--- [3] Testing void_cashflow ledger balance integrity ---")
        # Record initial cash balance
        initial_cash = FinanceRepository.get_running_balance(db, "Tiền mặt")
        
        # Create a completed income transaction of 5,000,000đ
        create_payload = SimpleNamespace(
            type="Thu",
            amount=5000000.0,
            category="Thu khác: Test audit balance",
            description="Test income voucher",
            payer_payee="Đối tác Test",
            payment_method="Tiền mặt",
            contract_id=None,
            project_id=None,
            department_code="Ban Giám đốc",
            transaction_date=date.today().strftime("%Y-%m-%d"),
            scope="Công ty"
        )
        
        res = FinanceService.create_cashflow(db, create_payload, actor_id=admin.id if admin else "admin")
        tx_id = res["id"]
        
        # Balance must increase by 5M
        bal_after_create = FinanceRepository.get_running_balance(db, "Tiền mặt")
        assert bal_after_create == initial_cash + 5000000.0, f"Expected {initial_cash + 5000000}, got {bal_after_create}"
        print("  ✓ Income creation increased balance by 5M: PASS")

        # Now void the transaction
        void_res = FinanceService.void_cashflow(db, tx_id, reason="Lập sai số tiền", actor_id=admin.id if admin else "admin")
        assert void_res["status"] == "success"
        
        # Balance must return EXACTLY to initial_cash (NOT minus 5M double deduction)
        bal_after_void = FinanceRepository.get_running_balance(db, "Tiền mặt")
        assert bal_after_void == initial_cash, f"FATAL BUG: Balance after void is {bal_after_void}, expected {initial_cash} (Double deduction detected!)"
        print("  ✓ Void transaction reverted balance exactly to initial (No double deduction): PASS")

        # Ensure voiding an already voided voucher throws 400
        try:
            FinanceService.void_cashflow(db, tx_id, reason="Hủy lại", actor_id=admin.id if admin else "admin")
            assert False, "Should not allow re-voiding"
        except HTTPException as e:
            assert e.status_code == 400
            print("  ✓ Re-voiding blocked: PASS")

        print("--- [4] Testing advance settlement on unapproved advance ---")
        # Create an unapproved advance
        adv_payload = SimpleNamespace(
            amount=3000000.0,
            payer_payee="Nhân viên Test",
            payment_method="Chuyển khoản",
            project_id=None,
            contract_id=None,
            note="Tạm ứng công tác chưa duyệt",
            status="Chờ duyệt"
        )
        adv_res = FinanceService.create_advance(db, adv_payload, actor_id="test_user")
        adv_id = adv_res["id"]

        # Attempt to settle unapproved advance -> MUST FAIL with 400
        clear_payload = SimpleNamespace(
            advance_id=adv_id,
            actual_amount=2500000.0,
            note="Quyết toán sớm"
        )
        try:
            FinanceService.clear_advance(db, clear_payload, actor_id=admin.id if admin else "admin")
            assert False, "Should not allow clearing unapproved advance"
        except HTTPException as e:
            assert e.status_code == 400
            print("  ✓ Clearing unapproved advance blocked: PASS")

        # Clean up test transactions
        db.query(CashflowTransaction).filter(CashflowTransaction.id.in_([tx_id, adv_id])).delete()
        db.commit()
        print("  ✓ Test cleanup: PASS")

        print("\n=======================================================")
        print("🎉 ALL 4 FINANCE AUDIT TEST SUITES PASSED FLAWLESSLY!")
        print("=======================================================\n")

    finally:
        db.close()

if __name__ == "__main__":
    run_finance_audit_tests()
