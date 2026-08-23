import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
      expect(container.querySelector('.my-payroll__net-panel .my-payroll__kpi-label')).toHaveTextContent('Tổng thực nhận');
    });

    expect(container.querySelector('.my-payroll__pay-summary')).toBeInTheDocument();
    expect(container.querySelector('.my-payroll__net-panel')).toBeInTheDocument();
    expect(screen.getByText('Chi tiết cấu thành lương')).toBeInTheDocument();
    expect(container.querySelectorAll('.my-payroll__breakdown-item')).toHaveLength(3);
    expect(screen.getByText('Lịch sử các kỳ lương')).toBeInTheDocument();
    expect(screen.getByText('Đối soát số liệu?')).toBeInTheDocument();
  });
});
