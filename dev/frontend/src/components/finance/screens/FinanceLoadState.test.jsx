import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))

vi.mock('../../../lib/api', () => ({ apiFetch: apiFetchMock }))
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

import CashflowScreen from './CashflowScreen'
import ReceivablesScreen from './ReceivablesScreen'

afterEach(() => {
  cleanup()
  apiFetchMock.mockReset()
  vi.restoreAllMocks()
})

describe('Finance screen loading errors', () => {
  it('shows a retryable error instead of an empty cashflow table', async () => {
    let cashflowAttempts = 0
    apiFetchMock.mockImplementation((url) => {
      if (url.includes('/api/finance/cashflow?')) {
        cashflowAttempts += 1
        return cashflowAttempts === 1
          ? Promise.reject(new Error('Network unavailable'))
          : Promise.resolve([])
      }
      return Promise.resolve([])
    })

    render(<CashflowScreen isDirector />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu sổ quỹ')
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(apiFetchMock.mock.calls.filter(([url]) => url.includes('/api/finance/cashflow?'))).toHaveLength(2)
  })

  it('shows a retryable error instead of an empty receivables table', async () => {
    let receivablesAttempts = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    apiFetchMock.mockImplementation((url) => {
      if (url.includes('/api/finance/receivables')) {
        receivablesAttempts += 1
        return receivablesAttempts === 1
          ? Promise.reject(new Error('Network unavailable'))
          : Promise.resolve([])
      }
      return Promise.resolve([])
    })

    render(<ReceivablesScreen />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải dữ liệu công nợ')
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(apiFetchMock.mock.calls.filter(([url]) => url.includes('/api/finance/receivables'))).toHaveLength(2)
  })
})
