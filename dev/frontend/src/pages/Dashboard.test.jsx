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
});
