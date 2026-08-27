import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import SlotRequestModal from './SlotRequestModal'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const DE_XUAT = (patch = {}) => ({
  id: 'REQ-1', proposed_name: 'Ảnh mốc ranh phát sinh', description: '',
  reason: 'Chủ đất yêu cầu chụp thêm', quantity: 3, source: 'CONG_TY',
  kind: 'INPUT', status: 'draft', review_note: null, approved_name: null,
  files: [{ document_id: 'DOC-1', file_name: 'anh1.jpg' }],
  ...patch,
})

const mockApi = ({ danhSach = [], chiTiet = DE_XUAT() } = {}) => {
  apiFetch.mockImplementation((url, opts) => {
    if (url.includes('/api/slot-requests?')) return Promise.resolve({ data: danhSach })
    if (/\/api\/slot-requests\/REQ-1$/.test(url)) return Promise.resolve({ data: chiTiet })
    if (opts?.method === 'POST' && url === '/api/slot-requests') {
      return Promise.resolve({ data: { id: 'REQ-1', status: 'draft' } })
    }
    return Promise.resolve({ status: 'success', data: {} })
  })
}

const dung = (props = {}) => render(
  <SlotRequestModal checklistResultId="CR-K02" onClose={vi.fn()} {...props} />
)

it('chưa có đề xuất thì chỉ cho lưu nháp, chưa có khu tệp', async () => {
  mockApi()
  dung()

  expect(await screen.findByRole('button', { name: 'Lưu nháp' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).not.toBeInTheDocument()
})

it('mở lại đúng bản nháp đang dang dở, không bắt gõ lại', async () => {
  mockApi({ danhSach: [DE_XUAT()] })
  dung()

  await waitFor(() =>
    expect(screen.getByDisplayValue('Ảnh mốc ranh phát sinh')).toBeInTheDocument())
  expect(screen.getByDisplayValue('Chủ đất yêu cầu chụp thêm')).toBeInTheDocument()
})

it('một đề xuất chứa nhiều tệp và gửi duyệt được', async () => {
  mockApi({
    danhSach: [DE_XUAT({
      files: [
        { document_id: 'DOC-1', file_name: 'anh1.jpg' },
        { document_id: 'DOC-2', file_name: 'anh2.jpg' },
        { document_id: 'DOC-3', file_name: 'toado.csv' },
      ],
    })],
  })
  dung()

  expect(await screen.findByText(/Tệp đã tải \(3\)/)).toBeInTheDocument()
  expect(screen.getByText('toado.csv')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Gửi duyệt/ })).toBeEnabled()
})

it('đề xuất INPUT không có tệp vẫn gửi duyệt được để tạo ô giấy còn thiếu', async () => {
  mockApi({ danhSach: [DE_XUAT({ files: [] })] })
  dung()

  await screen.findByText(/Tệp đã tải \(0\)/)
  expect(screen.getByRole('button', { name: /Gửi duyệt/ })).toBeEnabled()
  expect(screen.getByText(/Có thể gửi duyệt khi chưa có tệp/)).toBeInTheDocument()
})

it('tạo đề xuất từ workspace luôn khai rõ kind INPUT', async () => {
  mockApi()
  dung()

  fireEvent.click(await screen.findByRole('button', { name: 'Lưu nháp' }))

  await waitFor(() => {
    const call = apiFetch.mock.calls.find(([url, opts]) =>
      url === '/api/slot-requests' && opts?.method === 'POST')
    expect(JSON.parse(call[1].body)).toMatchObject({
      checklist_result_id: 'CR-K02',
      kind: 'INPUT',
    })
  })
})

it('đang chờ duyệt thì khoá sửa, không có nút thêm tệp', async () => {
  mockApi({ danhSach: [DE_XUAT({ status: 'pending' })] })
  dung()

  expect(await screen.findByText(/Đang chờ Giám đốc duyệt/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Thêm tệp/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Gửi duyệt/ })).not.toBeInTheDocument()
})

it('bị từ chối thì hiện lý do và cho sửa gửi lại', async () => {
  mockApi({
    danhSach: [DE_XUAT({ status: 'rejected', review_note: 'Tên chưa đúng thủ tục' })],
  })
  dung()

  const canhBao = await screen.findByRole('alert')
  expect(canhBao).toHaveTextContent('Tên chưa đúng thủ tục')
  expect(screen.getByRole('button', { name: /Gửi duyệt/ })).toBeInTheDocument()
})

it('needs_more hiện yêu cầu bổ sung, cho sửa và gửi lại đúng phiếu cũ', async () => {
  mockApi({
    danhSach: [DE_XUAT({ status: 'needs_more', review_note: 'Đổi tên cho đúng bản kỹ thuật' })],
  })
  dung()

  expect(await screen.findByRole('alert')).toHaveTextContent('Đổi tên cho đúng bản kỹ thuật')
  const ten = screen.getByDisplayValue('Ảnh mốc ranh phát sinh')
  expect(ten).toBeEnabled()
  fireEvent.change(ten, { target: { value: 'Bản kỹ thuật đo hiện trường' } })
  fireEvent.click(screen.getByRole('button', { name: /Gửi duyệt/ }))

  await waitFor(() => {
    expect(apiFetch).toHaveBeenCalledWith('/api/slot-requests/REQ-1', expect.objectContaining({
      method: 'PATCH',
    }))
    expect(apiFetch).toHaveBeenCalledWith('/api/slot-requests/REQ-1/submit', { method: 'POST' })
  })
  expect(apiFetch.mock.calls.some(([url, opts]) =>
    url === '/api/slot-requests' && opts?.method === 'POST')).toBe(false)
})

it('đã duyệt thì hiện tên chính thức, không cho sửa nữa', async () => {
  mockApi({
    danhSach: [DE_XUAT({ status: 'approved', approved_name: 'Ảnh mốc ranh (chuẩn)' })],
  })
  dung()

  expect(await screen.findByText(/Đã duyệt — loại tài liệu chính thức/)).toBeInTheDocument()
  expect(screen.getByText('Ảnh mốc ranh (chuẩn)')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Thêm tệp/ })).not.toBeInTheDocument()
})

it('tải tệp lên gọi đúng endpoint của đề xuất, không phải endpoint hồ sơ chính thức', async () => {
  mockApi({ danhSach: [DE_XUAT()] })
  dung()
  await screen.findByText(/Tệp đã tải/)

  // Modal dựng qua portal vào document.body, không nằm trong container render.
  const input = document.querySelector('.sr-file-input')
  fireEvent.change(input, {
    target: { files: [new File(['x'], 'anh4.jpg', { type: 'image/jpeg' })] },
  })

  await waitFor(() => {
    const uploads = apiFetch.mock.calls.filter(
      ([url, opts]) => url === '/api/slot-requests/REQ-1/documents' && opts?.method === 'POST'
    )
    expect(uploads).toHaveLength(1)
  })
  // Tuyệt đối không đụng đường tài liệu đầu ra chính thức khi chưa duyệt.
  const chinhThuc = apiFetch.mock.calls.filter(([url]) => url.includes('/output-documents'))
  expect(chinhThuc).toHaveLength(0)
})
