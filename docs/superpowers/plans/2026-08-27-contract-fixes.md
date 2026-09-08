# Contract Form, Checklist Modal, and Generated DOCX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make reused customer addresses populate structured location selectors, make checklist output documents fully scrollable with the intended hard-copy entries visible, and persist every newly generated contract DOCX in one private bucket for authenticated web viewing under the document-storage rules.

**Architecture:** Use one private bucket and separate domains only by prefixes. Production config uses `OBJECT_STORAGE_BUCKET=bachkhoa-erp-files`; local MinIO may use its existing `MINIO_BUCKET` name, but all domains still share that one bucket. Every contract document is one immutable object keyed by `document_id`; reuse happens through link tables and the protected backend route generates access. Generated contract DOCX files use `contracts/{hd}/dossier-documents/{document_id}/{name}` and are registered once in `dossier_documents`, while the legacy generation row remains as metadata. Gỡ/thay thế changes DB status and audit history; it never deletes or copies an object. Add a pure frontend address hydration helper so reuse is deterministic and testable, then scope the modal flex/overflow fix to the output-document modal.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL/Supabase SQL migrations, boto3 S3-compatible storage, React, Vitest, Testing Library.

## Global Constraints

- Preserve the existing client download URL and authenticated document endpoint.
- Do not change generic `upload_file` or `get_file` behavior.
- Existing generated-document rows without a storage key must remain viewable through the current render fallback.
- Customer address data must retain the house/street detail separately from province and ward codes.
- The output-document modal must use one primary scroll region; every item in each source group remains rendered.
- Production object storage uses one private bucket named `bachkhoa-erp-files`; local MinIO may retain its configured bucket name, but `wiki/`, `avatars/`, `finance/`, `contract-templates/`, and `contracts/` are prefixes only within that one bucket.
- Contract source, dossier, and checklist evidence keys must be derived from stable identifiers and contain no path traversal or customer identity fields.
- A document is never copied or physically deleted; link removal, replacement, and failed DB association are represented in DB state/audit history.
- V1 reads contract-level slots; V2 reads only its own service-line slots and never adds old contract-level slots to its count.

---

### Task 1: Lock the regressions with failing tests

**Files:**
- Modify: `dev/frontend/src/features/contracts/ContractComposer.test.jsx`
- Modify: `dev/frontend/src/components/contracts/ContractWorkflowDesigner.test.jsx`
- Modify: `dev/backend/tests/test_contract_document_renderer.py`
- Modify: `dev/backend/tests/test_contract_template_selection.py`

**Interfaces:**
- Tests will require `hydrateExistingCustomerAddress(customer, provinces)` from `ContractComposer.jsx`.
- Tests will require `upload_contract_document` and `get_contract_document_file` from `src.services.storage_service`.
- Tests will require `ContractGeneratedDocument.output_storage_key` and the document route to stream stored bytes.

- [ ] Add a customer-reuse test with `province_code`, `province_name`, `ward_code`, `ward_name`, and `address_detail`; assert both custom selectors display the selected labels and the submitted `address` is `detail, ward, province`.
- [ ] Add a checklist modal test with more than two items per group; assert all options are in the dialog and the modal has the dedicated scroll-body class.
- [ ] Add backend tests asserting generated document upload receives DOCX bytes/content type and the generated row stores an `output_storage_key`.
- [ ] Add a backend route test asserting a stored object is returned without rerendering.
- [ ] Run the targeted tests and confirm they fail for the missing helper, missing column/storage behavior, and missing modal contract.

### Task 2: Implement structured customer-address hydration

**Files:**
- Modify: `dev/frontend/src/features/contracts/ContractComposer.jsx`
- Modify: `dev/backend/src/routes/routes_contracts.py`
- Modify: `dev/backend/src/contracts/services.py`

**Interfaces:**
- `hydrateExistingCustomerAddress(customer, provinces) -> { detail, provinceCode, provinceName, wardCode, wardName }`.
- Customer search payload exposes structured address fields from `customers.source_reference.address` when available, while legacy `address` remains supported.

- [ ] Implement the pure hydration helper with string-normalized codes, preserving legacy full address in `detail` when structured fields are absent.
- [ ] When selecting a customer, set `geoBoundary` immediately and leave the ward code intact while the province ward list loads.
- [ ] Submit the separated detail plus selected ward/province names as the persisted full address.
- [ ] Extend the contract customer-search SQL/result mapping with structured address fields without changing existing customer identity matching.
- [ ] Run the address tests and the existing `ContractComposer` suite.

### Task 3: Persist generated contract DOCX in private storage

**Files:**
- Modify: `dev/backend/src/db/models/crm.py`
- Create: `supabase/migrations/20260827090000_contract_generated_document_storage.sql`
- Modify: `dev/backend/src/services/storage_service.py`
- Modify: `dev/backend/src/contracts/services.py`
- Modify: `dev/backend/src/routes/routes_contracts.py`

**Interfaces:**
- `upload_contract_document(file_obj, object_name, metadata=None) -> str` stores one DOCX under `contracts/{hd}/dossier-documents/{document_id}/{name}`.
- `get_contract_document_file(object_name) -> dict` reads only that dossier-document key shape from the private shared bucket.
- `ContractGeneratedDocument.output_storage_key` stores the immutable object key.

- [ ] Add the nullable model field and idempotent Supabase migration.
- [ ] Add contract-specific upload/read helpers and keep the generic helpers untouched.
- [ ] Build current document data, load the selected private template, render DOCX bytes, upload them under a key derived from contract id and generated-document id, and store the key plus render snapshot before commit.
- [ ] In the protected document route, stream the stored object when a key exists; retain the current render path for legacy rows without a key; map storage failures to a useful HTTP error instead of leaking an unhandled 500.
- [ ] Run storage, generation, and renderer tests.

### Task 3b: Enforce the document-storage rules

**Files:**
- Modify: `dev/backend/src/dossiers/documents.py`
- Modify: `dev/backend/src/dossiers/register.py`
- Modify: `dev/backend/src/dossiers/slot_requests.py`
- Modify: `dev/backend/tests/test_tai_lieu_dau_ra_unittest.py`
- Modify: `dev/backend/tests/test_de_xuat_loai_tai_lieu_unittest.py`

- [ ] Gỡ tài liệu bằng `DA_GO` and active-link updates, preserving the dossier row and object.
- [ ] Do not delete an object when a DB write fails after upload; preserve the immutable object for audit/reconciliation.
- [ ] Keep relink idempotent: an existing `(document_id, slot_id)` row is reactivated with `UPDATE`, never duplicated with `INSERT`.
- [ ] Keep composite contract ownership constraints and V1/V2 counting semantics unchanged.

### Task 4: Fix the output-document modal layout and catalog assertion

**Files:**
- Modify: `dev/frontend/src/components/contracts/ContractWorkflowDesigner.jsx`
- Modify: `dev/frontend/src/components/contracts/contracts.css`

**Interfaces:**
- The output-document `Modal` receives `className="workflow-output-documents-modal"`.
- The modal body is the single scroll container; group grids expand naturally and render all items.

- [ ] Add the scoped modal class and CSS flex rules (`display:flex`, `flex-direction:column`, `overflow:hidden`, body `min-height:0; overflow:auto`, footer/header fixed).
- [ ] Remove nested grid scrolling and preserve all source groups/items; do not truncate to two rows.
- [ ] Verify the two hard-copy customer-provided entries are not hidden by the layout and keep their source metadata intact.
- [ ] Run the designer tests and frontend build.

### Task 5: Final verification and change-scope audit

**Files:**
- Verify: all files changed above

- [ ] Run targeted backend and frontend tests.
- [ ] Run the full frontend test suite and backend contract/storage tests.
- [ ] Run `npm run build` and the repository’s backend test command.
- [ ] Run `node .gitnexus/run.cjs detect_changes` and confirm only expected symbols/flows are affected.
- [ ] Report the exact test/build results and any environment-only MinIO verification still needed.
