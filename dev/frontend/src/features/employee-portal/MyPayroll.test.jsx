import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MyPayroll from './MyPayroll';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('../../lib/api', () => ({ apiFetch: apiFetchMock }));

afterEach(() => {
  cleanup();
  apiFetchMock.mockReset();
});

describe('MyPayroll error state', () => {
  it('shows a clear retry action when payroll data cannot be loaded', async () => {
    apiFetchMock.mockRejectedValue(new Error('Bad Gateway'));

    render(<MyPayroll isModal />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText('Không tải được dữ liệu lương')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});

describe('MyPayroll payroll statement layout', () => {
  it('prioritizes net pay and presents the salary components as a compact breakdown', async () => {
    apiFetchMock.mockResolvedValue({
      employee: { full_name: 'Nguyễn Văn A', job_title: 'Nhân viên đo vẽ' },
      selected_payroll: {
        month: '2026-08-01',
        total_salary: 156600000,
        base_salary: 150000000,
        piece_amount: 6600000,
        tasks_completed: 9,
        adjustment_amount: 0,
        is_current: true,
      },
      payroll_history: [{
        month: '2026-08-01',
        total_salary: 156600000,
        base_salary: 150000000,
        piece_amount: 6600000,
        tasks_completed: 9,
        adjustment_amount: 0,
        is_current: true,
      }],
    });

    const { container } = render(<MyPayroll isModal />);

    await waitFor(() => {
      expect(container.querySelector('.my-payroll__net-panel .my-payroll__kpi-label')).toHaveTextContent('Tổng lương');
    });

    expect(container.querySelector('.my-payroll__pay-summary')).toBeInTheDocument();
    expect(container.querySelector('.my-payroll__net-panel')).toBeInTheDocument();
    expect(screen.getByText('Chi tiết cấu thành lương')).toBeInTheDocument();
    expect(container.querySelectorAll('.my-payroll__breakdown-item')).toHaveLength(3);
    expect(screen.getByText('Lịch sử các kỳ lương')).toBeInTheDocument();
    expect(screen.getByText('Đối soát số liệu?')).toBeInTheDocument();
  });
});

describe('MyPayroll period status and interaction semantics', () => {
  const payrollRow = (overrides = {}) => ({
    month: '2026-09-01',
    status: 'Open',
    total_salary: 156600000,
    base_salary: 150000000,
    piece_amount: 6600000,
    tasks_completed: 9,
    adjustment_amount: 0,
    is_current: true,
    ...overrides,
  });

  it.each([
    ['Locked', 'Đã chốt sổ'],
    ['Paid', 'Đã xác nhận chi trả'],
  ])('shows the persisted %s status for the current period', async (status, label) => {
    const row = payrollRow({ status });
    apiFetchMock.mockResolvedValue({
      employee: { full_name: 'Nguyễn Văn A', job_title: 'Nhân viên đo vẽ' },
      selected_payroll: row,
      payroll_history: [row],
    });

    const { container } = render(<MyPayroll />);

    await waitFor(() => expect(container.querySelector('.my-payroll__current-badge')).toHaveTextContent(label));
    expect(container.querySelector('.my-payroll__current-badge')).not.toHaveTextContent('Tạm tính');
  });

  it('distinguishes a historical month without a payroll period from a locked period', async () => {
    const current = payrollRow();
    const noPeriod = payrollRow({ month: '2026-08-01', status: 'NoPeriod', is_current: false });
    apiFetchMock.mockResolvedValue({
      employee: { full_name: 'Nguyễn Văn A' },
      selected_payroll: current,
      payroll_history: [current, noPeriod],
    });

    render(<MyPayroll />);

    await waitFor(() => expect(screen.getByText('Chưa chốt')).toBeInTheDocument());
    expect(screen.queryByText('Đã chốt sổ')).not.toBeInTheDocument();
  });

  it('keeps the empty state hidden while the employee profile fallback is still loading', async () => {
    let resolveFallback;
    apiFetchMock.mockImplementation((url) => {
      if (url === '/api/employee-portal/my-payroll') return Promise.reject(new Error('Bad Gateway'));
      return new Promise(resolve => { resolveFallback = resolve; });
    });

    render(<MyPayroll />);

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/employee-portal/me'));
    expect(screen.queryByText(/Chưa có dữ liệu lương cho kỳ này/)).not.toBeInTheDocument();

    const row = payrollRow();
    resolveFallback({
      employee: { full_name: 'Nguyễn Văn A' },
      latest_payroll: row,
      payroll_history: [row],
    });
    await waitFor(() => expect(screen.getByText('Lịch sử các kỳ lương')).toBeInTheDocument());
  });

  it('makes selectable payroll history rows keyboard accessible', async () => {
    const row = payrollRow();
    apiFetchMock.mockResolvedValue({
      employee: { full_name: 'Nguyễn Văn A' },
      selected_payroll: row,
      payroll_history: [row],
    });

    const { container } = render(<MyPayroll />);

    await waitFor(() => expect(container.querySelector('.my-payroll__table tbody tr')).toBeInTheDocument());
    const historyRow = container.querySelector('.my-payroll__table tbody tr');
    expect(historyRow).toHaveAttribute('tabindex', '0');
    expect(historyRow).toHaveAttribute('role', 'button');
    fireEvent.keyDown(historyRow, { key: 'Enter' });
    expect(historyRow).toHaveClass('is-selected');
  });
});
