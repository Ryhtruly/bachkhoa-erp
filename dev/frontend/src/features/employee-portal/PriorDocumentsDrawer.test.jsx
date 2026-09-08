import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import PriorDocumentsDrawer from './PriorDocumentsDrawer'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => 'token'),
  peekApiCache: vi.fn(() => null),
}))

const groups = [{
  node_code: 'K02', node_name: 'Khảo sát & đo hiện trường', task_node_id: 'TN-2', total: 1, done: 1,
  documents: [{
    id: 'DT-1', name: 'Sơ đồ hiện trạng vị trí', source_label: 'Công ty soạn', file_count: 1,
    files: [{ id: 'D-1', document_id: 'D-1', file_name: 'so-do.pdf' }],
  }],
}]

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('PriorDocumentsDrawer dùng tủ hồ sơ chuẩn', () => {
  it('bỏ danh sách file phẳng và hiển thị Node → loại giấy → file đạt', async () => {
    apiFetch.mockResolvedValue({ checklist_cabinet_by_node: groups })
    render(<PriorDocumentsDrawer
      open taskNodeId="TN-2" contractId="HD-1" serviceLineId="SL-1" currentNodeCode="K02"
      onClose={vi.fn()} onOpenDocument={vi.fn()}
    />)

    expect(await screen.findByText('Sơ đồ hiện trạng vị trí')).toBeInTheDocument()
    expect(screen.queryByText('Tệp đã nộp ở các bước trước')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /tải lên|xóa/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Sơ đồ hiện trạng.*1 file/i }))
    expect(screen.getByRole('button', { name: 'so-do.pdf' })).toBeInTheDocument()
  })
})
