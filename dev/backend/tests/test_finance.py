import pytest
from datetime import date, datetime
from fastapi import HTTPException
from src.db.models import CashflowTransaction, Contract, Customer, ServiceLine
from src.finance.schemas import CashflowIn
from src.finance.services import FinanceService


def _seed_cashflow_linkage_graph(db):
    suffix = datetime.now().strftime("%Y%m%d%H%M%S%f")
    customer_a = Customer(
        id=f"cashflow-customer-a-{suffix}",
        full_name=f"Khách hàng A {suffix}",
        phone=f"09{suffix[-8:]}",
    )
    customer_b = Customer(
        id=f"cashflow-customer-b-{suffix}",
        full_name=f"Khách hàng B {suffix}",
        phone=f"08{suffix[-8:]}",
    )
    contract_a = Contract(
        id=f"CASHFLOW-A-{suffix}",
        customer_id=customer_a.id,
        total_value=10000000,
        date_signed=date.today(),
        status="Đang thực hiện",
    )
    contract_b = Contract(
        id=f"CASHFLOW-B-{suffix}",
        customer_id=customer_b.id,
        total_value=10000000,
        date_signed=date.today(),
        status="Đang thực hiện",
    )
    project_a = ServiceLine(
        id=f"cashflow-project-a-{suffix}",
        contract_id=contract_a.id,
        service_type="Hạng mục A",
    )
    project_b = ServiceLine(
        id=f"cashflow-project-b-{suffix}",
        contract_id=contract_b.id,
        service_type="Hạng mục B",
    )
    db.add_all([customer_a, customer_b])
    db.flush()
    db.add_all([contract_a, contract_b, project_a, project_b])
    db.commit()
    return customer_a, customer_b, contract_a, contract_b, project_a, project_b


def _cashflow_payload(**overrides):
    payload = {
        "type": "EXPENSE",
        "amount": 100000,
        "category": "Chi tiếp khách & Giao tế",
        "payer_payee": "Nhà cung cấp test",
        "payment_method": "BANK_TRANSFER",
        "description": "Test cashflow linkage",
        "transaction_date": date.today().isoformat(),
        "scope": "COMPANY",
    }
    payload.update(overrides)
    return CashflowIn(**payload)


def test_list_cashflow(client, finance_clerk_user):
    user, headers = finance_clerk_user
    res = client.get("/api/finance/cashflow", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data or isinstance(data, list)


def test_missing_cashflow_detail_returns_404(client, finance_clerk_user):
    _, headers = finance_clerk_user
    response = client.get("/api/finance/cashflow/does-not-exist", headers=headers)
    assert response.status_code == 404


def test_non_contract_expense_is_allowed_for_customer_with_contract(db, admin_user):
    customer_a, _, _, _, _, _ = _seed_cashflow_linkage_graph(db)
    payload = _cashflow_payload(
        customer_id=customer_a.id,
        payer_payee=customer_a.full_name,
    )

    created = FinanceService.create_cashflow(db, payload, actor_id=admin_user.id)
    try:
        assert db.query(CashflowTransaction).filter_by(id=created["id"]).one().contract_id is None
    finally:
        db.query(CashflowTransaction).filter_by(id=created["id"]).delete()
        db.commit()


def test_expense_rejects_contract_from_another_customer(db, admin_user):
    customer_a, _, _, contract_b, _, _ = _seed_cashflow_linkage_graph(db)
    payload = _cashflow_payload(
        customer_id=customer_a.id,
        payer_payee=customer_a.full_name,
        contract_id=contract_b.id,
    )

    with pytest.raises(HTTPException, match="không thuộc khách hàng"):
        FinanceService.create_cashflow(db, payload, actor_id=admin_user.id)


def test_expense_rejects_project_from_another_contract(db, admin_user):
    customer_a, _, contract_a, _, _, project_b = _seed_cashflow_linkage_graph(db)
    payload = _cashflow_payload(
        customer_id=customer_a.id,
        payer_payee=customer_a.full_name,
        contract_id=contract_a.id,
        project_id=project_b.id,
    )

    with pytest.raises(HTTPException, match="không khớp với hợp đồng"):
        FinanceService.create_cashflow(db, payload, actor_id=admin_user.id)


def test_customer_refund_requires_contract_or_project(db, admin_user):
    customer_a, _, _, _, _, _ = _seed_cashflow_linkage_graph(db)
    payload = _cashflow_payload(
        category="Chi hoàn trả khách hàng",
        customer_id=customer_a.id,
        payer_payee=customer_a.full_name,
    )

    with pytest.raises(HTTPException, match="Chi hoàn trả khách hàng.*liên kết"):
        FinanceService.create_cashflow(db, payload, actor_id=admin_user.id)


def test_create_and_void_cashflow(client, finance_clerk_user, db):
    user, headers = finance_clerk_user

    payload = {
        "type": "EXPENSE",
        "amount": 2500000.0,
        "category": "Chi dịch vụ test",
        "payer_payee": "Nhà cung cấp Test Pytest",
        "payment_method": "BANK_TRANSFER",
        "transaction_date": datetime.now().strftime("%Y-%m-%d"),
        "description": "Test cashflow creation flow",
        "scope": "COMPANY"
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
    
    # Create test cash transaction using canonical Finance enum values.
    tx_cash = CashflowTransaction(
        id="PT-CASH-TEST-001",
        transaction_type="EXPENSE",
        amount=1500000.0,
        category_code="Chi tiền mặt test",
        payer_payee_name="Nhà cung cấp test tiền mặt",
        payment_method="CASH",
        scope="COMPANY",
        status="COMPLETED"
    )
    # Create test bank transaction (canonical BANK_TRANSFER payment_method)
    tx_bank = CashflowTransaction(
        id="PT-BANK-TEST-001",
        transaction_type="EXPENSE",
        amount=3500000.0,
        category_code="Chi ngân hàng test",
        payer_payee_name="Nhà cung cấp test ngân hàng",
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
        assert "total_income" not in data_cash
        assert "total_expenditure" in data_cash
        assert "transactions" in data_cash
        cash_tx_ids = [t["id"] for t in data_cash["transactions"]]
        assert "PT-CASH-TEST-001" in cash_tx_ids

        # 2. Test bank fund endpoint
        res_bank = client.get("/api/finance/cashflow/bank", headers=headers)
        assert res_bank.status_code == 200, f"Bank fund failed: {res_bank.text}"
        data_bank = res_bank.json()
        assert "balance" in data_bank
        assert "total_expenditure" in data_cash
        assert "transactions" in data_cash
        cash_tx_ids = [t["id"] for t in data_cash["transactions"]]
        assert "PT-CASH-TEST-001" in cash_tx_ids

        # 2. Test bank fund endpoint
        res_bank = client.get("/api/finance/cashflow/bank", headers=headers)
        assert res_bank.status_code == 200, f"Bank fund failed: {res_bank.text}"
        data_bank = res_bank.json()
        assert "balance" in data_bank
        assert "total_income" not in data_bank
        assert "total_expenditure" in data_bank
        assert "transactions" in data_bank
        bank_tx_ids = [t["id"] for t in data_bank["transactions"]]
        assert "PT-BANK-TEST-001" in bank_tx_ids
    finally:
        db.query(CashflowTransaction).filter(CashflowTransaction.id.in_(["PT-CASH-TEST-001", "PT-BANK-TEST-001"])).delete()
        db.commit()


def test_voided_contract_payment_excluded_from_installments(db):
    from src.dossiers.handover import installments
    from src.finance.services import FinanceService
    from src.db.models import User, Contract

    admin = db.query(User).filter(User.username == "admin").first()
    contract = db.query(Contract).first()
    if not contract or not admin:
        return

    payload = {
        "type": "Thu",
        "amount": 500000.0,
        "category": "Thu tiền hợp đồng",
        "payer_payee": "Khách hàng test",
        "payment_method": "Tiền mặt",
        "transaction_date": datetime.now().strftime("%Y-%m-%d"),
        "description": "Test installment void exclusion",
        "scope": "Công ty",
        "contract_id": contract.id,
    }
    created = FinanceService.create_cashflow(db, type("P", (), payload)(), actor_id=admin.id)
    tx_id = created["id"]
    try:
        # Before void: installments should include tx_id
        items_before = installments(db, contract.id)
        assert any(item["id"] == tx_id for item in items_before)

        # Void the transaction
        FinanceService.void_cashflow(db, tx_id, reason="Hủy test", actor_id=admin.id)

        # After void: installments MUST NOT include tx_id
        items_after = installments(db, contract.id)
        assert not any(item["id"] == tx_id for item in items_after)
    finally:
        db.query(CashflowTransaction).filter(CashflowTransaction.id == tx_id).delete()
        db.commit()
