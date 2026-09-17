import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import HumanResources from './HumanResources';

vi.mock('../features/hr/EmployeeDirectory', () => ({
  default: () => <div data-testid="employee-directory">Employee Directory Content</div>,
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
    expect(screen.getByText('Đào Tạo & ISO')).toBeInTheDocument();
    expect(screen.getByTestId('wiki-component')).toBeInTheDocument();
    expect(screen.queryByTestId('employee-directory')).not.toBeInTheDocument();
  });

  it('shows both tabs when user has both hr and wiki permissions and allows switching tabs', () => {
    const userWithBoth = {
      id: 'usr-3',
      username: 'admin_user',
      permissions: { hr: true, wiki: true },
    };

    render(<HumanResources user={userWithBoth} />);

    expect(screen.getByText('Danh sách nhân sự')).toBeInTheDocument();
    const wikiTab = screen.getByText('Đào Tạo & ISO');
    expect(wikiTab).toBeInTheDocument();

    fireEvent.click(wikiTab);

    expect(screen.getByTestId('wiki-component')).toBeInTheDocument();
    expect(screen.queryByTestId('employee-directory')).not.toBeInTheDocument();
  });
});
