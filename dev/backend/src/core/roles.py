"""Canonical application roles and compatibility helpers.

Role names are persisted data, so compatibility aliases are kept here only to
support one-way migrations and diagnostics. Authorization code must use the
canonical sets and must not treat aliases as active roles.
"""

from __future__ import annotations


CANONICAL_ROLE_NAMES = frozenset(
    {
        "admin",
        "accountant",
        "sales",
        "survey_staff",
        "legal_staff",
    }
)

PAYROLL_ALL_ROLE_NAMES = frozenset({"admin", "accountant"})
ACCOUNTANT_ROLE_NAMES = frozenset({"accountant"})

ROLE_ALIASES = {
    "director": "admin",
    "giam_doc": "admin",
    "giám đốc": "admin",
    "kế toán": "accountant",
    "ke_toan": "accountant",
}


def _normalize_role_input(role_name: str | None) -> str:
    return str(role_name or "").strip().casefold()


def canonicalize_role_name(role_name: str | None) -> str | None:
    """Map a stored or legacy role name to its canonical equivalent."""
    value = _normalize_role_input(role_name)
    if not value:
        return None
    return ROLE_ALIASES.get(value, value)


def validate_assignable_role_name(role_name: str | None) -> str:
    """Validate a role that may be assigned to a newly created account.

    Legacy aliases intentionally fail instead of being silently accepted. A
    migration may canonicalize existing rows, but new account provisioning
    must not create more legacy data.
    """
    value = _normalize_role_input(role_name)
    if not value:
        raise ValueError("Role bắt buộc phải được chọn.")
    if value in ROLE_ALIASES:
        raise ValueError(f"Role '{role_name}' là alias cũ và không được phép gán mới.")
    if value not in CANONICAL_ROLE_NAMES:
        allowed = ", ".join(sorted(CANONICAL_ROLE_NAMES))
        raise ValueError(f"Role không hợp lệ. Chỉ được dùng: {allowed}.")
    return value
