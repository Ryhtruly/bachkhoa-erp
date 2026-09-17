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
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "").strip()

if not TEST_DATABASE_URL:
    if not APPLICATION_DATABASE_URL:
        TEST_DATABASE_URL = "sqlite:///:memory:"
    else:
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
from src.db.models import User, Role, UserRole, RolePermission, AuditLog, Employee
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
    pass


def _ensure_runtime_tables_and_columns(connection):
    from sqlalchemy import text
    is_pg = connection.dialect.name == "postgresql"
    p = "public." if is_pg else ""
    bool_true = "TRUE" if is_pg else "1"
    bool_false = "FALSE" if is_pg else "0"
    ts_type = "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP" if is_pg else "DATETIME DEFAULT CURRENT_TIMESTAMP"
    json_type = "JSONB DEFAULT '{}'::jsonb" if is_pg else "TEXT DEFAULT '{}'"
    id_default = "DEFAULT gen_random_uuid()::text" if is_pg else ""

    table_statements = [
        f"""
        CREATE TABLE IF NOT EXISTS {p}wards (
            code VARCHAR PRIMARY KEY,
            name VARCHAR,
            district_code VARCHAR
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}document_template_applicabilities (
            id VARCHAR PRIMARY KEY {id_default},
            template_id VARCHAR,
            applicability_type VARCHAR,
            service_package_id VARCHAR,
            task_type_id VARCHAR,
            node_code VARCHAR,
            is_default BOOLEAN DEFAULT {bool_true},
            created_by VARCHAR,
            created_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}document_checklist_templates (
            id VARCHAR PRIMARY KEY {id_default},
            task_type_id VARCHAR,
            name VARCHAR NOT NULL,
            source VARCHAR NOT NULL,
            is_required BOOLEAN DEFAULT {bool_true},
            needs_original BOOLEAN DEFAULT {bool_false},
            default_quantity INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            note TEXT,
            is_active BOOLEAN DEFAULT {bool_true},
            is_identity_owner BOOLEAN DEFAULT {bool_true},
            created_at {ts_type},
            updated_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}dossier_document_slots (
            id VARCHAR PRIMARY KEY {id_default},
            scope VARCHAR DEFAULT 'SERVICE_LINE',
            contract_id VARCHAR,
            service_line_id VARCHAR,
            template_id VARCHAR,
            name VARCHAR,
            source VARCHAR,
            is_required BOOLEAN DEFAULT {bool_false},
            needs_original BOOLEAN DEFAULT {bool_false},
            min_count INTEGER DEFAULT 1,
            quantity INTEGER DEFAULT 1,
            copy_type VARCHAR,
            storage_place VARCHAR,
            status VARCHAR DEFAULT 'CHUA_CO',
            sort_order INTEGER DEFAULT 0,
            note TEXT,
            created_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}dossier_documents (
            id VARCHAR PRIMARY KEY {id_default},
            contract_id VARCHAR,
            file_name VARCHAR,
            file_path VARCHAR,
            doc_status VARCHAR DEFAULT 'DANG_DUNG',
            created_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}dossier_document_links (
            id VARCHAR PRIMARY KEY {id_default},
            slot_id VARCHAR,
            document_id VARCHAR,
            link_status VARCHAR DEFAULT 'DANG_DUNG',
            created_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}document_slot_change_requests (
            id VARCHAR PRIMARY KEY {id_default},
            slot_id VARCHAR,
            service_line_id VARCHAR,
            change_type VARCHAR,
            reason TEXT,
            status VARCHAR DEFAULT 'PENDING',
            created_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}document_slot_creation_requests (
            id VARCHAR PRIMARY KEY {id_default},
            contract_id VARCHAR,
            service_line_id VARCHAR,
            name VARCHAR,
            source VARCHAR,
            kind VARCHAR DEFAULT 'OUTPUT',
            status VARCHAR DEFAULT 'PENDING',
            created_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}workflow_nodes (
            code VARCHAR PRIMARY KEY,
            name VARCHAR,
            created_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}workflow_templates (
            id VARCHAR PRIMARY KEY {id_default},
            code VARCHAR,
            version INTEGER DEFAULT 1,
            name VARCHAR,
            description TEXT,
            status VARCHAR DEFAULT 'draft',
            service_package_id VARCHAR,
            task_type_id VARCHAR,
            is_default BOOLEAN DEFAULT {bool_false},
            graph {json_type},
            is_active BOOLEAN DEFAULT {bool_true},
            created_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}workflow_instances (
            id VARCHAR PRIMARY KEY {id_default},
            service_line_id VARCHAR,
            source_workflow_version_id VARCHAR,
            active_revision_id VARCHAR,
            status VARCHAR DEFAULT 'not_started',
            created_by VARCHAR,
            started_at {ts_type},
            completed_at {ts_type},
            created_at {ts_type},
            updated_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}workflow_instance_revisions (
            id VARCHAR PRIMARY KEY {id_default},
            workflow_instance_id VARCHAR,
            revision_no INTEGER DEFAULT 1,
            source_workflow_version_id VARCHAR,
            parent_revision_id VARCHAR,
            graph {json_type},
            status VARCHAR DEFAULT 'draft',
            change_reason TEXT,
            created_by VARCHAR,
            activated_by VARCHAR,
            created_at {ts_type},
            activated_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}task_nodes (
            id VARCHAR PRIMARY KEY {id_default},
            workflow_instance_id VARCHAR,
            defined_by_revision_id VARCHAR,
            node_key TEXT,
            node_code VARCHAR,
            name TEXT,
            capability_code VARCHAR(50),
            occurrence_no INTEGER DEFAULT 1,
            status VARCHAR DEFAULT 'pending',
            outcome TEXT,
            execution_data {json_type},
            planned_start {ts_type},
            planned_end {ts_type},
            started_at {ts_type},
            deadline_at {ts_type},
            submitted_at {ts_type},
            accepted_at {ts_type},
            last_reviewed_at {ts_type},
            created_at {ts_type},
            updated_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}task_node_assignments (
            id VARCHAR PRIMARY KEY {id_default},
            task_node_id VARCHAR,
            employee_id VARCHAR,
            role_code VARCHAR,
            is_primary BOOLEAN DEFAULT {bool_false},
            assignment_status VARCHAR DEFAULT 'active',
            ended_at {ts_type},
            replacement_reason TEXT,
            created_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}task_node_checklist_results (
            id VARCHAR PRIMARY KEY {id_default},
            task_node_id VARCHAR,
            contract_id VARCHAR,
            item_key VARCHAR,
            status VARCHAR,
            result_data {json_type},
            created_at {ts_type},
            updated_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}survey_records (
            id VARCHAR PRIMARY KEY {id_default},
            task_node_id VARCHAR,
            service_line_id VARCHAR,
            contract_id VARCHAR,
            dossier_name VARCHAR,
            ward_code VARCHAR,
            priority VARCHAR DEFAULT 'NORMAL',
            manual_status VARCHAR,
            note TEXT,
            created_at {ts_type},
            updated_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}legal_submissions (
            id VARCHAR PRIMARY KEY {id_default},
            task_node_id VARCHAR,
            service_line_id VARCHAR,
            contract_id VARCHAR,
            dossier_id VARCHAR,
            dossier_name VARCHAR,
            case_description TEXT,
            assigned_employee_id VARCHAR,
            contact_phone VARCHAR,
            receipt_code VARCHAR,
            receipt_photo_url VARCHAR,
            dossier_file_url VARCHAR,
            linked_survey_folder_url VARCHAR,
            payment_status VARCHAR,
            legacy_gov_status VARCHAR,
            received_date {ts_type},
            expected_return_date {ts_type},
            submitted_agency VARCHAR,
            is_first_submission BOOLEAN DEFAULT {bool_true},
            previous_submission_id VARCHAR,
            note TEXT,
            created_at {ts_type},
            updated_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}legal_dossiers (
            id VARCHAR PRIMARY KEY {id_default},
            contract_id VARCHAR,
            service_line_id VARCHAR,
            task_node_id VARCHAR,
            status VARCHAR,
            sub_status VARCHAR,
            dossier_name VARCHAR,
            created_at {ts_type},
            updated_at {ts_type}
        );
        """,
    ]

    for stmt in table_statements:
        try:
            connection.execute(text(stmt))
        except Exception:
            if is_pg:
                try:
                    connection.rollback()
                except Exception:
                    pass

    alter_statements = [
        f"ALTER TABLE {p}service_lines ADD COLUMN IF NOT EXISTS document_register_version INTEGER DEFAULT 2" if is_pg else "ALTER TABLE service_lines ADD COLUMN document_register_version INTEGER DEFAULT 2",
        f"ALTER TABLE {p}service_lines ADD COLUMN IF NOT EXISTS priority VARCHAR NOT NULL DEFAULT 'NORMAL'" if is_pg else "ALTER TABLE service_lines ADD COLUMN priority VARCHAR NOT NULL DEFAULT 'NORMAL'",
        f"ALTER TABLE {p}service_lines ALTER COLUMN priority SET DEFAULT 'NORMAL'" if is_pg else "",
        f"ALTER TABLE {p}document_slot_change_requests ADD COLUMN IF NOT EXISTS service_line_id VARCHAR" if is_pg else "ALTER TABLE document_slot_change_requests ADD COLUMN service_line_id VARCHAR",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS kind VARCHAR DEFAULT 'OUTPUT'" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN kind VARCHAR DEFAULT 'OUTPUT'",
        f"ALTER TABLE {p}contracts ADD COLUMN IF NOT EXISTS completion_override BOOLEAN NOT NULL DEFAULT FALSE" if is_pg else "ALTER TABLE contracts ADD COLUMN completion_override BOOLEAN NOT NULL DEFAULT 0",
        f"ALTER TABLE {p}contracts ADD COLUMN IF NOT EXISTS completion_override_by VARCHAR" if is_pg else "ALTER TABLE contracts ADD COLUMN completion_override_by VARCHAR",
        f"ALTER TABLE {p}contracts ADD COLUMN IF NOT EXISTS completion_override_reason TEXT" if is_pg else "ALTER TABLE contracts ADD COLUMN completion_override_reason TEXT",
        f"ALTER TABLE {p}contracts ADD COLUMN IF NOT EXISTS completion_override_at TIMESTAMPTZ" if is_pg else "ALTER TABLE contracts ADD COLUMN completion_override_at DATETIME",
        f"ALTER TABLE {p}service_packages ADD COLUMN IF NOT EXISTS category_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL'" if is_pg else "ALTER TABLE service_packages ADD COLUMN category_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL'",
        f"ALTER TABLE {p}task_types ADD COLUMN IF NOT EXISTS category_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL'" if is_pg else "ALTER TABLE task_types ADD COLUMN category_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL'",
        f"ALTER TABLE {p}task_types ADD COLUMN IF NOT EXISTS display_order INT NULL DEFAULT 100" if is_pg else "ALTER TABLE task_types ADD COLUMN display_order INT NULL DEFAULT 100",
        f"ALTER TABLE {p}task_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE" if is_pg else "ALTER TABLE task_types ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS name TEXT" if is_pg else "ALTER TABLE task_nodes ADD COLUMN name TEXT",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS capability_code VARCHAR(50)" if is_pg else "ALTER TABLE task_nodes ADD COLUMN capability_code VARCHAR(50)",
        f"ALTER TABLE {p}workflow_templates ADD COLUMN IF NOT EXISTS code VARCHAR" if is_pg else "ALTER TABLE workflow_templates ADD COLUMN code VARCHAR",
        f"ALTER TABLE {p}workflow_templates ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1" if is_pg else "ALTER TABLE workflow_templates ADD COLUMN version INTEGER DEFAULT 1",
        f"ALTER TABLE {p}workflow_templates ADD COLUMN IF NOT EXISTS description TEXT" if is_pg else "ALTER TABLE workflow_templates ADD COLUMN description TEXT",
        f"ALTER TABLE {p}workflow_templates ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'draft'" if is_pg else "ALTER TABLE workflow_templates ADD COLUMN status VARCHAR DEFAULT 'draft'",
        f"ALTER TABLE {p}workflow_templates ADD COLUMN IF NOT EXISTS service_package_id VARCHAR" if is_pg else "ALTER TABLE workflow_templates ADD COLUMN service_package_id VARCHAR",
        f"ALTER TABLE {p}workflow_templates ADD COLUMN IF NOT EXISTS task_type_id VARCHAR" if is_pg else "ALTER TABLE workflow_templates ADD COLUMN task_type_id VARCHAR",
        f"ALTER TABLE {p}workflow_templates ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE" if is_pg else "ALTER TABLE workflow_templates ADD COLUMN is_default BOOLEAN DEFAULT 0",
        f"ALTER TABLE {p}workflow_templates ADD COLUMN IF NOT EXISTS graph {json_type}" if is_pg else f"ALTER TABLE workflow_templates ADD COLUMN graph {json_type}",
    ]
    if is_pg:
        alter_statements.extend([
            f"ALTER TABLE {p}task_nodes DROP CONSTRAINT IF EXISTS task_nodes_node_code_fkey",
            f"ALTER TABLE {p}document_template_applicabilities ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}document_checklist_templates ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}dossier_document_slots ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}dossier_documents ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}dossier_document_links ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}document_slot_change_requests ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}document_slot_creation_requests ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}workflow_templates ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}workflow_instances ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}workflow_instance_revisions ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}task_nodes ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}task_node_assignments ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}task_node_checklist_results ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}survey_records ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}legal_submissions ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}legal_dossiers ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}users ALTER COLUMN is_active SET DEFAULT true",
            f"ALTER TABLE {p}users ALTER COLUMN email_verified SET DEFAULT false",
        ])

    for ddl in alter_statements:
        try:
            connection.execute(text(ddl))
        except Exception:
            if is_pg:
                try:
                    connection.rollback()
                except Exception:
                    pass

    try:
        connection.execute(text(f"""
            CREATE UNIQUE INDEX IF NOT EXISTS document_checklist_templates_unique
            ON {p}document_checklist_templates (coalesce(task_type_id, '~chung~'), name);
        """))
    except Exception:
        pass


def _ensure_document_and_helper_tables(connection):
    _ensure_runtime_tables_and_columns(connection)


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
    if engine.dialect.name == "postgresql":
        try:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                _ensure_runtime_tables_and_columns(conn)
        except Exception:
            with engine.begin() as conn:
                _ensure_runtime_tables_and_columns(conn)
    else:
        with engine.begin() as conn:
            _ensure_runtime_tables_and_columns(conn)
    try:
        from src.dossiers.register import reset_schema_cache
        reset_schema_cache()
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
    try:
        from src.dossiers.register import reset_schema_cache
        reset_schema_cache()
    except Exception:
        pass
    connection = engine.connect()
    Base.metadata.create_all(bind=connection)
    try:
        _ensure_runtime_tables_and_columns(connection)
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
    token = create_access_token(str(admin_user.id))
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
    token = create_access_token(str(user.id))
    headers = {"Authorization": f"Bearer {token}"}
    yield user, headers
    # Cleanup
    try:
        db.query(AuditLog).filter(AuditLog.actor_id == user.id).delete(synchronize_session=False)
        db.query(Employee).filter(Employee.user_id == user.id).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
    try:
        db.delete(user)
        db.commit()
    except Exception:
        db.rollback()


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
        perm = RolePermission(
            role_id=role.id,
            resource="finance",
            can_read=True,
            can_create=True,
            can_update=True,
            can_delete=True,
            can_approve=True,
        )
        db.add(perm)
    else:
        setattr(perm, "can_read", True)
        setattr(perm, "can_create", True)
        setattr(perm, "can_update", True)
        setattr(perm, "can_delete", True)
        setattr(perm, "can_approve", True)
    db.add(user_role)
    db.add(perm)
    db.commit()

    # Also grant normalized RBAC permissions if Permission rows exist for finance
    granted_perm_codes = []
    try:
        from src.db.models import Permission, RolePermissionGrant
        fin_perms = db.query(Permission).filter(
            Permission.resource_code == "finance",
            Permission.is_active.is_(True),
        ).all()
        for fp in fin_perms:
            has_grant = db.query(RolePermissionGrant).filter(
                RolePermissionGrant.role_id == role.id,
                RolePermissionGrant.permission_code == fp.code,
            ).first()
            if not has_grant:
                db.add(RolePermissionGrant(role_id=role.id, permission_code=fp.code))
                granted_perm_codes.append(fp.code)
        db.commit()
    except Exception:
        db.rollback()

    token = create_access_token(str(user.id))
    headers = {"Authorization": f"Bearer {token}"}

    yield user, headers

    # Cleanup
    if granted_perm_codes:
        try:
            from src.db.models import RolePermissionGrant
            db.query(RolePermissionGrant).filter(
                RolePermissionGrant.role_id == role.id,
                RolePermissionGrant.permission_code.in_(granted_perm_codes),
            ).delete(synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()
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


@pytest.fixture(autouse=True)
def _isolate_db_session_per_test(request):
    yield
    if "db_session" in request.fixturenames:
        try:
            session = request.getfixturevalue("db_session")
            session.rollback()
        except Exception:
            pass
