import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import EmployeePortalDashboard from './EmployeePortalDashboard'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('renders the employee workspace layout without the prototype navbar', async () => {
  apiFetch.mockResolvedValue({
    employee: { full_name: 'Nguyễn Văn A', job_title: 'Kỹ sư', department: 'Khảo sát', base_salary: 12000000 },
    tasks: [{ id: 'task-1', task_name: 'Đo đạc hiện trường', status: 'Đang thực hiện', deadline: '2026-08-20' }],
    leave_records: [{ id: 'leave-1', leave_type: 'Nghỉ phép', status: 'Đã duyệt', start_date: '2026-08-10', end_date: '2026-08-11' }],
    attendance: [{ id: 'attendance-1', date: '2026-08-08', status: 'Có mặt' }],
    latest_payroll: { month: '2026-07-01', total_salary: 13500000 },
  })

  render(<EmployeePortalDashboard />)

  expect(await screen.findByRole('heading', { name: 'Chào buổi sáng, Nguyễn Văn A' })).toBeInTheDocument()
  expect(screen.getByText('Trạng thái: Đang làm việc (Online) - Kỹ sư')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Check-out / Đã Check-in' })).toBeDisabled()
  expect(await screen.findByRole('heading', { name: /^Lịch làm việc ·/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Tuần trước' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Hiện tại' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Tuần sau' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Thông tin nghỉ phép' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Tin tức & Thông báo' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Tài liệu dự án gần đây' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Liên kết nhanh' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Công việc của tôi' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Chấm công' })).not.toBeInTheDocument()
  expect(screen.getAllByText('Chưa có dữ liệu').length).toBeGreaterThan(0)
  expect(screen.queryByText('1OFFICE')).not.toBeInTheDocument()
  expect(screen.queryByRole('banner')).not.toBeInTheDocument()
})

it('changes the displayed calendar week through the navigation control', async () => {
  apiFetch.mockResolvedValue({
    employee: { full_name: 'Nguyễn Văn A', job_title: 'Kỹ sư', department: 'Khảo sát' },
    tasks: [],
    leave_records: [],
    attendance: [],
    latest_payroll: null,
  })

  const { container } = render(<EmployeePortalDashboard />)

  await screen.findByRole('heading', { name: /^Lịch làm việc ·/ })
  expect(screen.getByText('Sáng')).toBeInTheDocument()
  expect(screen.getByText('Chiều')).toBeInTheDocument()
  const firstDayHeader = container.querySelector('.fc-col-header-cell-cushion')
  expect(firstDayHeader?.querySelector('.employee-workspace-calendar__weekday')).toBeInTheDocument()
  expect(firstDayHeader?.querySelector('.employee-workspace-calendar__date')).toBeInTheDocument()
  const firstDayBefore = container.querySelector('.fc-col-header-cell')?.textContent
  fireEvent.click(screen.getByRole('button', { name: 'Tuần sau' }))
  await waitFor(() => expect(container.querySelector('.fc-col-header-cell')?.textContent).not.toBe(firstDayBefore))
})
