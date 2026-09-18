import uuid
from unittest.mock import patch
import pytest

from src.core.auth import hash_password, verify_password
from src.core.redis_utils import get_cached_json, set_cached_json, invalidate_cache
from src.core import redis_utils
from src.db.models import User
from src.user_admin.service import _hash_token


@pytest.fixture(autouse=True)
def clear_process_local_rate_limits(monkeypatch):
    # Redis is intentionally optional in this local test mode. Keep fallback
    # rate-limit state isolated so one test cannot consume another test's IP
    # quota.
    monkeypatch.setattr(redis_utils, "get_redis_client", lambda: None)
    redis_utils._fallback_store.clear()
    yield
    redis_utils._fallback_store.clear()


@pytest.fixture
def test_user(db):
    uid = uuid.uuid4().hex[:8]
    user = User(
        id=str(uuid.uuid4()),
        username=f"user_{uid}",
        password_hash=hash_password("oldpassword123"),
        email=f"user_{uid}@example.com",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_forgot_password_request_otp_success(client, db, test_user):
    with patch("src.user_admin.service.send_email"):
        res = client.post(
            "/api/auth/forgot-password/request-otp",
            json={"identifier": test_user.username},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["email_sent"] is True

        cached_otp = get_cached_json(f"bachkhoa:auth:otp:{test_user.id}")
        assert cached_otp is not None
        assert cached_otp["attempts"] == 0
        assert "otp_hash" in cached_otp


def test_forgot_password_request_otp_via_email(client, db, test_user):
    with patch("src.user_admin.service.send_email"):
        res = client.post(
            "/api/auth/forgot-password/request-otp",
            json={"identifier": test_user.email.upper()},
        )
        assert res.status_code == 200
        assert res.json()["success"] is True


def test_forgot_password_request_otp_not_found(client):
    res = client.post(
        "/api/auth/forgot-password/request-otp",
        json={"identifier": "nonexistent_user_xyz"},
    )
    assert res.status_code == 200
    assert res.json() == {
        "success": True,
        "message": "Nếu thông tin hợp lệ, mã OTP sẽ được gửi đến email đã đăng ký.",
        "email_sent": False,
    }


def test_forgot_password_request_otp_inactive_user(client, db):
    user = User(
        id=str(uuid.uuid4()),
        username=f"inactive_{uuid.uuid4().hex[:6]}",
        password_hash=hash_password("password123"),
        email="inactive@example.com",
        is_active=False,
    )
    db.add(user)
    db.commit()

    res = client.post(
        "/api/auth/forgot-password/request-otp",
        json={"identifier": user.username},
    )
    assert res.status_code == 200
    assert res.json()["email_sent"] is False


def test_forgot_password_request_otp_no_email(client, db):
    user = User(
        id=str(uuid.uuid4()),
        username=f"no_email_{uuid.uuid4().hex[:6]}",
        password_hash=hash_password("password123"),
        email=None,
        is_active=True,
    )
    db.add(user)
    db.commit()

    res = client.post(
        "/api/auth/forgot-password/request-otp",
        json={"identifier": user.username},
    )
    assert res.status_code == 200
    assert res.json()["email_sent"] is False


def test_forgot_password_resend_is_throttled(client, db, test_user, monkeypatch):
    monkeypatch.setattr("src.routes.routes_auth.consume_rate_limit", lambda *args, **kwargs: (True, 1))
    with patch("src.user_admin.service.send_email"):
        # First request
        res1 = client.post("/api/auth/forgot-password/request-otp", json={"identifier": test_user.username})
        assert res1.status_code == 200
        cached1 = get_cached_json(f"bachkhoa:auth:otp:{test_user.id}")

        # A second request within the cooldown window must not overwrite the
        # valid OTP or create an email-spam primitive.
        res2 = client.post("/api/auth/forgot-password/request-otp", json={"identifier": test_user.username})
        assert res2.status_code == 429


def test_forgot_password_verify_otp(client, db, test_user):
    otp = "123456"
    set_cached_json(
        f"bachkhoa:auth:otp:{test_user.id}",
        {"otp_hash": _hash_token(otp), "attempts": 0, "user_id": test_user.id},
        ttl_seconds=600,
    )

    # Wrong OTP
    res_wrong = client.post(
        "/api/auth/forgot-password/verify-otp",
        json={"identifier": test_user.username, "otp": "999999"},
    )
    assert res_wrong.status_code == 400
    assert "không chính xác" in res_wrong.json()["detail"]

    cached = get_cached_json(f"bachkhoa:auth:otp:{test_user.id}")
    assert cached["attempts"] == 0
    assert get_cached_json(f"bachkhoa:auth:otp-attempts:{test_user.id}") is not None

    # Correct OTP with whitespace
    res_ok = client.post(
        "/api/auth/forgot-password/verify-otp",
        json={"identifier": test_user.username, "otp": "  123456  "},
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["valid"] is True


def test_forgot_password_verify_otp_max_attempts(client, db, test_user):
    set_cached_json(
        f"bachkhoa:auth:otp:{test_user.id}",
        {"otp_hash": _hash_token("123456"), "attempts": 5, "user_id": test_user.id},
        ttl_seconds=600,
    )

    res = client.post(
        "/api/auth/forgot-password/verify-otp",
        json={"identifier": test_user.username, "otp": "123456"},
    )
    assert res.status_code == 429
    assert "bị khóa" in res.json()["detail"]


def test_forgot_password_verify_otp_expired(client, db, test_user):
    invalidate_cache(f"bachkhoa:auth:otp:{test_user.id}")

    res = client.post(
        "/api/auth/forgot-password/verify-otp",
        json={"identifier": test_user.username, "otp": "123456"},
    )
    assert res.status_code == 400
    assert "hết hiệu lực" in res.json()["detail"] or "hết hạn" in res.json()["detail"]


def test_forgot_password_reset_password_success(client, db, test_user):
    otp = "654321"
    set_cached_json(
        f"bachkhoa:auth:otp:{test_user.id}",
        {"otp_hash": _hash_token(otp), "attempts": 0, "user_id": test_user.id},
        ttl_seconds=600,
    )

    res = client.post(
        "/api/auth/forgot-password/reset-password",
        json={
            "identifier": test_user.username,
            "otp": otp,
            "new_password": "new_secret_password_123",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "token" in data
    assert data["user"]["username"] == test_user.username

    db.refresh(test_user)
    assert verify_password("new_secret_password_123", test_user.password_hash)
    assert get_cached_json(f"bachkhoa:auth:otp:{test_user.id}") is None


def test_forgot_password_replay_attack_prevention(client, db, test_user):
    otp = "654321"
    set_cached_json(
        f"bachkhoa:auth:otp:{test_user.id}",
        {"otp_hash": _hash_token(otp), "attempts": 0, "user_id": test_user.id},
        ttl_seconds=600,
    )

    # First reset (success)
    res1 = client.post(
        "/api/auth/forgot-password/reset-password",
        json={
            "identifier": test_user.username,
            "otp": otp,
            "new_password": "new_secret_password_123",
        },
    )
    assert res1.status_code == 200

    # Second reset with the SAME OTP (must fail because OTP key is deleted)
    res2 = client.post(
        "/api/auth/forgot-password/reset-password",
        json={
            "identifier": test_user.username,
            "otp": otp,
            "new_password": "attacker_hijack_password_456",
        },
    )
    assert res2.status_code == 400


def test_forgot_password_reset_password_too_short(client, db, test_user):
    otp = "654321"
    set_cached_json(
        f"bachkhoa:auth:otp:{test_user.id}",
        {"otp_hash": _hash_token(otp), "attempts": 0, "user_id": test_user.id},
        ttl_seconds=600,
    )

    res = client.post(
        "/api/auth/forgot-password/reset-password",
        json={
            "identifier": test_user.username,
            "otp": otp,
            "new_password": "123",
        },
    )
    assert res.status_code == 422


def test_change_password_success(client, db, unprivileged_user):
    user, headers = unprivileged_user
    res = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={
            "current_password": "password123",
            "new_password": "brand_new_password_456",
        },
    )
    assert res.status_code == 200
    assert res.json()["success"] is True

    db.refresh(user)
    assert verify_password("brand_new_password_456", user.password_hash)


def test_change_password_unauthenticated(client):
    res = client.post(
        "/api/auth/change-password",
        json={
            "current_password": "password123",
            "new_password": "brand_new_password_456",
        },
    )
    assert res.status_code in (401, 403)


def test_change_password_wrong_current(client, unprivileged_user):
    user, headers = unprivileged_user
    res = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={
            "current_password": "wrong_password",
            "new_password": "brand_new_password_456",
        },
    )
    assert res.status_code == 400
    assert "Mật khẩu hiện tại không chính xác" in res.json()["detail"]


def test_change_password_same_password(client, unprivileged_user):
    user, headers = unprivileged_user
    res = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={
            "current_password": "password123",
            "new_password": "password123",
        },
    )
    assert res.status_code == 400
    assert "không được trùng" in res.json()["detail"]


def test_change_password_too_short(client, unprivileged_user):
    user, headers = unprivileged_user
    res = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={
            "current_password": "password123",
            "new_password": "123",
        },
    )
    assert res.status_code == 422
