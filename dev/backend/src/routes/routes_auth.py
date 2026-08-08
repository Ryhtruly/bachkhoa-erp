from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import Employee, User
from src.core.auth import (
    check_user_permission,
    create_access_token,
    get_current_user,
    seed_default_admin,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["01. Authentication & Security"])

class LoginSchema(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    user: dict

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
    is_management_user = check_user_permission(db, user, "hr", "read")
    default_workspace = "management" if is_management_user or not employee else "employee"

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_active": user.is_active,
        "employee_id": employee.id if employee else None,
        "default_workspace": default_workspace,
    }
