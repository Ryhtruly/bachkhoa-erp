import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';
import { apiFetch } from '../lib/api';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
  };
});

describe('Dashboard greeting', () => {
  beforeEach(() => {
    apiFetch.mockImplementation((url) => {
      if (url.includes('/summary')) {
        return Promise.resolve({
          stats: { total_tasks: 10, in_progress: 3, overdue: 1, revenue: 100000000 },
          recent_tasks: [],
        });
      }
      if (url.includes('/charts')) {
        return Promise.resolve({
          lineData: [],
          barData: [],
          pieStatusData: [],
          pieExpenseData: [],
          topDebtors: [],
        });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders "Chào buổi sáng" at 09:00 AM', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-22T09:00:00'));

    render(<Dashboard user={{ full_name: 'Trần Văn Bình' }} />);

    expect(await screen.findByText(/Chào buổi sáng, Trần Văn Bình! 👋/)).toBeInTheDocument();
  });

  it('renders "Chào buổi trưa" at 12:30 PM', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-22T12:30:00'));

    render(<Dashboard user={{ full_name: 'Trần Văn Bình' }} />);

    expect(await screen.findByText(/Chào buổi trưa, Trần Văn Bình! 👋/)).toBeInTheDocument();
  });

  it('renders "Chào buổi chiều" at 15:30 PM', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-22T15:30:00'));

    render(<Dashboard user={{ full_name: 'Trần Văn Bình' }} />);

    expect(await screen.findByText(/Chào buổi chiều, Trần Văn Bình! 👋/)).toBeInTheDocument();
  });

  it('renders "Chào buổi tối" at 22:30 PM at night', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-22T22:30:00'));

    render(<Dashboard user={{ username: 'admin' }} />);

    expect(await screen.findByText(/Chào buổi tối, admin! 👋/)).toBeInTheDocument();
  });

  it('renders formatted dossier code for recent tasks without displaying raw UUID', async () => {
    apiFetch.mockImplementation((url) => {
      if (url.includes('/summary')) {
        return Promise.resolve({
          stats: { total_tasks: 2, in_progress: 1, overdue: 0, revenue: 50000000 },
          recent_tasks: [
            {
              id: 'dc0f2843-0903-4250-8f2b-b31369d0e621',
              contract_code: '015/BK-2026',
              customer_name: 'Nguyễn Văn Test',
              service_type: 'Trích lục',
              area: 'Bến Cát',
              status: 'in_progress',
            },
            {
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              customer_name: 'Khách Hàng Legacy',
              service_type: 'Cấp đổi',
              area: 'Dĩ An',
              status: 'pending',
            },
          ],
        });
      }
      if (url.includes('/charts')) {
        return Promise.resolve({
          lineData: [],
          barData: [],
          pieStatusData: [],
          pieExpenseData: [],
          topDebtors: [],
        });
      }
      return Promise.resolve({});
    });

    render(<Dashboard user={{ username: 'admin' }} />);

    // Contract code is shown
    expect(await screen.findByText('015/BK-2026')).toBeInTheDocument();
    // Raw UUID fallback is converted to HS-<8 chars>
    expect(await screen.findByText('HS-A1B2C3D4')).toBeInTheDocument();
    // Raw UUID strings should not be in the document
    expect(screen.queryByText('dc0f2843-0903-4250-8f2b-b31369d0e621')).not.toBeInTheDocument();
    expect(screen.queryByText('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).not.toBeInTheDocument();
  });
});

