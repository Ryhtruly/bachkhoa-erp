import { describe, expect, it } from 'vitest';

import { ACCOUNT_ROLE_OPTIONS, defaultAccountRoleForDepartment } from './accountRoles';

describe('account role provisioning', () => {
  it.each([
    ['dept_admin', 'admin'],
    ['dept_sales', 'sales'],
    ['dept_dove', 'survey_staff'],
    ['dept_phaply', 'legal_staff'],
    ['dept_ketoan', 'accountant'],
  ])('maps %s to canonical role %s', (departmentId, expectedRole) => {
    expect(defaultAccountRoleForDepartment(departmentId)).toBe(expectedRole);
  });

  it('does not guess a role for an unknown department', () => {
    expect(defaultAccountRoleForDepartment('dept_unknown')).toBe('');
  });

  it('exposes only assignable canonical roles', () => {
    expect(ACCOUNT_ROLE_OPTIONS.map((option) => option.value)).toEqual([
      'sales',
      'survey_staff',
      'legal_staff',
      'accountant',
      'admin',
    ]);
  });
});
