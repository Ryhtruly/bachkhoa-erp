import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.core.auth import hash_password
from src.db.models import Employee, Role, User, UserRole
from src.services.email_service import EmailSendError, send_email

DEFAULT_ACCOUNT_ROLE = "employee"
INVITE_TOKEN_TTL_HOURS = 48


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _frontend_base_url() -> str:
    return os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")


def _send_invite_email(user: User, employee_full_name: str, raw_token: str) -> None:
    link = f"{_frontend_base_url()}/set-password?token={raw_token}"
    html = f"""
    <p>Xin chào {employee_full_name},</p>
    <p>Bạn đã được cấp tài khoản trên hệ thống <strong>Bách Khoa ERP</strong>.</p>
    <p>Tên đăng nhập: <strong>{user.username}</strong></p>
    <p>Bấm vào liên kết dưới đây để đặt mật khẩu và kích hoạt tài khoản
    (liên kết hết hạn sau {INVITE_TOKEN_TTL_HOURS} giờ):</p>
    <p><a href="{link}">{link}</a></p>
    <p>Nếu bạn không yêu cầu tài khoản này, vui lòng bỏ qua email này.</p>
    """
    send_email(to=user.email, subject="Kích hoạt tài khoản Bách Khoa ERP", html=html)


def create_employee_account(
    db: Session,
    employee_id: str,
    username: str,
    email: str,
    role_name: str = DEFAULT_ACCOUNT_ROLE,
) -> dict:
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân sự.")
    if employee.user_id:
        raise HTTPException(status_code=409, detail="Nhân sự này đã có tài khoản đăng nhập liên kết.")

    username = username.strip()
    if not username:
        raise HTTPException(status_code=422, detail="Tên đăng nhập không được để trống.")
    email = (email or "").strip()
    if not email:
        raise HTTPException(status_code=422, detail="Cần có email để gửi lời mời đặt mật khẩu.")
    if db.query(User.id).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="Tên đăng nhập đã tồn tại.")
    if db.query(User.id).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email đã được sử dụng bởi tài khoản khác.")

    role = db.query(Role).filter(Role.role_name == role_name).first()
    if not role:
        raise HTTPException(status_code=500, detail=f"Vai trò mặc định '{role_name}' chưa tồn tại trong hệ thống.")

    raw_token = secrets.token_urlsafe(32)
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        password_hash=None,
        email=email,
        is_active=False,
        email_verified=False,
        invite_token_hash=_hash_token(raw_token),
        invite_token_expires_at=datetime.now(timezone.utc) + timedelta(hours=INVITE_TOKEN_TTL_HOURS),
    )
    db.add(user)
    db.flush()

    db.add(UserRole(user_id=user.id, role_id=role.id))
    employee.user_id = user.id

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Không thể tạo tài khoản do dữ liệu liên kết bị trùng hoặc không hợp lệ.",
        )
    db.refresh(user)

    email_sent = True
    try:
        _send_invite_email(user, employee.full_name or username, raw_token)
    except EmailSendError:
        email_sent = False

    return {
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "employee_id": employee.id,
        "role": role.role_name,
        "invite_email_sent": email_sent,
    }


def resend_invite(db: Session, employee_id: str) -> dict:
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee or not employee.user_id:
        raise HTTPException(status_code=404, detail="Nhân sự chưa có tài khoản để gửi lại lời mời.")
    user = db.query(User).filter(User.id == employee.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    if user.email_verified:
        raise HTTPException(status_code=409, detail="Tài khoản đã kích hoạt, không cần gửi lại lời mời.")
    if not user.email:
        raise HTTPException(status_code=422, detail="Tài khoản chưa có email để gửi lời mời.")

    raw_token = secrets.token_urlsafe(32)
    user.invite_token_hash = _hash_token(raw_token)
    user.invite_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_TOKEN_TTL_HOURS)
    db.commit()

    email_sent = True
    try:
        _send_invite_email(user, employee.full_name or user.username, raw_token)
    except EmailSendError:
        email_sent = False

    return {"user_id": user.id, "invite_email_sent": email_sent}


def get_invite_info(db: Session, token: str) -> dict:
    user = db.query(User).filter(User.invite_token_hash == _hash_token(token)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Liên kết không hợp lệ hoặc đã được sử dụng.")
    if user.invite_token_expires_at and user.invite_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Liên kết đã hết hạn. Hãy liên hệ quản trị để gửi lại lời mời.")
    return {"username": user.username, "email": user.email}


def complete_invite(db: Session, token: str, password: str) -> dict:
    user = db.query(User).filter(User.invite_token_hash == _hash_token(token)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Liên kết không hợp lệ hoặc đã được sử dụng.")
    if user.invite_token_expires_at and user.invite_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Liên kết đã hết hạn. Hãy liên hệ quản trị để gửi lại lời mời.")
    if len(password or "") < 6:
        raise HTTPException(status_code=422, detail="Mật khẩu phải có ít nhất 6 ký tự.")

    user.password_hash = hash_password(password)
    user.is_active = True
    user.email_verified = True
    user.invite_token_hash = None
    user.invite_token_expires_at = None
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username}


def set_user_active_status(db: Session, user_id: str, is_active: bool) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    user.is_active = is_active
    db.commit()
    db.refresh(user)
    return {"user_id": user.id, "username": user.username, "is_active": user.is_active}
