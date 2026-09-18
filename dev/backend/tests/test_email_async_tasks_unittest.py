import asyncio
import uuid
from unittest.mock import MagicMock, patch
import pytest
from fastapi import BackgroundTasks

from src.db.models import Employee, Role, User, UserRole
from src.services.email_service import send_email_async, _send_via_gmail_smtp, EmailSendError
from src.user_admin.service import (
    create_employee_account,
    resend_invite,
    _send_invite_email_task,
)


@pytest.fixture
def sample_role(db):
    role = db.query(Role).filter(Role.role_name == "survey_staff").first()
    if not role:
        role = Role(
            role_name="survey_staff",
            display_name="Khảo sát",
            is_active=True,
        )
        db.add(role)
        db.commit()
        db.refresh(role)
    return role


@pytest.fixture
def sample_employee(db):
    emp = Employee(
        id=f"EMP-{uuid.uuid4().hex[:6].upper()}",
        full_name="Nguyễn Văn Test",
        email=f"emp_{uuid.uuid4().hex[:6]}@example.com",
        is_active=True,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def test_create_employee_account_enqueues_background_task(db, sample_role, sample_employee):
    background_tasks = BackgroundTasks()
    username = f"user_{uuid.uuid4().hex[:6]}"
    email = f"{username}@example.com"

    result = create_employee_account(
        db=db,
        employee_id=sample_employee.id,
        username=username,
        email=email,
        role_name=sample_role.role_name,
        background_tasks=background_tasks,
    )

    assert result["username"] == username
    assert result["email"] == email
    assert result["invite_email_sent"] is True

    # Xác nhận task đã được thêm vào background_tasks queue
    assert len(background_tasks.tasks) == 1
    task = background_tasks.tasks[0]
    assert task.func == _send_invite_email_task
    assert task.args[0] == email
    assert task.args[1] == username
    assert task.args[2] == sample_employee.full_name


def test_resend_invite_enqueues_background_task(db, sample_role, sample_employee):
    # Tạo tài khoản trước
    username = f"user_{uuid.uuid4().hex[:6]}"
    email = f"{username}@example.com"
    with patch("src.user_admin.service.send_email"):
        create_employee_account(
            db=db,
            employee_id=sample_employee.id,
            username=username,
            email=email,
            role_name=sample_role.role_name,
        )

    background_tasks = BackgroundTasks()
    result = resend_invite(
        db=db,
        employee_id=sample_employee.id,
        background_tasks=background_tasks,
    )

    assert result["invite_email_sent"] is True
    assert len(background_tasks.tasks) == 1
    task = background_tasks.tasks[0]
    assert task.func == _send_invite_email_task
    assert task.args[0] == email
    assert task.args[1] == username


def test_create_employee_account_sync_fallback(db, sample_role):
    emp = Employee(
        id=f"EMP-{uuid.uuid4().hex[:6].upper()}",
        full_name="Nguyễn Văn Sync",
        email=f"sync_{uuid.uuid4().hex[:6]}@example.com",
        is_active=True,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)

    username = f"user_{uuid.uuid4().hex[:6]}"
    email = f"{username}@example.com"

    # Khi không truyền background_tasks, hàm chạy fallback đồng bộ
    with patch("src.user_admin.service.send_email") as mock_send:
        result = create_employee_account(
            db=db,
            employee_id=emp.id,
            username=username,
            email=email,
            role_name=sample_role.role_name,
            background_tasks=None,
        )
        assert result["invite_email_sent"] is True
        mock_send.assert_called_once()


def test_send_invite_email_task_catches_error_gracefully():
    with patch("src.user_admin.service.send_email", side_effect=RuntimeError("SMTP down")):
        # Không được throw exception ra ngoài làm sập background worker
        _send_invite_email_task("test@example.com", "testuser", "Test User", "raw-token-123")


def test_send_email_async_runs_via_thread():
    with patch("src.services.email_service.send_email") as mock_send:
        asyncio.run(send_email_async("test@example.com", "Tiêu đề test", "<p>Nội dung</p>"))
        mock_send.assert_called_once_with("test@example.com", "Tiêu đề test", "<p>Nội dung</p>")


def test_gmail_app_password_whitespace_stripped(monkeypatch):
    monkeypatch.setattr("src.services.email_service.GMAIL_ADDRESS", "sender@gmail.com")
    monkeypatch.setattr("src.services.email_service.GMAIL_APP_PASSWORD", " abcd efgh ijkl mnop ")

    mock_server = MagicMock()
    with patch("smtplib.SMTP_SSL", return_value=mock_server):
        mock_server.__enter__.return_value = mock_server
        _send_via_gmail_smtp("recipient@example.com", "Subject", "<p>Hello</p>")

        # Kiểm tra mật khẩu đã được tự động strip và xóa khoảng cách
        mock_server.login.assert_called_once_with("sender@gmail.com", "abcdefghijklmnop")
        mock_server.sendmail.assert_called_once()
