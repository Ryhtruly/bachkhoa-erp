# Cashflow Contract Linkage Checkbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow optional contract/project linkage for expense vouchers while enforcing customer-to-contract-to-project consistency in the backend.

**Architecture:** Keep the linkage checkbox as frontend form state, with non-null `contract_id`/`project_id` remaining the persisted source of truth. Add `customer_id` to the request contract for reliable validation and expose it from the finance lookup endpoints; do not add a separate database boolean. Income vouchers in the cashbook remain non-contract transactions and continue to use the debt-collection flow for contract receipts.

**Tech Stack:** React, Vitest, FastAPI, Pydantic, SQLAlchemy, pytest.

**Spec:** Approved in chat on 2026-09-14.

## Global Constraints

- Preserve all existing uncommitted user changes outside the cashflow linkage scope.
- The backend is authoritative; frontend filtering must not replace backend validation.
- `Chi thụ lý bản vẽ & Trích lục` and `Chi hoàn trả khách hàng` require linkage.
- Contract income from the cashbook remains rejected and must use Thu công nợ.
- Do not commit or push during this task.

---

### Task 1: Add failing backend coverage for linkage rules

**Files:**
- Modify: `dev/backend/src/test_finance_comprehensive_matrix.py`
- Modify: `dev/backend/tests/test_finance.py` only if a focused fixture-based test belongs there

**Interfaces:**
- Consumes: `FinanceService.create_cashflow` and `CashflowIn`.
- Produces: Regression coverage for valid optional linkage, customer mismatch, project/contract mismatch, and mandatory refund linkage.

- [x] **Step 1: Add tests for valid and invalid linkage cases**

Cover these exact cases:

```python
def test_expense_without_linkage_is_allowed_for_non_contract_category(): ...
def test_expense_contract_must_belong_to_selected_customer(): ...
def test_expense_project_must_belong_to_selected_contract(): ...
def test_customer_refund_requires_contract_or_project(): ...
```

The tests must use two customers, one contract per customer, and service lines attached to those contracts. Use `customer_id` in the payload when the selected counterparty is a known customer. Assert the expected HTTP 400 detail and verify no transaction was persisted after a rejected request.

- [x] **Step 2: Run only the new tests and verify they fail**

Run from `dev/backend`:

```powershell
pytest -q src/test_finance_comprehensive_matrix.py -k "linkage or contract_must_belong or project_must_belong or customer_refund"
```

Expected: the new mismatch and mandatory-refund tests fail against the current implementation.

### Task 2: Add request-level customer identity and lookup metadata

**Files:**
- Modify: `dev/backend/src/finance/schemas.py`
- Modify: `dev/backend/src/finance/repository.py`
- Modify: `dev/backend/src/routes/routes_finance.py`

**Interfaces:**
- Consumes: existing `/api/finance/contracts` and `/api/finance/projects` response shapes.
- Produces: `CashflowIn.customer_id: Optional[str]`, contract lookup `customer_id`, and project lookup `customer_id`.

- [x] **Step 1: Extend `CashflowIn` with optional `customer_id`**

Keep it optional for backward compatibility with existing internal callers and free-text employee/vendor payees.

- [x] **Step 2: Include `customer_id` in contract lookup rows**

Expose only the identifier already needed for filtering; do not expose additional salary or sensitive customer fields. Preserve the existing non-director response allowlist by adding only `customer_id`.

- [x] **Step 3: Include `customer_id` in project lookup rows**

Derive it from the project’s parent contract when present. Keep `contract_id` and `label` unchanged.

- [x] **Step 4: Run lookup and schema tests**

Run:

```powershell
pytest -q tests/test_finance.py
```

Expected: existing finance endpoint tests pass.

### Task 3: Enforce backend linkage consistency

**Files:**
- Modify: `dev/backend/src/finance/services.py`
- Modify: `dev/backend/src/finance/domain_rules.py` only if a reusable validation helper is needed

**Interfaces:**
- Consumes: `payload.customer_id`, `payload.contract_id`, `payload.project_id`, and category.
- Produces: deterministic validation before balance mutation or transaction persistence.

- [x] **Step 1: Remove the name-only “customer has any contract” rejection**

Do not reject an unlinked expense merely because the payer/payee text matches a customer with a contract. This permits legitimate non-contract expenses and prevents the previous receipt regression. Remove the duplicated validation block while preserving contract-income rejection.

- [x] **Step 2: Validate contract ownership when `customer_id` is supplied**

Reject an expense when the selected contract’s `customer_id` differs from the selected customer. Continue allowing employee/vendor free-text expenses without customer ownership validation.

- [x] **Step 3: Validate project/contract consistency**

Reject a supplied project when its parent `contract_id` differs from the supplied contract. If a project is supplied without a contract, derive the parent contract. Do not auto-select an arbitrary first project when the user selected a contract only; contract-only linkage must remain contract-only.

- [x] **Step 4: Enforce mandatory categories**

Require at least one linkage for both `Chi thụ lý bản vẽ & Trích lục` and `Chi hoàn trả khách hàng`. Apply this before cash-balance checks and before persistence.

- [x] **Step 5: Run the focused backend tests**

Run:

```powershell
pytest -q src/test_finance_comprehensive_matrix.py -k "income_lifecycle or expense_and_constraints or linkage or contract_must_belong or project_must_belong or customer_refund"
```

Expected: all focused tests pass.

### Task 4: Implement the checkbox and dependent selectors

**Files:**
- Modify: `dev/frontend/src/components/finance/modals/CashflowModal.jsx`
- Modify: `dev/frontend/src/components/finance/screens/PrintVoucherScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/PrintVoucherScreen.css`
- Modify: `dev/frontend/src/components/finance/modals/*.css` only if the existing design system has a dedicated modal stylesheet for this component

**Interfaces:**
- Consumes: lookup rows containing `customer_id` and `contract_id`.
- Produces: an expense form with optional linkage, mandatory locked linkage, customer-filtered contracts, and contract-filtered projects.

- [x] **Step 1: Track selected customer identity separately from display text**

When a suggestion is selected, preserve `customer_id` and counterparty type. Clear the ID when the text is edited to a different value. Keep employee/vendor free-text behavior unchanged.

- [x] **Step 2: Add positive checkbox wording**

Render `Liên kết với hợp đồng / hạng mục` only for expense vouchers. Use a checked-and-disabled state for the two mandatory categories. Use an explanatory note for optional linkage.

- [x] **Step 3: Filter options**

Filter contracts by selected `customer_id` for a known customer; filter projects by selected contract and customer. Clear incompatible selections when the customer or contract changes. Selecting a project derives its parent contract and makes the relationship unambiguous.

- [x] **Step 4: Submit consistent payloads**

Send `customer_id` for a known customer and send null linkage IDs when the checkbox is unchecked. Keep all income linkage IDs null.

- [x] **Step 5: Add UI tests**

Cover:

```jsx
it('hides linkage fields and submits null ids when optional linkage is off', ...)
it('locks linkage on for mandatory categories', ...)
it('filters contracts by selected customer and projects by selected contract', ...)
```

### Task 5: Full verification and scope review

**Files:**
- No additional files expected.

- [x] **Step 1: Run focused frontend tests**

```powershell
npm run test -- --run src/components/finance/modals/CashflowModal.test.jsx
```

- [x] **Step 2: Run backend finance regression tests**

```powershell
pytest -q tests/test_finance.py src/test_finance_comprehensive_matrix.py
```

- [x] **Step 3: Run targeted frontend lint and build**

```powershell
npx oxlint src/components/finance/screens/PrintVoucherScreen.jsx src/components/finance/modals/CashflowModal.jsx src/components/finance/modals/CashflowModal.test.jsx
npm run build
```

The repository-wide lint command still reports pre-existing warnings outside this
scope; the touched finance files pass targeted lint.

- [x] **Step 4: Inspect the final diff and GitNexus change impact**

Run `git diff --check`, `git status --short`, and GitNexus `detect_changes({scope: "unstaged", repo: "bachkhoa-erp"})`. Confirm that only the approved cashflow lookup, schema, service, modal, test, and plan files changed.
