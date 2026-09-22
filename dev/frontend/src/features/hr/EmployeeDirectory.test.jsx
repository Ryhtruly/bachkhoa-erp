import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../../contexts/ToastContext'
import { clearApiCache } from '../../lib/api'
import EmployeeDirectory from './EmployeeDirectory'

describe('EmployeeDirectory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    clearApiCache()
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

  it('supports accent-insensitive search matching unaccented input against accented fields', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).includes('/api/finance/employees/departments')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      if (String(url).includes('/api/finance/employees')) {
        return Promise.resolve(new Response(JSON.stringify([
          { id: 'emp-1', full_name: 'Nguyễn Văn An', department: 'Kỹ thuật', job_title: 'Kỹ sư', is_active: true },
          { id: 'emp-2', full_name: 'Trần Thị Bích', department: 'Kế toán', job_title: 'Kế toán viên', is_active: true },
        ]), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ToastProvider><EmployeeDirectory /></ToastProvider>)

    expect(await screen.findByText('Nguyễn Văn An')).toBeInTheDocument()
    expect(screen.getByText('Trần Thị Bích')).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText('Tìm kiếm...')
    // Search with unaccented "nguyen"
    fireEvent.change(searchInput, { target: { value: 'nguyen' } })

    expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument()
    expect(screen.queryByText('Trần Thị Bích')).not.toBeInTheDocument()

    // Search with unaccented "ky thuat"
    fireEvent.change(searchInput, { target: { value: 'ky thuat' } })
    expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument()
    expect(screen.queryByText('Trần Thị Bích')).not.toBeInTheDocument()

    // Search with unaccented "bich"
    fireEvent.change(searchInput, { target: { value: 'bich' } })
    expect(screen.queryByText('Nguyễn Văn An')).not.toBeInTheDocument()
    expect(screen.getByText('Trần Thị Bích')).toBeInTheDocument()
  })

  it('filters employees by active, inactive, and all status tabs', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).includes('/api/finance/employees/departments')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      if (String(url).includes('/api/finance/employees')) {
        return Promise.resolve(new Response(JSON.stringify([
          { id: 'emp-active', full_name: 'Hoàng Minh', department: 'Kinh doanh', job_title: 'Chuyên viên', is_active: true },
          { id: 'emp-inactive', full_name: 'Lê Văn Tèo', department: 'Hành chính', job_title: 'Bảo vệ', is_active: false },
        ]), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ToastProvider><EmployeeDirectory /></ToastProvider>)

    // Default status tab is "Đang làm" (active)
    expect(await screen.findByText('Hoàng Minh')).toBeInTheDocument()
    expect(screen.queryByText('Lê Văn Tèo')).not.toBeInTheDocument()

    // Switch to "Đã nghỉ" tab
    fireEvent.click(screen.getByRole('tab', { name: /đã nghỉ/i }))
    expect(screen.queryByText('Hoàng Minh')).not.toBeInTheDocument()
    expect(screen.getByText('Lê Văn Tèo')).toBeInTheDocument()

    // Switch to "Tất cả" tab
    fireEvent.click(screen.getByRole('tab', { name: /tất cả/i }))
    expect(screen.getByText('Hoàng Minh')).toBeInTheDocument()
    expect(screen.getByText('Lê Văn Tèo')).toBeInTheDocument()
  })
})
