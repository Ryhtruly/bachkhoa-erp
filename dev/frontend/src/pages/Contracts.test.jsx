import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Contracts from './Contracts'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))

vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
vi.mock('../components/location/LocationPicker', () => ({
  default: () => <div data-testid="location-picker">Địa chỉ chuẩn</div>,
}))

describe('Contracts', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the standardized location picker in the manual contract form', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [], pagination: {} }) })
      }
      if (url === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      if (url === '/api/contracts/next-code') return Promise.resolve({ ok: true, json: async () => ({ contract_id: '001/BK-2026' }) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    const { container } = render(<Contracts />)
    await waitFor(() => expect(container.querySelector('.contract-add-button')).toBeInTheDocument())
    fireEvent.click(container.querySelector('.contract-add-button'))

    expect(await screen.findByTestId('location-picker')).toBeInTheDocument()
  })
})
