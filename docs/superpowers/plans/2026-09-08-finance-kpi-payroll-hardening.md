# Finance, KPI, and Employee Payroll Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align KPI visibility, scoring, finance-role UX, and the employee self-payroll screen with the approved business rules without changing unrelated modules.

**Architecture:** Keep the existing legacy permission evaluator as the runtime authority, enforce director-only KPI access at the API boundary, and preserve the existing employee-portal identity lookup so salary data remains self-scoped. Derive employee payroll status from the persisted payroll-period status, invalidate the employee payroll cache when payroll changes, and make the UI copy/status rendering follow the backend contract.

**Tech Stack:** FastAPI, SQLAlchemy/PostgreSQL queries, React, Vitest, CSS media queries, GitNexus impact analysis.

**Spec:** Approved requirements in the current user request and the preceding Thu Chi/Sổ Quỹ + KPI + “Lương của tôi” review.

## Global Constraints

- KPI raw performance data is visible only to admin/Giám đốc; Kế toán receives payroll amounts and approved adjustments, not employee performance analytics.
- KPI is normalized to a maximum score of 100 in both calculation and presentation.
- Official advance vouchers and printed finance documents remain Accounting responsibilities; Director approves and supervises.
- Employee payroll endpoints must resolve the employee from the authenticated user and must not accept a client-selected employee identity.
- Do not remove or overwrite existing user changes; do not alter unrelated finance/workflow behavior.
- Use tests before production changes and run fresh verification before reporting completion.

### Task 1: Lock KPI API and normalize KPI data semantics

**Files:**
- Modify: `dev/backend/src/routes/routes_kpi.py`
- Modify: `dev/backend/src/core/kpi_engine.py`
- Modify: `dev/frontend/src/pages/KPI.jsx`
- Test: `dev/frontend/src/pages/KPI.test.jsx`

**Interfaces:**
- `GET /api/kpi/scores?month=YYYY-MM` remains the existing endpoint, but accepts only the canonical admin/Giám đốc actor.
- KPI rows with no completed work return a nullable/no-data on-time rate and render `—` rather than `100%`.
- KPI scores are clamped to `[0, 100]`; the UI remains a `/100` scale.

- [ ] **Step 1: Write failing tests** for director-only API dependency behavior, no-activity KPI rendering, maximum score 100, active-only analytics, and visible fetch error/retry state.
- [ ] **Step 2: Run the focused KPI tests and confirm they fail for the intended missing behavior.**
- [ ] **Step 3: Add a director-only dependency at the KPI route boundary using the existing canonical admin/director check; do not grant KPI access through `payroll.read`.**
- [ ] **Step 4: Change KPI engine no-activity output to no-data and clamp the final score to 100.**
- [ ] **Step 5: Update KPI rendering and analytics to use no-data placeholders, exclude zero-activity employees from top charts, and show an actionable error/retry panel.**
- [ ] **Step 6: Run the focused KPI tests and the existing finance/KPI tests; confirm all pass.**

### Task 2: Correct employee payroll period state and cache invalidation

**Files:**
- Modify: `dev/backend/src/employee_portal/service.py`
- Modify: `dev/backend/src/routes/routes_finance.py`
- Test: existing backend payroll/service test location discovered from the repository test layout, plus a focused regression test for current-period `Locked` and `Paid` states.

**Interfaces:**
- `EmployeePortalService._calculate_payroll_history()` returns `Open`, `Locked`, `Paid`, or an explicit no-period state based on `payroll_periods`, while retaining `is_current` as a separate flag.
- Chopping or paying a payroll period invalidates both finance/payroll caches and `bachkhoa:portal:payroll:*` employee self-payroll caches.

- [ ] **Step 1: Add a failing regression test** proving a current-month persisted `Locked` period is returned as `Locked` and a `Paid` period is returned as `Paid`.
- [ ] **Step 2: Add a failing cache-invalidation test** proving payroll period transitions invalidate the employee portal payroll namespace.
- [ ] **Step 3: Run those tests and confirm the current implementation fails because it forces the current month to `Open` and omits the portal cache prefix.**
- [ ] **Step 4: Derive period status from the persisted period row; use a distinct no-period value for a historical month that was never opened/locked instead of pretending it was locked.**
- [ ] **Step 5: Invalidate `bachkhoa:portal:payroll:*` after lock and mark-paid transitions.**
- [ ] **Step 6: Run the focused backend tests and relevant existing payroll tests.**

### Task 3: Make the employee “Lương của tôi” screen follow the contract

**Files:**
- Modify: `dev/frontend/src/features/employee-portal/MyPayroll.jsx`
- Modify: `dev/frontend/src/features/employee-portal/myPayroll.css`
- Modify: `dev/frontend/src/features/employee-portal/MyPayroll.test.jsx`
- Modify: `dev/frontend/src/index.css` only if the shared responsive hint needs a safe, narrow-screen rule.

**Interfaces:**
- The screen displays status from `payroll.status`: open/temporary, locked, paid, or no-period.
- The summary uses “Tổng lương”/“Tổng lương tạm tính” unless deductions are present in the API contract.
- The breakdown labels `Lương khoán` separately from approved `Thưởng / khấu trừ`.
- History rows remain selectable by mouse and keyboard.

- [ ] **Step 1: Add failing component tests** for current-month locked/paid labels, no-period history labeling, corrected salary copy, keyboard row selection, and awaited fallback loading behavior.
- [ ] **Step 2: Run the focused MyPayroll tests and confirm the new tests fail against the current status/copy/accessibility behavior.**
- [ ] **Step 3: Make the fetch fallback awaitable so loading does not finish before `/me` fallback resolves.**
- [ ] **Step 4: Render status from the backend status field and distinguish no-period from locked/paid states.**
- [ ] **Step 5: Update copy to avoid claiming net take-home pay or allowances that the API does not calculate.**
- [ ] **Step 6: Add keyboard semantics to selectable history rows and show the horizontal-scroll hint only at the narrow/mobile breakpoint.**
- [ ] **Step 7: Run MyPayroll tests and the broader frontend finance test set.**

### Task 4: Align finance navigation/copy and shared responsive hints

**Files:**
- Modify: `dev/frontend/src/components/finance/FinanceNav.jsx`
- Modify: `dev/frontend/src/pages/KPI.jsx`
- Modify: `dev/frontend/src/components/finance/screens/DebtCollection.jsx`
- Modify: `dev/frontend/src/components/finance/screens/AdvanceRequestScreen.jsx` if the navigation/form copy is owned there.
- Modify: `dev/frontend/src/components/finance/screens/PayrollOfficeScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/PieceRatePayrollScreen.jsx`
- Modify: `dev/frontend/src/index.css`
- Test: the existing finance screen tests plus focused copy/responsive assertions.

**Interfaces:**
- “Chứng từ in” stays available to Accounting and hidden from the Director in the navigation.
- Advance wording describes employee proposal submission and Accounting’s official voucher creation rather than implying employees create official vouchers.
- Business-rule notes remain, but long title subtitles are shortened into legends/banners.
- Horizontal-scroll guidance appears only when the narrow layout needs it.

- [ ] **Step 1: Add failing assertions** for the advance wording, debt legend, payroll banners, and desktop-hidden/mobile-visible responsive hints.
- [ ] **Step 2: Run the focused finance tests and confirm the current copy/visibility assertions fail.**
- [ ] **Step 3: Update only the approved labels, legends, and responsive CSS; retain all business-rule warnings.**
- [ ] **Step 4: Run the finance screen and responsive tests.**

### Task 5: Full verification and change-scope review

**Files:**
- No new production files; inspect all changed files.

- [ ] **Step 1: Run frontend lint, targeted frontend tests, and frontend build.**
- [ ] **Step 2: Run backend focused tests that do not require PostgreSQL; report DB-dependent tests separately if unavailable.**
- [ ] **Step 3: Run `git diff --check` and inspect the complete diff.**
- [ ] **Step 4: Run GitNexus `detect_changes()` for the unstaged worktree and confirm only the planned KPI, finance, employee-payroll, tests, migration/permission, and plan files are affected.**
- [ ] **Step 5: Re-check `git status --short` and report exact files, test output, and any remaining PostgreSQL/live-browser verification gap.**
