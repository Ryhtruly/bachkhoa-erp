import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import HumanResources from './HumanResources';

vi.mock('../features/hr/EmployeeDirectory', () => ({
  default: ({ initialDepartmentFilter, onDepartmentFilterChange }) => (
    <div data-testid="employee-directory">
      <span>Filter: {initialDepartmentFilter}</span>
      <button onClick={() => onDepartmentFilterChange('All')}>Reset All</button>
      <button onClick={() => onDepartmentFilterChange('dept_legal')}>Select Legal</button>
    </div>
  ),
}));

vi.mock('../features/hr/DepartmentManagement', () => ({
  default: ({ onNavigateToEmployees }) => (
    <div data-testid="department-management">
      <button onClick={() => onNavigateToEmployees('dept_sales')}>Go to Sales</button>
    </div>
  ),
}));

vi.mock('./Wiki', () => ({
  default: () => <div data-testid="wiki-component">Wiki Knowledge Content</div>,
}));

describe('HumanResources subtabs permission gating', () => {
  afterEach(() => {
    cleanup();
  });

  it('hides Đào Tạo & ISO tab when user has no wiki permission', () => {
    const userWithoutWiki = {
      id: 'usr-1',
      username: 'hr_manager',
      permissions: { hr: true, wiki: false },
    };

    render(<HumanResources user={userWithoutWiki} />);

    expect(screen.getByText('Danh sách nhân sự')).toBeInTheDocument();
    expect(screen.getByText('Phòng ban')).toBeInTheDocument();
    expect(screen.queryByText('Đào Tạo & ISO')).not.toBeInTheDocument();
    expect(screen.getByTestId('employee-directory')).toBeInTheDocument();
    expect(screen.queryByTestId('wiki-component')).not.toBeInTheDocument();
  });

  it('shows only Đào Tạo & ISO tab when user has wiki permission but no hr permission', () => {
    const userWithWikiOnly = {
      id: 'usr-2',
      username: 'sales_user',
      permissions: { hr: false, wiki: true },
    };

    render(<HumanResources user={userWithWikiOnly} />);

    expect(screen.queryByText('Danh sách nhân sự')).not.toBeInTheDocument();
    expect(screen.queryByText('Phòng ban')).not.toBeInTheDocument();
    expect(screen.getByText('Đào Tạo & ISO')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-component')).toBeInTheDocument();
    expect(screen.queryByTestId('employee-directory')).not.toBeInTheDocument();
  });

  it('shows all tabs when user has both hr and wiki permissions and allows switching tabs', () => {
    const userWithBoth = {
      id: 'usr-3',
      username: 'admin_user',
      permissions: { hr: true, wiki: true },
    };

    render(<HumanResources user={userWithBoth} />);

    expect(screen.getByText('Danh sách nhân sự')).toBeInTheDocument();
    expect(screen.getByText('Phòng ban')).toBeInTheDocument();
    const wikiTab = screen.getByText('Đào Tạo & ISO');
    expect(wikiTab).toBeInTheDocument();

    // Switch to wiki
    fireEvent.click(wikiTab);
    expect(screen.getByTestId('wiki-component')).toBeInTheDocument();
    expect(screen.queryByTestId('employee-directory')).not.toBeInTheDocument();

    // Switch to departments
    const deptTab = screen.getByText('Phòng ban');
    fireEvent.click(deptTab);
    expect(screen.getByTestId('department-management')).toBeInTheDocument();
    expect(screen.queryByTestId('wiki-component')).not.toBeInTheDocument();
  });

  it('updates and preserves selectedDepartmentFilter across tab navigation when changed by user', () => {
    const userWithBoth = {
      id: 'usr-3',
      username: 'admin_user',
      permissions: { hr: true, wiki: true },
    };

    render(<HumanResources user={userWithBoth} />);

    // Switch to departments tab
    fireEvent.click(screen.getByText('Phòng ban'));
    expect(screen.getByTestId('department-management')).toBeInTheDocument();

    // Trigger navigate to sales from department management
    fireEvent.click(screen.getByText('Go to Sales'));

    // Should switch to employee directory with filter 'dept_sales'
    expect(screen.getByTestId('employee-directory')).toBeInTheDocument();
    expect(screen.getByText('Filter: dept_sales')).toBeInTheDocument();

    // User changes filter to 'All'
    fireEvent.click(screen.getByText('Reset All'));
    expect(screen.getByText('Filter: All')).toBeInTheDocument();

    // User switches to Wiki tab and then back to Employee directory
    fireEvent.click(screen.getByText('Đào Tạo & ISO'));
    expect(screen.getByTestId('wiki-component')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Danh sách nhân sự'));
    expect(screen.getByTestId('employee-directory')).toBeInTheDocument();
    // It must remember 'All', NOT revert to 'dept_sales'
    expect(screen.getByText('Filter: All')).toBeInTheDocument();

    // User changes filter to 'dept_legal'
    fireEvent.click(screen.getByText('Select Legal'));
    expect(screen.getByText('Filter: dept_legal')).toBeInTheDocument();

    // User switches to departments and back to Employee directory
    fireEvent.click(screen.getByText('Phòng ban'));
    expect(screen.getByTestId('department-management')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Danh sách nhân sự'));
    expect(screen.getByTestId('employee-directory')).toBeInTheDocument();
    expect(screen.getByText('Filter: dept_legal')).toBeInTheDocument();
  });
});
