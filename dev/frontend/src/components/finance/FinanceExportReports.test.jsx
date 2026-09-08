import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { apiFetchMock, downloadFileMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  downloadFileMock: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  apiFetch: apiFetchMock,
  downloadFile: downloadFileMock,
}));

const mockAddToast = vi.fn();
vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import MonthlyDashboardScreen from './screens/MonthlyDashboardScreen';
import PieceRatePayrollScreen from './screens/PieceRatePayrollScreen';

afterEach(() => {
  cleanup();
  apiFetchMock.mockReset();
  downloadFileMock.mockReset();
  mockAddToast.mockReset();
});

describe('Finance Export and A4 Print Features', () => {
  it('MonthlyDashboardScreen handles Excel export and A4 preview modal', async () => {
    apiFetchMock.mockResolvedValue({
      month: 8,
      year: 2026,
      total_income: 15000000,
      total_expenditure: 8000000,
      net_difference: 7000000,
      categories: [{ name: 'Đo vẽ hiện trạng', income: 15000000, expenditure: 0 }],
      departments: [{ name: 'Phòng Đo vẽ', income: 15000000, expenditure: 0 }],
    });
    downloadFileMock.mockResolvedValue('Bao_Cao_Thu_Chi_2026-08.xlsx');

    render(<MonthlyDashboardScreen month="2026-08" />);

    expect(await screen.findByText(/Xuất Excel/i)).toBeInTheDocument();
    expect(screen.getByText(/Xem trước & in A4/i)).toBeInTheDocument();

    // 1. Click Xuất Excel
    fireEvent.click(screen.getByText(/Xuất Excel/i));
    await waitFor(() => {
      expect(downloadFileMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/finance/export/monthly-dashboard-excel?month=2026-08'),
        'Bao_Cao_Thu_Chi_2026-08.xlsx'
      );
    });

    // 2. Click Xem Trước & In A4
    fireEvent.click(screen.getByText(/Xem trước & in A4/i));
    expect(screen.getByText(/Xem trước bản in báo cáo dòng tiền & thu chi/i)).toBeInTheDocument();
    expect(screen.getByText('In / Lưu PDF')).toBeInTheDocument();
  });

  it('PieceRatePayrollScreen handles Excel exports and Print Preview modal', async () => {
    apiFetchMock.mockImplementation((url) => {
      if (url.includes('/api/payroll/options')) {
        return Promise.resolve({
          data: {
            departments: [
              {
                id: 'dept-01',
                name: 'Phòng Đo vẽ',
                employees: [{ id: 'emp-01', full_name: 'Nguyễn Hoan Khai', job_title: 'Kỹ thuật viên' }],
              },
            ],
            default_year: 2026,
            default_month: 8,
          },
        });
      }
      if (url.includes('/api/payroll/employee-ledger')) {
        return Promise.resolve({
          data: {
            employee: { id: 'emp-01', full_name: 'Nguyễn Hoan Khai', job_title: 'Kỹ thuật viên', department: 'Phòng Đo vẽ' },
            period_status: 'Open',
            period_range: { label: '26/07/2026 – 25/08/2026' },
            summary: {
              approved_salary: 3000000,
              pending_record_total: 1000000,
              provisional_total: 0,
              net_salary: 4000000,
            },
            details: [],
            adjustments: [],
          },
        });
      }
      return Promise.resolve({});
    });
    downloadFileMock.mockResolvedValue('download.xlsx');

    render(<PieceRatePayrollScreen isDirector={true} />);

    const exportPersonalBtn = await screen.findByRole('button', { name: /Xuất Phiếu Lương/i });
    const exportDeptBtn = screen.getByRole('button', { name: /Xuất Bảng Tổng Hợp/i });
    const printBtn = screen.getByRole('button', { name: /In Phiếu Lương/i });

    // Wait until employee ledger is loaded so buttons are enabled
    await waitFor(() => expect(exportPersonalBtn).not.toBeDisabled());

    // 1. Click Xuất Phiếu Lương
    fireEvent.click(exportPersonalBtn);
    await waitFor(() => {
      expect(downloadFileMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/payroll/export/employee-ledger-excel'),
        expect.stringContaining('Phieu_Luong_')
      );
    });

    // 2. Click Xuất Bảng Tổng Hợp
    fireEvent.click(exportDeptBtn);
    await waitFor(() => {
      expect(downloadFileMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/payroll/export/department-summary-excel'),
        expect.stringContaining('Bang_Luong_Tong_Hop_')
      );
    });

    // 3. Click In Phiếu Lương
    fireEvent.click(printBtn);
    expect(await screen.findByText(/Xem Trước Bản In Phiếu Lương - Nguyễn Hoan Khai/i)).toBeInTheDocument();
  });
});
