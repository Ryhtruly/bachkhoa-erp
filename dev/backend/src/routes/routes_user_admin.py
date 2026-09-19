from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.core.auth import require_permission
from src.core.roles import validate_assignable_role_name
from src.db.database import get_db
from src.db.models import Role, User, UserRole
from src.user_admin.service import create_employee_account, resend_invite, set_user_active_status

router = APIRouter(prefix="/api/user-admin", tags=["01. Authentication & Security"])


class CreateAccountIn(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=3, max_length=255)
    role_name: str = Field(min_length=1, max_length=40)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, v: str) -> str:
        return v.strip()

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Email không hợp lệ")
        return v

    @field_validator("role_name")
    @classmethod
    def validate_role_name(cls, v: str) -> str:
        try:
            return validate_assignable_role_name(v)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc


@router.post("/employees/{employee_id}/account", status_code=201)
def create_account_for_employee(
    employee_id: str,
    payload: CreateAccountIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("user_admin", "create")),
):
    if payload.role_name.lower() == "admin":
        is_caller_admin = (
            user.username == "admin"
            or db.query(Role)
            .join(UserRole, UserRole.role_id == Role.id)
            .filter(
                UserRole.user_id == user.id,
                Role.is_active.is_(True),
                func.lower(Role.role_name) == "admin",
            )
            .first()
            is not None
        )
        if not is_caller_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản trị viên mới được phép gán quyền admin.",
            )
    return create_employee_account(
        db,
        employee_id,
        payload.username,
        payload.email,
        role_name=payload.role_name,
        background_tasks=background_tasks,
        creator_user=user,
    )


@router.post("/employees/{employee_id}/resend-invite")
def resend_account_invite(
    employee_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("user_admin", "create")),
):
    return resend_invite(db, employee_id, background_tasks=background_tasks)


@router.post("/users/{user_id}/activate")
def activate_account(
    user_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("user_admin", "update")),
):
    return set_user_active_status(db, user_id, True)


@router.post("/users/{user_id}/deactivate")
def deactivate_account(
    user_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("user_admin", "delete")),
):
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="Không thể tự vô hiệu hoá tài khoản đang đăng nhập.")
    return set_user_active_status(db, user_id, False)
