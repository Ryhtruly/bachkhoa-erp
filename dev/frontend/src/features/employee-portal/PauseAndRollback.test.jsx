import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PauseReasonModal from './PauseReasonModal'
import RollbackPickerModal from './RollbackPickerModal'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn(), getAccessToken: () => null }))

const { apiFetch } = await import('../../lib/api')

afterEach(cleanup)

// ── Modal lý do tạm dừng ────────────────────────────────────────────────────

describe('Chọn lý do tạm dừng', () => {
  const mount = (props = {}) => render(
    <PauseReasonModal open onClose={vi.fn()} onConfirm={vi.fn()} {...props} />,
  )

  it('bày đủ ba lý do, mỗi lý do nói rõ khi nào dùng', () => {
    mount()
    expect(screen.getByText('Chờ cơ quan')).toBeInTheDocument()
    expect(screen.getByText('Chờ đo vẽ sửa')).toBeInTheDocument()
    expect(screen.getByText('Chờ nội bộ')).toBeInTheDocument()
    expect(screen.getByText(/ra thông báo thuế/)).toBeInTheDocument()
  })

  it('chưa chọn lý do thì chưa gửi được', () => {
    mount()
    // Lý do chính là thứ phân biệt "chờ cơ quan" với "tôi bận" — thiếu nó thì
    // tạm dừng thành cái van xả cho mọi việc chậm.
    expect(screen.getByRole('button', { name: /Tạm dừng/ })).toBeDisabled()
  })

  it('chọn lý do rồi mà ghi chú quá ngắn thì vẫn chưa gửi được', () => {
    mount()
    fireEvent.click(screen.getByLabelText(/Chờ cơ quan/))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ok' } })

    expect(screen.getByRole('button', { name: /Tạm dừng/ })).toBeDisabled()
    expect(screen.getByText(/người tiếp nhận sau đọc đúng dòng này/i)).toBeInTheDocument()
  })

  it('đủ lý do và ghi chú thì gửi đúng nội dung', () => {
    const onConfirm = vi.fn()
    mount({ onConfirm })
    fireEvent.click(screen.getByLabelText(/Chờ nội bộ/))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Chờ sếp ký duyệt hồ sơ' } })
    fireEvent.click(screen.getByRole('button', { name: /Tạm dừng/ }))

    expect(onConfirm).toHaveBeenCalledWith({
      reason_type: 'INTERNAL', note: 'Chờ sếp ký duyệt hồ sơ',
    })
  })

  it('chọn CHỜ ĐO VẼ thì nút đổi chữ — còn một nhịp nữa mới xong', () => {
    mount()
    fireEvent.click(screen.getByLabelText(/Chờ đo vẽ sửa/))

    // Bản vẽ sai ranh nghĩa là phải kéo bước đo vẽ về sửa. Nút ghi "Tạm dừng" ở
    // đây là nói dối: bấm xong còn phải chọn bước.
    expect(screen.getByRole('button', { name: /Tiếp tục chọn bước/ })).toBeInTheDocument()
  })
})

// ── Bảng chọn bước quay lại ─────────────────────────────────────────────────

const NODES = [
  { id: 'n1', node_code: 'K01', name: 'Tiếp nhận', status: 'accepted', assignee_name: 'Anh A' },
  { id: 'n2', node_code: 'K02', name: 'Khảo sát', status: 'accepted', assignee_name: 'Anh B' },
  { id: 'n3', node_code: 'K03', name: 'Chuẩn hoá', status: 'accepted', assignee_name: 'Anh C' },
  { id: 'n4', node_code: 'K05a', name: 'Nộp hồ sơ', status: 'in_progress', assignee_name: 'Tôi' },
  { id: 'n5', node_code: 'K06', name: 'Bàn giao', status: 'pending' },
]

describe('Chọn bước để quay lại', () => {
  const mount = (props = {}) => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({
      nodes: [
        { task_node_id: 'n2', node_code: 'K02', status: 'accepted', will_reset: true },
        { task_node_id: 'n3', node_code: 'K03', status: 'accepted', will_reset: true },
        { task_node_id: 'n4', node_code: 'K05a', status: 'in_progress', will_reset: true },
      ],
    })
    return render(
      <RollbackPickerModal
        open
        nodes={NODES}
        currentTaskNodeId="n4"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        {...props}
      />,
    )
  }

  it('chỉ cho chọn bước ĐÃ CHẠY và nằm TRƯỚC bước hiện tại', () => {
    mount()
    const list = screen.getByRole('list')

    expect(within(list).getByRole('button', { name: /K01/ })).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: /K03/ })).toBeInTheDocument()
    // K05a là bước hiện tại, K06 chưa chạy — không kéo về được.
    expect(within(list).queryByRole('button', { name: /K06/ })).not.toBeInTheDocument()
  })

  it('vùng ảnh hưởng do MÁY CHỦ tính, không tự đoán theo vị trí', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /K02/ }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/rollback-preview')))
    // Quy trình có nhánh thì đoán theo thứ tự sẽ sai — người bấm tưởng mở lại ba
    // bước, thực tế mở lại năm.
    await waitFor(() =>
      expect(screen.getByText(/kéo/)).toHaveTextContent('3'))
  })

  it('chọn xong mới hiện thông tin bước đó', async () => {
    mount()
    expect(screen.getByText(/Chọn một bước ở cột bên phải/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /K02/ }))
    expect(await screen.findByText('K02 · Khảo sát')).toBeInTheDocument()
    expect(screen.getByText('Anh B')).toBeInTheDocument()
  })

  it('thiếu ghi chú thì không gửi được', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /K02/ }))
    expect(screen.getByRole('button', { name: /Gửi yêu cầu/ })).toBeDisabled()
  })

  it('đủ điều kiện thì gửi đúng bước và ghi chú', async () => {
    const onSubmit = vi.fn()
    mount({ onSubmit })
    fireEvent.click(screen.getByRole('button', { name: /K02/ }))
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Bản vẽ sai ranh mốc số 4' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Gửi yêu cầu/ }))

    expect(onSubmit).toHaveBeenCalledWith({
      target_task_node_id: 'n2', reason: 'Bản vẽ sai ranh mốc số 4',
    })
  })

  it('chưa mở thì không hỏi máy chủ', () => {
    apiFetch.mockReset()
    render(
      <RollbackPickerModal open={false} nodes={NODES} currentTaskNodeId="n4" onClose={vi.fn()} />,
    )
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
