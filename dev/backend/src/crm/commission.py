from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Mapping


DEFAULT_CRM_POLICY = {
    "commission_rate_percent": Decimal("0"),
    "max_workload_points": 15,
    "warning_workload_ratio": Decimal("0.8"),
    "max_open_leads": 20,
    "stage_weights": {
        "Tiếp cận": 1,
        "Báo giá": 2,
        "Đàm phán": 3,
    },
}


def _decimal(value, field_name: str) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception as exc:
        raise ValueError(f"{field_name} must be numeric") from exc


def normalize_policy(raw: Mapping | None) -> dict:
    raw = raw or {}
    rate = _decimal(raw.get("commission_rate_percent", DEFAULT_CRM_POLICY["commission_rate_percent"]), "commission_rate_percent")
    if rate < 0 or rate > 100:
        raise ValueError("commission_rate_percent must be between 0 and 100")

    max_workload_points = int(raw.get("max_workload_points", DEFAULT_CRM_POLICY["max_workload_points"]))
    if max_workload_points <= 0:
        raise ValueError("max_workload_points must be greater than zero")

    warning_ratio = _decimal(raw.get("warning_workload_ratio", DEFAULT_CRM_POLICY["warning_workload_ratio"]), "warning_workload_ratio")
    if warning_ratio <= 0 or warning_ratio > 1:
        raise ValueError("warning_workload_ratio must be greater than 0 and at most 1")

    max_open_leads = int(raw.get("max_open_leads", DEFAULT_CRM_POLICY["max_open_leads"]))
    if max_open_leads <= 0:
        raise ValueError("max_open_leads must be greater than zero")

    stage_weights = dict(DEFAULT_CRM_POLICY["stage_weights"])
    stage_weights.update(raw.get("stage_weights") or {})
    if any(int(value) <= 0 for value in stage_weights.values()):
        raise ValueError("stage_weights must contain positive values")

    return {
        "commission_rate_percent": rate,
        "max_workload_points": max_workload_points,
        "warning_workload_ratio": warning_ratio,
        "max_open_leads": max_open_leads,
        "stage_weights": {str(key): int(value) for key, value in stage_weights.items()},
    }


def workload_score(statuses: Iterable[str], stage_weights: Mapping[str, int]) -> int:
    return sum(int(stage_weights.get(status, 0)) for status in statuses)


def can_claim_lead(current_workload: int, current_open_leads: int, policy: Mapping) -> bool:
    return (
        int(current_workload) < int(policy["max_workload_points"])
        and int(current_open_leads) < int(policy["max_open_leads"])
    )


def calculate_commission(collected_amount: Decimal | int | float | str, rate_percent: Decimal | int | float | str) -> Decimal:
    amount = _decimal(collected_amount, "collected_amount")
    rate = _decimal(rate_percent, "rate_percent")
    if amount < 0:
        raise ValueError("collected_amount cannot be negative")
    if rate < 0 or rate > 100:
        raise ValueError("rate_percent must be between 0 and 100")
    return (amount * rate / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
