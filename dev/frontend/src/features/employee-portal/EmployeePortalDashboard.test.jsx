import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import EmployeePortalDashboard from './EmployeePortalDashboard'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))

it('renders live employee dashboard data without the prototype navbar', async () => {
  apiFetch.mockResolvedValue({
    employee: { full_name: 'Nguyễn Văn A', job_title: 'Kỹ sư', department: 'Khảo sát', base_salary: 12000000 },
    tasks: [{ id: 'task-1', task_name: 'Đo đạc hiện trường', status: 'Đang thực hiện', deadline: '2026-08-20' }],
    leave_records: [{ id: 'leave-1', leave_type: 'Nghỉ phép', status: 'Đã duyệt', start_date: '2026-08-10', end_date: '2026-08-11' }],
    attendance: [{ id: 'attendance-1', date: '2026-08-08', status: 'Có mặt' }],
    latest_payroll: { month: '2026-07-01', total_salary: 13500000 },
  })

  render(<EmployeePortalDashboard />)

  expect(await screen.findByRole('heading', { name: 'Chào Nguyễn Văn A' })).toBeInTheDocument()
  expect(screen.getByText('Đo đạc hiện trường')).toBeInTheDocument()
  expect(screen.getAllByText('Chưa có dữ liệu').length).toBeGreaterThan(0)
  expect(screen.queryByText('1OFFICE')).not.toBeInTheDocument()
  expect(screen.queryByRole('banner')).not.toBeInTheDocument()
})
