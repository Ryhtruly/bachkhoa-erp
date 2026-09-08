import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import SettingsScreen from './SettingsScreen';

const { apiFetchMock, addToastMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  addToastMock: vi.fn()
}));

vi.mock('../../../lib/api', () => ({
  apiFetch: apiFetchMock
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock })
}));

describe('SettingsScreen — Clean & Practical ERP Settings Hub', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    apiFetchMock.mockImplementation(async (url) => {
      if (url.includes('/api/finance/fund-balances/calculate')) {
        return { cash_balance: 50000000, bank_balance: 8150000 };
      }
      if (url.includes('/api/finance/fund-balances/history')) {
        return [
          {
            id: '1',
            effective_date: '01/01/2026 06:59',
            payment_method: 'CASH',
            opening_balance: 50000000,
            closing_user: 'Kế toán trưởng',
            notes: 'Chốt số cuối năm 2025'
          }
        ];
      }
      if (url.includes('/api/finance/settings')) {
        return {
          expense_approval_threshold: 2000000,
          advance_admin_threshold: 5000000,
          payroll_cycle_type: 'CUSTOM_CUTOFF',
          payroll_cutoff_day: 25,
          payroll_payment_day: 5
        };
      }
      if (url.includes('/api/finance/document-signers')) {
        return {
          director_name: 'Lê Văn Sáu',
          accountant_name: 'Trần Thị Mai',
          accountant_role: 'Kế toán trưởng',
          cashier_name: 'Nguyễn Văn Minh',
          payroll_accountant_name: 'Lê Thị Thảo'
        };
      }
      return {};
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the clean ERP tab navigation and default reconcile panel', async () => {
    render(<SettingsScreen user={{ name: 'Admin' }} isDirector={true} />);

    expect(screen.getByText(/Thiết lập & chốt quỹ tài chính/i)).toBeDefined();
    expect(screen.getByRole('tab', { name: /Biên bản chốt quỹ/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Người ký chứng từ/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Ngưỡng phê duyệt/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Chu kỳ tính lương/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Lịch sử chốt quỹ/i })).toBeDefined();
  });

  it('calculates real-time delta and enables fast match for cash and bank funds', async () => {
    render(<SettingsScreen user={{ name: 'Admin' }} isDirector={true} />);

    await waitFor(() => {
      expect(screen.getByText(/50\.000\.000 ₫/)).toBeDefined();
    });

    const fastMatchBtns = screen.getAllByRole('button', { name: /Khớp sổ sách/i });
    expect(fastMatchBtns.length).toBe(2);

    // Click Fast match on cash fund
    fireEvent.click(fastMatchBtns[0]);
    expect(screen.getByDisplayValue('50.000.000')).toBeDefined();
    expect(screen.getByText('Khớp sổ sách 100% (Không chênh lệch)')).toBeDefined();
  });

  it('switches tabs and saves document signers', async () => {
    render(<SettingsScreen user={{ name: 'Admin' }} isDirector={true} />);

    const signersTab = screen.getByRole('tab', { name: /Người ký chứng từ/i });
    fireEvent.click(signersTab);

    expect(screen.getByPlaceholderText('Lê Văn Sáu')).toBeDefined();

    const saveSignersBtn = screen.getByRole('button', { name: 'Lưu người ký chứng từ' });
    fireEvent.click(saveSignersBtn);

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith('Đã lưu cấu hình người ký chứng từ!', 'success');
    });
  });

  it('switches to thresholds tab and allows clicking quick preset chips', async () => {
    render(<SettingsScreen user={{ name: 'Admin' }} isDirector={true} />);

    const thresholdsTab = screen.getByRole('tab', { name: /Ngưỡng phê duyệt/i });
    fireEvent.click(thresholdsTab);

    const chips = screen.getAllByRole('button', { name: '10tr' });
    expect(chips.length).toBeGreaterThan(0);
    fireEvent.click(chips[0]);

    expect(screen.getByDisplayValue('10.000.000')).toBeDefined();

    const saveThresholdBtn = screen.getByRole('button', { name: 'Lưu ngưỡng phê duyệt tài chính' });
    fireEvent.click(saveThresholdBtn);

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith('Giám đốc đã lưu cấu hình ngưỡng tài chính thành công!', 'success');
    });
  });
});
