from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import case
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import Employee, Role, User, UserRole
from src.core.auth import (
    check_user_permission,
    create_access_token,
    get_current_user,
    seed_default_admin,
    verify_password,
)
from src.user_admin.service import complete_invite, get_invite_info

router = APIRouter(prefix="/api/auth", tags=["01. Authentication & Security"])

class LoginSchema(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    user: dict

class CompleteInviteSchema(BaseModel):
    password: str

@router.post("/login", summary="User Login", description="Authenticate username/password credentials and issue JWT Access Token.")
def login(body: LoginSchema, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Sai tên đăng nhập hoặc mật khẩu")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị vô hiệu hoá")
    token = create_access_token(user.id)
    return LoginResponse(
        token=token,
        user={"id": user.id, "username": user.username, "email": user.email},
    )

@router.get("/me", summary="Get Current User Profile", description="Retrieve profile details for the authenticated user.")
def get_me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    employee = (
        db.query(Employee)
        .filter(Employee.user_id == user.id, Employee.is_active == True)
        .first()
    )
    # Chỉ ai THỰC SỰ có quyền quản lý mới vào không gian quản lý.
    # Trước đây tài khoản không gắn hồ sơ nhân sự lại được mặc định cho vào chế độ
    # quản lý — mặc định ngược hướng an toàn: một tài khoản không có quyền nào vẫn
    # nhìn thấy toàn bộ menu điều hành.
    is_management_user = check_user_permission(db, user, "hr", "read")
    default_workspace = "management" if is_management_user else "employee"

    role_row = (
        db.query(Role.display_name, Role.role_name)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user.id)
        .order_by(case((Role.role_name == "admin", 0), else_=1), Role.id.asc())
        .first()
    )

    # Quyền trả về CHỈ để giao diện biết ẩn/hiện tab cho gọn mắt.
    # Việc chặn thật vẫn nằm ở từng endpoint — ẩn tab không phải là phân quyền.
    permissions = {
        resource: check_user_permission(db, user, resource, "read")
        for resource in (
            "survey_record", "legal_submission",
            "finance", "crm", "contract", "hr", "settings",
        )
    }

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_active": user.is_active,
        "employee_id": employee.id if employee else None,
        "full_name": employee.full_name if employee else user.username,
        "avatar_url": employee.avatar_url if employee else None,
        "role_display_name": role_row.display_name if role_row else None,
        "default_workspace": default_workspace,
        "permissions": permissions,
    }

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
def complete_invite_route(token: str, body: CompleteInviteSchema, db: Session = Depends(get_db)):
    user_info = complete_invite(db, token, body.password)
    access_token = create_access_token(user_info["id"])
    return LoginResponse(
        token=access_token,
        user={"id": user_info["id"], "username": user_info["username"]},
    )
