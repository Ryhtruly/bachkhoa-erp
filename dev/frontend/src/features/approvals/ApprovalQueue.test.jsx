import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import ApprovalQueue from './ApprovalQueue'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => null),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const SLOT_REQUEST = {
  id: 'SR-1', proposed_name: 'Bản kỹ thuật đo hiện trường', quantity: 1,
  contract_id: '003/BK-2026', service_line_name: 'Cắm mốc', node_code: 'K02',
  checklist_name: 'Nộp bản kỹ thuật gốc', requested_by_name: 'Nguyễn Văn A',
  reason: 'Phát sinh sản phẩm kỹ thuật mới', files: [], created_at: '2026-08-26T08:00:00Z',
}

const WAIVER = {
  id: 'WV-1', kind: 'WAIVE', slot_id: 'SLOT-1', slot_name: 'Giấy uỷ quyền',
  contract_id: '003/BK-2026', service_line_id: 'SL-1', service_line_name: 'Cắm mốc',
  requested_by_name: 'Nguyễn Văn A', reason: 'Khách xác nhận không phát sinh uỷ quyền',
  created_at: '2026-08-26T08:00:00Z',
}

const setupApi = ({ slots = [], changes = [], rejected = {} } = {}) => {
  apiFetch.mockImplementation((url, options) => {
    if (rejected[url]) return Promise.reject(rejected[url])
    if (url === '/api/contracts/workflow/rollback-requests') return Promise.resolve({ data: [] })
    if (url === '/api/document-register/change-requests') return Promise.resolve({ data: changes })
    if (url === '/api/slot-requests?status=pending') return Promise.resolve({ data: slots })
    if (options?.method === 'POST') return Promise.resolve({ status: 'success', data: {} })
    return Promise.resolve({ data: [] })
  })
}

it('đề xuất loại tài liệu có đủ ba quyết định và mặc định chỉ áp dụng Hạng mục này', async () => {
  setupApi({ slots: [SLOT_REQUEST] })
  render(<ApprovalQueue />)

  expect(await screen.findByText('Bản kỹ thuật đo hiện trường')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Yêu cầu bổ sung' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Duyệt · tạo loại tài liệu/ })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Phạm vi áp dụng' })).toHaveValue('HANG_MUC_NAY')
})

it('yêu cầu bổ sung dùng modal, bắt lý do và gửi needs_more đúng phiếu cũ', async () => {
  setupApi({ slots: [SLOT_REQUEST] })
  render(<ApprovalQueue />)
  fireEvent.click(await screen.findByRole('button', { name: 'Yêu cầu bổ sung' }))

  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận yêu cầu bổ sung' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Nhập nội dung cần bổ sung')

  fireEvent.change(screen.getByLabelText('Nội dung cần bổ sung'), {
    target: { value: 'Đổi tên theo đúng bản kỹ thuật và bổ sung mô tả.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận yêu cầu bổ sung' }))

  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/slot-requests/SR-1/review',
    expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"decision":"needs_more"'),
    })))
})

it('duyệt đề xuất gửi phạm vi mặc định HANG_MUC_NAY', async () => {
  setupApi({ slots: [SLOT_REQUEST] })
  render(<ApprovalQueue />)
  fireEvent.click(await screen.findByRole('button', { name: /Duyệt · tạo loại tài liệu/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận duyệt' }))

  await waitFor(() => {
    const call = apiFetch.mock.calls.find(([url, options]) =>
      url === '/api/slot-requests/SR-1/review' && options?.method === 'POST')
    expect(JSON.parse(call[1].body)).toMatchObject({
      decision: 'approved', promotion_scope: 'HANG_MUC_NAY',
    })
  })
})

it('giữ nguyên cấu hình bắt buộc và duyệt Giám đốc do nhân viên đề xuất', async () => {
  setupApi({ slots: [{
    ...SLOT_REQUEST,
    required_before_submit: true,
    needs_director_approval: true,
  }] })
  render(<ApprovalQueue />)

  const checkboxes = await screen.findAllByRole('checkbox')
  expect(checkboxes).toHaveLength(2)
  expect(checkboxes[0]).toBeChecked()
  expect(checkboxes[1]).toBeChecked()

  fireEvent.click(screen.getByRole('button', { name: /Duyệt · tạo loại tài liệu/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận duyệt' }))

  await waitFor(() => {
    const call = apiFetch.mock.calls.find(([url, options]) =>
      url === '/api/slot-requests/SR-1/review' && options?.method === 'POST')
    expect(JSON.parse(call[1].body)).toMatchObject({
      required_before_submit: true,
      needs_director_approval: true,
    })
  })
})

it('phiếu xin miễn nằm nhóm riêng và duyệt qua đúng endpoint WAIVE', async () => {
  setupApi({ changes: [WAIVER] })
  render(<ApprovalQueue />)

  expect(await screen.findByText(/Xin miễn giấy · 1/)).toBeInTheDocument()
  expect(screen.queryByText(/Xin sửa tài liệu chuyển giao · 1/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Duyệt miễn' }))
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận duyệt' }))

  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
    '/api/document-register/waivers/WV-1/review',
    expect.objectContaining({ method: 'POST' }),
  ))
  expect(apiFetch.mock.calls.some(([url]) =>
    url === '/api/document-register/change-requests/WV-1/review')).toBe(false)
})

it('lỗi schema 503 hiện tiếng Việt nhưng hàng chờ khác vẫn hiển thị', async () => {
  const error = Object.assign(new Error('raw server detail'), { status: 503 })
  setupApi({ slots: [SLOT_REQUEST], rejected: {
    '/api/document-register/change-requests': error,
  } })
  render(<ApprovalQueue />)

  expect(await screen.findByText(/Tính năng sổ tài liệu V2 chưa được kích hoạt/)).toBeInTheDocument()
  expect(screen.getByText('Bản kỹ thuật đo hiện trường')).toBeInTheDocument()
})
