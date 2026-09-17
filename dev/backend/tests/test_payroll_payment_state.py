"""Regression tests for payroll payment acknowledgement semantics."""

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from src.finance.services import FinanceService


def test_mark_paid_explicitly_reports_external_payment_without_cashflow():
    period = SimpleNamespace(
        id="pp-2026-09",
        period_month=date(2026, 9, 1),
        status="Locked",
        paid_at=None,
    )
    db = MagicMock()

    with patch.object(FinanceService, "_resolve_payroll_period", return_value=period), \
         patch("src.finance.services.log_action"):
        result = FinanceService.mark_paid_payroll_period(db, period.id, "director-1")

    assert result["new_status"] == "Paid"
    assert result["payment_source"] == "external"
    assert result["cashflow_recorded"] is False
    db.commit.assert_called_once()
