# Finance Income and Expense Role Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce that the director owns income and receivables while accounting owns expense operations under director approval, including safe expense-only views and cash-balance visibility.

**Architecture:** Add a backend finance-visibility policy based on the canonical `admin` and `accountant` roles. Apply that policy at every mixed finance read/write route and in the service layer, then adapt the existing finance navigation and screens to the same role matrix. Keep the employee advance-request flow and split settlement differences into pending income or pending expense vouchers.

**Tech Stack:** FastAPI, SQLAlchemy, existing finance services/repositories, React, Vitest, pytest, existing RBAC tables.

**Spec:** `docs/superpowers/specs/2026-09-14-finance-income-expense-role-split.md`

## Global Constraints

- Director sees all income and expense data.
- Accountant never receives income, receivables, revenue, profit, or customer-refund data from backend APIs.
- Accountant receives current cash/bank balances and expense totals needed to operate payments.
- Accountant-created expense vouchers remain pending until director approval.
- Preserve employee advance requests and official voucher issuance after director approval.
- Do not change CRM, workflow, payroll, KPI, legal, or unrelated RBAC behavior.
- Preserve existing user changes; do not stage, commit, or push during implementation.

---

### Task 1: Add backend policy regression tests

**Files:**
- Create: `dev/backend/tests/test_finance_income_expense_policy.py`
- Test fixtures: `dev/backend/tests/conftest.py`
- Read for patterns: `dev/backend/tests/test_accounting_policy_api.py`, `dev/backend/tests/test_auth_rbac.py`

**Interfaces:**
- Tests will exercise the real route/service boundaries with the existing disposable test database fixture.
- The expected policy is that accountant reads are expense-only, director reads are unrestricted, and accountant cannot create income.

- [ ] Write failing tests for accountant access to the mixed cashflow endpoint with an income and an expense row; assert only the expense row is returned.
- [ ] Write failing tests for accountant access to cash/bank balance responses; assert balance and expense totals remain while income totals and income rows are absent.
- [ ] Write failing tests for director access; assert both income and expense rows remain visible.
- [ ] Write failing tests that accountant income creation/update is rejected and accountant expense creation remains pending.
- [ ] Write failing tests that accountant cannot access receivables/refund endpoints while director can.
- [ ] Write failing tests for advance settlement: positive difference creates pending income, negative difference creates pending expense, zero difference creates no voucher.
- [ ] Run the focused test file and confirm the failures are caused by the missing policy, not by fixture setup.

### Task 2: Implement backend finance visibility and write policy

**Files:**
- Modify: `dev/backend/src/finance/access.py`
- Modify: `dev/backend/src/routes/routes_finance.py`
- Modify: `dev/backend/src/routes/routes_finance_export.py`
- Modify: `dev/backend/src/finance/repository.py`
- Modify: `dev/backend/src/finance/services.py`
- Modify: `dev/backend/src/core/auth.py` only if a shared dependency is required

**Interfaces:**
- Add one finance policy helper with explicit director/accountant visibility, rather than duplicating role checks in each route.
- Route filters must be server-enforced and must not trust `type=INCOME` supplied by the client.

- [ ] Implement the policy helper using the canonical active `admin`/`accountant` roles and existing `is_director`/`is_accountant_user` conventions.
- [ ] Apply expense-only filtering to cashflow list/detail, cash/bank ledger, advance/payables, and relevant export paths for accountants.
- [ ] Preserve full responses for directors.
- [ ] Return current cash/bank balance and expense totals to accountants without income totals or income detail rows.
- [ ] Sanitize contract lookup responses used by expense forms so accountants receive identifiers and labels but not contract total/paid/remaining amounts.
- [ ] Restrict receivables, collection, customer-refund, revenue, profit, and income-only endpoints to directors.
- [ ] Enforce create/update policy in the service layer: accountant may create/update expense-family transactions only; income is director-only; approvals remain director-only.
- [ ] Change settlement voucher creation so positive differences create pending income and negative differences create pending expense; preserve exact-settlement behavior.
- [ ] Keep accountant official advance issuance restricted to director-approved advance requests.
- [ ] Run focused backend tests and the existing finance/accounting/auth RBAC tests.

### Task 3: Align frontend navigation and finance screens

**Files:**
- Modify: `dev/frontend/src/components/finance/FinanceNav.jsx`
- Modify: `dev/frontend/src/pages/Cashflow.jsx`
- Modify: `dev/frontend/src/components/finance/screens/CashflowScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/ReceivablesScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/AdvanceRequestScreen.jsx`
- Modify: relevant monthly dashboard/print/export screens only where response fields are currently assumed
- Tests: existing finance screen matrix plus new focused role-visibility tests

**Interfaces:**
- Preserve existing `isDirector` prop contract; add only the smallest role/visibility prop or derived policy needed.
- UI is a presentation layer; backend remains authoritative.

- [ ] Hide collection, receivables, and customer-refund navigation/actions from accountants.
- [ ] Keep expense ledger, payables, advance, settlement, cash/bank balance, and expense-only reporting available to accountants.
- [ ] Show the director income and expense actions; show accountants only the expense action.
- [ ] Hide income KPI cards, income columns, profit/revenue charts, and income filters for accountants while retaining balance and expense totals.
- [ ] Ensure direct deep links from stale tabs fall back to an allowed expense screen instead of rendering a collection screen.
- [ ] Update print/export controls so accountants print expense-only data and directors can print the full ledger.
- [ ] Add/adjust Vitest coverage for director/accountant navigation and action visibility.

### Task 4: Verify scope and security

**Files:**
- No additional source files expected.

- [ ] Run `git diff --check`.
- [ ] Run backend focused finance/RBAC tests with a permitted disposable `TEST_DATABASE_URL`.
- [ ] Run frontend test suite, lint, and production build.
- [ ] Run GitNexus impact analysis for changed shared symbols and `detect_changes()` before any commit; report stale-index limitations if present.
- [ ] Review `git status --short --branch` and confirm no unrelated changes were staged or overwritten.
- [ ] Do not commit or push unless separately requested.
