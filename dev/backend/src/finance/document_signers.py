"""Shared defaults and validation for names printed on finance documents."""

import json
from datetime import datetime, timezone
from typing import Any, Mapping


DEFAULT_DOCUMENT_SIGNERS = {
    "director_name": "Lê Văn Sáu",
    "accountant_name": "",
    "accountant_role": "Kế toán trưởng",
    "cashier_name": "",
    "payroll_accountant_name": "",
}

DOCUMENT_SIGNER_KEYS = tuple(DEFAULT_DOCUMENT_SIGNERS)
SUPPORTED_ACCOUNTANT_ROLES = {"Kế toán trưởng", "Kế toán phụ trách"}
MAX_SIGNER_NAME_LENGTH = 120
SIGNER_SNAPSHOT_METADATA_KEYS = ("captured_at", "captured_by")


def normalize_document_signers(payload: Mapping[str, Any] | None) -> dict[str, str]:
    source = payload or {}
    result = dict(DEFAULT_DOCUMENT_SIGNERS)

    for key in DOCUMENT_SIGNER_KEYS:
        value = source.get(key, result[key])
        if value is None:
            value = ""
        value = str(value).strip()[:MAX_SIGNER_NAME_LENGTH]
        result[key] = value

    if result["accountant_role"] not in SUPPORTED_ACCOUNTANT_ROLES:
        result["accountant_role"] = DEFAULT_DOCUMENT_SIGNERS["accountant_role"]

    return result


def decode_document_signers(raw_value: str | None) -> dict[str, str]:
    if not raw_value:
        return dict(DEFAULT_DOCUMENT_SIGNERS)

    try:
        decoded = json.loads(raw_value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return dict(DEFAULT_DOCUMENT_SIGNERS)

    if not isinstance(decoded, dict):
        return dict(DEFAULT_DOCUMENT_SIGNERS)

    return normalize_document_signers(decoded)


def create_document_signer_snapshot(
    signers: Mapping[str, Any] | None,
    *,
    captured_by: str | None = None,
    captured_at: datetime | None = None,
    creator: Mapping[str, Any] | str | None = None,
    recipient: Mapping[str, Any] | str | None = None,
    counterparty: Mapping[str, Any] | str | None = None,
) -> dict[str, str | None]:
    """Create an immutable, serializable signer snapshot for a finance document."""
    timestamp = captured_at or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)

    normalized = normalize_document_signers(signers)
    snapshot = {
        **normalized,
        "captured_at": timestamp.isoformat(),
        "captured_by": str(captured_by) if captured_by else None,
    }
    _merge_person_snapshot(snapshot, "creator", creator, "user_id")
    _merge_person_snapshot(snapshot, "recipient", recipient, "employee_id")
    _merge_person_snapshot(snapshot, "counterparty", counterparty, "id")
    return snapshot


def normalize_document_signer_snapshot(value: Any) -> dict[str, str | None] | None:
    """Return a safe snapshot shape, or None for legacy rows without one."""
    if not isinstance(value, Mapping):
        return None

    normalized = create_document_signer_snapshot(
        value,
        captured_by=value.get("captured_by"),
        captured_at=_parse_snapshot_timestamp(value.get("captured_at")),
        creator=_person_from_snapshot(value, "creator", "user_id"),
        recipient=_person_from_snapshot(value, "recipient", "employee_id"),
        counterparty=_person_from_snapshot(value, "counterparty", "id"),
    )
    return normalized


def _merge_person_snapshot(
    snapshot: dict[str, str | None],
    prefix: str,
    value: Mapping[str, Any] | str | None,
    identity_key: str,
) -> None:
    if value is None:
        return
    source = value if isinstance(value, Mapping) else {"name": value}
    identity = source.get(identity_key) or source.get("id")
    name = source.get("name") or source.get("full_name")
    role = source.get("role") or source.get("job_title")
    department = source.get("department")
    if identity:
        snapshot[f"{prefix}_{identity_key}"] = str(identity).strip()[:120]
    if name:
        snapshot[f"{prefix}_name"] = str(name).strip()[:MAX_SIGNER_NAME_LENGTH]
    if role:
        snapshot[f"{prefix}_role"] = str(role).strip()[:MAX_SIGNER_NAME_LENGTH]
    if department:
        snapshot[f"{prefix}_department"] = str(department).strip()[:MAX_SIGNER_NAME_LENGTH]


def _person_from_snapshot(value: Mapping[str, Any], prefix: str, identity_key: str) -> dict[str, Any] | None:
    fields = {
        identity_key: value.get(f"{prefix}_{identity_key}"),
        "name": value.get(f"{prefix}_name"),
        "role": value.get(f"{prefix}_role"),
        "department": value.get(f"{prefix}_department"),
    }
    return fields if any(fields.values()) else None


def _parse_snapshot_timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
