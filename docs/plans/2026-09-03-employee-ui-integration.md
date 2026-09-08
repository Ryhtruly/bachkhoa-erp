# Employee UI Integration Plan

**Goal:** Port the employee node-detail UI from `T:\New folder` into the existing employee portal without replacing the ERP workflow, authentication, permissions, storage, or API contracts.

**Source of truth:**

- Visual reference: `T:\New folder`.
- Workflow and state rules: the K01-K07 handoff artifact and the current backend implementation.
- Runtime integration target: `dev/frontend/src/features/employee-portal/`.
- Existing app shell, navigation, auth, API client, toast, upload, preview, and workflow actions remain authoritative.

## Confirmed Constraints

- Do not copy the prototype app shell, Tailwind setup, React 19 setup, local storage adapter, JSON demo data, Data Service Inspector, or fake preview/upload logic.
- Keep `App.jsx`, employee workspace selection, `Sidebar.jsx`, and the `EmployeePortalDashboard` data/action boundary stable.
- Use the ERP's current JSX, scoped CSS, CSS variables, `lucide-react`, shared UI components, `apiFetch`, storage service, and authenticated document routes.
- Preserve the current K01-K07 workflow behavior, including per-document review, rejection reasons, pause/resume, rollback, cluster claim, help request, rework submission, K06 debt gate, and K07 completion.
- An employee may propose a new document type through the existing `SlotRequestModal`; the prototype's direct checklist creation is not permitted.
- Never let client-side button state replace API authorization or workflow validation.
- Keep `.eiw-*` class names needed by regression tests unless a reviewed test migration explicitly changes them.
- No schema, migration, RLS, or GRANT changes are expected for this UI integration.

## Target Experience

The existing employee dashboard and work queue remain the entry point. Opening a held item renders a redesigned `EmployeeItemWorkspace` with:

1. Contract/customer context and a selectable linear K01-K07 node chain.
2. Current node title, live SLA/rework timer, status, and assignee context.
3. Responsive two-column work area:
   - Left: description, prior-step document cabinet, task pay, expected bonus, total.
   - Right: node-specific business slot and output checklist grouped by document type, with child files, review state, rejection reason, preview, and allowed upload/replace actions.
4. A stable action footer for help/cancel-help and the state-aware primary action.
5. Desktop and mobile layouts that preserve all actions and do not use fixed heights that clip content.

## Agent Operating Rules

The coordinator does not implement production code. Each implementation task is assigned to a coding agent. The coordinator owns task boundaries, GitNexus risk review, diff review, integration decisions, and final automated/browser verification.

Before editing a symbol, every agent must:

1. Run GitNexus upstream impact analysis for that symbol.
2. Report HIGH or CRITICAL risk and stop for coordinator approval.
3. Treat UNKNOWN as unresolved and confirm references with literal text search.
4. Record the focused tests it will add or update.

After each agent finishes, the coordinator reviews its diff before the next dependent task starts. Before completion, run GitNexus `detect-changes --scope all`; partial or truncated output is not accepted as clean.

## Delivery Waves

### Wave 0 - Contract and visual baseline

#### Agent A: UI-to-domain mapping

**Read-only first; no production edits until review.**

Files to inspect:

- `T:\New folder\src\App.tsx`
- `T:\New folder\src\components\*.tsx`
- `T:\New folder\public\data\process-data.json`
- `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx`
- `dev/frontend/src/features/employee-portal/EmployeeWorkspace.jsx`
- `dev/frontend/src/features/employee-portal/EmployeePortalDashboard.jsx`
- `dev/backend/src/employee_portal/service.py`
- `dev/backend/src/routes/routes_employee_portal.py`

Deliverable: a field/action mapping table from prototype props to current ERP payloads and handlers. Mark every item as `reuse`, `adapt`, `missing`, or `reject`. In particular, resolve node statuses, checklist/document hierarchy, review statuses, deadlines, money values, document URLs, permissions, and all primary actions.

Acceptance gate: no unresolved fake/demo field is allowed into an implementation task.

#### Agent B: visual baseline and responsive specification

Run the prototype through its Vite server and capture desktop and mobile screenshots. Inspect the current authenticated employee workspace at the same viewports. Produce a short visual delta checklist covering information hierarchy, spacing, colors, typography, scroll regions, modal behavior, empty/loading/error states, and keyboard focus.

Deliverable: screenshots plus a component-level adaptation spec. Use ERP design tokens; do not propose importing Tailwind.

Acceptance gate: coordinator approves the component boundaries and mobile behavior before UI edits begin.

### Wave 1 - Presentational foundation

Wave 1 can run in parallel after Wave 0. Agents must not edit the same files.

#### Agent C: workspace shell and information cards

Owned files:

- `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx`
- New presentational components for node header, timing, description, and money under `features/employee-portal/`
- Focused component tests for those components

Tasks:

- Recompose the workspace into header, node banner, responsive columns, and action footer.
- Adapt the prototype's `NodeInfoCard`, `RemainingTimeCard`, `TaskDescriptionCard`, and `CostBreakdownCard` concepts to current payloads.
- Preserve current pause/resume, rollback, help, refresh, shortage, and submit handlers as passed contracts.
- Cover loading, absent task details, paused state, rework deadline, settled/unsettled money, and long Vietnamese text.

Do not edit checklist/document components or global CSS.

#### Agent D: node chain and node-specific slot

Owned files:

- `dev/frontend/src/features/employee-portal/NodeChain.jsx`
- `dev/frontend/src/features/employee-portal/NodeBusinessSlot.jsx`
- Their focused tests

Tasks:

- Apply the prototype's clearer step presentation to the actual K01, K02, K03, K04, K05a, K05b, K06, and K07 sequence.
- Preserve `mine` and `openableIds` rules; do not make inaccessible nodes interactive.
- Render state from real node status rather than hard-coded node IDs.
- Keep business-slot selection configuration-driven (`allow_pause`, `allow_gov_tracking`, handover metadata), with complete behavior for the nodes confirmed in scope.

#### Agent E: feature-scoped styling

Owned file:

- `dev/frontend/src/features/employee-portal/employeeWorkspace.css`

Tasks:

- Implement the approved responsive layout using existing variables and `.eiw-*` selectors.
- Ensure grid/flex children use `min-width: 0` and scroll regions use `min-height: 0` where needed.
- Avoid fixed checklist heights, nested decorative cards, tiny explanatory text, layout shifts, and one-color styling.
- Verify light/dark theme compatibility and 320px-wide mobile behavior.

Dependency: Agent E starts after Agent C publishes the agreed DOM/class contract, then works only in CSS.

### Wave 2 - Checklist and real document operations

#### Agent F: checklist/document hierarchy

Owned files:

- `dev/frontend/src/features/employee-portal/NodeOutputList.jsx`
- `dev/frontend/src/features/employee-portal/ChecklistOutputDocuments.jsx`
- Related focused tests

Tasks:

- Adapt the useful hierarchy from the prototype: checklist category, child documents, per-file state, metadata, and compact actions.
- Map actual states: uploaded/pending review/approved/rejected/missing; do not use prototype-only `valid` or `pending_signature` unless the API genuinely provides them.
- Show the latest document decision and rejection reason without carrying an old rejection onto a replacement file.
- For approved documents, hide/disable replacement consistently with the backend's 409 protection.
- Keep count badges state-aware and based on real uploaded/approved counts.
- Preserve the existing proposal flow for adding a document type.

#### Agent G: upload, preview, and prior documents

Owned files:

- `dev/frontend/src/features/employee-portal/PriorDocumentsDrawer.jsx`
- Existing employee document-open integration points
- Shared preview code only if the existing API contract requires a narrowly scoped fix
- Related focused tests

Tasks:

- Reuse authenticated preview/download and existing upload/storage flows.
- Never port Data URLs, Unsplash fallbacks, fake CAD/PDF/Word rendering, alerts pretending to download, or localStorage persistence.
- Make document actions request the URL/content at click time and handle 401/403/404/409/5xx visibly.
- Keep the prior-documents drawer read-only and grouped by completed/previous node.
- Verify actual PDF/image/DOCX behavior through the authenticated browser path.

Dependency: Agents F and G may work in parallel, but neither may edit `EmployeeItemWorkspace.jsx`; they expose props/components for Agent C's integration pass.

### Wave 3 - Workflow wiring and hardening

#### Agent H: action-state integration

Owned files:

- `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx` only for the reused `NodeActionBar`/evidence exports
- `dev/frontend/src/features/employee-portal/EmployeePortalDashboard.jsx` only when required to pass existing handlers/state
- Focused action tests

Tasks:

- Preserve server-authoritative start, submit, re-submit, pause, resume, rollback, help, and cancel-help behavior.
- Disable and show busy state immediately on mutation; preserve idempotent resubmission behavior.
- Display the backend shortage/single-task/debt-gate reason next to the action instead of reducing it to a generic message.
- Confirm the employee cannot self-approve, directly add checklist definitions, overwrite approved documents, or bypass K06 debt gating.
- Add a real listener/integration test for `bachkhoa:open-employee-task` if notification deep-linking is included in the approved scope; the existing shell test only proves event dispatch.

#### Agent I: backend/API gap audit

Start read-only. Only create a backend change task when the UI mapping proves a required field/action is absent from the live endpoint.

Audit targets:

- `dev/backend/src/employee_portal/service.py`
- `dev/backend/src/routes/routes_employee_portal.py`
- Existing workflow/storage services called by those routes

Rules:

- Prefer current payload fields and endpoints.
- No migration for a presentation-only gap.
- Any route change requires GitNexus API impact analysis and backend contract tests.
- Maintain authorization and validation on the server; UI changes never weaken them.

### Wave 4 - Independent QA and coordinator acceptance

#### Agent J: independent review

Review the combined diff for behavior regressions, permission leaks, fake/demo remnants, duplicated API clients, global CSS leakage, accessibility failures, and missing states. Report findings by severity with file/line references. This agent does not fix its own findings.

#### Agent K: test execution and browser QA

Run focused tests first, then the full gates:

```bash
cd dev/frontend
npm test
npm run build
npx oxlint src
```

Run backend tests only if Agent I changed backend behavior. Use the repository's Docker test database, never the shared Supabase instance.

Browser matrix:

- Desktop: 1440x900 and 1280x720.
- Mobile: 390x844 and 320x568.
- Light and dark theme.
- Authenticated employee with at least two real contracts/tasks.

Required end-to-end scenarios:

1. Open employee dashboard, claim/open an item, and select only accessible nodes.
2. K01-K04/K07 normal upload, preview, checklist completion, and submit.
3. Pending review, approved, rejected with reason, replacement upload, and resubmit.
4. Approved document cannot be replaced; API error remains visible and state stays correct.
5. Pause/resume and SURVEYOR rollback request.
6. Single-task block names the conflicting active task.
7. Help request and cancellation.
8. K05a/K05b configuration-driven slot behavior when included.
9. K06 unpaid gate, approved debt override, then K07 opening.
10. Double-click primary actions produces one business mutation and stable UI.
11. Notification deep-link opens the intended employee item when included.
12. Refresh preserves server state; no feature depends on localStorage demo data.

Coordinator acceptance requires screenshots, console/network inspection, no overlapping/clipped UI, focused tests green, full results reported with known baseline failures separated, build green, lint results recorded, and a complete GitNexus change report.

## File Collision Strategy

- Agent C owns the main composition file.
- Agent D owns chain/slot components.
- Agent E owns feature CSS after receiving the DOM contract.
- Agent F owns output checklist rendering.
- Agent G owns prior-document and real file interaction.
- Agent H owns action wiring helpers/dashboard propagation.
- Agent I owns backend only when an approved contract gap exists.
- Integration changes to another agent's owned file are sent back to that owner or performed by a dedicated integration agent after both branches are reviewed.

## Definition of Done

- The employee UI matches the approved information hierarchy from the prototype while looking native to bachkhoa-erp.
- All K01-K07 states in the approved scope render from live API data.
- Existing working workflow behavior and document storage/view/download paths remain intact.
- No prototype mock service, demo inspector, localStorage state, fake preview, Tailwind config, or direct checklist approval reaches production.
- Automated regression gates and real authenticated browser scenarios have been completed and their exact results reported.
- GitNexus impact checks exist for edited symbols and final change detection is complete and non-truncated.

## Decisions Needed Before Dispatching Wave 1

1. Confirm whether this redesign applies only to the node-detail screen opened from the current employee dashboard, or also replaces the employee dashboard/work queue itself.
2. Confirm whether K05a, K05b, and K06 must receive their final UI in this delivery, or only use the shared shell with their current `NodeBusinessSlot` content until separate layouts are approved.
3. Confirm the visual target: close reproduction of the prototype's blue/slate style adapted to ERP tokens, or preservation of the ERP orange brand as the dominant action/accent color.
