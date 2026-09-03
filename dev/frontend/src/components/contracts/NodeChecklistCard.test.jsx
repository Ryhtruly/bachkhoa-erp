import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import NodeChecklistCard from './NodeChecklistCard'
import { payRateFor } from './nodeCompensation'

const TEMPLATES = new Map([
  ['T-CCCD', { id: 'T-CCCD', name: 'CCCD chủ đất' }],
  ['T-BANVE', { id: 'T-BANVE', name: 'Bản vẽ hiện trạng' }],
])

const WORK_ITEMS = [
  {
    id: 'WI-DO', name: 'Đo hiện trường',
    rates: [
      { role_code: 'MAIN', amount: 300000 },
      { role_code: 'ASSISTANT', amount: 150000 },
    ],
  },
  { id: 'WI-VE', name: 'Vẽ bản đồ', rates: [{ role_code: 'MAIN', amount: 500000 }] },
]

// Cấu hình chỉ khai LOẠI giấy đầu ra. Tệp thật và phán quyết của Giám đốc đến từ
// runtime, tra bằng template_id — thẻ trộn hai nguồn đó lại.
const ITEM = {
  key: 'do-hien-truong',
  name: 'Đo hiện trường',
  output_documents: [
    { template_id: 'T-CCCD' },
    { template_id: 'T-BANVE' },
  ],
  compensation: { work_item_id: 'WI-DO' },
  runtime: {
    id: 'CR-1',
    review_by_template: {
      'T-CCCD': { document_id: 'DOC-CCCD', review_status: 'pending_review' },
      'T-BANVE': {
        document_id: 'DOC-BANVE',
        review_status: 'rejected',
        rejection_reason: 'Ảnh mờ, không đọc được số',
      },
    },
  },
}

const docWithVerdict = (index) => ({
  ...ITEM.output_documents[index],
  ...ITEM.runtime.review_by_template[ITEM.output_documents[index].template_id],
})

const mount = (props = {}) => render(
  <NodeChecklistCard
    item={ITEM}
    index={0}
    docTemplateById={TEMPLATES}
    workItems={WORK_ITEMS}
    roleCode="MAIN"
    canManageCompensation
    {...props}
  />,
)

describe('Tiền khoán suy từ bảng giá', () => {
  it('lấy đúng mức của vai trò đang xét', () => {
    expect(payRateFor(WORK_ITEMS[0], 'MAIN')).toBe(300000)
    expect(payRateFor(WORK_ITEMS[0], 'ASSISTANT')).toBe(150000)
  })

  it('vai trò không có mức riêng thì rơi về mức đầu, không trả 0 im lặng', () => {
    // Trả 0 sẽ khiến nhân viên tưởng việc này không được trả tiền.
    expect(payRateFor(WORK_ITEMS[1], 'ASSISTANT')).toBe(500000)
  })

  it('chưa chọn công việc thì bằng 0', () => {
    expect(payRateFor(null, 'MAIN')).toBe(0)
  })
})

describe('Card checklist', () => {
  afterEach(cleanup)

  it('badge đếm số GIẤY ĐẦU RA, không đếm thứ khác', () => {
    mount()
    expect(document.querySelector('.wf-check-card__count')).toHaveTextContent('2')
  })

  it('checklist chưa gán giấy nào thì badge 0 và nói rõ', () => {
    mount({ item: { ...ITEM, output_documents: [] } })
    expect(document.querySelector('.wf-check-card__count')).toHaveTextContent('0')
    expect(screen.getByText(/Chưa gán giấy tờ đầu ra nào/)).toBeInTheDocument()
  })

  it('dòng chưa quyết hiện duyệt và từ chối', () => {
    mount({ onApprove: vi.fn(), onReject: vi.fn() })
    const row = screen.getByText('CCCD chủ đất').closest('.wf-check-doc')
    expect(within(row).getByRole('button', { name: /duyệt/ })).toBeEnabled()
    expect(within(row).getByRole('button', { name: /từ chối/ })).toBeEnabled()
  })

  it('dòng đã từ chối hiện chip lý do và KHÔNG còn hai nút', () => {
    mount({ onApprove: vi.fn(), onReject: vi.fn() })
    const row = screen.getByText('Bản vẽ hiện trạng').closest('.wf-check-doc')
    expect(within(row).getByText('lí do')).toHaveAttribute('title', 'Ảnh mờ, không đọc được số')
    expect(within(row).queryByRole('button', { name: /^duyệt/ })).not.toBeInTheDocument()
    expect(within(row).getByText('đã từ chối')).toBeInTheDocument()
  })

  it('từ chối BẮT BUỘC có lý do — bỏ trống thì không gửi được', () => {
    const onReject = vi.fn()
    mount({ onApprove: vi.fn(), onReject })
    const row = screen.getByText('CCCD chủ đất').closest('.wf-check-doc')
    fireEvent.click(within(row).getByRole('button', { name: /từ chối/ }))

    // Nhân viên không biết phải sửa gì nếu lý do trống.
    expect(within(row).getByRole('button', { name: 'Gửi' })).toBeDisabled()

    fireEvent.change(within(row).getByLabelText('Lý do từ chối'), { target: { value: 'Thiếu mặt sau' } })
    expect(within(row).getByRole('button', { name: 'Gửi' })).toBeEnabled()
    fireEvent.click(within(row).getByRole('button', { name: 'Gửi' }))

    expect(onReject).toHaveBeenCalledWith(0, docWithVerdict(0), 'Thiếu mặt sau')
  })

  it('duyệt gọi đúng chỉ số checklist và đúng tờ giấy', () => {
    const onApprove = vi.fn()
    mount({ index: 3, onApprove, onReject: vi.fn() })
    const row = screen.getByText('CCCD chủ đất').closest('.wf-check-doc')
    fireEvent.click(within(row).getByRole('button', { name: /duyệt/ }))

    expect(onApprove).toHaveBeenCalledWith(3, docWithVerdict(0))
  })

  it('chưa nối luồng duyệt thì nút disabled, không im lặng', () => {
    mount()
    const row = screen.getByText('CCCD chủ đất').closest('.wf-check-doc')
    expect(within(row).getByRole('button', { name: /duyệt/ })).toBeDisabled()
  })

  it('loại giấy chưa ai nộp tệp thì KHÔNG duyệt được', () => {
    // Nút sáng trên một tờ không tồn tại là mời Giám đốc duyệt hư không, rồi
    // máy chủ trả 422 — hỏng muộn thay vì chặn sớm.
    mount({
      onApprove: vi.fn(),
      onReject: vi.fn(),
      item: { ...ITEM, runtime: { id: 'CR-1', review_by_template: {} } },
    })
    const row = screen.getByText('CCCD chủ đất').closest('.wf-check-doc')
    const btn = within(row).getByRole('button', { name: /duyệt/ })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'Chưa có tệp nào để duyệt')
  })

  it('thẻ chỉ đọc vẫn duyệt được khi được trao quyền duyệt', () => {
    // Thanh Chờ duyệt bày thẻ readOnly (không cho sửa cấu hình) nhưng duyệt từng
    // tờ chính là việc của nó — gộp hai quyền làm một là khoá mất luồng duyệt.
    mount({ onApprove: vi.fn(), onReject: vi.fn(), readOnly: true, canReviewDocuments: true })
    const row = screen.getByText('CCCD chủ đất').closest('.wf-check-doc')
    expect(within(row).getByRole('button', { name: /duyệt/ })).toBeEnabled()
  })

  it('lương khoán đổi theo công việc đã chọn', () => {
    mount()
    expect(document.querySelector('.wf-check-card__pay')).toHaveTextContent('300.000')

    cleanup()
    mount({ item: { ...ITEM, compensation: { work_item_id: 'WI-VE' } } })
    expect(document.querySelector('.wf-check-card__pay')).toHaveTextContent('500.000')
  })

  it('không chọn công việc thì lương khoán là 0', () => {
    mount({ item: { ...ITEM, compensation: {} } })
    expect(document.querySelector('.wf-check-card__pay')).toHaveTextContent('0')
    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('chế độ chỉ đọc thì khoá cả thêm giấy lẫn duyệt', () => {
    mount({ readOnly: true, onApprove: vi.fn(), onReject: vi.fn() })
    expect(screen.getByRole('button', { name: /thêm giấy/ })).toBeDisabled()
    const row = screen.getByText('CCCD chủ đất').closest('.wf-check-doc')
    expect(within(row).getByRole('button', { name: /duyệt/ })).toBeDisabled()
  })

  it('mã giấy không tra được tên vẫn hiện ra, không mất dòng', () => {
    // Mất dòng là Giám đốc không biết còn tờ nào chưa duyệt.
    mount({ item: { ...ITEM, output_documents: [{ template_id: 'T-LA' }] } })
    expect(screen.getByText('T-LA')).toBeInTheDocument()
  })
})
