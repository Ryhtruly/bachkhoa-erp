# K06 Debt Gate, Shared Cabinet, and Review Deep Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make K06 debt approval lock only acceptance submission, render one canonical per-service-line cabinet everywhere, and route manager bell items to the exact checklist or debt review control.

**Architecture:** Keep the existing K06 debt request tables and `checklist_cabinet_by_node(service_line_id)` read model as the sources of truth. Add small focused frontend components for the employee debt request action, the manager debt review card, and the shared cabinet tree; existing screens compose these components instead of reconstructing business state. Notification payloads carry stable record IDs and the existing Contracts navigation event consumes those IDs to open and focus the correct review surface.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL/Supabase Storage, React 19, Vite, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-07-k06-cabinet-review-notifications-design.md`

## Global Constraints

- Work inline in this session; do not use subagents.
- Debt locks only K06 acceptance submission, never checklist type creation, upload, replacement, or removal.
- A debt approval applies only to its exact `task_node_id` and never changes the actual paid/remaining amounts.
- Cabinet scope is exactly one `service_line_id`; it never reads document-template applicability as runtime cabinet content.
- Cabinet hierarchy is `Node -> document type -> approved current files`; checklist names are not rendered.
- Document types with zero approved files remain visible.
- Manager review remains at document-type level, not per-file level.
- Upload success is shown only after storage and database transaction completion.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Limit the K06 debt gate to acceptance submission

**Files:**
- Modify: `dev/backend/tests/test_handover_override_gate_unittest.py`
- Modify: `dev/backend/src/employee_portal/service.py`
- Modify: `dev/backend/src/dossiers/handover.py`

**Interfaces:**
- Consumes: `handover.debt_summary(db, contract_id, total_value, task_node_id=...)`.
- Produces: `get_state(...)["can_edit_checklist"] == True` for assigned, editable K06 nodes regardless of debt; `submit_handover_for_acceptance(...)` remains the only debt-gated document workflow mutation.

- [ ] **Step 1: Replace the old upload-lock regression with failing tests**

```python
def test_document_submission_authorization_does_not_call_handover_debt_gate(self):
    employee = SimpleNamespace(id="EMP-1")
    with patch.object(
        EmployeePortalService,
        "_authorized_checklist_for_submission",
        return_value=object(),
    ), patch.object(handover, "ensure_handover_work_gate_open") as debt_gate:
        EmployeePortalService.authorize_checklist_evidence_submission(
            self.db,
            employee,
            "TN-K06",
            "CR-1",
            evidence_provided=True,
        )
    debt_gate.assert_not_called()

def test_k06_state_allows_checklist_edit_while_debt_still_blocks_acceptance(self):
    state = handover.get_state(self.db, "TN-K06", user_id="USER-NV")
    self.assertTrue(state["can_edit_checklist"])
    self.assertFalse(state["can_submit_acceptance"])
```

- [ ] **Step 2: Run the focused backend tests and confirm RED**

Run: `cd dev/backend && pytest -q tests/test_handover_override_gate_unittest.py`

Expected: the authorization test observes a call to `ensure_handover_work_gate_open`, and/or K06 state reports checklist editing disabled.

- [ ] **Step 3: Remove the debt-gate call from ordinary checklist document authorization**

```python
@staticmethod
def authorize_checklist_evidence_submission(...):
    EmployeePortalService._authorized_checklist_for_submission(
        db,
        employee,
        task_node_id,
        checklist_result_id,
        evidence_provided=evidence_provided,
    )
```

In `handover.get_state`, compute `can_edit_checklist` from assignment, editable node state, and submission state only. Keep the existing `debt["gate_open"]` condition in `can_submit_acceptance` and keep the server check inside `submit_handover_for_acceptance` unchanged.

- [ ] **Step 4: Run focused backend tests and confirm GREEN**

Run: `cd dev/backend && pytest -q tests/test_handover_override_gate_unittest.py tests/test_checklist_document_type_routes.py`

Expected: PASS; debt blocks submit but the same employee can create/upload/delete a K06 runtime document type.

- [ ] **Step 5: Commit this checkpoint**

```bash
git add dev/backend/src/employee_portal/service.py dev/backend/src/dossiers/handover.py dev/backend/tests/test_handover_override_gate_unittest.py
git commit -m "fix: limit K06 debt gate to acceptance"
```

### Task 2: Add focused K06 employee and manager debt controls

**Files:**
- Create: `dev/frontend/src/features/handover/DebtRequestAction.jsx`
- Create: `dev/frontend/src/features/handover/DebtRequestAction.test.jsx`
- Create: `dev/frontend/src/features/handover/DebtReviewCard.jsx`
- Create: `dev/frontend/src/features/handover/DebtReviewCard.test.jsx`
- Modify: `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx`
- Modify: `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx`
- Modify: `dev/frontend/src/features/employee-portal/NodeBusinessSlot.jsx`
- Modify: `dev/frontend/src/features/handover/HandoverPanel.jsx`
- Modify: `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`
- Modify: `dev/frontend/src/features/employee-portal/employeeWorkspace.css`
- Modify: `dev/frontend/src/features/handover/handover.css`
- Modify: `dev/frontend/src/components/contracts/contracts.css`

**Interfaces:**
- Produces: `<DebtRequestAction taskNodeId state onChanged />` and `<DebtReviewCard taskNodeId targetRequestId focusNonce onChanged />`.
- Consumes: `GET /api/handover/{taskNodeId}`, `POST /api/handover/{taskNodeId}/debt-requests`, `POST /api/handover/debt-requests/{requestId}/review`, and `POST /api/handover/{taskNodeId}/submit-acceptance`.

- [ ] **Step 1: Add failing employee UI tests**

```jsx
it('K06 keeps upload controls enabled but locks only acceptance while debt is unpaid', async () => {
  renderWorkspace({ node_code: 'K06', debt: { gate_open: false }, can_submit_acceptance: false })
  expect(await screen.findByRole('button', { name: /tải file/i })).toBeEnabled()
  expect(screen.getByRole('button', { name: /xin duyệt nợ/i })).toBeEnabled()
  expect(screen.getByRole('button', { name: /nộp nghiệm thu/i })).toBeDisabled()
})

it('puts help and debt request on the left and acceptance on the right', async () => {
  renderWorkspace({ node_code: 'K06' })
  const footer = await screen.findByTestId('node-action-footer')
  expect(within(footer).getByTestId('node-support-actions')).toContainElement(
    screen.getByRole('button', { name: /xin duyệt nợ/i }),
  )
  expect(within(footer).getByTestId('node-primary-action')).toContainElement(
    screen.getByRole('button', { name: /nộp nghiệm thu/i }),
  )
})
```

- [ ] **Step 2: Add failing director placement/focus tests**

```jsx
it('renders pending debt review between money progress and personnel', async () => {
  renderDesigner({ selectedCode: 'K06', pendingDebtRequest: REQUEST })
  const panel = await screen.findByTestId('wf-node-fixed')
  const children = [...panel.children]
  expect(children.indexOf(screen.getByLabelText(/tiến độ thu tiền/i))).toBeLessThan(
    children.indexOf(screen.getByTestId('debt-review-card')),
  )
  expect(children.indexOf(screen.getByTestId('debt-review-card'))).toBeLessThan(
    children.indexOf(screen.getByText('Nhân sự').closest('.wf-node-grid')),
  )
})

it('focuses the exact debt request selected from a notification', async () => {
  renderDesigner({ targetType: 'debt_review', targetId: 'REQ-1', targetNonce: 7 })
  expect(await screen.findByTestId('debt-review-card')).toHaveFocus()
})
```

- [ ] **Step 3: Run focused frontend tests and confirm RED**

Run: `cd dev/frontend && npm test -- --run src/features/employee-portal/EmployeeItemWorkspace.test.jsx src/features/handover/DebtRequestAction.test.jsx src/features/handover/DebtReviewCard.test.jsx src/components/contracts/ContractWorkflowDesigner.test.jsx`

Expected: FAIL because the focused components, K06 submit action, and target-ID focus contract do not exist.

- [ ] **Step 4: Implement the employee debt request action and K06 submit action**

`DebtRequestAction` loads or receives handover state, uses a required reason plus the existing promised-date/commitment metadata, prevents a duplicate pending request, and renders `Xin duyệt nợ`, `Chờ duyệt nợ`, or no request button when the debt gate is already open. `NodeActionBar` handles K06 by posting `/submit-acceptance`; its disabled state is `busy || !task.can_submit_acceptance || hardChecklistBlocker`, not `!can_edit_checklist`.

The footer structure is:

```jsx
<footer data-testid="node-action-footer" className="eiw-actions">
  <div data-testid="node-support-actions" className="eiw-actions__support">
    <HelpAction />
    {isK06 && <DebtRequestAction taskNodeId={task.id} state={handoverState} />}
  </div>
  <div data-testid="node-primary-action" className="eiw-actions__primary">
    <NodeActionBar task={task} gate={effectiveGate} handoverState={handoverState} />
  </div>
</footer>
```

Remove the duplicate employee checklist/debt action surface from `HandoverPanel`; `NodeBusinessSlot` keeps only the compact debt progress/state needed in the main workspace.

- [ ] **Step 5: Implement the inline manager debt review card**

Render `DebtReviewCard` immediately after `.wf-node-money` and before `.wf-node-grid`. It displays the pending request details and calls the existing review endpoint with `{ decision: 'approved' }` or `{ decision: 'rejected', reason }`; rejecting cannot submit without a reason. Give the card `tabIndex={-1}`, `data-request-id`, and focus it when `targetType === 'debt_review' && targetId === request.id`.

- [ ] **Step 6: Run focused frontend tests and confirm GREEN**

Run: `cd dev/frontend && npm test -- --run src/features/employee-portal/EmployeeItemWorkspace.test.jsx src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx src/features/handover/DebtRequestAction.test.jsx src/features/handover/DebtReviewCard.test.jsx src/features/handover/HandoverPanel.test.jsx src/components/contracts/ContractWorkflowDesigner.test.jsx`

Expected: PASS.

- [ ] **Step 7: Commit this checkpoint**

```bash
git add dev/frontend/src/features/handover dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx dev/frontend/src/features/employee-portal/NodeBusinessSlot.jsx dev/frontend/src/features/employee-portal/employeeWorkspace.css dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx dev/frontend/src/components/contracts/contracts.css
git commit -m "feat: add focused K06 debt review flow"
```

### Task 3: Consolidate every cabinet onto one read-only tree

**Files:**
- Create: `dev/frontend/src/features/document-cabinet/ChecklistCabinetTree.jsx`
- Create: `dev/frontend/src/features/document-cabinet/ChecklistCabinetTree.test.jsx`
- Create: `dev/frontend/src/features/document-cabinet/useChecklistCabinet.js`
- Modify: `dev/frontend/src/features/employee-portal/NodeDocumentCabinet.jsx`
- Modify: `dev/frontend/src/features/employee-portal/PriorDocumentsDrawer.jsx`
- Modify: `dev/frontend/src/features/contracts/DocumentCabinet.jsx`
- Modify: `dev/frontend/src/pages/Tasks.jsx`
- Modify: `dev/frontend/src/pages/LegalSubmissions.jsx`
- Modify: `dev/frontend/src/pages/Tasks.test.jsx`
- Modify: `dev/frontend/src/features/contracts/documentCabinet.css`
- Modify: `dev/frontend/src/features/employee-portal/employeeWorkspace.css`
- Modify: `dev/backend/tests/test_dossier_documents_unittest.py`
- Modify: `dev/backend/src/dossiers/register.py` only if tests expose read-model drift.

**Interfaces:**
- Produces: `useChecklistCabinet({contractId, serviceLineId}) -> {groups, loading, error, reload}` and `<ChecklistCabinetTree groups currentNodeCode onOpenFile />`.
- Consumes: `GET /api/document-register/register?contract_id=...&service_line_id=...` field `checklist_cabinet_by_node`.

- [ ] **Step 1: Add/strengthen backend read-model tests**

```python
def test_cabinet_is_scoped_to_one_service_line_and_keeps_empty_runtime_types(self):
    groups = register.checklist_cabinet_by_node(db, "SL-SURVEY")
    self.assertEqual([g["node_code"] for g in groups], ["K01", "K06"])
    self.assertEqual(groups[0]["documents"][0]["files"], [])
    self.assertEqual(groups[0]["documents"][0]["file_count"], 0)
    self.assertEqual(
        [f["id"] for f in groups[1]["documents"][0]["files"]],
        ["DOC-CURRENT-APPROVED"],
    )
    self.assertNotIn("DOC-OTHER-SERVICE-LINE", str(groups))
```

- [ ] **Step 2: Add failing shared-tree tests**

```jsx
it('renders Node then document type then only approved files without checklist headings', () => {
  render(<ChecklistCabinetTree groups={CABINET} onOpenFile={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /K01.*1\/2/i }))
  expect(screen.getByText('CCCD/CMND của người sử dụng đất')).toBeInTheDocument()
  expect(screen.getByText('Giấy xác nhận cư trú')).toBeInTheDocument()
  expect(screen.queryByText('Tiếp nhận hồ sơ & giấy tờ từ khách')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /CCCD.*1 file/i }))
  expect(screen.getByRole('button', { name: 'mat-truoc.jpg' })).toBeInTheDocument()
})

it('keeps a zero-file document type compact', () => {
  render(<ChecklistCabinetTree groups={CABINET} />)
  expect(screen.getByRole('button', { name: /Giấy xác nhận cư trú.*0 file/i })).toBeInTheDocument()
  expect(screen.queryByText(/chưa có tệp cho loại giấy này/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 3: Add failing integration tests for all four cabinet locations**

Assert that employee drawer, contracts-list sidebar, contract detail `Hồ sơ đo vẽ`, and contract detail `Hồ sơ pháp lý` each call the register endpoint with the selected service-line ID and render `ChecklistCabinetTree`. For detail tabs, use fixtures with one survey and one legal service line and assert each tab excludes the other line's documents.

- [ ] **Step 4: Run cabinet tests and confirm RED**

Run: `cd dev/frontend && npm test -- --run src/features/document-cabinet/ChecklistCabinetTree.test.jsx src/features/employee-portal/NodeDocumentCabinet.test.jsx src/features/employee-portal/PriorDocumentsDrawer.test.jsx src/features/contracts/DocumentCabinet.test.jsx src/pages/Tasks.test.jsx`

Expected: FAIL because the shared tree does not exist and legacy/raw document panels are still rendered.

- [ ] **Step 5: Implement the hook and shared cabinet tree**

The hook must reject a missing service line instead of falling back to contract-wide data. The tree uses stable keys (`task_node_id`, `checklist_result_id`, `template_id`, file `id`), an accordion per Node, a second accordion per document type, and passes the selected file—not the whole type—to `onOpenFile(file)`.

- [ ] **Step 6: Replace legacy cabinet bodies in all four locations**

`PriorDocumentsDrawer` renders only the shared cabinet and removes `Tệp đã nộp ở các bước trước`. `DocumentCabinet` removes raw/original tabs, waiver buttons, source grouping, linking and upload actions in cabinet context. The actual visual and legal detail screens are `Tasks.jsx` and `LegalSubmissions.jsx`; each passes exactly its selected service line to the shared cabinet rather than combining response arrays.

- [ ] **Step 7: Run backend and frontend cabinet tests and confirm GREEN**

Run: `cd dev/backend && pytest -q tests/test_dossier_documents_unittest.py`

Run: `cd dev/frontend && npm test -- --run src/features/document-cabinet/ChecklistCabinetTree.test.jsx src/features/employee-portal/NodeDocumentCabinet.test.jsx src/features/employee-portal/PriorDocumentsDrawer.test.jsx src/features/contracts/DocumentCabinet.test.jsx src/pages/Contracts.test.jsx src/pages/Tasks.test.jsx`

Expected: PASS with no template-derived or cross-service-line cabinet rows.

- [ ] **Step 8: Commit this checkpoint**

```bash
git add dev/backend/src/dossiers/register.py dev/backend/tests/test_dossier_documents_unittest.py dev/frontend/src/features/document-cabinet dev/frontend/src/features/employee-portal/NodeDocumentCabinet.jsx dev/frontend/src/features/employee-portal/PriorDocumentsDrawer.jsx dev/frontend/src/features/contracts/DocumentCabinet.jsx dev/frontend/src/features/contracts/documentCabinet.css dev/frontend/src/features/employee-portal/employeeWorkspace.css dev/frontend/src/pages/Tasks.jsx dev/frontend/src/pages/LegalSubmissions.jsx dev/frontend/src/pages/Tasks.test.jsx
git commit -m "feat: unify contract document cabinets"
```

### Task 4: Add stable notification targets and exact review focus

**Files:**
- Modify: `dev/backend/src/routes/routes_notifications.py`
- Create: `dev/backend/tests/test_notification_review_targets_unittest.py`
- Modify: `dev/frontend/src/App.jsx`
- Modify: `dev/frontend/src/App.sidebar.test.jsx`
- Modify: `dev/frontend/src/pages/Contracts.jsx`
- Create: `dev/frontend/src/pages/Contracts.notification-navigation.test.jsx`
- Modify: `dev/frontend/src/components/contracts/ContractWorkspace.jsx`
- Modify: `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`
- Modify: `dev/frontend/src/components/contracts/ContractWorkflowDesigner.test.jsx`

**Interfaces:**
- Produces manager notification items with `{type, contract_id, service_line_id, task_node_id, node_key, target_type, target_id}`.
- Consumes browser event detail `{contractId, serviceLineId, taskNodeId, nodeKey, targetType, targetId, nonce}`.

- [ ] **Step 1: Add failing backend notification tests**

```python
def test_manager_checklist_notification_contains_stable_target(self):
    item = next(i for i in summary["items"] if i["type"] == "checklist_review")
    self.assertEqual(item["target_type"], "checklist_review")
    self.assertEqual(item["target_id"], self.checklist_result_id)
    self.assertEqual(item["task_node_id"], self.task_node_id)

def test_pending_debt_request_is_a_manager_notification_and_disappears_after_review(self):
    item = next(i for i in pending_summary["items"] if i["type"] == "debt_review")
    self.assertEqual(item["target_id"], self.debt_request_id)
    self.assertFalse(any(i.get("target_id") == self.debt_request_id for i in reviewed_summary["items"]))
```

- [ ] **Step 2: Run notification backend tests and confirm RED**

Run: `cd dev/backend && pytest -q tests/test_notification_feed.py tests/test_review_batch_notification.py`

Expected: checklist item lacks `target_id`, and no pending debt-review item exists.

- [ ] **Step 3: Implement manager pending-debt query and target fields**

Add a query joining `handover_debt_requests -> task_nodes -> workflow_instances -> service_lines -> contracts`, filtered to `status = 'pending'`. Checklist notifications set `target_id = ref_id`; debt notifications set `target_id = request_id`. Both set explicit `target_type`. Because queries only return pending work, handled items naturally leave the bell; invalidate notification cache in debt create/review operations.

- [ ] **Step 4: Add failing frontend navigation tests**

```jsx
it('passes stable debt-review target through bell navigation', async () => {
  await clickNotification({ target_type: 'debt_review', target_id: 'REQ-1' })
  expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
    detail: expect.objectContaining({ targetType: 'debt_review', targetId: 'REQ-1' }),
  }))
})

it('opens review dropup and focuses the exact checklist result', async () => {
  renderDesigner({ targetType: 'checklist_review', targetId: 'CR-2', targetNonce: 8 })
  expect(await screen.findByTestId('review-item-CR-2')).toHaveFocus()
  expect(screen.getByLabelText('Thông báo chờ duyệt')).toHaveClass('is-open')
})
```

- [ ] **Step 5: Thread `targetId` and `taskNodeId` through App, workspace, and designer**

`handleNotificationNavigate` copies stable IDs directly. `ContractWorkspace` consumes a navigation nonce once, selects the service line, and passes all target fields to `ContractWorkflowDesigner`. The designer selects the node by `taskNodeId` first (falling back to `nodeKey` only for old notifications), opens the pending-review dropup for checklist targets, focuses `[data-review-id=targetId]`, or focuses `DebtReviewCard` for debt targets.

- [ ] **Step 6: Run notification tests and confirm GREEN**

Run: `cd dev/backend && pytest -q tests/test_notification_feed.py tests/test_review_batch_notification.py tests/test_handover_override_gate_unittest.py`

Run: `cd dev/frontend && npm test -- --run src/App.sidebar.test.jsx src/pages/Contracts.notification-navigation.test.jsx src/components/contracts/ContractWorkflowDesigner.test.jsx`

Expected: PASS and handled pending work is absent from the next summary response.

- [ ] **Step 7: Commit this checkpoint**

```bash
git add dev/backend/src/routes/routes_notifications.py dev/backend/tests/test_notification_review_targets_unittest.py dev/frontend/src/App.jsx dev/frontend/src/App.sidebar.test.jsx dev/frontend/src/pages/Contracts.jsx dev/frontend/src/pages/Contracts.notification-navigation.test.jsx dev/frontend/src/components/contracts/ContractWorkspace.jsx dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx dev/frontend/src/components/contracts/ContractWorkflowDesigner.test.jsx
git commit -m "feat: deep link review notifications"
```

### Task 5: Remove redundant upload refreshes and verify the complete flow

**Files:**
- Modify: `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx`
- Modify: `dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.test.jsx`
- Modify: `dev/frontend/src/features/employee-portal/NodeOutputList.jsx` if its upload callback still triggers an additional parent reload.
- Modify: `dev/frontend/src/features/employee-portal/NodeOutputList.test.jsx`

**Interfaces:**
- Produces: one multipart request per selected batch, local per-type busy state, and one scoped post-success refresh.
- Consumes: current runtime document-type upload response and `refreshGate()`.

- [ ] **Step 1: Add failing request-count and timing tests**

```jsx
it('uploads a multi-file selection in one request and refreshes once after success', async () => {
  const pending = deferredResponse()
  apiFetch.mockImplementationOnce(() => pending.promise)
  const onRefresh = vi.fn()
  renderWorkspace({ onRefresh })
  uploadFiles([file('a.jpg'), file('b.pdf')])
  expect(apiFetch).toHaveBeenCalledTimes(1)
  expect(onRefresh).not.toHaveBeenCalled()
  pending.resolve({ data: { document_type: UPDATED_TYPE } })
  await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
  expect(apiFetch.mock.calls.filter(([url]) => String(url).includes('/shortage'))).toHaveLength(1)
})

it('shows progress only on the selected type and never reports success on storage failure', async () => {
  renderWorkspace()
  uploadFiles([file('broken.jpg')])
  expect(screen.getByTestId('type-DT-1')).toHaveAttribute('aria-busy', 'true')
  rejectUpload({ status: 500, message: 'Không lưu được broken.jpg' })
  expect(await screen.findByRole('alert')).toHaveTextContent('broken.jpg')
  expect(screen.queryByText(/tải lên thành công/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run upload tests and confirm RED**

Run: `cd dev/frontend && npm test -- --run src/features/employee-portal/EmployeeItemWorkspace.test.jsx src/features/employee-portal/NodeOutputList.test.jsx`

Expected: request/refresh count or local progress assertions fail.

- [ ] **Step 3: Implement one scoped revalidation path**

Keep all selected files in one `FormData`. Track `uploadingTypeId` instead of a workspace-global busy flag. On success, merge `response.data.document_type` into the active checklist when present; otherwise call exactly one parent refresh. Await exactly one `refreshGate()` after that update. Remove any second refresh triggered by `NodeOutputList` or nested callbacks. Preserve server error detail containing the failing filename.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `cd dev/frontend && npm test -- --run src/features/employee-portal/EmployeeItemWorkspace.test.jsx src/features/employee-portal/NodeOutputList.test.jsx`

Expected: PASS; success happens after response, with one upload and one scoped refresh.

- [ ] **Step 5: Run the complete regression suite for touched areas**

Run: `cd dev/backend && pytest -q tests/test_handover_override_gate_unittest.py tests/test_checklist_document_type_routes.py tests/test_checklist_document_types_unittest.py tests/test_dossier_documents_unittest.py tests/test_notification_feed.py tests/test_review_batch_notification.py tests/test_nop_nghiem_thu_thieu_tai_lieu.py`

Run: `cd dev/frontend && npm test -- --run src/features/employee-portal/EmployeeItemWorkspace.test.jsx src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx src/features/employee-portal/NodeOutputList.test.jsx src/features/employee-portal/NodeDocumentCabinet.test.jsx src/features/employee-portal/PriorDocumentsDrawer.test.jsx src/features/handover/HandoverPanel.test.jsx src/features/handover/DebtRequestAction.test.jsx src/features/handover/DebtReviewCard.test.jsx src/features/document-cabinet/ChecklistCabinetTree.test.jsx src/features/contracts/DocumentCabinet.test.jsx src/components/NotificationBell.test.jsx src/components/contracts/ContractWorkspace.test.jsx src/components/contracts/ContractWorkflowDesigner.test.jsx src/components/contracts/NodeChecklistCard.test.jsx src/pages/Contracts.test.jsx`

Run: `cd dev/frontend && npm run build`

Expected: all tests PASS and Vite build exits 0.

- [ ] **Step 6: Inspect the final change graph and working-tree diff**

Run GitNexus/codebase-memory change detection against `main` when available. Then run `git diff --check` and inspect `git diff --stat` so only intended K06, cabinet, notification, upload, tests, styles, and plan files are included.

- [ ] **Step 7: Commit the upload/performance checkpoint**

```bash
git add dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.jsx dev/frontend/src/features/employee-portal/EmployeeItemWorkspace.test.jsx dev/frontend/src/features/employee-portal/NodeOutputList.jsx dev/frontend/src/features/employee-portal/NodeOutputList.test.jsx
git commit -m "perf: avoid duplicate checklist upload refreshes"
```
