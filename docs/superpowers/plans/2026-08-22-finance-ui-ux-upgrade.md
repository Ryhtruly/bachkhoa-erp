# Finance UI/UX Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp an toàn UI/UX cho 13 tab của phân hệ Thu Chi Sổ Quỹ mà không thay đổi API, schema hoặc quyền nghiệp vụ.

**Architecture:** Củng cố UI primitives trước, sau đó sửa các lỗi P0 ở screen-level, rồi chuẩn hóa responsive/print theo từng nhóm. Các thay đổi behavior đều có regression test; các thay đổi CSS được kiểm tra bằng lint, build và breakpoint review.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, CSS hiện hữu, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-22-finance-ui-ux-upgrade-design.md`

## Global Constraints

- Không thay đổi schema, API contract hoặc quy trình phê duyệt backend.
- Không dùng `display: none` để che dữ liệu nghiệp vụ hoặc thay đổi quyền truy cập.
- Không xóa dữ liệu, dependency hay thay đổi Docker trong đợt này.
- Giữ `Select`/`DatePicker` hiện tại làm nền tảng.
- Responsive theo các mốc 1440, 1280, 1024, 768 và 390px.

---

### Task 1: Harden shared finance UI primitives

**Files:**
- Modify: `dev/frontend/src/components/ui/Modal.jsx`
- Modify: `dev/frontend/src/components/ui/DataTable.jsx`
- Modify: `dev/frontend/src/components/ui/FilterBar.jsx`
- Modify: `dev/frontend/src/index.css`
- Test: `dev/frontend/src/components/ui/Modal.styles.test.js`
- Test: `dev/frontend/src/components/ui/FilterBar.test.jsx`
- Test: `dev/frontend/src/components/ui/DataTable.test.jsx` (create if absent)

**Interfaces:** Preserve existing props. Add only optional accessibility/state props if needed; existing consumers must continue rendering without changes.

- [ ] Add failing tests for modal focus restoration/close guard, filter active-state semantics, and keyboard-accessible row interactions.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement the smallest shared behavior: restore body overflow safely, restore trigger focus, associate form labels, expose row keyboard interaction, and expose active filter state without changing data filtering.
- [ ] Add responsive shared styles for toolbar, table wrapper and filter chips without hiding content.
- [ ] Run focused tests and inspect changed CSS.

### Task 2: Fix P0 workflow regressions

**Files:**
- Modify: `dev/frontend/src/components/finance/screens/PayrollOfficeScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/AdvanceRequestScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/CashflowScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/ReceivablesScreen.jsx`
- Test: `dev/frontend/src/components/finance/screens/PayrollOfficeScreen.test.jsx` (create if absent)
- Test: `dev/frontend/src/components/finance/screens/AdvanceRequestScreen.test.jsx` (create if absent)

**Interfaces:** Keep all API URLs, payload keys and permission checks unchanged.

- [ ] Add a failing test proving payroll confirmation receives the visible warning, correct action label and loading state.
- [ ] Add a failing test proving empty employee/contract APIs do not render fake fallback options.
- [ ] Add a failing test proving Cashflow and Receivables expose retryable error states.
- [ ] Run focused tests and confirm failures.
- [ ] Map `SensitiveActionModal` props correctly and remove production fake-data fallback.
- [ ] Add inline retry/error states while preserving toast behavior and existing successful data flow.
- [ ] Run focused tests, then the existing finance matrix.

### Task 3: Improve finance screen layout and responsive behavior

**Files:**
- Modify: `dev/frontend/src/components/finance/screens/MonthlyDashboardScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/CashflowScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/AdvanceClearScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/PieceRatePricingScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/SettingsScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/SettingsScreen.css`
- Modify: `dev/frontend/src/pages/debtCollection.css`
- Modify: `dev/frontend/src/index.css`
- Test: Add focused screen tests only where behavior changes.

**Interfaces:** No API changes. Keep all existing screen IDs and navigation values.

- [ ] Add tests for dashboard responsive class/state output and distinct empty/error states where applicable.
- [ ] Replace fixed dashboard grids with semantic classes and breakpoint rules.
- [ ] Improve cashflow KPI semantics, toolbar/filter visibility and mobile table affordances.
- [ ] Improve advance-clear result affordances and pricing/settings mobile table behavior.
- [ ] Run focused screen tests and lint.

### Task 4: Print and voucher workflow polish

**Files:**
- Modify: `dev/frontend/src/components/finance/screens/PrintVoucherScreen.jsx`
- Modify: `dev/frontend/src/components/finance/screens/PrintVoucherScreen.print.css`
- Modify: `dev/frontend/src/components/finance/print/financeReport.print.css`
- Modify: `dev/frontend/src/components/finance/screens/PayrollOfficeScreen.css`
- Test: `dev/frontend/src/components/finance/print/printDocument.test.js`

**Interfaces:** Preserve `printElement` usage and existing print document data.

- [ ] Add regression assertions for print container visibility, signature layout and no runtime `window.print()` usage in finance screens.
- [ ] Add responsive preview styles and explicit A4/A5 print rules.
- [ ] Keep print-only content accessible to the print pipeline without using it to conceal runtime data.
- [ ] Run print tests and production build.

### Task 5: Full verification and scope review

**Files:**
- Review only: all changed files above and current worktree status.

- [ ] Run `npm run test -- --run` in `dev/frontend`.
- [ ] Run `npm run lint` and separate pre-existing warnings from new warnings.
- [ ] Run `npm run build` and record existing bundle warnings.
- [ ] Run `git diff --check` only on changed files.
- [ ] Run GitNexus `detect_changes({scope: "unstaged"})` and review affected finance flows.
- [ ] Report changed files, verification evidence and any remaining non-blocking items.
