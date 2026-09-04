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
