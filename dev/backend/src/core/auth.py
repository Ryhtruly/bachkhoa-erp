import logging
import os
import uuid
import jwt
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import func
from src.db.database import get_db
from src.db.models import User, Role, UserRole, RolePermission, Employee
from src.core.permissions import evaluate_normalized_permission
from src.config.settings import settings
from src.core.roles import (
    ACCOUNTANT_ROLE_NAMES as CANONICAL_ACCOUNTANT_ROLE_NAMES,
    PAYROLL_ALL_ROLE_NAMES as CANONICAL_PAYROLL_ALL_ROLE_NAMES,
)

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

bearer_scheme = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)

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

def create_access_token(user_id: str, expires_delta: timedelta | None = None) -> str:
    lifetime = expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "jti": str(uuid.uuid4()),
        "exp": now + lifetime,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def revoke_access_token(token_str_or_jti: str, ttl_seconds: int = 3600) -> None:
    from src.core.redis_utils import set_cached_json
    jti = token_str_or_jti
    if "." in token_str_or_jti:
        try:
            payload = jwt.decode(token_str_or_jti, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
            jti = payload.get("jti") or token_str_or_jti
        except Exception:
            pass
    if jti:
        set_cached_json(f"bachkhoa:revoked_token:{jti}", True, ttl_seconds=ttl_seconds)


def revoke_all_user_tokens(user_id: str, ttl_seconds: int = 3600) -> None:
    from src.core.redis_utils import set_cached_json
    cutoff = int(datetime.now(timezone.utc).timestamp())
    set_cached_json(f"bachkhoa:user_token_cutoff:{user_id}", cutoff, ttl_seconds=ttl_seconds)


def is_token_revoked(payload: dict) -> bool:
    from src.core.redis_utils import get_cached_json
    jti = payload.get("jti")
    if jti and get_cached_json(f"bachkhoa:revoked_token:{jti}"):
        return True
    user_id = payload.get("sub")
    iat = payload.get("iat")
    if user_id and iat:
        cutoff = get_cached_json(f"bachkhoa:user_token_cutoff:{user_id}")
        if cutoff and iat <= cutoff:
            return True
    return False


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token hết hạn")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token không hợp lệ")

    if is_token_revoked(payload):
        raise HTTPException(status_code=401, detail="Token đã bị thu hồi hoặc phiên đăng nhập đã hết hiệu lực")
    return payload

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
    if not user or not getattr(user, "is_active", False):
        return False

    user_id = getattr(user, "id", None)
    if not user_id:
        return False

    permission_column = f"can_{action}"
    if not hasattr(RolePermission, permission_column):
        return False

    # Role-based admin check: users with the active "admin" role have superuser access
    try:
        is_admin = db.query(
            db.query(UserRole)
            .join(Role, Role.id == UserRole.role_id)
            .filter(
                UserRole.user_id == user_id,
                Role.is_active.is_(True),
                func.lower(Role.role_name) == "admin",
            )
            .exists()
        ).scalar()
        if is_admin:
            return True
    except Exception:
        pass

    valid_resources = RESOURCE_ALIASES.get(resource, [resource])

    # The normalized RBAC tables are authoritative whenever the requested
    # resource/action is represented there. Keep the legacy evaluator only as
    # a compatibility fallback for resources that have not been migrated yet.
    try:
        normalized_decision = evaluate_normalized_permission(
            db,
            user_id=user_id,
            resource_codes=valid_resources,
            action=action,
        )
    except SQLAlchemyError:
        # Keep older deployments usable until the RBAC migration is applied;
        # once normalized rows exist, their decision is authoritative.
        db.rollback()
        logger.exception("Normalized RBAC tables unavailable; using legacy permission compatibility path")
        normalized_decision = None
    if normalized_decision is not None:
        return normalized_decision.allowed

    # Single unified query: check either admin role OR valid permission grant
    allowed = db.query(
        db.query(UserRole)
        .join(Role, Role.id == UserRole.role_id)
        .outerjoin(RolePermission, RolePermission.role_id == Role.id)
        .filter(
            UserRole.user_id == user_id,
            Role.is_active.is_(True),
            (func.lower(Role.role_name) == "admin") | (
                RolePermission.resource.in_(valid_resources) &
                (getattr(RolePermission, permission_column) == True)
            )
        )
        .exists()
    ).scalar()

    return bool(allowed)

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


PAYROLL_ALL_ROLE_NAMES = CANONICAL_PAYROLL_ALL_ROLE_NAMES
ACCOUNTANT_ROLE_NAMES = CANONICAL_ACCOUNTANT_ROLE_NAMES


def is_payroll_all_user(db: Session, user: User) -> bool:
    """Only accountant/director may use collection-wide payroll endpoints."""
    if not user or not getattr(user, "is_active", False):
        return False
    user_id = getattr(user, "id", None)
    if not user_id:
        return False
    return bool(
        db.query(Role.id)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(
            UserRole.user_id == user_id,
            Role.is_active.is_(True),
            func.lower(Role.role_name).in_(PAYROLL_ALL_ROLE_NAMES),
        )
        .first()
    )


def is_accountant_user(db: Session, user: User) -> bool:
    """Only the accounting role (or the technical admin) may issue vouchers."""
    if not user or not getattr(user, "is_active", False):
        return False
    user_id = getattr(user, "id", None)
    if not user_id:
        return False
    return bool(
        db.query(Role.id)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(
            UserRole.user_id == user_id,
            Role.is_active.is_(True),
            func.lower(Role.role_name).in_(ACCOUNTANT_ROLE_NAMES | {"admin"}),
        )
        .first()
    )


def require_accountant(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if not is_accountant_user(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán mới được lập phiếu tạm ứng chính thức.",
        )
    return user


def assert_payroll_employee_access(db: Session, user: User, employee_id: str) -> Employee:
    """Resolve a target employee and enforce own-or-accounting payroll scope."""
    employee = db.query(Employee).filter(Employee.id == employee_id, Employee.is_active == True).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ nhân sự.")
    if not is_payroll_all_user(db, user) and employee.user_id != user.id:
        raise HTTPException(status_code=403, detail="Bạn chỉ được xem bảng lương của chính mình.")
    return employee


def require_payroll_all(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if not is_payroll_all_user(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Kế toán hoặc Giám đốc được xem bảng lương tổng hợp.",
        )
    return user

from sqlalchemy import func

def seed_default_admin(db: Session):
    if not settings.ADMIN_BOOTSTRAP_PASSWORD:
        raise RuntimeError("ADMIN_BOOTSTRAP_PASSWORD phải được cấu hình khi bật seed admin.")
    existing = db.query(User).filter(User.username == "admin").first()
    import uuid
    if not existing:
        admin = User(
            id=str(uuid.uuid4()),
            username="admin",
            password_hash=hash_password(settings.ADMIN_BOOTSTRAP_PASSWORD),
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

