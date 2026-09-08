from decimal import Decimal
from unittest.mock import MagicMock, patch

from src.routes import routes_dashboard


def test_dashboard_summary_accepts_empty_receivables_with_decimal_contract_total():
    db = MagicMock()
    count_result = MagicMock()
    count_result.scalar_one.return_value = 0
    count_result.mappings.return_value.all.return_value = []
    db.execute.return_value = count_result
    db.query.return_value.scalar.side_effect = [Decimal("1250000.00"), None]

    with patch.object(routes_dashboard, "get_cached_json", return_value=None), \
         patch.object(routes_dashboard, "set_cached_json"):
        result = routes_dashboard.get_dashboard(db=db, user=MagicMock())

    assert result["stats"]["contract_val"] == float(Decimal("1250000.00"))
    assert result["stats"]["paid_val"] == 0.0
    assert result["stats"]["debt_val"] == float(Decimal("1250000.00"))
