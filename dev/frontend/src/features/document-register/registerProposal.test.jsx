import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import DocumentRegister from './DocumentRegister'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn(), getAccessToken: vi.fn(() => 'tok') }))
vi.mock('../employee-portal/SlotRequestModal', () => ({
  default: () => <div data-testid="modal-de-xuat" />,
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const mockRegister = (version) => ({
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
    return mockRegister(version)
  })
}

it('V2 có checklist thì hiện nút Đề xuất loại tài liệu', async () => {
  mockApi(2)
  render(<DocumentRegister contractId="HD-1" serviceLineId="SL-1"
    inputOnly checklistResultId="CR-1" addToast={vi.fn()} />)

  expect(await screen.findByRole('button', { name: /Đề xuất loại tài liệu/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Thêm loại giấy tờ phát sinh/ })).not.toBeInTheDocument()
})

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
