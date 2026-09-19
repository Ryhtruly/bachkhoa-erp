from contextlib import nullcontext
from pathlib import Path

import pytest
from docx import Document
from fastapi import HTTPException
from fastapi import BackgroundTasks
from starlette.requests import Request

from src.config.settings import Settings, _load_secret
from src.contracts.access import filter_contract_rows_for_user
from src.core import redis_utils
from src.core import doc_generator
from src.core.doc_generator import generate_document, sanitize_filename_component
from src.routes import routes_auth
from src.routes.routes_ai import ChatMessage, ChatRequest
from src.routes.routes_webhook import _verify_webhook_signature


def test_production_secret_requires_explicit_long_value():
    with pytest.raises(RuntimeError):
        _load_secret(
            "JWT_SECRET",
            development_default="unsafe-development-only",
            environment="production",
        )


def test_production_rejects_wildcard_credentialed_cors(monkeypatch):
    monkeypatch.setattr(Settings, "ENV", "production")
    monkeypatch.setenv("CORS_ORIGINS", "*")

    with pytest.raises(RuntimeError):
        Settings().cors_origins

    monkeypatch.delenv("CORS_ORIGINS")
    with pytest.raises(RuntimeError):
        Settings().cors_origins


def test_redis_lock_fails_closed_when_redis_is_unavailable(monkeypatch):
    monkeypatch.setattr(redis_utils, "get_redis_client", lambda: None)

    with pytest.raises(HTTPException) as error:
        with redis_utils.redis_distributed_lock("security-test"):
            pass

    assert error.value.status_code == 503


def test_sensitive_filename_component_cannot_escape_output_directory():
    value = sanitize_filename_component(r"..\..\customer:/secret?.docx")

    assert ".." not in value
    assert "/" not in value
    assert "\\" not in value
    assert value.endswith(".docx")


def test_generated_quotation_is_private_and_owner_bound(monkeypatch, tmp_path):
    template_path = tmp_path / "src" / "templates" / "quote.docx"
    template_path.parent.mkdir(parents=True)
    Document().save(template_path)
    output_dir = tmp_path / "private" / "generated_docs"
    monkeypatch.setattr(doc_generator, "BACKEND_DIR", str(tmp_path))
    monkeypatch.setattr(doc_generator, "OUTPUT_DIR", str(output_dir))

    generated, url, output_path = generate_document(
        {"customer_name": "Khách hàng / thử"},
        template_name="quote.docx",
        output_prefix="Quotation",
        owner_id="user-123",
    )

    assert generated is True
    assert "/static/" not in url
    assert "/api/quotations/documents/Quotation_user-123_" in url
    assert Path(output_path).parent == output_dir


def test_business_documents_are_not_public_static_files(client):
    assert client.get("/static/generated_docs/secret.docx").status_code == 404
    assert client.get("/static/generated_quotes/secret.docx").status_code == 404
    assert client.get("/static/contracts/secret.docx").status_code == 404


def test_contract_rows_are_limited_to_related_sales_records():
    rows = [
        {"contract_id": "owned", "sale_id": "sales-user"},
        {"contract_id": "assigned", "lead_assignee_id": "sales-user"},
        {"contract_id": "other", "sale_id": "someone-else"},
        {"contract_id": "unknown"},
    ]

    assert [row["contract_id"] for row in filter_contract_rows_for_user(rows, "sales-user", False)] == [
        "owned",
        "assigned",
    ]
    assert filter_contract_rows_for_user(rows, "accountant", True) == rows


def test_rate_limit_fallback_counts_requests(monkeypatch):
    redis_utils._fallback_store.clear()
    monkeypatch.setattr(redis_utils, "get_redis_client", lambda: None)

    assert redis_utils.consume_rate_limit("security-rate", limit=1, window_seconds=60) == (True, 1)
    assert redis_utils.consume_rate_limit("security-rate", limit=1, window_seconds=60) == (False, 2)


def test_password_reset_request_does_not_disclose_account_state(monkeypatch):
    request = Request({"type": "http", "client": ("127.0.0.1", 1234)})
    body = routes_auth.ForgotPasswordRequestOtpSchema(identifier="unknown@example.com")
    background_tasks = BackgroundTasks()
    monkeypatch.setattr(routes_auth, "consume_rate_limit", lambda *args, **kwargs: (True, 1))
    monkeypatch.setattr(
        routes_auth,
        "prepare_password_reset_otp",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            HTTPException(status_code=404, detail="not found")
        ),
    )

    result = routes_auth.request_otp_route(body, background_tasks, request, db=object())

    assert result == {
        "success": True,
        "message": "Nếu thông tin hợp lệ, mã OTP sẽ được gửi đến email đã đăng ký.",
    }


def test_webhook_signature_rejects_missing_or_invalid_signature(monkeypatch):
    monkeypatch.setattr("src.routes.routes_webhook.settings.WEBHOOK_SHARED_SECRET", "s" * 32)

    with pytest.raises(HTTPException) as missing:
        _verify_webhook_signature(b'{"event":"test"}', None)
    assert missing.value.status_code == 401

    with pytest.raises(HTTPException) as invalid:
        _verify_webhook_signature(b'{"event":"test"}', "sha256=invalid")
    assert invalid.value.status_code == 401


def test_chat_request_limits_history_and_message_size():
    with pytest.raises(Exception):
        ChatRequest(history=[{"role": "user", "content": "x" * 5000}])

    with pytest.raises(Exception):
        ChatRequest(history=[{"role": "user", "content": "ok"}] * 21)

    request = ChatRequest(history=[{"role": "user", "content": "ok"}])
    assert isinstance(request.history[0], ChatMessage)


def test_generated_contracts_are_not_public_static_files(client):
    assert client.get("/static/generated_contracts/confidential_contract.docx").status_code == 404


def test_webhook_freshness_and_nonce_replay(monkeypatch):
    import hmac
    import hashlib
    import time
    from src.routes.routes_webhook import _verify_webhook_signature

    secret = "a" * 32
    monkeypatch.setattr("src.routes.routes_webhook.settings.WEBHOOK_SHARED_SECRET", secret)
    body = b'{"event":"payment_received","amount":1000000}'

    # Missing timestamp should fail
    sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    with pytest.raises(HTTPException) as exc:
        _verify_webhook_signature(body, sig, timestamp=None, nonce="nonce-1")
    assert exc.value.status_code == 401
    assert "timestamp" in exc.value.detail.lower()

    # Expired timestamp should fail
    old_timestamp = str(int(time.time()) - 400)
    valid_sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    with pytest.raises(HTTPException) as exc:
        _verify_webhook_signature(body, valid_sig, timestamp=old_timestamp, nonce="nonce-2")
    assert exc.value.status_code == 401
    assert "timestamp" in exc.value.detail.lower() or "quá hạn" in exc.value.detail.lower()

    # Fresh timestamp with valid signature and nonce succeeds
    import uuid
    unique_nonce = f"nonce-{uuid.uuid4()}"
    now_timestamp = str(int(time.time()))
    fresh_sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert _verify_webhook_signature(body, fresh_sig, timestamp=now_timestamp, nonce=unique_nonce) is True

    # Replaying same nonce fails (raises 409 Conflict)
    with pytest.raises(HTTPException) as exc:
        _verify_webhook_signature(body, fresh_sig, timestamp=now_timestamp, nonce=unique_nonce)
    assert exc.value.status_code in (401, 409)
    assert "nonce" in exc.value.detail.lower() or "replay" in exc.value.detail.lower()


def test_token_revocation_lifecycle():
    from src.core.auth import (
        create_access_token,
        decode_token,
        revoke_access_token,
        revoke_all_user_tokens,
        is_token_revoked,
    )

    token = create_access_token(user_id="test-user-revoke")
    payload = decode_token(token)
    assert payload is not None
    assert "jti" in payload
    jti = payload["jti"]

    assert is_token_revoked(payload) is False

    # Revoke single token
    revoke_access_token(jti, ttl_seconds=3600)
    assert is_token_revoked(payload) is True
    with pytest.raises(HTTPException) as exc:
        decode_token(token)
    assert exc.value.status_code == 401

    # Revoke all user tokens
    token2 = create_access_token(user_id="test-user-revoke-all")
    payload2 = decode_token(token2)
    assert payload2 is not None

    revoke_all_user_tokens("test-user-revoke-all")
    assert is_token_revoked(payload2) is True
    with pytest.raises(HTTPException) as exc2:
        decode_token(token2)
    assert exc2.value.status_code == 401


def test_login_account_enumeration_protection(monkeypatch):
    from src.routes.routes_auth import LoginSchema, login
    from unittest.mock import MagicMock

    req = Request({"type": "http", "client": ("127.0.0.1", 1234)})
    db = MagicMock()

    # Non-existent user
    db.query().filter().first.return_value = None
    with pytest.raises(HTTPException) as exc1:
        login(LoginSchema(username="nonexistent", password="pwd"), MagicMock(), req, db)
    assert exc1.value.status_code == 401
    assert exc1.value.detail == "Sai tên đăng nhập hoặc mật khẩu"

    # Inactive user
    inactive_user = MagicMock()
    inactive_user.is_active = False
    db.query().filter().first.return_value = inactive_user
    with pytest.raises(HTTPException) as exc2:
        login(LoginSchema(username="inactive_user", password="pwd"), MagicMock(), req, db)
    assert exc2.value.status_code == 401
    assert exc2.value.detail == "Sai tên đăng nhập hoặc mật khẩu"


def test_advance_settlement_rejects_non_advance_transaction(monkeypatch):
    from unittest.mock import MagicMock
    from src.finance.services import FinanceService
    from src.db.models import CashflowTransaction

    db = MagicMock()
    non_advance_tx = MagicMock(spec=CashflowTransaction)
    non_advance_tx.transaction_type = "EXPENSE"
    non_advance_tx.status = "APPROVED"

    db.query().filter().first.return_value = non_advance_tx
    payload = MagicMock()
    payload.advance_id = "tx-non-advance"
    payload.actual_spent = 500000
    payload.note = "Quyết toán thử"

    with pytest.raises(HTTPException) as exc:
        FinanceService.clear_advance(
            db=db,
            payload=payload,
            actor_id="director-1",
        )
    assert exc.value.status_code == 400
    assert "ADVANCE" in exc.value.detail
    assert exc.value.status_code == 400
    assert "ADVANCE" in exc.value.detail


def test_config_endpoint_requires_authentication(client):
    res = client.get("/api/config")
    assert res.status_code == 401


def test_redact_redis_url():
    from src.core.redis_utils import _redact_redis_url

    assert _redact_redis_url("redis://:supersecret@127.0.0.1:6379/0") == "redis://:***@127.0.0.1:6379/0"
    assert _redact_redis_url("redis://admin:supersecret@redis.internal:6379/1") == "redis://admin:***@redis.internal:6379/1"
    assert _redact_redis_url("redis://127.0.0.1:6379/0") == "redis://127.0.0.1:6379/0"
    assert _redact_redis_url("") == ""


def test_production_credential_fallbacks(monkeypatch):
    from src.services.storage_service import get_object_storage_config

    # Weak PG_PASSWORD rejected in production
    monkeypatch.setattr(Settings, "ENV", "production")
    monkeypatch.setattr(Settings, "PG_PASSWORD", "123")
    with pytest.raises(RuntimeError):
        Settings().DATABASE_URL

    # Weak object storage credentials rejected in production
    with pytest.raises(RuntimeError):
        get_object_storage_config({
            "ENV": "production",
            "OBJECT_STORAGE_ACCESS_KEY": "minioadmin",
            "OBJECT_STORAGE_SECRET_KEY": "minioadmin",
        })


def test_contract_documents_access_guard_rejects_unauthorized_user(monkeypatch):
    from unittest.mock import MagicMock
    from src.routes.routes_document_register import _assert_can_access_contract_documents

    monkeypatch.setattr("src.routes.routes_document_register.user_has_all_contract_read_access", lambda db, user: False)
    monkeypatch.setattr("src.routes.routes_document_register._can_work_on_contract", lambda db, user, cid: False)
    monkeypatch.setattr("src.routes.routes_document_register.assert_contract_read_access", lambda db, user, cid: (_ for _ in ()).throw(HTTPException(403, detail="Không có quyền truy cập")))

    db = MagicMock()
    user = MagicMock()
    user.id = "unauthorized-user"
    user.role = "staff"

    # User has contract.read, but is not director and not assigned to contract
    with pytest.raises(HTTPException) as exc:
        _assert_can_access_contract_documents(db, user, "CT-SECRET-999")
    assert exc.value.status_code == 403
    assert "quyền" in exc.value.detail.lower()


def test_debt_reminders_requires_finance_update_permission():
    import inspect
    from src.routes.routes_webhook import trigger_debt_reminders

    sig = inspect.signature(trigger_debt_reminders)
    user_param = sig.parameters["user"]
    dep_func = user_param.default.dependency
    closure_vars = {c.cell_contents for c in dep_func.__closure__ if hasattr(c, "cell_contents")}
    assert "finance" in closure_vars
    assert "update" in closure_vars


