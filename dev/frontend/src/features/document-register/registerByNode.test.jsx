import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import DocumentRegister from './DocumentRegister'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => 'token'),
}))

const createSlot = (id, name, templateId, overrides = {}) => ({
  id, name, template_id: templateId, source: 'KHACH_HANG',
  status: 'CHUA_CO', is_required: false, quantity: 1, files: [], file_count: 0,
  scope: 'SERVICE_LINE', is_custom: false, ...overrides,
})

const MOCK_REGISTER = {
  register_version: 2,
  phan_bo_theo_buoc: {},
  summary: { required: 0, missing: [] },
  cabinet_by_node: [
    {
      node_code: 'K01',
      node_name: 'Tiếp nhận & kiểm tra đầu vào',
      documents: [{ template_id: 'T-SODO', name: 'Sổ đỏ' }],
      total: 1,
      done: 0,
    },
    {
      node_code: 'K03',
      node_name: 'Chuẩn hoá tài liệu kỹ thuật',
      documents: [{ template_id: 'T-BANVE', name: 'Bản vẽ' }],
      total: 1,
      done: 0,
    },
  ],
  groups: [{
    source: 'KHACH_HANG',
    label: 'Khách hàng cung cấp',
    slots: [
      createSlot('S-SODO', 'Sổ đỏ', 'T-SODO'),
      createSlot('S-SODO-HD', 'Sổ đỏ', 'T-SODO', { scope: 'CONTRACT' }),
      createSlot('S-BANVE', 'Bản vẽ', 'T-BANVE'),
      createSlot('S-RAC', 'Giấy công ty không thuộc gói này', 'T-RAC'),
      createSlot('S-THEM', 'Giấy nhân viên tự thêm', null, { is_custom: true }),
    ],
  }],
}

const mockApi = (register = MOCK_REGISTER) => {
  apiFetch.mockImplementation(async (url) => {
    if (url.startsWith('/api/document-register/register?')) return register
    if (url === '/api/document-register/meta') return { sources: [], statuses: [], copy_types: [] }
    if (url === '/api/document-register/storage-locations') return { data: [] }
    if (url.includes('/source-documents')) return { data: [], unclassified: 0 }
    if (url.includes('/k01-status')) return { data: { can_submit: true, required_missing: [], blockers: [] } }
    throw new Error(`Unexpected ${url}`)
  })
}

const mount = (props = {}) => render(
  <DocumentRegister contractId="HD-1" serviceLineId="SL-1" inputOnly {...props} />,
)

describe('Sổ thu hẹp về đúng bước đang mở', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('chỉ bày giấy master data khai cho bước đó', async () => {
    mockApi()
    mount({ nodeCode: 'K01' })

    await screen.findByText('Sổ đỏ')
    expect(screen.queryByText('Bản vẽ')).not.toBeInTheDocument()
    expect(screen.queryByText('Giấy công ty không thuộc gói này')).not.toBeInTheDocument()
  })

  it('giữ ô phát sinh nhân viên tự thêm — nó không có mẫu để đối chiếu', async () => {
    mockApi()
    mount({ nodeCode: 'K01' })

    expect(await screen.findByText('Giấy nhân viên tự thêm')).toBeInTheDocument()
  })

  it('đổi bước thì đổi bộ giấy, không phải lúc nào cũng một danh sách', async () => {
    mockApi()
    mount({ nodeCode: 'K03' })

    await screen.findByText('Bản vẽ')
    expect(screen.queryByText('Sổ đỏ')).not.toBeInTheDocument()
  })

  it('không truyền nodeCode thì sổ vẫn là danh mục đầy đủ của Hạng mục', async () => {
    mockApi()
    mount({ nodeKey: 'k01' })

    expect(await screen.findByText('Bản vẽ')).toBeInTheDocument()
    expect(screen.getByText('Giấy công ty không thuộc gói này')).toBeInTheDocument()
    expect(screen.getAllByText('Sổ đỏ')).toHaveLength(2)
  })

  it('một loại giấy chỉ một dòng, dù sổ có hai ô cùng trỏ về nó', async () => {
    mockApi()
    mount({ nodeCode: 'K01' })

    await screen.findByText('Sổ đỏ')
    expect(screen.getAllByText('Sổ đỏ')).toHaveLength(1)
  })

  it('trong hai ô cùng loại thì giữ ô ĐANG CÓ TỆP, không giữ ô rỗng', async () => {
    mockApi({
      ...MOCK_REGISTER,
      groups: [{
        source: 'KHACH_HANG',
        label: 'Khách hàng cung cấp',
        slots: [
          createSlot('S-SODO', 'Sổ đỏ', 'T-SODO'),
          createSlot('S-SODO-HD', 'Sổ đỏ', 'T-SODO', {
            scope: 'CONTRACT',
            file_count: 1,
            files: [{ id: 'D-1', file_name: 'so-do.pdf', content_type: 'application/pdf' }],
          }),
        ],
      }],
    })
    mount({ nodeCode: 'K01' })

    await screen.findByText('Sổ đỏ')
    expect(screen.getByText('so-do.pdf')).toBeInTheDocument()
  })

  it('bước chưa khai giấy nào thì nói thẳng, không để một khoảng trắng không lời', async () => {
    mockApi()
    mount({ nodeCode: 'K07' })

    expect(await screen.findByText(/Bước K07 chưa được khai loại giấy nào/)).toBeInTheDocument()
  })

  it('sổ cũ chưa có cabinet_by_node thì không bày nhầm cả sổ ra', async () => {
    mockApi({ ...MOCK_REGISTER, cabinet_by_node: undefined })
    mount({ nodeCode: 'K01' })

    expect(await screen.findByText(/Bước K01 chưa được khai loại giấy nào/)).toBeInTheDocument()
    expect(screen.queryByText('Sổ đỏ')).not.toBeInTheDocument()
  })
})
