# Contract document in-memory generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and reopen immutable-at-issue Word contract documents without storing generated DOCX files in the repository or MinIO.

**Architecture:** A new in-memory renderer produces DOCX bytes from a versioned template and immutable render-data snapshot. Creating a contract persists a `ContractGeneratedDocument` snapshot and a protected document endpoint URL; viewing or locally saving calls that endpoint, which regenerates bytes from the snapshot.

**Tech Stack:** FastAPI, SQLAlchemy, python-docx, React 19, Vitest.

## Global Constraints

- New contract DOCX files must never be written to `dev/backend/static/generated_docs` or MinIO.
- Historical static `file_link` values remain readable and are not migrated or deleted.
- A snapshot contains the entire render payload, filename, and immutable template version.
- Rendering endpoint requires `contract:read`.
- Chrome/Edge use `window.showSaveFilePicker`; unsupported browsers must not trigger automatic download.
- Backend tests require an explicitly configured disposable `TEST_DATABASE_URL`.

---

## File structure

- `dev/backend/src/core/doc_generator.py`: add the in-memory contract renderer while retaining the legacy filesystem generator used by quotations.
- `dev/backend/src/contracts/services.py`: persist immutable snapshot and endpoint URL when issuing a contract.
- `dev/backend/src/routes/routes_contracts.py`: protected in-memory document endpoint.
- `dev/backend/tests/test_contract_documents.py`: document-specific backend regression tests.
- `dev/frontend/src/lib/fileSave.js` and `fileSave.test.js`: explicit-location-only save behavior and test.
- `dev/frontend/src/pages/Contracts.jsx`: obtain new document Blob from its protected endpoint and display save outcome.

### Task 1: Render contract DOCX in memory

**Files:**
- Modify: `dev/backend/src/core/doc_generator.py`
- Create: `dev/backend/tests/test_contract_documents.py`

**Interfaces:**
- Produces: `contract_template_filename(template_version: str) -> str`
- Produces: `render_contract_document(data: dict, template_version: str) -> bytes`
- Template registry: `mau_hop_dong_v1 -> mau_hop_dong.docx`.

- [ ] **Step 1: Write the failing test**

```python
def test_render_contract_document_returns_docx_bytes_without_creating_output_directory(tmp_path, monkeypatch):
    monkeypatch.setattr(doc_generator, "BACKEND_DIR", str(tmp_path))
    template_dir = tmp_path / "src" / "templates"
    template_dir.mkdir(parents=True)
    create_template(template_dir / "mau_hop_dong.docx")

    output = doc_generator.render_contract_document(
        {"contract_id": "2004/BK-2026", "customer_name": "Lê Thị Kiểm Thử"},
        "mau_hop_dong_v1",
    )

    assert output.startswith(b"PK")
    assert not (tmp_path / "static" / "generated_docs").exists()
```

- [ ] **Step 2: Run it to verify RED**

From `dev/backend` with a disposable database URL:

```powershell
$env:TEST_DATABASE_URL='sqlite:///./contract_documents_test.db'; pytest tests/test_contract_documents.py::test_render_contract_document_returns_docx_bytes_without_creating_output_directory -q
```

Expected: FAIL because `render_contract_document` does not exist.

- [ ] **Step 3: Write minimal implementation**

```python
CONTRACT_TEMPLATE_VERSIONS = {"mau_hop_dong_v1": "mau_hop_dong.docx"}

def contract_template_filename(template_version: str) -> str:
    return CONTRACT_TEMPLATE_VERSIONS[template_version]

def render_contract_document(data: dict, template_version: str) -> bytes:
    doc = Document(os.path.join(BACKEND_DIR, "src", "templates", contract_template_filename(template_version)))
    _replace_document_placeholders(doc, data)
    output = io.BytesIO()
    doc.save(output)
    return output.getvalue()
```

Extract the existing paragraph/table replacement loop into `_replace_document_placeholders`. Keep `generate_document` for quotations unchanged.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS and no output directory exists.

- [ ] **Step 5: Commit**

```powershell
git add dev/backend/src/core/doc_generator.py dev/backend/tests/test_contract_documents.py
git commit -m "feat(contracts): render documents in memory"
```

### Task 2: Persist the issued snapshot

**Files:**
- Modify: `dev/backend/src/contracts/services.py`
- Modify: `dev/backend/tests/test_contract_documents.py`

**Interfaces:**
- Produces: `ContractGeneratedDocument(status="generated", render_data_snapshot=...)`.
- Produces: a new contract `file_link` of `/api/contracts/{contract_id}/document`.
- Consumes: the current transaction and `ContractGeneratedDocument` ORM model; it must not invoke legacy `generate_document`.

- [ ] **Step 1: Write the failing test**

```python
def test_generate_contract_persists_snapshot_and_document_route(db, monkeypatch):
    monkeypatch.setattr(
        "src.contracts.services.doc_generator.generate_document",
        lambda *_args, **_kwargs: pytest.fail("legacy disk generator called"),
    )

    result = ContractService.generate_and_save_contract(db, build_payload(), actor_id=None)

    contract = db.get(Contract, result["id"])
    document = db.query(ContractGeneratedDocument).filter_by(contract_id=contract.id).one()
    assert contract.file_link == f"/api/contracts/{contract.id}/document"
    assert document.status == "generated"
    assert document.render_data_snapshot["customer_name"] == "Lê Thị Kiểm Thử"
    assert document.render_data_snapshot["_template_version"] == "mau_hop_dong_v1"
```

- [ ] **Step 2: Run it to verify RED**

```powershell
$env:TEST_DATABASE_URL='sqlite:///./contract_documents_test.db'; pytest tests/test_contract_documents.py::test_generate_contract_persists_snapshot_and_document_route -q
```

Expected: FAIL because no snapshot exists and the legacy writer is called.

- [ ] **Step 3: Write minimal implementation**

Build a snapshot from `payload.model_dump()` after resolving `contract_id`; add `_template_version: "mau_hop_dong_v1"`; create the contract and a `ContractGeneratedDocument` in the same transaction. Store a sanitized `HopDong_<id>_<customer>.docx` in `output_file_name`, set `generated_by`, `generated_at`, `status="generated"`, and store the protected route in both link fields.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS and no legacy generator call.

- [ ] **Step 5: Commit**

```powershell
git add dev/backend/src/contracts/services.py dev/backend/tests/test_contract_documents.py
git commit -m "feat(contracts): snapshot issued document data"
```

### Task 3: Serve snapshot documents with contract-read permission

**Files:**
- Modify: `dev/backend/src/routes/routes_contracts.py`
- Modify: `dev/backend/tests/test_contract_documents.py`

**Interfaces:**
- Produces: `GET /api/contracts/{contract_id:path}/document`.
- Consumes: `require_permission("contract", "read")`, latest generated snapshot, and `render_contract_document`.
- Returns: DOCX media type plus stored filename in `Content-Disposition: inline`.

- [ ] **Step 1: Write the failing tests**

```python
def test_document_endpoint_renders_snapshot_for_reader(client, admin_headers, db, monkeypatch):
    contract, document = create_snapshot_contract(db)
    monkeypatch.setattr("src.routes.routes_contracts.render_contract_document", lambda data, version: b"PK-docx")

    response = client.get(f"/api/contracts/{contract.id}/document", headers=admin_headers)

    assert response.status_code == 200
    assert response.content == b"PK-docx"
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert document.output_file_name in response.headers["content-disposition"]

def test_document_endpoint_requires_contract_read_permission(client, unprivileged_user, db):
    contract, _ = create_snapshot_contract(db)
    _, headers = unprivileged_user
    assert client.get(f"/api/contracts/{contract.id}/document", headers=headers).status_code == 403
```

- [ ] **Step 2: Run tests to verify RED**

```powershell
$env:TEST_DATABASE_URL='sqlite:///./contract_documents_test.db'; pytest tests/test_contract_documents.py -q
```

Expected: FAIL with 404 because the route does not exist.

- [ ] **Step 3: Write minimal implementation**

Add the route before generic path endpoints. Query the latest `status="generated"` document, return 404 if absent, copy the snapshot and remove `_template_version`, render bytes, then return a FastAPI `Response` with safe filename quoting and inline DOCX headers.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS for reader access and 403 without permission.

- [ ] **Step 5: Commit**

```powershell
git add dev/backend/src/routes/routes_contracts.py dev/backend/tests/test_contract_documents.py
git commit -m "feat(contracts): serve issued document snapshots"
```

### Task 4: Require user-selected local save location

**Files:**
- Modify: `dev/frontend/src/lib/fileSave.js`
- Modify: `dev/frontend/src/lib/fileSave.test.js`
- Modify: `dev/frontend/src/pages/Contracts.jsx`

**Interfaces:**
- Produces: `{ success: false, reason: "SaveLocationUnsupported" }` when picker is unavailable.
- Preserves: `{ success: false, cancelled: true }` when user cancels.
- Consumes: the protected route returned by contract generation.

- [ ] **Step 1: Write the failing test**

```javascript
it('does not download automatically when location picker is unavailable', async () => {
  delete window.showSaveFilePicker;
  const createElement = vi.spyOn(document, 'createElement');

  const result = await saveFileWithUserLocation(new Blob(['test']), 'HopDong.docx');

  expect(result).toEqual({ success: false, reason: 'SaveLocationUnsupported' });
  expect(createElement).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it to verify RED**

From `dev/frontend`:

```powershell
npm test -- src/lib/fileSave.test.js
```

Expected: FAIL because current code creates and clicks an automatic download link.

- [ ] **Step 3: Write minimal implementation**

Remove the automatic `<a download>` fallback. In `handleGenerateContract`, fetch the protected document route as a Blob after successful creation, call `saveFileWithUserLocation`, show Chrome/Edge guidance for `SaveLocationUnsupported`, and treat cancellation as non-error. Keep `window.open` out of this save path.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: all file-save tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add dev/frontend/src/lib/fileSave.js dev/frontend/src/lib/fileSave.test.js dev/frontend/src/pages/Contracts.jsx
git commit -m "feat(contracts): require save location for word files"
```

### Task 5: End-to-end regression verification

**Files:**
- Modify: `docs/superpowers/plans/2026-08-15-contract-document-memory-generation.md` to mark completed checks.

- [ ] **Step 1: Run focused backend regression**

```powershell
$env:TEST_DATABASE_URL='sqlite:///./contract_documents_test.db'; pytest tests/test_contract_documents.py tests/test_contracts.py -q
```

Expected: all tests PASS.

- [ ] **Step 2: Run frontend regression and production build**

```powershell
npm test -- src/lib/fileSave.test.js
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 3: Inspect changed scope**

```powershell
git diff --check
npx gitnexus detect-changes --repo bachkhoa-erp --scope all
git status --short
```

Expected: only planned document-generation, test, frontend-save, and plan files changed.

- [ ] **Step 4: Commit verification record**

```powershell
git add docs/superpowers/plans/2026-08-15-contract-document-memory-generation.md
git commit -m "docs: record contract document verification"
```

## Execution status (2026-08-15)

- In-memory renderer, snapshot helper, snapshot response helper, protected-route query wiring, and frontend explicit-location behavior were implemented.
- Verified without a database: `dev/backend/tests/test_contract_document_renderer.py` (4 tests) and `dev/frontend/src/lib/fileSave.test.js` (4 tests).
- `npm run build` completed successfully. `npm run lint` exits successfully with pre-existing warnings outside this change scope.
- PostgreSQL integration tests were not run: the safe test guard accepts SQLite, but the complete ORM schema contains PostgreSQL-only `JSONB`; no disposable local PostgreSQL instance was provisioned by user choice. No application database was used.
