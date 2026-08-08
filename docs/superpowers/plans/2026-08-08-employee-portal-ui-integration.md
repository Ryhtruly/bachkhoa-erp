# Employee Portal UI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate live employee profile and employee dashboard UIs into Bach Khoa ERP while preserving management users' current experience and documenting unavailable data.

**Architecture:** Add a server-side employee-profile read model that resolves the employee from the JWT and exposes the same response shape for self-service and HR-authorized profile inspection. In the existing React application, bootstrap `/api/auth/me` to select either management or employee workspace, then render ported prototype bodies as JavaScript feature modules using a shared bearer-aware API helper. The prototype headers are deliberately excluded; the existing ERP `TopHeader` remains.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React 19, Vite 8, lucide-react, Vitest, React Testing Library.

## Global Constraints

- Work only in `dev/backend`, `dev/frontend`, and `docs`; do not modify `hr-management-dashboard/` or `ho-so-nhan-vien---hrm-system/` prototype directories.
- Before editing any function, class, or method, run GitNexus upstream impact analysis and report its risk as required by `AGENTS.md`.
- Do not add Tailwind, TypeScript, a router library, or a second application shell to `dev/frontend`.
- Do not port the prototype profile `Header` or dashboard `Navbar`; retain Bach Khoa ERP's `TopHeader`.
- Do not display mock values or local-only successful mutations. Unsupported fields render `Chua co du lieu` and are recorded in `docs/employee-portal-unavailable-data.md`.
- Every new protected browser request must send the stored `bachkhoa_access_token` as a bearer token and must handle `401` by invalidating the session.
- No database schema migration is part of this phase.

## Target File Structure

- Create: `dev/backend/src/employee_portal/__init__.py` - employee portal package marker.
- Create: `dev/backend/src/employee_portal/service.py` - JWT-resolved profile read model and serializers.
- Create: `dev/backend/src/routes/routes_employee_portal.py` - self and HR profile endpoints.
- Modify: `dev/backend/src/routes/routes_auth.py` - enrich `/api/auth/me` with workspace resolution.
- Modify: `dev/backend/src/index.py` - register the portal router.
- Create: `dev/backend/tests/test_employee_portal.py` - authorization and payload regression coverage.
- Create: `dev/frontend/src/lib/api.js` - JSON fetch helper with bearer auth and typed error object.
- Create: `dev/frontend/src/features/employee-profile/EmployeeProfileModal.jsx` - modal body, tabs, and modal-specific interactions.
- Create: `dev/frontend/src/features/employee-profile/employeeProfileMappers.js` - backend-to-view mapping and availability checks.
- Create: `dev/frontend/src/features/employee-profile/employeeProfile.css` - scoped profile presentation styles translated from the prototype.
- Create: `dev/frontend/src/features/employee-portal/EmployeePortalDashboard.jsx` - employee dashboard body without the prototype navbar.
- Create: `dev/frontend/src/features/employee-portal/employeePortalMappers.js` - dashboard view mapping and empty-state helpers.
- Create: `dev/frontend/src/features/employee-portal/employeePortal.css` - scoped dashboard styles translated from the prototype.
- Modify: `dev/frontend/src/App.jsx` - session bootstrap and workspace selection.
- Modify: `dev/frontend/src/pages/Payroll.jsx` - row-click profile entry point and profile modal state.
- Modify: `dev/frontend/src/components/Sidebar.jsx` - employee-mode navigation with only the employee dashboard entry.
- Modify: `dev/frontend/package.json` - frontend test script and test dependencies.
- Create: `dev/frontend/src/test/setup.js` - DOM matcher setup.
- Create: `dev/frontend/src/App.test.jsx` - workspace selection and session failure tests.
- Create: `dev/frontend/src/features/employee-profile/EmployeeProfileModal.test.jsx` - row/modal and unavailable-data tests.
- Create: `docs/employee-portal-unavailable-data.md` - field-by-field deferred-data register.

---

### Task 1: Establish authenticated frontend API access and test harness

**Files:**

- Create: `dev/frontend/src/lib/api.js`
- Modify: `dev/frontend/package.json`
- Create: `dev/frontend/src/test/setup.js`

**Interfaces:**

- Produces: `apiFetch(path, options?)` returning parsed JSON or throwing `ApiError` with `status` and `message`.
- Produces: `clearAccessToken()` for the application session boundary.

- [ ] **Step 1: Write the failing helper tests**

Create `dev/frontend/src/lib/api.test.js` with bearer and unauthorized cases:

```jsx
import { apiFetch } from './api';

it('adds the saved bearer token to protected requests', async () => {
  localStorage.setItem('bachkhoa_access_token', 'jwt-token');
  global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'emp-1' }), { status: 200 }));

  await apiFetch('/api/employee-portal/me');

  expect(global.fetch).toHaveBeenCalledWith('/api/employee-portal/me', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' }),
  }));
});
```

- [ ] **Step 2: Add the test dependencies and run the test to verify it fails**

Add `"test": "vitest run"` and dev dependencies `vitest`, `jsdom`, `@testing-library/react`, and `@testing-library/jest-dom` to `dev/frontend/package.json`.

Run: `npm test -- src/lib/api.test.js`

Expected: FAIL because `src/lib/api.js` does not exist.

- [ ] **Step 3: Implement the minimal authenticated JSON helper**

Implement `apiFetch` so it merges caller headers, reads `bachkhoa_access_token`, adds `Authorization` only when a token exists, parses JSON once, and throws:

```js
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
```

For `401`, dispatch `window.dispatchEvent(new Event('bachkhoa:unauthorized'))`; `App.jsx` will own logout state.

- [ ] **Step 4: Run frontend helper tests**

Run: `npm test -- src/lib/api.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dev/frontend/package.json dev/frontend/package-lock.json dev/frontend/src/lib/api.js dev/frontend/src/lib/api.test.js dev/frontend/src/test/setup.js
git commit -m "test: add authenticated frontend API helper"
```

### Task 2: Expose workspace resolution through the authenticated user endpoint

**Files:**

- Modify: `dev/backend/src/routes/routes_auth.py`
- Modify: `dev/backend/tests/test_auth_rbac.py`

**Interfaces:**

- Produces from `GET /api/auth/me`:

```json
{
  "id": "user-id",
  "username": "employee.user",
  "email": "employee@example.test",
  "is_active": true,
  "employee_id": "employee-id-or-null",
  "default_workspace": "employee"
}
```

- `default_workspace` is `management` for HR/admin and `employee` only for active linked employees without management access.

- [ ] **Step 1: Run impact analysis before editing the endpoint**

Run GitNexus impact against `get_me` in `dev/backend/src/routes/routes_auth.py` with upstream direction. Record direct callers, affected processes, and risk in the implementation notes; stop for user approval if risk is HIGH or CRITICAL.

- [ ] **Step 2: Write failing API tests**

Add test fixtures for one linked standard employee and one linked HR user. Assert:

```python
res = client.get('/api/auth/me', headers=employee_headers)
assert res.status_code == 200
assert res.json()['employee_id'] == employee.id
assert res.json()['default_workspace'] == 'employee'

res = client.get('/api/auth/me', headers=hr_headers)
assert res.json()['default_workspace'] == 'management'
```

- [ ] **Step 3: Run the focused tests to verify they fail**

Run: `.venv\\Scripts\\python.exe -m pytest tests/test_auth_rbac.py -q`

Expected: FAIL because the new response keys are absent.

- [ ] **Step 4: Implement workspace resolution**

In `get_me`, query `Employee` by `Employee.user_id == user.id`. Reuse `check_user_permission(db, user, 'hr', 'read')` for HR detection and retain the existing admin behavior. Return `employee_id` only for an active linked employee. Resolve:

```python
workspace = 'management' if is_management_user else 'employee' if employee else 'management'
```

Inject `db: Session = Depends(get_db)` into the endpoint instead of trusting an identifier supplied by the browser.

- [ ] **Step 5: Run focused backend tests**

Run: `.venv\\Scripts\\python.exe -m pytest tests/test_auth_rbac.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add dev/backend/src/routes/routes_auth.py dev/backend/tests/test_auth_rbac.py
git commit -m "feat(auth): expose employee workspace"
```

### Task 3: Implement the employee-profile read model and authorization boundary

**Files:**

- Create: `dev/backend/src/employee_portal/__init__.py`
- Create: `dev/backend/src/employee_portal/service.py`
- Create: `dev/backend/src/routes/routes_employee_portal.py`
- Modify: `dev/backend/src/index.py`
- Create: `dev/backend/tests/test_employee_portal.py`

**Interfaces:**

- Produces `EmployeePortalService.build_profile(db, employee)`.
- Produces `GET /api/employee-portal/me` and `GET /api/employee-portal/employees/{employee_id}`.
- Response shape:

```json
{
  "employee": { "id": "emp-1", "full_name": "Nguyen Van A", "department": "Survey", "job_title": "Surveyor", "email": "a@example.test", "join_date": "2026-01-01", "base_salary": 0, "is_active": true },
  "tasks": [],
  "leave_records": [],
  "attendance": [],
  "latest_payroll": null
}
```

- [ ] **Step 1: Run impact analysis before modifying router registration**

Run GitNexus impact on `app` in `dev/backend/src/index.py` with upstream direction. Record the blast radius and stop for user approval if risk is HIGH or CRITICAL.

- [ ] **Step 2: Write failing authorization and serialization tests**

Create a linked employee, another employee, an HR user, one task assigned to the linked user's ID, one leave record, one attendance record, and one KPI payroll record. Cover:

```python
assert client.get('/api/employee-portal/me').status_code == 401
assert client.get('/api/employee-portal/me', headers=linked_headers).json()['employee']['id'] == linked_employee.id
assert client.get(f'/api/employee-portal/employees/{other.id}', headers=linked_headers).status_code == 403
assert client.get(f'/api/employee-portal/employees/{other.id}', headers=hr_headers).status_code == 200
```

Assert task membership includes both `assignee_id` and `support_id`, and that absent relations serialize as empty lists or `null`, never mock values.

- [ ] **Step 3: Run the focused test to verify it fails**

Run: `.venv\\Scripts\\python.exe -m pytest tests/test_employee_portal.py -q`

Expected: FAIL because the routes are not registered.

- [ ] **Step 4: Implement the service read model**

In `EmployeePortalService.build_profile`:

1. Join `Employee` to `Department` and linked `User` for existing identity fields.
2. Query `ProjectTask` where `assignee_id` or `support_id` equals `employee.user_id`, ordered by deadline then update time.
3. Query `LeaveRecord` and `Attendance` by `employee.id`, ordered newest first.
4. Query latest `KpiPayroll` by month for `employee.id`.
5. Convert `date`, `datetime`, and decimal values into JSON-safe ISO strings and numbers.

Do not synthesize avatar, shift time, leave reason, debt, or contract-document data.

- [ ] **Step 5: Implement endpoint authorization**

`/me` resolves only `Employee.user_id == current_user.id` and returns 404 when absent or inactive. The `{employee_id}` endpoint permits the same user or `check_user_permission(db, current_user, 'hr', 'read')`; otherwise raise `HTTPException(status_code=403, detail='Khong du quyen xem ho so nhan su.')`.

Register the router in `src/index.py` with no additional prefix because its router declares `prefix='/api/employee-portal'`.

- [ ] **Step 6: Run focused tests**

Run: `.venv\\Scripts\\python.exe -m pytest tests/test_employee_portal.py -q`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add dev/backend/src/employee_portal dev/backend/src/routes/routes_employee_portal.py dev/backend/src/index.py dev/backend/tests/test_employee_portal.py
git commit -m "feat(hr): add employee profile portal API"
```

### Task 4: Create reusable employee profile presentation without the prototype header

**Files:**

- Create: `dev/frontend/src/features/employee-profile/employeeProfileMappers.js`
- Create: `dev/frontend/src/features/employee-profile/EmployeeProfileModal.jsx`
- Create: `dev/frontend/src/features/employee-profile/employeeProfile.css`
- Create: `dev/frontend/src/features/employee-profile/EmployeeProfileModal.test.jsx`

**Interfaces:**

- Consumes the portal response from Task 3 and `open`, `employeeId`, `onClose` props.
- Produces `<EmployeeProfileModal open employeeId onClose />` using existing `components/ui/Modal`.

- [ ] **Step 1: Write failing modal tests**

Mock `apiFetch` and verify:

```jsx
render(<EmployeeProfileModal open employeeId="emp-1" onClose={vi.fn()} />);
expect(await screen.findByText('Nguyen Van A')).toBeInTheDocument();
expect(screen.queryByText('1OFFICE')).not.toBeInTheDocument();
expect(screen.getByText('Chua co du lieu')).toBeInTheDocument();
```

Also assert loading state appears before resolution and a 403 displays an error state without cached mock fields.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/features/employee-profile/EmployeeProfileModal.test.jsx`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement response mappers and unavailable-data panels**

Map only these real fields: full name, employee ID, department, job title, active/contract status, join date, email, base salary, task list, leave records, attendance, and latest payroll. Use one reusable `UnavailablePanel` for unsupported resume, employment contract, identity, benefits breakdown, and missing subsections.

Keep the profile source's contextual tab organization, but omit its `Header` and employee switcher. Do not include edit-profile, add-task, or leave-request forms that currently mutate prototype state only.

- [ ] **Step 4: Implement the modal body and styles**

Render through the existing `Modal` component with an explicit large size and a scrollable content region. Translate only needed prototype layout rules into names prefixed `employee-profile__`; use lucide icons already installed. Keep modal width constrained and responsive. Add empty, error, and close behaviors.

- [ ] **Step 5: Run focused frontend test**

Run: `npm test -- src/features/employee-profile/EmployeeProfileModal.test.jsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add dev/frontend/src/features/employee-profile
git commit -m "feat(frontend): add employee profile modal"
```

### Task 5: Attach the profile modal to the existing employee directory

**Files:**

- Modify: `dev/frontend/src/pages/Payroll.jsx`
- Create: `dev/frontend/src/pages/Payroll.test.jsx`

**Interfaces:**

- Consumes `<EmployeeProfileModal open employeeId onClose />` from Task 4.
- Produces row-click navigation from `EmployeeDirectory` to the matching employee profile.

- [ ] **Step 1: Run impact analysis before changing `EmployeeDirectory`**

Run GitNexus impact on `EmployeeDirectory` in `dev/frontend/src/pages/Payroll.jsx` with upstream direction. Record callers, affected processes, and risk; stop for user approval if risk is HIGH or CRITICAL.

- [ ] **Step 2: Write a failing directory interaction test**

Mock the employee and department requests through `apiFetch`, render the payroll page, click the row text, and assert the profile modal receives that row's `id`. Then click the edit button and assert its employee form opens while the profile modal remains closed.

- [ ] **Step 3: Run the focused test to verify it fails**

Run: `npm test -- src/pages/Payroll.test.jsx`

Expected: FAIL because row click does not open the profile modal.

- [ ] **Step 4: Implement row interaction and bearer requests**

Replace the employee-directory `fetch` calls with `apiFetch`. Add `selectedProfileEmployeeId` state, pass `onRowClick={(employee) => setSelectedProfileEmployeeId(employee.id)}` to `DataTable`, and render:

```jsx
<EmployeeProfileModal
  open={Boolean(selectedProfileEmployeeId)}
  employeeId={selectedProfileEmployeeId}
  onClose={() => setSelectedProfileEmployeeId(null)}
/>
```

Call `event.stopPropagation()` in the edit and delete action button handlers so they do not open the profile modal. Preserve create, update, delete, filter, and pagination behavior.

- [ ] **Step 5: Run the focused test and linter**

Run: `npm test -- src/pages/Payroll.test.jsx`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add dev/frontend/src/pages/Payroll.jsx dev/frontend/src/pages/Payroll.test.jsx
git commit -m "feat(hr): open employee profiles from directory"
```

### Task 6: Implement the employee dashboard body without the prototype navbar

**Files:**

- Create: `dev/frontend/src/features/employee-portal/employeePortalMappers.js`
- Create: `dev/frontend/src/features/employee-portal/EmployeePortalDashboard.jsx`
- Create: `dev/frontend/src/features/employee-portal/employeePortal.css`
- Create: `dev/frontend/src/features/employee-portal/EmployeePortalDashboard.test.jsx`

**Interfaces:**

- Consumes `GET /api/employee-portal/me` through `apiFetch`.
- Produces `<EmployeePortalDashboard />` with no independent header/nav element.

- [ ] **Step 1: Write failing dashboard tests**

Mock a response with one employee, task, leave record, attendance row, and payroll summary. Verify profile greeting/body fields render, no `1Office` or prototype navbar is rendered, and each unsupported card uses `Chua co du lieu`.

```jsx
render(<EmployeePortalDashboard />);
expect(await screen.findByText('Nguyen Van A')).toBeInTheDocument();
expect(screen.queryByRole('banner')).not.toBeInTheDocument();
expect(screen.getAllByText('Chua co du lieu').length).toBeGreaterThan(0);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/features/employee-portal/EmployeePortalDashboard.test.jsx`

Expected: FAIL because the dashboard module does not exist.

- [ ] **Step 3: Implement live-data mapping**

Map employee identity, current/last attendance, leave record list, active task cards/table, and latest payroll summary from the Task 3 response. Show read-only attendance history; do not render a fake check-in/check-out submission. Keep the weekly schedule, announcements, documents, handbook, and organization cards, but render their standard unavailable state because schema/API do not supply their required data.

- [ ] **Step 4: Implement body layout and responsive styles**

Port the dashboard source body layout into scoped classes prefixed `employee-portal__`. Do not import `Navbar`, prototype mock data, Material Symbols, Tailwind class strings, or prototype modal components. Use existing `TopHeader` supplied by `App.jsx`, lucide icons, and the shared toast/error conventions.

- [ ] **Step 5: Run focused test**

Run: `npm test -- src/features/employee-portal/EmployeePortalDashboard.test.jsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add dev/frontend/src/features/employee-portal
git commit -m "feat(frontend): add employee dashboard"
```

### Task 7: Bootstrap session-aware workspace routing and constrained employee navigation

**Files:**

- Modify: `dev/frontend/src/App.jsx`
- Modify: `dev/frontend/src/components/Sidebar.jsx`
- Create: `dev/frontend/src/App.test.jsx`

**Interfaces:**

- Consumes `GET /api/auth/me` response from Task 2.
- Supplies `mode="employee" | "management"` to `Sidebar`.
- Renders `<EmployeePortalDashboard />` for employee workspace and existing tabs for management workspace.

- [ ] **Step 1: Run impact analysis before changing `App` and `Sidebar`**

Run GitNexus upstream impact for `App` in `dev/frontend/src/App.jsx` and `Sidebar` in `dev/frontend/src/components/Sidebar.jsx`. Record blast radius separately; stop for user approval if either is HIGH or CRITICAL.

- [ ] **Step 2: Write failing workspace tests**

Mock `apiFetch('/api/auth/me')` with each workspace response. Assert employee response renders dashboard body and only employee navigation; management response renders existing `Dashboard`; a 401 clears `bachkhoa_access_token` and renders `Login`.

- [ ] **Step 3: Run the focused test to verify it fails**

Run: `npm test -- src/App.test.jsx`

Expected: FAIL because the application has no session bootstrap or workspace mode.

- [ ] **Step 4: Implement application bootstrap**

Add a `session` state with `loading`, `user`, and `workspace`. On existing token, call `apiFetch('/api/auth/me')` once. Subscribe to `bachkhoa:unauthorized` and route it through the existing logout handler. Render a stable loading state until bootstrap resolves, then select employee dashboard only when `default_workspace === 'employee'`.

Pass `mode` to `Sidebar`. In employee mode, `Sidebar` renders one dashboard item and cannot switch to management tabs. In management mode, preserve its existing list and active-tab behavior. Keep `TopHeader` in both modes.

- [ ] **Step 5: Run focused frontend test, linter, and build**

Run: `npm test -- src/App.test.jsx`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add dev/frontend/src/App.jsx dev/frontend/src/components/Sidebar.jsx dev/frontend/src/App.test.jsx
git commit -m "feat(auth): route linked employees to portal"
```

### Task 8: Document unavailable data and run end-to-end verification

**Files:**

- Create: `docs/employee-portal-unavailable-data.md`

**Interfaces:**

- Documents each deferred UI field with prototype location, current database/API support, behavior in this phase, and needed future schema/API.

- [ ] **Step 1: Write the unavailable-data register**

Create a table with these rows at minimum:

| UI area | Missing data | Current state | This phase | Follow-up |
| --- | --- | --- | --- | --- |
| Employee profile | Avatar, DOB, gender, phone, addresses | No `employees` columns | `Chua co du lieu` | Add employee personal-profile fields and controlled file storage |
| Identity and benefits | ID, tax, insurance, bank, emergency contact, allowance/debt breakdown | No dedicated schema/read model | `Chua co du lieu` | Add normalized HR personal and compensation tables |
| Resume | Education and work history | No schema | `Chua co du lieu` | Add employee education and experience tables |
| Employment contracts | Contract files and period metadata | Business `contracts` are not employment contracts | `Chua co du lieu` | Add employee employment-contract table and documents |
| Leave | Reason, requested days, submitted timestamp | `LeaveRecord` has only type/date/status | Show stored dates/status; missing fields unavailable | Extend leave request schema |
| Weekly schedule | Shift, time range, calendar allocation | `ProjectTask` lacks scheduling time/shift | `Chua co du lieu` | Add employee schedule events |
| Attendance action | Location/note/manual check-in | Attendance is Hanet-ingested; no location/note fields | Read-only history | Define a manual attendance policy and schema |
| Employee dashboard content | Announcements, project documents, handbook, organization tree | No source model/API | `Chua co du lieu` | Add content and org-chart read models |

- [ ] **Step 2: Run complete backend regression suite**

Run: `.venv\\Scripts\\python.exe -m pytest -q`

Expected: PASS.

- [ ] **Step 3: Run complete frontend verification**

Run: `npm test`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Inspect the final impact of uncommitted changes**

Run GitNexus `detect_changes` for all changes. Review every changed symbol and affected execution flow; resolve unexpected scope before committing.

- [ ] **Step 5: Commit documentation and verification results**

```bash
git add docs/employee-portal-unavailable-data.md
git commit -m "docs: record employee portal data gaps"
```
