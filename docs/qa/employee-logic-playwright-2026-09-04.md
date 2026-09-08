# Employee Logic Playwright QA Report

Date: 2026-09-04
Runtime: Docker development stack; system Chrome; credentials supplied through environment variables (password omitted).
Services: Docker services healthy. Node/config checks passed.

## Run Summary

The first attempt used bundled Chromium and failed to launch because of the runner environment. The strict rerun used system Chrome. External Google Fonts requests and intentional SSE abort noise were filtered from the final harness result.

| Test case | Scope | Status | Result |
|---|---|---|---|
| TC-PW-01 | Preview identity | BLOCKED | Desktop could not reach a seeded output document with an attached file, so exact preview identity was not executable. |
| TC-PW-02 | Exact-child upload | NOT EXECUTED | Requires the same seeded output-document fixture; not run after the fixture gate blocked. |
| TC-PW-03 | Hard/soft submission gates | NOT EXECUTED | Requires deterministic workflow/output-document seed data; not run after the fixture gate blocked. |
| TC-PW-04 | Runtime/auth and error states | PARTIAL | Mobile reached node detail. Repeated `404 GET /api/employee-portal/file?object_key=avatars/...jpg` failures were observed. |
| TC-PW-05 | Responsive acceptance | PASS (mobile width) | Desktop/mobile visual screenshots were inspected; mobile width/layout assertion passed. |

## Strict Run Findings

Desktop ended `TEST_DATA_BLOCKED`: no assigned/seeded output document with an attached file was available for the preview/upload workflow. This is a fixture limitation, not a product pass.

Mobile reached the employee node detail and exposed a runtime/storage failure: repeated avatar requests returned `404` for `/api/employee-portal/file?object_key=avatars/...jpg`. The avatar object key or seeded object storage contents must be reconciled before runtime/auth acceptance can be marked pass.

## Evidence

Playwright output root: [`dev/frontend/test-results`](../../dev/frontend/test-results)
Inspected screenshots:

- [`employee-dashboard.png`](../../dev/frontend/test-results/employee-logic-audit-emplo-b84fc-and-node-detail-logic-smoke/employee-dashboard.png)
- [`employee-node-detail.png`](../../dev/frontend/test-results/employee-logic-audit-emplo-b84fc-and-node-detail-logic-smoke/employee-node-detail.png)
- [`employee-mobile.png`](../../dev/frontend/test-results/employee-logic-audit-emplo-26482-ow-remains-usable-on-mobile/employee-mobile.png)

The coordinator inspected all three screenshots during the strict desktop/mobile run.

## Follow-up Requirements

- Seed an employee assignment that exposes a node with at least two output-document rows, including the target child and a real attached file/object key.
- Seed the referenced output file in the configured development object store and provide deterministic metadata for preview identity and exact-child replacement.
- Seed the avatar object keys used by the employee fixture, or correct the employee avatar references so authenticated file GETs do not return 404.
- Rerun TC-PW-01 through TC-PW-04 with the fixture in place, retaining screenshots/traces under `dev/frontend/test-results`.
- Keep credentials environment-only; do not add passwords or auth state to the repository.

No application, test, or configuration files were changed for this report. No secrets or commits were created.

## Additional Verification

- Frontend full suite: **PASS**, 90 files and 637 tests.
- Production build: **PASS**, with chunk-size warnings.
- Docker backend workflow pytest, excluding the collection-broken prior-document test: 12 passed, 53 skipped; teardown errored because the `pg-test` schema lacked `public.audit_log_id_seq`.
- Including the prior-document-security test caused collection `ImportError`: `WorkflowInstance` is not exported from `src.db.models`.
- No code files were changed.

## Wave 5 Rerun (2026-09-04)

- Focused frontend verification: **PASS**, 4 files and 92 tests; `oxlint` reported warnings only.
- Frontend full suite: **PASS**, 90 files and 637 tests.
- Production build: **PASS**, with a chunk-size warning for a bundle over 500 KB.
- Playwright using the `nguyenvana` environment account and system Chrome: desktop **BLOCKED** with `TEST_DATA_BLOCKED` because no seeded output document with an attached file was available.
- Mobile **FAIL**: repeated `404 GET /api/employee-portal/file?object_key=avatars/c80bfb15-3149-4dbc-9dbb-2300b7a35ba2_99489d5a_anh-mo-ta.jpg` responses, with matching console 404 errors.
- The current non-escalated shell cannot resolve the `docker` command, so `docker compose ps` was unavailable in that shell for this rerun; the later escalated check confirmed service health.

No application code was changed and no credentials were recorded.

## Wave 5 Latest Evidence (2026-09-04)

- Escalated `docker compose ps`: **PASS**; backend, frontend, MinIO, `pg-test`, and Redis were healthy.
- Backend regression including `prior-document-security`: **BLOCKED** at collection with `ImportError` because `WorkflowInstance` is missing from `src.db.models`.
- Excluding that collection-broken test: 12 passed, 53 skipped, and 1 teardown error because `public.audit_log_id_seq` is missing.
- Playwright with system Chrome still has 2 failures: desktop `TEST_DATA_BLOCKED` due to no seeded output file; mobile repeated 404s from `/api/employee-portal/file?object_key=avatars/c80bfb15-3149-4dbc-9dbb-2300b7a35ba2_99489d5a_anh-mo-ta.jpg`.
- No application code edits were made.

## Wave 5 Backend Verification Update (2026-09-04)

- After test-infrastructure fixes, the Docker regression command including `prior-document-security` **PASS**ed: 22 passed, 53 skipped, 2 warnings, with no teardown error.
- Playwright remains blocked/failed for acceptance because the app `DATABASE_URL` points to live Supabase and no safe disposable workflow fixture exists. These results do not constitute final acceptance.

## Final Wave 5 Acceptance (2026-09-04)

The earlier blocked/404 entries above are preliminary runs from before the authorized Supabase/MinIO test fixture was seeded. They are retained as investigation history; this section is the final acceptance result.

### Logic fixes verified

- Employee checklist payloads now include the real `dossier_documents.file_name` in `review_by_template` for both task detail and output-status responses.
- Opening an output document passes the resolved template display name (and real filename when available) instead of falling back to a template UUID.
- After an upload, the selected child row keeps the chosen filename keyed by `template_id`; another output row is not mutated.
- Backend test teardown no longer fails when the disposable schema lacks `public.audit_log_id_seq`.
- The prior-document security test uses temporary tables and no longer imports removed ORM models.

### Final evidence

| Test suite | Result |
|---|---|
| Docker backend regression (7 targeted modules) | **22 passed, 60 skipped, 2 warnings** |
| Frontend Vitest | **90 files passed, 637 tests passed** |
| Playwright employee logic audit (system Chrome, Docker stack) | **4 passed** |
| Frontend production build | **PASS** (existing chunk-size warning only) |

Playwright covered desktop preview identity, mobile layout/runtime, hard rejection plus soft shortage submission gates, and exact-child output-document upload. The seeded K01 fixture was reset to `rework_required`/`failed` with one pending output and one rejected output before the final run; the avatar and output objects were present in MinIO. Credentials remained environment-only.
