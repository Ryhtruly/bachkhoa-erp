import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@fullcalendar/react', () => ({
  default: (props) => <div
    data-testid="calendar"
    data-slot-event-overlap={String(props.slotEventOverlap)}
    data-event-count={props.events.length}
    data-first-group-size={props.events[0]?.extendedProps.tasks?.length}
    data-first-duration-minutes={(props.events[0]?.end - props.events[0]?.start) / 60_000}
  />,
}))

import EmployeeWorkspaceCalendar from './EmployeeWorkspaceCalendar'

describe('EmployeeWorkspaceCalendar', () => {
  it('groups time-overlapping items into one vertical timetable block even when starts differ', () => {
    render(<EmployeeWorkspaceCalendar tasks={[
      { id: 'one', name: 'Việc 1', started_at: '2026-08-12T08:00:00Z', status: 'in_progress' },
      { id: 'two', name: 'Việc 2', started_at: '2026-08-12T08:10:00Z', status: 'in_progress' },
      { id: 'three', name: 'Việc 3', started_at: '2026-08-12T08:20:00Z', status: 'in_progress' },
    ]} />)

    expect(screen.getByTestId('calendar')).toHaveAttribute('data-slot-event-overlap', 'false')
    expect(screen.getByTestId('calendar')).toHaveAttribute('data-event-count', '1')
    expect(screen.getByTestId('calendar')).toHaveAttribute('data-first-group-size', '3')
    expect(screen.getByTestId('calendar')).toHaveAttribute('data-first-duration-minutes', '360')
  })
})
