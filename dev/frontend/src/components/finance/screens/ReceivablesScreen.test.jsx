import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { apiFetchMock, downloadFileMock, addToastMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  downloadFileMock: vi.fn(),
  addToastMock: vi.fn(),
}))

vi.mock('../../../lib/api', () => ({ apiFetch: apiFetchMock, downloadFile: downloadFileMock }))
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ addToast: addToastMock }) }))
vi.mock('../print/FinancePrintReport', () => ({
  default: ({ rows = [], footerRow }) => (
    <div>
      <div data-testid="receivables-print-row-count">{rows.length}</div>
      <div data-testid="receivables-print-remaining">{footerRow?.remaining_amount}</div>
    </div>
  ),
}))
vi.mock('../print/printDocument', () => ({ printElement: vi.fn() }))

import ReceivablesScreen from './ReceivablesScreen'

afterEach(() => {
  cleanup()
  apiFetchMock.mockReset()
  downloadFileMock.mockReset()
  addToastMock.mockReset()
})

describe('ReceivablesScreen printing and export', () => {
  it('prints and exports the currently filtered receivables', async () => {
    apiFetchMock.mockResolvedValue([
      { contract_id: 'HD-001', customer_name: 'Khách hàng A', total_value: 100, paid_amount: 0, remaining_amount: 100 },
      { contract_id: 'HD-002', customer_name: 'Khách hàng B', total_value: 200, paid_amount: 0, remaining_amount: 200 },
    ])
    downloadFileMock.mockResolvedValue('So_Cong_No_Phai_Thu.xlsx')

    render(<ReceivablesScreen isDirector />)
    await waitFor(() => expect(screen.getByTestId('receivables-print-row-count')).toHaveTextContent('2'))

    fireEvent.change(screen.getByPlaceholderText(/mã hợp đồng, khách hàng/i), { target: { value: 'HD-001' } })
    await waitFor(() => expect(screen.getByTestId('receivables-print-row-count')).toHaveTextContent('1'))

    fireEvent.click(screen.getByRole('button', { name: /Xuất Excel/i }))
    expect(downloadFileMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/finance/export/receivables-excel'),
      expect.stringContaining('.xlsx'),
    )
  })

  it('excludes overpaid contracts from remaining debt sum in print footerRow and summary card', async () => {
    apiFetchMock.mockResolvedValue([
      { contract_id: 'HD-001', customer_name: 'Khách hàng A', total_value: 100, paid_amount: 0, remaining_amount: 100, is_overpaid: false },
      { contract_id: 'HD-002', customer_name: 'Khách hàng B', total_value: 200, paid_amount: 250, remaining_amount: 50, is_overpaid: true },
    ])

    render(<ReceivablesScreen isDirector />)
    await waitFor(() => expect(screen.getByTestId('receivables-print-row-count')).toHaveTextContent('2'))

    // The overpaid contract (HD-002) should contribute 0 to remaining debt, so remaining is 100₫ (formatted as 100₫)
    const printRemaining = screen.getByTestId('receivables-print-remaining')
    expect(printRemaining.textContent).toMatch(/100/)
    expect(printRemaining.textContent).not.toMatch(/150/)
  })
})
