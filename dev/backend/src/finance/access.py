"""Authorization primitives for finance and payroll object scope."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from src.core.auth import is_accountant_user
from src.dossiers.actor_guard import is_director
from src.finance.enums import TransactionType, normalize_transaction_type

from src.core.roles import PAYROLL_ALL_ROLE_NAMES


PAYROLL_ALL_ROLES = PAYROLL_ALL_ROLE_NAMES


def is_payroll_all_role(role_name: str | None) -> bool:
    return str(role_name or "").strip().lower() in PAYROLL_ALL_ROLES


def can_view_employee_payroll(
    *, actor_employee_id: str | None, target_employee_id: str | None, can_view_all: bool
) -> bool:
    """Return whether a caller may access one employee's salary ledger."""
    return bool(can_view_all or (actor_employee_id and actor_employee_id == target_employee_id))


INCOME_TRANSACTION_TYPES = frozenset({TransactionType.INCOME.value})
EXPENSE_TRANSACTION_TYPES = frozenset({
    TransactionType.EXPENSE.value,
    TransactionType.ADVANCE.value,
    TransactionType.REIMBURSEMENT.value,
})


def is_director_user(db: Session, user) -> bool:
    return bool(user and is_director(db, user.id))


def finance_visibility(db: Session, user) -> str:
    """Return the finance data scope for an already authenticated user.

    ``director`` may access both sides of the ledger.  A finance-authorized
    non-director is deliberately reduced to ``expense`` data.  The permission
    dependency remains the first gate; this scope is the second, domain-level
    gate that prevents income leakage through a valid finance token.
    """
    return "director" if is_director_user(db, user) else "expense"


def is_income_transaction(transaction_type: str | None) -> bool:
    return normalize_transaction_type(transaction_type) == TransactionType.INCOME.value


def is_expense_transaction(transaction_type: str | None) -> bool:
    return normalize_transaction_type(transaction_type) in {
        TransactionType.EXPENSE.value,
        TransactionType.ADVANCE.value,
        TransactionType.REIMBURSEMENT.value,
    }


def restrict_cashflow_rows(rows, visibility: str):
    if visibility == "director":
        return rows
    return [row for row in rows if is_expense_transaction(getattr(row, "transaction_type", None))]


def assert_director(db: Session, user, detail: str = "Chỉ Giám đốc được thực hiện thao tác này.") -> None:
    if not is_director_user(db, user):
        raise HTTPException(status_code=403, detail=detail)


def assert_transaction_write_scope(db: Session, user, transaction_type: str | None) -> None:
    """Directors write both sides; accounting can only create/update expenses."""
    if is_director_user(db, user):
        return
    if is_income_transaction(transaction_type):
        raise HTTPException(status_code=403, detail="Chỉ Giám đốc được lập hoặc cập nhật phiếu thu.")
    if not is_expense_transaction(transaction_type) or not is_accountant_user(db, user):
        raise HTTPException(status_code=403, detail="Kế toán chỉ được lập hoặc cập nhật phiếu chi.")
