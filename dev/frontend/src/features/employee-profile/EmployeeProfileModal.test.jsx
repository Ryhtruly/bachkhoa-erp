import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiFetch } from '../../lib/api'
import EmployeeProfileModal from './EmployeeProfileModal'

vi.mock('../../lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(status, message) {
      super(message)
      this.status = status
    }
  },
  apiFetch: vi.fn(),
}))

const profile = {
  employee: {
    id: 'emp-1',
    full_name: 'Nguyễn Văn A',
    department: 'Khảo sát',
    job_title: 'Kỹ sư đo đạc',
    email: 'a@example.test',
    join_date: '2026-01-15',
    base_salary: 12000000,
    is_active: true,
  },
  tasks: [],
  leave_records: [],
  attendance: [],
  latest_payroll: null,
}

describe('EmployeeProfileModal', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders live employee data without the prototype header and marks unavailable sections', async () => {
    apiFetch.mockResolvedValue(profile)

    render(<EmployeeProfileModal open employeeId="emp-1" onClose={vi.fn()} />)

    expect(screen.getByText('Đang tải hồ sơ...')).toBeInTheDocument()
    expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(screen.getByText('Khảo sát')).toBeInTheDocument()
    expect(screen.getAllByText('Chưa có dữ liệu').length).toBeGreaterThan(0)
    expect(screen.queryByText('1OFFICE')).not.toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith('/api/employee-portal/employees/emp-1')
  })

  it('renders the dialog at the document root with a dedicated dark backdrop', async () => {
    apiFetch.mockResolvedValue(profile)

    render(<EmployeeProfileModal open employeeId="emp-1" onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog.parentElement).toBe(document.body)
    expect(dialog).toHaveClass('employee-profile-overlay')
  })

  it('renders a permission error without showing profile data', async () => {
    apiFetch.mockRejectedValue(new ApiError(403, 'Không đủ quyền xem hồ sơ nhân sự.'))

    render(<EmployeeProfileModal open employeeId="emp-1" onClose={vi.fn()} />)

    expect(await screen.findByText('Không đủ quyền xem hồ sơ nhân sự.')).toBeInTheDocument()
    expect(screen.queryByText('Nguyễn Văn A')).not.toBeInTheDocument()
  })
})
