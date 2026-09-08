import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import DocumentRegister from './DocumentRegister'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => 'token'),
}))

const so = (phanBo) => ({
  register_version: 2,
  phan_bo_theo_buoc: phanBo,
  summary: { required: 3, missing: [] },
  groups: [{
    source: 'KHACH_HANG', label: 'Khách hàng cung cấp',
    slots: [
      { id: 'S-1', name: 'Sổ đỏ', template_id: 'T-1', source: 'KHACH_HANG',
        status: 'CHUA_CO', is_required: true, quantity: 2, files: [], file_count: 0, scope: 'SERVICE_LINE' },
      { id: 'S-2', name: 'Bản vẽ', template_id: 'T-2', source: 'KHACH_HANG',
        status: 'CHUA_CO', is_required: true, quantity: 1, files: [], file_count: 0, scope: 'SERVICE_LINE' },
      { id: 'S-3', name: 'Giấy lạ', template_id: 'T-9', source: 'KHACH_HANG',
        status: 'CHUA_CO', is_required: false, quantity: 1, files: [], file_count: 0, scope: 'SERVICE_LINE' },
    ],
  }],
})

const mock = (phanBo) => {
  apiFetch.mockImplementation(async (url) => {
    if (url.startsWith('/api/document-register/register?')) return so(phanBo)
    if (url === '/api/document-register/meta') return { sources: [], statuses: [], copy_types: [] }
    if (url === '/api/document-register/storage-locations') return { data: [] }
    if (url.includes('/source-documents')) return { data: [], unclassified: 0 }
    if (url.includes('/k01-status')) return { data: { can_submit: true, required_missing: [], blockers: [] } }
    throw new Error(`Unexpected ${url}`)
  })
}

describe('Sổ tài liệu dùng chung mọi Node — nhãn phân bổ theo bước', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('nói rõ dòng nào là việc của bước đang mở, dòng nào của bước khác, dòng nào chưa ai nhận', async () => {
    mock({ 'T-1': 'k02', 'T-2': 'k03' })
    render(<DocumentRegister contractId="HD-1" serviceLineId="SL-1" inputOnly nodeKey="k02" />)

    await screen.findByText('Sổ đỏ')
    // T-1 thuộc chính bước đang mở
    expect(screen.getByTitle(/thuộc Checklist của bước đang mở/)).toHaveTextContent('bước này')
    // T-2 thuộc bước khác → hiện mã bước
    expect(screen.getByTitle(/Thuộc Checklist của bước K03/)).toHaveTextContent('K03')
    // T-9 chưa bước nào nhận
    expect(screen.getByTitle(/chưa gắn loại giấy này vào Checklist của bước nào/))
      .toHaveTextContent('chưa phân bước')
  })

  it('hiện đủ ba con số: đã có / cần / còn thiếu', async () => {
    mock({ 'T-1': 'k02' })
    render(<DocumentRegister contractId="HD-1" serviceLineId="SL-1" inputOnly nodeKey="k02" />)

    await screen.findByText('Sổ đỏ')
    expect(screen.getByTitle('Cần 2 · đã có 0 · còn thiếu 2')).toBeInTheDocument()
  })

  it('không truyền nodeKey thì không dán nhãn bước — màn Hợp đồng xem sổ tổng', async () => {
    mock({ 'T-1': 'k02' })
    const { container } = render(<DocumentRegister contractId="HD-1" serviceLineId="SL-1" inputOnly />)

    await screen.findByText('Sổ đỏ')
    expect(container.querySelector('.dr-tag.is-buoc-nay')).toBeNull()
    expect(container.querySelector('.dr-tag.is-chua-phan')).toBeNull()
  })
})
