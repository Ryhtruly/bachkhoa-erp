import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CRM from './CRM';
import { ToastProvider } from '../contexts/ToastContext';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../lib/api';

const mockLeads = [
  {
    id: 'lead-001',
    customer_name: 'Nguyễn Văn Khách 1',
    phone: '0901234567',
    source: 'Web Form (Zalo)',
    requirements: 'Dịch vụ: Đo hiện trạng | Quy mô: 150 m2 | Địa chỉ BĐS: Quận 9',
    status: 'Tiếp cận',
    assigned_to: 'user-sale-1',
    assigned_to_name: 'Trần Sale 1',
    assigned_to_avatar_url: 'https://example.com/avatar1.jpg',
    created_at: '2026-09-19 10:00',
  },
  {
    id: 'lead-002',
    customer_name: 'Trần Thị Khách 2',
    phone: '0912345678',
    source: 'Facebook',
    requirements: 'Dịch vụ: Cấp đổi sổ | Quy mô: 1 bộ hồ sơ',
    status: 'Tiếp cận',
    assigned_to: null,
    created_at: '2026-09-19 11:00',
  },
];

const mockStats = {
  total_leads: 10,
  in_progress: 6,
  won_leads: 4,
  win_rate: 40,
};

const mockPolicy = {
  commission_rate_percent: 5,
  max_workload_points: 15,
  warning_workload_ratio: 0.8,
  max_open_leads: 20,
  stage_weights: { 'Tiếp cận': 1, 'Báo giá': 2, 'Đàm phán': 3 },
};

function renderCRM(props = {}) {
  return render(
    <ToastProvider>
      <CRM {...props} />
    </ToastProvider>
  );
}

describe('CRM Component — Sales and Director views', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/api/intake/services')) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              status: 'success',
              data: [
                {
                  id: 'sp_001',
                  name: 'Đo Vẽ Bản Đồ',
                  services: [
                    { id: 'tt_001', name: 'Đo hiện trạng vị trí' },
                    { id: 'tt_002', name: 'Cắm mốc ranh giới' },
                  ],
                },
              ],
            }),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });

    apiFetch.mockImplementation((url, options = {}) => {
      if (url.includes('/api/crm/leads')) {
        return Promise.resolve({ status: 'success', data: mockLeads });
      }
      if (url.includes('/api/crm/stats')) {
        return Promise.resolve({ status: 'success', data: mockStats });
      }
      if (url.includes('/api/crm/settings')) {
        return Promise.resolve({ status: 'success', data: mockPolicy });
      }
      return Promise.resolve({ status: 'success', data: {} });
    });
  });

  it('renders Sales employee view with "scope=mine", restricted controls, and claim button', async () => {
    renderCRM({
      user: { id: 'user-sale-1', username: 'sale1', role_name: 'sales' },
      isDirector: false,
      employeeMode: true,
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/crm/leads?scope=mine');
      expect(apiFetch).toHaveBeenCalledWith('/api/crm/stats?scope=mine');
    });

    // Sales staff sees personal stats
    expect(screen.getByText('Lead Của Tôi')).toBeInTheDocument();
    expect(screen.getByText('Tỷ Lệ Hoa Hồng')).toBeInTheDocument();

    // Sales staff does NOT see Director CRM Settings button
    expect(screen.queryByRole('button', { name: /thiết lập crm/i })).not.toBeInTheDocument();

    // Lead names render
    expect(await screen.findByText('Nguyễn Văn Khách 1')).toBeInTheDocument();
    expect(screen.getByText('Trần Thị Khách 2')).toBeInTheDocument();

    // Unassigned card displays claim button
    expect(screen.getByRole('button', { name: /nhận lead này/i })).toBeInTheDocument();
  });

  it('allows Sales staff to claim an unassigned lead', async () => {
    apiFetch.mockImplementation((url, options = {}) => {
      if (url.includes('/claim')) {
        return Promise.resolve({ status: 'success', data: { id: 'lead-002', assigned_to: 'user-sale-1' } });
      }
      if (url.includes('/api/crm/leads')) {
        return Promise.resolve({ status: 'success', data: mockLeads });
      }
      if (url.includes('/api/crm/stats')) {
        return Promise.resolve({ status: 'success', data: mockStats });
      }
      return Promise.resolve({ status: 'success' });
    });

    renderCRM({
      user: { id: 'user-sale-1', username: 'sale1', role_name: 'sales' },
      isDirector: false,
      employeeMode: true,
    });

    const claimBtn = await screen.findByRole('button', { name: /nhận lead này/i });
    fireEvent.click(claimBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/crm/leads/lead-002/claim', { method: 'POST' });
    });
  });

  it('enforces sales isolation: in "Báo giá" column only shows user own items, never items of other sales', async () => {
    const customLeads = [
      {
        id: 'lead-contact-pool',
        customer_name: 'Khách Bể Chung',
        phone: '0901111111',
        source: 'Web Form (Zalo)',
        requirements: 'Đo hiện trạng',
        status: 'Tiếp cận',
        assigned_to: null,
      },
      {
        id: 'lead-contact-other',
        customer_name: 'Khách Tiếp Cận Sale Khác',
        phone: '0902222222',
        source: 'Facebook',
        requirements: 'Đo hiện trạng',
        status: 'Tiếp cận',
        assigned_to: 'user-sale-2',
      },
      {
        id: 'lead-quote-mine',
        customer_name: 'Khách Báo Giá Của Tôi',
        phone: '0903333333',
        source: 'Hotline',
        requirements: 'Báo giá đo đạc',
        status: 'Báo giá',
        assigned_to: 'user-sale-1',
      },
      {
        id: 'lead-quote-other',
        customer_name: 'Khách Báo Giá Sale Khác',
        phone: '0904444444',
        source: 'Zalo',
        requirements: 'Báo giá cắm mốc',
        status: 'Báo giá',
        assigned_to: 'user-sale-2',
      },
      {
        id: 'lead-quote-unassigned',
        customer_name: 'Khách Báo Giá Chưa Nhận',
        phone: '0905555555',
        source: 'Web',
        requirements: 'Báo giá',
        status: 'Báo giá',
        assigned_to: null,
      },
    ];

    apiFetch.mockImplementation((url) => {
      if (url.includes('/api/crm/leads')) {
        return Promise.resolve({ status: 'success', data: customLeads });
      }
      if (url.includes('/api/crm/stats')) {
        return Promise.resolve({ status: 'success', data: mockStats });
      }
      return Promise.resolve({ status: 'success', data: {} });
    });

    renderCRM({
      user: { id: 'user-sale-1', username: 'sale1', role_name: 'sales' },
      isDirector: false,
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/crm/leads?scope=mine');
    });

    // In 'Tiếp cận': unassigned lead is visible (first come first served claim pool)
    expect(await screen.findByText('Khách Bể Chung')).toBeInTheDocument();
    // In 'Tiếp cận': another sale's lead is NOT visible
    expect(screen.queryByText('Khách Tiếp Cận Sale Khác')).not.toBeInTheDocument();

    // In 'Báo giá': user's own quotation lead is visible
    expect(screen.getByText('Khách Báo Giá Của Tôi')).toBeInTheDocument();
    // In 'Báo giá': another sale's quotation is NOT visible
    expect(screen.queryByText('Khách Báo Giá Sale Khác')).not.toBeInTheDocument();
    // In 'Báo giá': unassigned lead in quote stage is NOT visible
    expect(screen.queryByText('Khách Báo Giá Chưa Nhận')).not.toBeInTheDocument();
  });

  it('renders Director view with owner badge, avatar, and Settings modal', async () => {
    renderCRM({
      user: { id: 'user-director', username: 'admin', role_name: 'admin' },
      isDirector: true,
      employeeMode: false,
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/crm/leads?scope=all');
    });

    // In director view, assigned lead displays owner badge with name
    expect(await screen.findByText('Trần Sale 1')).toBeInTheDocument();

    // Director sees Settings button
    const settingsBtn = screen.getByRole('button', { name: /thiết lập crm/i });
    expect(settingsBtn).toBeInTheDocument();

    // Opens settings modal
    fireEvent.click(settingsBtn);
    await waitFor(() => {
      expect(screen.getByText('Hoa hồng Sale')).toBeInTheDocument();
      expect(screen.getByText('Giới hạn tải Sale')).toBeInTheDocument();
    });
  });

  it('calculates and previews sales commission live in Closing modal', async () => {
    renderCRM({
      user: { id: 'user-director', username: 'admin', role_name: 'admin' },
      isDirector: true,
      employeeMode: false,
    });

    await screen.findByText('Nguyễn Văn Khách 1');

    // Move first lead to Chốt
    const selectInputs = screen.getAllByTitle(/chọn cột để chuyển trạng thái/i);
    fireEvent.change(selectInputs[0], { target: { value: 'Chốt' } });

    // Closing modal opens
    expect(await screen.findByText('Chốt Deal & Sinh Hợp Đồng Tự Động')).toBeInTheDocument();

    // Input price 20,000,000
    const priceInput = screen.getByPlaceholderText(/ví dụ: 15000000/i);
    fireEvent.change(priceInput, { target: { value: '20000000' } });

    // Currency and commission calculation displays
    expect(screen.getByText('20.000.000 VNĐ')).toBeInTheDocument();
    expect(screen.getByText(/Hoa hồng Sale áp dụng/)).toBeInTheDocument();
  });

  it('allows customizing QR code with added packages and line items', async () => {
    renderCRM({
      user: { id: 'user-sale-1', username: 'sale1', role_name: 'sales' },
      isDirector: false,
      employeeMode: true,
    });

    const qrBtn = await screen.findByRole('button', { name: /mã qr form/i });
    fireEvent.click(qrBtn);

    // QR modal opens
    expect(await screen.findByText(/Chọn Gói Dịch Vụ & Hạng Mục Cho Mã QR/i)).toBeInTheDocument();

    // Package dropdown options populated
    const pkgSelect = screen.getByDisplayValue('— Tất cả dịch vụ (Mặc định) —');
    expect(pkgSelect).toBeInTheDocument();
  });

  it('auto-claims unassigned lead when user changes column directly from select dropdown', async () => {
    apiFetch.mockImplementation((url, options = {}) => {
      if (url.includes('/claim')) {
        return Promise.resolve({ status: 'success', data: { id: 'lead-002', assigned_to: 'user-sale-1' } });
      }
      if (url.includes('/status')) {
        return Promise.resolve({ status: 'success', data: { id: 'lead-002', status: 'Báo giá' } });
      }
      if (url.includes('/api/crm/leads')) {
        return Promise.resolve({ status: 'success', data: mockLeads });
      }
      if (url.includes('/api/crm/stats')) {
        return Promise.resolve({ status: 'success', data: mockStats });
      }
      return Promise.resolve({ status: 'success', data: {} });
    });

    renderCRM({
      user: { id: 'user-sale-1', username: 'sale1', role_name: 'sales' },
      isDirector: false,
      employeeMode: true,
    });

    await screen.findByText('Trần Thị Khách 2');

    // Change status of second lead (lead-002 which is unassigned)
    const selectInputs = screen.getAllByTitle(/chọn cột để chuyển trạng thái/i);
    fireEvent.change(selectInputs[1], { target: { value: 'Báo giá' } });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/crm/leads/lead-002/claim', { method: 'POST' });
      expect(apiFetch).toHaveBeenCalledWith('/api/crm/leads/lead-002/status', expect.objectContaining({ method: 'PUT' }));
    });
  });
});

