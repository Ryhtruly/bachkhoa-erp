"""Read-only evaluator for the normalized RBAC tables.

The legacy ``role_permissions`` table remains the production authority while
the normalized grants are rolled out.  This module deliberately performs no
writes so it can be safely used for a shadow comparison.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from src.db.models import Permission, RolePermissionGrant, UserPermissionOverride, UserRole


@dataclass(frozen=True)
class PermissionDecision:
    allowed: bool
    permission_code: str
    scope: str
    reason: str


def _is_active_override(override, now: datetime) -> bool:
    expires_at = getattr(override, "expires_at", None)
    if expires_at is None:
        return True
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at > now


def decide_normalized_permission(
    *,
    resource_codes: Iterable[str],
    action: str,
    role_ids: Iterable[int],
    permissions: Iterable[Permission],
    grants: Iterable[RolePermissionGrant],
    overrides: Iterable[UserPermissionOverride],
    now: Optional[datetime] = None,
) -> Optional[PermissionDecision]:
    """Resolve a normalized grant without mutating persistence.

    ``None`` means the resource/action is not represented by normalized RBAC,
    so callers must preserve their compatibility evaluator's result.
    """
    now = now or datetime.now(timezone.utc)
    requested_resources = set(resource_codes)
    candidates = [
        permission
        for permission in permissions
        if getattr(permission, "is_active", False)
        and getattr(permission, "resource_code", None) in requested_resources
        and getattr(permission, "action_code", None) == action
    ]
    if not candidates:
        return None

    candidate_codes = {permission.code for permission in candidates}
    candidate_by_code = {permission.code: permission for permission in candidates}
    active_overrides = [
        override
        for override in overrides
        if getattr(override, "permission_code", None) in candidate_codes
        and _is_active_override(override, now)
    ]
    denied_override = next(
        (override for override in active_overrides if getattr(override, "effect", "").lower() == "deny"),
        None,
    )
    if denied_override:
        permission = candidate_by_code[denied_override.permission_code]
        return PermissionDecision(False, permission.code, permission.scope_code, "user_override_deny")

    allowed_override = next(
        (override for override in active_overrides if getattr(override, "effect", "").lower() == "allow"),
        None,
    )
    if allowed_override:
        permission = candidate_by_code[allowed_override.permission_code]
        return PermissionDecision(True, permission.code, permission.scope_code, "user_override_allow")

    allowed_roles = set(role_ids)
    matching_grant = next(
        (
            grant
            for grant in grants
            if getattr(grant, "role_id", None) in allowed_roles
            and getattr(grant, "permission_code", None) in candidate_codes
        ),
        None,
    )
    if matching_grant:
        permission = candidate_by_code[matching_grant.permission_code]
        return PermissionDecision(True, permission.code, permission.scope_code, "role_grant")

    permission = candidates[0]
    return PermissionDecision(False, permission.code, permission.scope_code, "no_matching_grant")


def evaluate_normalized_permission(
    db: Session,
    *,
    user_id: str,
    resource_codes: Iterable[str],
    action: str,
) -> Optional[PermissionDecision]:
    """Read current normalized RBAC rows for a user; never writes to the DB."""
    resource_codes = tuple(resource_codes)
    permissions = (
        db.query(Permission)
        .filter(
            Permission.resource_code.in_(resource_codes),
            Permission.action_code == action,
            Permission.is_active.is_(True),
        )
        .all()
    )
    if not permissions:
        return None

    permission_codes = [permission.code for permission in permissions]
    role_ids = [row[0] for row in db.query(UserRole.role_id).filter(UserRole.user_id == user_id).all()]
    grants = (
        db.query(RolePermissionGrant)
        .filter(
            RolePermissionGrant.role_id.in_(role_ids),
            RolePermissionGrant.permission_code.in_(permission_codes),
        )
        .all()
        if role_ids
        else []
    )
    overrides = (
        db.query(UserPermissionOverride)
        .filter(
            UserPermissionOverride.user_id == user_id,
            UserPermissionOverride.permission_code.in_(permission_codes),
        )
        .all()
    )
    return decide_normalized_permission(
        resource_codes=resource_codes,
        action=action,
        role_ids=role_ids,
        permissions=permissions,
        grants=grants,
        overrides=overrides,
    )
