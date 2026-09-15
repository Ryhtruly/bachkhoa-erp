# Cashflow Print and Export Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Thu Chi Sổ Quỹ print/export flows explicit, internally consistent, and safe for pending, cancelled, and rejected vouchers.

**Architecture:** Reuse the existing voucher/report print components and finance repository query path. Add status metadata for pending drafts, use the same transaction-date fallback in monthly reports as in the ledger, and extend report models with opening/closing balances and department detail where those values are already available. Avoid changing the high fan-out `get_running_balance` method; period-report balance context must use a separate, narrowly scoped query/helper.

**Tech Stack:** React, Vitest, Testing Library, FastAPI, SQLAlchemy, PostgreSQL, openpyxl.

**Spec:** Approved in chat on 2026-09-15 from the print/export review: pending vouchers must be visibly draft-only; monthly filtering must be consistent; cash/bank printouts need balance reconciliation; monthly A4/Excel should include department allocation; and partial print-list load failures must be visible.

## Global Constraints

- Do not modify, stage, commit, or revert unrelated working-tree changes.
- Preserve role restrictions: accountant output remains expense-only; income-bearing monthly export remains director-only.
- Preserve the rule that pending, rejected, and cancelled transactions are excluded from posted ledger totals and ledger print rows.
- Do not add a new export endpoint for transaction-level Excel in this task; document that as a separate follow-up if still absent.
- Keep current browser print/Save-as-PDF behavior and existing company/signature templates.

---

### Task 1: Add failing tests for print/report contracts

**Files:**
- Modify: `dev/frontend/src/components/finance/screens/voucherPrintStatus.test.js`
- Modify: `dev/frontend/src/components/finance/screens/PrintVoucherScreen.archived.test.jsx`
- Modify: `dev/backend/tests/test_finance_export.py`
- Create or modify focused repository test file as needed for monthly-date fallback.

- [ ] Add tests for pending draft metadata and button/banner wording.
- [ ] Add a backend regression test proving a completed transaction with null `transaction_date` and in-month `created_at` is included in the monthly dashboard.
- [ ] Add export assertions for department detail and the posted-status note if the exporter contract is extended.
- [ ] Run focused tests and confirm each new test fails for the intended missing behavior.

### Task 2: Implement pending status and resilient print-list loading

**Files:**
- Modify: `dev/frontend/src/components/finance/screens/cashflowPrintUtils.js`
- Modify: `dev/frontend/src/components/finance/screens/PrintVoucherScreen.jsx`
- Modify: `dev/frontend/src/components/finance/modals/CashflowDetailModal.jsx`

- [ ] Add `PENDING` print metadata as a non-posting draft status.
- [ ] Show `In bản dự thảo` and a visible warning in both voucher print entry points.
- [ ] Keep rejected/cancelled archive behavior unchanged.
- [ ] Surface a failed cashflow list request instead of silently showing an empty list while preserving best-effort loading for auxiliary data.
- [ ] Run the focused frontend tests and verify green.

### Task 3: Align monthly data and extend report content

**Files:**
- Modify: `dev/backend/src/finance/repository.py`
- Modify: `dev/frontend/src/components/finance/screens/CashflowScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/MonthlyDashboardScreen.jsx`
- Modify: `dev/frontend/src/components/finance/print/FinancePrintReport.jsx` only if a reusable report field is needed.
- Modify: `dev/backend/src/finance/excel_exporter.py`

- [ ] Use transaction date with created-at fallback in monthly dashboard selection.
- [ ] Pass narrowly scoped opening/closing balance context into cash/bank ledger printouts and show the posted-status scope; do not modify `get_running_balance`.
- [ ] Include department allocation in the monthly A4 report and Excel export, or make the report scope explicit if the data shape prevents a safe extension.
- [ ] Keep accountant reports free of income fields.
- [ ] Run backend and frontend focused tests.

### Task 4: Verify the complete scoped change

- [ ] Run the relevant frontend finance test set.
- [ ] Run the relevant backend finance/export test set using the configured disposable `TEST_DATABASE_URL`.
- [ ] Run frontend build and lint if touched files permit it.
- [ ] Run `git diff --check`.
- [ ] Review `git diff` and `git status --short`; do not commit or push.
