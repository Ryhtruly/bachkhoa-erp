# Lane B Handoff — Contract Workflow QA (Tasks 4 & 5: BUG-002 & BUG-003)

## 1. Overview & Status
- **State**: `review`
- **Base Commit**: `e35e34c9f2c04531a3bbf9de12960f959b5c4bbd`
- **Branch**: `fix/contract-qa-opencode`
- **Worktree**: `T:\github\bachkhoa-erp\.worktrees\qa-opencode`
- **Scope**:
  - BUG-002: Atomic rejection of workflow activation when mandatory checklist document types (`is_required=True`) are not allocated to workflow nodes.
  - BUG-003: Piece-rate mapping warnings for survey nodes without blocking activation; explicit structured two-step confirmation required in frontend before proceeding with unpaid steps.

---

## 2. Changed Files (Production & Tests)
### Production Files
1. `dev/backend/src/contracts/workflow_runtime.py`
   - Added `WorkflowActivationReadinessError` exception holding structured readiness report.
   - Added `_collect_activation_readiness(db, service_line_id=..., graph=...)` to scan nodes, checklists, output documents, and compare against `applicable_templates(db, service_line_id)`.
   - Updated `activate_workflow` to evaluate readiness BEFORE `save_workflow_draft` and before creating any runtime rows.
   - Preserved existing return payload compatibility while adding `warnings` key.
2. `dev/backend/src/routes/routes_contracts.py`
   - Added `confirm_warnings: bool = False` to `WorkflowRevisionPayload`.
   - Mapped `activate_service_line_workflow` to pass `confirm_warnings` to `activate_workflow`.
   - Added explicit exception handler for `WorkflowActivationReadinessError` that executes `db.rollback()` and raises `HTTPException(status_code=409, detail=exc.readiness)`.
3. `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`
   - Added `activationBlockers` state and dedicated blocked modal (`#workflow-activation-blocked-modal`) rendering all unallocated mandatory output document names.
   - Added `activationWarningConfirmation` state and structured confirmation modal (`#workflow-activation-warning-modal`) detailing uncompensated nodes.
   - Updated activation handler `executeActivation(confirmWarnings, explicitAmendmentReason)` to catch 409 responses and route cleanly to blocker or warning modals without parsing prose.
   - Added explicit cancel (stays inactive) and confirm (re-invokes activation with `confirm_warnings: true`) paths.

### Test Files
1. `dev/backend/tests/test_workflow_activation_readiness.py`
   - Dedicated pure isolated unit test module verifying atomicity, blocker reporting, piece-rate warning separation, second confirmation pass, and mixed request handling.
2. `dev/frontend/src/components/contracts/ContractWorkflowDesigner.test.jsx`
   - Regression tests for mandatory allocation blocker dialog, warning-only cancellation keeping workflow inactive, and explicit second confirmation activating with `confirm_warnings: true`.

---

## 3. GitNexus & Call-Site Impact Evidence

### GitNexus Query Results
```
> gitnexus status
Repository: T:\github\bachkhoa-erp
Branch: feature/accounting-module
Indexed commit: e35e34c
Status: up-to-date

> gitnexus impact activate_workflow
{"level":40,"name":"gitnexus","msg":"GitNexus: FTS extension unavailable; continuing without FTS features. load-only policy: extension not pre-installed"}
{
  "error": "Target 'activate_workflow' not found",
  "target": { "name": "activate_workflow" },
  "direction": "upstream",
  "impactedCount": 0,
  "risk": "UNKNOWN"
}

> gitnexus impact activate_service_line_workflow
{"error": "Target 'activate_service_line_workflow' not found", "risk": "UNKNOWN"}

> gitnexus impact ContractWorkflowDesigner
{"error": "Target 'ContractWorkflowDesigner' not found", "risk": "UNKNOWN"}
```

*Note on GitNexus*: GitNexus SQLite FTS extension was not pre-installed in the local environment, returning `risk: UNKNOWN`. As required by the prompt protocol, exact call-site evidence was verified via ripgrep:

### Ripgrep (rg) Call-Site Verification
- `activate_workflow`:
  - Definition: `dev/backend/src/contracts/workflow_runtime.py:1699`
  - Route Call-Site: `dev/backend/src/routes/routes_contracts.py:1374` inside `activate_service_line_workflow`
  - Tests: `dev/backend/tests/test_workflow_activation_readiness.py`
  - Frontend Capability Guard: `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx:848`
- `activate_service_line_workflow`:
  - Route Endpoint: `POST /api/contracts/workflow/{service_line_id}/activate` (`routes_contracts.py:1354`)
  - Frontend Call-Site: `ContractWorkflowDesigner.jsx:1749` (`requestJson('/api/contracts/workflow/${serviceLine.id}/activate', ...)`)
- `ContractWorkflowDesigner`:
  - Component Definition: `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`
  - Test Suite: `dev/frontend/src/components/contracts/ContractWorkflowDesigner.test.jsx`

---

## 4. Test Execution & RED / GREEN Evidence

### Backend Unit Tests (Pure Isolated)
Command:
```powershell
python -m unittest dev/backend/tests/test_workflow_activation_readiness.py
```
Output:
```
.......
----------------------------------------------------------------------
Ran 7 tests in 0.020s

OK
```
Tests Covered:
1. `test_unallocated_mandatory_checklist_blocks_atomically`: Asserts `save_workflow_draft` and `db.execute` are NEVER called when mandatory documents are unallocated; raises `WorkflowActivationReadinessError` with 409 detail.
2. `test_fully_allocated_activation_continues_existing_success_path`: Verifies clean graph passes readiness check and activates smoothly.
3. `test_missing_piece_rate_only_warns_and_requires_explicit_confirmation`: Verifies missing piece-rate on survey node raises `requires_confirmation: True` without modifying draft or DB.
4. `test_warning_confirmation_allows_activation`: Verifies `confirm_warnings=True` successfully activates and returns warnings array.
5. `test_mixed_invalid_request_has_no_partial_writes`: Verifies when both blockers and warnings exist, blockers take precedence and block write atomically.
6. `test_collect_activation_readiness_detects_blockers_and_warnings`: Verifies correct categorization of required vs optional templates and piece rate flags.
7. `test_collect_activation_readiness_ready_when_clean`: Verifies clean readiness returns `ACTIVATION_READY`.

### Frontend Vitest Tests (Isolated & Component Suite)
Command:
```powershell
npm test -- src/components/contracts/ContractWorkflowDesigner.test.jsx
```
Output:
```
 Test Files  1 passed (1)
      Tests  27 passed (27)
   Duration  4.79s
```

Contracts Suite Command:
```powershell
npm test -- src/components/contracts/
```
Output:
```
 Test Files  5 passed (5)
      Tests  40 passed (40)
   Duration  5.43s
```

Full Frontend Suite Command:
```powershell
npm test
```
Output:
```
 Test Files  69 passed (69)
      Tests  290 passed (290)
   Duration  31.43s
```

---

## 5. Structured Schemas

### 1. Blocked Activation (409 Conflict)
```json
{
  "detail": {
    "code": "ACTIVATION_READINESS_FAILED",
    "message": "Thiếu phân bổ loại giấy tờ bắt buộc vào checklist của workflow.",
    "blockers": [
      {
        "code": "MANDATORY_OUTPUT_UNALLOCATED",
        "template_id": "TPL_SO_DO",
        "template_name": "Sổ đỏ gốc"
      }
    ],
    "warnings": [],
    "requires_confirmation": false
  }
}
```

### 2. Warning-Only Confirmation Required (409 Conflict)
```json
{
  "detail": {
    "code": "ACTIVATION_CONFIRMATION_REQUIRED",
    "message": "Một số bước chưa gắn khoán. Công việc tại các bước này sẽ không có tiền khoán nếu tiếp tục kích hoạt.",
    "blockers": [],
    "warnings": [
      {
        "code": "MISSING_PIECE_RATE_MAPPING",
        "node_key": "node-survey-1",
        "node_name": "Đo vẽ hiện trạng"
      }
    ],
    "requires_confirmation": true
  }
}
```

### 3. Activation Success (200 OK)
```json
{
  "message": "Đã kích hoạt workflow",
  "amended": false,
  "node_count": 3,
  "assignment_count": 3,
  "compensation_assignment_count": 2,
  "projected_compensation_amount": 1500000.0,
  "warnings": [
    {
      "code": "MISSING_PIECE_RATE_MAPPING",
      "node_key": "node-unpaid",
      "node_name": "Kiểm tra hồ sơ nội bộ"
    }
  ]
}
```

---

## 6. Atomicity & Invariant Proofs
1. **Pre-mutation Readiness Check**: `_collect_activation_readiness` executes prior to `save_workflow_draft` and before any SQL statement in `activate_workflow`.
2. **Transaction Rollback**: On `WorkflowActivationReadinessError`, `routes_contracts.py` explicitly calls `db.rollback()` before raising the HTTP 409 exception.
3. **No Partial Writes**: When unallocated mandatory documents exist or when unconfirmed warnings are present, zero database rows (`workflow_revisions`, `workflow_execution_nodes`, `workflow_tasks`, `workflow_checklist_results`, `workflow_compensation_assignments`) are created or altered.
4. **Pure Unit Execution**: Zero live DB queries, zero migrations, zero docker containers, and zero environment modifications were invoked.

---

## 7. Risks & Mitigation
- **Risk**: Unpaid survey nodes unintentionally skipping compensation.
  - *Mitigation*: The frontend warning confirmation modal explicitly warns that affected steps will receive no compensation and lists every node by name before allowing confirmation.
- **Risk**: Unallocated non-mandatory documents blocking activation.
  - *Mitigation*: Filter explicitly checks `bool(template.get("is_required"))`; optional templates never block activation.
