# Contract Workflow QA Fixes Implementation Plan

> **For agentic workers:** Use the repository skills `systematic-debugging`, `test-driven-development`, and `verification-before-completion` when the active CLI discovers them. If a skill cannot be loaded, follow every equivalent instruction in this document directly; no MCP, plugin, memory, or prior chat context is required.

**Goal:** Fix every confirmed defect in `docs/qa/contract-workflow-qa-report-final.md` without regressing contract document preview, multi-file upload, role visibility, or the intentional K01 override flow.

**Architecture:** Run three isolated coding streams in parallel. Copilot owns contract/realtime and task-panel UI defects, OpenCode owns workflow activation validation, and Antigravity owns employee claim/avatar defects. Codex owns planning, impact review, integration review, automated verification, and Playwright acceptance testing; Codex does not implement production code.

**Tech Stack:** React, Vitest/Testing Library, FastAPI, pytest, PostgreSQL, MinIO, Docker Compose, Playwright CLI.

## Global Constraints

- Source workspace: `T:\github\bachkhoa-erp_alias`.
- Source of truth: `docs/qa/contract-workflow-qa-report-final.md`.
- The required worker skills are already installed and discoverable: Copilot and OpenCode load the repository catalog from `.agents/skills`/`.claude/skills`; Antigravity loads the matching personal catalog from `C:\Users\nhoan\.gemini\config\skills`. Do not duplicate these directories into a worktree.
- Every worker prompt remains self-contained even when skills are available: include the complete file list, expected behavior, constraints, test commands, and required evidence. A skill may strengthen execution discipline but may not broaden scope or replace the written acceptance criteria.
- Skill assignment:
  - All coding workers: `systematic-debugging`, `test-driven-development`, `verification-before-completion`.
  - OpenCode activation stream: additionally use `gitnexus-debugging` and `gitnexus-impact-analysis` when its GitNexus runtime is healthy.
  - Copilot React stream: use the repository TDD skill; framework test commands in this plan remain authoritative.
  - Antigravity employee stream: use the same three core skills from its personal catalog; it does not need a plugin installation.
- Codex alone uses `using-git-worktrees`, `dispatching-parallel-agents`, review skills, and Playwright/browser QA to orchestrate and verify the workers.
- Codex orchestration additionally uses the globally installed `parallel-execution-optimizer` and `team-agent-orchestration` skills. These provide the lane matrix, work-item ownership, handoff format, and merge gates below; they do not authorize Codex to write production code.
- MCP assignment:
  - Copilot: use workspace `gitnexus` from `.mcp.json`; Supabase and Playwright may remain configured but are outside this worker's task and must not be invoked.
  - OpenCode: use the connected local `gitnexus` server (`node .gitnexus/run.cjs mcp`).
  - Antigravity: use the enabled local `gitnexus` server (`node .gitnexus/run.cjs mcp`). Its personal Notion MCP is unrelated and must not be invoked by a coding worker.
- At worker startup, run a read-only GitNexus context/status probe. If MCP startup fails, continue with `node .gitnexus/run.cjs status`, `query`, `context`, and `impact` from the repository root and record the degraded path in the handoff.
- Before changing any named function/class/method, Codex records GitNexus upstream impact. If GitNexus remains unavailable, the worker must provide a text search of all call sites and Codex must review that evidence before accepting the patch.
- Workers use test-driven development: add a failing regression test, run it and capture the failure, implement the minimum fix, then run the focused suite.
- Workers may modify only files assigned to their stream. Any newly discovered cross-stream dependency is returned to Codex for reassignment.
- Preserve already-passing behavior: DOCX/PDF preview, local download, unlimited sequential multi-file upload, role permissions, and existing employee tabs.
- No database cleanup, fixture deletion, schema reset, or destructive Git command.
- Do not commit generated artifacts, browser profiles, screenshots, `.env` files, or credentials.
- Policy decisions used by this plan:
  - Missing mandatory checklist allocation blocks workflow activation.
  - Missing piece-rate mapping does not block activation; it produces a specific warning and requires explicit confirmation because some nodes are intentionally unpaid.
  - Missing K01 documents does not hard-lock submission; the user may submit only through the existing explicit `Vẫn nộp nghiệm thu` confirmation.
- Worker model fallback:
  - OpenCode: use `ox alpha` if listed; otherwise select its strongest available coding model.
  - Antigravity: prefer a Gemini Pro coding model to avoid Claude quota exhaustion; fall back to Gemini Flash or another available coding model.
  - Copilot: use `--model auto` unless a stronger available coding model is confirmed.
- If a worker exhausts quota mid-task, stop that process, save its diff and test output, then give the remaining checklist plus current diff to another CLI. The replacement must review the inherited patch before continuing; never restart by discarding work.

---

## Orchestration Board

| Lane | Owner CLI | Parallel | Write surface | Initial state | Merge gate |
| --- | --- | --- | --- | --- | --- |
| A — contract/realtime and specialized panels | Copilot | Yes | ContractWorkspace, EmployeeWorkspaceCalendar, DocumentRegister and focused tests | Ready | Tasks 1-3 focused tests pass and no unrelated request is emitted |
| B — activation readiness | OpenCode | Yes | workflow activation backend/frontend and focused tests | Ready | Tasks 4-5 backend/frontend tests pass and activation is atomic |
| C — claim/avatar behavior | Antigravity | Yes | EmployeeWorkspace, optional dashboard/service, avatar utilities and focused tests | Ready | Tasks 6-7 focused tests pass and no invalid claim/direct MinIO request occurs |
| Integration and acceptance | Codex | After A/B/C review | No production-code authorship; integration metadata and QA evidence only | Gated | Full suites, build, GitNexus change review, and Playwright pass |

Each worker owns one isolated worktree and one handoff artifact under `.superpowers/orchestration/contract-workflow-qa/<lane>/handoff.md`. The handoff must contain:

- Current state: `running`, `review`, or `blocked`.
- Base commit, branch, worktree, and exact changed files.
- GitNexus impact result for each changed symbol or the recorded CLI fallback.
- Failing-before and passing-after test commands with output summaries.
- Remaining risk, assumptions, and any requested cross-lane change.
- Final commit SHA when the lane reaches `review`.

No lane moves to `review` without its handoff. No lane moves to integration because the worker says it is done; Codex must independently pass the stated merge gate.

---

## Parallel Stream A — GitHub Copilot CLI

### Task 1: Restore contract workspace realtime authentication (BUG-001)

**Files:**

- Modify: `dev/frontend/src/components/contracts/ContractWorkspace.jsx`
- Test: `dev/frontend/src/components/contracts/ContractWorkspace.test.jsx` (create if absent)

**Expected behavior:** Opening the contract workspace must not throw `getAccessToken is not defined`; the realtime subscription must receive the current access token and clean up normally.

**Step 1: Write the failing regression test**

- Mock the API/auth module and realtime subscription boundary.
- Render `ContractWorkspace` with the smallest valid props/state.
- Assert rendering does not throw and the subscription receives the mocked token.
- Assert unsubscribe/cleanup runs on unmount.

**Step 2: Prove the test fails**

Run from `dev/frontend`:

```powershell
npm test -- src/components/contracts/ContractWorkspace.test.jsx
```

Expected pre-fix result: failure caused by the missing `getAccessToken` binding or missing token passed to subscription.

**Step 3: Implement the minimum fix**

- Import `getAccessToken` from the existing frontend API/auth utility used elsewhere in the repository.
- Do not change subscription timing, event handling, contract fetches, or preview/upload behavior.

**Step 4: Verify**

Run the focused test again and then all tests covering `ContractWorkspace`.

**Step 5: Handoff evidence**

Return the diff, failing-before output, passing-after output, and exact call-site search used for impact review.

### Task 2: Stop irrelevant task-detail API calls (BUG-004)

**Files:**

- Modify: `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx`
- Test: `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx`
- Read only unless a test proves a component bug: `LegalDossierNodePanel.jsx`, `SubmissionReceiptPanel.jsx`, `HandoverPanel.jsx`

**Expected behavior:** A drawing task opens without requesting legal dossier/submission endpoints or handover endpoints. Each specialized panel mounts only for a task whose metadata declares that capability.

**Step 1: Write failing request-boundary tests**

- Render a drawing task and assert legal dossier, submission receipt, and handover panel requests are absent.
- Render a legal/submission task and assert only its relevant panels are present.
- Render a handover task (`is_handover` or canonical handover node code) and assert the handover panel is present.
- Use existing task metadata already returned by the API; do not infer capability from Vietnamese display text.

**Step 2: Prove tests fail**

```powershell
npm test -- src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx
```

Expected pre-fix result: the drawing-task test observes unconditional specialized panel mounting/API calls.

**Step 3: Implement conditional mounting**

- Derive small boolean capability guards from the task metadata.
- Mount each specialized panel only when its guard is true.
- Preserve the existing handover task controls and completed-task rendering.

**Step 4: Verify and hand off**

- Run the focused test file.
- Return the diff and evidence that a drawing task generates none of the former 403/400 requests.

### Task 3: Align missing-document copy with the intentional override flow (BUG-007)

**Files:**

- Modify: `dev/frontend/src/features/document-register/DocumentRegister.jsx`
- Test: `dev/frontend/src/features/document-register/DocumentRegister.test.jsx`
- Regression test only: `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx`

**Expected behavior:** The document register warns that K01 is incomplete but does not claim submission is impossible. Submitting with missing documents still opens the shortage modal and requires the explicit `Vẫn nộp nghiệm thu` action.

**Step 1: Add a failing copy/behavior test**

- Assert the old absolute-lock text `Không thể nộp K01` is absent.
- Assert the new warning explains that documents are missing and explicit confirmation will be required at submission.
- Keep or add the calendar regression proving the override button is required.

**Step 2: Implement only the copy/state presentation change**

- Replace lock semantics/iconography with warning semantics.
- Do not bypass or remove `ModalThieuTaiLieu`.
- Do not weaken the explicit confirmation requirement.

**Step 3: Verify**

```powershell
npm test -- src/features/document-register/DocumentRegister.test.jsx src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx
```

Return diff and focused test output to Codex.

---

## Parallel Stream B — OpenCode CLI

### Task 4: Enforce activation readiness on the backend (BUG-002, BUG-003)

**Files:**

- Modify: `dev/backend/src/workflow_runtime.py`
- Modify only if activation route response mapping requires it: the existing workflow activation route module found by searching for the caller of the activation service
- Test: the existing workflow runtime/activation pytest module; create `dev/backend/tests/test_workflow_activation_readiness.py` only if no focused module exists

**Expected behavior:** Activation is rejected atomically when any mandatory checklist document type is unallocated. Missing piece-rate mappings are returned as warnings, not blockers. A failed activation must not partially activate nodes, tasks, checklist rows, or workflow state.

**Step 1: Locate the exact activation transaction**

- Search for the service called by the workflow activation HTTP route.
- Return the function name, callers, transaction boundary, and current response schema before editing.
- Do not rename public API fields.

**Step 2: Write failing backend tests**

- Mandatory checklist item with no node allocation returns a deterministic 4xx validation response containing document identifiers/names and leaves the workflow inactive.
- Fully allocated checklist activates successfully.
- Missing piece-rate mapping does not block activation and is present in a warning collection.
- A mixed invalid request creates no partial runtime records.

**Step 3: Prove tests fail**

Run the focused pytest module using the repository's existing backend environment.

**Step 4: Implement server-authoritative validation**

- Compute blockers and warnings from persisted workflow configuration inside the activation transaction.
- Validate before creating runtime tasks or changing activation state.
- Return a structured response that the frontend can render without parsing prose.
- Reuse existing domain types/helpers where possible.

**Step 5: Verify**

- Run focused activation tests.
- Run the existing workflow-runtime test group.
- Return schema examples for successful activation, blocked activation, and warning-only activation.

### Task 5: Present activation blockers and require warning confirmation (BUG-002, BUG-003)

**Files:**

- Modify: `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`
- Test: the existing `ContractWorkflowDesigner` test module; create `dev/frontend/src/components/contracts/ContractWorkflowDesigner.test.jsx` if absent

**Expected behavior:** Admin cannot activate while mandatory checklist allocations are missing. The UI identifies every blocker. If only piece-rate warnings remain, activation requires a second explicit confirmation and clearly states that affected work receives no piece-rate pay.

**Step 1: Write failing UI tests**

- Blocked response keeps the designer inactive and lists all unallocated mandatory document types.
- Warning-only response opens an explicit confirmation dialog and does not activate before confirmation.
- Confirming warning-only activation completes the existing success path.
- Cancelling leaves workflow inactive.

**Step 2: Implement against Task 4's structured schema**

- Keep backend validation authoritative; frontend preflight is advisory UX only.
- Reuse the existing dialog/toast system.
- Do not silently convert warnings into success or blockers into warnings.

**Step 3: Verify**

```powershell
npm test -- src/components/contracts/ContractWorkflowDesigner.test.jsx
```

Return diff, test output, and screenshots or rendered-text assertions for blocker and warning states.

---

## Parallel Stream C — Antigravity CLI

### Task 6: Prevent predictable invalid claim requests (BUG-005)

**Files:**

- Modify: `dev/frontend/src/features/employee-portal/EmployeeWorkspace.jsx`
- Modify only if shared error handling is required: `dev/frontend/src/features/employee-portal/EmployeePortalDashboard.jsx`
- Modify only if the task-pool payload is inconsistent with claim enforcement: `dev/backend/src/employee_portal/service.py`
- Test: existing employee workspace frontend test module
- Test if backend changes: existing employee portal task-pool/claim pytest module

**Expected behavior:** An employee with an active conflicting job cannot send a claim request. The claim control is disabled with the backend-provided reason. Race conditions still receive the normal business error without an uncaught exception.

**Step 1: Reconcile list and mutation policy**

- Compare task-pool `can_claim`/reason computation with claim endpoint validation.
- Document any mismatch before editing.
- The backend remains authoritative; do not turn a real conflict into HTTP 200.

**Step 2: Write failing tests**

- A pool item with `can_claim: false` renders a disabled claim action and reason.
- Clicking anywhere on a disabled card does not invoke the claim API.
- A claim that becomes invalid after rendering shows the existing business alert and does not produce an uncaught promise error.
- If backend payload generation changes, add parity tests proving the same active-job rule drives list eligibility and mutation rejection.

**Step 3: Implement minimal eligibility guarding**

- Use per-item eligibility from the API in addition to global WIP state.
- Guard both the visible button and any card/detail-modal claim entry point.
- Preserve 422 for server-side race/conflict enforcement.

**Step 4: Verify and hand off**

- Run focused frontend tests and backend tests if changed.
- Return evidence that no claim network call occurs for a known-ineligible item.

### Task 7: Route avatars through authenticated storage access (BUG-006)

**Files:**

- Modify: `dev/frontend/src/lib/avatar.js`
- Modify: `dev/frontend/src/lib/privateStorage.js` only if object-key normalization belongs there
- Modify/test: `dev/frontend/src/components/AvatarImage.jsx` only if fallback behavior needs correction
- Test: existing avatar/private-storage test modules; create focused tests beside these utilities if absent
- Backend route is read-only unless tests prove it cannot serve existing `avatars/` keys: `dev/backend/src/routes_employee_portal.py`

**Expected behavior:** Browser pages never request private avatar objects directly from `localhost:9000`. Both legacy full MinIO URLs and new object keys resolve through the authenticated application file endpoint; broken avatars fall back cleanly.

**Step 1: Write failing normalization tests**

- Full legacy MinIO URL containing an `avatars/...` object resolves to the application proxy path.
- Plain `avatars/...` object key resolves to the same proxy path.
- Normal public/data/blob URLs retain their existing allowed behavior.
- Invalid or unrecognized private URL falls back without a direct MinIO request loop.

**Step 2: Implement client-side compatibility**

- Extract and decode only the object-key portion from known storage URLs.
- Pass private avatar keys through the existing authenticated file fetch/object-URL mechanism.
- Revoke replaced object URLs on cleanup.
- Do not make the MinIO bucket public and do not weaken CORS as the primary fix.

**Step 3: Verify and hand off**

- Run focused avatar tests.
- Return network evidence or a test assertion proving no direct `:9000` request is produced.

---

## Codex Review and Verification Gates

### Task 8: Review each worker patch before integration

Codex performs these checks; coding workers do not self-approve.

1. Confirm each diff changes only its assigned files and contains a failing-before regression test.
2. Run GitNexus impact analysis for every modified symbol. Warn before accepting any HIGH/CRITICAL blast radius.
3. Review for policy compliance, API contract drift, auth leakage, object URL cleanup, race conditions, and accidental changes to passing preview/upload behavior.
4. If a patch fails review, return a concrete defect list to the same worker or a fallback CLI. Codex does not directly patch production code.
5. Integrate streams one at a time and rerun each focused suite after integration.
6. Run GitNexus `detect_changes({scope: "compare", base_ref: "main"})` and verify only expected symbols/flows changed.

### Task 9: Automated regression suite

Run from `dev/frontend`:

```powershell
npm test
npm run build
```

Run the focused backend activation and employee-portal pytest modules, then the repository's normal backend test command. If Docker services are needed, start Compose from the repository root with:

```powershell
docker compose --env-file dev/backend/.env up -d
```

Required automated assertions:

- Contract workspace renders and realtime subscribes without a reference error.
- Drawing tasks make no legal/submission/handover requests.
- K01 shortage wording and override modal agree.
- Activation with unallocated mandatory checklist is atomic and blocked.
- Warning-only piece-rate activation requires confirmation.
- Known-ineligible claim performs no network mutation.
- Avatar resolution produces no direct MinIO URL.
- Existing document preview and multi-file upload tests remain green.

### Task 10: Playwright acceptance test at `http://127.0.0.1:3000/`

Codex owns this test using the Playwright skill/tooling and captures console plus network failures.

**Accounts:**

- `admin` / `admin123`
- `nguyenvana` / `123456`
- `tuongvy` / `123456`
- `myhang` / `123456`

**Admin scenarios:**

1. Open contract workspace and verify no `getAccessToken` reference error.
2. Create a contract with at least six mixed files; preview each cached file before save, save, verify every file is uploaded, reopen and preview each stored file.
3. Verify temporary browser object URLs are revoked/cleared after successful save and modal teardown.
4. Attempt activation with a mandatory checklist item unallocated: activation remains off and blocker is visible.
5. Allocate all mandatory items but leave a piece-rate mapping missing: warning confirmation appears; cancel leaves inactive; confirm activates.

**Employee scenarios:**

1. `nguyenvana`: drawing task details produce no legal/submission/handover 403/400 requests; role tabs remain Lịch trình, Hồ Sơ Đo Vẽ, Lương.
2. `tuongvy` and `myhang`: legal task panels still load where applicable; role tabs remain Lịch trình, Hồ Sơ Pháp Lý, Lương.
3. Missing K01 documents show warning copy; submission requires `Vẫn nộp nghiệm thu` and cannot bypass that confirmation.
4. Employee with an active conflict sees a disabled claim action and no claim request is sent.
5. Avatars load through the application origin; network log contains no direct `http://localhost:9000` request and no ORB/CORS error.

**Acceptance criteria:**

- Zero uncaught page errors in tested flows.
- Zero unexpected 4xx/5xx requests in tested flows.
- All seven QA defects are either fixed according to the policy above or rejected back to a coding worker.
- Previously passing preview, multi-file upload, role visibility, and admin module access remain passing.

### Task 11: Update QA evidence

After all gates pass, Codex appends a dated verification section to `docs/qa/contract-workflow-qa-report-final.md` containing:

- Commit/diff identifiers for each worker stream.
- Focused and full test commands with pass/fail counts.
- Playwright scenarios and account used.
- Before/after console and network findings.
- Any residual risk or intentionally accepted policy behavior.

Do not mark an item fixed without reproducible test evidence.

### Task 12: Clean generated artifacts before the final GitHub commit

Run this only after Tasks 9-11 pass and immediately before preparing the final commit/push.

1. Inspect `git status --short`, ignored files, and every candidate path before deleting anything.
2. Remove only generated or orchestration-temporary artifacts created by this implementation/QA run, including when present:
   - `.playwright-cli/`, Playwright browser profiles, traces, videos, screenshots, auth-state files, and HTML reports.
   - Temporary CLI prompts, worker logs, session exports, and `.superpowers/orchestration/contract-workflow-qa/` handoff artifacts that are not part of the product documentation.
   - Untracked test/build output such as coverage, caches, and generated bundles.
3. Preserve intentional source, regression tests, the implementation plan, and `docs/qa/contract-workflow-qa-report-final.md` evidence.
4. Never use a broad destructive cleanup such as `git clean -fdx`. Delete only explicit, resolved paths confirmed to be inside the repository/worktrees. Do not touch `.env`, credentials, database volumes/data, MinIO objects, or unrelated user files.
5. Re-run `git status --short` and `git diff --check`; confirm the final commit contains no generated artifacts, secrets, logs, temporary prompts, or browser state.
6. Only after this cleanup gate passes may the final commit be created and pushed to GitHub.

---

## Execution Order

1. Codex creates the orchestration board directory and three isolated worktrees, then records each lane's base commit and ownership.
2. Codex verifies each CLI can see its three core skills and can complete a read-only GitNexus MCP probe. A failed skill probe falls back to the self-contained prompt; a failed MCP probe falls back to the local GitNexus CLI.
3. Codex builds three self-contained prompts from Streams A, B, and C. Each prompt names the applicable skills, MCP/CLI fallback, allowed files, forbidden surfaces, tests, merge gate, and handoff path.
4. Launch Copilot, OpenCode, and Antigravity concurrently. Codex tracks `ready -> running -> review/blocked` from handoff artifacts instead of chat-only status.
5. Codex reviews completed streams independently; a stream may be corrected while the others continue. Cross-lane file requests are paused and reassigned before any overlapping write.
6. Integrate A, run focused tests; integrate B, run focused tests; integrate C, run focused tests. Never integrate two unreviewed lanes together.
7. Run the full frontend/backend suite and build.
8. Run the complete Playwright acceptance matrix.
9. Update the QA report only after all evidence is collected.
10. Run the explicit artifact cleanup gate, verify the final diff/status, then create and push the final GitHub commit.

## Definition of Done

- BUG-001 through BUG-007 have regression tests and verified fixes.
- No coding change was authored or self-approved by Codex.
- No worker relied on unavailable skills, MCP, plugins, or hidden context.
- Copilot, OpenCode, and Antigravity GitNexus preflight results and any fallback path are recorded in their handoffs.
- Every lane has an owner, isolated worktree, handoff artifact, and independently passed merge gate.
- Full tests/build and Playwright acceptance pass.
- GitNexus impact/detect-change evidence is recorded, or an explicit degraded-tool fallback review is recorded.
- QA report contains final reproducible evidence.
- Final GitHub commit contains no Playwright artifacts, logs, browser state, worker handoffs, temporary prompts, caches, generated bundles, or secrets.
