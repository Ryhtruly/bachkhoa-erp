# Checklist Document Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho nhân viên chọn hoặc tạo loại giấy ngay trong checklist, gắn nhiều file, để Giám đốc duyệt theo loại giấy; checklist 100% mới hiện trong Tủ hồ sơ và loại mới mới được học vào Mẫu giấy tờ đúng combo.

**Architecture:** Materialize loại giấy của mỗi checklist runtime vào bảng riêng thay vì sửa graph workflow. Mọi loại giấy—cấu hình sẵn hoặc nhân viên tạo—dùng chung một state machine và bảng file; Mẫu giấy tờ chỉ nhận loại mới sau khi checklist đạt 100% qua applicability `COMBO` chính xác.

**Tech Stack:** FastAPI, SQLAlchemy text queries, PostgreSQL/Supabase migrations, React 19, Vitest, Testing Library, CSS.

**Spec:** `docs/superpowers/specs/2026-09-04-checklist-document-types-design.md`

## Global Constraints

- Giữ mã DB nguồn giấy: `KHACH_HANG`, `CONG_TY`, `CO_QUAN`; UI hiển thị `CO_QUAN` là “Pháp lý”.
- Gợi ý nhân viên chỉ khớp chính xác `service_package_id + task_type_id + node_code`; không fallback PACKAGE/TASK_TYPE/GLOBAL.
- Giám đốc duyệt theo loại giấy, không theo từng file; Đạt yêu cầu ít nhất một file hoạt động, Không đạt bắt buộc lý do.
- Checklist chưa 100% tuyệt đối không xuất hiện trong Tủ hồ sơ.
- Loại mới chỉ promote vào Mẫu giấy tờ sau khi checklist 100%.
- Một loại giấy nhận nhiều file/ảnh; object lưu trữ không bị copy khi duyệt/promote.
- Desktop cố định theo viewport và cuộn nội bộ; mobile dưới 980px cuộn trang tự nhiên.
- Giữ nguyên hàng rào K06: thu đủ hoặc phiếu nợ được duyệt mới nghiệm thu/bàn giao.
- Worktree đang có thay đổi của đợt trước: không reset, không stage hoặc sửa ngoài danh sách file của từng task.
- Trước mỗi sửa đổi symbol, chạy impact analysis; nếu HIGH/CRITICAL phải báo người dùng trước khi sửa.

---

### Task 1: Schema loại giấy runtime và phạm vi COMBO

**Files:**
- Create: `supabase/migrations/20260904090000_checklist_document_types.sql`
- Create: `supabase/migrations/20260904090000_checklist_document_types_down.sql`
- Create: `dev/backend/src/dossiers/checklist_document_types.py`
- Create: `dev/backend/tests/test_checklist_document_types_unittest.py`

**Interfaces:**
- Produces: `DocumentTypeStatus`, `SOURCE_LABELS`, `checklist_context(db, checklist_result_id)`, `progress(db, checklist_result_id)`.
- Consumes: existing `task_node_checklist_results`, `dossier_documents`, `document_checklist_templates`, `document_template_applicabilities`.

- [ ] **Step 1: Run impact analysis on schema consumers**

Run graph impact for `applicable_templates`, `_APPLICABLE_TEMPLATES_QUERY`, `task_node_checklist_results` creation flows and `checklist_cabinet_by_node`. Record direct callers and risk before editing.

- [ ] **Step 2: Write failing domain tests**

Create tests that name the required invariants:

```python
class ChecklistDocumentTypeProgressTests(unittest.TestCase):
    def test_checklist_is_100_only_when_every_active_type_is_approved(self):
        db = rows([
            {"status": "approved", "file_count": 2},
            {"status": "pending_review", "file_count": 1},
        ])
        self.assertEqual(progress(db, "CR-1"), {
            "approved": 1, "total": 2, "percent": 50, "is_complete": False,
        })

    def test_empty_document_checklist_is_not_publishable_to_cabinet(self):
        self.assertEqual(progress(rows([]), "CR-EMPTY")["is_complete"], False)
```

Also test source labels and that rejected/missing-file rows never count approved.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
cd dev/backend
PYTHONPATH=. ./venv/bin/python -m unittest tests.test_checklist_document_types_unittest -v
```

Expected: import failure for `src.dossiers.checklist_document_types`.

- [ ] **Step 4: Add additive migration**

Create `checklist_result_document_types` with:

```sql
create table public.checklist_result_document_types (
  id varchar primary key default gen_random_uuid()::text,
  checklist_result_id varchar not null references public.task_node_checklist_results(id) on delete cascade,
  template_id varchar references public.document_checklist_templates(id),
  slot_id varchar references public.dossier_document_slots(id),
  name varchar not null,
  normalized_name varchar not null,
  source varchar not null check (source in ('KHACH_HANG','CONG_TY','CO_QUAN')),
  origin varchar not null check (origin in ('CONFIGURED','EMPLOYEE_CREATED')),
  status varchar not null default 'draft'
    check (status in ('draft','pending_review','approved','rejected')),
  rejection_reason text,
  promoted_template_id varchar references public.document_checklist_templates(id),
  is_active boolean not null default true,
  created_by varchar references public.users(id),
  reviewed_by varchar references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (status <> 'rejected' or nullif(trim(rejection_reason), '') is not null)
);

create unique index ux_checklist_document_type_active_name_source
  on public.checklist_result_document_types
  (checklist_result_id, normalized_name, source) where is_active;
```

Create `checklist_result_document_type_files` with unique active `(document_type_id, document_id)`, audit columns and `is_active`.

Replace the applicability shape check so `COMBO` requires all three keys; add:

```sql
create unique index ux_tpl_app_combo
  on public.document_template_applicabilities
  (template_id, service_package_id, task_type_id, node_code)
  where applicability_type = 'COMBO';
```

The down migration drops only new tables/index and restores the previous applicability shape check.

- [ ] **Step 5: Implement status/progress foundation**

In `checklist_document_types.py` define:

```python
class DocumentTypeStatus(str, Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"

def progress(db: Session, checklist_result_id: str) -> dict[str, Any]:
    rows = [dict(row) for row in db.execute(text("""
        select t.status, count(f.document_id) filter (where f.is_active) as file_count
        from public.checklist_result_document_types t
        left join public.checklist_result_document_type_files f
          on f.document_type_id = t.id and f.is_active
        where t.checklist_result_id = :id and t.is_active
        group by t.id, t.status
    """), {"id": checklist_result_id}).mappings().all()]
    total = len(rows)
    approved = sum(1 for row in rows if row["status"] == "approved" and row["file_count"] > 0)
    return {
        "approved": approved,
        "total": total,
        "percent": round(approved * 100 / total) if total else 0,
        "is_complete": total > 0 and approved == total,
    }
```

`checklist_context` must derive contract, service line, package, task type and node server-side from checklist ID.

- [ ] **Step 6: Run unit tests and schema preflight**

Run the unit command from Step 3, then:

```bash
cd dev/backend
PYTHONPATH=. ./venv/bin/python -m py_compile src/dossiers/checklist_document_types.py
```

If a disposable test database is configured, run Alembic/Supabase schema tests; otherwise run `git diff --check` on both SQL files and record that DB integration remains environment-dependent.

- [ ] **Step 7: Commit Task 1 only**

Run `detect_changes()` first. Then stage only the four Task 1 files and commit:

```bash
git commit -m "feat(dossier): add runtime checklist document types"
```

---

### Task 2: Materialize configured types and exact-combo suggestions

**Files:**
- Modify: `dev/backend/src/dossiers/checklist_document_types.py`
- Modify: `dev/backend/src/contracts/workflow_runtime.py:1538,1709,2051`
- Modify: `dev/backend/src/dossiers/register.py:67-115`
- Modify: `dev/backend/tests/test_checklist_document_types_unittest.py`
- Modify: `dev/backend/tests/test_service_line_register_scope.py`

**Interfaces:**
- Produces: `materialize_configured_types(db, checklist_result_id, actor_id=None) -> int`.
- Produces: `exact_combo_suggestions(db, checklist_result_id) -> dict[str, Any]`.
- Consumes: `checklist_context` from Task 1 and graph `output_documents` for the runtime checklist.

- [ ] **Step 1: Write failing materialization tests**

Test that two graph outputs create two `CONFIGURED` rows, rerunning creates zero duplicates, and names/sources come from `document_checklist_templates`, not graph/client values.

```python
created = materialize_configured_types(db, "CR-1")
self.assertEqual(created, 2)
self.assertIn("on conflict", emitted_sql(db).lower())
```

- [ ] **Step 2: Write failing suggestion tests**

Use fixtures containing exact COMBO, wrong package, wrong task type, wrong node and legacy GLOBAL rows. Assert only exact COMBO is returned and context labels are present.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd dev/backend
PYTHONPATH=. ./venv/bin/python -m unittest \
  tests.test_checklist_document_types_unittest \
  tests.test_service_line_register_scope -v
```

Expected: missing functions or wrong broad applicability behavior.

- [ ] **Step 4: Implement exact COMBO query**

Add a dedicated query; do not reuse broad `applicable_templates`:

```sql
where a.applicability_type = 'COMBO'
  and a.service_package_id = :service_package_id
  and a.task_type_id = :task_type_id
  and a.node_code = :node_code
  and a.is_default
  and coalesce(t.is_active, true)
```

Return `template_id`, `name`, `source`, `source_label` plus read-only combo context.

- [ ] **Step 5: Materialize at all checklist creation points**

After each successful insert into `task_node_checklist_results` at the three workflow-runtime creation paths, call `materialize_configured_types` with the returned checklist ID. Change inserts to `returning id` where needed. Do not materialize from a GET request.

Add migration backfill SQL for existing checklist results by expanding each checklist’s graph `output_documents`, joining templates and inserting idempotently.

- [ ] **Step 6: Extend broad applicability without changing employee suggestion semantics**

Update `_APPLICABILITY_RANK` with `COMBO: 4` and allow `_APPLICABLE_TEMPLATES_QUERY` to match COMBO only when all current service-line/node context is available. The employee suggestion function remains exact-COMBO-only.

- [ ] **Step 7: Run tests and commit**

Run Step 3 commands plus workflow-runtime unit tests covering checklist creation. Run `detect_changes()`, inspect all affected workflow creation processes, then commit only Task 2 files:

```bash
git commit -m "feat(workflow): materialize checklist document types"
```

---

### Task 3: Add/select a type and attach multiple files

**Files:**
- Modify: `dev/backend/src/dossiers/checklist_document_types.py`
- Modify: `dev/backend/src/dossiers/documents.py:1057-1150`
- Modify: `dev/backend/src/routes/routes_employee_portal.py`
- Modify: `dev/backend/tests/test_checklist_document_types_unittest.py`
- Modify: `dev/backend/tests/test_dossier_documents_unittest.py`
- Create: `dev/backend/tests/test_checklist_document_type_routes.py`

**Interfaces:**
- Produces: `add_type(db, *, checklist_result_id, template_id=None, name=None, source=None, actor_id) -> dict`.
- Produces: `add_files(db, *, document_type_id: str, uploads: list[tuple[str, str | None, bytes]], actor_id: str) -> list[dict]`.
- Produces: `remove_file(db, *, document_type_id: str, document_id: str, actor_id: str) -> dict`.
- Produces: `attach_existing_file(db, *, document_type_id: str, document_id: str, actor_id: str) -> dict` for raw customer documents.
- Exposes the three employee endpoints defined in the spec.

- [ ] **Step 1: Write failing add-type tests**

Cover:

```python
def test_existing_template_ignores_forged_name_and_source(self):
    result = add_type(
        self.db, checklist_result_id="CR-1", template_id="TPL-CCCD",
        name="Tên giả", source="CONG_TY", actor_id="NV-1",
    )
    self.assertEqual((result["name"], result["source"]), ("CCCD", "KHACH_HANG"))

def test_new_type_rejects_unknown_source(self):
    with self.assertRaises(HTTPException) as caught:
        add_type(
            self.db, checklist_result_id="CR-1", template_id=None,
            name="Ảnh mốc phụ", source="NGUON_BIA", actor_id="NV-1",
        )
    self.assertEqual(caught.exception.status_code, 422)

def test_duplicate_normalized_name_and_source_is_rejected(self):
    self.db.execute.side_effect = duplicate_name_fixture()
    with self.assertRaises(HTTPException) as caught:
        add_type(
            self.db, checklist_result_id="CR-1", template_id=None,
            name="  CCCD  ", source="KHACH_HANG", actor_id="NV-1",
        )
    self.assertEqual(caught.exception.status_code, 409)

def test_same_name_different_source_is_allowed(self):
    result = add_type(
        self.db, checklist_result_id="CR-1", template_id=None,
        name="Giấy xác nhận", source="CO_QUAN", actor_id="NV-1",
    )
    self.assertEqual(result["source"], "CO_QUAN")
```

Assert selected templates are part of the exact combo before insertion.

- [ ] **Step 2: Write failing multi-file tests**

Upload three in-memory files to one type and assert three active link rows and `file_count == 3`. Test invalid extension, oversized file, approved type lock and rejected type returning to draft when its file set changes.

Add a raw-document regression: assigning a customer source document to a configured
type must create the active type-file relationship, disappear from the raw warehouse,
and reject a target whose source is not `KHACH_HANG`.

- [ ] **Step 3: Run tests and verify RED**

Run both Task 3 test files. Expected: missing add/file methods and routes.

- [ ] **Step 4: Implement add_type**

For `template_id`, load name/source exclusively from the exact-combo suggestion query. For new type, normalize whitespace/name and validate source. Derive checklist/node ownership server-side.

Return:

```python
{
  "id": type_id, "template_id": template_id, "name": name,
  "source": source, "origin": origin, "status": "draft",
  "files": [], "file_count": 0,
}
```

- [ ] **Step 5: Implement multi-file storage**

Reuse `_validate_upload`, `DossierFileReference`, `ensure_bucket` and `upload_file`. Create one `dossier_documents` row per file and one active type-file link. Do not create official slot/checklist links yet.

Process files one-by-one and return per-file success/failure; a failed file does not roll back already successful uploads. DB work for each successful file uses its own savepoint.

Extend `classify_source_document_for_checklist` to resolve the runtime type by
`document_type_id` (preferred) or legacy `template_id`, call `attach_existing_file`
inside the same transaction, and retain the existing source/audit checks.

- [ ] **Step 6: Add authorized routes**

Add:

```python
@router.get("/tasks/{task_node_id}/checklist/{checklist_result_id}/document-type-suggestions")
@router.post("/tasks/{task_node_id}/checklist/{checklist_result_id}/document-types")
@router.post("/tasks/{task_node_id}/checklist/{checklist_result_id}/document-types/{type_id}/files")
@router.delete("/tasks/{task_node_id}/checklist/{checklist_result_id}/document-types/{type_id}/files/{document_id}")
```

Every route calls the existing assignment authorization before the domain method. Upload route uses `files: list[UploadFile] = File()` and enforces at least one file.

- [ ] **Step 7: Run tests, compile and commit**

Run Task 3 tests, existing dossier tests and `py_compile`. Run `detect_changes()` before committing:

```bash
git commit -m "feat(employee): add document types with multiple files"
```

---

### Task 4: Submit, review by type, return intact and promote at 100%

**Files:**
- Modify: `dev/backend/src/dossiers/checklist_document_types.py`
- Modify: `dev/backend/src/contracts/workflow_runtime.py:4148-4235,4458-4620`
- Modify: `dev/backend/src/routes/routes_contracts.py:1440-1565`
- Modify: `dev/backend/src/routes/routes_employee_portal.py:950-1010`
- Modify: `dev/backend/src/dossiers/slot_requests.py:430-590`
- Modify: `dev/backend/tests/test_checklist_document_types_unittest.py`
- Modify: `dev/backend/tests/test_workflow_runtime_unittest.py`

**Interfaces:**
- Produces: `submit_types_for_node(db, task_node_id, actor_id) -> dict`.
- Produces: `review_type(db, *, checklist_result_id, type_id, decision, reason, actor_id) -> dict`.
- Produces: `promote_completed_checklist_types(db, checklist_result_id, actor_id) -> list[str]`.

- [ ] **Step 1: Write failing submission tests**

Assert node submission:

- rejects active types with zero files;
- atomically changes draft/rejected types to `pending_review` and clears old reason;
- preserves approved types during resubmission;
- leaves K06 debt/paid gate unchanged.

- [ ] **Step 2: Write failing review tests**

Assert review is type-level, only while node is `submitted`; reject requires a nonblank reason; approve requires active files. Reject returns the node through existing rework mechanism without deleting types or files.

- [ ] **Step 3: Write failing 100% promotion tests**

Fixtures: two types, first approved and second pending. Approving second must, in the same transaction:

1. make progress 100%;
2. create/reuse template for each `EMPLOYEE_CREATED` type;
3. insert exact COMBO applicability with package + task type + node;
4. set `promoted_template_id`;
5. materialize official slot/document links without copying files.

Rerunning must create no duplicate template/applicability/link.

- [ ] **Step 4: Run focused tests and verify RED**

Expected failures: submission does not know runtime types, review is document-level, promotion scope lacks COMBO.

- [ ] **Step 5: Implement submission integration**

Call `submit_types_for_node` inside `submit_task_node_for_acceptance` before final node status update, under the existing node/checklist locks. Do not add a second employee “Gửi duyệt” endpoint.

- [ ] **Step 6: Implement type review and promotion**

`review_type` locks the checklist row and type row. On reject, write reason and delegate node return/notification to existing review batch/rework functions. On approval, clear reason, calculate progress, and call promotion only when `is_complete` turns true.

Refactor `_promote_template_by_scope` into a reusable exact helper without changing legacy request behavior:

```python
promote_template_for_combo(
    db, *, name, source, service_package_id, task_type_id,
    node_code, actor_id,
) -> str
```

- [ ] **Step 7: Add director route**

```python
@router.post("/workflow/checklist/{checklist_result_id}/document-types/{type_id}/review")
```

Use existing `task_node:approve` permission and transaction rollback/publish timeline conventions.

- [ ] **Step 8: Run regression tests and commit**

Run checklist, workflow review, K06 debt and slot-request suites. Run `detect_changes()` and warn on HIGH/CRITICAL affected workflow processes before commit:

```bash
git commit -m "feat(workflow): review document types and promote at completion"
```

---

### Task 5: Serialize runtime types and gate the shared Tủ hồ sơ

**Files:**
- Modify: `dev/backend/src/employee_portal/service.py:640-940`
- Modify: `dev/backend/src/dossiers/register.py:144-270`
- Modify: `dev/backend/tests/test_checklist_document_types_unittest.py`
- Modify: `dev/backend/tests/test_dossier_documents_unittest.py`

**Interfaces:**
- Produces checklist fields `document_types` and `document_type_progress`.
- Produces `checklist_cabinet_by_node` containing only completed checklists and all active files/counts.

- [ ] **Step 1: Write failing serialization test**

Assert an employee task checklist returns full real structure:

```json
{
  "id":"CRT-1",
  "template_id":null,
  "name":"Ảnh mốc phụ",
  "source":"CONG_TY",
  "source_label":"Công ty soạn/lập",
  "origin":"EMPLOYEE_CREATED",
  "status":"rejected",
  "rejection_reason":"Ảnh mờ",
  "files":[{"document_id":"D-1","file_name":"moc.jpg","content_type":"image/jpeg"}],
  "file_count":1
}
```

- [ ] **Step 2: Write failing cabinet tests**

Create one 99% checklist and one 100% checklist. Assert the first contributes zero rows; the second returns every type with exact active `file_count` (including a three-file type). Assert contract sidebar and employee cabinet consume the same field.

- [ ] **Step 3: Run tests and verify RED**

Expected: `document_types` missing and cabinet currently returns partial/latest-only rows.

- [ ] **Step 4: Implement batched serializer**

Load all types/files for all checklist IDs in one query per profile response; group in Python Maps keyed by checklist ID and type ID. Do not issue one query per checklist/type.

- [ ] **Step 5: Replace cabinet query source**

Rewrite `checklist_cabinet_by_node` to join runtime types, active type files and checklist progress. Filter with a grouped `HAVING bool_and(status='approved' and file_count>0)` or equivalent completed-checklist CTE. Aggregate all files as JSON and `count(distinct document_id)`.

- [ ] **Step 6: Run tests and commit**

Run service/profile and dossier register suites, `py_compile`, `detect_changes()`, then:

```bash
git commit -m "feat(dossier): publish only completed checklists to cabinet"
```

---

### Task 6: Employee picker, multi-file rows and compact fixed workspace

**Files:**
- Create: `dev/frontend/src/features/employee-portal/ChecklistDocumentTypePicker.jsx`
- Create: `dev/frontend/src/features/employee-portal/ChecklistDocumentTypePicker.test.jsx`
- Modify: `dev/frontend/src/features/employee-portal/NodeOutputList.jsx`
- Modify: `dev/frontend/src/features/employee-portal/NodeOutputList.test.jsx`
- Modify: `dev/frontend/src/features/employee-portal/CustomerSourceDocuments.jsx`
- Modify: `dev/frontend/src/features/employee-portal/CustomerSourceDocuments.test.jsx`
- Modify: `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx`
- Modify: `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.test.jsx`
- Modify: `dev/frontend/src/features/employee-portal/employeeWorkspace.css`

**Interfaces:**
- `ChecklistDocumentTypePicker({taskNodeId, checklistResultId, onAdded, onClose, addToast})`.
- `NodeOutputList` consumes `checklistItem.document_types` first and legacy `output_documents` only as fallback.

- [ ] **Step 1: Run UI impact analysis and load craft floor**

Run upstream impact for `EmployeeItemWorkspace`, `NodeOutputList`, `NodeActionBar`; report any HIGH/CRITICAL callers. Read Impeccable `reference/craft-floor.md` immediately before CSS/component edits.

- [ ] **Step 2: Write failing picker tests**

Cover exact suggestion render, search, locked source when selecting CCCD, “Không thấy — Tạo mới”, three source choices for new type, multiple selected files, exact POST payload and multi-file upload endpoint.

- [ ] **Step 3: Run picker test and verify RED**

Run:

```bash
cd dev/frontend
npm test -- --run src/features/employee-portal/ChecklistDocumentTypePicker.test.jsx
```

Expected: component missing.

- [ ] **Step 4: Implement inline dropdown picker**

Use a native accessible combobox/listbox pattern already present in the repo. Fetch suggestions only when opened. Selecting a suggestion sends only `template_id`; creating sends `{name, source}`. After type creation, upload selected files with one multipart request, then call `onAdded`.

The context line is read-only:

```jsx
<p className="eiw-type-picker__context">
  {packageName} · {taskTypeName} · {nodeCode}
</p>
```

Primary action copy is “Thêm vào checklist”; no “Gửi duyệt”.

- [ ] **Step 5: Write failing employee-row tests**

Assert one type with three files renders `3 file`, expands all three names, and has one approval status for the type. Assert rejected row shows exact reason and upload is available; approved row has checkmark and no upload.

Add a raw-warehouse test asserting assignment targets come from
`checklistItem.document_types`, send `document_type_id`, and exclude non-customer
types even when they exist in the same checklist.

- [ ] **Step 6: Implement runtime type rows**

Update `NodeOutputList` to render `document_types`; file disclosure is nested under the type row. File input has `multiple`. Upload handler passes `{typeId, files}` and refreshes server state; do not keep authoritative status in local state.

Update `CustomerSourceDocuments` to use runtime type IDs as assignment targets.
Keep the legacy template path only when `document_types` is absent during rollout.

- [ ] **Step 7: Write failing layout/warning tests**

Assert the standalone text “Còn thiếu giấy tờ đầu ra” is absent, footer remains inside right column, first checklist defaults open and later checklists closed, and DOM order matches visual/focus order.

- [ ] **Step 8: Implement compact fixed layout**

Use:

```css
.eiw-workspace { height: calc(100dvh - var(--app-header-height, 64px)); overflow: hidden; }
.eiw-grid { min-height: 0; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.eiw-col { min-height: 0; overflow: hidden; }
.eiw-checklist-section__body { min-height: 0; overflow-y: auto; }
.eiw-foot { flex: 0 0 auto; }
@media (max-width: 979px) {
  .eiw-workspace { height: auto; overflow: visible; }
  .eiw-grid { grid-template-columns: 1fr; }
}
```

Remove standalone missing-output blocker rendering, but keep actual submit gate disabled state and actionable error toast when the user clicks submit.

- [ ] **Step 9: Run focused tests, detector and commit**

Run picker, NodeOutputList, EmployeeItemWorkspace, CustomerSourceDocuments and NodeBusinessSlot tests. Run Impeccable layout detector exactly once after edits; fix only findings caused by this task. Run `detect_changes()` and commit:

```bash
git commit -m "feat(employee-ui): manage document types inside checklist"
```

---

### Task 7: Director review by type

**Files:**
- Modify: `dev/frontend/src/components/contracts/NodeChecklistCard.jsx`
- Modify: `dev/frontend/src/components/contracts/NodeChecklistCard.test.jsx`
- Modify: `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx:3488-3535`
- Modify: `dev/frontend/src/components/contracts/contractWorkflow.css`

**Interfaces:**
- `NodeChecklistCard` consumes `item.runtime.document_types`.
- `onApproveType(checklistResultId, typeId)` and `onRejectType(checklistResultId, typeId, reason)` call Task 4 route.

- [ ] **Step 1: Run impact analysis**

Trace `NodeChecklistCard`, its direct consumers and node-review execution flow. Warn before edit if HIGH/CRITICAL.

- [ ] **Step 2: Write failing director-card tests**

Assert a type row displays name, source, count, expandable files; one Đạt and one Không đạt action exist at type level, not per file. Reject button opens inline reason, and empty reason cannot submit. Type with zero files cannot be approved.

- [ ] **Step 3: Run tests and verify RED**

Run NodeChecklistCard tests. Expected: current card maps graph output documents and actions target a document ID.

- [ ] **Step 4: Implement type-level card**

Render `runtime.document_types` and preserve `output_documents` only as fallback during rollout. The file list is a dropdown under each type. Use source/status colors already defined by employee UI; no new visual system.

- [ ] **Step 5: Wire review handlers**

In `ContractWorkflowDesigner`, call:

```js
apiFetch(`/api/contracts/workflow/checklist/${checklistResultId}/document-types/${typeId}/review`, {
  method: 'POST',
  body: JSON.stringify({ decision: 'rejected', reason }),
})
```

Refresh task detail after every decision. Keep existing review-by-document handlers for legacy rows only.

- [ ] **Step 6: Run tests and commit**

Run NodeChecklistCard and ContractWorkflowDesigner focused tests, detector only if Task 6 did not already cover these files, `detect_changes()`, then:

```bash
git commit -m "feat(director-ui): review checklist document types"
```

---

### Task 8: End-to-end regression and release evidence

**Files:**
- Modify only if a test exposes a bug in Task 1–7 files.
- Create: `docs/qa/checklist-document-types-qa-2026-09-04.md`

**Interfaces:**
- Validates all interfaces from Tasks 1–7 together.

- [ ] **Step 1: Run backend suites**

Run:

```bash
cd dev/backend
PYTHONPATH=. ./venv/bin/python -m unittest \
  tests.test_checklist_document_types_unittest \
  tests.test_checklist_document_type_routes \
  tests.test_dossier_documents_unittest \
  tests.test_de_xuat_input_va_promotion \
  tests.test_cong_no_duyet_phieu -v
PYTHONPATH=. ./venv/bin/python -m py_compile \
  src/dossiers/checklist_document_types.py \
  src/dossiers/register.py \
  src/contracts/workflow_runtime.py \
  src/routes/routes_employee_portal.py \
  src/routes/routes_contracts.py
```

- [ ] **Step 2: Run frontend suites**

Run focused suites first, then full test/build/lint:

```bash
cd dev/frontend
npm test -- --run \
  src/features/employee-portal/ChecklistDocumentTypePicker.test.jsx \
  src/features/employee-portal/NodeOutputList.test.jsx \
  src/features/employee-portal/EmployeeItemWorkspace.test.jsx \
  src/components/contracts/NodeChecklistCard.test.jsx \
  src/features/contracts/DocumentCabinet.test.jsx
npm test -- --run
npm run lint
npm run build
```

Record unrelated baseline failures separately; do not claim full green if any test fails.

- [ ] **Step 3: Verify acceptance scenarios**

Document evidence for:

1. choose exact-combo CCCD suggestion and source remains Khách hàng;
2. create a new Công ty type with three images;
3. submit once through Nộp nghiệm thu;
4. director rejects type with mandatory reason;
5. employee sees intact row/reason and uploads replacement;
6. director approves all types;
7. template appears as exact COMBO suggestion on a new matching workflow only;
8. cabinet is empty at 99% and shows type + three-file count at 100%;
9. K06 debt gate is unchanged;
10. desktop stays within viewport and mobile scrolls naturally.

- [ ] **Step 4: Run final scope checks**

Run `git diff --check`, `detect_changes({scope:"compare", base_ref:"main"})`, inspect new migration/down migration symmetry and confirm no unrelated dirty files were staged.

- [ ] **Step 5: Commit QA evidence**

```bash
git commit -m "test: verify checklist document type workflow"
```
