# Contract Template Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only when the user explicitly requests delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quản lý mẫu hợp đồng DOCX cho Director/Admin với immutable versions, retry an toàn, publication có concurrency control và bảo toàn hợp đồng lịch sử.

**Architecture:** PostgreSQL reserve version trước storage; upload_state tách lifecycle, immutable S3 PUT, verify digest khi retry, finalize bằng transaction có global catalog lock. FastAPI dùng role-aware guard cho toàn bộ management API; React quản lý nhóm/history và tái sử dụng API/download helpers hiện có.

**Tech Stack:** FastAPI, SQLAlchemy/PostgreSQL, Pydantic, python-docx, boto3/S3-compatible storage, React 19, Vite/Vitest, pytest.

**Design:** [Revised design](../specs/2026-09-25-contract-template-management-design.md).  
**Decision approved 2026-09-25:** Version gaps được phép; giữ failed/pending reservations để retry.  
**Document scope:** Kế hoạch triển khai; chưa thực hiện checkbox, chưa commit/push.

## Global Constraints

- Keys đúng `contract-templates/{code}/v{version}.docx`, private storage, immutable `IfNoneMatch="*"`.
- DOCX thật, tối đa 20 MiB; validate backend trước mọi write, không dùng ZIP rỗng làm success fixture.
- Reserve version bền vững trước storage; max tính cả pending/failed; không xóa reservation/object khi lỗi commit.
- Retry cùng ID bắt buộc SHA-256/size khớp; file khác phải tạo version mới.
- Lifecycle `draft | published | archived`; upload `pending | ready | failed`. Status endpoint chỉ nhận published/archived.
- Một published/code qua partial unique index; không archive published cuối cùng qua global PostgreSQL advisory transaction lock `(240925, 1)`.
- Mọi transaction management đọc state/version sau lock; không giữ transaction trong storage I/O.
- Không auto-publish version cũ nếu version cao hơn đã published trong lúc upload. Explicit publish version cũ vẫn cho phép rollback nghiệp vụ.
- Cả 7 management endpoints dùng contract:create và `is_director(db, user.id)`; không đọc user.is_director.
- Giữ contract_template_id, key, bytes, renderer/stored-document precedence; không hard delete hoặc thay fallback.
- Không thêm customer/contract fields để khớp placeholder chưa được pipeline hỗ trợ.
- Tests chỉ trên local disposable PostgreSQL; không bypass conftest guard hoặc dùng application/shared DB. Không in secrets.
- Trước source edit: GitNexus impact, báo HIGH/CRITICAL, xác minh UNKNOWN bằng source. Trước commit được user yêu cầu: detect_changes(scope=all), xử lý partial/truncated.

## Repository evidence and file map

Baseline: `c6bb8a5`, branch `feat/contract-templates-crud`. GitNexus refreshed 2026-09-25: model impact MEDIUM (3 direct importers: models/__init__, routes_crm, routes_intake; 53 total import dependents). Storage upload/catalog impact UNKNOWN, không resolve processes; source xác nhận generation/catalog/render consumers. Không coi zero edges là không ảnh hưởng; re-check HEAD khi triển khai.

Reuse boundaries:
- `storage_service.upload_contract_template`: immutable PUT đã có, giữ nguyên contract.
- `dossiers.actor_guard.is_director`: role-aware authority; không sửa role semantics.
- `files.content_disposition.build_content_disposition_header`: Unicode-safe header.
- `contracts.services`: generation snapshot/current render data, không mở rộng fields.
- `routes_contracts.list_published_contract_templates`: creation catalog hiện lọc published.
- `frontend/src/lib/api.js`: apiFetch JSON/FormData, downloadFile binary/auth.

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260925100000_contract_template_management.sql` (new) | Preflight/backfill, upload metadata, constraints/index |
| `dev/backend/src/db/models/crm.py` | Mirror metadata/constraints trên ContractTemplate |
| `dev/backend/src/contracts/template_files.py` (new) | Bounded read, real DOCX validation, digest |
| `dev/backend/src/contracts/template_service.py` (new) | Reserve/upload/retry/finalize/status/catalog/placeholders |
| `dev/backend/src/services/storage_service.py` | Add primary-bucket identity inspection; preserve existing helpers |
| `dev/backend/src/routes/routes_contracts.py` | Shared manager dependency và 7 endpoints |
| `dev/backend/tests/conftest.py` | Idempotent new migration trong existing disposable DB setup |
| `dev/backend/tests/contract_template_test_support.py` (new) | Real DOCX factory, isolated migrated PG schema |
| `dev/backend/tests/test_contract_template_management_schema.py` (new) | Actual migration/backfill/constraints |
| `dev/backend/tests/test_contract_template_files.py` (new) | Parser/MIME/size/package tests |
| `dev/backend/tests/test_contract_template_management.py` (new) | Service/API/fault recovery/auth |
| `dev/backend/tests/test_contract_template_management_concurrency.py` (new) | Real independent PG sessions |
| Existing storage/renderer/selection/catalog tests | Consumer regressions, upgrade/create/history |
| `dev/frontend/src/features/contracts/ContractTemplateManager.jsx` + `.test.jsx` (new) | Management UI và interaction tests |
| `dev/frontend/src/features/contracts/contractTemplateManager.css` (new) | Scoped styling |
| `dev/frontend/src/pages/Contracts.jsx` + `.test.jsx` | Guarded view switcher, composer compatibility |

## Test execution contract

Commands từ repo root trừ khi ghi rõ. Đây là lệnh cho implementation, chưa được chạy trong lần sửa plan.

Baseline local venv trỏ Python 3.12 đã bị gỡ. Dùng backend container có dependencies nếu còn đúng môi trường; không đánh dấu pass khi runtime lỗi. Compose hiện đặt DATABASE_URL = TEST_DATABASE_URL; không dùng giá trị mặc định đó để chạy pytest. Trước execution, cấu hình biến TEST_DATABASE_URL của shell tới một local disposable PostgreSQL database riêng, tên kết thúc `_test`, khác database của app. Giữ DATABASE_URL của container để conftest kiểm tra hai target thực sự khác nhau. Không xóa biến này, sửa .env/Compose hoặc bỏ guard.

```powershell
docker compose --env-file dev/backend/.env -f docker-compose.dev.yml ps backend pg-test minio
function Invoke-ContractBackendTests {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]] $TestArgs)
    if (-not $env:TEST_DATABASE_URL) { throw 'Configure a separate disposable TEST_DATABASE_URL first' }
    docker compose --env-file dev/backend/.env -f docker-compose.dev.yml exec -T -e TEST_DATABASE_URL -e TESTING=1 -e PYTHONPATH=/app backend python -m pytest @TestArgs
    if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed or could not start' }
}
```

Trước khi chạy: xác nhận target chỉ phục vụ kiểm thử. Có thể dùng database khác trên service pg-test, nhưng không cùng database mà backend đang sử dụng. Nếu chưa có target riêng, hỏi user ở thời điểm implementation để provision/configure, không tự suy DSN hay credential. Không chạy setup_test_schema.py replay tất cả migrations trên dữ liệu đang có; dùng migration mới qua Task 1 setup. Không in DSN/credentials.

```powershell
npm --prefix dev/frontend test -- src/features/contracts/ContractTemplateManager.test.jsx
npm --prefix dev/frontend test -- src/pages/Contracts.test.jsx
# Nếu npm shim vẫn hỏng, package đã cài có thể chạy trực tiếp:
Push-Location dev/frontend
try { node node_modules/vitest/vitest.mjs run src/pages/Contracts.test.jsx } finally { Pop-Location }
```

npm --prefix đổi cwd; filter bắt đầu `src/`, không lặp `dev/frontend/`. Zero tests, skipped PG suite, fixture-not-found hoặc setup failure không phải green.

---

### Task 1: PostgreSQL schema and test foundation

**Files:** migration, crm.py, conftest.py, contract_template_test_support.py, test_contract_template_management_schema.py.

**Interfaces:** ContractTemplate thêm upload_state/content_sha256/content_size/publish_requested. Helper `make_docx(text="{{customer_name}}") -> bytes`; context manager `isolated_template_catalog() -> sessionmaker` tạo/migrate schema riêng trên validated disposable PG và cleanup đúng schema nó tạo.

- [ ] **Step 1: Write real DOCX factory and failing schema tests.**

```python
# tests/contract_template_test_support.py
import io
from docx import Document

def make_docx(text="{{customer_name}}"):
    document = Document()
    document.add_paragraph(text)
    stream = io.BytesIO()
    document.save(stream)
    return stream.getvalue()
```

Test support dùng engine URL đã được conftest kiểm tra; tạo **engine riêng**, schema `tpl_test_` + uuid.hex. Recreate users và contract_templates baseline đủ cột hiện có nhưng chưa có 4 cột mới; apply actual migration mới trong transaction có SET LOCAL search_path tới schema đó. Session factory dùng engine/schema_translate_map `{None: schema, "public": schema}`, và search_path schema đó trên mỗi connection checkout để text SQL cũng đi đúng schema. Không đổi global engine. Teardown close/dispose rồi drop đúng generated schema đã kiểm regex, không public. Fixture `catalog_sessions` function-scoped yield factory từ context manager; không dùng db_session read-only hiện hữu cho writes.

Register fixture trong conftest (test support chỉ chứa helpers, không tự được pytest discover):

```python
@pytest.fixture
def catalog_sessions():
    from contract_template_test_support import isolated_template_catalog
    with isolated_template_catalog() as factory:
        yield factory
```

Helper có optional `before_migration(connection)` callback để backfill/preflight tests seed legacy rows trước khi execute migration. Default callback không ghi gì. Import helpers bằng `from contract_template_test_support import ...`; không giả định tests là Python package.

Tests actual migration: valid legacy giữ ID/key/status; draft thiếu key -> failed; duplicate published/code reject; published/archived thiếu key reject; rerun idempotent; invalid upload state reject; pending published reject; second published cùng code reject; pair unique vẫn enforce. Rollback sau mỗi expected IntegrityError.

```python
# Constraint regression in test_contract_template_management_schema.py
import pytest
from sqlalchemy.exc import IntegrityError
from src.db.models import ContractTemplate

def test_two_published_versions_are_rejected(catalog_sessions):
    with catalog_sessions.begin() as db:
        db.add(ContractTemplate(id='one', code='TEST_CODE', version=1,
            name='One', status='published', upload_state='ready',
            template_storage_key='contract-templates/TEST_CODE/v1.docx'))
    with pytest.raises(IntegrityError):
        with catalog_sessions.begin() as db:
            db.add(ContractTemplate(id='two', code='TEST_CODE', version=2,
                name='Two', status='published', upload_state='ready',
                template_storage_key='contract-templates/TEST_CODE/v2.docx'))
```

- [ ] **Step 2: Run red.** `Invoke-ContractBackendTests tests/test_contract_template_management_schema.py -v`. Distinguish assertion failure from missing runtime/dependencies.

- [ ] **Step 3: Implement preflight/DDL/backfill and ORM mirror.** Migration uses unqualified contract_templates; deployment runner sets public search_path, test runner sets isolated schema. No hardcoded SET search_path public inside file. Preflight and DDL in same transaction:

```sql
LOCK TABLE contract_templates IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT code FROM contract_templates WHERE status = 'published'
             GROUP BY code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve duplicate published template codes before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM contract_templates
             WHERE status IN ('published', 'archived')
             AND nullif(btrim(template_storage_key), '') IS NULL) THEN
    RAISE EXCEPTION 'Resolve published/archived templates without storage keys';
  END IF;
END $$;
ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS upload_state text,
  ADD COLUMN IF NOT EXISTS content_sha256 varchar(64),
  ADD COLUMN IF NOT EXISTS content_size bigint,
  ADD COLUMN IF NOT EXISTS publish_requested boolean NOT NULL DEFAULT false;
UPDATE contract_templates
SET upload_state = CASE WHEN nullif(btrim(template_storage_key), '') IS NULL
                        THEN 'failed' ELSE 'ready' END
WHERE upload_state IS NULL;
ALTER TABLE contract_templates ALTER COLUMN upload_state SET DEFAULT 'ready';
ALTER TABLE contract_templates ALTER COLUMN upload_state SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_templates_published_code
  ON contract_templates(code) WHERE status = 'published';
```

Add named CHECK constraints guarded by pg_constraint conrelid/name; mirror in SQLAlchemy CheckConstraint, pair UniqueConstraint, partial Index:

```sql
CHECK (upload_state IN ('pending', 'ready', 'failed'))
CHECK (upload_state = 'ready' OR status = 'draft')
CHECK (upload_state <> 'ready' OR nullif(btrim(template_storage_key), '') IS NOT NULL)
CHECK ((content_sha256 IS NULL AND content_size IS NULL) OR
       (content_sha256 IS NOT NULL AND content_size IS NOT NULL AND
        content_sha256 ~ '^[0-9a-f]{64}$' AND content_size BETWEEN 1 AND 20971520))
```

Preserve existing status CHECK and pair unique; model currently lacks the pair unique, so mirror it for metadata-created DBs. upload_state server/ORM default ready preserves legacy writers with key; management reservation always explicitly pending. No silent business-status changes/backfill object downloads. If preflight rejects, read-only diagnostic lists affected IDs/codes and deployment stops.

Wire migration idempotently into `_ensure_runtime_tables_and_columns` in conftest only for PostgreSQL, after baseline tables exist; resolve `/app/supabase/migrations/...` or repository path. Deploy migration **before** backend version reading new columns. Any affected fixture must use a real/private key for ready templates, not weaken constraints.

- [ ] **Step 4: Run green.** Assert actual migration and ORM-created schemas enforce same invariants; retain historical IDs/FKs/storage keys.

---

### Task 2: Bounded DOCX validation and primary-bucket inspection

**Files:** template_files.py, storage_service.py, test_contract_template_files.py, test_storage_service.py.

**Interfaces:** frozen `ValidatedTemplateFile(content, sha256, size)`; `validate_template_file(content, filename, content_type)`; sync `read_template_upload(upload: UploadFile)`; storage `inspect_contract_template_upload(key, expected_sha256, expected_size) -> Literal["missing", "matching", "conflict"]`.

- [ ] **Step 1: Write validation/recovery-inspector tests.**

```python
import io
from zipfile import ZipFile
import pytest
from fastapi import HTTPException
from contract_template_test_support import make_docx
from src.contracts.template_files import validate_template_file

def test_accepts_real_docx():
    content = make_docx()
    result = validate_template_file(content, 'Mẫu hợp đồng.docx', None)
    assert result.content == content and result.size == len(content)
    assert len(result.sha256) == 64

def test_rejects_zip_without_document_body():
    stream = io.BytesIO()
    with ZipFile(stream, 'w') as archive:
        archive.writestr('[Content_Types].xml', '<Types/>')
    with pytest.raises(HTTPException) as error:
        validate_template_file(stream.getvalue(), 'fake.docx', 'application/octet-stream')
    assert error.value.status_code == 400
```

Parameterize MIME/extension415, size413, incomplete relationships/malformed XML400, exact required entries, expansion/encryption limits. Assert bounded read + close and invalid file causes no reserve/storage. Inspector: matching/mismatch/missing; missing primary with legacy copy still missing; transient error propagates; streaming Body closes.

- [ ] **Step 2: Run red.** `Invoke-ContractBackendTests tests/test_contract_template_files.py tests/test_storage_service.py -v`.

- [ ] **Step 3: Implement real parser/dry-render validation.**

```python
import hashlib
import io
from dataclasses import dataclass
from zipfile import ZipFile
from docx import Document
from fastapi import HTTPException, UploadFile
from src.core.doc_generator import render_contract_document

MAX_TEMPLATE_BYTES = 20 * 1024 * 1024
DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

@dataclass(frozen=True)
class ValidatedTemplateFile:
    content: bytes
    sha256: str
    size: int

def validate_template_file(content: bytes, filename: str, content_type: str | None):
    if not filename.lower().endswith('.docx') or content_type not in (None, '', DOCX_MIME, 'application/octet-stream'):
        raise HTTPException(415, 'Chỉ hỗ trợ tệp DOCX')
    if len(content) > MAX_TEMPLATE_BYTES:
        raise HTTPException(413, 'Tệp DOCX vượt quá 20 MiB')
    try:
        if not content.startswith(b'PK\x03\x04'):
            raise ValueError('Invalid ZIP signature')
        with ZipFile(io.BytesIO(content)) as archive:
            members = archive.infolist()
            required = {'[Content_Types].xml', '_rels/.rels', 'word/document.xml'}
            if not required.issubset(archive.namelist()):
                raise ValueError('Incomplete DOCX package')
            if len(members) > 2048 or sum(item.file_size for item in members) > 100 * 1024 * 1024:
                raise ValueError('Expanded DOCX exceeds limits')
            if any(item.flag_bits & 1 for item in members):
                raise ValueError('Encrypted package')
        Document(io.BytesIO(content))
        render_contract_document({}, 'mau_hop_dong_v1', template_bytes=content)
    except Exception as error:
        raise HTTPException(400, 'Tệp Word DOCX không hợp lệ') from error
    return ValidatedTemplateFile(content, hashlib.sha256(content).hexdigest(), len(content))

def read_template_upload(upload: UploadFile):
    try:
        content = upload.file.read(MAX_TEMPLATE_BYTES + 1)
        return validate_template_file(content, upload.filename or '', upload.content_type)
    finally:
        upload.file.close()
```

Use sync FastAPI endpoints (threadpool) for read/parse/DB/S3; do not block event loop or concurrently share one Session across worker threads.

Storage inspector: `_require_prefix`, get_object from CONTRACT_TEMPLATE_BUCKET only, known NoSuchKey/404 -> missing. Stream bounded expected_size + 1, compare actual size/SHA-256, close Body finally. Unexpected provider errors propagate to service503. Keep upload_contract_template IfNoneMatch and existing legacy reader intact; add no delete.

- [ ] **Step 4: Run green including existing private/immutable storage tests.** Confirm IfNoneMatch remains '*'; parser rejection precedes reservation.

---

### Task 3: Reservation, recovery and serialized lifecycle service

**Files:** template_service.py, management service/concurrency tests, test support.

**Interfaces:** `ContractTemplateService` static methods dưới đây; db là dedicated request Session. Service sở hữu commit/rollback tại các phase, routes không tự commit:

| Method | Result |
| --- | --- |
| upload_new_template(db, validated, filename, code, name, description=None, publish_immediately=True, actor_id=None) | MutationResult |
| upgrade_version(db, template_id, validated, filename, name=None, description=None, publish_immediately=True, actor_id=None) | MutationResult |
| retry_upload(db, template_id, validated) | MutationResult |
| update_status(db, template_id, target_status) | MutationResult |
| list_templates(db, status='all', q=None) | list[group DTO] |
| get_template_bytes(db, template_id) | tuple[bytes, str] |
| get_placeholder_catalog() | list[category DTO] |

`MutationResult` chứa template và publication_skipped. Private `_lock_catalog`, `_reserve`, `_complete_upload`, `_finalize`, `_mark_failed` thuộc service này. Reservation helpers tạo snapshot immutable ID/key/digest/size/intent để storage phase không truy cập ORM expired attributes.

- [ ] **Step 1: Write fault-driven tests and run red.** Fixture catalog_sessions yield isolated_template_catalog factory. immutable_store fake dictionary phải enforce FileExistsError, inspector so bytes, không lambda upload luôn success.

```python
import pytest
from fastapi import HTTPException
from contract_template_test_support import make_docx
from src.contracts.template_files import validate_template_file
from src.contracts.template_service import ContractTemplateService as service
from src.db.models import ContractTemplate

def test_new_attempt_after_failed_v2_uses_v3(catalog_sessions, immutable_store):
    good = validate_template_file(make_docx('v1'), 'v1.docx', None)
    with catalog_sessions() as db:
        parent_id = service.upload_new_template(
            db, good, 'v1.docx', 'TEST_CODE', 'Test').template.id
    immutable_store.fail_next_put = True
    with catalog_sessions() as db, pytest.raises(HTTPException) as error:
        service.upgrade_version(db, parent_id, good, 'v2.docx')
    assert error.value.status_code == 503
    with catalog_sessions() as db:
        failed = db.query(ContractTemplate).filter_by(code='TEST_CODE', version=2).one()
        assert failed.status == 'draft'
        assert failed.upload_state in ('pending', 'failed')
        v3 = service.upgrade_version(db, parent_id, good, 'v3.docx').template
        assert v3.version == 3 and v3.status == 'published'
```

Define immutable_store fixture in management test support: object có objects dict và fail_next_put bool; monkeypatch service import sites upload/inspect/get. Flag làm put raise một lần rồi reset. Fake put phải read actual bytes, existing key raises FileExistsError. Fixture cleanup tự restore monkeypatch. Do not invoke fake helpers in production.

Fault acceptance matrix, assertions DB + object bytes:
- After reservation/before put failure: committed pending/failed còn, same-file retry completes same version.
- Put success/finalize commit failure: retry verifies existing bytes, không overwrite; different bytes409.
- Provider lưu bytes rồi client nhận timeout: same-file retry vẫn hội tụ.
- Reserve commit failure: không upload; response refresh có thể thấy pending nếu commit thực ra đã thành công.
- Failure marker đến sau request khác finalize: ready không thành failed.
- Retry ready/archived giữ lifecycle/metadata/filename/intent; không re-publish.
- v2 slow upload hoàn tất sau v3 published: v2 ready draft, publication_skipped true.
- Last published archive400; invalid target draft rejected before write.

- [ ] **Step 2: Implement transaction core and orchestration.**

```python
from dataclasses import dataclass
from sqlalchemy import text
from src.db.models import ContractTemplate

@dataclass(frozen=True)
class MutationResult:
    template: ContractTemplate
    publication_skipped: bool = False

def _lock_catalog(db):
    if db.get_bind().dialect.name != 'postgresql':
        raise RuntimeError('Template management requires PostgreSQL')
    db.execute(text('SELECT pg_advisory_xact_lock(240925, 1)'))
    db.expire_all()
```

Use READ COMMITTED, re-read after lock. `_reserve`: normalize code/name -> lock -> check parent/code -> max over all versions -> add UUID/key/digest/size/intent, draft/pending -> flush -> capture snapshot -> commit. Do not refresh/query between reservation commit and storage. Existing request auth transaction may already be open; do not call db.begin() blindly. On errors rollback; pair uniqueness/duplicate code409, DB connectivity/uncertain commit503. Upload starts only after successful reservation commit.

`retry_upload`: under lock read reservation, reject legacy null digest or changed SHA/size409, return ready unchanged if already complete. Capture reservation snapshot and end read transaction before storage. Preserve original name/filename/intent; no new version and no content replacement.

`_complete_upload`: immutable put; FileExistsError -> inspect primary: matching continues, conflict409, missing503. Other storage errors503. `_mark_failed` best effort in a fresh transaction using same catalog lock; update only upload_state != ready. It may leave pending if DB unavailable. Preserve original error and return sanitized message plus template_id/version. No delete or raw provider exception in response.

`_finalize`: lock -> reload ID -> if ready, return unchanged (replay); otherwise mark ready. If intent and no **higher** published version, archive current published row and flush before setting target published (partial index), commit atomically. Higher published version -> target stays draft, publication_skipped true. Finalize error rollback leaves reservation recoverable; storage is unchanged. Refresh for response only after storage is done.

`update_status`: reject target outside published/archived (service400; typed API422). Lock -> reload -> require ready/key409. Publish archives current/flush/target publish in same transaction. Archive counts published across all codes after lock, only blocks if target is published and count <= 1. Same-target repeat idempotent. First-ever catalog may contain no published; creating draft does not silently publish it.

- [ ] **Step 3: Add real PostgreSQL concurrency tests.** ThreadPoolExecutor, independent sessions from same migrated isolated factory. Barrier before service invocation; Event pauses storage to force out-of-order completion. Never place a Barrier after lock acquisition (deadlocks). future.result(timeout=10), release Events in finally. Do not mock advisory lock/count or skip to SQLite green.

| Race | Required result |
| --- | --- |
| Two archives on different published codes | One success, one400; exactly one published remains |
| Two publishes of different drafts same code | Serialized; exactly one published finally |
| Two upgrades from same parent | Distinct reserved versions, immutable bytes per key |
| Two retries same failed ID/same bytes | One row/version/object, both ready |
| Old upload finalizes after new publication | Newer stays published, older ready draft |

Inject commit/storage failures at actual phase boundaries, not source-text assertions. Also issue direct SQL to prove DB rejects second published row independently of service lock.

- [ ] **Step 4: Run green.** `Invoke-ContractBackendTests tests/test_contract_template_management.py tests/test_contract_template_management_concurrency.py -v`. Confirm required tests executed and constraints are installed.

---

### Task 4: Grouped catalog, supported placeholders and guarded API

**Files:** template_service.py, routes_contracts.py, test_contract_template_management.py, test_contract_template_catalog.py.

**Interfaces:** Design defines 7 endpoints, group/version DTO, mutation success envelope. Existing creation catalog response shape remains unchanged. All management routes use same require_template_manager dependency.

- [ ] **Step 1: Define auth fixtures and write endpoint tests.** Reuse conftest db/client/admin_user/admin_headers/unprivileged_user; do not refer to nonexistent director_headers/non_director_headers.

```python
@pytest.fixture
def named_admin_headers(db, admin_user):
    from src.core.auth import create_access_token
    admin_user.username = 'director_template_tests'
    db.commit()  # Active admin role remains assigned.
    return {'Authorization': f'Bearer {create_access_token(admin_user.id)}'}

def test_named_admin_can_list_templates(client, named_admin_headers):
    response = client.get('/api/contracts/templates/manage', headers=named_admin_headers)
    assert response.status_code == 200

@pytest.mark.parametrize('path', ['/api/contracts/templates/manage', '/api/contracts/templates/placeholders'])
def test_catalog_requires_authentication(client, path):
    assert client.get(path).status_code == 401
```

Extend matrix to **all 7 methods/paths**, valid request bodies/files and seeded IDs: unauth401; non-director403; named admin success; permission denied403. To isolate second gate, override only `_contract_create_for_templates` dependency to return unprivileged_user (simulate permission already granted), leave actual is_director DB query in place, remove override finally. Separate tests keep first dependency real to assert contract:create gate. Never mock is_director=True for named-admin success.

- [ ] **Step 2: Implement grouped DTO and supported catalog.** Find codes with at least one version matching both status/q; fetch full history for those codes ordered version desc. latest_version is actual max; active_template published or null; display_template newest; group name from display_template. Join creator User/Employee to show full_name with username fallback; null actor yields null. Serialize allowlisted design fields only, no key/digest/provider raw errors. can_retry requires pending/failed and digest/size.

Placeholders are exactly the 13 supported keys listed in design. Vietnamese labels/examples; display braces. Test advertised key set against both generation snapshot and current-render data from real service fixtures; render a DOCX containing every advertised key and assert no unresolved advertised tags remain. Do not add id_card_*, email or representative_* fields to silence tests; sales_source can be empty on legacy rerender and date/amount formats retain existing behavior.

- [ ] **Step 3: Add guard/schema and sync routes.**

```python
from typing import Literal
from fastapi import Depends, File, Form, UploadFile, Response, HTTPException
from pydantic import BaseModel, ConfigDict
from src.dossiers.actor_guard import is_director
from src.contracts.template_files import read_template_upload
from src.contracts.template_service import ContractTemplateService

_contract_create_for_templates = require_permission('contract', 'create')

def require_template_manager(db: Session = Depends(get_db),
                             user: User = Depends(_contract_create_for_templates)):
    if not is_director(db, user.id):
        raise HTTPException(403, 'Chỉ Giám đốc hoặc Quản trị viên mới có quyền thao tác')
    return user

class ContractTemplateStatusUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    status: Literal['published', 'archived']

@router.get('/templates/placeholders')
def get_template_placeholders(user: User = Depends(require_template_manager)):
    return ContractTemplateService.get_placeholder_catalog()

@router.get('/templates/{template_id}/download')
def download_template_docx(template_id: str, db: Session = Depends(get_db),
                           user: User = Depends(require_template_manager)):
    content, filename = ContractTemplateService.get_template_bytes(db, template_id)
    return Response(content=content, media_type=DOCX_MEDIA_TYPE, headers={
        'Content-Disposition': build_content_disposition_header(filename, disposition='attachment'),
        'Access-Control-Expose-Headers': 'Content-Disposition',
    })
```

Remaining thin route bindings:

| Method/path | Inputs -> service | Response |
| --- | --- | --- |
| GET /templates/manage | Literal status all/draft/published/archived, q -> list_templates | 200 groups |
| POST /templates/upload | File, code/name/description/publish_immediately Form -> read_template_upload -> upload_new_template, actor_id=user.id | 201 envelope |
| POST /templates/{id}/versions | File, optional name/description, publish_immediately -> validator -> upgrade_version | 201 envelope |
| POST /templates/{id}/retry-upload | File only -> validator -> retry_upload | 200 envelope |
| POST /templates/{id}/status | typed payload -> update_status | 200 envelope |

Each binding includes Depends(require_template_manager) and shared get_db. Use `def` routes so bounded parser/DB/S3 execute in FastAPI worker threadpool, not async event loop. The whole request uses one Session sequentially. Form import is new. Place literal routes before broad ID/path matchers, retain contract_id:path behavior.

get_template_bytes: missing ID404, not-ready/key409; ready uses existing get_contract_template reader, storage failure503 (no substitute render). Return original/safe fallback filename; build header with existing helper. Envelope contains status=success, data=version DTO, publication_skipped boolean. Error detail after reservation carries message/template_id/version; frontend may refresh to find reserved row, never receives storage key.

- [ ] **Step 4: Run HTTP/DTO tests.** Include status draft422, archive-last400, not-ready409, duplicate-code409, same-file retry200, mismatch409, size413, parser400, Unicode filename200 + filename*=UTF-8 and correct bytes. Invalid metadata/file must cause no reservation/storage calls. Filters must retain history/actual max, empty published active_template must be null. Assert unprivileged /placeholders403.

`Invoke-ContractBackendTests tests/test_contract_template_management.py tests/test_contract_template_catalog.py -v`.

---

### Task 5: Management UI, upload/retry and version history

**Files:** ContractTemplateManager.jsx, contractTemplateManager.css, ContractTemplateManager.test.jsx.

**Interfaces:** Optional onClose prop. Reuse apiFetch/downloadFile, useToast from `../../contexts/ToastContext`. State: groups, searchQuery, statusFilter, selectedVersion, mode (`new | version | retry`), file/code/name/description/publishImmediately, uploadModalOpen, loading/error/submitting, cheatSheetOpen. All IDs/version numbers come from server.

- [ ] **Step 1: Write interaction tests and run red.** Mock apiFetch/downloadFile/useToast; use File/fireEvent, matching installed dependencies. Fixtures cover published v1, failed v2, ready draft v3, archived v0 and group without published.

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import ContractTemplateManager from './ContractTemplateManager'
import { apiFetch, downloadFile } from '../../lib/api'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn(), downloadFile: vi.fn() }))
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))
beforeEach(() => vi.clearAllMocks())

it('shows failed-version recovery while keeping the published version usable', async () => {
  const v1 = { id: 'v1', code: 'TEST_CODE', version: 1, name: 'Mẫu test',
    status: 'published', upload_state: 'ready', template_file_name: 'v1.docx', can_retry: false }
  const v2 = { ...v1, id: 'v2', version: 2, status: 'draft',
    upload_state: 'failed', template_file_name: 'v2.docx', can_retry: true }
  apiFetch.mockResolvedValue([{ code: 'TEST_CODE', name: 'Mẫu test', latest_version: 2,
    active_template: v1, display_template: v2, versions: [v2, v1] }])
  render(<ContractTemplateManager />)
  expect(await screen.findByText('Tải lên thất bại')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Thử tải lại cùng tệp v2/i })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: /Tải file DOCX v1/i }))
  await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(
    '/api/contracts/templates/v1/download', 'v1.docx'))
})
```

Add q URL encoding/status filters, action by version ID, extension/size validation before request, actual FormData fields, double-submit once, retry uses same ID and no new-version POST, timeout/error retains file and refreshes list, publication_skipped toast, archive-last error, clipboard success/rejection, loading/empty/fetch errors. Keep form controls accessible via labels. Render-only test is insufficient.

- [ ] **Step 2: Implement list/history and upload modal.**

```jsx
const listPath = `/api/contracts/templates/manage?${new URLSearchParams({
  status: statusFilter, q: searchQuery.trim(),
})}`

const submitUpload = async (event) => {
  event.preventDefault()
  if (submitInFlight.current || !file) return
  if (!file.name.toLowerCase().endsWith('.docx') || file.size > 20 * 1024 * 1024) {
    addToast('Chọn tệp DOCX không quá 20 MiB', 'error')
    return
  }
  const payload = new FormData()
  payload.append('file', file)
  if (mode !== 'retry') {
    payload.append('name', name.trim())
    payload.append('description', description.trim())
    payload.append('publish_immediately', String(publishImmediately))
    if (mode === 'new') payload.append('code', code.trim())
  }
  const path = mode === 'new' ? '/api/contracts/templates/upload'
    : `/api/contracts/templates/${selectedVersion.id}/${mode === 'retry' ? 'retry-upload' : 'versions'}`
  submitInFlight.current = true
  setSubmitting(true)
  try {
    const result = await apiFetch(path, { method: 'POST', body: payload, timeout: 60000 })
    addToast(result.publication_skipped
      ? 'Tệp đã sẵn sàng ở bản nháp vì có phiên bản mới hơn đang ban hành'
      : 'Đã lưu mẫu hợp đồng', 'success')
    setUploadModalOpen(false)
    setFile(null)
  } catch (error) {
    addToast(error.message || 'Không thể hoàn tất tải mẫu; kiểm tra phiên bản trong danh sách', 'error')
  } finally {
    submitInFlight.current = false
    setSubmitting(false)
    await loadTemplates()
  }
}
```

Define `submitInFlight = useRef(false)` alongside state. New form requires normalized valid code + nonempty name; upgrade name may be blank (inherit); retry only asks same file, shows original filename and explains original publication choice retained. Do not expose or require digest input.

`loadTemplates()` uses apiFetch(listPath), updates groups/loading/error, catches list error separately to avoid replacing mutation toast. Use AbortController for each load, abort previous on filter change/unmount, pass signal so apiFetch does not return stale cached data. Guard late response against aborted request. Refresh after each success **or failure** (server may have reserved a version). Do not automatically repeat create/upgrade POST after timeout. Existing mutation invalidation plus fresh creation-catalog fetch must surface new published version in composer.

History actions target version.id. ready -> downloadFile and published/archived JSON status POST. pending/failed -> disable download/lifecycle, retry only can_retry; all groups can create new version. Show current published separately from latest upload. Do not compute/optimistically assign next version on client. Download errors and not-ready states have visible feedback.

- [ ] **Step 3: Add placeholder drawer and scoped styles.** Lazy-fetch catalog on open, group labels/examples/copy buttons. Clipboard writeText with try/catch and toast. Show supported paragraph/table scope and legacy-field caveats from design. Scope CSS below `.contract-template-manager`, use current modal/focus/keyboard conventions, no new UI package.

- [ ] **Step 4: Run green.** `npm --prefix dev/frontend test -- src/features/contracts/ContractTemplateManager.test.jsx`. Verify full input/action interactions, not only title/list.

---

### Task 6: Contracts integration and historical compatibility

**Files:** Contracts.jsx, Contracts.test.jsx, test_contract_template_selection.py, test_contract_document_renderer.py, test_contract_template_management.py.

**Interfaces:** contractView list/templates; existing isDirector prop; existing composer creation-catalog fetch remains source of selection.

- [ ] **Step 1: Write view and lifecycle regression tests.** true -> tab/click manager/back; false -> neither tab nor manager; rerender true to false while templates selected -> list only. Retain existing Contracts test cases/mocks.

Backend lifecycle regression uses real DOCX markers `V1 {{customer_name}}` / `V2 {{customer_name}}`: upload v1, create contract through current service/API fixtures selecting v1, upgrade v2, create new contract selecting v2, open both documents and parse XML/body to check version marker and replaced name. Cover stored generated document first, and separate legacy rerender case without generated object. Assert v1 template ID/key/bytes hash unchanged. Use fake storage for unit path and real isolated storage smoke in Task 7.

- [ ] **Step 2: Add guarded view and preserve composer behavior.**

```jsx
import ContractTemplateManager from '../features/contracts/ContractTemplateManager'
// In Contracts component:
const [contractView, setContractView] = useState('list')
const showTemplates = isDirector && contractView === 'templates'
```

Render two view buttons only for isDirector. Body shows manager only if showTemplates; otherwise original list/stats. Keep composer/create/list toolbar actions in list view, retain existing list filters and selected-contract state. `openContractModal` still fetches `/api/contracts/templates`; pick published template **ID** from refreshed catalog. No rewrite of composer business fields or backend renderer.

- [ ] **Step 3: Run focused regressions.**

```powershell
npm --prefix dev/frontend test -- src/pages/Contracts.test.jsx src/features/contracts/ContractComposer.test.jsx src/features/contracts/ContractTemplateManager.test.jsx
Invoke-ContractBackendTests tests/test_contract_template_selection.py tests/test_contract_document_renderer.py tests/test_contract_template_management.py -v
```

Check archived v1 original content, new v2 selection/persistence, and non-manager users can still create contracts under existing permission.

---

### Task 7: Full acceptance and handoff

**Files:** Introduced/extended tests; design/plan only if final behavior changes. No automatic commit/push.

- [ ] **Step 1: Run complete backend feature acceptance including existing omitted suites.**

```powershell
Invoke-ContractBackendTests tests/test_contracts.py tests/test_contract_template_selection.py tests/test_contract_template_catalog.py tests/test_contract_document_renderer.py tests/test_contract_template_storage.py tests/test_storage_service.py tests/test_bootstrap_contract_template.py tests/test_contract_template_files.py tests/test_contract_template_management_schema.py tests/test_contract_template_management.py tests/test_contract_template_management_concurrency.py -v
```

- [ ] **Step 2: Run frontend acceptance/build.**

```powershell
npm --prefix dev/frontend test -- src/features/contracts/ src/pages/Contracts.test.jsx src/lib/api.test.js
npm --prefix dev/frontend run build
```

- [ ] **Step 3: Browser/private-storage smoke with synthetic data.** Use named active admin-role user (not username admin). Upload DOCX with Vietnamese filename, download/open, upgrade, verify one published, create contract with latest, open pre-upgrade contract and verify V1 marker. Inject one failed upload only in isolated test environment, refresh/retry same file, confirm version gap after a separate new attempt. Verify non-director hidden UI and direct API403. Do not disable shared storage or mutate real customer documents. Record observed results; mocked tests are not E2E proof.

- [ ] **Step 4: Review against design and run checks.**

```powershell
git diff --check
node .gitnexus/run.cjs detect-changes --scope all --repo .
```

Report graph partial/truncated/UNKNOWN with corroboration; re-run required checks instead of treating unseen paths as safe. Record migration preflight, commands/counts, smoke results and unresolved risks. Commit/push only on later user instruction. Do not extend fields/renderer scope to make tests pass.

## Review findings -> acceptance mapping

| Finding | Resolution |
| --- | --- |
| User.is_director absent on ORM | Task 4 role helper, named-admin and non-director tests on all 7 APIs |
| draft bypasses archive guard | Task 3 service rejection; Task 4 typed schema422 |
| concurrency breaks publication | Task 1 DB constraints; Task 3 global lock and real two-session races |
| invalid ZIP accepted | Task 2 parser/dry-render/bounds, no writes on rejection |
| uploaded object poisons failed version | Task 3 durable reservation, same-file identity reconciliation/retry, approved version gaps |
| Vietnamese filename crash | Task 4 existing Unicode header helper and binary/header test |
| missing fixtures/wrong test filters/coverage | Task 1/4 concrete fixtures, src filters, Task 6/7 consumer regression/smoke |
| unsupported placeholder promises | Task 4 supported 13-key catalog, design alignment, render round-trip |

**Completion criteria:** Required PostgreSQL/API/UI/consumer tests pass, actual private-storage smoke is recorded, and behavior matches revised design. Runtime-blocked checks remain explicitly unverified; do not mark feature complete from mocks alone.
