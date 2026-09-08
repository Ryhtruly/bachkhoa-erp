# Employee Workflow Artifact Logic Audit

Date: 2026-09-03  
Scope: standalone workflow artifact mirrored in `T:\New folder`, compared with the employee workflow surface in `bachkhoa-erp`.

## Scope and limitations

The Claude artifact URL could not be fetched from this runner, so the audit used the local artifact mirror in `T:\New folder` (same source tree previously supplied for the UI). The artifact is a demo that reads `public/data/process-data.json`; it is not connected to the ERP API by default. No application source files were changed during this audit; this file is the only audit deliverable.

## Verification performed

Browser interaction cases were exercised with Playwright against the artifact dev page; source-level cases were then checked against the corresponding service/component paths.

| ID | Test case | Result |
|---|---|---|
| TC-01 | Load the artifact and render the initial K01 node/checklist | PASS |
| TC-02 | Submit K01 while its rejected checklist item is unresolved | PASS: initial rejection is blocked |
| TC-03 | Open a child document (CAD) from a multi-document checklist item | **FAIL: modal shows the parent/first file instead** |
| TC-04 | Replace one of two rejected child documents with auto-resolve enabled, then submit | **FAIL: parent becomes valid and K01 advances while the second child remains rejected** |
| TC-05 | Add a document through the add-document modal | PASS locally; persistence is browser-local only |
| TC-06 | Submit a node containing `pending_signature`/`pending_review` items | **FAIL: validation checks only `rejected`** |
| TC-07 | Navigate K01 → K04 → K06 → K07 without submitting each node | **FAIL: `Stepper` is not rendered or wired** |
| TC-08 | Switch the inspector to Live REST and mutate a document/checklist | **FAIL: mutations still write only in-memory/localStorage state** |
| TC-09 | Replace a document with a stale/invalid `documentId` | **FAIL: first document is silently overwritten** |
| TC-10 | Submit an arbitrary non-active node | **FAIL: no active-node or predecessor guard** |
| TC-11 | Upload an attachment and reopen it after reload | **FAIL: only metadata is stored; bytes/object URL are discarded** |
| TC-12 | Run static checks | PASS: `npm.cmd run lint`; `npm.cmd run build` |

ERP regression baseline: `dev/frontend` `npm.cmd test -- --run` passed (`89` files, `604` tests). This confirms the existing frontend test suite is green; it does not cover the standalone artifact's localStorage/API behavior.

The browser checks above were run against the local artifact page. The current coordinator shell cannot resolve the Docker CLI, so ERP-container Playwright execution was not independently reproducible in this turn; this limitation is kept separate from the artifact findings.

## Findings

### F-01 — Critical: child-document preview resolves the wrong file

`src/App.tsx:60-79` passes both the selected child `doc` and its parent `checklistItem`. `src/components/DocumentPreviewModal.tsx:83-87` resolves `checklistItem.fileName` before `file.name`, so clicking `BanVe_MocRanh_CAD.dwg` opens the parent `SoDo_HT_v1.pdf` in the modal. The same identity loss makes replacement target the wrong document or the first matching document.

**Recommendation:** make the selected document the single source of truth for preview and replacement; pass its stable ID through the update path and reject an unknown ID instead of falling back.

### F-02 — Critical: one rejected child can bypass the rejection gate

`src/services/processService.ts:217-236` updates one selected/first rejected child, while `:238-265` changes the parent item to `valid` and clears its rejection based only on the parent status. With two rejected children, replacing one produced a “tất cả ... hợp lệ” state while the other child remained rejected; `submitNodeInspection` then advanced K01.

**Recommendation:** derive item validity from every child document and require every rejected child to be replaced/reviewed before clearing the node gate. Do not let a client checkbox grant review authority.

### F-03 — High: submission validation ignores pending and missing states

`src/services/processService.ts:412-418` blocks only checklist items whose parent status is exactly `rejected`. K04/K06/K07 data contains `pending_signature`/`pending_review` items; those states, missing files, and child-document rejection are not validated before advancing.

**Recommendation:** centralize a server-authoritative submission predicate covering missing required documents, rejected child links, pending signature/review, paused state, active-node identity, and predecessor completion.

### F-04 — High: workflow navigation is unreachable

`src/components/Stepper.tsx:1-101` exists, but `src/App.tsx:6-38` and `:136-240` never import/render it and never wire `switchNode`. Users can only reach later demo nodes by submitting the current node, so the full K1–K7 workflow cannot be inspected, resumed, or tested independently.

**Recommendation:** render the stepper and expose only permitted/available nodes; keep navigation authorization and state transitions in the backend.

### F-05 — High: Live REST mode is a read-only illusion

`src/services/apiClient.ts:12-16` defaults to `useLocalJson: true`. Although the client has generic POST/PATCH wrappers (`:91-149`), mutations in `src/services/processService.ts:94-448` directly mutate the cached object and call `saveToStorage`; they never call those wrappers. Selecting Live REST changes GET behavior only.

**Recommendation:** implement explicit API methods for each mutation, return/validate server state, and make the production default backend-backed. Keep local JSON behind a development-only flag.

### F-06 — High: preview presents fabricated content and verification

`src/components/DocumentPreviewModal.tsx:303-332` uses a stock Unsplash image when no image data exists; `:371-425` renders a hardcoded PDF/CAD/map illustration; `:447-451` always displays “Đã chứng thực SHA-256”. This can show content and integrity claims unrelated to the uploaded file.

**Recommendation:** render only bytes fetched from authenticated storage, show an explicit unavailable state when bytes are absent, and display checksum/signature data only when supplied and verified by the backend.

### F-07 — Medium: attachment upload discards file bytes

`src/components/FileUploadModal.tsx:28-36` and `src/services/processService.ts:332-355` retain only name, size, and extension. There is no `File`, blob, object key, or upload request. Reopening an attachment therefore cannot preview the uploaded content (`DocumentPreviewModal.tsx:225-233`).

**Recommendation:** upload a multipart file to object storage/API, persist the returned object key, and fetch it through an authenticated preview endpoint.

### F-08 — Medium: stale document IDs overwrite the first child

`src/services/processService.ts:222-227` maps a missing `documentId` to `targetIndex = 0`. A stale client or race can silently replace an unrelated document.

**Recommendation:** return a not-found/conflict error when an explicit document ID is absent; never select index zero as a fallback for an explicit ID.

### F-09 — Medium: arbitrary node submission bypasses workflow dependencies

`src/services/processService.ts:407-448` accepts any existing node ID and does not require it to equal `module.activeNodeId` or verify prior-step completion. A direct call for K04 while K01 is active can mutate step states inconsistently.

**Recommendation:** enforce active-node, status, predecessor, and role checks in the API/service boundary; treat the UI as advisory.

### F-10 — Medium: employees can author review status

`src/components/AddChecklistModal.tsx:21-24` and `:117-125` allow the caller to submit `valid`, `pending_signature`, or `rejected` directly into a new checklist item. Review status is therefore user-authored in the demo.

**Recommendation:** employee actions should create/upload evidence with a pending state; only the designated reviewer/director endpoint may set valid/rejected.

### F-11 — Low/Medium: localStorage is unsafe for image payloads

`src/services/processService.ts:459-466` serializes the entire process, including image data URLs, into one localStorage record. Quota failures are caught and logged, so the UI can report success while the state disappears after reload.

**Recommendation:** store files remotely and keep only IDs/metadata in client state; surface persistence failures to the user.

## ERP integration notes

The artifact's node set is K01/K04/K06/K07 and its data uses static remaining-time strings. The ERP employee workflow has a richer K01, K02, K03, K04, K05a, K05b, K06, K07 model with backend gates and permissions. The artifact should therefore be treated as a visual/interaction reference, not as an executable contract: unsupported demo endpoints or transitions must not be copied into the ERP without a backend contract and authorization rule.

## Exit criteria for a solid implementation

1. Preview and replace are keyed by stable document ID and target the exact selected child.
2. Node submission is denied until all required children are present, reviewed, and valid; pending/rejected/paused states are server-checked.
3. Every mutation has an authenticated API endpoint with durable object storage and an authoritative response.
4. K1–K7 transitions enforce active-node, predecessor, role, and permission rules.
5. Playwright covers happy path, rejection/rework, stale-ID conflict, reload persistence, unauthorized access, and mobile layout against the Docker runtime.
