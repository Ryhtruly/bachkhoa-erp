# Auth Refresh Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded, rotating refresh sessions so ERP users survive access-token expiry and browser refresh without creating indefinite access tokens.

**Architecture:** The backend will issue a short-lived JWT access token plus an opaque refresh token in an HttpOnly cookie. Refresh sessions are stored as SHA-256 hashes in PostgreSQL, rotated on every use, and revoked on logout, account disablement, expiry, or refresh-token reuse. The frontend API helper will keep the access token in memory, refresh once on `401`, deduplicate concurrent refreshes, and retry the original request once.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL/Supabase SQL migrations, PyJWT, React/Vite, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-09-12-auth-refresh-session-design.md`

## Global Constraints

- Access token default lifetime is 30 minutes and must remain configurable through `ACCESS_TOKEN_EXPIRE_MINUTES`.
- Refresh session absolute lifetime is 7 days by default; remember-device lifetime is 30 days; idle timeout is 24 hours.
- Raw refresh tokens must never be returned in JSON, stored in localStorage, logged, or included in test snapshots.
- `401` may trigger at most one refresh/retry cycle per original API request.
- Refresh cookies must use `HttpOnly`, `Path=/api/auth`, `Secure` in production, and explicit CORS origins.
- Existing RBAC and payroll/finance authorization behavior must remain unchanged.
- Preserve unrelated working-tree changes; do not stage, commit, reset, or push unless separately requested.

---

### Task 1: Write backend session model and migration tests first

**Files:**
- Create: `dev/backend/tests/test_auth_refresh_sessions.py`
- Modify: `dev/backend/src/db/models/auth.py`
- Modify: `dev/backend/src/db/models/__init__.py`

**Steps:**

- [x] Add failing tests for creating a refresh session, storing only a token hash, checking absolute/idle expiry, and revoking a session.
- [x] Run `pytest -q tests/test_auth_refresh_sessions.py` and confirm failure because the session service/model does not exist.
- [x] Add `RefreshSession` with UUID/string id, `user_id`, `token_hash`, `family_id`, `created_at`, `last_used_at`, `expires_at`, `idle_expires_at`, `revoked_at`, `replaced_by_id`, `user_agent`, and `ip_address`.
- [x] Export the model from `src/db/models/__init__.py`.
- [x] Run the focused tests and confirm the model-level behavior passes.

**Notes:** Keep the existing unused `AuthToken` model intact for compatibility. The new table must not reuse its plaintext `token` column.

### Task 2: Add the production database migration and auth configuration

**Files:**
- Create: `supabase/migrations/20260912000000_auth_refresh_sessions.sql`
- Create: `supabase/rollback/20260912000000_auth_refresh_sessions_down.sql`
- Modify: `dev/backend/src/config/settings.py`
- Modify: `dev/backend/.env.example`

**Steps:**

- [ ] Write the SQL migration test/verification query for table, unique token hash, user foreign key, family index, expiry indexes, and revoke columns.
- [ ] Run the schema verification before the migration and confirm the expected table is absent in a disposable database.
- [x] Add an idempotent `CREATE TABLE IF NOT EXISTS public.auth_refresh_sessions` migration with `varchar(50)` user foreign key, `timestamptz` fields, and indexes.
- [x] Add the rollback migration that drops only the new table and its indexes.
- [x] Add settings for `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`, `REMEMBER_ME_REFRESH_TOKEN_EXPIRE_DAYS`, `REFRESH_TOKEN_IDLE_HOURS`, `AUTH_COOKIE_NAME`, `AUTH_COOKIE_DOMAIN`, `AUTH_COOKIE_SAMESITE`, and production secure-cookie behavior.
- [x] Document CORS/frontend origin and cookie settings in `.env.example` without adding secrets.
- [ ] Run the migration/schema verification against the disposable PostgreSQL test DB if available.

### Task 3: Implement refresh-token issue, rotation, reuse detection, and revoke

**Files:**
- Create: `dev/backend/src/core/refresh_sessions.py`
- Modify: `dev/backend/src/core/auth.py`
- Test: `dev/backend/tests/test_auth_refresh_sessions.py`

**Steps:**

- [ ] Add failing unit/API tests for issuing a raw token with a stored SHA-256 hash, rotating a valid token, rejecting expired/idle/revoked tokens, and revoking a reused token family.
- [ ] Run the focused tests and confirm the expected failures.
- [x] Implement cryptographically random opaque tokens with `secrets.token_urlsafe` and hash lookup semantics.
- [x] Implement issue, rotate, revoke-session and family-reuse handling with no raw-token logging.
- [x] Make refresh validation check user existence and `is_active` before issuing a new access token.
- [x] Keep access-token creation compatible with existing fixtures while changing the default expiry to the configured short lifetime.
- [x] Run all auth refresh tests and existing auth/RBAC coverage.

### Task 4: Add login, refresh, logout, and password-flow cookie handling

**Files:**
- Modify: `dev/backend/src/routes/routes_auth.py`
- Modify: `dev/backend/src/user_admin/service.py` only if a password-flow helper needs a shared response contract
- Test: `dev/backend/tests/test_auth_refresh_sessions.py`
- Test: `dev/backend/tests/test_auth_rbac.py` if existing expectations need explicit updates

**Steps:**

- [ ] Add failing tests asserting login sets an HttpOnly refresh cookie and does not return a refresh token in JSON.
- [ ] Add failing tests for `POST /api/auth/refresh` success, rotation, invalid cookie, expired cookie, disabled user, and reuse detection.
- [ ] Add failing tests for `POST /api/auth/logout` revocation and cookie deletion.
- [ ] Add failing tests that invite completion and password reset also establish a refresh session.
- [x] Implement a shared response helper that sets/clears the refresh cookie consistently.
- [x] Add `remember_me: bool = False` to the login schema without changing the meaning of the existing “remember username” UI.
- [x] Add `POST /api/auth/refresh` and `POST /api/auth/logout`.
- [x] Ensure refresh endpoint uses cookie only, never accepts a refresh token in query/body.
- [x] Run focused auth tests and the complete backend auth/RBAC test subset.

### Task 5: Make the frontend API helper refresh once and deduplicate concurrent refreshes

**Files:**
- Modify: `dev/frontend/src/lib/api.js`
- Modify: `dev/frontend/src/lib/api.test.js`

**Steps:**

- [ ] Add failing tests for in-memory access-token storage, refresh-cookie request credentials, successful 401 refresh/retry, refresh failure logout event, and concurrent 401 deduplication.
- [ ] Run `npm test -- --run src/lib/api.test.js` and confirm failure.
- [x] Add `setAccessToken`, in-memory `getAccessToken`, and a single-flight `refreshAccessToken` promise.
- [x] Update `requestOnce` to skip refresh for auth endpoints, refresh at most once, update the in-memory token, and retry the original request once.
- [x] Dispatch `bachkhoa:unauthorized` only after refresh fails with an authentication error.
- [x] Preserve existing API cache/in-flight behavior and caller-provided abort signals.
- [x] Run the focused API tests and all frontend tests that use `getAccessToken`.

### Task 6: Bootstrap and logout the React application through the refresh session

**Files:**
- Modify: `dev/frontend/src/App.jsx`
- Modify: `dev/frontend/src/main.jsx`
- Modify: `dev/frontend/src/pages/Login.jsx`
- Modify: `dev/frontend/src/lib/sessionValidation.js`
- Modify: `dev/frontend/src/App.sidebar.test.jsx`
- Modify: `dev/frontend/src/lib/sessionValidation.test.js`

**Steps:**

- [ ] Add failing tests for a page refresh with no in-memory access token but a valid refresh cookie, login cookie credentials, expired refresh session returning to login, and logout clearing access state.
- [ ] Run focused App/session tests and confirm failure.
- [x] Start App in a session-bootstrap state instead of depending on access-token localStorage.
- [x] Let `/api/auth/me` go through the shared API helper so it can refresh before deciding that the session is invalid.
- [x] Change login, invite completion, and password reset requests to use `credentials: 'include'` and set the in-memory access token through the helper.
- [x] Change the global internal-fetch authorization shim to read the current in-memory access token rather than localStorage and refresh direct internal fetches.
- [x] Preserve the existing transient backend retry UI and make true refresh failure the only automatic logout path.
- [x] Run App/session tests and the full frontend suite.

### Task 7: Validate deployment configuration and security boundaries

**Files:**
- Modify: `dev/backend/Dockerfile.prod` only if migration/runtime packaging requires it
- Modify: `dev/backend/docker-compose.backend.prod.yml` or the active production compose file only if cookie envs need explicit wiring
- Modify: deployment documentation if present, otherwise create `docs/deployment/auth-session.md`

**Steps:**

- [ ] Verify the active production deployment actually applies Supabase migrations before the backend starts accepting traffic.
- [x] Document that production `SECRET_KEY`, `CORS_ORIGINS`, `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE`, and frontend origin values are set outside the image.
- [x] Document that direct cross-site frontend/backend calls require `AUTH_COOKIE_SAMESITE=none` and `AUTH_COOKIE_SECURE=true`; the Netlify same-origin reverse proxy may use `lax`.
- [ ] Verify Netlify proxy behavior preserves `Set-Cookie`; if it does not, document the required direct-backend origin or same-site custom-domain setup before enabling production rollout.
- [ ] Run a disposable end-to-end login → refresh → logout flow with browser cookie inspection that never prints the cookie value.
- [ ] Confirm no raw refresh token appears in logs, JSON responses, localStorage, test output, or screenshots.

### Task 8: Final verification and change-scope review

**Files:**
- No additional source files expected.

**Steps:**

- [x] Run backend auth/RBAC tests against a disposable SQLite test DB; PostgreSQL remains a deployment migration check.
- [x] Run frontend full tests, lint, and production build.
- [x] Run `git diff --check` for touched files.
- [ ] Run GitNexus `detect_changes` for the working-tree scope and inspect affected auth/API execution flows.
- [x] Review `git status` and ensure unrelated existing modifications are untouched and unstaged.
- [x] Do not commit or push unless the user separately requests integration.
