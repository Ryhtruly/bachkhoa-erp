import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import EiwNodeHeader, { EiwStatusBand } from './EiwNodeHeader'
import { NODE_STATE_LABEL, PAUSE_LABEL } from './nodeLabels'

afterEach(cleanup)

describe('EiwNodeHeader', () => {
  it('renders node code and name', () => {
    render(<EiwNodeHeader task={{ node_code: 'K02', name: 'Khảo sát' }} />)
    expect(screen.getByRole('heading', { name: 'K02: Khảo sát' })).toBeInTheDocument()
  })

  it('applies eiw-band eiw-band--name class', () => {
    render(<EiwNodeHeader task={{ node_code: 'K01', name: 'Tiếp nhận' }} />)
    const h2 = screen.getByRole('heading')
    expect(h2).toHaveClass('eiw-band', 'eiw-band--name')
  })
})

describe('EiwStatusBand', () => {
  it('shows node state label for in_progress', () => {
    render(<EiwStatusBand task={{ status: 'in_progress' }} paused={false} />)
    expect(screen.getByText(NODE_STATE_LABEL.in_progress)).toBeInTheDocument()
  })

  it('shows pause label when paused', () => {
    render(
      <EiwStatusBand
        task={{ status: 'in_progress', pause_reason_type: 'AGENCY' }}
        paused
      />,
    )
    expect(screen.getByText(PAUSE_LABEL.AGENCY)).toBeInTheDocument()
  })

  it('shows fallback pause text for unknown reason_type', () => {
    render(
      <EiwStatusBand
        task={{ status: 'in_progress', pause_reason_type: 'UNKNOWN_REASON' }}
        paused
      />,
    )
    expect(screen.getByText('Đang tạm dừng')).toBeInTheDocument()
  })

  it('falls back to raw status when label missing', () => {
    render(<EiwStatusBand task={{ status: 'some_new_status' }} paused={false} />)
    expect(screen.getByText('some_new_status')).toBeInTheDocument()
  })

  it('applies eiw-band eiw-band--task and eiw-state classes', () => {
    render(<EiwStatusBand task={{ status: 'accepted' }} paused={false} />)
    const band = screen.getByText('Nhiệm vụ').closest('div')
    expect(band).toHaveClass('eiw-band', 'eiw-band--task')
    const stateEl = screen.getByText(NODE_STATE_LABEL.accepted)
    expect(stateEl).toHaveClass('eiw-state', 'is-accepted')
  })
})
