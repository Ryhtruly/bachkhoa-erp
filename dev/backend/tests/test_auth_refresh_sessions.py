import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from src.config.settings import settings
from src.core.auth import hash_password
from src.core import refresh_sessions as refresh_session_service
from src.core.refresh_sessions import (
    hash_refresh_token,
    issue_refresh_session,
    revoke_user_sessions,
    rotate_refresh_session,
)
from src.db.models import RefreshSession, User


def _create_user(db):
    user = User(
        id=str(uuid.uuid4()),
        username=f"refresh_{uuid.uuid4().hex[:8]}",
        password_hash=hash_password("password123"),
        email=f"refresh_{uuid.uuid4().hex[:8]}@test.local",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_issue_refresh_session_stores_only_a_hash(db):
    user = _create_user(db)

    raw_token, session = issue_refresh_session(
        db,
        user_id=user.id,
        user_agent="pytest",
        ip_address="127.0.0.1",
    )

    assert raw_token
    assert session.user_id == user.id
    assert session.token_hash == hash_refresh_token(raw_token)
    assert session.token_hash != raw_token
    assert session.revoked_at is None
    assert session.family_id


def test_rotate_refresh_session_rotates_token_and_rejects_reuse(db):
    user = _create_user(db)
    old_token, old_session = issue_refresh_session(db, user.id)

    new_token, new_session = rotate_refresh_session(db, old_token)

    assert new_token != old_token
    assert new_session.id != old_session.id
    assert new_session.family_id == old_session.family_id
    assert db.get(type(old_session), old_session.id).revoked_at is not None

    with pytest.raises(HTTPException) as error:
        rotate_refresh_session(db, old_token)

    assert error.value.status_code == 401
    assert db.get(type(new_session), new_session.id).revoked_at is not None


def test_revoke_user_sessions_revokes_all_families(db):
    user = _create_user(db)
    first_token, first_session = issue_refresh_session(db, user.id)
    second_token, second_session = issue_refresh_session(db, user.id)

    revoked = revoke_user_sessions(db, user.id)

    assert revoked == 2
    assert db.get(type(first_session), first_session.id).revoked_at is not None
    assert db.get(type(second_session), second_session.id).revoked_at is not None


def test_expired_or_disabled_refresh_session_is_rejected(db):
    user = _create_user(db)
    expired_token, expired_session = issue_refresh_session(db, user.id)
    expired_session.idle_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()

    with pytest.raises(HTTPException) as expired_error:
        rotate_refresh_session(db, expired_token)
    assert expired_error.value.status_code == 401
    assert db.get(type(expired_session), expired_session.id).revoked_at is not None

    disabled_token, disabled_session = issue_refresh_session(db, user.id)
    user.is_active = False
    db.commit()

    with pytest.raises(HTTPException) as disabled_error:
        rotate_refresh_session(db, disabled_token)
    assert disabled_error.value.status_code == 401
    assert db.get(type(disabled_session), disabled_session.id).revoked_at is not None


def test_cleanup_refresh_sessions_removes_only_rows_older_than_retention(db):
    user = _create_user(db)
    now = datetime(2026, 9, 12, tzinfo=timezone.utc)

    _, stale_revoked = issue_refresh_session(db, user.id)
    stale_revoked.revoked_at = now - timedelta(days=31)
    stale_revoked.expires_at = now + timedelta(days=1)

    _, stale_expired = issue_refresh_session(db, user.id)
    stale_expired.revoked_at = None
    stale_expired.expires_at = now - timedelta(days=31)

    _, recent_revoked = issue_refresh_session(db, user.id)
    recent_revoked.revoked_at = now - timedelta(days=29)
    recent_revoked.expires_at = now - timedelta(days=40)

    _, current_session = issue_refresh_session(db, user.id)
    current_session.expires_at = now + timedelta(days=7)
    db.commit()
    stale_revoked_id = stale_revoked.id
    stale_expired_id = stale_expired.id
    recent_revoked_id = recent_revoked.id
    current_session_id = current_session.id

    deleted = refresh_session_service.cleanup_refresh_sessions(
        db,
        retention_days=30,
        now=now,
    )

    assert deleted == 2
    assert db.get(RefreshSession, stale_revoked_id) is None
    assert db.get(RefreshSession, stale_expired_id) is None
    assert db.get(RefreshSession, recent_revoked_id) is not None
    assert db.get(RefreshSession, current_session_id) is not None


def test_login_and_refresh_rotate_httponly_cookie(client, db):
    client.cookies.clear()


def test_login_remember_me_uses_longer_cookie_and_persists_policy(client, db):
    client.cookies.clear()
    user = _create_user(db)

    response = client.post(
        "/api/auth/login",
        json={
            "username": user.username,
            "password": "password123",
            "remember_me": True,
        },
    )

    assert response.status_code == 200
    assert f"max-age={settings.REMEMBER_ME_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60}" in response.headers["set-cookie"].lower()
    session = db.query(RefreshSession).filter(RefreshSession.user_id == user.id).one()
    assert session.remember_me is True
    assert client.post("/api/auth/refresh").status_code == 200
    client.cookies.clear()
    user = _create_user(db)

    login_response = client.post(
        "/api/auth/login",
        json={"username": user.username, "password": "password123"},
    )

    assert login_response.status_code == 200
    assert "httponly" in login_response.headers["set-cookie"].lower()
    first_token = login_response.json()["token"]
    old_cookie = client.cookies.get(settings.AUTH_COOKIE_NAME)

    refresh_response = client.post("/api/auth/refresh")

    assert refresh_response.status_code == 200
    assert refresh_response.json()["token"]
    new_cookie = client.cookies.get(settings.AUTH_COOKIE_NAME)
    assert new_cookie != old_cookie

    client.cookies.clear()
    client.cookies.set(settings.AUTH_COOKIE_NAME, old_cookie, path="/api/auth")
    reuse_response = client.post("/api/auth/refresh")
    assert reuse_response.status_code == 401

    client.cookies.clear()


def test_logout_revokes_the_refresh_session(client, db):
    client.cookies.clear()
    user = _create_user(db)
    login_response = client.post(
        "/api/auth/login",
        json={"username": user.username, "password": "password123"},
    )
    assert login_response.status_code == 200

    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {"ok": True}
    assert client.post("/api/auth/refresh").status_code == 401
    client.cookies.clear()


def test_refresh_rejects_an_unallowed_browser_origin(client, db):
    client.cookies.clear()
    user = _create_user(db)
    assert client.post(
        "/api/auth/login",
        json={"username": user.username, "password": "password123"},
    ).status_code == 200

    blocked = client.post(
        "/api/auth/refresh",
        headers={"Origin": "https://malicious.example"},
    )
    assert blocked.status_code == 403

    # The rejected request must not consume the valid browser session.
    assert client.post("/api/auth/refresh").status_code == 200
    client.cookies.clear()
