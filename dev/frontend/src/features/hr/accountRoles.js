export const ACCOUNT_ROLE_OPTIONS = [
  { value: 'sales', label: 'Sales / CSKH' },
  { value: 'survey_staff', label: 'Nhân viên đo vẽ' },
  { value: 'legal_staff', label: 'Nhân viên pháp lý' },
  { value: 'accountant', label: 'Kế toán' },
  { value: 'admin', label: 'Giám đốc / Quản trị' },
];

const ROLE_BY_DEPARTMENT = Object.freeze({
  dept_admin: 'admin',
  dept_sales: 'sales',
  dept_dove: 'survey_staff',
  dept_phaply: 'legal_staff',
  dept_ketoan: 'accountant',
});

export function defaultAccountRoleForDepartment(departmentId) {
  return ROLE_BY_DEPARTMENT[departmentId] || '';
}

export function getAccountRoleLabel(roleName) {
  const match = ACCOUNT_ROLE_OPTIONS.find((option) => option.value === roleName);
  return match ? match.label : (roleName || '');
}

export function isRoleMismatchedWithDepartment(roleName, departmentId) {
  if (!roleName || !departmentId) return false;
  const expectedRole = defaultAccountRoleForDepartment(departmentId);
  if (!expectedRole) return false;
  return roleName !== expectedRole;
}

