from types import SimpleNamespace
from unittest.mock import MagicMock

from src.finance.repository import FinanceRepository


def test_list_projects_keeps_internal_id_out_of_display_label():
    internal_id = "dd80ca4e-f4b5-4bdd-a231-0313c0c059ae"
    service_line = SimpleNamespace(
        id=internal_id,
        contract_id="2006/BK-2026",
        service_type="Tách thửa",
        service_package=None,
        land_owner_name=None,
    )
    contract = SimpleNamespace(id="2006/BK-2026")
    customer = SimpleNamespace(full_name="Nguyễn Văn Y")

    query = MagicMock()
    query.outerjoin.return_value = query
    query.order_by.return_value = query
    query.limit.return_value = query
    query.all.return_value = [(service_line, contract, customer)]
    db = MagicMock()
    db.query.return_value = query

    result = FinanceRepository.list_projects(db)

    assert result == [{
        "id": internal_id,
        "contract_id": "2006/BK-2026",
        "label": "2006/BK-2026 — Tách thửa — Nguyễn Văn Y",
    }]
    assert internal_id not in result[0]["label"]


def test_list_projects_uses_neutral_label_for_orphaned_legacy_row():
    service_line = SimpleNamespace(
        id="a1111111-1111-1111-1111-111111111111",
        contract_id=None,
        service_type=None,
        service_package=None,
        land_owner_name=None,
    )

    query = MagicMock()
    query.outerjoin.return_value = query
    query.order_by.return_value = query
    query.limit.return_value = query
    query.all.return_value = [(service_line, None, None)]
    db = MagicMock()
    db.query.return_value = query

    result = FinanceRepository.list_projects(db)

    assert result[0]["label"] == "Hồ sơ kỹ thuật chưa có mã"
    assert service_line.id not in result[0]["label"]
