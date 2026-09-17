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
          status: 200,
          json: async () => ({
            data: [{ id: 'BK-HS001', title: 'Sổ tay nội bộ', category: 'Sổ tay nhân sự' }],
            meta: { total_pages: 1 },
          }),
        }
      }
      return { ok: true, status: 200, blob: async () => documentBlob }
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

  it('shows permission error toast when fetching wiki returns 403', async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/wiki/?')) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ detail: "Không có quyền 'read' trên tài nguyên 'wiki'" }),
        }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })

    render(<Wiki />)

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith('Bạn không có quyền xem tài liệu Wiki.', 'error')
    })
  })

  it('shows session expired error toast when fetching wiki returns 401', async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/wiki/?') || String(url).startsWith('/api/auth/refresh')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ detail: 'Phiên đăng nhập hết hạn' }),
        }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })

    render(<Wiki />)

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith('Phiên đăng nhập đã hết hạn.', 'error')
    })
  })

  it('hides "Thêm Tài Liệu Mới" button for regular employees', async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/wiki/?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [], meta: { total_pages: 1 } }),
        }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })

    render(<Wiki user={{ is_director: false, role_name: 'employee' }} isDirector={false} />)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Thêm Tài Liệu Mới/i })).toBeNull()
    })
  })

  it('shows "Thêm Tài Liệu Mới" button for director', async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/wiki/?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [], meta: { total_pages: 1 } }),
        }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })

    render(<Wiki user={{ is_director: true, role_name: 'admin' }} isDirector={true} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Thêm Tài Liệu Mới/i })).toBeInTheDocument()
    })
  })

  it('falls back to FilePreviewModal when popup window cannot be opened', async () => {
    const documentBlob = new Blob(['private wiki'], { type: 'application/pdf' })
    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/wiki/?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ id: 'ISO-001', title: 'Quy trình ISO', category: 'Quy trình ISO' }],
            meta: { total_pages: 1 },
          }),
        }
      }
      return { ok: true, status: 200, blob: async () => documentBlob }
    })
    setAccessToken('wiki-access-token')
    vi.spyOn(window, 'open').mockReturnValue(null)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:iso-doc'),
      revokeObjectURL: vi.fn(),
    })

    render(<Wiki />)
    fireEvent.click(await screen.findByRole('button', { name: /Mở file/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})
