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
    ts_now = "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP" if is_pg else "DATETIME DEFAULT CURRENT_TIMESTAMP"
    ts_type = "TIMESTAMPTZ" if is_pg else "DATETIME"
    json_type = "JSONB DEFAULT '{}'::jsonb" if is_pg else "TEXT DEFAULT '{}'"
    id_default = "DEFAULT gen_random_uuid()::text" if is_pg else ""
    daterange_col = ", effective_period daterange GENERATED ALWAYS AS (daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]')) STORED" if is_pg else ""

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
            created_at {ts_now}
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
            created_at {ts_now},
            updated_at {ts_now}
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
            storage_location_id VARCHAR,
            status VARCHAR DEFAULT 'CHUA_CO',
            sort_order INTEGER DEFAULT 0,
            note TEXT,
            confirmed_by VARCHAR,
            confirmed_at {ts_type},
            updated_by VARCHAR,
            created_at {ts_now},
            updated_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}dossier_documents (
            id VARCHAR PRIMARY KEY {id_default},
            dossier_id VARCHAR,
            service_line_id VARCHAR,
            contract_id VARCHAR,
            scope VARCHAR DEFAULT 'CONTRACT',
            stage VARCHAR DEFAULT 'ho-so-goc',
            slot_key VARCHAR,
            slot_id VARCHAR,
            task_node_id VARCHAR,
            object_key VARCHAR,
            file_name VARCHAR,
            file_path VARCHAR,
            content_type VARCHAR,
            size_bytes BIGINT DEFAULT 0,
            note TEXT,
            uploaded_by VARCHAR,
            uploaded_at {ts_now},
            checksum_sha256 VARCHAR(64),
            revision_no INTEGER DEFAULT 1,
            supersedes_id VARCHAR,
            doc_status VARCHAR DEFAULT 'DANG_DUNG',
            created_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}dossier_document_links (
            id VARCHAR PRIMARY KEY {id_default},
            contract_id VARCHAR,
            slot_id VARCHAR,
            document_id VARCHAR,
            link_status VARCHAR DEFAULT 'DANG_DUNG',
            note TEXT,
            linked_by VARCHAR,
            linked_at {ts_now},
            unlinked_by VARCHAR,
            unlinked_at {ts_type},
            created_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}document_slot_change_requests (
            id VARCHAR PRIMARY KEY {id_default},
            slot_id VARCHAR,
            service_line_id VARCHAR,
            change_type VARCHAR,
            reason TEXT,
            kind VARCHAR DEFAULT 'UNLOCK',
            status VARCHAR DEFAULT 'pending',
            requested_by VARCHAR,
            reviewed_by VARCHAR,
            reviewed_at {ts_type},
            review_note TEXT,
            unlocked_until {ts_type},
            revoked_at {ts_type},
            revoked_by VARCHAR,
            created_at {ts_now},
            updated_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}document_slot_creation_requests (
            id VARCHAR PRIMARY KEY {id_default},
            contract_id VARCHAR,
            service_line_id VARCHAR,
            task_node_id VARCHAR,
            checklist_result_id VARCHAR,
            proposed_name VARCHAR,
            name VARCHAR,
            source VARCHAR,
            kind VARCHAR DEFAULT 'OUTPUT',
            status VARCHAR DEFAULT 'draft',
            description TEXT,
            reason TEXT,
            quantity INTEGER DEFAULT 1,
            approved_name VARCHAR,
            approved_quantity INTEGER,
            approved_source VARCHAR,
            required_before_submit BOOLEAN DEFAULT {bool_false},
            needs_director_approval BOOLEAN DEFAULT {bool_false},
            created_slot_id VARCHAR,
            requested_by VARCHAR,
            reviewed_by VARCHAR,
            reviewed_at {ts_type},
            review_note TEXT,
            created_at {ts_now},
            updated_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}document_slot_creation_request_documents (
            id VARCHAR PRIMARY KEY {id_default},
            contract_id VARCHAR,
            request_id VARCHAR NOT NULL,
            document_id VARCHAR NOT NULL,
            created_by VARCHAR,
            created_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}document_storage_locations (
            id VARCHAR PRIMARY KEY {id_default},
            name VARCHAR NOT NULL UNIQUE,
            kind VARCHAR NOT NULL DEFAULT 'TAI_CHO',
            sort_order INTEGER NOT NULL DEFAULT 100,
            is_active BOOLEAN NOT NULL DEFAULT {bool_true},
            implies_status VARCHAR,
            created_at {ts_now},
            updated_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}workflow_nodes (
            code VARCHAR PRIMARY KEY,
            name VARCHAR,
            description TEXT,
            allowed_departments TEXT[],
            default_roles TEXT[],
            sla_hours INTEGER,
            allow_pause BOOLEAN DEFAULT {bool_false},
            allow_gov_tracking BOOLEAN DEFAULT {bool_false},
            cluster_code VARCHAR,
            is_active BOOLEAN DEFAULT {bool_true},
            created_at {ts_now}
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
            created_at {ts_now}
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
            cancellation_code TEXT,
            cancellation_reason TEXT,
            cancellation_data {json_type},
            cancelled_by VARCHAR,
            cancelled_at {ts_type},
            created_at {ts_now},
            updated_at {ts_now}
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
            created_at {ts_now},
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
            completed_at {ts_type},
            last_reviewed_at {ts_type},
            pause_reason_type TEXT,
            paused_at {ts_type},
            paused_note TEXT,
            paused_seconds BIGINT DEFAULT 0,
            rework_deadline_at {ts_type},
            blocked_reason TEXT,
            notes TEXT,
            is_overdue BOOLEAN DEFAULT {bool_false},
            created_at {ts_now},
            updated_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}task_node_assignments (
            id VARCHAR PRIMARY KEY {id_default},
            task_node_id VARCHAR,
            employee_id VARCHAR,
            role_code VARCHAR,
            is_primary BOOLEAN DEFAULT {bool_false},
            assignment_status VARCHAR DEFAULT 'assigned',
            planned_start {ts_type},
            planned_end {ts_type},
            assigned_by VARCHAR,
            assigned_at {ts_now},
            ended_at {ts_type},
            replacement_reason TEXT,
            notes TEXT,
            created_at {ts_now},
            updated_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}task_node_checklist_assignments (
            id VARCHAR(50) PRIMARY KEY {id_default},
            checklist_result_id VARCHAR(50) NOT NULL,
            employee_id VARCHAR(50) NOT NULL,
            role_code TEXT NOT NULL,
            pay_slot TEXT NOT NULL DEFAULT 'PRIMARY',
            share_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
            work_item_rate_id VARCHAR(50),
            amount_override NUMERIC(15,2),
            status TEXT NOT NULL DEFAULT 'proposed',
            assigned_by VARCHAR(50),
            assigned_at {ts_now},
            approved_by VARCHAR(50),
            approved_at {ts_type},
            ended_at {ts_type},
            reason TEXT,
            created_at {ts_now},
            updated_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}task_node_checklist_results (
            id VARCHAR PRIMARY KEY {id_default},
            task_node_id VARCHAR,
            contract_id VARCHAR,
            checklist_key TEXT,
            checklist_name TEXT,
            is_required BOOLEAN DEFAULT {bool_true},
            status VARCHAR DEFAULT 'pending',
            completed_by VARCHAR,
            completed_at {ts_type},
            submitted_by VARCHAR,
            submitted_at {ts_type},
            evidence_data {json_type},
            result_data {json_type},
            note TEXT,
            work_item_id VARCHAR,
            is_payable BOOLEAN DEFAULT {bool_false},
            pay_group_key TEXT,
            pay_scope TEXT,
            condition_result {json_type},
            pay_key TEXT,
            require_evidence BOOLEAN DEFAULT {bool_false},
            approver_role TEXT DEFAULT 'admin',
            is_overdue BOOLEAN DEFAULT {bool_false},
            late_reason TEXT,
            item_key VARCHAR,
            created_at {ts_now},
            updated_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}task_node_acceptances (
            id VARCHAR PRIMARY KEY {id_default},
            task_node_id VARCHAR,
            attempt_no INTEGER DEFAULT 1,
            status VARCHAR DEFAULT 'pending',
            submitted_by VARCHAR,
            submitted_at {ts_type},
            reviewer_user_id VARCHAR,
            reviewed_at {ts_type},
            quality_score NUMERIC(5,2),
            submission_payload {json_type},
            review_payload {json_type},
            review_note TEXT,
            created_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}task_node_events (
            id VARCHAR PRIMARY KEY {id_default},
            task_node_id VARCHAR,
            event_type VARCHAR,
            from_status VARCHAR,
            to_status VARCHAR,
            actor_user_id VARCHAR,
            payload {json_type},
            created_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}task_node_help_requests (
            id VARCHAR PRIMARY KEY {id_default},
            task_node_id VARCHAR,
            requested_by_employee_id VARCHAR,
            reason TEXT,
            proposed_amount NUMERIC,
            status VARCHAR DEFAULT 'open',
            claimed_by_employee_id VARCHAR,
            claimed_at {ts_type},
            cancelled_at {ts_type},
            cancel_reason TEXT,
            created_at {ts_now},
            updated_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}checklist_result_document_types (
            id VARCHAR PRIMARY KEY {id_default},
            checklist_result_id VARCHAR,
            template_id VARCHAR,
            slot_id VARCHAR,
            name VARCHAR,
            normalized_name VARCHAR,
            source VARCHAR,
            origin VARCHAR,
            status VARCHAR DEFAULT 'draft',
            rejection_reason TEXT,
            promoted_template_id VARCHAR,
            is_active BOOLEAN DEFAULT {bool_true},
            created_by VARCHAR,
            reviewed_by VARCHAR,
            created_at {ts_now},
            updated_at {ts_now},
            reviewed_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}checklist_result_document_type_files (
            id VARCHAR PRIMARY KEY {id_default},
            document_type_id VARCHAR,
            document_id VARCHAR,
            status VARCHAR DEFAULT 'draft',
            change_reason TEXT,
            rejection_reason TEXT,
            reviewed_by VARCHAR,
            reviewed_at {ts_type},
            is_active BOOLEAN DEFAULT {bool_true},
            created_by VARCHAR,
            removed_by VARCHAR,
            created_at {ts_now},
            removed_at {ts_type}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}checklist_result_document_links (
            id VARCHAR PRIMARY KEY {id_default},
            contract_id VARCHAR,
            checklist_result_id VARCHAR,
            document_id VARCHAR,
            review_status TEXT DEFAULT 'pending_review',
            rejection_reason TEXT,
            reviewed_by VARCHAR,
            reviewed_at {ts_type},
            created_by VARCHAR,
            created_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}handover_debt_requests (
            id VARCHAR PRIMARY KEY {id_default},
            task_node_id VARCHAR,
            contract_id VARCHAR,
            requester_user_id VARCHAR,
            remaining_amount_snapshot NUMERIC(15,2) DEFAULT 0,
            reason TEXT,
            promised_payment_date DATE,
            commitment_file {json_type},
            status VARCHAR DEFAULT 'pending',
            reviewed_by VARCHAR,
            reviewed_at {ts_type},
            review_note TEXT,
            created_at {ts_now},
            updated_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}workflow_rollback_requests (
            id VARCHAR PRIMARY KEY {id_default},
            workflow_instance_id VARCHAR,
            target_task_node_id VARCHAR,
            requested_by VARCHAR,
            reason TEXT,
            status VARCHAR DEFAULT 'pending',
            reviewed_by VARCHAR,
            reviewed_at {ts_type},
            review_note TEXT,
            affected_node_ids {json_type},
            created_at {ts_now},
            updated_at {ts_now}
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
            created_at {ts_now},
            updated_at {ts_now}
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
            created_at {ts_now},
            updated_at {ts_now}
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
            created_at {ts_now},
            updated_at {ts_now}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}work_pay_entitlements (
            id VARCHAR PRIMARY KEY {id_default},
            workflow_instance_id VARCHAR,
            task_node_id VARCHAR,
            employee_id VARCHAR,
            role_code VARCHAR,
            amount NUMERIC DEFAULT 0,
            earned_at {ts_type},
            status TEXT NOT NULL DEFAULT 'eligible',
            calculation_snapshot {json_type},
            idempotency_key VARCHAR,
            is_replaced BOOLEAN DEFAULT {bool_false},
            replaced_by VARCHAR,
            replaced_at {ts_type},
            replacement_reason TEXT,
            created_at {ts_now},
            CONSTRAINT work_pay_entitlements_replaced_check CHECK (replaced_by IS NULL OR is_replaced),
            CONSTRAINT work_pay_entitlements_replaced_self_check CHECK (replaced_by IS DISTINCT FROM id)
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}employee_compensation_terms (
            id VARCHAR(50) PRIMARY KEY {id_default},
            employee_id VARCHAR(50) NOT NULL,
            base_salary NUMERIC(15,2) NOT NULL DEFAULT 0,
            effective_from DATE NOT NULL,
            effective_to DATE,
            status TEXT NOT NULL DEFAULT 'published',
            source_type TEXT NOT NULL DEFAULT 'manual',
            source_snapshot {json_type},
            approved_by VARCHAR(50),
            approved_at {ts_type},
            notes TEXT,
            created_by VARCHAR(50),
            created_at {ts_now}
            {daterange_col}
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {p}employee_pay_adjustments (
            id VARCHAR(50) PRIMARY KEY {id_default},
            employee_id VARCHAR(50) NOT NULL,
            adjustment_type TEXT NOT NULL,
            amount NUMERIC(15,2) NOT NULL,
            effective_date DATE NOT NULL,
            reason TEXT NOT NULL,
            source_reference {json_type},
            status TEXT NOT NULL DEFAULT 'draft',
            created_by VARCHAR(50),
            approved_by VARCHAR(50),
            approved_at {ts_type},
            voided_by VARCHAR(50),
            voided_at {ts_type},
            void_reason TEXT,
            created_at {ts_now}
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
        f"ALTER TABLE {p}service_lines ADD COLUMN IF NOT EXISTS survey_drive_folder_url TEXT" if is_pg else "ALTER TABLE service_lines ADD COLUMN survey_drive_folder_url TEXT",
        f"ALTER TABLE {p}service_lines ADD COLUMN IF NOT EXISTS legal_drive_folder_url TEXT" if is_pg else "ALTER TABLE service_lines ADD COLUMN legal_drive_folder_url TEXT",
        f"ALTER TABLE {p}document_slot_change_requests ADD COLUMN IF NOT EXISTS service_line_id VARCHAR" if is_pg else "ALTER TABLE document_slot_change_requests ADD COLUMN service_line_id VARCHAR",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS kind VARCHAR DEFAULT 'OUTPUT'" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN kind VARCHAR DEFAULT 'OUTPUT'",
        f"ALTER TABLE {p}contracts ADD COLUMN IF NOT EXISTS completion_override BOOLEAN NOT NULL DEFAULT FALSE" if is_pg else "ALTER TABLE contracts ADD COLUMN completion_override BOOLEAN NOT NULL DEFAULT 0",
        f"ALTER TABLE {p}contracts ADD COLUMN IF NOT EXISTS completion_override_by VARCHAR" if is_pg else "ALTER TABLE contracts ADD COLUMN completion_override_by VARCHAR",
        f"ALTER TABLE {p}contracts ADD COLUMN IF NOT EXISTS completion_override_reason TEXT" if is_pg else "ALTER TABLE contracts ADD COLUMN completion_override_reason TEXT",
        f"ALTER TABLE {p}contracts ADD COLUMN IF NOT EXISTS completion_override_at TIMESTAMPTZ" if is_pg else "ALTER TABLE contracts ADD COLUMN completion_override_at DATETIME",
        f"ALTER TABLE {p}contracts ALTER COLUMN completion_override SET DEFAULT false" if is_pg else "",
        f"UPDATE {p}contracts SET completion_override = false WHERE completion_override IS NULL" if is_pg else "",
        f"ALTER TABLE {p}dossier_document_slots ADD COLUMN IF NOT EXISTS storage_location_id VARCHAR" if is_pg else "ALTER TABLE dossier_document_slots ADD COLUMN storage_location_id VARCHAR",
        f"ALTER TABLE {p}dossier_document_slots ADD COLUMN IF NOT EXISTS updated_by VARCHAR" if is_pg else "ALTER TABLE dossier_document_slots ADD COLUMN updated_by VARCHAR",
        f"ALTER TABLE {p}dossier_document_slots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()" if is_pg else "ALTER TABLE dossier_document_slots ADD COLUMN updated_at DATETIME",
        f"ALTER TABLE {p}dossier_document_links ADD COLUMN IF NOT EXISTS linked_by VARCHAR" if is_pg else "ALTER TABLE dossier_document_links ADD COLUMN linked_by VARCHAR",
        f"ALTER TABLE {p}dossier_document_links ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ DEFAULT now()" if is_pg else "ALTER TABLE dossier_document_links ADD COLUMN linked_at DATETIME",
        f"ALTER TABLE {p}dossier_document_links ADD COLUMN IF NOT EXISTS unlinked_by VARCHAR" if is_pg else "ALTER TABLE dossier_document_links ADD COLUMN unlinked_by VARCHAR",
        f"ALTER TABLE {p}dossier_document_links ADD COLUMN IF NOT EXISTS unlinked_at TIMESTAMPTZ" if is_pg else "ALTER TABLE dossier_document_links ADD COLUMN unlinked_at DATETIME",
        f"ALTER TABLE {p}dossier_document_links ADD COLUMN IF NOT EXISTS note TEXT" if is_pg else "ALTER TABLE dossier_document_links ADD COLUMN note TEXT",
        f"ALTER TABLE {p}workflow_nodes ADD COLUMN IF NOT EXISTS description TEXT" if is_pg else "ALTER TABLE workflow_nodes ADD COLUMN description TEXT",
        f"ALTER TABLE {p}workflow_nodes ADD COLUMN IF NOT EXISTS allowed_departments TEXT[]" if is_pg else "ALTER TABLE workflow_nodes ADD COLUMN allowed_departments TEXT",
        f"ALTER TABLE {p}workflow_nodes ADD COLUMN IF NOT EXISTS default_roles TEXT[]" if is_pg else "ALTER TABLE workflow_nodes ADD COLUMN default_roles TEXT",
        f"ALTER TABLE {p}workflow_nodes ADD COLUMN IF NOT EXISTS sla_hours INTEGER" if is_pg else "ALTER TABLE workflow_nodes ADD COLUMN sla_hours INTEGER",
        f"ALTER TABLE {p}workflow_nodes ADD COLUMN IF NOT EXISTS allow_pause BOOLEAN NOT NULL DEFAULT FALSE" if is_pg else "ALTER TABLE workflow_nodes ADD COLUMN allow_pause BOOLEAN NOT NULL DEFAULT 0",
        f"ALTER TABLE {p}workflow_nodes ADD COLUMN IF NOT EXISTS allow_gov_tracking BOOLEAN NOT NULL DEFAULT FALSE" if is_pg else "ALTER TABLE workflow_nodes ADD COLUMN allow_gov_tracking BOOLEAN NOT NULL DEFAULT 0",
        f"ALTER TABLE {p}workflow_nodes ADD COLUMN IF NOT EXISTS cluster_code VARCHAR" if is_pg else "ALTER TABLE workflow_nodes ADD COLUMN cluster_code VARCHAR",
        f"ALTER TABLE {p}workflow_nodes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE" if is_pg else "ALTER TABLE workflow_nodes ADD COLUMN is_active BOOLEAN DEFAULT 1",
        f"ALTER TABLE {p}workflow_nodes ADD COLUMN IF NOT EXISTS checklist_template {json_type}" if is_pg else f"ALTER TABLE workflow_nodes ADD COLUMN checklist_template {json_type}",
        f"ALTER TABLE {p}work_item_rates ADD COLUMN IF NOT EXISTS effective_period daterange GENERATED ALWAYS AS (daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]')) STORED" if is_pg else "",
        f"ALTER TABLE {p}service_packages ADD COLUMN IF NOT EXISTS category_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL'" if is_pg else "ALTER TABLE service_packages ADD COLUMN category_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL'",
        f"ALTER TABLE {p}task_types ADD COLUMN IF NOT EXISTS category_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL'" if is_pg else "ALTER TABLE task_types ADD COLUMN category_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL'",
        f"ALTER TABLE {p}task_types ADD COLUMN IF NOT EXISTS display_order INT NULL DEFAULT 100" if is_pg else "ALTER TABLE task_types ADD COLUMN display_order INT NULL DEFAULT 100",
        f"ALTER TABLE {p}task_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE" if is_pg else "ALTER TABLE task_types ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS capability_code VARCHAR(50)" if is_pg else "ALTER TABLE task_nodes ADD COLUMN capability_code VARCHAR(50)",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ" if is_pg else "ALTER TABLE task_nodes ADD COLUMN deadline_at DATETIME",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN DEFAULT FALSE" if is_pg else "ALTER TABLE task_nodes ADD COLUMN is_overdue BOOLEAN DEFAULT 0",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS notes TEXT" if is_pg else "ALTER TABLE task_nodes ADD COLUMN notes TEXT",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS blocked_reason TEXT" if is_pg else "ALTER TABLE task_nodes ADD COLUMN blocked_reason TEXT",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS name TEXT" if is_pg else "ALTER TABLE task_nodes ADD COLUMN name TEXT",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS pause_reason_type TEXT" if is_pg else "ALTER TABLE task_nodes ADD COLUMN pause_reason_type TEXT",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ" if is_pg else "ALTER TABLE task_nodes ADD COLUMN paused_at DATETIME",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS paused_note TEXT" if is_pg else "ALTER TABLE task_nodes ADD COLUMN paused_note TEXT",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS paused_seconds BIGINT DEFAULT 0" if is_pg else "ALTER TABLE task_nodes ADD COLUMN paused_seconds BIGINT DEFAULT 0",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS rework_deadline_at TIMESTAMPTZ" if is_pg else "ALTER TABLE task_nodes ADD COLUMN rework_deadline_at DATETIME",
        f"ALTER TABLE {p}task_nodes ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ" if is_pg else "ALTER TABLE task_nodes ADD COLUMN last_reviewed_at DATETIME",
        f"ALTER TABLE {p}dossier_document_slots ADD COLUMN IF NOT EXISTS confirmed_by VARCHAR" if is_pg else "ALTER TABLE dossier_document_slots ADD COLUMN confirmed_by VARCHAR",
        f"ALTER TABLE {p}dossier_document_slots ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ" if is_pg else "ALTER TABLE dossier_document_slots ADD COLUMN confirmed_at DATETIME",
        f"ALTER TABLE {p}document_slot_change_requests ADD COLUMN IF NOT EXISTS kind VARCHAR DEFAULT 'UNLOCK'" if is_pg else "ALTER TABLE document_slot_change_requests ADD COLUMN kind VARCHAR DEFAULT 'UNLOCK'",
        f"ALTER TABLE {p}document_slot_change_requests ADD COLUMN IF NOT EXISTS requested_by VARCHAR" if is_pg else "ALTER TABLE document_slot_change_requests ADD COLUMN requested_by VARCHAR",
        f"ALTER TABLE {p}document_slot_change_requests ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR" if is_pg else "ALTER TABLE document_slot_change_requests ADD COLUMN reviewed_by VARCHAR",
        f"ALTER TABLE {p}document_slot_change_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ" if is_pg else "ALTER TABLE document_slot_change_requests ADD COLUMN reviewed_at DATETIME",
        f"ALTER TABLE {p}document_slot_change_requests ADD COLUMN IF NOT EXISTS review_note TEXT" if is_pg else "ALTER TABLE document_slot_change_requests ADD COLUMN review_note TEXT",
        f"ALTER TABLE {p}document_slot_change_requests ADD COLUMN IF NOT EXISTS unlocked_until TIMESTAMPTZ" if is_pg else "ALTER TABLE document_slot_change_requests ADD COLUMN unlocked_until DATETIME",
        f"ALTER TABLE {p}document_slot_change_requests ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ" if is_pg else "ALTER TABLE document_slot_change_requests ADD COLUMN revoked_at DATETIME",
        f"ALTER TABLE {p}document_slot_change_requests ADD COLUMN IF NOT EXISTS revoked_by VARCHAR" if is_pg else "ALTER TABLE document_slot_change_requests ADD COLUMN revoked_by VARCHAR",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS proposed_name VARCHAR" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN proposed_name VARCHAR",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS task_node_id VARCHAR" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN task_node_id VARCHAR",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS checklist_result_id VARCHAR" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN checklist_result_id VARCHAR",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS description TEXT" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN description TEXT",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS reason TEXT" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN reason TEXT",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN quantity INTEGER DEFAULT 1",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS approved_name VARCHAR" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN approved_name VARCHAR",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS approved_quantity INTEGER" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN approved_quantity INTEGER",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS approved_source VARCHAR" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN approved_source VARCHAR",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS required_before_submit BOOLEAN DEFAULT FALSE" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN required_before_submit BOOLEAN DEFAULT 0",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS needs_director_approval BOOLEAN DEFAULT FALSE" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN needs_director_approval BOOLEAN DEFAULT 0",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS created_slot_id VARCHAR" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN created_slot_id VARCHAR",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS requested_by VARCHAR" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN requested_by VARCHAR",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN reviewed_by VARCHAR",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN reviewed_at DATETIME",
        f"ALTER TABLE {p}document_slot_creation_requests ADD COLUMN IF NOT EXISTS review_note TEXT" if is_pg else "ALTER TABLE document_slot_creation_requests ADD COLUMN review_note TEXT",
        f"ALTER TABLE {p}checklist_result_document_type_files ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'draft'" if is_pg else "ALTER TABLE checklist_result_document_type_files ADD COLUMN status VARCHAR DEFAULT 'draft'",
        f"ALTER TABLE {p}checklist_result_document_type_files ADD COLUMN IF NOT EXISTS change_reason TEXT" if is_pg else "ALTER TABLE checklist_result_document_type_files ADD COLUMN change_reason TEXT",
        f"ALTER TABLE {p}checklist_result_document_type_files ADD COLUMN IF NOT EXISTS rejection_reason TEXT" if is_pg else "ALTER TABLE checklist_result_document_type_files ADD COLUMN rejection_reason TEXT",
        f"ALTER TABLE {p}checklist_result_document_type_files ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR" if is_pg else "ALTER TABLE checklist_result_document_type_files ADD COLUMN reviewed_by VARCHAR",
        f"ALTER TABLE {p}checklist_result_document_type_files ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ" if is_pg else "ALTER TABLE checklist_result_document_type_files ADD COLUMN reviewed_at DATETIME",
        f"ALTER TABLE {p}checklist_result_document_links ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending_review'" if is_pg else "ALTER TABLE checklist_result_document_links ADD COLUMN review_status TEXT DEFAULT 'pending_review'",
        f"ALTER TABLE {p}checklist_result_document_links ADD COLUMN IF NOT EXISTS rejection_reason TEXT" if is_pg else "ALTER TABLE checklist_result_document_links ADD COLUMN rejection_reason TEXT",
        f"ALTER TABLE {p}checklist_result_document_links ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR" if is_pg else "ALTER TABLE checklist_result_document_links ADD COLUMN reviewed_by VARCHAR",
        f"ALTER TABLE {p}checklist_result_document_links ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ" if is_pg else "ALTER TABLE checklist_result_document_links ADD COLUMN reviewed_at DATETIME",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS checklist_key TEXT" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN checklist_key TEXT",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS checklist_name TEXT" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN checklist_name TEXT",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT TRUE" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN is_required BOOLEAN DEFAULT 1",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS completed_by VARCHAR" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN completed_by VARCHAR",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN completed_at DATETIME",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS submitted_by VARCHAR" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN submitted_by VARCHAR",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN submitted_at DATETIME",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS evidence_data {json_type}" if is_pg else f"ALTER TABLE task_node_checklist_results ADD COLUMN evidence_data {json_type}",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS note TEXT" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN note TEXT",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS work_item_id VARCHAR" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN work_item_id VARCHAR",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS is_payable BOOLEAN DEFAULT FALSE" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN is_payable BOOLEAN DEFAULT 0",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS pay_group_key TEXT" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN pay_group_key TEXT",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS pay_scope TEXT" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN pay_scope TEXT",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS condition_result {json_type}" if is_pg else f"ALTER TABLE task_node_checklist_results ADD COLUMN condition_result {json_type}",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS pay_key TEXT" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN pay_key TEXT",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS require_evidence BOOLEAN DEFAULT FALSE" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN require_evidence BOOLEAN DEFAULT 0",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS approver_role TEXT DEFAULT 'admin'" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN approver_role TEXT DEFAULT 'admin'",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN DEFAULT FALSE" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN is_overdue BOOLEAN DEFAULT 0",
        f"ALTER TABLE {p}task_node_checklist_results ADD COLUMN IF NOT EXISTS late_reason TEXT" if is_pg else "ALTER TABLE task_node_checklist_results ADD COLUMN late_reason TEXT",
        f"ALTER TABLE {p}task_node_assignments ADD COLUMN IF NOT EXISTS assigned_by VARCHAR(50)" if is_pg else "ALTER TABLE task_node_assignments ADD COLUMN assigned_by VARCHAR(50)",
        f"ALTER TABLE {p}task_node_assignments ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT now()" if is_pg else "ALTER TABLE task_node_assignments ADD COLUMN assigned_at DATETIME",
        f"ALTER TABLE {p}task_node_assignments ADD COLUMN IF NOT EXISTS planned_start TIMESTAMPTZ" if is_pg else "ALTER TABLE task_node_assignments ADD COLUMN planned_start DATETIME",
        f"ALTER TABLE {p}task_node_assignments ADD COLUMN IF NOT EXISTS planned_end TIMESTAMPTZ" if is_pg else "ALTER TABLE task_node_assignments ADD COLUMN planned_end DATETIME",
        f"ALTER TABLE {p}work_pay_entitlements ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'eligible'" if is_pg else "ALTER TABLE work_pay_entitlements ADD COLUMN status VARCHAR DEFAULT 'eligible'",
        f"ALTER TABLE {p}workflow_instances ADD COLUMN IF NOT EXISTS cancellation_code TEXT" if is_pg else "ALTER TABLE workflow_instances ADD COLUMN cancellation_code TEXT",
        f"ALTER TABLE {p}workflow_instances ADD COLUMN IF NOT EXISTS cancellation_reason TEXT" if is_pg else "ALTER TABLE workflow_instances ADD COLUMN cancellation_reason TEXT",
        f"ALTER TABLE {p}workflow_instances ADD COLUMN IF NOT EXISTS cancellation_data JSONB DEFAULT '{{}}'::jsonb" if is_pg else "ALTER TABLE workflow_instances ADD COLUMN cancellation_data TEXT DEFAULT '{}'",
        f"ALTER TABLE {p}workflow_instances ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(50)" if is_pg else "ALTER TABLE workflow_instances ADD COLUMN cancelled_by VARCHAR(50)",
        f"ALTER TABLE {p}workflow_instances ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ" if is_pg else "ALTER TABLE workflow_instances ADD COLUMN cancelled_at DATETIME",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS dossier_id VARCHAR" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN dossier_id VARCHAR",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS service_line_id VARCHAR" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN service_line_id VARCHAR",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS slot_id VARCHAR" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN slot_id VARCHAR",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS slot_key VARCHAR" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN slot_key VARCHAR",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS task_node_id VARCHAR" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN task_node_id VARCHAR",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS note TEXT" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN note TEXT",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN uploaded_by VARCHAR",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT now()" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN uploaded_at DATETIME",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS checksum_sha256 VARCHAR(64)" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN checksum_sha256 VARCHAR(64)",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS revision_no INTEGER DEFAULT 1" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN revision_no INTEGER DEFAULT 1",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS supersedes_id VARCHAR" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN supersedes_id VARCHAR",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS scope VARCHAR DEFAULT 'CONTRACT'" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN scope VARCHAR DEFAULT 'CONTRACT'",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS stage VARCHAR DEFAULT 'ho-so-goc'" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN stage VARCHAR DEFAULT 'ho-so-goc'",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS object_key VARCHAR" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN object_key VARCHAR",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS content_type VARCHAR" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN content_type VARCHAR",
        f"ALTER TABLE {p}dossier_documents ADD COLUMN IF NOT EXISTS size_bytes BIGINT DEFAULT 0" if is_pg else "ALTER TABLE dossier_documents ADD COLUMN size_bytes BIGINT DEFAULT 0",
        f"ALTER TABLE {p}dossier_document_links ADD COLUMN IF NOT EXISTS contract_id VARCHAR" if is_pg else "ALTER TABLE dossier_document_links ADD COLUMN contract_id VARCHAR",
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
            f"ALTER TABLE {p}task_node_acceptances ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}task_node_events ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}task_node_help_requests ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}checklist_result_document_types ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}checklist_result_document_type_files ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}checklist_result_document_links ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}handover_debt_requests ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}workflow_rollback_requests ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}survey_records ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}legal_submissions ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}legal_dossiers ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}work_pay_entitlements ALTER COLUMN id SET DEFAULT gen_random_uuid()::text",
            f"ALTER TABLE {p}workflow_nodes ALTER COLUMN allow_pause SET DEFAULT false",
            f"ALTER TABLE {p}workflow_nodes ALTER COLUMN allow_gov_tracking SET DEFAULT false",
            f"ALTER TABLE {p}users ALTER COLUMN is_active SET DEFAULT true",
            f"ALTER TABLE {p}users ALTER COLUMN email_verified SET DEFAULT false",
            # Drop unintended defaults on nullable lifecycle/event columns
            f"ALTER TABLE {p}task_nodes ALTER COLUMN planned_start DROP DEFAULT",
            f"ALTER TABLE {p}task_nodes ALTER COLUMN planned_end DROP DEFAULT",
            f"ALTER TABLE {p}task_nodes ALTER COLUMN started_at DROP DEFAULT",
            f"ALTER TABLE {p}task_nodes ALTER COLUMN deadline_at DROP DEFAULT",
            f"ALTER TABLE {p}task_nodes ALTER COLUMN submitted_at DROP DEFAULT",
            f"ALTER TABLE {p}task_nodes ALTER COLUMN accepted_at DROP DEFAULT",
            f"ALTER TABLE {p}task_nodes ALTER COLUMN completed_at DROP DEFAULT",
            f"ALTER TABLE {p}task_nodes ALTER COLUMN last_reviewed_at DROP DEFAULT",
            f"ALTER TABLE {p}task_nodes ALTER COLUMN paused_at DROP DEFAULT",
            f"ALTER TABLE {p}task_nodes ALTER COLUMN rework_deadline_at DROP DEFAULT",
            f"ALTER TABLE {p}task_node_assignments ALTER COLUMN ended_at DROP DEFAULT",
            f"ALTER TABLE {p}task_node_assignments ALTER COLUMN planned_start DROP DEFAULT",
            f"ALTER TABLE {p}task_node_assignments ALTER COLUMN planned_end DROP DEFAULT",
            f"ALTER TABLE {p}task_node_checklist_results ALTER COLUMN completed_at DROP DEFAULT",
            f"ALTER TABLE {p}task_node_checklist_results ALTER COLUMN submitted_at DROP DEFAULT",
            f"ALTER TABLE {p}task_node_acceptances ALTER COLUMN submitted_at DROP DEFAULT",
            f"ALTER TABLE {p}task_node_acceptances ALTER COLUMN reviewed_at DROP DEFAULT",
            f"ALTER TABLE {p}task_node_help_requests ALTER COLUMN claimed_at DROP DEFAULT",
            f"ALTER TABLE {p}task_node_help_requests ALTER COLUMN cancelled_at DROP DEFAULT",
            f"ALTER TABLE {p}checklist_result_document_types ALTER COLUMN reviewed_at DROP DEFAULT",
            f"ALTER TABLE {p}checklist_result_document_type_files ALTER COLUMN reviewed_at DROP DEFAULT",
            f"ALTER TABLE {p}checklist_result_document_type_files ALTER COLUMN removed_at DROP DEFAULT",
            f"ALTER TABLE {p}checklist_result_document_links ALTER COLUMN reviewed_at DROP DEFAULT",
            f"ALTER TABLE {p}handover_debt_requests ALTER COLUMN reviewed_at DROP DEFAULT",
            f"ALTER TABLE {p}workflow_rollback_requests ALTER COLUMN reviewed_at DROP DEFAULT",
            f"ALTER TABLE {p}legal_submissions ALTER COLUMN received_date DROP DEFAULT",
            f"ALTER TABLE {p}legal_submissions ALTER COLUMN expected_return_date DROP DEFAULT",
            f"ALTER TABLE {p}work_pay_entitlements ALTER COLUMN earned_at DROP DEFAULT",
            f"ALTER TABLE {p}work_pay_entitlements ALTER COLUMN replaced_at DROP DEFAULT",
            f"ALTER TABLE {p}workflow_instances ALTER COLUMN started_at DROP DEFAULT",
            f"ALTER TABLE {p}workflow_instances ALTER COLUMN completed_at DROP DEFAULT",
            f"ALTER TABLE {p}workflow_instances ALTER COLUMN cancelled_at DROP DEFAULT",
            f"ALTER TABLE {p}workflow_instance_revisions ALTER COLUMN activated_at DROP DEFAULT",
            f"ALTER TABLE {p}dossier_document_slots ALTER COLUMN confirmed_at DROP DEFAULT",
            f"ALTER TABLE {p}dossier_document_links ALTER COLUMN unlinked_at DROP DEFAULT",
            f"ALTER TABLE {p}document_slot_change_requests ALTER COLUMN revoked_at DROP DEFAULT",
            f"ALTER TABLE {p}document_slot_change_requests ALTER COLUMN reviewed_at DROP DEFAULT",
            f"ALTER TABLE {p}document_slot_change_requests ALTER COLUMN unlocked_until DROP DEFAULT",
            f"ALTER TABLE {p}document_slot_creation_requests ALTER COLUMN reviewed_at DROP DEFAULT",
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
        connection.execute(text(f"""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_result_document_pair
            ON {p}checklist_result_document_links (checklist_result_id, document_id);
        """))
        connection.execute(text(f"""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_slot_creation_request_document
            ON {p}document_slot_creation_request_documents (request_id, document_id);
        """))
    except Exception:
        if is_pg:
            try:
                connection.rollback()
            except Exception:
                pass

    try:
        if is_pg:
            connection.execute(text(f"""
                CREATE OR REPLACE VIEW {p}active_work_pay_entitlements AS
                SELECT * FROM {p}work_pay_entitlements WHERE NOT COALESCE(is_replaced, FALSE);
            """))
            connection.execute(text(f"""
                CREATE UNIQUE INDEX IF NOT EXISTS ux_tpl_app_combo
                ON {p}document_template_applicabilities (template_id, service_package_id, task_type_id, node_code)
                WHERE applicability_type = 'COMBO';
            """))
            connection.execute(text(f"""
                CREATE UNIQUE INDEX IF NOT EXISTS ux_checklist_document_type_active_name_source
                ON {p}checklist_result_document_types (checklist_result_id, normalized_name, source)
                WHERE is_active;
            """))
            connection.execute(text(f"""
                CREATE UNIQUE INDEX IF NOT EXISTS ux_checklist_document_type_file_active
                ON {p}checklist_result_document_type_files (document_type_id, document_id)
                WHERE is_active;
            """))
            connection.execute(text(f"""
                ALTER TABLE {p}work_pay_entitlements DROP CONSTRAINT IF EXISTS work_pay_entitlements_replaced_check;
                ALTER TABLE {p}work_pay_entitlements ADD CONSTRAINT work_pay_entitlements_replaced_check CHECK (replaced_by IS NULL OR is_replaced);
                ALTER TABLE {p}work_pay_entitlements DROP CONSTRAINT IF EXISTS work_pay_entitlements_replaced_self_check;
                ALTER TABLE {p}work_pay_entitlements ADD CONSTRAINT work_pay_entitlements_replaced_self_check CHECK (replaced_by IS DISTINCT FROM id);
            """))
            connection.execute(text(f"""
                INSERT INTO {p}document_storage_locations (name, kind, sort_order, implies_status) VALUES
                    ('Tủ hồ sơ A', 'TAI_CHO', 10, NULL),
                    ('Tủ hồ sơ B', 'TAI_CHO', 20, NULL),
                    ('Tủ hồ sơ C', 'TAI_CHO', 30, NULL),
                    ('Két sắt (bản chính)', 'TAI_CHO', 40, NULL),
                    ('Kho lưu trữ', 'TAI_CHO', 50, NULL),
                    ('Nhân viên đang giữ', 'BEN_NGOAI', 110, NULL),
                    ('Đang ở cơ quan', 'BEN_NGOAI', 120, 'DA_NOP'),
                    ('Đã trả khách', 'BEN_NGOAI', 130, NULL)
                ON CONFLICT (name) DO NOTHING;
            """))
            connection.execute(text(f"""
                INSERT INTO {p}workflow_nodes
                    (code, name, allowed_departments, default_roles, cluster_code, allow_pause, allow_gov_tracking, is_active)
                VALUES
                    ('K01', 'Tiếp nhận hồ sơ', ARRAY['SALES', 'LEGAL', 'SURVEY'], ARRAY['MAIN'], 'LEGAL_DOSSIER', FALSE, FALSE, TRUE),
                    ('K02', 'Đo đạc hiện trường', ARRAY['SURVEY'], ARRAY['MAIN', 'ASSISTANT'], 'SURVEY_TECH', FALSE, FALSE, TRUE),
                    ('K03', 'Chuẩn hoá dữ liệu đo đạc', ARRAY['SURVEY'], ARRAY['MAIN'], 'SURVEY_TECH', FALSE, FALSE, TRUE),
                    ('K04', 'Soạn thảo hồ sơ pháp lý', ARRAY['LEGAL'], ARRAY['MAIN'], 'LEGAL_DOSSIER', FALSE, FALSE, TRUE),
                    ('K05a', 'Nộp hồ sơ kỹ thuật', ARRAY['SURVEY'], ARRAY['SUBMITTER'], 'SURVEY_TECH', TRUE, FALSE, TRUE),
                    ('K05b', 'Nộp & theo dõi hồ sơ cơ quan', ARRAY['LEGAL'], ARRAY['SUBMITTER'], 'LEGAL_DOSSIER', TRUE, TRUE, TRUE),
                    ('K06', 'Bàn giao kết quả', ARRAY['LEGAL'], ARRAY['MAIN'], 'LEGAL_DOSSIER', FALSE, FALSE, TRUE),
                    ('K07', 'Hoàn tất & lưu trữ hồ sơ', ARRAY['LEGAL'], ARRAY['MAIN'], 'LEGAL_DOSSIER', FALSE, FALSE, TRUE)
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name,
                    allowed_departments = EXCLUDED.allowed_departments,
                    default_roles = EXCLUDED.default_roles,
                    cluster_code = EXCLUDED.cluster_code,
                    allow_pause = EXCLUDED.allow_pause,
                    allow_gov_tracking = EXCLUDED.allow_gov_tracking,
                    is_active = EXCLUDED.is_active;
            """))
        else:
            connection.execute(text("""
                CREATE VIEW IF NOT EXISTS active_work_pay_entitlements AS
                SELECT * FROM work_pay_entitlements WHERE NOT COALESCE(is_replaced, 0);
            """))
    except Exception:
        if is_pg:
            try:
                connection.rollback()
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

    token = create_access_token(str(user.id))
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


@pytest.fixture(autouse=True)
def _isolate_db_session_per_test(request):
    yield
    if "db_session" in request.fixturenames:
        try:
            session = request.getfixturevalue("db_session")
            session.rollback()
        except Exception:
            pass
