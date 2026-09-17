from src.contracts.workflow_runtime import resolve_assignment_rate


def test_assigned_rate_wins_after_catalog_price_changes():
    assignment = {
        "work_item_id": "wi_stakeout",
        "work_item_rate_id": "rate_old",
        "role_code": "MAIN",
    }
    rates_by_id = {
        "rate_old": {
            "id": "rate_old",
            "work_item_id": "wi_stakeout",
            "role_code": "MAIN",
            "amount": 1_000_000,
        },
        "rate_new": {
            "id": "rate_new",
            "work_item_id": "wi_stakeout",
            "role_code": "MAIN",
            "amount": 1_500_000,
        },
    }
    current_rates = {"wi_stakeout": {"MAIN": rates_by_id["rate_new"]}}

    resolved = resolve_assignment_rate(assignment, rates_by_id, current_rates)

    assert resolved["amount"] == 1_000_000


def test_legacy_assignment_without_rate_id_uses_current_rate():
    assignment = {
        "work_item_id": "wi_stakeout",
        "work_item_rate_id": None,
        "role_code": "MAIN",
    }
    current_rates = {
        "wi_stakeout": {
            "MAIN": {"id": "rate_new", "amount": 1_500_000},
        }
    }

    resolved = resolve_assignment_rate(assignment, {}, current_rates)

    assert resolved["amount"] == 1_500_000


def test_mismatched_assigned_rate_is_not_cross_applied():
    assignment = {
        "work_item_id": "wi_stakeout",
        "work_item_rate_id": "rate_other",
        "role_code": "MAIN",
    }
    rates_by_id = {
        "rate_other": {
            "id": "rate_other",
            "work_item_id": "wi_other",
            "role_code": "MAIN",
            "amount": 900_000,
        }
    }

    assert resolve_assignment_rate(assignment, rates_by_id, {}) is None
