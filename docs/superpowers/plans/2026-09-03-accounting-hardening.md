# Accounting Module Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the approved BachKhoa ERP accounting policy for payroll visibility, cashflow approval, payroll locking, object access, and financial input integrity, then update the accounting user guide.

**Architecture:** Keep the existing FastAPI service/repository structure and make the smallest targeted changes at route/service/query boundaries. Use authenticated actor identity and object-scoped authorization at the API boundary, one canonical finance write path, and immutable period-state rules for payroll. Add regression tests before production changes and document the final user-facing workflow.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL/Supabase migrations, pytest/unittest, React/Vite documentation.

**Spec:** User-approved design in the current thread on 2026-09-03; KPI is explicitly excluded.

## Global Constraints

- Employees may view only their own payroll; only accountant and Director may view all payroll.
- Employees submit advance requests; Director approves; accountant creates the official voucher and pays; employee settles.
- Piece-rate payroll is generated only by workflow entitlements; manual worker-wage creation is not part of the accounting flow.
- A locked payroll period is immutable except through an audited correction/reopen process.
- Pending, rejected, cancelled, and void transactions do not affect actual balances or approved financial reports.
- Do not use production/Supabase credentials for tests; PostgreSQL integration requires a disposable local `bachkhoa_test` database.
- Do not commit or push unless explicitly requested.

---

### Task 1: Add regression tests for policy boundaries

**Files:**
- Create/modify: `dev/backend/tests/test_accounting_policy_regressions.py`
- Inspect: `dev/backend/tests/conftest.py`, existing finance/auth tests

**Tests:**
- Employee payroll route rejects a different `employee_id` and allows own data.
- Accountant/Director can query another employee ledger.
- Deliverables and shortage endpoints require assignment/object permission.
- Legacy cashflow route is unavailable or cannot create an approved ledger row.
- Pending/rejected/cancelled transactions are excluded from balance/report aggregates.
- Invalid amounts and over-refunds are rejected.
- Payroll lock prevents post-lock changes or uses an explicit audited correction path.

**Verification:** Run each new test before implementation and confirm expected failures.

### Task 2: Enforce payroll ownership and object authorization

**Files:**
- Modify: `dev/backend/src/routes/routes_payroll.py`
- Modify: `dev/backend/src/routes/routes_employee_portal.py`
- Modify: `dev/backend/src/routes/routes_handover.py`
- Modify: `dev/backend/src/dossiers/handover.py`
- Modify: `dev/backend/src/core/auth.py` only if a focused scope helper is required

**Implementation:**
- Add a reusable actor-to-employee/object authorization helper following current auth patterns.
- Allow own payroll only through the authenticated employee identity.
- Require an all-payroll permission for accountant/Director ledger access.
- Apply object authorization to deliverables list/ZIP and shortage report.

**Verification:** Run the new access-control tests and relevant existing portal/finance tests.

### Task 3: Remove bypasses from cashflow and financial reporting

**Files:**
- Modify: `dev/backend/src/routes/routes_cashflow.py`
- Modify: `dev/backend/src/finance/services.py`
- Modify: `dev/backend/src/finance/repository.py`
- Modify: `dev/backend/src/finance/schemas.py`
- Create/modify: `supabase/migrations/<timestamp>_accounting_integrity_constraints.sql` only for required DB invariants

**Implementation:**
- Disable the legacy direct-insert endpoint or route it through canonical `FinanceService.create_cashflow`.
- Use approved canonical statuses only for actual balances/reports; handle legacy NULL rows explicitly.
- Add positive amount and bounded refund/settlement validation.
- Prevent refund amount from exceeding approved excess and make receivable updates idempotent.
- Use authenticated actor IDs for audit data.
- Add database-level uniqueness/constraints only where compatible with current schema and migration policy.

**Verification:** Run finance regression tests, SQL/schema checks, and targeted backend tests.

### Task 4: Enforce workflow-generated payroll and immutable locked periods

**Files:**
- Modify: `dev/backend/src/routes/routes_finance.py`
- Modify: `dev/backend/src/finance/services.py`
- Modify: `dev/backend/src/routes/routes_payroll.py`
- Modify: `dev/backend/src/employee_portal/service.py`
- Modify: `dev/frontend/src/features/employee-portal/MyPayroll.jsx` only for state/label consistency
- Create/modify: `supabase/migrations/<timestamp>_payroll_state_consistency.sql` if needed

**Implementation:**
- Remove/disable manual worker wage creation from the accounting API.
- Align entitlement statuses with the database constraint; do not query unsupported `paid` status.
- Lock all records belonging to a payroll period and prevent live recalculation after lock.
- Keep employee self-view and accountant/Director full-view consistent with the locked snapshot.
- Preserve the approved advance-request → Director approval → accountant payment flow.

**Verification:** Run payroll regression tests, existing employee payroll tests, and frontend tests/build.

### Task 5: Update accounting user guide

**Files:**
- Modify: `docs/HUONG_DAN_SU_DUNG_MODULE_KE_TOAN.md`

**Content:**
- Document role matrix and own/all payroll visibility.
- Document cashflow pending/approval/report rules.
- Document advance request, approval, payment, and settlement flow.
- Document workflow-generated piece-rate payroll and locked-period behavior.
- Remove instructions for manual worker-wage creation and clarify error cases.

**Verification:** Review guide against implemented route behavior and final test evidence.

### Task 6: Final verification and change-scope review

**Checks:**
- `git diff --check`
- Backend targeted tests and full available unit tests.
- PostgreSQL integration tests when `TEST_DATABASE_URL` points to disposable `bachkhoa_test`.
- Frontend `npm run test`, `npm run lint`, and `npm run build`.
- GitNexus `detect_changes()` before any future commit; no commit in this task unless requested.
- Verify only requested code/docs changed and report any remaining environment limitations.
