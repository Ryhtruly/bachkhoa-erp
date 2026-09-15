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
        "email_sent": False,
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
