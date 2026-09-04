import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import NodeDocumentCabinet from './NodeDocumentCabinet'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))

const sharedDocument = {
  checklist_result_id: 'CR-DONE',
  template_id: 'TYPE-LEGAL',
  name: 'Hồ sơ pháp lý đã duyệt',
  source: 'KHACH_HANG',
  source_label: 'Khách hàng cung cấp',
  review_status: 'approved',
  file_count: 3,
  files: [
    { id: 'D-1', file_name: 'mat-truoc.jpg' },
    { id: 'D-2', file_name: 'mat-sau.jpg' },
    { id: 'D-3', file_name: 'xac-nhan.pdf' },
  ],
}

const sharedCabinet = [{
  node_code: 'K01',
  node_name: 'Tiếp nhận',
  total: 1,
  done: 1,
  documents: [sharedDocument],
}]

const legacyCabinet = [{
  node_code: 'K01',
  node_name: 'Tiếp nhận',
  total: 1,
  done: 0,
  documents: [{
    template_id: 'TYPE-LEGACY',
    name: 'Mẫu legacy chưa duyệt',
    source: 'CONG_TY',
    file_count: 0,
    files: [],
  }],
}]

const mount = () => render(
  <NodeDocumentCabinet
    contractId="HD-1"
    serviceLineId="SL-1"
    currentNodeCode="K01"
    onOpenDocument={vi.fn()}
  />,
)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('NodeDocumentCabinet shared checklist cabinet', () => {
  it('hiện loại đã hoàn tất với đủ số tệp và không trộn hàng legacy', async () => {
    apiFetch.mockResolvedValue({
      checklist_cabinet_by_node: sharedCabinet,
      cabinet_by_node: legacyCabinet,
    })

    mount()

    const row = (await screen.findByText('Hồ sơ pháp lý đã duyệt')).closest('li')
    expect(within(row).getByRole('button', { name: '3 tệp' })).toBeInTheDocument()
    expect(screen.queryByText('Mẫu legacy chưa duyệt')).not.toBeInTheDocument()
  })

  it('bỏ qua tủ legacy khi trường tủ checklist chưa có', async () => {
    apiFetch.mockResolvedValue({ cabinet_by_node: legacyCabinet })

    mount()

    expect(await screen.findByText(/chưa có loại giấy nào được gắn vào checklist/)).toBeInTheDocument()
    expect(screen.queryByText('Mẫu legacy chưa duyệt')).not.toBeInTheDocument()
  })
})
