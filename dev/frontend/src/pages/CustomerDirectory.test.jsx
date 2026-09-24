import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerDirectory from './CustomerDirectory';
import { clearApiCache } from '../lib/api';

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('../components/ui', () => ({
  DatePicker: () => <input data-testid="mock-date-picker" />,
}));

const mockCustomers = Array.from({ length: 25 }, (_, i) => ({
  id: `cust-${i + 1}`,
  full_name: `Khách hàng ${i + 1}`,
  phone: `09000000${(i + 1).toString().padStart(2, '0')}`,
  customer_type: i % 2 === 0 ? 'business' : 'individual',
  tax_id: i % 2 === 0 ? `01000000${i + 1}` : null,
  id_card_number: i % 2 !== 0 ? `1234567890${i + 1}` : null,
  so_hop_dong: i < 3 ? 3 : 1,
}));

beforeEach(() => {
  clearApiCache();
  vi.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/api/customers/loyalty-tiers')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [
            { id: 1, tier_name: 'Bạc', min_contracts: 2, discount_percent: 5, is_active: true, description: 'Giảm 5%' },
            { id: 2, tier_name: 'Vàng', min_contracts: 5, discount_percent: 10, is_active: true, description: 'Giảm 10%' },
          ],
        }),
      });
    }
    if (url.includes('/api/customers/loyalty-qualifying-customers')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [
            { id: 'cust-1', full_name: 'Khách hàng 1', contract_count: 3, tier_name: 'Bạc', discount_percent: 5 },
          ],
        }),
      });
    }
    if (url.includes('/api/customers')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: mockCustomers }),
      });
    }
    return Promise.resolve({ ok: false, json: async () => ({}) });
  });
});

afterEach(() => {
  cleanup();
  clearApiCache();
  vi.restoreAllMocks();
});

describe('CustomerDirectory with toolbar Loyalty button and pagination', () => {
  it('renders customer list paginated with 15 items per page and shows pagination controls', async () => {
    render(<CustomerDirectory isDirector={true} />);

    await waitFor(() => {
      expect(screen.getByText('Khách hàng 1')).toBeDefined();
    });

    // Should only show 15 items on page 1
    expect(screen.getByText('Khách hàng 15')).toBeDefined();
    expect(screen.queryByText('Khách hàng 16')).toBeNull();

    // Pagination info should show "1–15 / 25 khách hàng"
    expect(screen.getByText(/1–15 \/ 25 khách hàng/)).toBeDefined();

    // Page 2 button should exist
    const page2Btn = screen.getByRole('button', { name: 'Trang 2' });
    expect(page2Btn).toBeDefined();

    // Click page 2
    fireEvent.click(page2Btn);

    // Now page 2 items should show (16-25)
    await waitFor(() => {
      expect(screen.getByText('Khách hàng 16')).toBeDefined();
      expect(screen.getByText('Khách hàng 25')).toBeDefined();
    });
    expect(screen.queryByText('Khách hàng 1')).toBeNull();
    expect(screen.getByText(/16–25 \/ 25 khách hàng/)).toBeDefined();
  });

  it('shows toolbar "Ưu đãi" button for director and opens modal on click', async () => {
    render(<CustomerDirectory isDirector={true} />);

    await waitFor(() => {
      expect(screen.getByText('Khách hàng 1')).toBeDefined();
    });

    const loyaltyBtn = screen.getByRole('button', { name: /Ưu đãi/i });
    expect(loyaltyBtn).toBeDefined();

    // Click to open modal
    fireEvent.click(loyaltyBtn);

    // Modal dialog should open and load tiers
    await waitFor(() => {
      expect(screen.getByText('Thiết lập ưu đãi khách hàng')).toBeDefined();
      expect(screen.getByText('Bậc ưu đãi (2)')).toBeDefined();
      expect(screen.getByText('Bạc')).toBeDefined();
      expect(screen.getByText('Vàng')).toBeDefined();
      expect(screen.getAllByText(/Giảm 5%/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Giảm 10%/).length).toBeGreaterThanOrEqual(1);
    });

    // Close modal
    const closeBtns = screen.getAllByRole('button', { name: /Đóng/i });
    fireEvent.click(closeBtns[0]);

    await waitFor(() => {
      expect(screen.queryByText('Thiết lập ưu đãi khách hàng')).toBeNull();
    });
  });

  it('hides toolbar "Ưu đãi" button when isDirector is false', async () => {
    render(<CustomerDirectory isDirector={false} />);

    await waitFor(() => {
      expect(screen.getByText('Khách hàng 1')).toBeDefined();
    });

    expect(screen.queryByRole('button', { name: /Ưu đãi/i })).toBeNull();
  });
});
