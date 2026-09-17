"""Authorization helpers for contract read scopes."""

from sqlalchemy import or_
from sqlalchemy.orm import Session
from fastapi import HTTPException

from src.core.roles import canonicalize_role_name
from src.db.models import Contract, LeadPipeline, Role, User, UserRole


def user_has_all_contract_read_access(db: Session, user: User) -> bool:
    """Return whether the user may read every contract."""
    if not user or not user.is_active:
        return False
    if (user.username or "").strip().casefold() == "admin":
        return True
    role_names = (
        db.query(Role.role_name)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user.id, Role.is_active.is_(True))
        .all()
    )
    return any(
        canonicalize_role_name(row[0]) in {"admin", "accountant"}
        for row in role_names
    )


def assert_contract_read_access(db: Session, user: User, contract_id: str) -> None:
    """Enforce all-contract or related-contract access at the API boundary."""
    if user_has_all_contract_read_access(db, user):
        return

    related = (
        db.query(Contract.id)
        .outerjoin(LeadPipeline, LeadPipeline.id == Contract.lead_id)
        .filter(
            Contract.id == contract_id,
            or_(
                Contract.sale_id == user.id,
                LeadPipeline.assigned_to == user.id,
            ),
        )
        .first()
    )
    if not related:
        raise HTTPException(status_code=403, detail="Bạn chỉ được xem hợp đồng liên quan đến mình.")


def assert_contract_write_access(db: Session, user: User, contract_id: str) -> None:
    """Enforce all-contract or related-contract write/mutation access at the API boundary."""
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Chưa xác thực người dùng.")
    if user_has_all_contract_read_access(db, user):
        return

    related = (
        db.query(Contract.id)
        .outerjoin(LeadPipeline, LeadPipeline.id == Contract.lead_id)
        .filter(
            Contract.id == contract_id,
            or_(
                Contract.sale_id == user.id,
                LeadPipeline.assigned_to == user.id,
            ),
        )
        .first()
    )
    if not related:
        raise HTTPException(
            status_code=403,
            detail="Bạn không có quyền thao tác trên hợp đồng này.",
        )


def filter_contract_rows_for_user(
    rows: list[dict], user_id: str, has_all_access: bool
) -> list[dict]:
    """Filter cached read-model rows without failing open on missing ownership."""
    if has_all_access:
        return rows
    return [
        row
        for row in rows
        if row.get("sale_id") == user_id or row.get("lead_assignee_id") == user_id
    ]
