# Accounting UAT Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix only the accounting/Thu Chi Sổ Quỹ defects confirmed by the 12/09/2026 UAT: invalid contract values entering finance, missing receivables, misleading payroll payment state, and unsafe K06 financial gating.

**Architecture:** Keep the existing FastAPI/SQLAlchemy finance repository and service boundaries. Validate issued contract money before any contract-to-finance side effect, make receivables contract-driven while deriving paid money from approved cashflow, and keep the current payroll `mark-paid` action as an external-payment acknowledgement until a separate internal payroll payment flow is approved. Add a narrow frontend guard for user feedback; backend remains authoritative.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy/PostgreSQL, Redis cache, React, Vitest, pytest.

**Spec:** `BAO_CAO_UAT_BACH_KHOA_2026-09-12.md`, filtered to BK-01, BK-02, BK-07 and the financial portion of K06.

## Global Constraints

- Do not modify KPI, workflow template topology, Document Register, customer identifier validation, contract document templates, or unrelated finance screens.
- Do not delete or rewrite UAT evidence, including `015/BK-2026`; preserve it for audit and quarantine invalid data only through an explicit migration/repair step.
- Issued/closed contracts must have a strictly positive monetary value; zero may remain valid only for a non-issued draft if an existing draft flow requires it.
- Approved cashflow transactions are the source of truth for money actually received or paid; pending, rejected, voided and cancelled transactions are excluded.
- `mark-paid` remains an acknowledgement of payment outside the cashbook in this patch; it must not silently create a cashflow transaction.
- K06 must reject invalid contract totals and must not trust client-side completion flags.
- Every production change gets a regression test before implementation and fresh verification before completion.

---

### Task 1: Add failing regression tests for contract money integrity and K06

**Files:**
- Create: `dev/backend/tests/test_accounting_contract_money_integrity.py`
- Inspect/extend: `dev/backend/tests/test_handover_override_gate_unittest.py`
- Inspect/extend: `dev/backend/src/test_crm_contract_integration.py`

**Interfaces:**
- The tests call the existing `update_lead_status()` and `debt_summary()` paths.
- Expected invalid input is an HTTP 422/400 before `Contract`, `ServiceLine`, `Receivable`, document and lead-status side effects are committed.

- [ ] **Step 1: Write a failing test for CRM close with a negative amount.**

  Create a real test lead/customer using the repository fixture pattern, call `update_lead_status()` with `price="-1"`, and assert the call raises a client error. Assert no contract, service line, receivable or generated document was committed and the lead remains in its prior status.

- [ ] **Step 2: Write a failing test for zero and malformed issued-contract amounts.**

  Parameterize `"0"`, `""`, `"abc"`, and a negative value. Assert each invalid issued-contract attempt is rejected before finance rows are created. Keep the existing positive `18_000_000` integration test unchanged.

- [ ] **Step 3: Run only the new tests and confirm they fail for the missing validation.**

  Run from `dev/backend`:

  ```powershell
  pytest -q tests/test_accounting_contract_money_integrity.py
  ```

  Expected result before implementation: the negative/zero cases fail because the current route creates the contract.

- [ ] **Step 4: Add failing unit cases for `debt_summary()` with a negative total.**

  Assert that a negative total is rejected rather than returned with `is_settled=True` and `gate_open=True`.

- [ ] **Step 5: Run the focused K06 test and confirm the failure is the unsafe negative-total gate.**

  Run:

  ```powershell
  pytest -q tests/test_handover_override_gate_unittest.py -k "negative or debt or gate"
  ```

---

### Task 2: Implement server-side positive issued-contract validation

**Files:**
- Create/modify: `dev/backend/src/core/finance_validation.py`
- Modify: `dev/backend/src/routes/routes_crm.py:121-269`
- Modify: `dev/backend/src/contracts/schemas.py`
- Modify: `dev/backend/src/contracts/services.py` at direct contract creation boundaries
- Modify: `dev/backend/src/dossiers/handover.py:84-157`
- Modify: `dev/backend/src/finance/services.py` at payment finalization boundaries
- Modify: `dev/frontend/src/pages/CRM.jsx` at the close-deal amount field

**Interfaces:**
- Add `parse_issued_money(value, field_name="contract_value") -> Decimal` in `finance_validation.py`.
- The helper accepts user-entered Vietnamese separators, returns a two-decimal `Decimal`, and raises `HTTPException(status_code=422, ...)` when the issued value is missing, non-numeric or `<= 0`.
- All financial calculations convert only at the existing database boundary; do not use float for validation decisions.

- [ ] **Step 1: Implement the minimal validation helper after the tests are red.**

  Normalize whitespace and separators consistently with the current CRM input, reject malformed signs/characters, quantize to cents, and require `amount > 0` for issued contracts. Keep error text actionable and Vietnamese.

- [ ] **Step 2: Validate CRM input before any side effect.**

  In `update_lead_status()`, parse and validate the amount before changing `lead.status`, allocating contract-side data, rendering a document, creating a `Contract`, creating a `ServiceLine`, creating a `Receivable`, or updating an intake submission. Preserve the existing positive path and response shape.

- [ ] **Step 3: Add schema constraints to direct contract APIs.**

  Apply `Field(gt=0)` or the shared validator to issued `contract_value` fields in `ContractCreateSchema` and `ContractGenerateSchema`, while preserving any explicitly draft-only flow.

- [ ] **Step 4: Guard financial gate and finalization against invalid persisted data.**

  Make `debt_summary()` and `_finalize_contract_after_full_payment()` fail closed for `total_value <= 0` instead of clamping the debt to zero. Return a domain error that identifies the invalid contract and prevents K06 completion.

- [ ] **Step 5: Add the frontend guard.**

  Set `min="1"`, show an inline error for non-positive values, and avoid submitting the close form when invalid. Keep the backend response as the authoritative guard.

- [ ] **Step 6: Run the focused red tests again and confirm green.**

  ```powershell
  pytest -q tests/test_accounting_contract_money_integrity.py tests/test_handover_override_gate_unittest.py -k "negative or debt or gate"
  ```

---

### Task 3: Make receivables contract-driven and reconcile approved cashflow

**Files:**
- Create: `dev/backend/tests/test_receivables_reconciliation.py`
- Modify: `dev/backend/src/finance/repository.py:396-502`
- Modify: `dev/backend/src/routes/routes_finance.py:269-300`
- Modify: `dev/backend/src/routes/routes_dashboard.py:42-124`
- Modify: `dev/backend/src/finance/services.py:908-925`
- Modify: `dev/backend/src/db/models/finance.py` only if a post-audit unique constraint is safe
- Create: `supabase/migrations/20260912120000_receivables_contract_reconciliation.sql` only after duplicate audit

**Interfaces:**
- `list_receivables_formatted(db)` returns one row for every valid contract with a positive total and a receivable obligation, including contracts without a pre-existing `Receivable` row.
- Paid amount is derived from approved income cashflow for read/report consistency; pending/rejected/voided rows are excluded.
- `Receivable` remains a projection for due dates, write-offs, refunds and carry-forward metadata.

- [ ] **Step 1: Write a failing test for a contract without a `Receivable` row.**

  Seed two contracts, including an AUTO-style ID, create a receivable for only one, add no payment to the second, call the repository method, and assert both contract IDs are returned with the second showing its full remaining amount.

- [ ] **Step 2: Write a failing test for approved versus pending cashflow.**

  Seed approved, pending, rejected and voided income transactions for one contract. Assert only the approved amount contributes to `paid_amount` and `remaining_amount`.

- [ ] **Step 3: Run the focused reconciliation tests and confirm the missing-row failure.**

  ```powershell
  pytest -q tests/test_receivables_reconciliation.py
  ```

- [ ] **Step 4: Change the repository query to start from contracts and left-join receivable metadata.**

  Preserve status flags, refunds, write-offs and carry-forward fields when a projection exists. For a missing projection, return a deterministic finance row without mutating the database during a GET.

- [ ] **Step 5: Use one approved-cashflow aggregation for dashboard and finance contract totals.**

  Remove the current split where one screen sums `CashflowTransaction` and another sums `Receivable.paid_amount`. Keep cache keys and invalidate finance/dashboard caches after approved, voided or reversed cashflow changes.

- [ ] **Step 6: Add a read-only reconciliation query/service.**

  It must report missing projections, duplicate projections, contract totals, approved paid totals and remaining differences. It must not delete or silently rewrite UAT rows.

- [ ] **Step 7: Audit duplicates before adding the database constraint.**

  Run the audit query against PostgreSQL. Only if no duplicates remain should a unique constraint on `receivables.contract_id` be added through a migration. Do not run a destructive cleanup automatically.

- [ ] **Step 8: Run focused repository, dashboard and finance tests.**

  ```powershell
  pytest -q tests/test_receivables_reconciliation.py tests/test_finance_comprehensive_matrix.py
  ```

---

### Task 4: Make payroll payment state explicit without creating duplicate money

**Files:**
- Create/modify: `dev/backend/tests/test_payroll_payment_state.py`
- Modify: `dev/backend/src/finance/services.py:1231-1260`
- Modify: `dev/backend/src/routes/routes_finance.py:562-575`
- Modify: `dev/frontend/src/components/finance/screens/PayrollOfficeScreen.jsx`
- Modify: `dev/frontend/src/features/employee-portal/MyPayroll.jsx` only if the shared API status copy requires it

**Interfaces:**
- `mark-paid` remains an acknowledgement of payment outside the cashbook in this patch.
- The API response exposes an explicit `payment_source`/`cashflow_recorded` semantic rather than falsely implying a ledger expense.
- The UI displays “Đã xác nhận chi trả ngoài sổ” when no cashflow transaction is linked; it must not display “Đã chi trả” as a cashbook fact.

- [ ] **Step 1: Write a failing test for the current misleading state.**

  Call the payroll period transition with no linked cashflow transaction and assert the desired response has `cashflow_recorded=False` and the external-confirmation status/copy.

- [ ] **Step 2: Run the focused test and confirm the current response lacks the explicit semantic.**

  ```powershell
  pytest -q tests/test_payroll_payment_state.py
  ```

- [ ] **Step 3: Add the explicit external-payment metadata and copy.**

  Preserve the existing permission and locked-period rule. Do not create a cashflow transaction in this change. Ensure cache invalidation remains unchanged.

- [ ] **Step 4: Update finance UI labels and explanatory copy.**

  Distinguish estimated, locked, externally confirmed and cashbook-recorded states. Keep employee self-payroll access self-scoped.

- [ ] **Step 5: Run finance/payroll tests and the focused frontend tests.**

  ```powershell
  pytest -q tests/test_payroll_payment_state.py tests/test_kpi_and_employee_payroll_hardening.py
  npm --prefix ../frontend run test -- --run src/components/finance/screens/PayrollOfficeScreen.test.jsx src/features/employee-portal/MyPayroll.test.jsx
  ```

---

### Task 5: Regression and final scope verification

**Files:**
- Inspect only: all changed files above
- No UAT evidence files, PDFs or `tmp/` files may be staged by this task.

- [ ] **Step 1: Run the complete backend finance/K06/payroll subset.**

  ```powershell
  pytest -q tests/test_accounting_contract_money_integrity.py tests/test_receivables_reconciliation.py tests/test_payroll_payment_state.py tests/test_handover_override_gate_unittest.py tests/test_kpi_and_employee_payroll_hardening.py
  ```

- [ ] **Step 2: Run frontend lint, targeted tests and build.**

  ```powershell
  npm --prefix ../frontend run lint
  npm --prefix ../frontend run test -- --run
  npm --prefix ../frontend run build
  ```

- [ ] **Step 3: Run `git diff --check` and inspect the diff/status.**

  Confirm only accounting backend/frontend/test/migration/plan files are changed; do not stage UAT evidence, PDFs, `tmp/`, KPI or unrelated modules.

- [ ] **Step 4: Run GitNexus `detect_changes({scope: "unstaged"})` and review affected flows.**

  Because the repository index is stale, compare the result with direct source and test inspection; do not treat a stale empty result as proof of no impact.

- [ ] **Step 5: Report exact verification results and any PostgreSQL-only checks that remain.**

  Do not claim the AUTO data repair is complete until the read-only PostgreSQL audit and the UAT API/screens are rechecked.
