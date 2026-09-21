import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Wiki from './Wiki'
import { clearAccessToken, setAccessToken } from '../lib/api'
import * as fileSave from '../lib/fileSave'

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

  it('opens a Wiki document in FilePreviewModal with proper filename and extension', async () => {
    const documentBlob = new Blob(['private wiki'], { type: 'application/pdf' })
    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/wiki/?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ id: 'BK-HS001', title: 'Sổ tay nội bộ', category: 'Sổ tay nhân sự', link: 'wiki/BK-HS001/so_tay.pdf' }],
            meta: { total_pages: 1 },
          }),
        }
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          'content-disposition': 'inline; filename="so_tay.pdf"',
          'content-type': 'application/pdf',
        }),
        blob: async () => documentBlob,
      }
    })
    setAccessToken('wiki-access-token')
    const openSpy = vi.spyOn(window, 'open')
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
    expect(openSpy).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Xem tài liệu Sổ tay nội bộ\.pdf/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tải xuống/i })).toHaveAttribute('download', 'Sổ tay nội bộ.pdf')
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

  it('opens a DOCX Wiki document in FilePreviewModal with .docx extension', async () => {
    const documentBlob = new Blob(['docx bytes'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/wiki/?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ id: 'ISO-001', title: 'Quy trình ISO', category: 'Quy trình ISO', link: 'wiki/ISO-001/quy_trinh.docx' }],
            meta: { total_pages: 1 },
          }),
        }
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          'content-disposition': 'inline; filename="quy_trinh.docx"',
          'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
        blob: async () => documentBlob,
      }
    })
    setAccessToken('wiki-access-token')
    const openSpy = vi.spyOn(window, 'open')
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
    expect(openSpy).not.toHaveBeenCalled()
    expect(screen.getByText(/Xem tài liệu Quy trình ISO\.docx/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tải xuống/i })).toHaveAttribute('download', 'Quy trình ISO.docx')
    expect(screen.queryByRole('link', { name: /Mở trong tab mới/i })).not.toBeInTheDocument()
  })

  it('downloads a Wiki document with proper filename and extension when clicking Tải về', async () => {
    const documentBlob = new Blob(['word content'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/wiki/?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ id: 'QT-99', title: 'Hướng dẫn sử dụng', category: 'Tài liệu đào tạo', link: 'wiki/QT-99/hdsd.docx' }],
            meta: { total_pages: 1 },
          }),
        }
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          'content-disposition': 'attachment; filename="hdsd.docx"',
        }),
        blob: async () => documentBlob,
      }
    })
    setAccessToken('wiki-access-token')

    const downloadBlobSpy = vi.spyOn(fileSave, 'downloadBlob').mockImplementation(() => {})

    render(<Wiki />)
    fireEvent.click(await screen.findByRole('button', { name: /Tải về/i }))

    await waitFor(() => {
      expect(downloadBlobSpy).toHaveBeenCalledWith(expect.any(Blob), 'Hướng dẫn sử dụng.docx')
    })
  })
})
