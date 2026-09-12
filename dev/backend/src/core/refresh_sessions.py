"""Durable, rotating refresh-token sessions.

Only a SHA-256 digest of the opaque cookie value is stored.  A revoked token
cannot be used again: seeing it after rotation revokes its entire token family
so a stolen cookie cannot continue a session silently.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from src.config.settings import settings
from src.db.models import RefreshSession, User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def cleanup_refresh_sessions(
    db: Session,
    retention_days: int | None = None,
    now: datetime | None = None,
) -> int:
    """Delete refresh-session rows that have been inactive beyond retention."""

    retention = (
        settings.AUTH_REFRESH_SESSION_RETENTION_DAYS
        if retention_days is None
        else retention_days
    )
    if retention < 1:
        raise ValueError("retention_days must be at least 1")

    cutoff = (now or _utc_now()) - timedelta(days=retention)
    stale_filter = or_(
        and_(
            RefreshSession.revoked_at.is_not(None),
            RefreshSession.revoked_at < cutoff,
        ),
        and_(
            RefreshSession.revoked_at.is_(None),
            RefreshSession.expires_at < cutoff,
        ),
    )

    try:
        deleted = (
            db.query(RefreshSession)
            .filter(stale_filter)
            .delete(synchronize_session=False)
        )
        db.commit()
        return int(deleted or 0)
    except Exception:
        db.rollback()
        raise


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _new_raw_token() -> str:
    return secrets.token_urlsafe(48)


def _idle_expiry(now: datetime, absolute_expiry: datetime, remember_me: bool) -> datetime:
    idle_window = (
        timedelta(days=settings.REMEMBER_ME_REFRESH_TOKEN_EXPIRE_DAYS)
        if remember_me
        else timedelta(hours=settings.REFRESH_TOKEN_IDLE_HOURS)
    )
    return min(absolute_expiry, now + idle_window)


def _refresh_invalid() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
    )


def _revoke_family(db: Session, family_id: str, now: datetime) -> int:
    return db.query(RefreshSession).filter(
        RefreshSession.family_id == family_id,
        RefreshSession.revoked_at.is_(None),
    ).update(
        {RefreshSession.revoked_at: now},
        synchronize_session=False,
    )


def issue_refresh_session(
    db: Session,
    user_id: str,
    user_agent: str | None = None,
    ip_address: str | None = None,
    remember_me: bool = False,
) -> tuple[str, RefreshSession]:
    """Create a new token family and return the raw cookie value once."""

    now = _utc_now()
    absolute_days = (
        settings.REMEMBER_ME_REFRESH_TOKEN_EXPIRE_DAYS
        if remember_me
        else settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    absolute_expiry = now + timedelta(days=absolute_days)
    raw_token = _new_raw_token()
    session = RefreshSession(
        id=str(uuid.uuid4()),
        user_id=user_id,
        token_hash=hash_refresh_token(raw_token),
        family_id=str(uuid.uuid4()),
        remember_me=remember_me,
        created_at=now,
        last_used_at=now,
        expires_at=absolute_expiry,
        idle_expires_at=_idle_expiry(now, absolute_expiry, remember_me),
        user_agent=user_agent,
        ip_address=ip_address,
    )
    db.add(session)
    db.commit()
    return raw_token, session


def rotate_refresh_session(
    db: Session,
    raw_token: str,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> tuple[str, RefreshSession]:
    """Atomically consume one token and issue its replacement."""

    now = _utc_now()
    token_hash = hash_refresh_token(raw_token)
    current = (
        db.query(RefreshSession)
        .with_for_update()
        .filter(RefreshSession.token_hash == token_hash)
        .first()
    )
    if not current:
        raise _refresh_invalid()

    if current.revoked_at is not None:
        # A previously rotated token was presented again: revoke the family.
        _revoke_family(db, current.family_id, now)
        db.commit()
        raise _refresh_invalid()

    if now >= (_as_utc(current.expires_at) or now) or now >= (_as_utc(current.idle_expires_at) or now):
        current.revoked_at = now
        db.commit()
        raise _refresh_invalid()

    user = db.query(User).filter(User.id == current.user_id).first()
    if not user or not user.is_active:
        current.revoked_at = now
        db.commit()
        raise _refresh_invalid()

    raw_replacement = _new_raw_token()
    replacement = RefreshSession(
        id=str(uuid.uuid4()),
        user_id=current.user_id,
        token_hash=hash_refresh_token(raw_replacement),
        family_id=current.family_id,
        remember_me=current.remember_me,
        created_at=now,
        last_used_at=now,
        expires_at=current.expires_at,
        idle_expires_at=_idle_expiry(now, _as_utc(current.expires_at) or now, current.remember_me),
        user_agent=user_agent or current.user_agent,
        ip_address=ip_address or current.ip_address,
    )
    db.add(replacement)
    # Insert the replacement first so the optional self-reference on
    # ``replaced_by_id`` is valid even when PostgreSQL checks the FK eagerly.
    db.flush()
    current.revoked_at = now
    current.replaced_by_id = replacement.id
    current.last_used_at = now
    db.commit()
    db.refresh(replacement)
    return raw_replacement, replacement


def revoke_refresh_session(db: Session, raw_token: str | None) -> bool:
    """Revoke the presented token family; invalid logout cookies are harmless."""

    if not raw_token:
        return False
    session = db.query(RefreshSession).filter(
        RefreshSession.token_hash == hash_refresh_token(raw_token),
    ).first()
    if not session:
        return False
    changed = _revoke_family(db, session.family_id, _utc_now())
    db.commit()
    return bool(changed)


def revoke_user_sessions(db: Session, user_id: str) -> int:
    """Invalidate all browser sessions after a password/security change."""

    changed = db.query(RefreshSession).filter(
        RefreshSession.user_id == user_id,
        RefreshSession.revoked_at.is_(None),
    ).update(
        {RefreshSession.revoked_at: _utc_now()},
        synchronize_session=False,
    )
    db.commit()
    return int(changed or 0)
