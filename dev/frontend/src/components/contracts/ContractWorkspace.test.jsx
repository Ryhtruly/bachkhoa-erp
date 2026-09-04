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
})
