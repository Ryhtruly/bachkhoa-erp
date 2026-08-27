import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import DocumentRegister from './DocumentRegister'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn(), getAccessToken: vi.fn(() => 'tok') }))
vi.mock('../employee-portal/SlotRequestModal', () => ({
  default: () => <div data-testid="modal-de-xuat" />,
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const so = (version) => ({
  contract_id: 'HD-1',
  service_line_id: 'SL-1',
  register_version: version,
  groups: [{
    source: 'KHACH_HANG', label: 'Khách hàng cung cấp',
    slots: [{
      id: 'S-1', name: 'CCCD', source: 'KHACH_HANG', is_required: true,
      quantity: 1, file_count: 0, files: [], status: 'CHUA_CO',
      is_waived: false, waiver_pending: false, scope: 'SERVICE_LINE',
    }],
  }],
  summary: { total: 1, required: 1, required_done: 0, missing: ['CCCD'] },
})

const mockApi = (version) => {
  apiFetch.mockImplementation(async (url) => {
    if (url.includes('/storage-locations')) return { data: [] }
    if (url.includes('/meta')) return { statuses: [], sources: [], copy_types: [] }
    if (url.includes('/source-documents')) return { data: [], unclassified: 0 }
    if (url.includes('/k01-status')) return { data: { can_submit: true, required_missing: [] } }
    return so(version)
  })
}

// Mô hình V2: loại giấy mới phải qua Giám đốc duyệt. Thêm thẳng như mô hình cũ
// là để nhân viên tự quyết cấu trúc hồ sơ, Giám đốc chỉ biết khi đã rồi.
it('V2 có checklist thì hiện nút Đề xuất loại tài liệu', async () => {
  mockApi(2)
  render(<DocumentRegister contractId="HD-1" serviceLineId="SL-1"
    inputOnly checklistResultId="CR-1" addToast={vi.fn()} />)

  expect(await screen.findByRole('button', { name: /Đề xuất loại tài liệu/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Thêm loại giấy tờ phát sinh/ })).not.toBeInTheDocument()
})

// ĐÃ SỬA CHỦ ĐÍCH: bản trước chốt rằng V1 cũng không có nút xin miễn. Chốt như
// vậy là sai nghiệp vụ — mọi Hạng mục đang chạy trên live đều là V1, nên nhân
// viên gặp giấy khách không có thật thì K01 bị khoá vĩnh viễn, không còn đường
// nào ngoài nhét đại một tệp cho qua cổng. Phiếu miễn neo theo (ô giấy, Hạng
// mục) và mọi truy vấn đọc đều lọc theo service_line_id nên V1 vẫn an toàn.
// Chỉ ĐỀ XUẤT loại giấy mới là còn giữ riêng cho V2, vì nó cần neo vào sổ của
// Hạng mục mới có chỗ đặt ô giấy sinh ra.
it('V1 vẫn thêm giấy theo đường cũ và VẪN xin miễn được', async () => {
  mockApi(1)
  render(<DocumentRegister contractId="HD-1" serviceLineId="SL-1"
    inputOnly checklistResultId="CR-1" addToast={vi.fn()} />)

  await waitFor(() => expect(screen.getByRole('button', { name: /Thêm loại giấy tờ phát sinh/ })).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: /Đề xuất loại tài liệu/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Xin miễn giấy này/ })).toBeInTheDocument()
})

it('V2 không có checklist thì không bày đề xuất — phiếu cần neo vào mục checklist', async () => {
  mockApi(2)
  render(<DocumentRegister contractId="HD-1" serviceLineId="SL-1"
    inputOnly checklistResultId="" addToast={vi.fn()} />)

  await waitFor(() => expect(screen.getByRole('button', { name: /Thêm loại giấy tờ phát sinh/ })).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: /Đề xuất loại tài liệu/ })).not.toBeInTheDocument()
})

it('V2 hiện nút xin miễn cho ô bắt buộc còn thiếu', async () => {
  mockApi(2)
  render(<DocumentRegister contractId="HD-1" serviceLineId="SL-1"
    inputOnly checklistResultId="CR-1" addToast={vi.fn()} />)

  expect(await screen.findByRole('button', { name: /Xin miễn giấy này/ })).toBeInTheDocument()
})
