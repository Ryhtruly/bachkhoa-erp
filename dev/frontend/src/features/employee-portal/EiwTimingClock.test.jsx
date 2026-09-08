import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import EiwTimingClock from './EiwTimingClock'

afterEach(cleanup)

const NOW = new Date('2026-09-03T10:00:00Z').getTime()

describe('EiwTimingClock', () => {
  it('renders "Thời gian còn lại" label by default', () => {
    render(
      <EiwTimingClock
        task={{ deadline_at: '2026-09-05T00:00:00Z' }}
        now={NOW}
      />,
    )
    expect(screen.getByText('Thời gian còn lại')).toBeInTheDocument()
  })

  it('uses custom PREFIX', () => {
    render(
      <EiwTimingClock
        task={{ deadline_at: '2026-09-05T00:00:00Z' }}
        now={NOW}
        PREFIX="Hạn còn lại"
      />,
    )
    expect(screen.getByText('Hạn còn lại')).toBeInTheDocument()
  })

  it('shows normal tone for >1 day remaining', () => {
    render(
      <EiwTimingClock
        task={{ deadline_at: '2026-09-05T00:00:00Z' }}
        now={NOW}
      />,
    )
    const value = screen.getByText(/Còn/)
    expect(value.closest('span')).toHaveClass('eiw-clock__value', 'is-normal')
  })

  it('shows urgent tone for <1 day remaining', () => {
    render(
      <EiwTimingClock
        task={{ deadline_at: '2026-09-03T20:00:00Z' }}
        now={NOW}
      />,
    )
    const value = screen.getByText(/Còn/)
    expect(value.closest('span')).toHaveClass('eiw-clock__value', 'is-urgent')
  })

  it('shows overdue tone when past deadline', () => {
    render(
      <EiwTimingClock
        task={{ deadline_at: '2026-09-02T00:00:00Z' }}
        now={NOW}
      />,
    )
    const value = screen.getByText(/Quá hạn/)
    expect(value.closest('span')).toHaveClass('eiw-clock__value', 'is-overdue')
  })

  it('shows paused state with frozen indicator', () => {
    render(
      <EiwTimingClock
        task={{
          deadline_at: '2026-09-05T00:00:00Z',
          paused_at: '2026-09-01T00:00:00Z',
        }}
        now={NOW}
      />,
    )
    expect(screen.getByText('đồng hồ đã dừng')).toBeInTheDocument()
    expect(screen.getByText(/Còn/).closest('span')).toHaveClass('eiw-clock__value', 'is-paused')
  })

  it('shows "Không đặt hạn" when no deadline', () => {
    render(<EiwTimingClock task={{}} now={NOW} />)
    expect(screen.getByText('Không đặt hạn')).toBeInTheDocument()
    expect(screen.getByText('Không đặt hạn').closest('span')).toHaveClass('eiw-clock__value', 'is-none')
  })

  it('shows rework deadline when status is rework_required', () => {
    render(
      <EiwTimingClock
        task={{
          status: 'rework_required',
          deadline_at: '2026-09-01T00:00:00Z',
          rework_deadline_at: '2026-09-10T00:00:00Z',
        }}
        now={NOW}
      />,
    )
    const value = screen.getByText(/Còn/)
    expect(value.closest('span')).toHaveClass('eiw-clock__value', 'is-normal')
  })

  it('does not tick when `now` prop is provided (test determinism)', () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })

    const deadlineMs = NOW + 90 * 60_000 // 90 minutes from NOW → normal
    render(
      <EiwTimingClock
        task={{ deadline_at: new Date(deadlineMs).toISOString() }}
        now={NOW}
      />,
    )
    expect(screen.getByText(/1 giờ 30 phút/)).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(30 * 60_000) })
    expect(screen.getByText(/1 giờ 30 phút/)).toBeInTheDocument()

    vi.useRealTimers()
    cleanup()
  })
})

describe('EiwTimingClock — live ticking (no now prop)', () => {
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('advances countdown over real time and crosses urgency threshold', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)

    const deadlineMs = NOW + 30 * 60_000 // 30 min from base → urgent (<1 day)
    render(
      <EiwTimingClock
        task={{ deadline_at: new Date(deadlineMs).toISOString() }}
      />,
    )

    const valueSpan = screen.getByText(/Còn/).closest('span')
    expect(valueSpan).toHaveClass('eiw-clock__value', 'is-urgent')
    expect(screen.getByText(/30 phút/)).toBeInTheDocument()

    // Advance 25 minutes → still urgent, 5 min remaining
    act(() => { vi.advanceTimersByTime(25 * 60_000) })
    expect(screen.getByText(/Còn 5 phút/)).toBeInTheDocument()
    expect(screen.getByText(/Còn/).closest('span')).toHaveClass('eiw-clock__value', 'is-urgent')

    // Advance past deadline → overdue
    act(() => { vi.advanceTimersByTime(10 * 60_000) })
    expect(screen.getByText(/Quá hạn/)).toBeInTheDocument()
    expect(screen.getByText(/Quá hạn/).closest('span')).toHaveClass('eiw-clock__value', 'is-overdue')
  })

  it('does not tick when paused', () => {
    vi.useFakeTimers()

    const deadlineMs = NOW + 2 * 24 * 60_000 // 2 days from NOW
    render(
      <EiwTimingClock
        task={{
          deadline_at: new Date(deadlineMs).toISOString(),
          paused_at: new Date(NOW).toISOString(),
        }}
      />,
    )

    expect(screen.getByText('đồng hồ đã dừng')).toBeInTheDocument()
    const textAfterMount = screen.getByText(/Còn/).closest('span').textContent

    act(() => { vi.advanceTimersByTime(60 * 60_000) })
    expect(screen.getByText(/Còn/).closest('span').textContent).toBe(textAfterMount)
    expect(screen.getByText('đồng hồ đã dừng')).toBeInTheDocument()
  })
})
