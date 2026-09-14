"""Regression tests for contract-driven receivables reporting."""

from datetime import date

from src.db.models import CashflowTransaction, Contract, Customer, Receivable
from src.finance.repository import FinanceRepository


def _seed_contract(db, contract_id, total_value, *, with_projection=True):
    customer = Customer(
        id=f"customer-{contract_id}",
        full_name=f"Khách hàng {contract_id}",
        phone=f"09{abs(hash(contract_id)) % 10_000_000:07d}",
    )
    contract = Contract(
        id=contract_id,
        customer_id=customer.id,
        total_value=total_value,
        date_signed=date(2026, 9, 12),
        status="Chờ thực hiện",
    )
    db.add(customer)
    db.add(contract)
    if with_projection:
        db.add(Receivable(
            id=f"rec-{contract_id}",
            contract_id=contract_id,
            paid_amount=0,
            remaining_amount=total_value,
        ))
    db.flush()
    return contract


def test_receivables_include_positive_contract_without_projection(db):
    _seed_contract(db, "001/BK-2026", 10_000_000, with_projection=True)
    _seed_contract(db, "HD-AUTO-AF821C", 8_000_000, with_projection=False)
    db.commit()

    rows = FinanceRepository.list_receivables_formatted(db)
    by_contract = {row["contract_id"]: row for row in rows}

    assert set(by_contract) == {"001/BK-2026", "HD-AUTO-AF821C"}
    assert by_contract["HD-AUTO-AF821C"]["paid_amount"] == 0
    assert by_contract["HD-AUTO-AF821C"]["remaining_amount"] == 8_000_000
    assert by_contract["HD-AUTO-AF821C"]["is_projection_missing"] is True


def test_receivables_paid_amount_comes_only_from_approved_income(db):
    contract = _seed_contract(db, "002/BK-2026", 10_000_000, with_projection=True)
    db.add_all([
        CashflowTransaction(
            id="tx-approved",
            contract_id=contract.id,
            transaction_type="INCOME",
            amount=2_000_000,
            status="COMPLETED",
        ),
        CashflowTransaction(
            id="tx-pending",
            contract_id=contract.id,
            transaction_type="INCOME",
            amount=3_000_000,
            status="PENDING",
        ),
        CashflowTransaction(
            id="tx-rejected",
            contract_id=contract.id,
            transaction_type="INCOME",
            amount=4_000_000,
            status="REJECTED",
        ),
        CashflowTransaction(
            id="tx-cancelled",
            contract_id=contract.id,
            transaction_type="INCOME",
            amount=5_000_000,
            status="CANCELLED",
        ),
    ])
    db.commit()

    row = next(item for item in FinanceRepository.list_receivables_formatted(db)
               if item["contract_id"] == contract.id)

    assert row["paid_amount"] == 2_000_000
    assert row["remaining_amount"] == 8_000_000
    assert row["status"] == "partial"
