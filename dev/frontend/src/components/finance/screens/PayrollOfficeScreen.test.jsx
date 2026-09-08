import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { apiFetchMock, addToastMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  addToastMock: vi.fn(),
}))

vi.mock('../../../lib/api', () => ({ apiFetch: apiFetchMock }))
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import PayrollOfficeScreen from './PayrollOfficeScreen'

afterEach(() => {
  cleanup()
  apiFetchMock.mockReset()
  addToastMock.mockReset()
})

describe('PayrollOfficeScreen sensitive actions', () => {
  it('passes the confirmation copy and loading state to SensitiveActionModal', async () => {
    const month = new Date().toISOString().slice(0, 7)
    apiFetchMock.mockImplementation((path) => {
      if (path.includes('/payroll?')) return Promise.resolve([{ id: 'payroll-1', full_name: 'Nhân sự 1', total_salary: 1000000 }])
      if (path.includes('/payroll/periods')) return Promise.resolve([{ id: 'period-1', period_month: `${month}-01`, status: 'open' }])
      return Promise.resolve([])
    })

    render(<PayrollOfficeScreen isDirector />)

    const lockButton = await screen.findByRole('button', { name: 'Chốt sổ lương (Giám đốc)' })
    fireEvent.click(lockButton)

    expect(screen.getByText('Sau khi chốt sổ, các chính sách lương và hoa hồng trong tháng sẽ được khóa cố định để kế toán thực hiện chi trả.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chốt sổ lương', exact: true })).toBeInTheDocument()
  })

  it('explains how to access all salary columns on narrow screens', async () => {
    const month = new Date().toISOString().slice(0, 7)
    apiFetchMock.mockImplementation((path) => {
      if (path.includes('/payroll?')) return Promise.resolve([{ id: 'payroll-1', full_name: 'Nhân sự 1', total_salary: 1000000 }])
      if (path.includes('/payroll/periods')) return Promise.resolve([{ id: 'period-1', period_month: `${month}-01`, status: 'open' }])
      return Promise.resolve([])
    })

    render(<PayrollOfficeScreen />)

    expect(await screen.findByText(/Vuốt ngang để xem đầy đủ các khoản lương/i)).toBeInTheDocument()
  })
})
