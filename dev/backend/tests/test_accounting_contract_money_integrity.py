"""Regression tests for issued-contract money validation and the K06 gate."""

from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.contracts.schemas import ContractCreateSchema, ContractGenerateSchema
from src.dossiers.handover import debt_summary
from src.core.finance_validation import parse_issued_money
from src.routes.routes_crm import LeadStatusUpdate, update_lead_status


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("18.000.000", Decimal("18000000.00")),
        ("18,000,000", Decimal("18000000.00")),
        ("18000000", Decimal("18000000.00")),
        ("1.234,56", Decimal("1234.56")),
    ],
)
def test_parse_issued_money_accepts_common_money_formats(raw, expected):
    assert parse_issued_money(raw) == expected


@pytest.mark.parametrize("raw", [None, "", "0", "-1", "-1.000", "abc"])
def test_parse_issued_money_rejects_invalid_issued_values(raw):
    with pytest.raises(HTTPException) as caught:
        parse_issued_money(raw)

    assert caught.value.status_code == 422


def test_k06_rejects_non_positive_contract_total_before_calculating_debt():
    with pytest.raises(HTTPException) as caught:
        debt_summary(MagicMock(), "HD-INVALID", -1)

    assert caught.value.status_code == 422
    assert "HD-INVALID" in str(caught.value.detail)


@pytest.mark.parametrize("price", [None, "", "0", "-1", "abc"])
def test_crm_close_rejects_invalid_price_before_lead_or_finance_side_effects(price):
    lead = type("Lead", (), {"status": "Báo giá", "customer_id": "customer-1"})()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = lead

    with pytest.raises(HTTPException) as caught:
        update_lead_status(
            "lead-1",
            LeadStatusUpdate(new_status="Chốt", price=price),
            db,
            type("User", (), {"id": "user-1"})(),
        )

    assert caught.value.status_code == 422
    assert lead.status == "Báo giá"
    db.add.assert_not_called()


@pytest.mark.parametrize("contract_value", [0, -1, float("inf"), float("nan")])
def test_direct_contract_schemas_reject_non_positive_values(contract_value):
    common = {
        "contract_template_id": "tpl-1",
        "customer_name": "Khách hàng thử nghiệm",
        "service_type": "Đo hiện trạng",
        "contract_value": contract_value,
        "sales_source": "CRM",
    }

    with pytest.raises(ValidationError):
        ContractCreateSchema(task_id="task-1", **common)

    with pytest.raises(ValidationError):
        ContractGenerateSchema(
            phone="0900000000",
            address="Địa chỉ thử nghiệm",
            date_signed="2026-09-12",
            due_date="2026-10-12",
            **common,
        )
