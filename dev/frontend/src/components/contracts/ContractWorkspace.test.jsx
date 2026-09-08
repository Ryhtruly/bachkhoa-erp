import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ContractWorkspace from './ContractWorkspace'
import { apiFetch, getAccessToken } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(async () => ({ contract: {}, service_lines: [] })),
  getAccessToken: vi.fn(() => 'mock-token'),
}))

vi.mock('./ContractWorkflowDesigner', () => ({
  default: () => <div data-testid="workflow-designer" />,
}))

vi.mock('./PriorityBonusModal', () => ({
  default: () => null,
}))

describe('ContractWorkspace realtime subscription', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('subscribes without throwing, uses access token, and aborts on unmount', async () => {
    const abortSpy = vi.fn()
    vi.stubGlobal('AbortController', class {
      constructor() {
        this.signal = {}
      }
      abort = abortSpy
    })

    const reader = { read: vi.fn(async () => ({ done: true, value: undefined })) }
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    }))
    vi.stubGlobal('fetch', fetchSpy)

    const { unmount } = render(
      <ContractWorkspace
        tab="workflow"
        contract={{ id: 'HD-1' }}
        addToast={vi.fn()}
        isDirector
      />,
    )

    await waitFor(() => {
      expect(getAccessToken).toHaveBeenCalled()
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/contracts/timeline/events',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
        }),
      )
    })

    unmount()
    expect(abortSpy).toHaveBeenCalled()
    expect(apiFetch).toHaveBeenCalled()
  })

  it('does not open the director-only realtime stream for staff', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const { unmount } = render(
      <ContractWorkspace
        tab="workflow"
        contract={{ id: 'HD-1' }}
        addToast={vi.fn()}
        isDirector={false}
      />,
    )

    await waitFor(() => expect(fetchSpy).not.toHaveBeenCalled())
    unmount()
  })

  it('renders ContractHeaderDetails and toggles popover with customer details', async () => {
    const { fireEvent, screen } = await import('@testing-library/react')
    const { ContractHeaderDetails } = await import('./ContractWorkspace')

    const mockContract = {
      customer_name: 'Lê quang Tri',
      customer_phone: '0834310460',
      service_location: 'TP Thủ Đức',
      service_area: 120,
      total_value: 10000000,
    }

    const { unmount } = render(<ContractHeaderDetails contract={mockContract} />)

    expect(screen.getByText('Lê quang Tri')).toBeInTheDocument()
    expect(screen.getByText('0834310460')).toBeInTheDocument()
    expect(screen.getByText('10.000.000₫')).toBeInTheDocument()

    // Popover is closed initially
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Click Chi tiết button
    const toggleBtn = screen.getByRole('button', { name: /Xem chi tiết thông tin/i })
    fireEvent.click(toggleBtn)

    // Popover is now open
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Thông tin hợp đồng')).toBeInTheDocument()
    expect(screen.getByText('TP Thủ Đức')).toBeInTheDocument()
    expect(screen.getByText('120 m²')).toBeInTheDocument()

    // Close button works
    const closeBtn = screen.getByRole('button', { name: 'Đóng chi tiết' })
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    unmount()
  })
})
