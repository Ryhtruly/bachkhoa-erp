# Single Private R2 Bucket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store every ERP object in one private Cloudflare R2 bucket while isolating each domain by a stable object-key prefix.

**Architecture:** `OBJECT_STORAGE_BUCKET` names the sole managed bucket. Storage-service functions receive or construct keys under `wiki/`, `finance/`, `contract-templates/`, `contracts/<contract-id>/service-lines/<service-line-id>/nodes/<task-node-id>/`, and `avatars/`; backend authorization remains the only way to read private objects. Wiki, avatar, and workflow evidence are streamed through authenticated backend routes.

**Tech Stack:** FastAPI, boto3/botocore S3 API, Cloudflare R2, pytest.

## Global Constraints

- Production has one private bucket named by `OBJECT_STORAGE_BUCKET=bachkhoa-erp-files`.
- No browser receives R2 credentials or a permanent public object URL.
- Keep local MinIO compatibility when `OBJECT_STORAGE_ENDPOINT` is unset.
- Preserve existing object data by supporting legacy keys/URLs during the migration window.

---

### Task 1: One-bucket storage configuration

**Files:**
- Modify: `dev/backend/src/services/storage_service.py`
- Modify: `dev/backend/src/index.py`
- Modify: `docker-compose.dev.yml`
- Test: `dev/backend/tests/test_storage_service.py`

- [ ] **Step 1: Write a failing test** that sets only `OBJECT_STORAGE_BUCKET=bachkhoa-erp-files` and asserts Wiki, finance, and template writes target that bucket with their own prefixes.
- [ ] **Step 2: Run** `pytest --noconftest tests/test_storage_service.py -q -p no:cacheprovider` **and confirm it fails because separate bucket constants are still used.**
- [ ] **Step 3: Route managed finance and contract-template storage through the single configured bucket, retain separate private local MinIO buckets, and add prefix constants `wiki/`, `finance/`, `contract-templates/`, `contracts/`, and `avatars/`.**
- [ ] **Step 4: Re-run the focused storage test and existing receipt/template tests, confirming all pass.**

### Task 2: Private Wiki delivery

**Files:**
- Modify: `dev/backend/src/routes/routes_wiki.py`
- Modify: `dev/backend/src/services/storage_service.py`
- Test: `dev/backend/tests/test_wiki_storage_delivery.py`

- [ ] **Step 1: Write a failing route test** that denies unauthorized reads and returns authorized Wiki bytes from `wiki/<document-id>/<filename>` without redirecting to an object-store URL.
- [ ] **Step 2: Run** `pytest tests/test_wiki_storage_delivery.py -q` **with a disposable PostgreSQL test database and confirm it fails at the existing public redirect behavior.**
- [ ] **Step 3: Store object keys, not public URLs, for new Wiki uploads; retain parsing of existing `/wiki-files/` URLs only for legacy records. Stream the object through the permission-protected endpoint.**
- [ ] **Step 4: Re-run the focused Wiki route test and its existing regression suite.**

### Task 3: Domain-key migration and deployment

**Files:**
- Modify: `dev/backend/src/routes/routes_finance.py`
- Modify: `dev/backend/src/routes/routes_employee_portal.py`
- Modify: `dev/backend/src/contracts/workflow_runtime.py`
- Modify: `docs/deployment/cloudflare-r2-contract-templates.md`
- Create: `docs/deployment/cloudflare-r2-single-bucket.md`
- Test: `dev/backend/tests/test_storage_service.py`

- [ ] **Step 1: Write failing tests** for the exact finance, avatar, evidence, and contract-template key prefixes listed in the global constraints.
- [ ] **Step 2: Run the affected focused tests and confirm each fails because a legacy or unprefixed key is generated.**
- [ ] **Step 3: Route every new write through the one-bucket prefix helpers, leaving existing object keys readable. Document the R2 bucket creation, least-privilege credential policy, and pre-cutover read/write checks.**
- [ ] **Step 4: Run all focused backend storage/contract/finance/employee tests, `git diff --check`, and GitNexus `detect-changes --repo bachkhoa-erp`.**
