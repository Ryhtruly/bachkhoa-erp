# CRM Sale Commission and Workload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a protected Sale workflow, global CRM commission settings, immutable contract-rate snapshots, configurable workload limits, and payroll visibility without changing existing contract or payment behavior.

**Architecture:** Keep CRM policy settings in the existing finance settings store, add a versioned commission snapshot to each converted contract, and calculate commission from approved contract-linked cashflow income. Extend the existing CRM page and office payroll response rather than introducing a second payroll system.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL/Supabase, React, Vitest, pytest.

**Spec:** Approved in the conversation on 2026-09-18.

## Global Constraints

- New identifiers, comments, test names, and backend/frontend implementation text must use English only; user-facing Vietnamese labels may remain Vietnamese.
- Existing uncommitted workflow changes must remain untouched.
- Existing contract creation, payment, receivable, and payroll behavior must remain backward compatible.
- Commission is calculated from approved contract-linked income transactions only.
- A contract stores the commission rate active when it reaches the closed state; later global policy changes never rewrite that snapshot.
- No production database mutation is allowed from this worktree; schema changes must be delivered as an Alembic migration.

### Task 1: Establish the policy and contract snapshot schema

**Files:**
- Modify: `dev/backend/src/db/models/crm.py`
- Modify: `dev/backend/src/db/models/finance.py`
- Create: `dev/backend/alembic/versions/c1d4e7f9a2b0_add_crm_sale_policy_and_contract_commission_snapshot.py`
- Test: `dev/backend/tests/test_crm_commission_policy.py`

- [ ] Write failing tests for default settings, rate validation, workload calculations, and immutable contract snapshot semantics.
- [ ] Run the focused test file and confirm it fails because the policy and snapshot helpers do not exist.
- [ ] Add English-named fields and helper functions with bounded numeric validation and no retroactive mutation path.
- [ ] Add the Alembic migration for required columns/indexes and preserve nullable defaults for existing contracts.
- [ ] Run the focused test file and confirm it passes.

### Task 2: Implement CRM policy, ownership, workload, and conversion rules

**Files:**
- Modify: `dev/backend/src/routes/routes_crm.py`
- Modify: `dev/backend/src/routes/routes_intake.py`
- Modify: `dev/backend/src/db/models/crm.py`
- Create or modify: `dev/backend/src/crm/commission.py`
- Test: `dev/backend/tests/test_crm_sale_workflow.py`

- [ ] Write failing tests for atomic claim, ownership-only status updates, director reassignment, workload blocking, director override, and conversion snapshot creation.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Add policy read/update endpoints protected for director/accounting users.
- [ ] Add an atomic claim endpoint that only claims unassigned active leads and records an audit event.
- [ ] Enforce owner-or-director access on status changes and assign the owner to `Contract.sale_id` during conversion.
- [ ] Snapshot the active commission rate at conversion time and calculate future commission from that snapshot.
- [ ] Add workload configuration defaults and enforce both weighted workload and open-lead limits.
- [ ] Run focused CRM tests and confirm they pass.

### Task 3: Add the management CRM UI and employee Sale workspace

**Files:**
- Modify: `dev/frontend/src/pages/CRM.jsx`
- Modify: `dev/frontend/src/pages/crm.css`
- Modify: `dev/frontend/src/App.jsx`
- Modify: `dev/frontend/src/components/Sidebar.jsx`
- Create or modify: `dev/frontend/src/features/crm/CrmSettingsPanel.jsx`
- Test: `dev/frontend/src/pages/CRM.test.jsx`
- Test: `dev/frontend/src/App.sidebar.test.jsx`

- [ ] Write failing UI tests for the settings button, two-tab panel, owner avatar visibility, claim action, workload warning/blocking, and employee Sale tab access.
- [ ] Run the focused Vitest tests and confirm the expected failures.
- [ ] Add the `CRM Settings` action to the CRM toolbar and implement the two tabs: commission and Sale workload.
- [ ] Render owner avatar/name only in management views; keep owner data hidden from non-management employee views.
- [ ] Add Sale employee navigation and a restricted CRM view using the existing permission model.
- [ ] Add responsive styles with keyboard focus, reduced-motion support, and existing application tokens.
- [ ] Run focused frontend tests and confirm they pass.

### Task 4: Integrate commission into office payroll and employee payroll

**Files:**
- Modify: `dev/backend/src/finance/repository.py`
- Modify: `dev/backend/src/employee_portal/service.py`
- Modify: `dev/backend/src/finance/excel_exporter.py`
- Modify: `dev/frontend/src/components/finance/screens/PayrollOfficeScreen.jsx`
- Modify: `dev/frontend/src/features/employee-portal/MyPayroll.jsx`
- Test: `dev/backend/tests/test_payroll_sales_commission.py`
- Test: `dev/frontend/src/components/finance/screens/PayrollOfficeScreen.test.jsx`

- [ ] Write failing tests for approved income aggregation, refund reversal, contract snapshot rates, payroll period boundaries, and Sale-only visibility.
- [ ] Run the focused backend and frontend tests and confirm the expected failures.
- [ ] Add a bounded SQL aggregation for approved contract-linked income minus approved refunds, grouped by `Contract.sale_id` and payroll period.
- [ ] Preserve existing base salary, piece-rate, adjustment, cache, lock, and paid-period behavior while adding `sales_commission` to the response.
- [ ] Include commission in payroll totals and export output without exposing another employee's personal payroll to Sale users.
- [ ] Run focused payroll tests and confirm they pass.

### Task 5: Regression verification and graph review

**Files:**
- Modify only files required by failing regression tests.

- [ ] Run the complete backend test suite against the disposable test database.
- [ ] Run the complete frontend test suite and production build.
- [ ] Run schema/migration validation without applying it to production.
- [ ] Re-run GitNexus change-impact analysis and inspect affected CRM, contract, payment, and payroll flows.
- [ ] Review the final diff and verify no new implementation identifiers/comments contain Vietnamese text.
- [ ] Report exact test counts, failures, build status, migration status, and any pre-existing failures.
