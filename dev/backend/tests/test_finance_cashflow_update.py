from datetime import date
from types import SimpleNamespace

from src.db.models import CashflowTransaction
from src.finance.services import FinanceService


class _CashflowQuery:
    def __init__(self, transaction):
        self.transaction = transaction

    def filter(self, *_conditions):
        return self

    def first(self):
        return self.transaction


class _CashflowSession:
    def __init__(self, transaction):
        self.transaction = transaction
        self.events = []

    def query(self, model):
        assert model is CashflowTransaction
        return _CashflowQuery(self.transaction)

    def commit(self):
        self.events.append("commit")


def test_update_completed_cashflow_invalidates_money_caches_after_relink(monkeypatch):
    """Relinking a completed voucher must return success on the first request."""
    transaction = SimpleNamespace(
        id="PT-08/2026-026",
        status="Hoàn thành",
        transaction_date=date(2026, 8, 23),
        contract_id="old-contract",
        transaction_type="Thu",
        amount=70_000,
    )
    db = _CashflowSession(transaction)
    invalidated_keys = []

    monkeypatch.setattr("src.finance.services.check_closed_period", lambda *_args: None)
    monkeypatch.setattr("src.finance.services.validate_contract", lambda *_args: None)
    monkeypatch.setattr(FinanceService, "_sync_receivables", lambda *_args: None)
    monkeypatch.setattr(
        "src.core.redis_utils.invalidate_cache",
        lambda key: invalidated_keys.append(key),
    )

    payload = SimpleNamespace(
        contract_id="new-contract",
        transaction_date=None,
    )

    result = FinanceService.update_cashflow(db, transaction.id, payload)

    assert result == {"status": "success", "message": "Đã cập nhật hợp đồng"}
    assert transaction.contract_id == "new-contract"
    assert db.events == ["commit"]
    assert invalidated_keys == [
        "bachkhoa:finance:*",
        "bachkhoa:handover:*",
        "bachkhoa:contract_workspace:*",
        "bachkhoa:contracts:*",
        "bachkhoa:dashboard:*",
    ]
