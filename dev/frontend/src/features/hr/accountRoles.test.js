import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_ROLE_OPTIONS,
  defaultAccountRoleForDepartment,
  getAccountRoleLabel,
  isRoleMismatchedWithDepartment,
} from './accountRoles';

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

  describe('isRoleMismatchedWithDepartment', () => {
    it('returns false when role matches department default', () => {
      expect(isRoleMismatchedWithDepartment('survey_staff', 'dept_dove')).toBe(false);
      expect(isRoleMismatchedWithDepartment('accountant', 'dept_ketoan')).toBe(false);
    });

    it('returns true when role differs from department default', () => {
      expect(isRoleMismatchedWithDepartment('accountant', 'dept_dove')).toBe(true);
      expect(isRoleMismatchedWithDepartment('sales', 'dept_dove')).toBe(true);
      expect(isRoleMismatchedWithDepartment('admin', 'dept_dove')).toBe(true);
      expect(isRoleMismatchedWithDepartment('survey_staff', 'dept_ketoan')).toBe(true);
    });

    it('returns false when role or department is empty or department is unknown', () => {
      expect(isRoleMismatchedWithDepartment('', 'dept_dove')).toBe(false);
      expect(isRoleMismatchedWithDepartment('survey_staff', '')).toBe(false);
      expect(isRoleMismatchedWithDepartment('survey_staff', 'dept_unknown')).toBe(false);
    });
  });

  describe('getAccountRoleLabel', () => {
    it('returns human label for canonical roles', () => {
      expect(getAccountRoleLabel('survey_staff')).toBe('Nhân viên đo vẽ');
      expect(getAccountRoleLabel('accountant')).toBe('Kế toán');
      expect(getAccountRoleLabel('admin')).toBe('Giám đốc / Quản trị');
    });

    it('returns fallback value for empty or unknown role', () => {
      expect(getAccountRoleLabel('custom_role')).toBe('custom_role');
      expect(getAccountRoleLabel('')).toBe('');
    });
  });
});

