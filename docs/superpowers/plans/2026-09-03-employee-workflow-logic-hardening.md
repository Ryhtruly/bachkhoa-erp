# Employee Workflow Logic Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining demo-only document behavior from the employee workspace, wire document replacement to the real ERP API with exact child identity, align submit controls with server blockers, and prove the result with deterministic unit and Playwright tests.

**Architecture:** `bachkhoa-erp` remains the only implementation target; `T:\New folder` is read-only reference material and must never be edited. The backend and object storage remain authoritative for document bytes, review status, workflow state, and authorization. The frontend preview becomes read-only and truthful, output-document upload uses the existing multipart endpoint, and the submit action distinguishes hard blockers from the intentionally soft missing-document warning.

**Tech Stack:** React 19, Vitest, Testing Library, FastAPI, PostgreSQL, MinIO, Docker Compose, Playwright 1.62, GitNexus.

**Reference inputs:** `docs/qa/employee-artifact-logic-audit-2026-09-03.md` and `docs/superpowers/specs/2026-09-03-employee-node-detail-ui-redesign.md`. The artifact source itself remains read-only.

## Global Constraints

- Modify files only under `T:\github\bachkhoa-erp`; never modify, move, or delete anything in `T:\New folder`.
- Preserve the current employee-node visual layout and CSS structure. This plan changes behavior and truthful states, not the approved UI composition.
- Antigravity is the primary implementer for every UI task. OpenCode receives only the isolated Playwright-spec/config task.
- Antigravity and OpenCode are coding workers only. The coordinator runs every Playwright acceptance test and decides pass/fail.
- Do not modify `dev/backend/src/contracts/workflow_runtime.py`, database migrations, schemas, or API contracts in the first pass. A backend change requires a newly failing backend test plus explicit coordinator approval because GitNexus reports critical/lower-bound impact around document-review state.
- Never reintroduce artifact concepts such as `processService`, `useLocalJson`, localStorage process state, preset uploads, fabricated file previews, or client-authored review status.
- A success toast may appear only after the real API request returns successfully.
- Use stable identifiers end to end: task node ID, checklist result ID, document template ID, and document ID. Never fall back to array index or the first document.
- Preserve the existing business rule: `paused` and `rejected_documents` are hard blockers; `missing_documents` is a soft warning that requires confirmation; `pending_approval` means the employee has completed the item and may submit the node for director review.
- Preserve the dirty worktree. Do not revert, clean, overwrite, or reformat unrelated files.
- Do not commit. Each worker returns a scoped diff and test output to the coordinator.
- On Windows use `npm.cmd`, not `npm.ps1`.
- Do not hardcode usernames or passwords in repository files. Playwright reads credentials from environment variables.

## Finding Disposition

| Audit finding | ERP status before this plan | Planned action |
|---|---|---|
| F-01 exact child preview | Already implemented with `document_id` | Add regression coverage; do not redesign |
| F-02 rejected sibling bypass | Backend current-link/review logic exists; frontend replacement is incomplete | Wire exact-child real upload and hard blocker |
| F-03 pending/rejected/paused validation | Partially implemented | Align `NodeActionBar` with hard/soft blocker semantics |
| F-04 workflow navigation | Already implemented by `NodeChain` | Regression test only |
| F-05 fake REST mode | Not present in ERP | No change |
| F-06 fabricated preview/checksum | Open | Remove all fabricated content and claims |
| F-07 upload drops bytes | Real API exists; new UI is not wired to it | Wire multipart upload from `NodeOutputList` |
| F-08 stale ID overwrites first child | Not present in ERP | Regression test only |
| F-09 arbitrary node submit | Backend assignment/status gates exist | Run existing backend tests; no production change |
| F-10 employee authors review status | Not present in ERP | No change |
| F-11 localStorage file persistence | Not present in ERP | No change |

---

## Wave 0: Coordinator Baseline and Graph Gate

### Task 0: Freeze Scope and Capture Baseline

**Owner:** Coordinator only  
**Files:** No production edits.

**Interfaces:**
- Consumes: current dirty worktree and GitNexus index.
- Produces: baseline command output and an approved file-ownership manifest for Waves 1-4.

- [ ] **Step 1: Capture the current worktree without changing it**

Run:

```powershell
git status --short
git diff --check
git rev-parse HEAD
```

Expected: HEAD is recorded; pre-existing modified/untracked files remain untouched; `git diff --check` has no whitespace errors.

- [ ] **Step 2: Refresh GitNexus so the untracked preview component is indexed**

Run:

```powershell
node .gitnexus/run.cjs analyze --index-only
```

Expected: repository `bachkhoa-erp` is indexed from `T:\github\bachkhoa-erp`; no `partial` result is accepted.

- [ ] **Step 3: Run pre-edit impact analysis**

Run:

```powershell
node .gitnexus/run.cjs impact "DocumentPreviewModal" --direction upstream --repo .
node .gitnexus/run.cjs impact "NodeOutputList" --direction upstream --repo .
node .gitnexus/run.cjs impact "NodeActionBar" --direction upstream --repo .
node .gitnexus/run.cjs impact "EmployeeItemWorkspace" --direction upstream --repo .
```

Expected: each target resolves to the `dev/frontend/src/features/employee-portal` symbol. If any result is HIGH, CRITICAL, UNKNOWN, partial, or truncated, stop that task and supplement it with `rg` callers before authorizing edits.

- [ ] **Step 4: Run the focused frontend baseline**

Run:

```powershell
npm.cmd test -- --run src/features/employee-portal/EmployeeItemWorkspace.test.jsx src/features/employee-portal/NodeOutputList.test.jsx src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx
```

Working directory: `dev/frontend`  
Expected: existing tests pass before workers begin.

- [ ] **Step 5: Record file ownership**

Approved ownership:

| Worker | Allowed files |
|---|---|
| Antigravity Task 1 | `DocumentPreviewModal.jsx`, `documentPreviewModal.css`, new `DocumentPreviewModal.test.jsx` |
| Antigravity Task 2 | `NodeOutputList.jsx`, `NodeOutputList.test.jsx`, `EmployeeItemWorkspace.jsx`, `EmployeeItemWorkspace.test.jsx` |
| Antigravity Task 3 | `EmployeeWorkspaceCalendar.jsx`, `EmployeeWorkspaceCalendar.test.jsx`, `EmployeeItemWorkspace.jsx`, `EmployeeItemWorkspace.test.jsx` |
| OpenCode Task 4 | `e2e/employee-logic-audit.spec.js`, `playwright.audit.config.js`, `package.json` only if adding an audit script |

No two coding workers run concurrently when their ownership overlaps.

---

## Wave 1: Truthful Document Preview

### Task 1: Replace Demo Preview with a Read-Only Real-File Viewer

**Owner:** Antigravity  
**Execution:** `agy` from `T:\github\bachkhoa-erp`  
**Files:**
- Modify: `dev/frontend/src/features/employee-portal/DocumentPreviewModal.jsx`
- Modify only as needed: `dev/frontend/src/features/employee-portal/documentPreviewModal.css`
- Create: `dev/frontend/src/features/employee-portal/DocumentPreviewModal.test.jsx`

**Interfaces:**
- Consumes props: `open`, `fileName`, `mimeType`, `url`, `blob`, `doc`, `onClose`.
- Produces: a read-only dialog that renders only the authenticated blob URL supplied by `EmployeeItemWorkspace`.
- Must not expose: `initialTab`, upload presets, upload metadata form, `autoResolve`, or `onUpdateChecklistFile` behavior.

**Exact Antigravity prompt:**

```text
Work only in T:\github\bachkhoa-erp. Do not touch T:\New folder.

Task: make the employee DocumentPreviewModal truthful and read-only. Preserve its current visual shell and accessibility, but remove every demo-only mutation and fabricated claim.

Allowed files only:
- dev/frontend/src/features/employee-portal/DocumentPreviewModal.jsx
- dev/frontend/src/features/employee-portal/documentPreviewModal.css
- dev/frontend/src/features/employee-portal/DocumentPreviewModal.test.jsx (new)

Required behavior:
1. Keep props open, fileName, mimeType, url, blob, doc, onClose.
2. PDF with url: render iframe whose src is exactly url.
3. Image with url: render img whose src is exactly url.
4. DOCX with a non-empty blob/url: continue using the already-installed docx-preview renderAsync path.
5. Unsupported formats such as DWG/DXF/DGN: do not fabricate a drawing. Show that browser preview is unavailable and retain a real download/open action using url.
6. Empty url/blob: show “Chưa có tệp để xem trước.”; do not show a stock image, fake cadastral drawing, fake metadata, fake coordinates, fake signature, or fake checksum.
7. Remove the Upload/Replace tab, preset buttons, local-file form, local success message, auto-resolve checkbox, Unsplash URLs, hardcoded dates/coordinates, and every SHA-256 verified claim.
8. Download must use the real url. If url is absent, disable or hide download; never call alert pretending a download happened.
9. Keep Escape/close-button behavior and dialog roles.

Write failing Vitest/Testing Library tests first. Do not edit backend/API code. Run only the new test until green, then run EmployeeItemWorkspace.test.jsx. Do not commit. Return the exact files changed, test output, and any behavior you intentionally removed.
```

- [ ] **Step 1: Write the failing viewer tests**

The new test file must contain these assertions:

```jsx
expect(screen.getByTitle('ban-ve.pdf')).toHaveAttribute('src', 'blob:real-pdf')
expect(screen.queryByText(/Đã chứng thực SHA-256/i)).not.toBeInTheDocument()
expect(screen.queryByRole('button', { name: /Tải lên|Thay thế/i })).not.toBeInTheDocument()
expect(screen.getByText('Chưa có tệp để xem trước.')).toBeInTheDocument()
expect(screen.queryByAltText('Ảnh chụp thực địa')).not.toBeInTheDocument()
```

Also assert that an unsupported `ban-ve.dwg` with a real URL shows the unavailable message and a link/action targeting that exact URL.

- [ ] **Step 2: Run the test and prove it fails before implementation**

Run:

```powershell
npm.cmd test -- --run src/features/employee-portal/DocumentPreviewModal.test.jsx
```

Expected before implementation: FAIL because fabricated content/upload controls still exist.

- [ ] **Step 3: Implement the minimal read-only viewer**

Use the existing `url`, `blob`, extension constants, and `docx-preview`. Do not add a dependency or a new abstraction. Delete unused upload state and handlers instead of leaving dead code.

- [ ] **Step 4: Run focused tests**

```powershell
npm.cmd test -- --run src/features/employee-portal/DocumentPreviewModal.test.jsx src/features/employee-portal/EmployeeItemWorkspace.test.jsx
```

Expected: both files pass; no test expects fabricated content.

- [ ] **Step 5: Worker self-review and handoff**

Run:

```powershell
rg -n "unsplash|SHA-256|handlePickPreset|autoResolve|onUpdateChecklistFile|Tải lên / Thay thế" src/features/employee-portal/DocumentPreviewModal.jsx
git diff --check -- src/features/employee-portal/DocumentPreviewModal.jsx src/features/employee-portal/documentPreviewModal.css src/features/employee-portal/DocumentPreviewModal.test.jsx
```

Expected: `rg` returns no matches; diff check passes. Do not commit.

### Task 1 Review Gate

**Owner:** Fresh review subagent, then coordinator.

Reviewer prompt:

```text
Review only the Task 1 diff against docs/superpowers/plans/2026-09-03-employee-workflow-logic-hardening.md. Do not edit files. Findings first, ordered by severity. Verify that every displayed byte/claim comes from supplied real data, unsupported files fail honestly, all upload/preset/SHA behavior is gone, and existing authenticated preview wiring remains compatible. Check tests for false positives. Return APPROVE or REQUEST_CHANGES with file:line evidence.
```

Coordinator rejects Task 1 if the viewer displays any stock/fabricated content or if a success/download action can occur without a real URL.

---

## Wave 2: Exact-Child Durable Upload

### Task 2: Wire `NodeOutputList` Upload to the Existing Multipart API

**Owner:** Antigravity  
**Execution:** `agy` only after Task 1 is approved.  
**Files:**
- Modify: `dev/frontend/src/features/employee-portal/NodeOutputList.jsx`
- Modify: `dev/frontend/src/features/employee-portal/NodeOutputList.test.jsx`
- Modify: `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx`
- Modify: `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.test.jsx`

**Interfaces:**
- `NodeOutputList` produces `onUploadDocument({ checklistResultId, templateId, documentId, file })`.
- `EmployeeItemWorkspace` consumes that payload and POSTs `FormData` to `/api/employee-portal/tasks/{taskNodeId}/checklist/{checklistResultId}/output-documents`.
- Multipart keys are exactly `template_id` and `file`.
- A replacement creates a new server document for the same template/slot; it does not mutate client review status.

**Exact Antigravity prompt:**

```text
Work only in T:\github\bachkhoa-erp. Do not touch T:\New folder and do not edit DocumentPreviewModal in this task.

Task: connect the upload icon in the new NodeOutputList UI to the existing real output-document API. Reuse the request pattern in ChecklistOutputDocuments.jsx lines 61-79. Do not invent a new endpoint or client-side status model.

Allowed files only:
- dev/frontend/src/features/employee-portal/NodeOutputList.jsx
- dev/frontend/src/features/employee-portal/NodeOutputList.test.jsx
- dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx
- dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.test.jsx

Required behavior:
1. For each non-approved document row, the upload icon opens a real file input for that exact template_id.
2. The callback payload is exactly { checklistResultId: checklistItem.id, templateId: doc.template_id, documentId: doc.document_id || null, file }.
3. EmployeeItemWorkspace creates FormData, appends template_id and file, and POSTs to /api/employee-portal/tasks/{task.id}/checklist/{checklistResultId}/output-documents using apiFetch.
4. Show success only after the POST resolves. On error show the API error and do not change local document/review state.
5. Call onRefresh after success so server state replaces the UI state.
6. Approved documents never expose a file input or replacement button.
7. A rejected child uses its own templateId; never use array index, first child, file name, or parent-level fallback.
8. Disable only the row currently uploading and prevent duplicate submission for that row.

Write failing tests first. Include a checklist with two children and click/upload child B; assert FormData contains B's template_id and the exact File object, and no request targets child A. Do not commit. Return exact diff and test output.
```

- [ ] **Step 1: Add the exact-child callback test in `NodeOutputList.test.jsx`**

Required shape:

```jsx
const file = new File(['replacement'], 'ban-ve-sua.pdf', { type: 'application/pdf' })
fireEvent.change(screen.getByLabelText('Tải lên Bản vẽ hiện trạng'), {
  target: { files: [file] },
})
expect(onUploadDocument).toHaveBeenCalledWith({
  checklistResultId: 'CR-1',
  templateId: 'T-BANVE',
  documentId: 'd2',
  file,
})
```

Add an assertion that the approved `T-CCCD` row has no upload input/button.

- [ ] **Step 2: Add the parent API wiring test in `EmployeeItemWorkspace.test.jsx`**

After selecting child B's file, assert:

```jsx
expect(apiFetch).toHaveBeenCalledWith(
  '/api/employee-portal/tasks/n2/checklist/c1/output-documents',
  expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
)
const body = apiFetch.mock.calls.find(([url]) => url.includes('/output-documents'))[1].body
expect(body.get('template_id')).toBe('T-BANVE')
expect(body.get('file')).toBe(file)
```

Add failure coverage: rejected API promise produces an error toast, does not call `onRefresh`, and does not show success.

- [ ] **Step 3: Run tests and verify the new cases fail**

```powershell
npm.cmd test -- --run src/features/employee-portal/NodeOutputList.test.jsx src/features/employee-portal/EmployeeItemWorkspace.test.jsx
```

Expected before implementation: FAIL because `EmployeeItemWorkspace` does not pass `onUploadDocument`.

- [ ] **Step 4: Implement minimal upload wiring**

Use one hidden input per document row or one stable ref map keyed by `template_id`. Do not place upload logic back into the preview modal. Clear the input value after each attempt so choosing the same file again fires `change`.

- [ ] **Step 5: Run focused tests and lint the changed files**

```powershell
npm.cmd test -- --run src/features/employee-portal/NodeOutputList.test.jsx src/features/employee-portal/EmployeeItemWorkspace.test.jsx
npm.cmd exec oxlint src/features/employee-portal/NodeOutputList.jsx src/features/employee-portal/EmployeeItemWorkspace.jsx
```

Expected: tests pass; oxlint has no errors.

- [ ] **Step 6: Worker self-review and handoff**

Verify the diff contains no localStorage, base64 persistence, client-authored `approved`, or new endpoint. Do not commit.

### Task 2 Review Gate

**Owner:** Fresh review subagent, then coordinator.

Reviewer prompt:

```text
Review only Task 2. Do not edit. Trace one rejected child from DOM row through template_id/checklistResultId/File into the exact multipart API request and back through onRefresh. Verify approved rows cannot replace, failed requests cannot show success, same-file retry works, and no sibling/first-child fallback exists. Findings first with file:line evidence; finish APPROVE or REQUEST_CHANGES.
```

Coordinator additionally checks the Network request manually during Playwright; a green Vitest alone is insufficient.

---

## Wave 3: Hard/Soft Submit Gate Alignment

### Task 3: Make `NodeActionBar` Consume Server Blockers Correctly

**Owner:** Antigravity  
**Execution:** `agy` only after Task 2 is approved.  
**Files:**
- Modify: `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx`
- Modify: `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx`
- Modify: `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx`
- Modify: `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.test.jsx`

**Interfaces:**
- `NodeActionBar({ task, onChanged, gate = null })` accepts the already-loaded shortage payload when embedded in `EmployeeItemWorkspace`.
- Hard blocker kinds: `paused`, `rejected_documents`.
- Soft blocker kind/data: `missing_documents` and the existing `data` shortage list.
- Calendar/modal callers that do not provide `gate` retain the click-time `/shortage` request.

**Exact Antigravity prompt:**

```text
Work only in T:\github\bachkhoa-erp. Do not edit backend files or T:\New folder.

Task: align NodeActionBar with the server blocker payload without changing the existing one-submit business rule.

Allowed files only:
- dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx
- dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx
- dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx
- dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.test.jsx

Required behavior:
1. Add optional prop gate=null to NodeActionBar and pass the EmployeeItemWorkspace gate into it.
2. Disable submit for task.pause_reason_type, blocker kind paused, blocker kind rejected_documents, or incomplete checklist statuses pending/failed/in_progress.
3. The disabled title/text must include the server blocker message.
4. Do NOT disable for missing_documents. Missing documents keep the existing confirmation modal and “Vẫn nộp nghiệm thu” path.
5. Do NOT treat pending_approval as blocked; it is the ERP completed-by-employee state awaiting director review.
6. On click, inspect the fresh /shortage response. If it contains a hard blocker, stop and show its message; do not call /submit even when the initial gate prop was stale/null.
7. If /shortage fails, preserve the current behavior: call /submit and rely on the backend authority.
8. K06/handover remains on its specialized path and must not gain a generic submit button.

Write failing tests first for paused, rejected_documents, missing_documents, stale-gate hard blocker, pending_approval, and K06. Do not commit. Return diff and focused test output.
```

- [ ] **Step 1: Add hard-blocker tests**

Required assertions:

```jsx
expect(screen.getByRole('button', { name: /Nộp nghiệm thu/i })).toBeDisabled()
expect(screen.getByText(/Còn 1 tờ bị Giám đốc trả lại/)).toBeInTheDocument()
expect(apiFetch.mock.calls.filter(([url]) => String(url).includes('/submit'))).toHaveLength(0)
```

Cover both an initial `gate` prop and a hard blocker returned by the click-time `/shortage` request.

- [ ] **Step 2: Preserve soft-missing behavior with a regression test**

Assert missing documents leave the button enabled, open `ModalThieuTaiLieu`, and submit only after explicit confirmation.

- [ ] **Step 3: Run the focused tests and prove new hard-blocker cases fail**

```powershell
npm.cmd test -- --run src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx src/features/employee-portal/EmployeeItemWorkspace.test.jsx
```

- [ ] **Step 4: Implement the minimal gate wiring**

Prefer a module-level `Set(['paused', 'rejected_documents'])` and one helper that extracts hard-blocker messages. Do not create a new state-management layer or change the shortage API.

- [ ] **Step 5: Run focused tests**

```powershell
npm.cmd test -- --run src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx src/features/employee-portal/EmployeeItemWorkspace.test.jsx
```

Expected: hard blockers prevent `/submit`; missing documents still use confirmation; pending approval remains submittable; K06 stays specialized.

- [ ] **Step 6: Worker self-review and handoff**

Return exact test names and output. Do not commit.

### Task 3 Review Gate

**Owner:** Fresh review subagent, then coordinator.

Reviewer prompt:

```text
Review Task 3 only. Do not edit. Verify the code distinguishes hard paused/rejected blockers from soft missing-document warnings, blocks both stale initial state and fresh API responses, does not block pending_approval, preserves K06 specialization, and never relies solely on disabled UI for security. Findings first, then APPROVE or REQUEST_CHANGES.
```

---

## Wave 4: Deterministic Playwright Specification

### Task 4: Harden the Existing Employee Logic Audit Spec

**Owner:** OpenCode  
**Execution:** `opencode` only after Waves 1-3 are approved.  
**Files:**
- Modify: `dev/frontend/e2e/employee-logic-audit.spec.js`
- Modify: `dev/frontend/playwright.audit.config.js`
- Modify only if necessary: `dev/frontend/package.json`

**Interfaces:**
- Reads: `E2E_BASE_URL`, `E2E_USERNAME`, `E2E_PASSWORD`.
- Produces: strict Playwright tests; no optional selector branches and no embedded secret.
- Runtime is supplied by Docker Compose. The spec does not start or reset production-like services.

**Exact OpenCode prompt:**

```text
Work only in T:\github\bachkhoa-erp. This is a small test-code task. Do not change application source, backend, Docker files, or T:\New folder.

Allowed files only:
- dev/frontend/e2e/employee-logic-audit.spec.js
- dev/frontend/playwright.audit.config.js
- dev/frontend/package.json only if adding "e2e:employee"

Rewrite the existing optional smoke test into strict assertions:
1. Read E2E_BASE_URL (default http://127.0.0.1:3000), E2E_USERNAME, E2E_PASSWORD. Throw a clear setup error when username/password are absent. Never hardcode credentials.
2. Login and require dashboard plus at least one “Mở ra làm” task.
3. Open node detail and require node chain, attachment cabinet, checklist output area, and action/footer.
4. Open a real document row. Assert dialog file name matches that row's displayed file name/document label. Assert no upload tab, no Unsplash URL, no fabricated cadastral preview, and no SHA-256 verified text.
5. If the selected format cannot be previewed, require the honest unsupported/unavailable message and a real download URL. Do not silently skip.
6. Observe console errors, page errors, request failures, and HTTP 5xx. Fail at the end with the collected list; do not merely log it.
7. Mobile test at 390x844 must open node detail, require document/actions remain reachable, and assert document/body scrollWidth <= viewport width.
8. Do not mutate workflow state in the smoke cases. The coordinator will run a separate exact-child upload acceptance interactively against a known rejected fixture.
9. Save desktop and mobile screenshots through testInfo.outputPath.
10. Use robust role/label selectors. Remove every `if (await locator.count())` optional branch for required UI.
11. Put a custom Chrome path under `use.launchOptions.executablePath`; `use.executablePath` is not a valid Playwright project option. Prefer bundled Chromium when available and use `E2E_CHROME_PATH` only as an explicit fallback.

Do not run Playwright. The coordinator owns Playwright execution. You may run JavaScript syntax/import validation only. Do not commit. Return changed files and the exact environment variables required.
```

- [ ] **Step 1: Remove hardcoded credentials and optional assertions**

Required setup:

```js
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'
const username = process.env.E2E_USERNAME
const password = process.env.E2E_PASSWORD
if (!username || !password) throw new Error('Set E2E_USERNAME and E2E_PASSWORD')
```

- [ ] **Step 2: Make runtime failures fatal**

Collect errors during the test and finish with:

```js
expect(runtimeFailures, runtimeFailures.join('\n')).toEqual([])
```

Do not broadly ignore `/api/employee-portal/file` failures; authenticated preview failures are part of this audit.

- [ ] **Step 3: Add an explicit package script if absent**

Allowed script:

```json
"e2e:employee": "playwright test --config=playwright.audit.config.js"
```

- [ ] **Step 4: Syntax-check without running Playwright**

```powershell
node --check e2e/employee-logic-audit.spec.js
node --check playwright.audit.config.js
```

Expected: both commands exit zero. Do not run browser tests.

### Task 4 Review Gate

**Owner:** Fresh review subagent, then coordinator.

Reviewer prompt:

```text
Review only the employee Playwright spec/config diff. Do not run or edit. Confirm secrets are env-only, required UI has strict assertions, no required path is conditionally skipped, runtime/network failures are fatal, screenshots use outputPath, and the test does not mutate workflow state. Findings first, then APPROVE or REQUEST_CHANGES.
```

---

## Wave 5: Coordinator Verification

### Task 5: Run Unit, Integration, Build, and Graph Checks

**Owner:** Coordinator only.

**Files:** No new production edits unless a verified failure is sent back to the owning worker.

- [ ] **Step 1: Run focused frontend tests**

```powershell
npm.cmd test -- --run src/features/employee-portal/DocumentPreviewModal.test.jsx src/features/employee-portal/NodeOutputList.test.jsx src/features/employee-portal/EmployeeItemWorkspace.test.jsx src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx
```

Working directory: `dev/frontend`  
Expected: all pass.

- [ ] **Step 2: Run the full frontend suite**

```powershell
npm.cmd test
npm.cmd run build
npm.cmd exec oxlint src/features/employee-portal
```

Expected: all tests and build pass; oxlint has no errors. Existing warnings must be listed, not silently described as clean.

- [ ] **Step 3: Run existing backend regression tests around authority and review state**

```powershell
python -m pytest -q tests/test_document_review.py tests/test_rework_and_single_task_holes.py tests/test_node_pause.py tests/test_nop_nghiem_thu_thieu_tai_lieu.py tests/test_handover_override_gate_unittest.py tests/test_employee_portal_prior_document_security.py
```

Working directory: `dev/backend`  
Expected: all pass. No backend production edit is needed when these tests remain green.

- [ ] **Step 4: Analyze the final graph diff**

Run:

```powershell
node .gitnexus/run.cjs detect-changes --scope all --repo .
```

Expected: no `partial` or `truncated` result. Review every affected flow. If a backend critical symbol appears despite the file restrictions, reject the diff.

- [ ] **Step 5: Check diff boundaries**

```powershell
git diff --check
git status --short
git diff -- dev/frontend/src/features/employee-portal dev/frontend/e2e dev/frontend/playwright.audit.config.js dev/frontend/package.json
```

Expected: no edits under `T:\New folder`, no backend production edits, no unrelated formatting churn, no embedded credentials.

### Task 6: Run Docker Playwright Acceptance

**Owner:** Coordinator only. Antigravity/OpenCode results are not accepted as Playwright evidence.

**Preconditions:**
- Docker services are running and healthy.
- Frontend is reachable at `E2E_BASE_URL`.
- The chosen employee account has at least one assigned item.
- For the exact-child upload case, identify a node with at least two output-document templates and one rejected or missing non-approved template. If the seed does not contain this state, record `TEST_DATA_BLOCKED`; do not silently skip and do not mutate an unrelated production-like record.

- [ ] **Step 1: Verify Docker runtime**

```powershell
docker compose -f docker-compose.dev.yml ps
```

Expected: frontend, backend, database, Redis, and MinIO are running; backend health check passes.

- [ ] **Step 2: Run strict automated desktop/mobile Playwright**

Set credentials in the shell environment, then run:

```powershell
npm.cmd run e2e:employee
```

Working directory: `dev/frontend`  
Expected: desktop and mobile tests pass with no page error, console error, failed authenticated document request, or HTTP 5xx.

- [ ] **Step 3: Execute TC-PW-01 exact preview identity**

1. Login as an employee.
2. Open an assigned item and a checklist containing two child document types.
3. Click child B.
4. Assert the modal title/filename equals child B, not child A.
5. Assert the network request is `/api/employee-portal/tasks/{currentTaskId}/documents/{childB.document_id}/file`.
6. Assert response status is 200 and displayed bytes come from the returned blob.
7. Assert the page contains no Unsplash URL, fake cadastral content, or SHA-256 claim.

- [ ] **Step 4: Execute TC-PW-02 exact-child durable upload**

1. Select a rejected or missing child B.
2. Use `setInputFiles` with an in-memory file named `pw-child-b-replacement.pdf`.
3. Assert exactly one POST targets `/api/employee-portal/tasks/{taskId}/checklist/{checklistResultId}/output-documents`.
4. Assert multipart `template_id` equals child B's template ID.
5. Wait for the success response and UI refresh.
6. Reload the page.
7. Assert child B now shows the server-returned pending/current document state and child A is unchanged.
8. A 4xx/5xx or missing seed fails the case; it is not skipped.

- [ ] **Step 5: Execute TC-PW-03 hard and soft gates**

Hard-block fixture:
- `paused` or `rejected_documents` message is visible.
- Submit button is disabled.
- No `/submit` request occurs.

Soft-missing fixture:
- Submit button is enabled.
- First click opens the missing-document confirmation.
- Cancel produces no `/submit` request.
- Confirm produces one `/submit` request.

- [ ] **Step 6: Execute TC-PW-04 authorization and error states**

Verify an inaccessible document returns a clear 403 UI error; a 401 dispatches the unauthorized flow; neither opens fabricated content. Verify a user cannot open another employee's locked node from `NodeChain`.

- [ ] **Step 7: Execute TC-PW-05 responsive acceptance**

Run at 1440x900 and 390x844. At both widths, assert node chain, output rows, preview close/download actions, upload action, blocker message, and submit footer do not overlap or escape the viewport. Check `document.documentElement.scrollWidth <= window.innerWidth`.

- [ ] **Step 8: Inspect evidence**

Open the Playwright screenshots and review the relevant page sections. A DOM assertion without screenshot inspection is insufficient for overlap/layout acceptance.

---

## Failure Routing

| Failure | Return to |
|---|---|
| Fabricated preview, modal accessibility, viewer layout | Antigravity Task 1 |
| Wrong template/document identity, upload request, false success | Antigravity Task 2 |
| Paused/rejected/missing submit behavior | Antigravity Task 3 |
| Flaky/optional selectors, credential/config issue | OpenCode Task 4 |
| Backend authority/storage regression | Stop; coordinator diagnoses and requests approval before assigning backend code |
| Docker or missing fixture only | Coordinator records environment blocker; coding workers do not patch around it |

Each repair round receives only the failing assertion, relevant file ownership, actual network/console evidence, and expected behavior. After three failed repair rounds, replace the coding worker with a fresh Antigravity session and narrow the task further.

## Final Acceptance Criteria

- No employee preview displays stock images, generated cadastral documents, fixed signatures, coordinates, or unverifiable SHA claims.
- Preview opens the exact selected child document by server `document_id`.
- Upload sends real bytes for the exact `checklistResultId + templateId`, survives reload, and never changes a sibling.
- Approved documents cannot be replaced from the employee UI.
- Hard blockers prevent submission before a request; soft missing documents require explicit confirmation.
- Backend remains authoritative and its review/pause/handover/security regression tests pass.
- Full frontend tests and build pass.
- Coordinator-run Playwright passes desktop and mobile with inspected screenshots and clean runtime/network evidence.
- GitNexus final analysis is complete, non-partial, and contains no unexpected backend critical-symbol change.
- No commits are created automatically.
