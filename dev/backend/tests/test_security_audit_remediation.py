import html
import uuid
from types import SimpleNamespace
from unittest.mock import patch, MagicMock
import pytest

from src.core.auth import (
    check_user_permission,
    is_payroll_all_user,
    is_accountant_user,
    create_access_token,
    hash_password,
)
from src.db.models import User, Role, UserRole
from src.services import telegram_service


def test_finding_1_ai_planning_uses_asyncio_to_thread(client, admin_headers):
    """Verify analyze_planning endpoint offloads CPU/blocking work to thread pool via asyncio.to_thread."""
    with patch("src.routes.routes_ai.asyncio.to_thread") as mock_to_thread:
        mock_to_thread.return_value = {
            "file_name": "test_map.pdf",
            "extracted_coordinates": "X: 123, Y: 456",
            "planning_status": "ODT",
            "warnings": None,
            "ai_confidence": 0.99,
        }

        files = {"file": ("test_map.pdf", b"%PDF-1.4 mock content", "application/pdf")}
        response = client.post("/api/ai/analyze-planning", files=files, headers=admin_headers)

        assert response.status_code == 200
        assert mock_to_thread.called
        # First argument to asyncio.to_thread should be ai_vision_engine.analyze_planning_document
        target_fn, target_arg = mock_to_thread.call_args[0]
        assert target_fn.__name__ == "analyze_planning_document"
        assert target_arg == "test_map.pdf"


def test_finding_2_telegram_service_parse_mode_and_autodetect():
    """Verify telegram_service accepts parse_mode and auto-detects HTML tags."""
    with patch("src.services.telegram_service.requests.post") as mock_post:
        mock_post.return_value.raise_for_status = MagicMock()
        mock_post.return_value.status_code = 200

        # 1. Explicit parse_mode="HTML"
        with patch.object(telegram_service, "TELEGRAM_BOT_TOKEN", "REAL_TEST_TOKEN"):
            telegram_service.send_telegram_message("<b>Bold Alert</b>", parse_mode="HTML")
            assert mock_post.called
            payload = mock_post.call_args[1]["json"]
            assert payload["parse_mode"] == "HTML"
            assert payload["text"] == "<b>Bold Alert</b>"

        # 2. Auto-detect HTML when parse_mode is None
        mock_post.reset_mock()
        with patch.object(telegram_service, "TELEGRAM_BOT_TOKEN", "REAL_TEST_TOKEN"):
            telegram_service.send_telegram_message("<i>Italic Notification</i>")
            payload = mock_post.call_args[1]["json"]
            assert payload["parse_mode"] == "HTML"

        # 3. Default to Markdown when no HTML tags present
        mock_post.reset_mock()
        with patch.object(telegram_service, "TELEGRAM_BOT_TOKEN", "REAL_TEST_TOKEN"):
            telegram_service.send_telegram_message("*Markdown Bold*")
            payload = mock_post.call_args[1]["json"]
            assert payload["parse_mode"] == "Markdown"


def test_finding_2_intake_lead_escapes_html_and_specifies_html_mode(client):
    """Verify /api/intake/lead escapes user input in telegram message and sets parse_mode='HTML'."""
    with patch("src.services.telegram_service.send_telegram_message") as mock_send_tele:
        malicious_input = {
            "customer_name": "Nguyen <script>alert('XSS')</script> & Son",
            "phone": "0987654321",
            "service_type": "Do ve <b>bold</b>",
            "scale_info": "100m2 <br> test",
            "target_property_address": "123 Duong & Hem <45>",
            "notes": "Chu y: \"Nha mat pho\" & 'Gia re'",
            "source": "Web <Form>"
        }

        response = client.post("/api/intake/lead", json=malicious_input)
        assert response.status_code == 200

        assert mock_send_tele.called
        sent_msg = mock_send_tele.call_args[0][0]
        kwargs = mock_send_tele.call_args[1]

        # Verify parse_mode is explicitly HTML
        assert kwargs.get("parse_mode") == "HTML"

        # Verify dangerous HTML characters are escaped in telegram message
        assert "<script>" not in sent_msg
        assert "&lt;script&gt;" in sent_msg
        assert "&amp;" in sent_msg
        assert "&lt;45&gt;" in sent_msg
        assert "&quot;Nha mat pho&quot;" in sent_msg or "Nha mat pho" in sent_msg


def test_finding_3_no_username_bypass_without_admin_role(db):
    """Verify that a user with username 'admin' but NO admin role in DB is strictly REJECTED (no backdoor)."""
    fake_admin = User(
        id=str(uuid.uuid4()),
        username="admin",
        password_hash=hash_password("fake123"),
        email="fake_admin@test.local",
        is_active=True,
    )
    # Without UserRole record in DB, username 'admin' alone cannot bypass security
    assert check_user_permission(db, fake_admin, "contracts", "update") is False
    assert check_user_permission(db, fake_admin, "finance", "approve") is False
    assert is_payroll_all_user(db, fake_admin) is False
    assert is_accountant_user(db, fake_admin) is False


def test_finding_3_user_with_admin_role_is_granted_access(db):
    """Verify that a user with the actual admin role in UserRole is granted administrative access regardless of username."""
    unique_user_id = str(uuid.uuid4())
    custom_admin = User(
        id=unique_user_id,
        username=f"ceo_executive_{uuid.uuid4().hex[:6]}",
        password_hash=hash_password("pass123"),
        email="ceo@test.local",
        is_active=True,
    )
    db.add(custom_admin)
    db.flush()

    from sqlalchemy import func
    admin_role = db.query(Role).filter(func.lower(Role.role_name) == "admin").first()
    role_created = False
    if not admin_role:
        max_id = db.query(func.max(Role.id)).scalar() or 0
        admin_role = Role(id=max_id + 1, role_name="admin", is_active=True)
        db.add(admin_role)
        db.flush()
        role_created = True

    user_role = UserRole(user_id=custom_admin.id, role_id=admin_role.id)
    db.add(user_role)
    db.commit()

    try:
        # User has role 'admin', so they should pass admin checks
        assert is_payroll_all_user(db, custom_admin) is True
        assert is_accountant_user(db, custom_admin) is True
        # For check_user_permission, admin role has superuser grants
        assert check_user_permission(db, custom_admin, "finance", "read") is True
        assert check_user_permission(db, custom_admin, "contracts", "update") is True
    finally:
        db.query(UserRole).filter(UserRole.user_id == custom_admin.id).delete()
        db.delete(custom_admin)
        if role_created:
            db.delete(admin_role)
        db.commit()
