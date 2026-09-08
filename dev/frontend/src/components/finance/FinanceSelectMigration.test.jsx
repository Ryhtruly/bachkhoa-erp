import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExcelGridTable } from './SharedFinanceUI';
import CashflowDetailModal from './modals/CashflowDetailModal';
import { apiFetch } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('finance select migration phase 1', () => {
  it('uses custom controls for the shared finance form fields', () => {
    const onCategoryChange = vi.fn();
    const onMethodChange = vi.fn();

    const { container } = render(
      <ExcelGridTable
        title="Phiếu thu"
        category="Thu khác"
        categoryOptions={[{ value: 'Thu khác', label: 'Thu khác' }]}
        onCategoryChange={onCategoryChange}
        method="Tiền mặt"
        methodOptions={[{ value: 'Tiền mặt', label: 'Tiền mặt' }]}
        onMethodChange={onMethodChange}
        date="2026-08-22"
        onDateChange={vi.fn()}
        note="Ghi nhận thanh toán"
        onNoteChange={vi.fn()}
        personName="Nguyễn Văn A"
        onPersonNameChange={vi.fn()}
        department="Kế toán"
        onDepartmentChange={vi.fn()}
        amountDisplay="1000000"
        onAmountChange={vi.fn()}
      />
    );

    expect(container.querySelectorAll('select')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Thu khác' }));
    fireEvent.click(screen.getByRole('option', { name: 'Thu khác' }));
    expect(onCategoryChange).toHaveBeenCalledWith('Thu khác');

    fireEvent.click(screen.getByRole('button', { name: 'Tiền mặt' }));
    fireEvent.click(screen.getByRole('option', { name: 'Tiền mặt' }));
    expect(onMethodChange).toHaveBeenCalledWith('Tiền mặt');
  });

  it('does not leave native selects in shared finance or detail modal sources', () => {
    expect(source('./SharedFinanceUI.jsx').match(/<select\b/g) || []).toHaveLength(0);
    expect(source('./modals/CashflowDetailModal.jsx').match(/<select\b/g) || []).toHaveLength(0);
  });

  it('uses the custom payment method control in the cashflow detail modal', async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes('/api/finance/cashflow/')) {
        return Promise.resolve({
          id: 'PC-08/2026-001',
          type: 'Chi',
          category: 'Chi khác',
          partner: 'Nguyễn Văn A',
          payment_method: 'Tiền mặt',
          amount: 1000000,
          transaction_date: '2026-08-22',
          description: 'Chi phí khác',
          status: 'Chờ duyệt',
        });
      }
      if (url.includes('/api/finance/contracts')) return Promise.resolve([]);
      return Promise.resolve({});
    });

    const { container } = render(
      <CashflowDetailModal
        open
        transactionId="PC-08/2026-001"
        isDirector={false}
        user={{ username: 'accountant' }}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Tiền mặt' })).toBeInTheDocument());
    expect(container.querySelectorAll('select')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Tiền mặt' }));
    fireEvent.click(screen.getByRole('option', { name: 'Chuyển khoản' }));
    expect(screen.getByRole('button', { name: 'Chuyển khoản' })).toBeInTheDocument();
  });

  it('does not leave native selects in PrintVoucherScreen', () => {
    expect(source('./screens/PrintVoucherScreen.jsx').match(/<select\b/g) || []).toHaveLength(0);
  });

  it('does not leave native selects in DebtCollection', () => {
    expect(source('../../pages/DebtCollection.jsx').match(/<select\b/g) || []).toHaveLength(0);
  });

  it('does not leave native selects in PieceRatePayrollScreen', () => {
    expect(source('./screens/PieceRatePayrollScreen.jsx').match(/<select\b/g) || []).toHaveLength(0);
  });
});
