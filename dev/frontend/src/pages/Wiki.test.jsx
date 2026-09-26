import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('shows Edit and Delete buttons for director and opens Edit modal to update document', async () => {
    let putCalledWith = null
    global.fetch = vi.fn(async (url, options) => {
      if (String(url).startsWith('/api/wiki/?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: 'BK-DOC01',
                title: 'Tài liệu kỹ thuật',
                category: 'Tài liệu đào tạo',
                version: '1.0',
                description: 'Mô tả ban đầu',
                link: 'wiki/BK-DOC01/doc.pdf',
                size_bytes: 1024,
                created_at: '2026-03-01T10:00:00Z',
              },
            ],
            meta: { total_pages: 1 },
          }),
        }
      }
      if (options?.method === 'PUT' && String(url).includes('/api/wiki/BK-DOC01')) {
        putCalledWith = { url, options }
        return {
          ok: true,
          status: 200,
          json: async () => ({ message: 'Cập nhật thành công' }),
        }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    setAccessToken('wiki-access-token')

    render(<Wiki user={{ is_director: true, role_name: 'admin' }} isDirector={true} />)

    const editBtn = await screen.findByRole('button', { name: /Sửa tài liệu/i })
    const deleteBtn = screen.getByRole('button', { name: /Xóa tài liệu/i })
    expect(editBtn).toBeInTheDocument()
    expect(deleteBtn).toBeInTheDocument()

    // Open Edit modal
    fireEvent.click(editBtn)
    expect(await screen.findByText(/Chỉnh Sửa Tài Liệu/i)).toBeInTheDocument()

    // Change title
    const titleInput = screen.getByDisplayValue('Tài liệu kỹ thuật')
    fireEvent.change(titleInput, { target: { value: 'Tài liệu kỹ thuật v2' } })

    // Submit edit form
    const saveBtn = screen.getByRole('button', { name: /Lưu Thay Đổi/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(putCalledWith).not.toBeNull()
      expect(putCalledWith.url).toBe('/api/wiki/BK-DOC01')
      expect(putCalledWith.options.headers.Authorization).toBe('Bearer wiki-access-token')
      expect(addToast).toHaveBeenCalledWith('Cập nhật tài liệu thành công!', 'success')
    })
  })

  it('opens Delete confirmation modal and calls delete endpoint', async () => {
    let deleteCalledWith = null
    global.fetch = vi.fn(async (url, options) => {
      if (String(url).startsWith('/api/wiki/?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: 'BK-DEL01',
                title: 'Tài liệu cũ',
                category: 'Tài liệu đào tạo',
                version: '1.0',
                link: 'wiki/BK-DEL01/del.pdf',
              },
            ],
            meta: { total_pages: 1 },
          }),
        }
      }
      if (options?.method === 'DELETE' && String(url).includes('/api/wiki/BK-DEL01')) {
        deleteCalledWith = { url, options }
        return {
          ok: true,
          status: 200,
          json: async () => ({ message: 'Đã xóa tài liệu' }),
        }
      }
      return { ok: true, status: 200, json: async () => ({}) }
    })
    setAccessToken('wiki-access-token')

    render(<Wiki user={{ is_director: true, role_name: 'admin' }} isDirector={true} />)

    const deleteBtn = await screen.findByRole('button', { name: /Xóa tài liệu/i })
    fireEvent.click(deleteBtn)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Xác Nhận Xóa Tài Liệu/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/Thao tác này sẽ gỡ bỏ tài liệu khỏi hệ thống/i)).toBeInTheDocument()

    const confirmDeleteBtn = within(dialog).getByRole('button', { name: /Xóa Tài Liệu/i })
    fireEvent.click(confirmDeleteBtn)

    await waitFor(() => {
      expect(deleteCalledWith).not.toBeNull()
      expect(deleteCalledWith.url).toBe('/api/wiki/BK-DEL01')
      expect(deleteCalledWith.options.headers.Authorization).toBe('Bearer wiki-access-token')
      expect(addToast).toHaveBeenCalledWith('Đã xóa tài liệu thành công!', 'success')
    })
  })

  it('shows whether the AI has learned each document and lets a director re-index a failed one', async () => {
    const statuses = {
      'ISO-001': { chunks: 0, status: 'FAILED', error: 'Không đọc được chữ trong tài liệu (PDF scan/ảnh?)' },
      'ISO-002': { chunks: 12, status: 'COMPLETED', error: null },
    }
    global.fetch = vi.fn(async (url, init = {}) => {
      const path = String(url)
      const json = (body) => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body })
      if (path.startsWith('/api/wiki/?')) {
        return json({
          data: [
            { id: 'ISO-001', title: 'Bộ Quy Tắc Đạo Đức', category: 'Sổ tay nhân sự', link: 'wiki/ISO-001/quy_tac.pdf' },
            { id: 'ISO-002', title: 'Quy trình tiếp nhận', category: 'Quy trình ISO', link: 'wiki/ISO-002/tiep_nhan.docx' },
          ],
          meta: { total_pages: 1 },
        })
      }
      if (path.startsWith('/api/wiki/index-status')) return json({ status: 'success', data: statuses })
      if (path === '/api/wiki/ISO-001/reindex' && init.method === 'POST') {
        return json({ status: 'success', data: { chunks: 0, status: 'QUEUED', error: null } })
      }
      return json({})
    })

    render(<Wiki isDirector />)

    expect(await screen.findByText(/AI chưa học được: Không đọc được chữ/)).toBeInTheDocument()
    expect(screen.getByText('AI đã học (12 đoạn)')).toBeInTheDocument()

    const failedRow = screen.getByText('Bộ Quy Tắc Đạo Đức').closest('tr')
    fireEvent.click(within(failedRow).getByRole('button', { name: /Học lại/ }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/wiki/ISO-001/reindex', expect.objectContaining({ method: 'POST' }))
    })
    expect(await within(failedRow).findByText(/AI đang đọc tài liệu/)).toBeInTheDocument()
    expect(addToast).toHaveBeenCalledWith('Đã xếp tài liệu vào hàng chờ để AI học lại.', 'success')
  })
})
