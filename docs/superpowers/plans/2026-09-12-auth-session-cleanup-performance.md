# Auth Session Cleanup and Login Performance Plan

Status: implemented and verified on 2026-09-12. No commit or push performed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent unbounded growth of rotated refresh-session records and remove one unnecessary database round trip from login without weakening session rotation or authorization.

**Architecture:** Keep the existing opaque refresh-token rotation and family-reuse detection. Add an indexed ORM cleanup operation that retains revoked/expired records for 30 days, then run it from a cancellable backend lifespan task once per configured interval. During session issuance, avoid refreshing a newly inserted row when the caller only needs the raw cookie value; callers that need persisted fields continue to refresh or access them normally.

**Tech Stack:** FastAPI lifespan, SQLAlchemy, PostgreSQL/Supabase migration, pytest, existing auth refresh-session tests.

**Spec:** `docs/superpowers/specs/2026-09-12-auth-refresh-session-design.md`

## Global Constraints

- Keep refresh-token rotation, HttpOnly cookies, absolute expiry, idle expiry, and reuse-family revocation unchanged.
- Retain revoked or expired refresh-session rows for 30 days before deletion by default.
- Do not log or expose raw refresh tokens.
- Do not modify RBAC, payroll, finance authorization, or access-token claims.
- Preserve unrelated working-tree changes and do not stage, commit, or push.

---

### Task 1: Add a failing cleanup regression test

**Files:**
- Modify: `dev/backend/tests/test_auth_refresh_sessions.py`

**Steps:**

- [x] Add a test that creates one revoked session older than the retention window, one expired session older than the window, one recently revoked session, and one current session.
- [x] Call the cleanup helper with `retention_days=30` and a fixed `now` value.
- [x] Assert exactly the two stale rows are deleted and the recent/current rows remain.
- [x] Run the test first and confirm the expected RED state before implementing the helper.

### Task 2: Implement cleanup and configuration

**Files:**
- Modify: `dev/backend/src/core/refresh_sessions.py`
- Modify: `dev/backend/src/config/settings.py`
- Modify: `dev/backend/.env.example`
- Modify: `dev/backend/src/index.py`

**Steps:**

- [x] Implement `cleanup_refresh_sessions(db, retention_days=None, now=None) -> int` using one SQLAlchemy bulk delete: revoked rows older than the cutoff, or active rows whose expiry is older than the cutoff.
- [x] Roll back and re-raise if the cleanup transaction fails so the lifespan loop can log the failure without leaving a dirty session.
- [x] Add `AUTH_REFRESH_SESSION_RETENTION_DAYS` with a default of `30`.
- [x] Add `AUTH_REFRESH_SESSION_CLEANUP_INTERVAL_HOURS` with a default of `24` and allow `0` to disable the loop in tests or special deployments.
- [x] Add a cancellable async cleanup loop to the existing FastAPI lifespan, opening and closing its own `SessionLocal` session in the worker thread.
- [x] Run the focused cleanup test and the complete auth refresh test file.

### Task 3: Add the PostgreSQL cleanup index

**Files:**
- Create: `supabase/migrations/20260912000001_auth_refresh_session_cleanup.sql`
- Create: `supabase/rollback/20260912000001_auth_refresh_session_cleanup_down.sql`

**Steps:**

- [x] Add a partial index on `auth_refresh_sessions(revoked_at)` for non-null revoked rows; keep the existing active-expiry index unchanged.
- [x] Make the migration idempotent with `create index if not exists`.
- [x] Add rollback SQL that drops only this cleanup index.
- [x] Apply the non-destructive index DDL through the connected Supabase project and read back the resulting index definition.

### Task 4: Remove an unnecessary login round trip

**Files:**
- Modify: `dev/backend/src/core/refresh_sessions.py`
- Test: `dev/backend/tests/test_auth_refresh_sessions.py`

**Steps:**

- [x] Confirm all production callers of `issue_refresh_session` ignore the returned ORM object.
- [x] Remove only the unconditional `db.refresh(session)` from `issue_refresh_session`; keep the commit and return contract unchanged for tests and callers.
- [x] Run the complete refresh-session test file; broader auth/RBAC coverage remains outside this focused run.
- [x] Do not remove the post-login `/api/auth/me` validation in this change because that is a separate frontend behavior and needs its own UI regression coverage.

### Task 5: Verify scope and runtime behavior

**Files:**
- No additional source files expected.

**Steps:**

- [x] Run backend focused tests and relevant focused auth coverage.
- [x] Run frontend tests, lint, and build because the login contract remains unchanged but the auth flow is shared.
- [x] Run `git diff --check`.
- [x] Run GitNexus `detect_changes`; the existing index reanalysis still reports an FTS inconsistency, so symbol-level results are treated as advisory.
- [x] Review `git status` and confirm unrelated changes were not staged or overwritten.
