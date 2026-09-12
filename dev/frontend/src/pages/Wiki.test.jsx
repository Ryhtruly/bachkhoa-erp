import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Wiki from './Wiki'
import { clearAccessToken, setAccessToken } from '../lib/api'

const addToast = vi.fn()

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ addToast }),
}))

describe('Wiki private documents', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    addToast.mockReset()
    window.localStorage.clear()
    clearAccessToken()
  })

  it('opens a Wiki document from an authenticated Blob fetch', async () => {
    const documentBlob = new Blob(['private wiki'], { type: 'application/pdf' })
    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/wiki/?')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: 'BK-HS001', title: 'Sổ tay nội bộ', category: 'Sổ tay nhân sự' }],
            meta: { total_pages: 1 },
          }),
        }
      }
      return { ok: true, blob: async () => documentBlob }
    })
    setAccessToken('wiki-access-token')
    const viewer = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(viewer)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:private-wiki'),
      revokeObjectURL: vi.fn(),
    })

    render(<Wiki />)
    fireEvent.click(await screen.findByRole('button', { name: /Mở file/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/wiki/download/BK-HS001',
        { headers: { Authorization: 'Bearer wiki-access-token' } },
      )
    })
    expect(viewer.location.href).toBe('blob:private-wiki')
  })
})
