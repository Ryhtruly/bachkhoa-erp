import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PriorDocumentsDrawer from './PriorDocumentsDrawer'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn(), getAccessToken: () => null }))

const { apiFetch } = await import('../../lib/api')

const GROUPS = [
  {
    node_code: 'K02',
    node_name: 'Khảo sát & đo hiện trường',
    status: 'accepted',
    documents: [
      { document_id: 'd1', name: 'Sơ đồ hiện trạng vị trí', uploaded_at: '2026-09-01T00:00:00Z' },
      { document_id: 'd2', name: 'Bản trích đo địa chính', uploaded_at: '2026-09-02T00:00:00Z' },
    ],
  },
  {
    node_code: 'K03',
    node_name: 'Chuẩn hoá tài liệu kỹ thuật',
    status: 'accepted',
    documents: [{ document_id: 'd3', name: 'Bản vẽ đã chuẩn hoá', uploaded_at: '2026-09-03T00:00:00Z' }],
  },
]

const mount = (data = GROUPS, props = {}) => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue({ data })
  return render(
    <PriorDocumentsDrawer open taskNodeId="n4" onClose={vi.fn()} {...props} />,
  )
}

afterEach(cleanup)

describe('Tủ hồ sơ các bước đã xong', () => {
  it('gom giấy theo bước, kèm mã và tên bước', async () => {
    mount()

    expect(await screen.findByText(/K02 · Khảo sát & đo hiện trường/)).toBeInTheDocument()
    expect(screen.getByText(/K03 · Chuẩn hoá tài liệu kỹ thuật/)).toBeInTheDocument()
    expect(screen.getByText('Sơ đồ hiện trạng vị trí')).toBeInTheDocument()
  })

  it('nói tổng số giấy và số bước, để biết ngay tủ có gì', async () => {
    mount()
    expect(await screen.findByText(/3 giấy tờ từ 2 bước đã nghiệm thu/)).toBeInTheDocument()
  })

  it('CHỈ ĐỌC — không có nút tải lên hay xoá nào', async () => {
    mount()
    await screen.findByText('Sơ đồ hiện trạng vị trí')

    expect(screen.queryByRole('button', { name: /tải lên|Chọn file|Xoá/i })).not.toBeInTheDocument()
  })

  it('bấm một tờ thì mới xin link tờ đó, không nạp sẵn cả đống', async () => {
    const onOpenDocument = vi.fn()
    mount(GROUPS, { onOpenDocument })
    await screen.findByText('Sơ đồ hiện trạng vị trí')

    // Trước khi bấm: đúng MỘT lượt gọi — lượt lấy danh sách tên. Ký sẵn link cho
    // vài chục tờ là vài chục lượt gọi kho tệp cho một thao tác mở một tờ.
    expect(apiFetch).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Mở Sơ đồ hiện trạng vị trí/ }))
    expect(onOpenDocument).toHaveBeenCalledWith(
      expect.objectContaining({ document_id: 'd1' }),
    )
  })

  it('bước đầu chuỗi thì nói rõ tủ trống, không mở khung rỗng không lời', async () => {
    mount([])
    expect(await screen.findByText(/Chưa có bước nào hoàn thành trước bước này/)).toBeInTheDocument()
  })

  it('gọi hỏng thì báo lỗi, không im lặng để tủ trống', async () => {
    apiFetch.mockReset()
    apiFetch.mockRejectedValue(new Error('Bạn không thuộc nhóm thực hiện hạng mục này'))
    render(<PriorDocumentsDrawer open taskNodeId="n4" onClose={vi.fn()} />)

    // Tủ trống và tủ bị chặn là hai chuyện khác nhau. Im lặng thì nhân viên
    // tưởng hồ sơ chưa có giấy nào rồi đi hỏi vòng quanh.
    expect(await screen.findByText(/không thuộc nhóm thực hiện/)).toBeInTheDocument()
  })

  it('chưa mở thì không gọi máy chủ', () => {
    apiFetch.mockReset()
    render(<PriorDocumentsDrawer open={false} taskNodeId="n4" onClose={vi.fn()} />)
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('mỗi bước liệt kê đúng số giấy của nó', async () => {
    mount()
    const nhom = (await screen.findByText(/K02 ·/)).closest('.eiw-drawer__group')
    expect(within(nhom).getAllByRole('button')).toHaveLength(2)
  })
})
