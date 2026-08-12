from datetime import date
from unittest.mock import Mock

from src.contracts.services import ContractService, next_contract_code


def test_next_contract_code_uses_the_largest_existing_sequence_globally():
    result = next_contract_code([
        "009/BK-2024",
        "1234/BK-2025",
        "legacy-contract",
        "12/BK-2026-extra",
    ])

    assert result == f"1235/BK-{date.today().year}"


def test_next_contract_code_has_a_three_digit_minimum_width():
    assert next_contract_code([]) == f"001/BK-{date.today().year}"


def test_get_next_contract_code_serializes_postgres_sequence_assignment():
    db = Mock()
    db.bind.dialect.name = "postgresql"
    db.query.return_value.all.return_value = [("009/BK-2024",)]

    assert ContractService.get_next_contract_code(db) == f"010/BK-{date.today().year}"
    db.execute.assert_called_once()
