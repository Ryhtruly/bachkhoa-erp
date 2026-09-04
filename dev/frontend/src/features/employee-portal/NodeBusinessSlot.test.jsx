import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import NodeBusinessSlot from './NodeBusinessSlot'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn(), getAccessToken: () => null }))
vi.mock('./CustomerSourceDocuments', () => ({
  default: ({ onEmptyChange }) => (
    <div data-testid="kho-giay-khach">
      <button type="button" onClick={() => onEmptyChange?.(true)}>Báo kho rỗng</button>
    </div>
  ),
}))
vi.mock('../handover/HandoverPanel', () => ({
  default: () => <div data-testid="ban-giao" />,
}))
vi.mock('../legal-dossier/SubmissionReceiptPanel', () => ({
  default: () => <div data-testid="theo-doi-co-quan" />,
}))

const ITEM = {
  contract_id: '001/BK-2026',
  service_line_id: 'SL-1',
  contract_total_value: 12300000,
  contract_paid_amount: 1230000,
}

const task = (extra = {}) => ({
  id: 'n1', node_code: 'K05a', node_key: 'k05a', status: 'in_progress', ...extra,
})

const mount = (taskProps, props = {}) => render(
  <NodeBusinessSlot task={task(taskProps)} item={ITEM} {...props} />,
)

afterEach(cleanup)

describe('Chọn khối theo CỜ CẤU HÌNH, không theo mã bước', () => {
  it('bước không khai cờ nào chỉ có kho giấy chung, không có nghiệp vụ đặc biệt', () => {
    const { container } = mount({ node_code: 'K03' })

    expect(container.querySelectorAll('.eiw-band--slot')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Kho giấy tờ khách gửi/ })).toBeInTheDocument()
    expect(screen.queryByTestId('theo-doi-co-quan')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ban-giao')).not.toBeInTheDocument()
  })

  it('K05a có tạm dừng nhưng KHÔNG có bảng theo dõi cơ quan', () => {
    mount({ node_code: 'K05a', allow_pause: true, allow_gov_tracking: false })

    expect(screen.getByRole('button', { name: /Tạm dừng/ })).toBeInTheDocument()
    // Nộp xong là hết việc với cơ quan — bày nhật ký ở đó chỉ làm dài màn.
    expect(screen.queryByTestId('theo-doi-co-quan')).not.toBeInTheDocument()
  })

  it('K05b có cả tạm dừng lẫn bảng theo dõi cơ quan', () => {
    mount({ node_code: 'K05b', allow_pause: true, allow_gov_tracking: true })

    const rawDocuments = screen.getByRole('button', { name: /Kho giấy tờ khách gửi/ })
    const pause = screen.getByRole('button', { name: /Tạm dừng/ })
    expect(pause).toBeInTheDocument()
    expect(screen.getByTestId('theo-doi-co-quan')).toBeInTheDocument()
    expect(rawDocuments.compareDocumentPosition(pause) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('requires_gov_submission=true vẫn hiển thị bảng theo dõi cơ quan khi allow_gov_tracking=false', () => {
    mount({ requires_gov_submission: true, allow_gov_tracking: false })

    expect(screen.getByTestId('theo-doi-co-quan')).toBeInTheDocument()
  })

  it('K06 có thanh công nợ và khối bàn giao', () => {
    mount({ node_code: 'K06', is_handover: true })

    expect(screen.getByTestId('ban-giao')).toBeInTheDocument()
    expect(screen.getByText(/1\.230\.000đ \/ 12\.300\.000đ/)).toBeInTheDocument()
  })

  it('mọi node mở kho giấy tờ khách gửi và liên kết aria-controls với id của panel', () => {
    mount({ node_code: 'K03' })
    const toggle = screen.getByRole('button', { name: /Kho giấy tờ khách gửi/ })
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-controls', 'customer-source-documents-panel')

    const panel = document.getElementById('customer-source-documents-panel')
    expect(panel).toBeInTheDocument()
    expect(screen.getByTestId('kho-giay-khach')).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('customer-source-documents-panel')).not.toBeInTheDocument()
  })

  it('tự đóng kho giấy khi component con báo không còn tệp thô', () => {
    mount({ node_code: 'K03' })
    const toggle = screen.getByRole('button', { name: /Kho giấy tờ khách gửi/ })

    fireEvent.click(screen.getByRole('button', { name: 'Báo kho rỗng' }))

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('customer-source-documents-panel')).not.toBeInTheDocument()
  })
})

describe('Tạm dừng và chạy tiếp', () => {
  it('đang tạm dừng thì hiện ghi chú và nút Tiếp tục, không mời dừng lần nữa', () => {
    mount({
      allow_pause: true,
      pause_reason_type: 'AGENCY',
      paused_note: 'Chờ thông báo thuế từ chi cục',
    })

    expect(screen.getByText('Chờ thông báo thuế từ chi cục')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tiếp tục/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Tạm dừng/ })).not.toBeInTheDocument()
  })

  it('bước chưa chạy thì không tạm dừng được', () => {
    mount({ allow_pause: true, status: 'ready' })

    // Dừng một bước chưa bắt đầu thì chẳng có đồng hồ nào để dừng.
    expect(screen.getByRole('button', { name: /Tạm dừng/ })).toBeDisabled()
  })

  it('bấm Tiếp tục gọi đúng handler', () => {
    const onResume = vi.fn()
    mount({ allow_pause: true, pause_reason_type: 'AGENCY', paused_note: 'Chờ cơ quan' }, { onResume })

    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }))
    expect(onResume).toHaveBeenCalled()
  })
})

describe('Thanh công nợ K06', () => {
  it('thu đủ thì nói đã thu đủ, không hiện số nợ âm', () => {
    render(
      <NodeBusinessSlot
        task={task({ node_code: 'K06', is_handover: true })}
        item={{ ...ITEM, contract_paid_amount: 12300000 }}
      />,
    )
    expect(screen.getByText('đã thu đủ')).toBeInTheDocument()
  })

  it('còn nợ thì nói rõ còn bao nhiêu', () => {
    mount({ node_code: 'K06', is_handover: true })
    expect(screen.getByText(/còn 11\.070\.000đ/)).toBeInTheDocument()
  })

  it('hợp đồng giá trị 0đ và đã thu 0đ hiển thị đã thu đủ (settled)', () => {
    render(
      <NodeBusinessSlot
        task={task({ node_code: 'K06', is_handover: true })}
        item={{ ...ITEM, contract_total_value: 0, contract_paid_amount: 0 }}
      />,
    )
    expect(screen.getByText('đã thu đủ')).toBeInTheDocument()
    expect(screen.getByText(/0đ \/ 0đ/)).toBeInTheDocument()
    expect(screen.queryByText(/còn/)).not.toBeInTheDocument()
  })
})
