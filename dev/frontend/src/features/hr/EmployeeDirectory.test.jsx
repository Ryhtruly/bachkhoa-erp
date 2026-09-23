import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../../contexts/ToastContext'
import { clearApiCache } from '../../lib/api'
import EmployeeDirectory from './EmployeeDirectory'

describe('EmployeeDirectory', () => {
  afterEach(() => {
    clearApiCache()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('selects an employee into the detail panel, edits it, and does not send user_id in the PUT body', async () => {
    const fetchMock = vi.fn((url, options = {}) => {
      if (String(url).includes('/api/finance/employees/departments')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      if (String(url).includes('/api/finance/employees/emp-1') && options.method === 'PUT') {
        return Promise.resolve(new Response(JSON.stringify({ id: 'emp-1' }), { status: 200 }))
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
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ToastProvider><EmployeeDirectory /></ToastProvider>)

    // Detail panel starts empty until an employee is selected from the list.
    expect(screen.getByText('Chọn một nhân viên để xem chi tiết')).toBeInTheDocument()

    const listItem = await screen.findByText('Nguyễn Văn A')
    fireEvent.click(listItem)

    // View mode: detail panel header shows the selected employee, no inputs yet.
    const hero = document.querySelector('.hr-detail__hero')
    await waitFor(() => expect(within(hero).getByRole('heading', { name: 'Nguyễn Văn A' })).toBeInTheDocument())
    expect(screen.queryByPlaceholderText('Nguyễn Văn A')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /sửa/i }))

    // Edit mode: the full name field becomes an editable input pre-filled with the current value.
    await waitFor(() => expect(screen.getByDisplayValue('Nguyễn Văn A')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^lưu$/i }))

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([_url, options]) => options?.method === 'PUT')
      expect(putCall).toBeTruthy()
      expect(JSON.parse(putCall[1].body)).not.toHaveProperty('user_id')
    })
  })

  it('handles Director exception: hides probation fields and locks contract status', async () => {
    const directorEmployee = {
      id: 'emp_director',
      full_name: 'Lê Văn Sáu',
      department: 'Ban Giám đốc',
      job_title: 'Giám đốc điều hành',
      contract_status: 'Official',
      join_date: '2020-01-01',
      probation_end_date: null,
      base_salary: 50000000,
      is_active: true,
      citizen_id: '001085000123',
      citizen_id_place: 'Cục Cảnh sát QLHC về TTXH',
      bank_account_no: '99998888',
      bank_name: 'Vietcombank',
      tax_code: '8012345678',
    }

    const fetchMock = vi.fn((url, options = {}) => {
      if (String(url).includes('/api/finance/employees/departments')) {
        return Promise.resolve(new Response(JSON.stringify([{ id: 'dept-gd', name: 'Ban Giám đốc' }]), { status: 200 }))
      }
      if (String(url).includes('/api/finance/employees/emp_director') && options.method === 'PUT') {
        return Promise.resolve(new Response(JSON.stringify({ id: 'emp_director' }), { status: 200 }))
      }
      if (String(url).includes('/api/finance/employees')) {
        return Promise.resolve(new Response(JSON.stringify([directorEmployee]), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ToastProvider><EmployeeDirectory /></ToastProvider>)

    const listItem = await screen.findByText('Lê Văn Sáu')
    fireEvent.click(listItem)

    // View mode: Director should not have "Ngày hết hạn thử việc"
    const detailPanel = document.querySelector('.hr-detail')
    expect(within(detailPanel).queryByText('Ngày hết hạn thử việc')).not.toBeInTheDocument()
    // Should show onboarding fields in detail panel
    expect(within(detailPanel).getByText('001085000123')).toBeInTheDocument()
    expect(within(detailPanel).getByText('99998888')).toBeInTheDocument()

    // Switch to edit mode
    fireEvent.click(screen.getByRole('button', { name: /sửa/i }))

    // In edit mode for director: contract status input shows "Chính thức (Giám đốc)"
    await waitFor(() => expect(screen.getByDisplayValue('Chính thức (Giám đốc)')).toBeInTheDocument())
    expect(screen.queryByPlaceholderText('Chọn hạn thử việc')).not.toBeInTheDocument()

    // Save and verify payload
    fireEvent.click(screen.getByRole('button', { name: /^lưu$/i }))

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([_url, options]) => options?.method === 'PUT')
      expect(putCall).toBeTruthy()
      const body = JSON.parse(putCall[1].body)
      expect(body.contract_status).toBe('Official')
      expect(body.probation_end_date).toBeNull()
      expect(body.citizen_id).toBe('001085000123')
      expect(body.bank_name).toBe('Vietcombank')
    })
  })
})
