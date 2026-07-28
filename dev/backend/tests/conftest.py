import os
import sys
import uuid
import pytest
from datetime import datetime

# Setup Python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
src_dir = os.path.join(backend_dir, "src")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

os.environ["CONTRACT_CACHE_REFRESH_SECONDS"] = "0"
os.environ["TESTING"] = "1"

from fastapi.testclient import TestClient
from src.index import app
from src.db.database import SessionLocal, engine, Base
from src.db.models import User, Role, UserRole, RolePermission, AuditLog
from src.core.auth import hash_password, create_access_token


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="function")
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def admin_user(db):
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = User(
            id=str(uuid.uuid4()),
            username="admin",
            password_hash=hash_password("admin123"),
            email="admin@test.local",
            is_active=True
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
    return admin


@pytest.fixture(scope="function")
def admin_headers(admin_user):
    token = create_access_token(admin_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
def unprivileged_user(db):
    username = f"test_no_perm_{uuid.uuid4().hex[:6]}"
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        password_hash=hash_password("password123"),
        email=f"{username}@test.local",
        is_active=True
    )
    db.add(user)
    db.commit()
    token = create_access_token(user.id)
    headers = {"Authorization": f"Bearer {token}"}
    yield user, headers
    # Cleanup
    db.query(AuditLog).filter(AuditLog.actor_id == user.id).delete()
    db.delete(user)
    db.commit()


@pytest.fixture(scope="function")
def finance_clerk_user(db):
    username = f"fin_clerk_{uuid.uuid4().hex[:6]}"
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        password_hash=hash_password("password123"),
        email=f"{username}@test.local",
        is_active=True
    )
    db.add(user)
    db.flush()

    from sqlalchemy import func
    max_role_id = db.query(func.max(Role.id)).scalar() or 0
    role = Role(id=max_role_id + 1, role_name=f"finance_clerk_{uuid.uuid4().hex[:6]}")
    db.add(role)
    db.flush()

    user_role = UserRole(user_id=user.id, role_id=role.id)
    perm = RolePermission(
        role_id=role.id,
        resource="finance",
        can_read=True,
        can_create=True,
        can_update=True,
        can_delete=True,
        can_approve=True
    )
    db.add(user_role)
    db.add(perm)
    db.commit()

    token = create_access_token(user.id)
    headers = {"Authorization": f"Bearer {token}"}

    yield user, headers

    # Cleanup
    db.query(AuditLog).filter(AuditLog.actor_id == user.id).delete()
    db.query(RolePermission).filter(RolePermission.role_id == role.id).delete()
    db.query(UserRole).filter(UserRole.user_id == user.id).delete()
    db.delete(role)
    db.delete(user)
    db.commit()
