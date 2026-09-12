# Piece-Rate Catalog Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add director-controlled CRUD for piece-rate work items, preserve historical rates and names, and make payroll entitlements use the rate locked when a checklist assignment was created.

**Architecture:** Keep `work_items` as the shared catalog and `work_item_rates` as the effective-dated, immutable rate history. Add director-only catalog endpoints with soft deactivation and audit logging; leave workflow template topology unchanged. At entitlement creation, resolve the exact `work_item_rate_id` stored on the assignment, with a current-rate fallback only for legacy assignments that do not have a stored rate.

**Tech Stack:** FastAPI, Pydantic 2, SQLAlchemy/raw PostgreSQL SQL, Supabase migrations, React, Vitest, pytest.

**Spec:** Approved in the current conversation: option 1 (manage reusable work items in Bảng giá khoán), director has direct create/update/deactivate/restore authority, work-item code is immutable, display name is editable with audit, and price is locked at checklist assignment.

## Global Constraints

- Do not change workflow node topology, checklist semantics, transitions, K06, KPI, CRM, or unrelated accounting flows.
- Do not physically delete a work item referenced by a workflow, assignment, entitlement, or rate history; use `is_active = false`.
- A published rate is never overwritten; publishing closes its effective period and creates/uses a separate version.
- `work_item_rate_id` on an assignment is authoritative for that assignment; legacy rows without it use an explicit fallback and remain compatible.
- Backend authorization is authoritative; UI visibility is not a security boundary.
- Preserve all existing user changes in the working tree. Do not stage, commit, or push unless explicitly requested.

---

### Task 1: Lock the rate used by an assigned checklist

**Files:**
- Modify: `dev/backend/src/contracts/workflow_runtime.py:459-473,5872-5965`
- Modify: `dev/backend/src/employee_portal/service.py:407-470`
- Test: `dev/backend/tests/test_piece_rate_assignment_lock.py`

**Interfaces:**
- Produces a private resolver that accepts an assignment row and the loaded current-rate map, returning the exact historical rate row when `work_item_rate_id` is present.
- Existing assignment rows without a rate id remain supported through the current published-rate fallback.

- [x] **Step 1: Write the failing tests**

Add tests that construct an old assignment rate and a newer published rate, then assert:

```python
def test_assigned_rate_wins_after_catalog_price_changes():
    assignment = {
        "work_item_id": "wi_stakeout",
        "work_item_rate_id": "rate_old",
        "role_code": "MAIN",
    }
    rates_by_id = {
        "rate_old": {"id": "rate_old", "work_item_id": "wi_stakeout", "role_code": "MAIN", "amount": 1000000},
        "rate_new": {"id": "rate_new", "work_item_id": "wi_stakeout", "role_code": "MAIN", "amount": 1500000},
    }
    current_rates = {"wi_stakeout": {"MAIN": rates_by_id["rate_new"]}}

    assert resolve_assignment_rate(assignment, rates_by_id, current_rates)["amount"] == 1000000


def test_legacy_assignment_without_rate_id_uses_current_rate():
    assignment = {"work_item_id": "wi_stakeout", "work_item_rate_id": None, "role_code": "MAIN"}
    current_rates = {"wi_stakeout": {"MAIN": {"id": "rate_new", "amount": 1500000}}}

    assert resolve_assignment_rate(assignment, {}, current_rates)["amount"] == 1500000


def test_mismatched_assigned_rate_is_ignored_instead_of_cross_applying_price():
    assignment = {"work_item_id": "wi_stakeout", "work_item_rate_id": "rate_other", "role_code": "MAIN"}
    rates_by_id = {"rate_other": {"id": "rate_other", "work_item_id": "wi_other", "role_code": "MAIN", "amount": 900000}}

    assert resolve_assignment_rate(assignment, rates_by_id, {}) is None
```

- [x] **Step 2: Run the focused test and verify it fails for the missing resolver**

Run from `dev/backend`:

```powershell
$env:TEST_DATABASE_URL='sqlite://'; $env:DATABASE_URL='sqlite:///:memory:'; python -m pytest -q tests/test_piece_rate_assignment_lock.py
```

Expected: FAIL because the resolver does not exist yet.

- [x] **Step 3: Implement the minimal resolver and use it in entitlement creation**

Create `resolve_assignment_rate(assignment: Mapping[str, Any], rates_by_id: Mapping[str, Mapping[str, Any]], current_rates: Mapping[str, Mapping[str, Mapping[str, Any]]])` beside `_current_work_item_rates`. Load assignment rows with `work_item_id` and `work_item_rate_id`, build a rate-id map from the assignment’s referenced rates, and select the referenced row only when its work item and role match. For legacy assignments, use the current map. Replace the current role-only lookup in `_generate_work_pay_entitlements` with this resolver. Add `work_item_id`, `work_item_code`, `work_item_name`, and `rate_id` to `calculation_snapshot` without changing entitlement amount or idempotency behavior.

- [x] **Step 4: Run the focused test and the existing payroll/workflow regression tests**

Run:

```powershell
$env:TEST_DATABASE_URL='sqlite://'; $env:DATABASE_URL='sqlite:///:memory:'; python -m pytest -q tests/test_piece_rate_assignment_lock.py tests/test_kpi_and_employee_payroll_hardening.py tests/test_accounting_contract_money_integrity.py
```

Expected: all selected tests pass.

### Task 2: Add director-authorized work-item catalog CRUD

**Files:**
- Modify: `dev/backend/src/routes/routes_piece_rates.py`
- Test: `dev/backend/tests/test_piece_rate_catalog_routes.py`

**Interfaces:**
- `POST /api/piece-rates/items` creates an active work item and optional direct-published initial rates for a director.
- `PATCH /api/piece-rates/items/{work_item_id}` updates display metadata; `code` is immutable.
- `DELETE /api/piece-rates/items/{work_item_id}` soft-deactivates the item and retains all historical rows.
- `POST /api/piece-rates/items/{work_item_id}/restore` reactivates a deactivated item.
- Existing rate proposal/publish/history endpoints remain backward compatible.

- [x] **Step 1: Write failing route/service tests**

Cover these behaviors:

The test file must contain these six concrete cases: POST an item with initial rates and assert the returned item/rates; call POST and DELETE with a user lacking `payroll.approve` and assert 403; PATCH only `name` and assert `code` remains unchanged; DELETE an active item and query it back with `is_active = false` while retaining its rate row; attempt a physical deletion path for an item referenced by a checklist and assert a conflict response; submit a lowercase/invalid code, blank name, and negative rate and assert validation happens before any insert.

Use the existing auth/permission test helpers and assert both the response and persisted state. The tests must verify that the backend, not only the React screen, enforces the permission.

- [x] **Step 2: Run the route tests and verify they fail before the endpoints exist**

Run:

```powershell
$env:TEST_DATABASE_URL='sqlite://'; $env:DATABASE_URL='sqlite:///:memory:'; python -m pytest -q tests/test_piece_rate_catalog_routes.py
```

Expected: FAIL with missing routes or missing CRUD behavior.

- [x] **Step 3: Implement validated request models and endpoints**

Add Pydantic models for `code`, `name`, `default_unit`, `output_definition`, `department_id`, and optional initial role amounts. Normalize codes to uppercase and reject duplicates, blank names, non-finite amounts, and negative amounts. Use `require_permission("payroll", "approve")` for director-authorized direct CRUD. Use `log_action` for create, rename, deactivate, and restore. Create initial rates transactionally with `approved_by`, `approved_at`, and `approval_source='manual'` when supplied.

- [x] **Step 4: Implement cache and response behavior**

Clear `bachkhoa:catalog:piece_rates` after every successful catalog or rate mutation. Keep active items in the normal rates response, and add an explicit `include_inactive` management option restricted to the director permission. Return `is_active`, `code`, `name`, `unit`, and rate metadata so the UI can distinguish active and deactivated items.

- [x] **Step 5: Run route tests and the focused backend suite**

Run the commands from Steps 1 and 4 again. Expected: all selected tests pass.

### Task 3: Add the director catalog UI without changing workflow screens

**Files:**
- Modify: `dev/frontend/src/components/finance/screens/PieceRatePricingScreen.jsx`
- Create: `dev/frontend/src/components/finance/screens/PieceRatePricingScreen.test.jsx`

**Interfaces:**
- Director-only controls: `Thêm hạng mục`, `Sửa thông tin`, `Ngừng sử dụng`, and `Khôi phục`.
- Existing rate editing/history/publish controls remain available and continue to use the current API.

- [x] **Step 1: Write failing UI tests**

Mock the API boundary and verify:

The test file must contain these four concrete cases: render with `isDirector={false}` and assert the catalog mutation buttons are absent; render with `isDirector` and a mocked `/rates` response, submit the create form, and assert a POST payload plus a reload GET; open the metadata editor, change the name, submit, and assert the PATCH body has `name` but no `code`; click the deactivation button and assert the confirmation dialog appears before the DELETE mock is called.

- [x] **Step 2: Run the new UI test and verify it fails**

Run from `dev/frontend`:

```powershell
npm run test -- --run src/components/finance/screens/PieceRatePricingScreen.test.jsx
```

Expected: FAIL because the catalog controls and handlers are not present.

- [x] **Step 3: Implement the minimal catalog UI**

Add a create/edit metadata modal with code read-only during edit, name, unit, description, and optional initial rates. Add a director-only deactivation confirmation and an inactive filter/restore action. Keep validation messages in Vietnamese, disable submit while saving, reload after mutation, and show the API error message in the existing toast system.

- [x] **Step 4: Run the UI test and existing finance screen tests**

Run:

```powershell
npm run test -- --run src/components/finance/screens/PieceRatePricingScreen.test.jsx src/components/finance/FinanceScreensMatrix.test.jsx src/components/finance/screens/FinanceResponsiveLayout.test.jsx
```

Expected: all selected tests pass.

### Task 4: Verify scope, compatibility, and build artifacts

**Files:**
- Review: `dev/backend/src/contracts/workflow_runtime.py`, `dev/backend/src/routes/routes_piece_rates.py`, `dev/frontend/src/components/finance/screens/PieceRatePricingScreen.jsx`
- Review: all newly created tests and the working-tree diff

- [x] **Step 1: Run backend focused and full-safe regression checks**

Run the new piece-rate tests, the prior accounting focused tests, `python -m compileall -q src tests`, and the existing full backend command excluding Redis/password tests when Redis is unavailable.

- [x] **Step 2: Run frontend focused tests, lint, and build**

Run the new piece-rate UI tests, related finance screen tests, `npm run lint`, and `npm run build`.

- [x] **Step 3: Run `git diff --check` and GitNexus change detection**

Use `detect_changes({scope: "unstaged", repo: "bachkhoa-erp", worktree: "D:\\TTDN\\WIFIM\\bachkhoa-erp"})`. Review the changed files and confirm no workflow topology, KPI, CRM, or unrelated module files were changed.

- [x] **Step 4: Report verification limits**

Explicitly distinguish SQLite/unit evidence from PostgreSQL runtime evidence. Do not claim production database verification unless a disposable PostgreSQL test database is available.

No commit or push is part of this plan.
