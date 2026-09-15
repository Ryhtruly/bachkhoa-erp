# Security hardening after repository scan

## Goal

Close the confirmed Critical/High security boundaries from the repository scan
without reverting or overwriting the existing accounting and authentication
changes in the working tree.

## Scope

1. Authentication and deployment configuration: remove insecure secret/admin
   fallbacks and reject wildcard credentialed CORS in non-development modes.
2. Authorization and documents: enforce dossier-parent access for legal
   documents, keep generated documents private, and apply contract read scope
   in the backend.
3. Finance integrity: fail closed when the distributed lock is unavailable.
4. Abuse/resource controls: add reset-OTP throttling, public-intake throttling,
   upload limits, and safe document filename handling.
5. Authorization consistency and CI: route permission checks through the
   normalized evaluator where the existing schema supports it, and add backend
   verification plus immutable image tags to CI.

## Compatibility decisions

- Development keeps local CORS defaults and explicit test overrides.
- Production requires explicit `CORS_ORIGINS`, `JWT_SECRET`, and
  `SECRET_KEY`; missing values fail startup.
- Sales contract access follows the existing `contract.read.related` rule. The
  backend will enforce related access; accountant/director/admin retain the
  all-contract path.
- Outside-contract finance workflows remain valid unless the specific business
  rule already requires a contract.

## Verification

- Add focused backend tests for configuration, authorization boundaries, Redis
  lock failure, throttling, and filename sanitization.
- Run focused backend tests, the existing accounting/auth tests, frontend tests,
  and a production build/lint where available.
- Run GitNexus `detect-changes` if the index is available; otherwise record the
  index limitation.
- Run a fresh Codex Security diff scan after implementation. Do not commit or
  push in this task.
