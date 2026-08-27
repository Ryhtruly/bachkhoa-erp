import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import DocumentRegister from './DocumentRegister'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => 'token'),
}))

const registerData = {
  summary: { required: 1, missing: ['CCCD'] },
  groups: [{
    source: 'KHACH_HANG',
    label: 'Khách hàng cung cấp',
    slots: [{
      id: 'S-1', name: 'CCCD', source: 'KHACH_HANG', status: 'CHUA_CO',
      is_required: true, needs_original: false, is_custom: false,
      scope: 'CONTRACT', quantity: 1, files: [], file_count: 0,
    }],
  }],
}

describe('DocumentRegister K01', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('hiện kho nguồn và cảnh báo tệp chưa phân loại nhưng không coi đó là blocker', async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.startsWith('/api/document-register/register?')) return registerData
      if (url === '/api/document-register/meta') return { sources: [], statuses: [], copy_types: [] }
      if (url === '/api/document-register/storage-locations') return { data: [] }
      if (url.includes('/source-documents')) return {
        data: [{ id: 'D-1', file_name: 'anh-zalo.jpg', slots: [] }],
        unclassified: 1,
      }
      if (url.includes('/k01-status')) return {
        data: { can_submit: true, unclassified: 1, required_missing: [], blockers: [] },
      }
      throw new Error(`Unexpected ${url}`)
    })

    render(<DocumentRegister contractId="HD-1" serviceLineId="SL-1" inputOnly />)

    expect(await screen.findByText('Kho tài liệu khách gửi')).toBeInTheDocument()
    expect(screen.getByText('anh-zalo.jpg')).toBeInTheDocument()
    expect(screen.getByText(/1 tệp chưa phân loại.*có thể thuộc Hạng mục khác/)).toBeInTheDocument()
    expect(screen.queryByText(/Không thể nộp K01/)).not.toBeInTheDocument()
  })

  it('gán một tệp nguồn vào ô giấy và tải lại trạng thái', async () => {
    apiFetch.mockImplementation(async (url, options = {}) => {
      if (url.startsWith('/api/document-register/register?')) return registerData
      if (url === '/api/document-register/meta') return { sources: [], statuses: [], copy_types: [] }
      if (url === '/api/document-register/storage-locations') return { data: [] }
      if (url.includes('/source-documents')) return {
        data: [{ id: 'D-1', file_name: 'cccd.jpg', slots: [] }], unclassified: 1,
      }
      if (url.includes('/k01-status')) return {
        data: { can_submit: false, unclassified: 1, required_missing: ['CCCD'], blockers: [{}] },
      }
      if (url === '/api/document-register/slots/S-1/links' && options.method === 'POST') {
        return { status: 'success' }
      }
      throw new Error(`Unexpected ${url}`)
    })

    render(<DocumentRegister contractId="HD-1" serviceLineId="SL-1" inputOnly />)
    await screen.findByText('cccd.jpg')
    fireEvent.change(screen.getByLabelText('Chọn ô giấy cho cccd.jpg'), { target: { value: 'S-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gán tài liệu cccd.jpg' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      '/api/document-register/slots/S-1/links',
      expect.objectContaining({ method: 'POST' }),
    ))
  })

  it('hiện kho tài liệu trên Hợp đồng ở chế độ chỉ xem và đặt hồ sơ phân loại ở dưới', async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.startsWith('/api/document-register/register?')) return registerData
      if (url === '/api/document-register/meta') return { sources: [], statuses: [], copy_types: [] }
      if (url === '/api/document-register/storage-locations') return { data: [] }
      if (url.includes('/source-documents')) return {
        data: [{ id: 'D-1', file_name: 'anh-zalo.jpg', slots: [] }],
        unclassified: 1,
      }
      throw new Error(`Unexpected ${url}`)
    })

    render(<DocumentRegister contractId="HD-1" showSourceRepository />)

    expect(await screen.findByText('Kho tài liệu khách gửi')).toBeInTheDocument()
    expect(screen.getByText('Hồ sơ đã phân loại')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xem anh-zalo.jpg' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Chọn ô giấy cho anh-zalo.jpg')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gán tài liệu anh-zalo.jpg' })).not.toBeInTheDocument()
  })

  it('xem trước tệp nguồn private trong popup thay vì mở tab mới', async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.startsWith('/api/document-register/register?')) return registerData
      if (url === '/api/document-register/meta') return { sources: [], statuses: [], copy_types: [] }
      if (url === '/api/document-register/storage-locations') return { data: [] }
      if (url.includes('/source-documents')) return {
        data: [{ id: 'D-1', file_name: 'anh-zalo.jpg', content_type: 'image/jpeg', slots: [] }],
        unclassified: 1,
      }
      throw new Error(`Unexpected ${url}`)
    })
    const createObjectURL = vi.fn(() => 'blob:remote-preview')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['image'], { type: 'image/jpeg' }),
    })))

    render(<DocumentRegister contractId="HD-1" showSourceRepository />)
    fireEvent.click(await screen.findByRole('button', { name: 'Xem anh-zalo.jpg' }))

    expect(await screen.findByRole('dialog', { name: 'Xem tài liệu anh-zalo.jpg' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'anh-zalo.jpg' })).toHaveAttribute('src', 'blob:remote-preview')
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:remote-preview')
  })

  it('thu gọn hồ sơ phân loại thành tên giấy và link, chỉ hiện metadata khi mở chi tiết', async () => {
    const compactRegisterData = {
      ...registerData,
      groups: [{
        ...registerData.groups[0],
        slots: [{
          ...registerData.groups[0].slots[0],
          status: 'DA_SCAN',
          copy_type: 'BAN_CHINH',
          files: [{ id: 'D-1', file_name: 'cccd.jpg', content_type: 'image/jpeg' }],
          file_count: 1,
        }],
      }],
    }
    apiFetch.mockImplementation(async (url) => {
      if (url.startsWith('/api/document-register/register?')) return compactRegisterData
      if (url === '/api/document-register/meta') return {
        sources: [],
        statuses: [{ value: 'DA_SCAN', label: 'Đã scan' }],
        copy_types: [{ value: 'BAN_CHINH', label: 'Bản chính' }],
      }
      if (url === '/api/document-register/storage-locations') return { data: [] }
      if (url.includes('/source-documents')) return { data: [], unclassified: 0 }
      throw new Error(`Unexpected ${url}`)
    })

    render(<DocumentRegister contractId="HD-1" showSourceRepository />)

    expect(await screen.findByText('CCCD')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xem cccd.jpg' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Trạng thái CCCD')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thêm loại giấy tờ phát sinh' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết CCCD' }))

    expect(screen.getByLabelText('Trạng thái CCCD')).toHaveTextContent('Đã scan')
    expect(screen.getByLabelText('Loại bản CCCD')).toHaveTextContent('Bản chính')
  })

  // Lỗi thật đã gặp: nút xin miễn bị chặn sau `phienBanSo === 2`, mà mọi Hạng mục
  // đang chạy trên live đều là V1. Kết quả: giấy khách không có thật thì ô mãi
  // trống, K01 không bao giờ nộp được, và nhân viên chỉ còn cách nhét đại một tệp.
  it('ô giấy bắt buộc còn trống thì hiện nút xin miễn KỂ CẢ Hạng mục sổ V1', async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.startsWith('/api/document-register/register?')) {
        return { ...registerData, register_version: 1 }
      }
      if (url === '/api/document-register/meta') return { sources: [], statuses: [], copy_types: [] }
      if (url === '/api/document-register/storage-locations') return { data: [] }
      if (url.includes('/source-documents')) return { data: [], unclassified: 0 }
      if (url.includes('/k01-status')) return {
        data: { can_submit: false, unclassified: 0, required_missing: ['CCCD'], blockers: [{ code: 'REQUIRED_MISSING' }] },
      }
      throw new Error(`Unexpected ${url}`)
    })

    render(<DocumentRegister contractId="HD-1" serviceLineId="SL-1" inputOnly />)

    expect(await screen.findByRole('button', { name: 'Xin miễn giấy này' })).toBeInTheDocument()
  })

  it('ô đã có tệp hoặc đang chờ duyệt thì không bày nút xin miễn nữa', async () => {
    const daCoTep = {
      ...registerData,
      register_version: 1,
      groups: [{
        ...registerData.groups[0],
        slots: [
          { ...registerData.groups[0].slots[0], id: 'S-1', name: 'CCCD', file_count: 1 },
          { ...registerData.groups[0].slots[0], id: 'S-2', name: 'Hộ khẩu', waiver_pending: true },
          { ...registerData.groups[0].slots[0], id: 'S-3', name: 'Hôn nhân', is_waived: true },
          { ...registerData.groups[0].slots[0], id: 'S-4', name: 'Tuỳ chọn', is_required: false },
        ],
      }],
    }
    apiFetch.mockImplementation(async (url) => {
      if (url.startsWith('/api/document-register/register?')) return daCoTep
      if (url === '/api/document-register/meta') return { sources: [], statuses: [], copy_types: [] }
      if (url === '/api/document-register/storage-locations') return { data: [] }
      if (url.includes('/source-documents')) return { data: [], unclassified: 0 }
      if (url.includes('/k01-status')) return {
        data: { can_submit: true, unclassified: 0, required_missing: [], blockers: [] },
      }
      throw new Error(`Unexpected ${url}`)
    })

    render(<DocumentRegister contractId="HD-1" serviceLineId="SL-1" inputOnly />)

    await screen.findByText('Hộ khẩu')
    expect(screen.queryByRole('button', { name: 'Xin miễn giấy này' })).not.toBeInTheDocument()
  })
})
