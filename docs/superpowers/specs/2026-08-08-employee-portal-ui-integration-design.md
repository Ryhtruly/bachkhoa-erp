# Employee Portal UI Integration Design

**Status:** Approved on 2026-08-08

## Goal

Integrate the employee-profile and employee-dashboard presentation from the two supplied UI prototypes into `dev/frontend`, replacing mock data with authenticated Bach Khoa ERP data. An employee whose `users.id` is linked to `employees.user_id` opens an employee workspace by default; management users retain the current management workspace.

## Scope

- Add a read-only employee profile modal from `Payroll > Danh sach nhan su`.
- Add an employee-only dashboard for linked employee accounts.
- Keep the Bach Khoa ERP application shell and its existing `TopHeader`.
- Do not copy the prototype profile `Header` or dashboard `Navbar`.
- Use loading, error, empty, and unavailable-data states. Do not retain mock data or local-only writes that appear persisted.
- Document all unavailable UI fields and deferred actions in `docs/employee-portal-unavailable-data.md`.

## Workspace Resolution

`GET /api/auth/me` will return `employee_id` and `default_workspace`.

- `default_workspace: "employee"` applies only to an active employee linked to the current user who is not an HR or admin management user.
- `default_workspace: "management"` applies to admin and HR users, including those who also have an employee record.
- An authenticated user without an employee record remains in the management workspace; no employee-dashboard fallback is rendered.

The frontend resolves this before it renders protected content. A failed or expired session clears the token and returns to `Login`.

## Backend Contract

Create an employee-profile read model behind `/api/employee-portal`.

`GET /api/employee-portal/me`

- Authenticated self-service endpoint.
- Resolves the current user's active employee row or returns `404` when no linked employee exists.
- Returns only the current employee's profile, assigned/support tasks, leave records, attendance history, and latest payroll summary.

`GET /api/employee-portal/employees/{employee_id}`

- Requires `hr:read` unless `employee_id` belongs to the authenticated user.
- Uses the same response shape as `/me` and rejects an attempt to access another employee with `403`.

The response explicitly maps existing data only:

- identity: `Employee`, `Department`, and linked `User` fields;
- tasks: `ProjectTask` rows where the employee's user is `assignee_id` or `support_id`;
- leave: `LeaveRecord` rows;
- attendance: `Attendance` rows;
- payroll: most recent `KpiPayroll` values and the employee base salary.

The endpoints are read-only in this phase. Existing HR employee create/update/delete endpoints remain the only employee-maintenance writes.

## Frontend Architecture

Use the existing React JavaScript/Vite stack. Do not add Tailwind or move either prototype application into the production tree.

New feature modules own API mapping and presentation:

- `features/employee-profile/` renders the modal content, its tabs, and unavailable-data panels.
- `features/employee-portal/` renders the employee dashboard body and maps the self-service response.
- `lib/api.js` adds the bearer token and normalizes unauthorized API responses for these protected flows.

`App.jsx` performs session bootstrap and selects the workspace. In employee mode, `Sidebar` exposes only the employee dashboard item while `TopHeader` remains. In management mode, existing navigation is unchanged.

The profile modal is opened through `DataTable.onRowClick`; action buttons stop propagation so edit and delete preserve their current behavior. The modal has no prototype header, employee switcher, or standalone search bar.

## Data Availability Rules

When a UI block has no supported field or API, its tab/card remains visible and displays `Chua co du lieu`. It must not render prototype names, dates, values, avatars, or optimistic mutations.

Deferred examples include profile photo, date of birth, gender, phone, addresses, identity/tax/insurance/bank data, emergency contact, work history, education, employment-contract documents, leave reason, scheduled shift time, announcements, project documents, and organization hierarchy. `employee-portal-unavailable-data.md` will record the exact source field, current persistence status, and proposed follow-up.

## Error Handling and Security

- All new protected frontend calls send `Authorization: Bearer <token>`.
- `401` clears the local token and returns to login; `403`, `404`, and server errors show the existing toast/error state without replacing data with mocks.
- Server-side identity comes exclusively from the JWT. The self-service endpoint never accepts a client-supplied employee identifier.
- Management access to another employee is checked server-side using existing RBAC permission evaluation.

## Verification

- Backend pytest covers unauthenticated, self-service, cross-employee denial, HR access, unlinked users, and serialization of empty relations.
- Frontend tests cover workspace selection, bearer request behavior, modal row interaction, and unavailable-data rendering.
- Run backend tests, frontend lint, frontend tests, and frontend production build.
