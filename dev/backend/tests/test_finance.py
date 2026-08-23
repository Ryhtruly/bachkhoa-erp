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
        "type": "Thu",
        "amount": 2500000.0,
        "category": "Thu tiền dịch vụ test",
        "payer_payee": "Khách hàng Test Pytest",
        "payment_method": "Tiền mặt",
        "transaction_date": datetime.now().strftime("%Y-%m-%d"),
        "description": "Test cashflow creation flow",
        "scope": "Công ty"
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


def test_cashflow_cash_and_bank_endpoints(client, finance_clerk_user, db):
    user, headers = finance_clerk_user
    
    # Create test cash transaction (legacy Vietnamese payment_method)
    tx_cash = CashflowTransaction(
        id="PT-CASH-TEST-001",
        transaction_type="Thu",
        amount=1500000.0,
        category_code="Thu tiền mặt test",
        payer_payee_name="Khách test tiền mặt",
        payment_method="Tiền mặt",
        scope="Công ty",
        status="Hoàn thành"
    )
    # Create test bank transaction (canonical BANK_TRANSFER payment_method)
    tx_bank = CashflowTransaction(
        id="PT-BANK-TEST-001",
        transaction_type="INCOME",
        amount=3500000.0,
        category_code="Thu ngân hàng test",
        payer_payee_name="Khách test ngân hàng",
        payment_method="BANK_TRANSFER",
        scope="COMPANY",
        status="COMPLETED"
    )
    db.add_all([tx_cash, tx_bank])
    db.commit()

    try:
        # 1. Test cash fund endpoint
        res_cash = client.get("/api/finance/cashflow/cash", headers=headers)
        assert res_cash.status_code == 200, f"Cash fund failed: {res_cash.text}"
        data_cash = res_cash.json()
        assert "balance" in data_cash
        assert "total_income" in data_cash
        assert "total_expenditure" in data_cash
        assert "transactions" in data_cash
        cash_tx_ids = [t["id"] for t in data_cash["transactions"]]
        assert "PT-CASH-TEST-001" in cash_tx_ids

        # 2. Test bank fund endpoint
        res_bank = client.get("/api/finance/cashflow/bank", headers=headers)
        assert res_bank.status_code == 200, f"Bank fund failed: {res_bank.text}"
        data_bank = res_bank.json()
        assert "balance" in data_bank
        assert "total_income" in data_bank
        assert "total_expenditure" in data_bank
        assert "transactions" in data_bank
        bank_tx_ids = [t["id"] for t in data_bank["transactions"]]
        assert "PT-BANK-TEST-001" in bank_tx_ids
    finally:
        db.query(CashflowTransaction).filter(CashflowTransaction.id.in_(["PT-CASH-TEST-001", "PT-BANK-TEST-001"])).delete()
        db.commit()

