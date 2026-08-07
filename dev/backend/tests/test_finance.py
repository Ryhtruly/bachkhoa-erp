import pytest
from datetime import datetime
from src.db.models import CashflowTransaction


def test_list_cashflow(client, finance_clerk_user):
    user, headers = finance_clerk_user
    res = client.get("/api/finance/cashflow", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data or isinstance(data, list)


def test_create_and_void_cashflow(client, finance_clerk_user, db):
    user, headers = finance_clerk_user

    payload = {
        "type": "INCOME",
        "amount": 2500000.0,
        "category": "Thu tiền dịch vụ test",
        "payer_payee": "Khách hàng Test Pytest",
        "payment_method": "CASH",
        "transaction_date": datetime.now().strftime("%Y-%m-%d"),
        "description": "Test cashflow creation flow",
        "scope": "INTERNAL"
    }

    # 1. Create cashflow
    res = client.post("/api/finance/cashflow/create", json=payload, headers=headers)
    assert res.status_code == 200, f"Create failed: {res.text}"
    data = res.json()
    voucher_id = data["id"]
    assert voucher_id is not None

    # 2. Detail cashflow
    res_detail = client.get(f"/api/finance/cashflow/{voucher_id}", headers=headers)
    assert res_detail.status_code == 200
    assert res_detail.json()["id"] == voucher_id

    # 3. Void cashflow
    void_payload = {"reason": "Test voiding transaction"}
    res_void = client.post(f"/api/finance/cashflow/{voucher_id}/void", json=void_payload, headers=headers)
    assert res_void.status_code == 200, f"Void failed: {res_void.text}"

    # Clean up from DB
    tx = db.query(CashflowTransaction).filter(CashflowTransaction.id == voucher_id).first()
    if tx:
        db.delete(tx)
        db.commit()


def test_fund_balances_history(client, finance_clerk_user):
    user, headers = finance_clerk_user
    res = client.get("/api/finance/fund-balances/history", headers=headers)
    assert res.status_code == 200
