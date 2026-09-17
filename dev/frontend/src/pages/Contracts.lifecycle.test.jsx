import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Contracts from './Contracts'
import { clearApiCache } from '../lib/api'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))

vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))
vi.mock('../features/contracts/ContractFileActions', () => ({
  default: () => <div data-testid="mock-file-actions" />,
}))
vi.mock('../features/contracts/DocumentCabinet', () => ({
  default: () => <div data-testid="mock-doc-cabinet" />,
}))

describe('Contracts Lifecycle Actions (Delete / Cancel)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearApiCache()
  })

  afterEach(() => {
    cleanup()
    clearApiCache()
    vi.unstubAllGlobals()
  })

  it('khi hợp đồng chưa có quy trình: chỉ hiện nút Xoá hợp đồng cho Giám đốc', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{
              id: '015/BK-2026',
              customer_name: 'Khách Test Hủy',
              total_value: 1_500_000,
              remaining_amount: 1_500_000,
              paid_amount: 0,
              service_lines: [{ id: 'sl-1', name: 'Đo vẽ' }],
              status: 'Chưa có quy trình',
            }],
            pagination: { page: 1, total_pages: 1, total_contracts: 1 },
          }),
        })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    render(<Contracts isDirector={true} />)

    // Chờ hợp đồng xuất hiện
    await screen.findAllByText('015/BK-2026')

    // Phải có nút "Xoá hợp đồng"
    const deleteBtn = screen.getByRole('button', { name: /Xoá hợp đồng/i })
    expect(deleteBtn).toBeInTheDocument()

    // Tuyệt đối không có nút "Hủy hợp đồng"
    expect(screen.queryByRole('button', { name: /Hủy hợp đồng/i })).not.toBeInTheDocument()

    // Bấm nút "Xoá hợp đồng" -> mở modal xác nhận
    fireEvent.click(deleteBtn)
    expect(screen.getByText(/Xoá hợp đồng: 015\/BK-2026/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Nhập 015\/BK-2026/i)).toBeInTheDocument()
  })

  it('khi hợp đồng đã có quy trình: chỉ hiện nút Hủy hợp đồng cho Giám đốc', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{
              id: '016/BK-2026',
              customer_name: 'Khách Test Đang Chạy',
              total_value: 5_000_000,
              remaining_amount: 3_000_000,
              paid_amount: 2_000_000,
              service_lines: [{ id: 'sl-2', name: 'Pháp lý' }],
              status: 'Đang thực hiện',
            }],
            pagination: { page: 1, total_pages: 1, total_contracts: 1 },
          }),
        })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    render(<Contracts isDirector={true} />)

    await screen.findAllByText('016/BK-2026')

    // Phải có nút "Hủy hợp đồng"
    const cancelBtn = screen.getByRole('button', { name: /Hủy hợp đồng/i })
    expect(cancelBtn).toBeInTheDocument()

    // Tuyệt đối không có nút "Xoá hợp đồng"
    expect(screen.queryByRole('button', { name: /Xoá hợp đồng/i })).not.toBeInTheDocument()

    // Bấm nút "Hủy hợp đồng" -> mở modal nhập lý do
    fireEvent.click(cancelBtn)
    expect(screen.getByText(/Hủy hợp đồng: 016\/BK-2026/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Nhập lý do chi tiết/i)).toBeInTheDocument()
  })

  it('khi hợp đồng Đã huỷ: ẩn hoàn toàn các nút thao tác vòng đời', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{
              id: '017/BK-2026',
              customer_name: 'Khách Đã Hủy',
              total_value: 2_000_000,
              remaining_amount: 2_000_000,
              paid_amount: 0,
              service_lines: [{ id: 'sl-3', name: 'Đo vẽ' }],
              status: 'Đã huỷ',
            }],
            pagination: { page: 1, total_pages: 1, total_contracts: 1 },
          }),
        })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    render(<Contracts isDirector={true} />)

    await screen.findAllByText('017/BK-2026')

    // Cả hai nút đều không xuất hiện
    expect(screen.queryByRole('button', { name: /Xoá hợp đồng/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Hủy hợp đồng/i })).not.toBeInTheDocument()
  })

  it('khi hợp đồng có status là cancelled hoặc Đã hủy: ẩn nút Xoá và Hủy', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{
              id: '018/BK-2026',
              customer_name: 'Khách Status Cancelled',
              total_value: 3_000_000,
              remaining_amount: 3_000_000,
              paid_amount: 0,
              service_lines: [],
              status: 'cancelled',
            }],
            pagination: { page: 1, total_pages: 1, total_contracts: 1 },
          }),
        })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    render(<Contracts isDirector={true} />)

    await screen.findAllByText('018/BK-2026')

    expect(screen.queryByRole('button', { name: /Xoá hợp đồng/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Hủy hợp đồng/i })).not.toBeInTheDocument()
  })

  it('nhân viên không phải Giám đốc thì không thấy các nút Xoá hay Hủy', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{
              id: '015/BK-2026',
              customer_name: 'Khách Test Hủy',
              total_value: 1_500_000,
              remaining_amount: 1_500_000,
              paid_amount: 0,
              service_lines: [{ id: 'sl-1', name: 'Đo vẽ' }],
              status: 'Chưa có quy trình',
            }],
            pagination: { page: 1, total_pages: 1, total_contracts: 1 },
          }),
        })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    render(<Contracts isDirector={false} />)

    await screen.findAllByText('015/BK-2026')

    expect(screen.queryByRole('button', { name: /Xoá hợp đồng/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Hủy hợp đồng/i })).not.toBeInTheDocument()
  })

  it('thực hiện hủy hợp đồng thành công và cập nhật giao diện', async () => {
    let cancelCalled = false
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      const u = String(url)
      if (u.includes('/api/contracts/016%2FBK-2026/cancel') || u.includes('/api/contracts/016/BK-2026/cancel')) {
        cancelCalled = true
        expect(options.method).toBe('POST')
        const body = JSON.parse(options.body)
        expect(body.reason).toBe('Khách hàng đổi ý không làm nữa')
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'success',
            message: 'Hợp đồng 016/BK-2026 đã được hủy thành công',
            contract_status: 'cancelled',
          }),
        })
      }
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{
              id: '016/BK-2026',
              customer_name: 'Khách Đang Chạy',
              total_value: 5_000_000,
              remaining_amount: 5_000_000,
              paid_amount: 0,
              service_lines: [{ id: 'sl-2', name: 'Pháp lý' }],
              status: 'Đang thực hiện',
            }],
            pagination: { page: 1, total_pages: 1, total_contracts: 1 },
          }),
        })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    render(<Contracts isDirector={true} />)

    await screen.findAllByText('016/BK-2026')

    const cancelBtn = screen.getByRole('button', { name: /Hủy hợp đồng/i })
    fireEvent.click(cancelBtn)

    const textarea = screen.getByPlaceholderText(/Nhập lý do chi tiết/i)
    fireEvent.change(textarea, { target: { value: 'Khách hàng đổi ý không làm nữa' } })

    const confirmBtn = screen.getByRole('button', { name: /Xác nhận hủy hợp đồng/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(cancelCalled).toBe(true)
      expect(addToast).toHaveBeenCalledWith(expect.stringContaining('đã được hủy thành công'), 'success')
    })
  })

  it('thực hiện xoá hợp đồng tạo nhầm khi gõ đúng mã hợp đồng', async () => {
    let deleteCalled = false
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      const u = String(url)
      if (u.includes('/api/contracts/015%2FBK-2026') || u.includes('/api/contracts/015/BK-2026')) {
        if (options?.method === 'DELETE') {
          deleteCalled = true
          expect(u).toContain('confirm_code=015%2FBK-2026')
          return Promise.resolve({
            ok: true,
            json: async () => ({
              status: 'success',
              message: 'Đã xoá vĩnh viễn hợp đồng 015/BK-2026 thành công',
            }),
          })
        }
      }
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{
              id: '015/BK-2026',
              customer_name: 'Khách Tạo Nhầm',
              total_value: 1_000_000,
              remaining_amount: 1_000_000,
              paid_amount: 0,
              service_lines: [{ id: 'sl-1', name: 'Đo vẽ' }],
              status: 'Chưa có quy trình',
            }],
            pagination: { page: 1, total_pages: 1, total_contracts: 1 },
          }),
        })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    render(<Contracts isDirector={true} />)

    await screen.findAllByText('015/BK-2026')

    const deleteBtn = screen.getByRole('button', { name: /Xoá hợp đồng/i })
    fireEvent.click(deleteBtn)

    const confirmInput = screen.getByPlaceholderText(/Nhập 015\/BK-2026/i)
    fireEvent.change(confirmInput, { target: { value: '015/BK-2026' } })

    const confirmDeleteBtn = screen.getByRole('button', { name: /Xác nhận xoá vĩnh viễn/i })
    expect(confirmDeleteBtn).not.toBeDisabled()
    fireEvent.click(confirmDeleteBtn)

    await waitFor(() => {
      expect(deleteCalled).toBe(true)
      expect(addToast).toHaveBeenCalledWith(expect.stringContaining('Đã xoá vĩnh viễn'), 'success')
    })
  })

  it('chặn xoá hợp đồng nếu hợp đồng đã phát sinh thu tiền', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{
              id: '015/BK-2026',
              customer_name: 'Khách Đã Đóng Tiền',
              total_value: 10_000_000,
              remaining_amount: 8_000_000,
              paid_amount: 2_000_000,
              service_lines: [{ id: 'sl-1', name: 'Đo vẽ' }],
              status: 'Chưa có quy trình',
            }],
            pagination: { page: 1, total_pages: 1, total_contracts: 1 },
          }),
        })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    render(<Contracts isDirector={true} />)

    await screen.findAllByText('015/BK-2026')

    const deleteBtn = screen.getByRole('button', { name: /Xoá hợp đồng/i })
    fireEvent.click(deleteBtn)

    // Modal hiển thị cảnh báo không thể xoá vì đã phát sinh thanh toán
    expect(screen.getByText(/Không thể xoá/i)).toBeInTheDocument()
    expect(screen.getByText(/đã phát sinh thanh toán/i)).toBeInTheDocument()
    // Không có nút xác nhận xoá vĩnh viễn
    expect(screen.queryByRole('button', { name: /Xác nhận xoá vĩnh viễn/i })).not.toBeInTheDocument()
  })
})

