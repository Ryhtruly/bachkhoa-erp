import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Contracts from './Contracts'
import { apiFetch } from '../lib/api'

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => 'token'),
  peekApiCache: vi.fn(),
  prefetchApi: vi.fn(),
}))
vi.mock('../components/contracts/ContractWorkspace', () => ({
  default: props => (
    <output data-testid="contract-workspace-target">
      {JSON.stringify({
        serviceLineId: props.targetServiceLineId,
        nodeKey: props.targetNodeKey,
        taskNodeId: props.targetTaskNodeId,
        targetType: props.targetType,
        targetId: props.targetId,
      })}
    </output>
  ),
}))
vi.mock('../features/contracts/ContractComposer', () => ({ default: () => null }))
vi.mock('../components/contracts/ContractDocumentViewer', () => ({ default: () => null }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Contracts nhận điều hướng chính xác từ chuông', () => {
  it('truyền đủ hạng mục, task node và target ID xuống workflow', async () => {
    apiFetch.mockImplementation(url => {
      if (String(url).startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({ data: [{ id: 'HD-1', service_lines: [] }], pagination: {} })
      }
      if (url === '/api/config') return Promise.resolve({ personnel: [], services: [] })
      if (url === '/api/catalog/service-packages') return Promise.resolve({ data: [] })
      return Promise.resolve([])
    })
    render(<Contracts isDirector />)
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())

    window.dispatchEvent(new CustomEvent('bachkhoa:navigate-to-node', {
      detail: {
        contractId: 'HD-1',
        serviceLineId: 'SL-1',
        nodeKey: 'node-k06',
        taskNodeId: 'TASK-K06',
        targetType: 'debt_review',
        targetId: 'DEBT-1',
        nonce: 9,
      },
    }))

    expect(await screen.findByTestId('contract-workspace-target')).toHaveTextContent(
      JSON.stringify({
        serviceLineId: 'SL-1',
        nodeKey: 'node-k06',
        taskNodeId: 'TASK-K06',
        targetType: 'debt_review',
        targetId: 'DEBT-1',
      }),
    )
  })
})
