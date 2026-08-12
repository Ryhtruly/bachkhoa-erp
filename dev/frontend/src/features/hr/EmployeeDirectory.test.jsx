import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../../contexts/ToastContext'
import EmployeeDirectory from './EmployeeDirectory'

describe('EmployeeDirectory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('selects an employee into the detail panel and toggles edit mode', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).includes('/api/finance/employees/departments')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      if (String(url).includes('/api/finance/employees')) {
        return Promise.resolve(new Response(JSON.stringify([{
          id: 'emp-1', full_name: 'Nguyễn Văn A', department: 'Khảo sát', job_title: 'Kỹ sư',
          contract_status: 'Official', join_date: '2026-01-15', base_salary: 12000000, is_active: true,
          email: null, phone: null, gender: null, date_of_birth: null, place_of_birth: null,
          account_username: null, account_email: null, account_is_active: null,
        }]), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ data: { departments: [] } }), { status: 200 }))
    }))

    render(<ToastProvider><EmployeeDirectory /></ToastProvider>)

    // Detail panel starts empty until an employee is selected from the list.
    expect(screen.getByText('Chọn một nhân viên để xem chi tiết')).toBeInTheDocument()

    const listItem = await screen.findByText('Nguyễn Văn A')
    fireEvent.click(listItem)

    // View mode: detail panel header shows the selected employee, no inputs yet.
    const hero = document.querySelector('.hr-detail__hero')
    await waitFor(() => expect(within(hero).getByText('emp-1')).toBeInTheDocument())
    expect(screen.queryByPlaceholderText('Nguyễn Văn A')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /sửa/i }))

    // Edit mode: the full name field becomes an editable input pre-filled with the current value.
    await waitFor(() => expect(screen.getByDisplayValue('Nguyễn Văn A')).toBeInTheDocument())
  })
})
