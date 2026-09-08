# Current Contract DOCX Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Let users choose a local DOCX destination before contract creation, and view a freshly rendered current-contract DOCX inside the ERP without downloading it.

**Architecture:** The backend builds template data from the current Contract, Customer, ServiceLine, Receivable, and optional LeadPipeline rows whenever the protected document endpoint is requested. The browser claims a File System Access handle synchronously from the Save click, then creates the contract and writes its DOCX response to that handle. A React modal fetches the same DOCX with bearer authentication and renders it with docx-preview.

**Tech Stack:** FastAPI, SQLAlchemy, python-docx, React 19, Vite, Vitest, docx-preview, File System Access API.

## Global Constraints

- Do not persist new DOCX files in \`static/generated_docs\`, MinIO, or another server-side storage location.
- Do not generate or render PDF.
- Do not use \`ContractGeneratedDocument.render_data_snapshot\` to render an updated document.
- Only display current persisted values; use an empty string for missing email, due date, or sales source.
- Keep \`ContractGeneratedDocument\` as issuance metadata so existing rows remain compatible.
- Invoke GitNexus impact for every symbol before editing it; stop and warn if risk is HIGH or CRITICAL.
- Run backend integration tests only against an allowed disposable \`TEST_DATABASE_URL\`; do not connect tests to the app database.

---

## File Structure

- \`dev/backend/src/contracts/services.py\` — current-entity template mapping and issuance metadata.
- \`dev/backend/src/routes/routes_contracts.py\` — authorization and current DOCX response.
- \`dev/backend/tests/test_contract_document_renderer.py\` — database-free current-data renderer tests.
- \`dev/frontend/src/lib/fileSave.js\` — save-handle selection, later Blob write, protected DOCX fetch.
- \`dev/frontend/src/lib/fileSave.test.js\` — helper tests.
- \`dev/frontend/src/components/contracts/ContractDocumentViewer.jsx\` — focused modal DOCX renderer.
- \`dev/frontend/src/components/contracts/ContractDocumentViewer.test.jsx\` — viewer tests.
- \`dev/frontend/src/components/contracts/contracts.css\` — viewer styles.
- \`dev/frontend/src/pages/Contracts.jsx\` — picker-first creation and viewer wiring.
- \`dev/frontend/package.json\`, \`dev/frontend/package-lock.json\` — docx-preview dependency.

### Task 1: Build the current-data DOCX payload

**Files:**
- Modify: \`dev/backend/src/contracts/services.py:20-95,180-270\`
- Modify: \`dev/backend/src/routes/routes_contracts.py:1-65,1335-1352\`
- Test: \`dev/backend/tests/test_contract_document_renderer.py\`

**Interfaces:**
- Produces \`build_current_contract_document_data(db: Session, contract_id: str) -> tuple[dict, str]\`.
- Produces \`render_current_contract_document(db: Session, contract_id: str) -> Response\`.
- Consumes \`doc_generator.render_contract_document(data, "mau_hop_dong_v1")\` and current model rows.

- [ ] **Step 1: Run GitNexus impact analysis before edits**

Run: \`npx gitnexus impact "ContractService.generate_and_save_contract" --direction upstream --repo bachkhoa-erp\` and \`npx gitnexus impact "get_contract_document" --direction upstream --repo bachkhoa-erp\`.

Expected: record direct callers and affected contract creation/document flows. If either risk is HIGH or CRITICAL, report it and obtain confirmation before editing.

- [ ] **Step 2: Write failing tests for current values and blank unavailable data**

Replace snapshot-based route assertions with an in-memory fake query chain returning a Contract, Customer, ServiceLine, Receivable, and optional LeadPipeline. Verify the renderer receives current values and never consumes render_data_snapshot.

~~~python
def test_current_document_uses_persisted_entities_not_snapshot(self):
    rendered = {}
    routes_contracts.doc_generator.render_contract_document = lambda data, version: rendered.update(data) or b"PK-docx"
    response = routes_contracts.get_contract_document("2004/BK-2026", fake_db, None)
    self.assertEqual(response.body, b"PK-docx")
    self.assertEqual(rendered["customer_name"], "Tên đã sửa")
    self.assertEqual(rendered["customer_email"], "")
    self.assertEqual(rendered["due_date"], "")
~~~

- [ ] **Step 3: Run the direct unit test to verify RED**

Run: \`dev\\backend\\.venv\\Scripts\\python.exe dev\\backend\\tests\\test_contract_document_renderer.py\`

Expected: FAIL because the endpoint still queries ContractGeneratedDocument and passes its snapshot to the renderer.

- [ ] **Step 4: Implement the smallest current-data mapper and route renderer**

Add the mapper in services.py, normalizing dates and Decimal-like values to template-ready values. Query only records attached to the requested contract; choose a service line and receivable deterministically, and only use a lead linked by contract.lead_id. Missing records become empty strings.

~~~python
def build_current_contract_document_data(db: Session, contract_id: str) -> tuple[dict, str]:
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Không tìm thấy hợp đồng.")
    customer = db.query(Customer).filter(Customer.id == contract.customer_id).first()
    service_line = db.query(ServiceLine).filter(ServiceLine.contract_id == contract.id).first()
    receivable = db.query(Receivable).filter(Receivable.contract_id == contract.id).first()
    lead = db.query(LeadPipeline).filter(LeadPipeline.id == contract.lead_id).first() if contract.lead_id else None
    return {
        "contract_id": contract.id,
        "customer_name": getattr(customer, "full_name", "") or "",
        "customer_email": getattr(customer, "email", "") or "",
        "due_date": format_document_date(getattr(receivable, "due_date", None)),
        "sales_source": getattr(lead, "source", "") or "",
    }, contract_document_filename(contract.id, getattr(customer, "full_name", ""))
~~~

Change get_contract_document to call the current-data renderer. Keep a ContractGeneratedDocument metadata row in creation, but do not create or depend on a render snapshot. Return an inline DOCX response with the protected route unchanged.

- [ ] **Step 5: Run the direct unit test to verify GREEN**

Run: \`dev\\backend\\.venv\\Scripts\\python.exe dev\\backend\\tests\\test_contract_document_renderer.py\`

Expected: PASS with current data, blank unavailable values, inline DOCX media type, and no static/generated_docs directory creation.

- [ ] **Step 6: Commit**

~~~powershell
git add dev/backend/src/contracts/services.py dev/backend/src/routes/routes_contracts.py dev/backend/tests/test_contract_document_renderer.py
git commit -m "fix(contracts): render DOCX from current data"
~~~

### Task 2: Separate file selection from file writing

**Files:**
- Modify: \`dev/frontend/src/lib/fileSave.js\`
- Test: \`dev/frontend/src/lib/fileSave.test.js\`

**Interfaces:**
- Produces \`requestDocxSaveHandle(suggestedName)\`.
- Produces \`writeBlobToFileHandle(handle, blob)\`.
- Produces \`fetchProtectedDocumentBlob(documentUrl, accessToken)\`.
- Removes openProtectedDocument and saveFileWithUserLocation so no hidden download/new-tab path remains.

- [ ] **Step 1: Run GitNexus impact analysis before edits**

Run: \`npx gitnexus impact "saveFileWithUserLocation" --direction upstream --repo bachkhoa-erp\` and \`npx gitnexus impact "openProtectedDocument" --direction upstream --repo bachkhoa-erp\`.

Expected: record callers in Contracts.jsx; pause for confirmation if risk is HIGH or CRITICAL.

- [ ] **Step 2: Write failing helper tests**

~~~javascript
it('claims the picker before any later network work', async () => {
  window.showSaveFilePicker = vi.fn().mockResolvedValue(mockHandle);
  const result = await requestDocxSaveHandle('HopDong_2004.docx');
  expect(result).toEqual({ handle: mockHandle });
});

it('writes a later DOCX blob to the claimed handle', async () => {
  await writeBlobToFileHandle(mockHandle, blob);
  expect(mockWrite).toHaveBeenCalledWith(blob);
  expect(mockClose).toHaveBeenCalledOnce();
});
~~~

Also test picker cancellation, no-support failure, and authenticated Blob fetch.

- [ ] **Step 3: Run the focused test to verify RED**

Run: \`npm test -- src/lib/fileSave.test.js\`

Expected: FAIL because the three helpers do not exist and the old helper opens a browser tab.

- [ ] **Step 4: Implement helpers with no automatic-download fallback**

~~~javascript
export async function requestDocxSaveHandle(suggestedName) {
  if (typeof window?.showSaveFilePicker !== 'function') return { reason: 'SaveLocationUnsupported' };
  try {
    return { handle: await window.showSaveFilePicker({ suggestedName, types: DOCX_FILE_TYPES }) };
  } catch (error) {
    if (error.name === 'AbortError') return { cancelled: true };
    throw error;
  }
}

export async function writeBlobToFileHandle(handle, blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  return { success: true, method: 'picker' };
}
~~~

Implement fetchProtectedDocumentBlob with fetch, optional bearer authentication, parsed API error, and response.blob(). Do not call window.open, URL.createObjectURL, anchor click, or fallback download code.

- [ ] **Step 5: Run the focused test to verify GREEN**

Run: \`npm test -- src/lib/fileSave.test.js\`

Expected: PASS for cancellation, unsupported browser, later handle write, and authenticated Blob fetch.

- [ ] **Step 6: Commit**

~~~powershell
git add dev/frontend/src/lib/fileSave.js dev/frontend/src/lib/fileSave.test.js
git commit -m "fix(contracts): claim DOCX save location first"
~~~

### Task 3: Add the in-app DOCX viewer

**Files:**
- Create: \`dev/frontend/src/components/contracts/ContractDocumentViewer.jsx\`
- Create: \`dev/frontend/src/components/contracts/ContractDocumentViewer.test.jsx\`
- Modify: \`dev/frontend/src/components/contracts/contracts.css\`
- Modify: \`dev/frontend/package.json\`
- Modify: \`dev/frontend/package-lock.json\`

**Interfaces:**
- Consumes isOpen, documentUrl, accessToken, onClose, and fetchProtectedDocumentBlob.
- Produces a modal that calls renderAsync(blob, container) from docx-preview and clears its container when closed.

- [ ] **Step 1: Run GitNexus impact analysis before editing existing symbols**

Run: \`npx gitnexus impact "Contracts" --direction upstream --repo bachkhoa-erp\` and \`npx gitnexus impact "Modal" --direction upstream --repo bachkhoa-erp\`.

Expected: record routes/components affected by the page and modal. Report HIGH/CRITICAL results before continuing.

- [ ] **Step 2: Add docx-preview and write failing viewer tests**

Run in dev/frontend: \`npm install docx-preview\`.

Mock docx-preview and the Blob helper. Test loading, successful render, failure message, close, and removal of previous rendered DOM during cleanup.

~~~jsx
it('renders the protected DOCX inside a modal instead of opening a tab', async () => {
  fetchProtectedDocumentBlob.mockResolvedValue(new Blob(['docx']));
  render(<ContractDocumentViewer isOpen documentUrl="/api/contracts/2004/document" accessToken="token" onClose={vi.fn()} />);
  await waitFor(() => expect(renderAsync).toHaveBeenCalled());
  expect(window.open).not.toHaveBeenCalled();
});
~~~

- [ ] **Step 3: Run the viewer test to verify RED**

Run: \`npm test -- src/components/contracts/ContractDocumentViewer.test.jsx\`

Expected: FAIL because the viewer module and docx-preview integration do not exist.

- [ ] **Step 4: Implement accessible modal and scoped styles**

Reuse components/ui/Modal.jsx, keep a ref to the document surface, and render only after the authenticated Blob is fetched. Track cancellation on close so late responses do not update a closed modal. Clear container.innerHTML during cleanup.

~~~jsx
useEffect(() => {
  if (!isOpen || !documentUrl || !surfaceRef.current) return undefined;
  let active = true;
  setState('loading');
  fetchProtectedDocumentBlob(documentUrl, accessToken)
    .then((blob) => active && renderAsync(blob, surfaceRef.current, null, { inWrapper: true }))
    .then(() => active && setState('ready'))
    .catch((error) => active && setError(error.message));
  return () => { active = false; if (surfaceRef.current) surfaceRef.current.innerHTML = ''; };
}, [accessToken, documentUrl, isOpen]);
~~~

Style a scrollable .contract-document-viewer__surface with a light document background, readable page widths, loading/error states, and mobile-safe modal width. Do not add a download button or PDF path.

- [ ] **Step 5: Run viewer tests to verify GREEN**

Run: \`npm test -- src/components/contracts/ContractDocumentViewer.test.jsx\`

Expected: PASS; the viewer renders in a modal and never calls window.open.

- [ ] **Step 6: Commit**

~~~powershell
git add dev/frontend/package.json dev/frontend/package-lock.json dev/frontend/src/components/contracts/ContractDocumentViewer.jsx dev/frontend/src/components/contracts/ContractDocumentViewer.test.jsx dev/frontend/src/components/contracts/contracts.css
git commit -m "feat(contracts): preview DOCX in app"
~~~

### Task 4: Wire picker-first creation and document viewing into Contracts

**Files:**
- Modify: \`dev/frontend/src/pages/Contracts.jsx:1-230\`
- Test: \`dev/frontend/src/pages/Contracts.test.jsx\` (create if no page-level test exists)

**Interfaces:**
- Consumes requestDocxSaveHandle, writeBlobToFileHandle, fetchProtectedDocumentBlob, and ContractDocumentViewer.
- Produces handleGenerateContract that obtains a handle before POST and openContractDocument that opens component state, never a browser tab.

- [ ] **Step 1: Run GitNexus impact analysis before edits**

Run: \`npx gitnexus impact "handleGenerateContract" --direction upstream --repo bachkhoa-erp\` and \`npx gitnexus impact "openContractDocument" --direction upstream --repo bachkhoa-erp\`.

Expected: record click handlers and contract flows; notify the user before a HIGH/CRITICAL-risk edit.

- [ ] **Step 2: Write failing page-flow tests**

Mock the file helpers and API client. Test that cancellation/unsupported picker does not POST, picker completion precedes POST, successful POST fetches and writes DOCX, and “Mở tài liệu” only opens viewer state.

~~~jsx
it('does not create a contract when Save As is cancelled', async () => {
  requestDocxSaveHandle.mockResolvedValue({ cancelled: true });
  render(<Contracts />);
  await user.click(screen.getByRole('button', { name: /lưu hợp đồng/i }));
  expect(apiFetch).not.toHaveBeenCalledWith('/api/contracts/generate', expect.anything());
});
~~~

- [ ] **Step 3: Run the page-flow test to verify RED**

Run: \`npm test -- src/pages/Contracts.test.jsx\`

Expected: FAIL because the page currently POSTs before it opens the picker and viewing uses a new tab.

- [ ] **Step 4: Implement picker-first orchestration**

At the top of handleGenerateContract, build the safe filename and call requestDocxSaveHandle before setting saving state and before any API call. On cancellation/unsupported browser, toast and return. After creation, fetch the protected Blob, write it to the chosen handle, then refresh the list and close/reset the composer. If writing fails after a successful creation, keep the contract, refresh it, and show a retry-oriented error.

~~~jsx
const fileSelection = await requestDocxSaveHandle(suggestedFileName);
if (fileSelection.cancelled) return addToast('Đã hủy chọn nơi lưu; hợp đồng chưa được tạo.', 'info');
if (fileSelection.reason === 'SaveLocationUnsupported') return addToast('Trình duyệt không hỗ trợ chọn nơi lưu DOCX.', 'info');
const data = await apiFetch('/api/contracts/generate', postOptions);
const blob = await fetchProtectedDocumentBlob(data.download_url, getAccessToken());
await writeBlobToFileHandle(fileSelection.handle, blob);
~~~

Replace openContractDocument with state setters for the selected protected URL. Render one ContractDocumentViewer near the page root. Keep both “Mở tài liệu” entry points, but neither may download or open a tab.

- [ ] **Step 5: Run focused frontend tests to verify GREEN**

Run: \`npm test -- src/lib/fileSave.test.js src/components/contracts/ContractDocumentViewer.test.jsx src/pages/Contracts.test.jsx\`

Expected: PASS; page tests prove picker precedes POST and viewer state replaces document download.

- [ ] **Step 6: Commit**

~~~powershell
git add dev/frontend/src/pages/Contracts.jsx dev/frontend/src/pages/Contracts.test.jsx
git commit -m "fix(contracts): save and view DOCX correctly"
~~~

### Task 5: Verify integrated behavior and change scope

**Files:**
- Verify only; update code only if a check identifies a defect.

- [ ] **Step 1: Run targeted backend and frontend suites**

~~~powershell
dev\backend\.venv\Scripts\python.exe dev\backend\tests\test_contract_document_renderer.py
npm test -- src/lib/fileSave.test.js src/components/contracts/ContractDocumentViewer.test.jsx src/pages/Contracts.test.jsx
npm run build
~~~

Expected: all commands exit zero. If page-level tests are impractical because of an unrelated setup limitation, record it and retain passing helper/viewer tests.

- [ ] **Step 2: Run lint and distinguish pre-existing findings**

Run: \`npm run lint\`.

Expected: no new errors from changed files. Report pre-existing warnings separately rather than suppressing them.

- [ ] **Step 3: Inspect source/output constraints**

Run: \`rg -n "generated_docs|openProtectedDocument|window\\.open|createElement\\(['\\\"]a['\\\"]" dev/backend/src/contracts dev/backend/src/routes/routes_contracts.py dev/frontend/src\`.

Expected: contract generation has no server DOCX write, viewer has no window.open, and no automatic-download anchor is introduced.

- [ ] **Step 4: Run GitNexus change detection before final handoff**

Run: \`npx gitnexus detect_changes --scope compare --base_ref main --repo bachkhoa-erp\`.

Expected: only documented contract creation/render/view flows are affected. Investigate unexpected execution-flow changes.

- [ ] **Step 5: Report verification evidence and integration limitation**

Record command results, changed symbols, package addition, and whether a safe TEST_DATABASE_URL integration environment was available. Do not claim database integration coverage when it was not run.

