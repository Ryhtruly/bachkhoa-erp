import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import DocumentCabinet from './DocumentCabinet'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => 'token'),
  peekApiCache: vi.fn(() => null),
}))

const lines = [
  { id: 'SL-SURVEY', name: 'Đo vẽ hiện trạng' },
  { id: 'SL-LEGAL', name: 'Tách thửa pháp lý' },
]
const group = name => [{
  node_code: 'K01', node_name: 'Tiếp nhận', task_node_id: `TN-${name}`, total: 1, done: 0,
  documents: [{ id: `DT-${name}`, name, source_label: 'Khách hàng cung cấp', file_count: 0, files: [] }],
}]

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('DocumentCabinet', () => {
  it('mở thẳng cây Node → loại giấy, không còn ngăn nguyên bản hoặc UI xin miễn', async () => {
    apiFetch.mockResolvedValue({ checklist_cabinet_by_node: group('CCCD chủ đất') })
    render(<DocumentCabinet contractId="HD-1" serviceLines={[lines[0]]} />)

    fireEvent.click(await screen.findByRole('button', { name: /K01.*0\/1/i }))
    expect(screen.getByText('CCCD chủ đất')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /nguyên bản|theo bước/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /xin miễn|thêm giấy tờ/i })).not.toBeInTheDocument()
  })

  it('đổi hạng mục thì nạp đúng tủ service line mới, không trộn hai quy trình', async () => {
    apiFetch.mockImplementation(url => Promise.resolve({
      checklist_cabinet_by_node: String(url).includes('SL-LEGAL')
        ? group('Giấy phép xây dựng')
        : group('Ảnh hiện trạng'),
    }))
    render(<DocumentCabinet contractId="HD-1" serviceLines={lines} />)
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('service_line_id=SL-SURVEY')))

    fireEvent.change(screen.getByLabelText('Hạng mục của tủ hồ sơ'), { target: { value: 'SL-LEGAL' } })
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('service_line_id=SL-LEGAL')))
    fireEvent.click(screen.getByRole('button', { name: /K01.*0\/1/i }))
    expect(await screen.findByText('Giấy phép xây dựng')).toBeInTheDocument()
    expect(screen.queryByText('Ảnh hiện trạng')).not.toBeInTheDocument()
  })

  it('fallback về cabinet_by_node khi hợp đồng chưa khởi tạo checklist runtime', async () => {
    apiFetch.mockResolvedValue({
      checklist_cabinet_by_node: [],
      cabinet_by_node: group('Sơ đồ cắm mốc'),
    })
    render(<DocumentCabinet contractId="HD-NEW" serviceLines={[lines[0]]} />)

    fireEvent.click(await screen.findByRole('button', { name: /K01.*0\/1/i }))
    expect(await screen.findByText('Sơ đồ cắm mốc')).toBeInTheDocument()
  })
})
