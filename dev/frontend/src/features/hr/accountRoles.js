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

export function defaultAccountRoleForDepartment(departmentId, departmentName = '') {
  if (departmentId && ROLE_BY_DEPARTMENT[departmentId]) {
    return ROLE_BY_DEPARTMENT[departmentId];
  }
  const text = (String(departmentName || departmentId || '')).toLowerCase();
  if (text.includes('sale') || text.includes('kinh doanh') || text.includes('cskh') || text.includes('bán hàng')) {
    return 'sales';
  }
  if (text.includes('đo vẽ') || text.includes('trắc địa') || text.includes('dove') || text.includes('kỹ thuật') || text.includes('do ve')) {
    return 'survey_staff';
  }
  if (text.includes('pháp lý') || text.includes('phap ly') || text.includes('phaply')) {
    return 'legal_staff';
  }
  if (text.includes('kế toán') || text.includes('ke toan') || text.includes('tài chính') || text.includes('ketoan')) {
    return 'accountant';
  }
  if (text.includes('giám đốc') || text.includes('giam doc') || text.includes('admin') || text.includes('quản trị')) {
    return 'admin';
  }
  return '';
}

export function getAccountRoleLabel(roleName) {
  const match = ACCOUNT_ROLE_OPTIONS.find((option) => option.value === roleName);
  return match ? match.label : (roleName || '');
}

export function isRoleMismatchedWithDepartment(roleName, departmentId, departmentName = '') {
  if (!roleName || (!departmentId && !departmentName)) return false;
  const expectedRole = defaultAccountRoleForDepartment(departmentId, departmentName);
  if (!expectedRole) return false;
  return roleName !== expectedRole;
}

