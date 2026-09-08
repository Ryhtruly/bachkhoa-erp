# Managed Contract Template Storage Design

## Goal

Run MinIO only in local development and make production contract templates live in a managed S3-compatible object store such as Cloudflare R2. A template change must not require an ERP application deployment.

## Scope

- Retain the current S3-compatible storage client, but configure it with provider-neutral `OBJECT_STORAGE_*` variables.
- Keep legacy `MINIO_*` variables as a temporary local-development fallback.
- Use the private managed ERP bucket and isolate DOCX templates under the `contract-templates/` prefix; do not make the bucket public.
- Load the active template from object storage, render it in memory, and continue returning the result through the protected contract-document endpoint.
- Provide an authenticated backend upload/publish API so a permitted ERP operator can replace a template without application deployment.
- Persist the object key, provider-neutral metadata, and version in the existing `contract_templates` table. A generated-document record references the selected template.
- Supply an R2 deployment guide and a bootstrap command. Deploying with R2 variables and a bootstrapped template switches the backend immediately; no source-code edit is needed.

## Non-goals

- Do not upload generated contracts to object storage.
- Do not expose object-store credentials or unsigned upload URLs to the browser.
- Do not migrate existing Wiki, finance, or evidence objects in this change.
- Do not create or modify the company Cloudflare account, bucket, or credentials from this repository.

## Architecture

The backend remains the only object-store client. It reads `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_ACCESS_KEY`, `OBJECT_STORAGE_SECRET_KEY`, and `OBJECT_STORAGE_REGION`; Cloudflare R2 supplies its S3-compatible endpoint and uses `auto` as its region. Local Docker continues to provide these values through the existing MinIO service.

The new contract-template storage functions use the single managed bucket and immutable object keys such as `contract-templates/HOP_DONG_DICH_VU_KHUNG_BACH_KHOA/v2.docx`. The contract render route selects the single newest published template and downloads it to bytes. The DOCX renderer accepts bytes as well as the legacy repository template path, keeping the local file only as an explicit development fallback when `ENV` is local/development and `OBJECT_STORAGE_ENDPOINT` is unset.

Upload and publish are backend-only operations protected by the existing contract-management permission. The server verifies the DOCX ZIP signature and size before storage, writes a new immutable version, then updates database state transactionally so only one template for a template code is published. The database stores no credentials and uses the object key rather than a public URL.

## Security and Operations

- The managed ERP bucket is private. The browser never accesses contract-template objects directly.
- Template upload is authenticated and permission-gated; the backend controls the object key and content type.
- Production sets `OBJECT_STORAGE_CREATE_BUCKETS=false` and never applies a public bucket policy. Infrastructure creates R2 buckets in advance.
- Local development may create MinIO buckets automatically; its public generic bucket is separate from the private finance and contract-template buckets.
- Deployment first bootstraps the initial DOCX to R2, then sets production variables. A health check verifies object-store reachability before traffic is switched.
- The current `contract_templates` migration data remains valid; the additional object-key fields are nullable during rollout so existing data is not destroyed.

## Verification

Unit tests cover provider-neutral configuration, private template upload/download, DOCX validation, active-template selection, renderer byte input, and no fallback to a public object URL. Backend tests must retain the existing disposable `TEST_DATABASE_URL` guard; DB integration is skipped when such a target is unavailable.
