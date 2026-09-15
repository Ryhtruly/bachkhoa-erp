# Cashflow Archived Voucher Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep cancelled and rejected cashflow vouchers printable for audit/archive purposes while clearly marking them as non-posting documents.

**Architecture:** Reuse the existing voucher print component and status data already returned by the finance API. Add one small status-to-print-metadata helper, pass the status through both print entry points, show a status badge in the voucher list, and render a prominent archive warning in the A4 template. The cashflow ledger print filter remains unchanged.

**Tech Stack:** React, Vitest, Testing Library, existing finance print utilities.

**Spec:** Approved in chat on 2026-09-15: allow printing for `CANCELLED`/`REJECTED`, label the output as an archived/non-posting voucher, and continue excluding those statuses from the cashflow ledger print.

## Global Constraints

- Do not modify or stage unrelated existing working-tree changes.
- Preserve the existing finance ledger behavior that excludes rejected, cancelled, and pending transactions from printed ledger rows.
- Accept canonical English status values and the current Vietnamese labels at the UI boundary.
- Do not add a backend migration or change authorization behavior.

---

### Task 1: Add regression coverage for archived voucher print metadata

**Files:**
- Create: `dev/frontend/src/components/finance/screens/voucherPrintStatus.test.js`
- Modify: `dev/frontend/src/components/finance/screens/cashflowPrintUtils.js`

**Interfaces:**
- Produces `getVoucherPrintStatus(status)` returning `null` for normal statuses and `{ key, label, title, message }` for `REJECTED`/`CANCELLED` aliases.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from 'vitest';
import { getVoucherPrintStatus } from './cashflowPrintUtils';

describe('voucher print status metadata', () => {
  it('marks rejected and cancelled vouchers as archived non-posting documents', () => {
    expect(getVoucherPrintStatus('REJECTED')).toMatchObject({ key: 'REJECTED', label: 'TỪ CHỐI' });
    expect(getVoucherPrintStatus('Đã hủy')).toMatchObject({ key: 'CANCELLED', label: 'ĐÃ HỦY' });
  });

  it('does not mark completed vouchers as archived', () => {
    expect(getVoucherPrintStatus('COMPLETED')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/finance/screens/voucherPrintStatus.test.js`
Expected: FAIL because `getVoucherPrintStatus` is not yet exported.

- [ ] **Step 3: Write minimal implementation**

Add the status metadata helper to `cashflowPrintUtils.js`, normalizing canonical English values and the existing Vietnamese labels without changing `isCountedTransaction`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/finance/screens/voucherPrintStatus.test.js`
Expected: PASS.

### Task 2: Display archived status in voucher print flows

**Files:**
- Modify: `dev/frontend/src/components/finance/screens/PrintVoucherScreen.jsx`
- Modify: `dev/frontend/src/components/finance/modals/CashflowDetailModal.jsx`
- Modify: `dev/frontend/src/components/finance/screens/PrintVoucherScreen.css`

**Interfaces:**
- `VoucherTemplate` consumes an optional `status` prop.
- `PrintVoucherScreen` passes the selected transaction status.
- `CashflowDetailModal` passes the detail status.

- [ ] **Step 1: Add component assertions for status stamp and list badge**

Extend the existing finance screen test coverage so a `REJECTED` or `CANCELLED` transaction renders the archived/non-posting message and status badge, while completed output keeps the normal print label.

- [ ] **Step 2: Run focused tests to verify the new assertions fail**

Run: `npm run test -- src/components/finance/screens/FinanceScreensMatrix.test.jsx src/components/finance/screens/voucherPrintStatus.test.js`
Expected: FAIL on the new status-rendering assertions.

- [ ] **Step 3: Implement the minimal UI change**

Pass `status` into both `VoucherTemplate` usages. In `VoucherTemplate`, render a prominent printable banner only for rejected/cancelled statuses. In the print sidebar, show the localized status badge for those records. Change the action text to `In bản lưu` when the selected voucher is archived. Keep the existing list contents and ledger print filter unchanged.

- [ ] **Step 4: Run focused tests and build**

Run: `npm run test -- src/components/finance/screens/FinanceScreensMatrix.test.jsx src/components/finance/screens/voucherPrintStatus.test.js`
Expected: PASS.

Run: `npm run build`
Expected: exit code 0.

### Task 3: Verify the scoped change

**Files:**
- Verify only: `dev/frontend/src/components/finance/screens/PrintVoucherScreen.jsx`, `dev/frontend/src/components/finance/modals/CashflowDetailModal.jsx`, `dev/frontend/src/components/finance/screens/cashflowPrintUtils.js`, `dev/frontend/src/components/finance/screens/voucherPrintStatus.test.js`, `dev/frontend/src/components/finance/screens/PrintVoucherScreen.css`

- [ ] **Step 1: Run the full frontend test suite**

Run: `npm run test`
Expected: all existing and new frontend tests pass.

- [ ] **Step 2: Run lint and whitespace checks**

Run: `npm run lint`
Expected: exit code 0; report any pre-existing warnings separately.

Run: `git diff --check`
Expected: no whitespace errors.

- [ ] **Step 3: Review the final diff and working tree**

Run: `git diff --stat -- <listed files>` and `git status --short`
Expected: only the scoped files are changed by this task; unrelated user changes remain untouched.
