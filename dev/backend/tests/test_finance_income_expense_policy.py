from datetime import date
from decimal import Decimal
import uuid

import pytest
from fastapi import HTTPException

from src.core.auth import create_access_token, hash_password
from src.db.models import CashflowTransaction, RolePermission, User, UserRole, Role
from src.finance.schemas import AdvanceClearIn
from src.finance.services import FinanceService


def _accountant_headers(db):
    role = db.query(Role).filter(Role.role_name == "accountant").first()
    if role is None:
        role = Role(id=(db.query(Role.id).order_by(Role.id.desc()).first()[0] + 1) if db.query(Role.id).first() else 1,
                    role_name="accountant")
        db.add(role)
        db.flush()

    for action in ("read", "create", "update"):
        permission = db.query(RolePermission).filter(
            RolePermission.role_id == role.id,
            RolePermission.resource == "finance",
        ).first()
        if permission is None:
            permission = RolePermission(role_id=role.id, resource="finance")
            db.add(permission)
        setattr(permission, f"can_{action}", True)

    user = User(
        id=str(uuid.uuid4()),
        username=f"accountant_{uuid.uuid4().hex[:8]}",
        password_hash=hash_password("password123"),
        email=f"accountant_{uuid.uuid4().hex[:8]}@test.local",
        is_active=True,
    )
    db.add(user)
    db.flush()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    db.commit()
    return user, {"Authorization": f"Bearer {create_access_token(user.id)}"}


def _seed_transaction(db, transaction_type, amount, payment_method="CASH"):
    transaction = CashflowTransaction(
        id=f"test-{uuid.uuid4().hex}",
        transaction_type=transaction_type,
        amount=Decimal(str(amount)),
        category_code="Test policy",
        payer_payee_name="Test policy",
        payment_method=payment_method,
        transaction_date=date(2026, 9, 14),
        status="COMPLETED",
        scope="COMPANY",
    )
    db.add(transaction)
    db.commit()
    return transaction


def test_accountant_cashflow_hides_income_but_director_sees_all(client, db, admin_headers):
    _seed_transaction(db, "INCOME", 900000)
    _seed_transaction(db, "EXPENSE", 250000)
    _, accountant_headers = _accountant_headers(db)

    accountant_response = client.get("/api/finance/cashflow?month=2026-09", headers=accountant_headers)
    assert accountant_response.status_code == 200
    assert {row["transaction_type"] for row in accountant_response.json()} == {"EXPENSE"}

    director_response = client.get("/api/finance/cashflow?month=2026-09", headers=admin_headers)
    assert director_response.status_code == 200
    assert {row["transaction_type"] for row in director_response.json()} == {"INCOME", "EXPENSE"}


def test_accountant_can_see_balance_without_income_total(client, db):
    _seed_transaction(db, "INCOME", 900000)
    _seed_transaction(db, "EXPENSE", 250000)
    _, accountant_headers = _accountant_headers(db)

    response = client.get("/api/finance/cashflow/cash?month=2026-09", headers=accountant_headers)
    assert response.status_code == 200
    body = response.json()
    assert "balance" in body
    assert "total_expenditure" in body
    assert "total_income" not in body
    assert {row["transaction_type"] for row in body["transactions"]} == {"EXPENSE"}


def test_accountant_can_create_expense_but_not_income(client, db):
    _, accountant_headers = _accountant_headers(db)
    base_payload = {
        "amount": 100000,
        "category": "Chi vận hành",
        "payer_payee": "Nhà cung cấp",
        "payment_method": "BANK_TRANSFER",
        "transaction_date": "2026-09-14",
        "scope": "COMPANY",
    }

    income_response = client.post(
        "/api/finance/cashflow/create",
        json={**base_payload, "type": "INCOME"},
        headers=accountant_headers,
    )
    assert income_response.status_code == 403

    expense_response = client.post(
        "/api/finance/cashflow/create",
        json={**base_payload, "type": "EXPENSE"},
        headers=accountant_headers,
    )
    assert expense_response.status_code == 200
    created = db.query(CashflowTransaction).filter(
        CashflowTransaction.id == expense_response.json()["id"]
    ).one()
    assert created.transaction_type == "EXPENSE"
    assert created.status == "PENDING"


def test_accountant_cannot_read_receivables_or_contract_payment_totals(client, db):
    _, accountant_headers = _accountant_headers(db)

    assert client.get("/api/finance/receivables", headers=accountant_headers).status_code == 403
    contracts_response = client.get("/api/finance/contracts", headers=accountant_headers)
    assert contracts_response.status_code == 200
    assert all(
        not {"total_value", "paid_amount", "remaining"}.intersection(row)
        for row in contracts_response.json()
    )


def test_accountant_reports_do_not_contain_income_fields(client, db):
    _, accountant_headers = _accountant_headers(db)

    summary = client.get("/api/finance/summary", headers=accountant_headers)
    assert summary.status_code == 200
    assert "profit_by_contract" not in summary.json()
    assert all("income" not in row for row in summary.json().get("monthly", []))

    monthly = client.get("/api/finance/monthly-dashboard?month=2026-09", headers=accountant_headers)
    assert monthly.status_code == 200
    body = monthly.json()
    assert "total_income" not in body
    assert "net_difference" not in body
    assert all("income" not in row for row in body.get("categories", []))
    assert all("income" not in row for row in body.get("departments", []))


def test_accountant_cannot_approve_cashflow(db):
    accountant, _ = _accountant_headers(db)
    transaction = _seed_transaction(db, "EXPENSE", 250000, payment_method="BANK_TRANSFER")
    transaction.status = "PENDING"
    db.commit()

    with pytest.raises(HTTPException) as error:
        FinanceService.approve_cashflow(db, transaction.id, actor_id=accountant.id)
    assert error.value.status_code == 403


def test_advance_settlement_difference_creates_pending_voucher(db):
    accountant, _ = _accountant_headers(db)
    returned_advance = _seed_transaction(db, "ADVANCE", 1000000)
    returned_advance.description = "Tạm ứng công tác"
    db.commit()
    returned = FinanceService.clear_advance(
        db,
        AdvanceClearIn(advance_id=returned_advance.id, actual_amount=700000, note="Hoàn ứng"),
        actor_id=accountant.id,
    )
    voucher = db.query(CashflowTransaction).filter(
        CashflowTransaction.id == returned["auto_vouchers"][0]["id"]
    ).one()
    assert voucher.transaction_type == "INCOME"
    assert voucher.status == "PENDING"

    deficit_advance = _seed_transaction(db, "ADVANCE", 1000000)
    deficit_advance.description = "Tạm ứng công tác"
    db.commit()
    deficit = FinanceService.clear_advance(
        db,
        AdvanceClearIn(advance_id=deficit_advance.id, actual_amount=1300000, note="Chi bù"),
        actor_id=accountant.id,
    )
    voucher = db.query(CashflowTransaction).filter(
        CashflowTransaction.id == deficit["auto_vouchers"][0]["id"]
    ).one()
    assert voucher.transaction_type == "EXPENSE"
    assert voucher.status == "PENDING"

    exact_advance = _seed_transaction(db, "ADVANCE", 1000000)
    exact_advance.description = "Tạm ứng công tác"
    db.commit()
    exact = FinanceService.clear_advance(
        db,
        AdvanceClearIn(advance_id=exact_advance.id, actual_amount=1000000, note="Đủ chi"),
        actor_id=accountant.id,
    )
    assert exact["auto_vouchers"] == []
