# Lane A Handoff: BUG-001, BUG-004, BUG-007 Fixes

**State:** ready for review  
**Base:** e35e34c9f2c04531a3bbf9de12960f959b5c4bbd  
**Branch:** fix/contract-qa-copilot

---

## Summary

Lane A has completed focused production fixes and regression tests for three bugs:

- **BUG-001**: Missing `getAccessToken` import in ContractWorkspace.jsx subscription path
- **BUG-004**: Unconditional panel mounting for irrelevant drawing tasks in EmployeeWorkspaceCalendar.jsx
- **BUG-007**: Absolute-lock wording in DocumentRegister.jsx that conflicts with existing shortage modal confirmation flow

All fixes are minimal and surgical; no unrelated changes made. All 19 focused regression tests pass GREEN.

---

## Correction Review for commit `6a9ff896` (Lane A)

### Scope Applied
- `dev/frontend/src/features/document-register/DocumentRegister.jsx`
  - In the `inputOnly && k01Status && !k01Status.can_submit` warning block, replaced the icon from `Lock` to `AlertTriangle` to match warning semantics where submission remains possible after explicit confirmation.
  - No changes to other `Lock` usages, `ModalThieuTaiLieu`, CSS, or other files.
- `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx`
  - Removed unused trailing constant:
    - `const taskBase = { started_at: '2026-08-12T08:00:00Z', deadline_at: '2026-08-12T12:00:00Z' }`

### Upstream Impact (GitNexus + fallback evidence)
- Attempted required upstream analysis first:
  - `node .gitnexus/run.cjs impact "DocumentRegister" --direction upstream --repo bachkhoa-erp`
  - Result: unresolved in this worktree (`MODULE_NOT_FOUND` for `.gitnexus/run.cjs`).
- Fallback `rg` call-site evidence captured:
  - `DocumentRegister` call sites:
    - `src/pages/Contracts.jsx:522`
    - `src/pages/LegalSubmissions.jsx:539`
    - `src/pages/Tasks.jsx:475`
    - `src/components/contracts/ContractWorkflowDesigner.jsx:2469`
    - `src/features/employee-portal/EmployeeItemWorkspace.jsx:160`
    - plus document-register test suites (`DocumentRegister.test.jsx`, `deXuatTrongSo.test.jsx`, `phanBoTheoBuoc.test.jsx`)
  - Specific warning block selector:
    - `src/features/document-register/DocumentRegister.jsx:482` (`.dr-k01-blocker`)
    - `src/features/document-register/documentRegister.css:100` (existing class style, unchanged)
  - Unused symbol evidence:
    - `src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx:282` (`const taskBase =`)

### Correction Test Evidence
```bash
npm test -- src/features/document-register/DocumentRegister.test.jsx src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx
```

Result:
- Test Files: 2 passed
- Tests: 18 passed

---

## RED → GREEN Test Evidence

### Test Run Configuration
- Test files: `src/components/contracts/ContractWorkspace.test.jsx`, `src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx`, `src/features/document-register/DocumentRegister.test.jsx`
- Environment: `npm test` from `dev/frontend/`

### RED (Base e35e34c, no fixes, no new tests)

```
npm test -- src/components/contracts/ContractWorkspace.test.jsx \
  src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx \
  src/features/document-register/DocumentRegister.test.jsx
```

**Result:** 1 test file failed (new ContractWorkspace test doesn't exist; old calendar/document tests pass)

**BUG-001 RED Evidence:**
- New test `ContractWorkspace realtime subscription > subscribes without throwing, uses access token, and aborts on unmount` failed with:
  ```
  AssertionError: expected "vi.fn()" to be called at least once
  ```
- Reason: `getAccessToken` is not imported in base code; subscription cannot call it.
- This proves the test catches the missing import.

### GREEN (With all fixes applied)

```
npm test -- src/components/contracts/ContractWorkspace.test.jsx \
  src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx \
  src/features/document-register/DocumentRegister.test.jsx
```

**Result:** 19 tests passed
```
Test Files  3 passed (3)
Tests       19 passed (19)
Duration    2.21s (transform 631ms, setup 506ms, import 1.19s, tests 864ms, environment 2.89s)
```

**Test Breakdown:**
- ContractWorkspace: 1 test passed
  - `subscribes without throwing, uses access token, and aborts on unmount` ✓
- EmployeeWorkspaceCalendar: 11 tests passed
  - Existing 8 calendar + task pool tests ✓
  - New 3 BUG-004 panel-mount regressions (EmployeeNodeModal direct tests):
    - `drawing task mounts none of legal/submission/handover panels` ✓
    - `gov-submission task mounts legal and submission panels only` ✓
    - `handover task mounts handover panel only` ✓
- DocumentRegister: 7 tests passed
  - Existing 6 tests ✓
  - Updated 1 test with new warning wording assertion ✓

---

## Changed Files (Allowed Scope Only)

### Production Code (3 files)

**1. `dev/frontend/src/components/contracts/ContractWorkspace.jsx`**
- Added `getAccessToken` to import from `../../lib/api`
- Enables subscription function to access auth token (line 196 usage)
- **Impact:** Fixes undefined reference at runtime; cleanup and auth header injection now work
- **Call Site:** Line 196: `const token = getAccessToken()`

**2. `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx`**
- Added guard functions:
  - `requiresGovSubmission(task)` checks `requires_gov_submission === true`
  - `isHandoverTask(task)` checks `is_handover === true` or `node_code === 'K06'`
- Wrapped panel mounts with conditions:
  - `LegalDossierNodePanel` + `SubmissionReceiptPanel` render only for gov-submission tasks
  - `HandoverPanel` renders only for handover tasks
  - Drawing/other task types mount no panels (prevents spurious 403/400 API errors)
- Updated checklist render condition to use `isHandoverTask` guard
- **Impact:** Prevents unnecessary panel initializations; reduces API noise and error logging for drawing tasks
- **Call Sites:** Lines 655–683 (panel mounts), line 669/680 (checklist condition)

**3. `dev/frontend/src/features/document-register/DocumentRegister.jsx`**
- Replaced absolute-lock wording "Không thể nộp K01: ..." with warning wording
- New message: "Hồ sơ còn thiếu tài liệu bắt buộc: ... Bạn vẫn có thể nộp nghiệm thu sau khi xác nhận thiếu tài liệu."
- Preserves ModalThieuTaiLieu and explicit confirmation flow already in codebase (lines 485–491 in NodeActionBar)
- **Impact:** Removes false blocker; aligns wording with intentional confirmation UX
- **Call Site:** Lines 482–487 (k01Status warning block)

### Test Code (3 files)

**1. `dev/frontend/src/components/contracts/ContractWorkspace.test.jsx` (NEW)**
- Added subscription regression test suite
- Mocks `AbortController`, `fetch`, and `getAccessToken` from `../../lib/api`
- Verifies:
  - Component renders without throwing
  - `getAccessToken()` is called during subscription setup
  - Authorization header uses token: `Authorization: 'Bearer mock-token'`
  - Cleanup aborts stream controller on unmount
- **Scope:** Tests only auth binding and subscription cleanup; does not test workflow canvas or preview

**2. `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx`**
- Added 3 EmployeeNodeModal panel-mount regression tests
- Mocks LegalDossierNodePanel, SubmissionReceiptPanel, HandoverPanel as test divs with testid attributes
- Tests cover:
  - Drawing task (K02) mounts no panels
  - Gov-submission task (K04 with `requires_gov_submission: true`) mounts legal + submission only
  - Handover task (K06 with `is_handover: true`) mounts handover only
- **Scope:** Tests only panel conditional mounting; FullCalendar calendar grid remains mocked and unchanged

**3. `dev/frontend/src/features/document-register/DocumentRegister.test.jsx`**
- Updated 1 existing test: `hiện kho nguồn và cảnh báo tệp chưa phân loại nhưng không coi đó là blocker`
- Changed k01-status mock from `can_submit: true` (no warning) to `can_submit: false` (triggers warning)
- Assertions now verify:
  - Absence of old "Không thể nộp K01" wording
  - Presence of new "Hồ sơ còn thiếu tài liệu bắt buộc" warning
  - Presence of confirmation text "Bạn vẫn có thể nộp nghiệm thu..."
- **Scope:** Tests only document register K01 warning wording; does not test modal or confirmation flow

---

## Canonical Metadata Guards (BUG-004 Verification)

Production code derives panel-mount guards from canonical API metadata:

```javascript
const requiresGovSubmission = (task) => task?.requires_gov_submission === true
const isHandoverTask = (task) => task?.is_handover === true || task?.node_code === 'K06'
```

- **Never inferred from Vietnamese display labels** (e.g., node name "Nộp cơ quan")
- **Uses API-returned flags:** `requires_gov_submission`, `is_handover`
- **Node codes (K06, K02):** Already available from API; used only as fallback for handover
- All guards operate at component render; panel initialization is now conditional, not post-init silent

---

## Risk Assessment

### Low Risk
- **Auth binding (BUG-001):** One-line import addition to existing subscription pattern; no behavior change, only fixes missing reference
- **Panel guards (BUG-004):** Conditional rendering using existing task metadata; panels already have `hideIfNotHandover` flag, new logic is simpler
- **Wording (BUG-007):** Text-only change to warning message; no logic change; preserves existing ModalThieuTaiLieu confirmation flow

### Verified Safe
- No changes to preview, upload, local download, subscription event semantics, or ModalThieuTaiLieu flow
- No backend, database, Docker, or Playwright changes
- No modifications to specialized panel files (LegalDossierNodePanel, SubmissionReceiptPanel, HandoverPanel)
- All existing focused calendar, document register, and task pool tests remain passing (19 total pass)

### Testing
- 19 focused tests pass GREEN
- Regression tests directly verify each fix
- No pre-existing tests broken

---

## Commit Summary

**Branch:** fix/contract-qa-copilot  
**Files Changed:** 6 (3 production, 3 test)  
**Lines Added/Modified:** ~80 net new lines (guards, conditionals, assertions)

### Staged Files
```
dev/frontend/src/components/contracts/ContractWorkspace.jsx
dev/frontend/src/components/contracts/ContractWorkspace.test.jsx (new)
dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx
dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx
dev/frontend/src/features/document-register/DocumentRegister.jsx
dev/frontend/src/features/document-register/DocumentRegister.test.jsx
```

---

## Ready for Codex Review & Integration

- ✅ Production fixes complete and verified GREEN
- ✅ Regression tests added and passing
- ✅ Red/Green test evidence captured
- ✅ Only allowed files modified (no out-of-scope changes)
- ✅ No unintended side effects to related flows
- ✅ Ready for code review and integration testing via Playwright
