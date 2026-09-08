import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))

vi.mock('../../../lib/api', () => ({ apiFetch: apiFetchMock }))
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

import MonthlyDashboardScreen from './MonthlyDashboardScreen'
import PieceRatePricingScreen from './PieceRatePricingScreen'

afterEach(() => {
  cleanup()
  apiFetchMock.mockReset()
})

describe('Finance responsive layout hooks', () => {
  it('exposes stable layout hooks for the monthly dashboard', async () => {
    apiFetchMock.mockResolvedValue({
      month: 8,
      year: 2026,
      total_income: 0,
      total_expenditure: 0,
      net_difference: 0,
      categories: [],
      departments: [],
    })

    render(<MonthlyDashboardScreen month="2026-08" />)

    expect(await screen.findByTestId('finance-monthly-dashboard')).toHaveClass('finance-monthly-dashboard')
    expect(screen.getByTestId('finance-monthly-summary')).toHaveClass('finance-monthly-dashboard__summary-grid')
    expect(screen.getAllByTestId('finance-monthly-split')).toHaveLength(2)
  })

  it('exposes a scroll boundary for pricing history on narrow screens', async () => {
    apiFetchMock.mockResolvedValue({ data: [] })

    render(<PieceRatePricingScreen />)

    expect(await screen.findByTestId('piece-rate-pricing')).toHaveClass('piece-rate-pricing')
  })

  it('omits zero-activity categories from the monthly print report', async () => {
    apiFetchMock.mockResolvedValue({
      month: 8,
      year: 2026,
      total_income: 200,
      total_expenditure: 150,
      net_difference: 50,
      categories: [
        { name: 'Không phát sinh', income: 0, expenditure: 0 },
        { name: 'Có thu', income: 200, expenditure: 0 },
        { name: 'Có chi', income: 0, expenditure: 150 },
        { name: 'Bù trừ trong kỳ', income: 100, expenditure: 100 },
      ],
      departments: [],
    })

    render(<MonthlyDashboardScreen month="2026-08" />)
    fireEvent.click(await screen.findByRole('button', { name: /Xem Trước & In A4/i }))

    const printTable = document.querySelector('.finance-print-table')
    expect(printTable).toBeInTheDocument()
    expect(within(printTable).getByText('Có thu')).toBeInTheDocument()
    expect(within(printTable).getByText('Có chi')).toBeInTheDocument()
    expect(within(printTable).getByText('Bù trừ trong kỳ')).toBeInTheDocument()
    expect(within(printTable).queryByText('Không phát sinh')).not.toBeInTheDocument()
  })
})
