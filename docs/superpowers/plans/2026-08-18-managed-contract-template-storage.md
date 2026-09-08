# Managed Contract Template Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production switch from local MinIO to Cloudflare R2 by environment configuration and manage private, versioned contract DOCX templates without redeploying ERP.

**Architecture:** Rework the existing boto3 adapter into a provider-neutral S3-compatible adapter, retaining legacy MinIO environment values only for local fallback. Production uses one private managed bucket partitioned by object-key prefix. Store the active template object key in the existing `contract_templates` table; the protected document endpoint fetches that DOCX into memory and renders it without persisting generated contracts.

**Tech Stack:** FastAPI, SQLAlchemy, boto3/botocore, python-docx, PostgreSQL/Supabase migrations, pytest.

## Global Constraints

- Production object storage is private and browser clients never receive storage credentials.
- `OBJECT_STORAGE_*` config must support Cloudflare R2 immediately at deployment; local Docker remains MinIO-backed.
- Template objects are immutable versioned keys and generated contracts remain in-memory.
- Backend DB tests run only with a disposable local `TEST_DATABASE_URL`.

---

### Task 1: Provider-neutral private object-storage configuration

**Files:**
- Modify: `dev/backend/src/services/storage_service.py`
- Modify: `dev/backend/src/index.py`
- Modify: `dev/backend/.env.example`
- Modify: `docker-compose.dev.yml`
- Test: `dev/backend/tests/test_storage_service.py`

**Interfaces:**
- Produces `get_object_storage_config()` and S3 client construction from `OBJECT_STORAGE_*` variables.
- Produces guarded bucket setup which defaults managed storage to no creation/no public policy and applies a public policy only to the separate local generic MinIO bucket.

- [ ] **Step 1: Write failing configuration tests** for R2 endpoint/`auto` region selection and disabled production bucket mutation.
- [ ] **Step 2: Run `pytest tests/test_storage_service.py -q`** and confirm the new assertions fail because the generic settings do not exist.
- [ ] **Step 3: Implement the minimal provider-neutral settings and bucket guard** while retaining legacy MinIO fallback.
- [ ] **Step 4: Re-run `pytest tests/test_storage_service.py -q`** and confirm all storage tests pass.

### Task 2: Private, versioned template storage and rendering

**Files:**
- Modify: `dev/backend/src/services/storage_service.py`
- Modify: `dev/backend/src/core/doc_generator.py`
- Modify: `dev/backend/src/contracts/services.py`
- Modify: `dev/backend/src/routes/routes_contracts.py`
- Test: `dev/backend/tests/test_contract_document_renderer.py`
- Test: `dev/backend/tests/test_contract_template_storage.py`

**Interfaces:**
- Produces `upload_contract_template(file_obj, object_name) -> str` and `get_contract_template(object_name) -> bytes`.
- Updates `render_contract_document(data, template_version, template_bytes=None) -> bytes`.
- Uses a published `ContractTemplate.template_storage_key` when present and retains repository fallback only in development.

- [ ] **Step 1: Write failing tests** showing an active private template is downloaded and rendered from bytes, while invalid/non-DOCX uploads are rejected.
- [ ] **Step 2: Run the two focused pytest modules** and confirm failures occur before production changes.
- [ ] **Step 3: Implement private object functions, DOCX byte rendering, and active-template lookup.**
- [ ] **Step 4: Re-run focused tests** and confirm they pass.

### Task 3: Template metadata, publish API, and migration

**Files:**
- Modify: `dev/backend/src/db/models/crm.py`
- Create: `supabase/migrations/20260818120000_contract_template_storage_key.sql`
- Modify: `dev/backend/src/routes/routes_contracts.py`
- Test: `dev/backend/tests/test_contract_template_api.py`

**Interfaces:**
- Adds nullable `template_storage_key` and `storage_provider` metadata to `ContractTemplate`.
- Adds a contract-management route to upload a DOCX and atomically publish its next version.

- [ ] **Step 1: Write failing API/service tests** for permission enforcement, DOCX validation, immutable key generation, and exactly one published version per template code.
- [ ] **Step 2: Run the focused test** and confirm it fails for the missing endpoint/model field.
- [ ] **Step 3: Create and review the migration, then implement model and endpoint code.**
- [ ] **Step 4: Re-run the focused test** and confirm it passes.

### Task 4: R2 bootstrap and deployment handoff

**Files:**
- Create: `dev/backend/scripts/bootstrap_contract_template.py`
- Create: `docs/deployment/cloudflare-r2-contract-templates.md`
- Test: `dev/backend/tests/test_bootstrap_contract_template.py`

**Interfaces:**
- CLI uploads a supplied DOCX to the configured private bucket and prints only its object key.
- Deployment guide gives exact required environment variables and a pre-switch health check.

- [ ] **Step 1: Write a failing CLI/unit test** for the object-key output and no secret logging.
- [ ] **Step 2: Run the test** and confirm it fails because the bootstrap command is absent.
- [ ] **Step 3: Implement the command and deployment guide.**
- [ ] **Step 4: Run focused backend tests, `pytest` contract/storage modules, and `git diff --check`.**
