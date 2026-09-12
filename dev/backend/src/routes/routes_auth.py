from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import case
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.config.settings import settings
from src.db.models import Employee, Role, User, UserRole, RolePermission
from src.core.auth import (
    RESOURCE_ALIASES,
    check_user_permission,
    create_access_token,
    get_current_user,
    seed_default_admin,
    verify_password,
)
from src.core.refresh_sessions import (
    issue_refresh_session,
    revoke_refresh_session,
    revoke_user_sessions,
    rotate_refresh_session,
)
from src.user_admin.service import (
    complete_invite,
    get_invite_info,
    prepare_password_reset_otp,
    _send_reset_otp_email_task,
    verify_password_reset_otp,
    reset_password_with_otp,
    change_user_password,
)
from src.core.redis_utils import get_cached_json, set_cached_json, invalidate_cache

router = APIRouter(prefix="/api/auth", tags=["01. Authentication & Security"])

class LoginSchema(BaseModel):
    username: str
    password: str
    remember_me: bool = False

class LoginResponse(BaseModel):
    token: str
    user: dict

class CompleteInviteSchema(BaseModel):
    password: str

class ForgotPasswordRequestOtpSchema(BaseModel):
    identifier: str

class ForgotPasswordVerifyOtpSchema(BaseModel):
    identifier: str
    otp: str

class ForgotPasswordResetSchema(BaseModel):
    identifier: str
    otp: str
    new_password: str

class ChangePasswordSchema(BaseModel):
    current_password: str
    new_password: str

def _build_user_profile(user: User, db: Session) -> dict:
    cache_key = f"bachkhoa:auth:me:{user.id}"
    cached_profile = get_cached_json(cache_key)
    if cached_profile:
        return cached_profile

    employee = (
        db.query(Employee)
        .filter(Employee.user_id == user.id, Employee.is_active == True)
        .first()
    )

    # Lấy toàn bộ roles của user trong 1 query duy nhất
    user_roles = (
        db.query(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user.id, Role.is_active.is_(True))
        .all()
    )
    is_admin = bool(user.username == "admin" or any(r.role_name.lower() == "admin" for r in user_roles))

    sorted_roles = sorted(user_roles, key=lambda r: (0 if r.role_name == "admin" else 1, r.id))
    role_row = sorted_roles[0] if sorted_roles else None

    # Lấy toàn bộ permissions của các roles này trong 1 query duy nhất (nếu không phải superadmin)
    role_ids = [r.id for r in user_roles]
    role_perms = (
        db.query(RolePermission)
        .filter(RolePermission.role_id.in_(role_ids))
        .all()
    ) if role_ids and not is_admin else []

    def check_perm(resource: str, action: str) -> bool:
        if is_admin:
            return True
        col = f"can_{action}"
        valid_res = RESOURCE_ALIASES.get(resource, [resource])
        return any(
            p.resource in valid_res and bool(getattr(p, col, False))
            for p in role_perms
        )

    is_management_user = check_perm("hr", "read") or is_admin
    default_workspace = "management" if is_management_user else "employee"

    permissions = {
        resource: check_perm(resource, "read")
        for resource in (
            "survey_record", "legal_submission",
            "finance", "crm", "contract", "hr", "settings", "customer",
        )
    }

    is_director = is_admin
    can_approve_finance = check_perm("finance", "approve")
    can_approve_contract = check_perm("contract", "approve")
    can_approve_payroll = check_perm("payroll", "approve")

    profile_data = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_active": user.is_active,
        "employee_id": employee.id if employee else None,
        "full_name": employee.full_name if employee else user.username,
        "avatar_url": employee.avatar_url if employee else None,
        "role_name": role_row.role_name if role_row else None,
        "role_display_name": role_row.display_name if role_row else None,
        "is_director": is_director,
        "default_workspace": default_workspace,
        "permissions": permissions,
        "action_permissions": {
            "can_approve_finance": can_approve_finance,
            "can_approve_contract": can_approve_contract,
            "can_approve_payroll": can_approve_payroll,
        }
    }
    set_cached_json(cache_key, profile_data, ttl_seconds=300)
    return profile_data


def _request_metadata(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent")
    ip_address = request.client.host if request.client else None
    return user_agent, ip_address


def _cookie_samesite() -> str:
    value = settings.AUTH_COOKIE_SAMESITE
    return value if value in {"lax", "strict", "none"} else "lax"


def _set_refresh_cookie(response: Response, raw_token: str, remember_me: bool) -> None:
    max_age = (
        settings.REMEMBER_ME_REFRESH_TOKEN_EXPIRE_DAYS
        if remember_me
        else settings.REFRESH_TOKEN_EXPIRE_DAYS
    ) * 24 * 60 * 60
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=raw_token,
        max_age=max_age,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=_cookie_samesite(),
        domain=settings.AUTH_COOKIE_DOMAIN,
        path="/api/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.AUTH_COOKIE_NAME,
        domain=settings.AUTH_COOKIE_DOMAIN,
        path="/api/auth",
        samesite=_cookie_samesite(),
    )


def _assert_allowed_origin(request: Request) -> None:
    """Keep cookie-backed refresh/logout endpoints resistant to cross-site POSTs."""

    origin = request.headers.get("origin")
    allowed_origins = settings.cors_origins
    if origin and "*" not in allowed_origins and origin not in allowed_origins:
        raise HTTPException(status_code=403, detail="Origin không được phép.")

@router.post("/login", summary="User Login", description="Authenticate username/password credentials and issue JWT Access Token.")
def login(
    body: LoginSchema,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Sai tên đăng nhập hoặc mật khẩu")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị vô hiệu hoá")
    user_agent, ip_address = _request_metadata(request)
    refresh_token, _ = issue_refresh_session(
        db,
        user.id,
        user_agent=user_agent,
        ip_address=ip_address,
        remember_me=body.remember_me,
    )
    _set_refresh_cookie(response, refresh_token, body.remember_me)
    token = create_access_token(user.id)
    profile_data = _build_user_profile(user, db)
    return LoginResponse(
        token=token,
        user=profile_data,
    )


@router.post(
    "/refresh",
    summary="Refresh Access Token",
    description="Rotate the HttpOnly refresh cookie and issue a short-lived access token.",
)
def refresh_access_token(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=settings.AUTH_COOKIE_NAME),
    db: Session = Depends(get_db),
):
    _assert_allowed_origin(request)
    try:
        user_agent, ip_address = _request_metadata(request)
        replacement, session = rotate_refresh_session(
            db,
            refresh_token or "",
            user_agent=user_agent,
            ip_address=ip_address,
        )
    except HTTPException:
        _clear_refresh_cookie(response)
        raise

    _set_refresh_cookie(response, replacement, session.remember_me)
    return {"token": create_access_token(session.user_id)}


@router.post(
    "/logout",
    summary="Logout",
    description="Revoke the current refresh-token family and clear the browser cookie.",
)
def logout(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=settings.AUTH_COOKIE_NAME),
    db: Session = Depends(get_db),
):
    # Do not let an unrelated site revoke a user's browser session by sending a
    # credentialed POST. Requests without an Origin (CLI/server-to-server) are
    # still allowed; CORS remains the browser-side allowlist.
    _assert_allowed_origin(request)
    revoke_refresh_session(db, refresh_token)
    _clear_refresh_cookie(response)
    return {"ok": True}

@router.get("/me", summary="Get Current User Profile", description="Retrieve profile details for the authenticated user.")
def get_me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _build_user_profile(user, db)

@router.get(
    "/invite/{token}",
    summary="Check Invite Token",
    description="Public endpoint (no auth) used by the set-password page to validate an invite link.",
)
def check_invite(token: str, db: Session = Depends(get_db)):
    return get_invite_info(db, token)

@router.post(
    "/invite/{token}/complete",
    summary="Complete Invite",
    description="Public endpoint (no auth) — sets the password for a pending invited account and logs them in.",
)
def complete_invite_route(
    token: str,
    body: CompleteInviteSchema,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    user_info = complete_invite(db, token, body.password)
    user_agent, ip_address = _request_metadata(request)
    refresh_token, _ = issue_refresh_session(
        db,
        user_info["id"],
        user_agent=user_agent,
        ip_address=ip_address,
    )
    _set_refresh_cookie(response, refresh_token, False)
    access_token = create_access_token(user_info["id"])
    return LoginResponse(
        token=access_token,
        user={"id": user_info["id"], "username": user_info["username"]},
    )


@router.post(
    "/forgot-password/request-otp",
    summary="Request Password Reset OTP",
    description="Public endpoint (no auth) — requests a 6-digit OTP stored in Redis and sent via background task.",
)
def request_otp_route(
    body: ForgotPasswordRequestOtpSchema,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    response_data, user, otp = prepare_password_reset_otp(db, body.identifier)
    background_tasks.add_task(_send_reset_otp_email_task, user.email, user.username, otp)
    return response_data


@router.post(
    "/forgot-password/verify-otp",
    summary="Verify Password Reset OTP",
    description="Public endpoint (no auth) — validates the 6-digit OTP.",
)
def verify_otp_route(body: ForgotPasswordVerifyOtpSchema, db: Session = Depends(get_db)):
    return verify_password_reset_otp(db, body.identifier, body.otp)


@router.post(
    "/forgot-password/reset-password",
    summary="Reset Password with OTP",
    description="Public endpoint (no auth) — verifies OTP, updates password, and returns login session token.",
)
def reset_password_route(
    body: ForgotPasswordResetSchema,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    user_info = reset_password_with_otp(db, body.identifier, body.otp, body.new_password)
    user = db.query(User).filter(User.id == user_info["id"]).first()
    revoke_user_sessions(db, user.id)
    user_agent, ip_address = _request_metadata(request)
    refresh_token, _ = issue_refresh_session(
        db,
        user.id,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    _set_refresh_cookie(response, refresh_token, False)
    access_token = create_access_token(user.id)
    profile_data = _build_user_profile(user, db)
    return LoginResponse(
        token=access_token,
        user=profile_data,
    )


@router.post(
    "/change-password",
    summary="Change User Password",
    description="Authenticated endpoint — changes the current logged-in user's password.",
)
def change_password_route(
    body: ChangePasswordSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = change_user_password(db, current_user, body.current_password, body.new_password)
    revoke_user_sessions(db, current_user.id)
    return result

