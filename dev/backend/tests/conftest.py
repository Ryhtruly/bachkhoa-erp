import os
import sys
import uuid
import pytest
from datetime import datetime
from sqlalchemy.orm import Session
from urllib.parse import parse_qsl, unquote, urlsplit

# Setup Python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
src_dir = os.path.join(backend_dir, "src")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if src_dir not in sys.path:
    sys.path.insert(0, src_dir)

os.environ["CONTRACT_CACHE_REFRESH_SECONDS"] = "0"
os.environ["TESTING"] = "1"


def normalize_database_target(database_url):
    """Return a credential-free identity for comparing database targets."""
    parsed = urlsplit(database_url)
    driver = parsed.scheme.lower().split("+", 1)[0]
    host = parsed.hostname.lower() if parsed.hostname else ""
    port = parsed.port or (5432 if driver == "postgresql" else None)
    database = unquote(parsed.path.lstrip("/"))
    query = tuple(sorted(parse_qsl(parsed.query, keep_blank_values=True)))
    return driver, host, port, database, query


def test_target_is_disposable(database_url):
    """Fail closed: only local PostgreSQL *_test databases or local SQLite are safe."""
    try:
        driver, host, _, database, _ = normalize_database_target(database_url)
    except (TypeError, ValueError):
        return False

    if host.endswith(".supabase.co") or host.endswith(".supabase.com"):
        return False

    if driver == "sqlite":
        return not host

    return (
        driver == "postgresql"
        and host in {"localhost", "127.0.0.1", "::1"}
        and database.endswith("_test")
    )


APPLICATION_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "").strip()

if not TEST_DATABASE_URL:
    raise pytest.UsageError(
        "TEST_DATABASE_URL is required for backend tests; refusing to fall back to DATABASE_URL."
    )

try:
    test_target = normalize_database_target(TEST_DATABASE_URL)
    application_target = normalize_database_target(APPLICATION_DATABASE_URL)
except (TypeError, ValueError) as exc:
    raise pytest.UsageError("TEST_DATABASE_URL must be a valid database URL.") from exc

if test_target == application_target:
    raise pytest.UsageError(
        "TEST_DATABASE_URL resolves to DATABASE_URL; refusing to use the application database."
    )

if not test_target_is_disposable(TEST_DATABASE_URL):
    raise pytest.UsageError(
        "TEST_DATABASE_URL must be a local disposable target; Supabase and shared databases are forbidden."
    )

# src.db.database reads DATABASE_URL at import time. Point it at the separately
# configured disposable test target only after the safety checks above pass.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from fastapi.testclient import TestClient
from src.index import app
from src.db.database import engine, Base, get_db
from src.db.models import User, Role, UserRole, RolePermission, AuditLog
from src.core.auth import hash_password, create_access_token


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="function", autouse=True)
def db():
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    app.dependency_overrides[get_db] = lambda: session
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)
        session.close()
        transaction.rollback()
        connection.close()


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


# ══════════════════════════════════════════════════════════════════
# Phiên đọc tới CSDL thật — để bắt lỗi lệch giữa SQL viết tay và schema
# ══════════════════════════════════════════════════════════════════
#
# Khác hẳn fixture `db` ở trên: fixture này KHÔNG ghi gì, chỉ chạy select để
# kiểm tra các câu SQL viết tay trong route còn khớp tên cột hay không. Đây là
# loại lỗi mà test logic thuần không bao giờ bắt được — migration đổi tên cột,
# test vẫn xanh, nhưng trang danh sách chết trắng.

@pytest.fixture(scope="session")
def db_session():
    """CSDL để đối chiếu SQL viết tay với tên cột thật.

    Chỉ chạy SELECT, không ghi gì. Dùng SCHEMA_CHECK_DATABASE_URL nếu có (thường
    trỏ tới bản sao chỉ-đọc), nếu không thì lấy CSDL thử đã được conftest kiểm
    duyệt ở trên. KHÔNG tự ý đọc DATABASE_URL gốc — bộ chặn đầu file cấm chạy
    test lên CSDL đang phục vụ khách.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    dsn = os.environ.get("SCHEMA_CHECK_DATABASE_URL", "").strip() or TEST_DATABASE_URL
    if not dsn:
        pytest.skip("Chưa cấu hình CSDL để đối chiếu schema")

    engine = create_engine(dsn)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
