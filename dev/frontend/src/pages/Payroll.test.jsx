import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../contexts/ToastContext'
import Payroll from './Payroll'

vi.mock('../features/employee-profile/EmployeeProfileModal', () => ({
  default: ({ open, employeeId }) => open ? <div>Profile: {employeeId}</div> : null,
}))

describe('Payroll employee directory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('opens the profile from a row while edit actions keep the profile closed', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).includes('/api/finance/employees/departments')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      if (String(url).includes('/api/finance/employees')) {
        return Promise.resolve(new Response(JSON.stringify([{
          id: 'emp-1', full_name: 'Nguyễn Văn A', department: 'Khảo sát', job_title: 'Kỹ sư',
          contract_status: 'Official', join_date: '2026-01-15', base_salary: 12000000, is_active: true,
        }]), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ data: { departments: [] } }), { status: 200 }))
    }))

    render(<ToastProvider><Payroll /></ToastProvider>)
    fireEvent.click(screen.getByText('Danh sách nhân sự'))

    const employeeName = await screen.findByText('Nguyễn Văn A')
    fireEvent.click(screen.getByLabelText('Sửa Nguyễn Văn A'))
    expect(screen.queryByText('Profile: emp-1')).not.toBeInTheDocument()

    fireEvent.click(employeeName)
    await waitFor(() => expect(screen.getByText('Profile: emp-1')).toBeInTheDocument())
  })
})
