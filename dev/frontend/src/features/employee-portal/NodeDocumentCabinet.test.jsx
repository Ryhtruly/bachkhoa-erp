import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import NodeDocumentCabinet from './NodeDocumentCabinet'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  peekApiCache: vi.fn(() => null),
}))

const cabinet = [{
  node_code: 'K01', node_name: 'Tiếp nhận', task_node_id: 'TN-1', total: 2, done: 1,
  documents: [{
    id: 'TYPE-1', name: 'Hồ sơ pháp lý đã duyệt', source_label: 'Khách hàng cung cấp',
    file_count: 1, files: [{ id: 'D-1', document_id: 'D-1', file_name: 'ban-da-duyet.pdf' }],
  }, {
    id: 'TYPE-2', name: 'Giấy chưa có file đạt', source_label: 'Pháp lý', file_count: 0, files: [],
  }],
}]

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('NodeDocumentCabinet', () => {
  it('chỉ đọc tủ checklist của đúng service line và mở file ở dưới loại giấy', async () => {
    const onOpenDocument = vi.fn()
    apiFetch.mockResolvedValue({ checklist_cabinet_by_node: cabinet, cabinet_by_node: [{ node_code: 'LEGACY' }] })
    render(<NodeDocumentCabinet contractId="HD-1" serviceLineId="SL-1" currentNodeCode="K01" onOpenDocument={onOpenDocument} />)

    expect(await screen.findByText('Hồ sơ pháp lý đã duyệt')).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('service_line_id=SL-1'))
    expect(screen.getByText('Giấy chưa có file đạt')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Hồ sơ pháp lý.*1 file/i }))
    fireEvent.click(screen.getByRole('button', { name: 'ban-da-duyet.pdf' }))
    expect(onOpenDocument).toHaveBeenCalledWith(cabinet[0].documents[0].files[0])
    expect(screen.queryByText('LEGACY')).not.toBeInTheDocument()
  })

  it('không lấy tủ legacy làm dữ liệu dự phòng', async () => {
    apiFetch.mockResolvedValue({ cabinet_by_node: [{ node_code: 'K01', documents: [{ name: 'Mẫu legacy' }] }] })
    render(<NodeDocumentCabinet contractId="HD-1" serviceLineId="SL-1" />)
    expect(await screen.findByText(/chưa có loại giấy nào được phân vào checklist/i)).toBeInTheDocument()
    expect(screen.queryByText('Mẫu legacy')).not.toBeInTheDocument()
  })
})
