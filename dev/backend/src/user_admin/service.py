import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import logging

from src.core.auth import hash_password, verify_password
from src.core.redis_utils import get_cached_json, set_cached_json, invalidate_cache
from src.core.roles import validate_assignable_role_name
from src.db.models import Employee, Role, User, UserRole
from src.services.email_service import EmailSendError, send_email

logger = logging.getLogger(__name__)

INVITE_TOKEN_TTL_HOURS = 48
OTP_TTL_MINUTES = 10
MAX_OTP_ATTEMPTS = 5


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _frontend_base_url() -> str:
    return os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")


def _mask_email(email: str) -> str:
    if not email or "@" not in email:
        return email or ""
    local_part, domain = email.split("@", 1)
    if len(local_part) <= 2:
        masked_local = local_part[0] + "***"
    else:
        masked_local = local_part[:2] + "***" + local_part[-1]
    return f"{masked_local}@{domain}"


def _is_expired(dt: datetime | None) -> bool:
    if not dt:
        return True
    if dt.tzinfo is None:
        return dt < datetime.now(timezone.utc).replace(tzinfo=None)
    return dt < datetime.now(timezone.utc)


def _find_user_by_identifier(db: Session, identifier: str) -> User | None:
    ident = (identifier or "").strip()
    if not ident:
        return None
    return db.query(User).filter(
        (User.username == ident) | (User.email.ilike(ident))
    ).first()


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
    role_name: str,
) -> dict:
    try:
        role_name = validate_assignable_role_name(role_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

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

    role = db.query(Role).filter(Role.role_name == role_name, Role.is_active.is_(True)).first()
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
    if _is_expired(user.invite_token_expires_at):
        raise HTTPException(status_code=410, detail="Liên kết đã hết hạn. Hãy liên hệ quản trị để gửi lại lời mời.")
    return {"username": user.username, "email": user.email}


def complete_invite(db: Session, token: str, password: str) -> dict:
    user = db.query(User).filter(User.invite_token_hash == _hash_token(token)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Liên kết không hợp lệ hoặc đã được sử dụng.")
    if _is_expired(user.invite_token_expires_at):
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


def _send_reset_otp_email_task(user_email: str, username: str, otp: str) -> None:
    try:
        html = f"""
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
            <h2 style="color: #E86832; margin-top: 0;">Mã xác thực đặt lại mật khẩu</h2>
            <p>Xin chào <strong>{username}</strong>,</p>
            <p>Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản trên hệ thống <strong>Bách Khoa ERP</strong>.</p>
            <p>Mã OTP xác thực của bạn là:</p>
            <div style="text-align: center; margin: 24px 0;">
                <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #172033; background: #f1f5f9; padding: 12px 24px; border-radius: 8px; border: 1px dashed #cbd5e1;">{otp}</span>
            </div>
            <p style="color: #64748b; font-size: 14px;">Mã này có hiệu lực trong vòng <strong>{OTP_TTL_MINUTES} phút</strong>. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.</p>
            <p style="color: #94a3b8; font-size: 13px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email hoặc liên hệ quản trị viên.</p>
        </div>
        """
        send_email(to=user_email, subject="Mã OTP đặt lại mật khẩu Bách Khoa ERP", html=html)
    except Exception as exc:
        logger.warning("Không thể gửi email OTP đặt lại mật khẩu cho %s: %s", user_email, exc)


def _send_reset_otp_email(user: User, otp: str) -> None:
    _send_reset_otp_email_task(user.email, user.username, otp)


def prepare_password_reset_otp(db: Session, identifier: str) -> tuple[dict, User, str]:
    user = _find_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản với thông tin đã nhập.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản này đã bị vô hiệu hoá. Vui lòng liên hệ quản trị viên.")
    if not user.email:
        raise HTTPException(
            status_code=400,
            detail="Tài khoản chưa được liên kết email. Vui lòng liên hệ Quản trị viên để đặt lại mật khẩu."
        )

    otp = f"{secrets.randbelow(900000) + 100000}"
    otp_hash = _hash_token(otp)
    ttl_seconds = OTP_TTL_MINUTES * 60

    # Lưu 100% vào Redis Cache (RAM in-memory) với TTL 600s
    redis_key = f"bachkhoa:auth:otp:{user.id}"
    set_cached_json(
        redis_key,
        {
            "otp_hash": otp_hash,
            "attempts": 0,
            "user_id": user.id,
        },
        ttl_seconds=ttl_seconds,
    )

    response_data = {
        "success": True,
        "message": f"Mã OTP đã được gửi đến email {_mask_email(user.email)}",
        "email_masked": _mask_email(user.email),
        "email_sent": True,
        "ttl_minutes": OTP_TTL_MINUTES,
    }
    return response_data, user, otp


def request_password_reset_otp(db: Session, identifier: str) -> dict:
    response_data, user, otp = prepare_password_reset_otp(db, identifier)
    try:
        _send_reset_otp_email(user, otp)
    except EmailSendError:
        response_data["email_sent"] = False
    return response_data


def verify_password_reset_otp(db: Session, identifier: str, otp: str) -> dict:
    user = _find_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị vô hiệu hoá.")

    clean_otp = (otp or "").strip()
    clean_hash = _hash_token(clean_otp)

    # Đọc và xác thực trực tiếp trên Redis
    redis_key = f"bachkhoa:auth:otp:{user.id}"
    cached_otp_data = get_cached_json(redis_key)

    if not cached_otp_data or not isinstance(cached_otp_data, dict):
        raise HTTPException(
            status_code=400,
            detail="Chưa có yêu cầu đặt lại mật khẩu hoặc mã OTP đã hết hiệu lực (quá 10 phút). Vui lòng yêu cầu mã mới."
        )

    attempts = cached_otp_data.get("attempts", 0)
    if attempts >= MAX_OTP_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Mã OTP đã bị khóa do nhập sai quá 5 lần. Vui lòng yêu cầu mã mới.")

    target_hash = cached_otp_data.get("otp_hash")
    if clean_hash != target_hash:
        attempts += 1
        cached_otp_data["attempts"] = attempts
        set_cached_json(redis_key, cached_otp_data, ttl_seconds=OTP_TTL_MINUTES * 60)
        remaining = MAX_OTP_ATTEMPTS - attempts
        if remaining <= 0:
            raise HTTPException(status_code=429, detail="Mã OTP đã bị khóa do nhập sai quá 5 lần. Vui lòng yêu cầu mã mới.")
        raise HTTPException(status_code=400, detail=f"Mã OTP không chính xác. Bạn còn {remaining} lần thử.")

    return {"valid": True, "message": "Mã OTP chính xác."}


def reset_password_with_otp(db: Session, identifier: str, otp: str, new_password: str) -> dict:
    verify_password_reset_otp(db, identifier, otp)

    user = _find_user_by_identifier(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")

    if len(new_password or "") < 6:
        raise HTTPException(status_code=422, detail="Mật khẩu mới phải có ít nhất 6 ký tự.")

    user.password_hash = hash_password(new_password)

    # Xóa cả Redis OTP và me cache
    invalidate_cache(f"bachkhoa:auth:otp:{user.id}")
    invalidate_cache(f"bachkhoa:auth:me:{user.id}")

    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "message": "Đặt lại mật khẩu thành công."
    }



def change_user_password(db: Session, user: User, current_password: str, new_password: str) -> dict:
    if not user.password_hash or not verify_password(current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không chính xác.")

    if len(new_password or "") < 6:
        raise HTTPException(status_code=422, detail="Mật khẩu mới phải có ít nhất 6 ký tự.")

    if current_password == new_password:
        raise HTTPException(status_code=400, detail="Mật khẩu mới không được trùng với mật khẩu hiện tại.")

    user.password_hash = hash_password(new_password)
    invalidate_cache(f"bachkhoa:auth:me:{user.id}")
    db.commit()
    db.refresh(user)

    return {"success": True, "message": "Đổi mật khẩu thành công."}


