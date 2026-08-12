import os
import jwt
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from src.db.database import get_db
from src.db.models import User, Role, UserRole, RolePermission
from src.config.settings import settings

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

bearer_scheme = HTTPBearer(auto_error=False)

import bcrypt

def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    try:
        pwd_bytes = plain.encode('utf-8')[:72]
        hash_bytes = hashed.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False

def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token hết hạn")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token không hợp lệ")

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Thiếu token xác thực")
    payload = decode_token(credentials.credentials)
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=401, detail="Người dùng không tồn tại")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị vô hiệu hoá")
    return user

def require_authenticated_user(user: User = Depends(get_current_user)) -> User:
    return user

RESOURCE_ALIASES = {
    # KHÔNG gộp legal_submission/survey_record với 'hoso': cả hai phòng đều có quyền
    # trên 'hoso', nên nếu để fallback thì nhân viên đo vẽ sẽ đọc được hồ sơ pháp lý
    # và ngược lại — đúng thứ mà việc tách quyền này cần chặn.
    "legal_submission": ["legal_submission"],
    "legal_submissions": ["legal_submission"],
    "survey_record": ["survey_record"],
    "survey_records": ["survey_record"],
    "tasks": ["tasks", "workflow"],
    "contracts": ["contracts", "contract"],
}

def check_user_permission(db: Session, user: User, resource: str, action: str) -> bool:
    if not user or not user.is_active:
        return False

    # Superuser admin bypass
    if user.username == "admin":
        return True

    # Admin role bypass
    admin_role = (
        db.query(Role.id)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user.id, Role.role_name.ilike("admin"))
        .first()
    )
    if admin_role:
        return True

    permission_column = f"can_{action}"
    if not hasattr(RolePermission, permission_column):
        return False

    valid_resources = RESOURCE_ALIASES.get(resource, [resource])

    perm = (
        db.query(RolePermission)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .filter(
            UserRole.user_id == user.id,
            RolePermission.resource.in_(valid_resources),
            getattr(RolePermission, permission_column) == True
        )
        .first()
    )
    return perm is not None

def require_permission(resource: str, action: str):
    def dependency(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> User:
        if not check_user_permission(db, user, resource, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Không có quyền '{action}' trên tài nguyên '{resource}'"
            )
        return user
    return dependency

def require_any_permission(*perms: tuple[str, str]):
    def dependency(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> User:
        for resource, action in perms:
            if check_user_permission(db, user, resource, action):
                return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản không có quyền thực hiện thao tác này"
        )
    return dependency

from sqlalchemy import func

def seed_default_admin(db: Session):
    existing = db.query(User).filter(User.username == "admin").first()
    import uuid
    if not existing:
        admin = User(
            id=str(uuid.uuid4()),
            username="admin",
            password_hash=hash_password("admin123"),
            email="admin@bachkhoa.local",
            is_active=True,
        )
        db.add(admin)
        db.flush()
        existing = admin
    
    admin_role = db.query(Role).filter(Role.role_name == "admin").first()
    if not admin_role:
        max_id = db.query(func.max(Role.id)).scalar() or 0
        admin_role = Role(id=max_id + 1, role_name="admin")
        db.add(admin_role)
        db.flush()

    user_role = db.query(UserRole).filter(
        UserRole.user_id == existing.id,
        UserRole.role_id == admin_role.id
    ).first()
    if not user_role:
        db.add(UserRole(user_id=existing.id, role_id=admin_role.id))
    
    db.commit()
    db.refresh(existing)
    return existing

