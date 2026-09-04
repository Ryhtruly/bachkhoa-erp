# Wave 3 Task H: Integrate EmployeeWorkspaceCalendar into Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make EmployeeWorkspaceCalendar the main work view in the employee dashboard while retaining all existing held-item, pool, help/cancel, and EmployeeItemWorkspace behavior.

**Architecture:** Embed EmployeeWorkspaceCalendar at the top of EmployeeWorkspace (the component that already manages `openItemId` state and renders EmployeeItemWorkspace). The calendar renders above the existing load bar, held items, and pool sections. A new `hidePool` prop on EmployeeWorkspaceCalendar prevents the calendar's compact TaskPoolPanel from rendering (since EmployeeWorkspace already has the full Chain/Assist/Help pool with tabs and detail modals). No new components are created — we modify three existing files and update tests.

**Tech Stack:** React, Vitest, @testing-library/react, FullCalendar (mocked in tests)

## Global Constraints

- No backend changes
- No commit
- No unrelated refactoring
- Preserve all existing server-authoritative flows (start/submit/re-submit, pause/resume, rollback, shortage gates, help/cancel, notification deep-link)
- Use existing patterns and mocks from `EmployeeWorkspaceCalendar.test.jsx` and `EmployeePortalDashboard.test.jsx`

---

### Task 1: Add `hidePool` prop to EmployeeWorkspaceCalendar

**Files:**
- Modify: `dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.jsx:713-882`

**Interfaces:**
- Consumes: existing props (tasks, taskPool, dailySummary, onClaim, claimingKey, onRefresh, isDirector)
- Produces: new optional `hidePool` prop (boolean, default false) that skips rendering `TaskPoolPanel`

- [ ] **Step 1: Add `hidePool` to the destructured props**

In `EmployeeWorkspaceCalendar` (line 713-721), add `hidePool = false` to the props:

```jsx
export default function EmployeeWorkspaceCalendar({
  tasks = [],
  taskPool = { items: [], restrictions: {} },
  dailySummary = null,
  onClaim,
  claimingKey = '',
  onRefresh,
  isDirector = false,
  hidePool = false,
}) {
```

- [ ] **Step 2: Conditionally render TaskPoolPanel**

At line 806, wrap the `TaskPoolPanel` call in a conditional:

```jsx
{!hidePool && <TaskPoolPanel taskPool={taskPool} onClaim={onClaim} claimingKey={claimingKey} now={now} />}
```

- [ ] **Step 3: Verify existing calendar tests still pass**

Run: `npx vitest run dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx`
Expected: All 10 existing tests PASS (hidePool defaults to false, so behavior is unchanged)

---

### Task 2: Embed EmployeeWorkspaceCalendar in EmployeeWorkspace

**Files:**
- Modify: `dev/frontend/src/features/employee-portal/EmployeeWorkspace.jsx:1-10` (imports)
- Modify: `dev/frontend/src/features/employee-portal/EmployeeWorkspace.jsx:312-389` (props + render)

**Interfaces:**
- Consumes: EmployeeWorkspaceCalendar (imported), existing EmployeeWorkspace props
- Produces: calendar rendered above the load bar when `openItem` is null

- [ ] **Step 1: Import EmployeeWorkspaceCalendar**

Add at top of `EmployeeWorkspace.jsx` (after existing imports, around line 7):

```jsx
import EmployeeWorkspaceCalendar from './EmployeeWorkspaceCalendar'
```

- [ ] **Step 2: Render calendar above the load bar**

In the `EmployeeWorkspace` component, after the early return for `openItem` (line 388) and before the `<main className="ew">` (line 389), insert the calendar. The calendar renders only when no held item is open (i.e., in the main view, not inside `EmployeeItemWorkspace`):

Replace the `return <main className="ew">` block (line 389) with:

```jsx
  return <main className="ew">
    <EmployeeWorkspaceCalendar
      tasks={tasks}
      taskPool={taskPool}
      dailySummary={dailySummary}
      onClaim={onClaim}
      claimingKey={claimingKey}
      onRefresh={onRefresh}
      isDirector={isDirector}
      hidePool
    />

    {/* ============ TẢI CỦA BẠN ============ */}
    ... (rest of existing content unchanged)
```

The `hidePool` prop prevents the calendar from showing its own compact TaskPoolPanel, since EmployeeWorkspace already has the full Chain/Assist/Help pool below.

- [ ] **Step 3: Verify existing EmployeeWorkspace-related tests still pass**

Run: `npx vitest run dev/frontend/src/features/employee-portal/EmployeePortalDashboard.test.jsx`
Expected: All existing tests PASS. The calendar now renders (heading "Lịch làm việc" will be present), so the test at line 318 that asserts it's absent will FAIL — that's expected and fixed in Task 4.

---

### Task 3: Wire calendar props in EmployeePortalDashboard

**Files:**
- No changes needed to EmployeePortalDashboard.jsx

**Rationale:** EmployeePortalDashboard already passes `tasks`, `taskPool`, `dailySummary`, `onClaim`, `claimingKey`, `onRefresh`, and `isDirector` to EmployeeWorkspace. EmployeeWorkspace now passes these through to EmployeeWorkspaceCalendar. No new wiring needed.

- [ ] **Step 1: Verify props flow correctly by running tests**

Run: `npx vitest run dev/frontend/src/features/employee-portal/EmployeePortalDashboard.test.jsx`
Expected: Tests that render EmployeePortalDashboard will now include the calendar. The test at line 318 ("không còn dấu vết của bố cục cũ") will FAIL because the calendar heading IS now present. This is expected and fixed in Task 4.

---

### Task 4: Update conflicting test and add calendar integration tests

**Files:**
- Modify: `dev/frontend/src/features/employee-portal/EmployeePortalDashboard.test.jsx:318-328` (fix conflicting test)
- Add: new tests in same file for calendar rendering and notification deep-link

**Interfaces:**
- Consumes: existing mockApi, HELD_ITEM, POOL_CHAIN_ITEM fixtures
- Produces: updated + new test assertions

- [ ] **Step 1: Fix the conflicting test at line 318-328**

The test "không còn dấu vết của bố cục cũ: lịch tuần và cột thông tin bên phải" currently asserts the calendar heading is NOT present. Since we're now integrating the calendar, change this assertion:

Replace lines 324-328:

```jsx
  expect(await screen.findByRole('heading', { name: 'Hạng mục bạn đã nhận' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /^Lịch làm việc/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Thông tin nghỉ phép' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Check-out / Đã Check-in' })).not.toBeInTheDocument()
```

With:

```jsx
  expect(await screen.findByRole('heading', { name: 'Hạng mục bạn đã nhận' })).toBeInTheDocument()
  // Calendar is now the main work view — its heading must be present
  expect(screen.getByRole('heading', { name: /Lịch làm việc/ })).toBeInTheDocument()
  // Old unrelated widgets remain absent
  expect(screen.queryByRole('heading', { name: 'Thông tin nghỉ phép' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Check-out / Đã Check-in' })).not.toBeInTheDocument()
```

- [ ] **Step 2: Add test — live dashboard renders the calendar**

Add a new test after the fixed test:

```jsx
it('live dashboard renders the calendar as the main work view', async () => {
  mockApi()

  render(<EmployeePortalDashboard />)

  expect(await screen.findByRole('heading', { name: /Lịch làm việc/ })).toBeInTheDocument()
  // Calendar mock renders a div with data-testid="calendar"
  expect(screen.getByTestId('calendar')).toBeInTheDocument()
  // Held items are still present below the calendar
  expect(screen.getByText('Tải của bạn')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Hạng mục bạn đã nhận' })).toBeInTheDocument()
})
```

- [ ] **Step 3: Add test — notification deep-link opens the intended task**

The `bachkhoa:open-employee-task` custom event is already handled by EmployeeWorkspaceCalendar. Add a test that verifies the calendar's EmployeeNodeModal opens when the event fires:

```jsx
it('notification deep-link dispatch opens the correct task in calendar modal', async () => {
  mockApi({
    tasks: [{
      id: 'n2',
      node_code: 'K02',
      name: 'Khảo sát & đo hiện trường',
      status: 'in_progress',
      started_at: '2026-09-01T08:00:00Z',
      checklist: [],
      assignees: [],
    }],
  })

  render(<EmployeePortalDashboard />)

  // Wait for dashboard to load
  await screen.findByRole('heading', { name: /Lịch làm việc/ })

  // Dispatch the notification deep-link event
  act(() => {
    window.dispatchEvent(new CustomEvent('bachkhoa:open-employee-task', {
      detail: { taskNodeId: 'n2' },
    }))
  })

  // EmployeeNodeModal should open with the task details
  // (rendered via createPortal, so it's in the document body)
  await waitFor(() => {
    expect(screen.getByText('Khảo sát & đo hiện trường')).toBeInTheDocument()
  })
})
```

Note: This test requires importing `act` from `@testing-library/react`. Add it to the import at line 1:

```jsx
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
```

- [ ] **Step 4: Run all focused employee portal tests**

Run: `npx vitest run dev/frontend/src/features/employee-portal/EmployeePortalDashboard.test.jsx dev/frontend/src/features/employee-portal/EmployeeWorkspaceCalendar.test.jsx`

Expected: All tests PASS (both files, combined).

---

### Task 5: Run full employee portal test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run the full employee portal test suite**

Run: `npx vitest run dev/frontend/src/features/employee-portal/`

Expected: All tests across all employee portal test files PASS. Report exact pass/fail counts.

---

## Self-Review

1. **Spec coverage:**
   - Calendar as main work view ✓ (Task 2 renders it at top of EmployeeWorkspace)
   - Held-item flow retained ✓ (EmployeeItemWorkspace still rendered via openItemId state)
   - Existing pool/held items/help/cancel behavior preserved ✓ (EmployeeWorkspace's full pool section unchanged)
   - No duplicated competing action paths ✓ (hidePool prevents calendar's compact TaskPoolPanel)
   - Server-authoritative flows preserved ✓ (no backend changes, all handlers passed through)
   - Calendar listener works in live route ✓ (EmployeeWorkspaceCalendar now rendered in production via EmployeeWorkspace)
   - Conflicting test updated ✓ (Task 4)
   - New calendar integration tests added ✓ (Task 4)
   - No backend changes ✓
   - No commit ✓
   - No unrelated refactor ✓

2. **Placeholder scan:** No TBD/TODO found. All steps have concrete code.

3. **Type consistency:** Props match between EmployeeWorkspaceCalendar (tasks, taskPool, dailySummary, onClaim, claimingKey, onRefresh, isDirector, hidePool) and EmployeeWorkspace's pass-through. EmployeePortalDashboard already passes all needed props to EmployeeWorkspace.
