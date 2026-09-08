"""Authorization primitives for finance and payroll object scope."""

from src.core.roles import PAYROLL_ALL_ROLE_NAMES


PAYROLL_ALL_ROLES = PAYROLL_ALL_ROLE_NAMES


def is_payroll_all_role(role_name: str | None) -> bool:
    return str(role_name or "").strip().lower() in PAYROLL_ALL_ROLES


def can_view_employee_payroll(
    *, actor_employee_id: str | None, target_employee_id: str | None, can_view_all: bool
) -> bool:
    """Return whether a caller may access one employee's salary ledger."""
    return bool(can_view_all or (actor_employee_id and actor_employee_id == target_employee_id))
