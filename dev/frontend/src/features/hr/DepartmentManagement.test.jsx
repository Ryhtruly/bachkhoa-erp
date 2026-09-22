import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DepartmentManagement from './DepartmentManagement';
import { apiFetch } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

const mockDepartments = [
  {
    id: 'dept_tech',
    code: 'TECH',
    name: 'Phòng Kỹ thuật',
    is_active: true,
    display_order: 10,
    employee_count: 5,
  },
  {
    id: 'dept_legal',
    code: 'LEGAL',
    name: 'Phòng Pháp lý',
    is_active: false,
    display_order: 20,
    employee_count: 2,
  },
];

describe('DepartmentManagement component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders department list with active status and employee count', async () => {
    apiFetch.mockResolvedValue(mockDepartments);

    render(<DepartmentManagement isDirector={false} />);

    await screen.findByText('Phòng Kỹ thuật');
    expect(screen.getByText('TECH')).toBeInTheDocument();
    expect(screen.getByText('Phòng Pháp lý')).toBeInTheDocument();
    expect(screen.getByText('LEGAL')).toBeInTheDocument();
    expect(screen.getByText('Hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Tạm ngừng')).toBeInTheDocument();

    // Non-director should not see edit/toggle buttons
    expect(screen.queryByRole('button', { name: /Sửa phòng ban/i })).not.toBeInTheDocument();
  });

  it('allows director to edit department code and name via modal', async () => {
    apiFetch.mockImplementation(async (url, opts) => {
      if (opts?.method === 'PATCH') {
        return {
          status: 'success',
          data: {
            ...mockDepartments[0],
            code: 'TECH_NEW',
            name: 'Phòng Kỹ thuật & Đo đạc',
          },
        };
      }
      return mockDepartments;
    });

    render(<DepartmentManagement isDirector={true} />);

    await screen.findByText('Phòng Kỹ thuật');
    const editBtn = screen.getByLabelText('Sửa phòng ban Phòng Kỹ thuật');
    fireEvent.click(editBtn);

    expect(screen.getByRole('heading', { name: /Chỉnh sửa phòng ban/i })).toBeInTheDocument();
    const codeInput = screen.getByLabelText('Mã phòng ban');
    expect(codeInput).toHaveValue('TECH');
    const nameInput = screen.getByLabelText('Tên phòng ban');
    expect(nameInput).toHaveValue('Phòng Kỹ thuật');

    fireEvent.change(codeInput, { target: { value: 'tech_new' } });
    fireEvent.change(nameInput, { target: { value: 'Phòng Kỹ thuật & Đo đạc' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Lưu thay đổi' }).closest('form'));

    await waitFor(() => {
      const patchCall = apiFetch.mock.calls.find(([, opts]) => opts?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const [endpoint, options] = patchCall;
      expect(endpoint).toBe('/api/finance/departments/manage/dept_tech');
      expect(JSON.parse(options.body)).toEqual({
        code: 'TECH_NEW',
        name: 'Phòng Kỹ thuật & Đo đạc',
        display_order: 10,
        is_active: true,
      });
    });

    await screen.findByText('Phòng Kỹ thuật & Đo đạc');
  });

  it('allows director to toggle active/disable status', async () => {
    apiFetch.mockImplementation(async (url, opts) => {
      if (opts?.method === 'PATCH') {
        return {
          status: 'success',
          data: {
            ...mockDepartments[0],
            is_active: false,
          },
        };
      }
      return mockDepartments;
    });

    render(<DepartmentManagement isDirector={true} />);

    await screen.findByText('Phòng Kỹ thuật');
    const toggleBtn = screen.getByLabelText('Tắt phòng ban Phòng Kỹ thuật');
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      const patchCall = apiFetch.mock.calls.find(([, opts]) => opts?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const [endpoint, options] = patchCall;
      expect(endpoint).toBe('/api/finance/departments/manage/dept_tech');
      expect(JSON.parse(options.body)).toEqual({
        is_active: false,
      });
    });
  });

  it('filters departments using search input', async () => {
    apiFetch.mockResolvedValue(mockDepartments);

    render(<DepartmentManagement isDirector={true} />);

    await screen.findByText('Phòng Kỹ thuật');
    const searchInput = screen.getByLabelText('Tìm kiếm phòng ban');

    fireEvent.change(searchInput, { target: { value: 'Pháp lý' } });
    expect(screen.queryByText('Phòng Kỹ thuật')).not.toBeInTheDocument();
    expect(screen.getByText('Phòng Pháp lý')).toBeInTheDocument();
  });
});
