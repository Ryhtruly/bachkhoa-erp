import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PieceRatePayrollScreen from './PieceRatePayrollScreen';
import { ToastProvider } from '../../../contexts/ToastContext';

const response = data => Promise.resolve(new Response(JSON.stringify({ data }), { status: 200 }));

describe('PieceRatePayrollScreen payroll closing', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('requires the shared confirmation modal before closing payroll', async () => {
    const fetchMock = vi.fn((url, options = {}) => {
      if (String(url).includes('/api/payroll/options')) {
        return response({
          departments: [{
            id: 'dept-1', code: 'SURVEY', name: 'Phòng Đo vẽ',
            employees: [{ id: 'emp-1', full_name: 'Nguyễn Văn A', job_title: 'Software Engineer' }],
          }],
          years: [2026],
          default_year: 2026,
          default_month: 8,
        });
      }
      if (String(url).includes('/api/payroll/close-employee-period') && options.method === 'POST') {
        return response({ created_count: 29 });
      }
      if (String(url).includes('/api/payroll/employee-ledger')) {
        return response({
          employee: { id: 'emp-1', full_name: 'Nguyễn Văn A', job_title: 'Software Engineer', department: 'Phòng Đo vẽ' },
          period_status: 'Open',
          summary: { pending_record_count: 29, pending_record_total: 29000000 },
          details: [],
          adjustments: [],
          warnings: [],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ToastProvider><PieceRatePayrollScreen isDirector={true} /></ToastProvider>);

    fireEvent.click(await screen.findByRole('button', { name: /chốt lương \(29\)/i }, { timeout: 5000 }));

    const dialog = screen.getByRole('dialog', { name: 'Xác nhận chốt lương' });
    expect(within(dialog).getByText(/^29$/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole('button', { name: /^chốt lương$/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    });
  });

  it('uses a dedicated responsive layout class for the print preview modal', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).includes('/api/payroll/options')) {
        return response({
          departments: [{
            id: 'dept-1', code: 'SURVEY', name: 'Phòng Đo vẽ',
            employees: [{ id: 'emp-1', full_name: 'Nguyễn Văn A', job_title: 'Software Engineer' }],
          }],
          years: [2026],
          default_year: 2026,
          default_month: 8,
        });
      }
      if (String(url).includes('/api/payroll/employee-ledger')) {
        return response({
          employee: { id: 'emp-1', full_name: 'Nguyễn Văn A', job_title: 'Software Engineer', department: 'Phòng Đo vẽ' },
          period_status: 'Open',
          summary: { pending_record_count: 0, pending_record_total: 0 },
          details: [],
          adjustments: [],
          warnings: [],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ToastProvider><PieceRatePayrollScreen /></ToastProvider>);

    const printButton = await screen.findByRole('button', { name: /In phiếu lương/i }, { timeout: 5000 });
    await waitFor(() => expect(printButton).not.toBeDisabled());
    fireEvent.click(printButton);

    expect(await screen.findByRole('dialog', { name: /Xem trước bản in/i })).toBeInTheDocument();
    expect(document.querySelector('.payroll-preview-modal')).toBeInTheDocument();
  });
});
