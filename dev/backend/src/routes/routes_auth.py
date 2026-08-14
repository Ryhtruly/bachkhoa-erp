from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import case
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import Employee, Role, User, UserRole, RolePermission
from src.core.auth import (
    RESOURCE_ALIASES,
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

    # Lấy toàn bộ roles của user trong 1 query duy nhất
    user_roles = (
        db.query(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user.id)
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
            "finance", "crm", "contract", "hr", "settings",
        )
    }

    is_director = is_admin
    can_approve_finance = check_perm("finance", "approve")
    can_approve_contract = check_perm("contract", "approve")
    can_approve_payroll = check_perm("payroll", "approve")

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_active": user.is_active,
        "employee_id": employee.id if employee else None,
        "full_name": employee.full_name if employee else user.username,
        "avatar_url": employee.avatar_url if employee else None,
        "role_name": role_row.role_name if role_row else "employee",
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
