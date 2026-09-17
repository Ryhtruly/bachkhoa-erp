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
if not os.environ.get("TEST_DATABASE_URL"):
    os.environ["TEST_DATABASE_URL"] = "sqlite:///:memory:"


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

    # "pg-test" là TÊN SERVICE của Postgres kiểm thử trong docker-compose.dev.yml,
    # không phải tên miền công khai — container backend gọi nó qua mạng nội bộ của
    # compose. Bản trước chỉ cho localhost, nên khi tách DB test thành service
    # riêng (để nó không chết theo mỗi lần recreate backend) thì cả bộ test bị
    # chặn. Vẫn fail-closed: danh sách host là allowlist tường minh, và tên
    # database bắt buộc kết thúc bằng _test.
    return (
        driver == "postgresql"
        and host in {"localhost", "127.0.0.1", "::1", "pg-test"}
        and database.endswith("_test")
    )


APPLICATION_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "").strip() or "sqlite:///:memory:"

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
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB
@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"

try:
    from pgvector.sqlalchemy import Vector
    @compiles(Vector, "sqlite")
    def _compile_vector_sqlite(type_, compiler, **kw):
        return "BLOB"
except Exception:
    pass

from sqlalchemy.dialects.sqlite.base import SQLiteDDLCompiler

_orig_get_col_default = SQLiteDDLCompiler.get_column_default_string
def _sqlite_get_column_default_string(self, column):
    if column.server_default and hasattr(getattr(column.server_default, "arg", None), "sequence"):
        return None
    return _orig_get_col_default(self, column)

SQLiteDDLCompiler.get_column_default_string = _sqlite_get_column_default_string

from src.core import redis_utils


class _FakeRedisLock:
    def acquire(self, blocking: bool = True) -> bool:
        return True

    def release(self) -> None:
        pass


class _FakeRedisClient:
    def __init__(self):
        self._store = {}

    def lock(self, name: str, timeout=None, blocking_timeout=None, **kwargs):
        return _FakeRedisLock()

    def get(self, key: str):
        return self._store.get(key)

    def set(self, key: str, val, **kwargs):
        self._store[key] = str(val) if not isinstance(val, (str, bytes)) else val
        return True

    def setex(self, key: str, time, value):
        self._store[key] = str(value) if not isinstance(value, (str, bytes)) else value
        return True

    def setnx(self, key: str, val):
        if key in self._store:
            return False
        self._store[key] = str(val) if not isinstance(val, (str, bytes)) else val
        return True

    def incr(self, key: str, amount: int = 1):
        try:
            cur = int(self._store.get(key, 0))
        except (ValueError, TypeError):
            cur = 0
        new_val = cur + amount
        self._store[key] = str(new_val)
        return new_val

    def expire(self, key: str, time: int):
        return True

    def delete(self, *keys):
        count = 0
        for k in keys:
            if k in self._store:
                del self._store[k]
                count += 1
        return count

    def keys(self, pattern: str = "*"):
        import fnmatch
        return [k for k in self._store.keys() if fnmatch.fnmatch(k, pattern)]

    def rpush(self, key: str, *values):
        if key not in self._store or not isinstance(self._store[key], list):
            self._store[key] = []
        for val in values:
            self._store[key].append(str(val) if not isinstance(val, (str, bytes)) else val)
        return len(self._store[key])

    def lpop(self, key: str):
        if key in self._store and isinstance(self._store[key], list) and self._store[key]:
            return self._store[key].pop(0)
        return None

    def llen(self, key: str):
        if key in self._store and isinstance(self._store[key], list):
            return len(self._store[key])
        return 0

    def lrange(self, key: str, start: int, end: int):
        if key in self._store and isinstance(self._store[key], list):
            if end == -1:
                return self._store[key][start:]
            return self._store[key][start:end+1]
        return []

    def lrem(self, key: str, count: int, value: str):
        if key in self._store and isinstance(self._store[key], list):
            items = self._store[key]
            removed = 0
            while value in items and (count == 0 or removed < abs(count)):
                items.remove(value)
                removed += 1
            return removed
    def eval(self, script: str, numkeys: int, *keys_and_args):
        # Support basic Lua enqueue script emulation
        if "LLEN" in script and "RPUSH" in script:
            key = keys_and_args[0]
            max_len = int(keys_and_args[1])
            payload = keys_and_args[2]
            if self.llen(key) < max_len:
                self.rpush(key, payload)
                return 1
            return 0
        return 1

    def ping(self):
        return True


if redis_utils.get_redis_client() is None or not isinstance(redis_utils.get_redis_client(), _FakeRedisClient):
    redis_utils._client = _FakeRedisClient()


@pytest.fixture(autouse=True)
def _ensure_fake_redis_when_redis_offline():
    if redis_utils._client is None or not isinstance(redis_utils._client, _FakeRedisClient):
        redis_utils._client = _FakeRedisClient()
    else:
        redis_utils._client._store.clear()
    yield
    if isinstance(redis_utils._client, _FakeRedisClient):
        redis_utils._client._store.clear()


from src.index import app
from src.db.database import engine, Base, get_db
from src.db.models import User, Role, UserRole, RolePermission, AuditLog
from src.core.auth import hash_password, create_access_token


def _ensure_audit_log_sequence(connection):
    """Keep model DDL usable when pg-test was restored before the audit migration.

    ``AuditLog`` declares this sequence in ``Base.metadata``. A restored dump can
    contain the table/default but not the sequence, which makes both ``create_all``
    and its teardown fail. The operation is restricted to PostgreSQL and is
    idempotent; production databases are never selected by this conftest.
    """
    if connection.dialect.name != "postgresql":
        return
    from sqlalchemy import text

    connection.execute(text("create sequence if not exists public.audit_log_id_seq as bigint"))


def _ensure_extensions(connection):
    if connection.dialect.name != "postgresql":
        return
    from sqlalchemy import text
    for ext in ("vector", "uuid-ossp", "pgcrypto"):
        try:
            connection.execute(text(f'create extension if not exists "{ext}"'))
        except Exception:
            pass


def _ensure_task_nodes_columns(connection):
    if connection.dialect.name != "postgresql":
        return
    from sqlalchemy import text

    exists = bool(connection.execute(text(
        "select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'task_nodes')"
    )).scalar())
    if not exists:
        return

    connection.execute(text("""
        alter table public.task_nodes
        add column if not exists name text,
        add column if not exists capability_code varchar(50);
        alter table public.task_nodes
        drop constraint if exists task_nodes_node_code_fkey;

        alter table public.service_packages
        add column if not exists category_type varchar(30) not null default 'GENERAL';

        alter table public.task_types
        add column if not exists category_type varchar(30) not null default 'GENERAL',
        add column if not exists display_order int null default 100,
        add column if not exists is_active boolean not null default true;
    """))


@pytest.fixture(scope="session", autouse=True)
def init_test_db():
    import src.db.models
    from sqlalchemy import text
    schema_preexisted = False
    if engine.dialect.name == "postgresql":
        try:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                _ensure_extensions(conn)
        except Exception:
            with engine.begin() as conn:
                _ensure_extensions(conn)
        with engine.connect() as conn:
            schema_preexisted = bool(conn.execute(text(
                """select exists (
                    select 1 from information_schema.tables
                    where table_schema = 'public'
                )"""
            )).scalar())
    with engine.begin() as conn:
        _ensure_audit_log_sequence(conn)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        _ensure_task_nodes_columns(conn)
    if engine.dialect.name == "sqlite":
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS document_template_applicabilities (
                    id VARCHAR PRIMARY KEY,
                    template_id VARCHAR,
                    applicability_type VARCHAR,
                    service_package_id VARCHAR,
                    task_type_id VARCHAR,
                    node_code VARCHAR,
                    is_default BOOLEAN DEFAULT 1
                );
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS document_checklist_templates (
                    id VARCHAR PRIMARY KEY,
                    name VARCHAR,
                    source VARCHAR,
                    is_required BOOLEAN DEFAULT 0,
                    needs_original BOOLEAN DEFAULT 0,
                    default_quantity INTEGER DEFAULT 1,
                    sort_order INTEGER DEFAULT 0,
                    note TEXT,
                    is_active BOOLEAN DEFAULT 1
                );
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS dossier_document_slots (
                    id VARCHAR PRIMARY KEY,
                    contract_id VARCHAR,
                    service_line_id VARCHAR,
                    template_id VARCHAR,
                    name VARCHAR,
                    source VARCHAR,
                    is_required BOOLEAN DEFAULT 0,
                    needs_original BOOLEAN DEFAULT 0,
                    min_count INTEGER DEFAULT 1,
                    sort_order INTEGER DEFAULT 0,
                    note TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS dossier_documents (
                    id VARCHAR PRIMARY KEY,
                    contract_id VARCHAR,
                    file_name VARCHAR,
                    file_path VARCHAR,
                    doc_status VARCHAR DEFAULT 'DANG_DUNG',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS dossier_document_links (
                    id VARCHAR PRIMARY KEY,
                    slot_id VARCHAR,
                    document_id VARCHAR,
                    link_status VARCHAR DEFAULT 'DANG_DUNG',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """))
            try:
                conn.execute(text("ALTER TABLE service_lines ADD COLUMN document_register_version INTEGER DEFAULT 2"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE document_slot_change_requests ADD COLUMN service_line_id VARCHAR"))
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE document_slot_creation_requests ADD COLUMN kind VARCHAR DEFAULT 'OUTPUT'"))
            except Exception:
                pass
    yield

    # Chỉ dọn khi conftest dựng một database trống. A pg-test dump is a
    # pre-existing, possibly partial schema; dropping all ORM metadata there
    # is unsafe because migrations may own objects absent from Base.metadata.
    if engine.dialect.name == "sqlite" or schema_preexisted:
        return
    # PostgreSQL tự xoá sequence có ``OWNED BY audit_log.id`` khi drop bảng.
    # Nếu để SQLAlchemy drop sequence lần nữa sau đó, teardown sẽ fail với
    # UndefinedTable. Tạm tách các sequence khỏi visitor; metadata được khôi
    # phục ngay cả khi việc dọn schema gặp lỗi.
    metadata_sequences = dict(Base.metadata._sequences)
    Base.metadata._sequences.clear()
    try:
        Base.metadata.drop_all(bind=engine, checkfirst=True)
    finally:
        Base.metadata._sequences.update(metadata_sequences)


@pytest.fixture(scope="session")
def client():
    with TestClient(app, base_url="https://testserver") as c:
        yield c


@pytest.fixture(scope="function", autouse=True)
def db():
    import src.db.models
    from sqlalchemy import text
    connection = engine.connect()
    Base.metadata.create_all(bind=connection)
    if connection.dialect.name == "sqlite":
        try:
            with connection.begin():
                try:
                    connection.execute(text("ALTER TABLE service_lines ADD COLUMN document_register_version INTEGER DEFAULT 2"))
                except Exception:
                    pass
                try:
                    connection.execute(text("ALTER TABLE document_slot_change_requests ADD COLUMN service_line_id VARCHAR"))
                except Exception:
                    pass
                try:
                    connection.execute(text("ALTER TABLE document_slot_creation_requests ADD COLUMN kind VARCHAR DEFAULT 'OUTPUT'"))
                except Exception:
                    pass
        except Exception:
            pass
    if connection.in_transaction():
        connection.commit()
    transaction = connection.begin()
    session = Session(bind=connection)
    app.dependency_overrides[get_db] = lambda: session
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)
        session.close()
        if transaction.is_active:
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
    role = db.query(Role).filter(Role.role_name == "accountant").first()
    role_created = False
    if role is None:
        max_role_id = db.query(func.max(Role.id)).scalar() or 0
        role = Role(id=max_role_id + 1, role_name="accountant")
        db.add(role)
        db.flush()
        role_created = True

    user_role = UserRole(user_id=user.id, role_id=role.id)
    perm = db.query(RolePermission).filter(
        RolePermission.role_id == role.id,
        RolePermission.resource == "finance",
    ).first()
    permission_created = perm is None
    if perm is None:
        perm = RolePermission(role_id=role.id, resource="finance")
        db.add(perm)
    perm.can_read = True
    perm.can_create = True
    perm.can_update = True
    perm.can_delete = True
    perm.can_approve = True
    db.add(user_role)
    db.add(perm)
    db.commit()

    token = create_access_token(user.id)
    headers = {"Authorization": f"Bearer {token}"}

    yield user, headers

    # Cleanup
    db.query(AuditLog).filter(AuditLog.actor_id == user.id).delete()
    db.query(UserRole).filter(UserRole.user_id == user.id).delete()
    if permission_created:
        db.query(RolePermission).filter(
            RolePermission.role_id == role.id,
            RolePermission.resource == "finance",
        ).delete(synchronize_session=False)
    if role_created:
        db.query(RolePermission).filter(
            RolePermission.role_id == role.id,
        ).delete(synchronize_session=False)
        db.query(Role).filter(Role.id == role.id).delete(synchronize_session=False)
    db.query(User).filter(User.id == user.id).delete(synchronize_session=False)
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
