import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import EiwMoneyBreakdown from './EiwMoneyBreakdown'

afterEach(cleanup)

describe('EiwMoneyBreakdown', () => {
  it('renders three rows: base, bonus, total', () => {
    render(<EiwMoneyBreakdown base={500000} bonus={250000} />)
    expect(screen.getByText('Khoán nhiệm vụ')).toBeInTheDocument()
    expect(screen.getByText('Thưởng dự kiến')).toBeInTheDocument()
    expect(screen.getByText('Tổng')).toBeInTheDocument()
  })

  it('formats VND correctly with thousands separator', () => {
    render(<EiwMoneyBreakdown base={500000} bonus={250000} />)
    expect(screen.getByText('500.000đ')).toBeInTheDocument()
    expect(screen.getByText('250.000đ')).toBeInTheDocument()
    expect(screen.getByText('750.000đ')).toBeInTheDocument()
  })

  it('shows "Thưởng" without "dự kiến" when settled', () => {
    render(<EiwMoneyBreakdown base={300000} bonus={100000} settled />)
    expect(screen.getByText('Thưởng')).toBeInTheDocument()
    expect(screen.queryByText('Thưởng dự kiến')).not.toBeInTheDocument()
  })

  it('shows "Thưởng dự kiến" when not settled', () => {
    render(<EiwMoneyBreakdown base={300000} bonus={100000} settled={false} />)
    expect(screen.getByText('Thưởng dự kiến')).toBeInTheDocument()
  })

  it('applies eiw-money class', () => {
    render(<EiwMoneyBreakdown base={0} bonus={0} />)
    expect(screen.getByText('Khoán nhiệm vụ').closest('dl')).toHaveClass('eiw-money')
  })

  it('applies is-total to the total row', () => {
    render(<EiwMoneyBreakdown base={100000} bonus={50000} />)
    const totalRow = screen.getByText('Tổng').closest('div')
    expect(totalRow).toHaveClass('eiw-money__row', 'is-total')
  })

  it('handles zero values', () => {
    render(<EiwMoneyBreakdown base={0} bonus={0} />)
    expect(screen.getAllByText('0đ')).toHaveLength(3)
  })

  it('handles missing/null values gracefully', () => {
    render(<EiwMoneyBreakdown />)
    expect(screen.getByText('Tổng')).toBeInTheDocument()
    // All three rows default to 0
    expect(screen.getAllByText('0đ')).toHaveLength(3)
  })

  it('handles string number values', () => {
    render(<EiwMoneyBreakdown base="300000" bonus="150000" />)
    expect(screen.getByText('300.000đ')).toBeInTheDocument()
    expect(screen.getByText('450.000đ')).toBeInTheDocument()
  })
})
