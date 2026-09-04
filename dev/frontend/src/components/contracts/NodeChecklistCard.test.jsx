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

const RUNTIME_ITEM = {
  ...ITEM,
  runtime: {
    id: 'CR-RUNTIME',
    status: 'pending_approval',
    document_types: [
      {
        id: 'TYPE-ANH',
        name: 'Ảnh hiện trạng thửa đất',
        source: 'CONG_TY',
        status: 'pending_review',
        rejection_reason: null,
        file_count: 3,
        files: [
          { document_id: 'DOC-1', file_name: 'mat-truoc.jpg', content_type: 'image/jpeg' },
          { document_id: 'DOC-2', file_name: 'mat-sau.jpg', content_type: 'image/jpeg' },
          { document_id: 'DOC-3', file_name: 'toan-canh.pdf', content_type: 'application/pdf' },
        ],
      },
      {
        id: 'TYPE-PHAP-LY',
        name: 'Biên nhận hồ sơ',
        source: 'CO_QUAN',
        status: 'pending_review',
        rejection_reason: null,
        file_count: 0,
        files: [],
      },
    ],
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

  it('ưu tiên loại giấy runtime, bung đúng ba file và mở đúng file kèm ngữ cảnh loại', () => {
    const onOpenDocument = vi.fn()
    mount({
      item: RUNTIME_ITEM,
      onOpenDocument,
      onApproveType: vi.fn(),
      onRejectType: vi.fn(),
    })

    expect(screen.getByText('Ảnh hiện trạng thửa đất')).toBeInTheDocument()
    expect(screen.getByText('Công ty soạn')).toBeInTheDocument()
    expect(screen.getByText('3 file')).toBeInTheDocument()
    expect(screen.queryByText('CCCD chủ đất')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Xem 3 file của Ảnh hiện trạng thửa đất/ }))
    expect(screen.getByText('mat-truoc.jpg')).toBeInTheDocument()
    expect(screen.getByText('mat-sau.jpg')).toBeInTheDocument()
    expect(screen.getByText('toan-canh.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mở mat-sau.jpg/ }))

    expect(onOpenDocument).toHaveBeenCalledWith(expect.objectContaining({
      document_id: 'DOC-2',
      file_name: 'mat-sau.jpg',
      document_type_id: 'TYPE-ANH',
      document_type_name: 'Ảnh hiện trạng thửa đất',
      source: 'CONG_TY',
    }))
  })

  it('mỗi loại pending chỉ có một trạng thái và đúng một cặp Đạt/Không đạt', () => {
    mount({
      item: RUNTIME_ITEM,
      onApproveType: vi.fn(),
      onRejectType: vi.fn(),
    })

    const row = screen.getByText('Ảnh hiện trạng thửa đất').closest('.wf-check-type')
    expect(within(row).getAllByText('Chờ duyệt')).toHaveLength(1)
    expect(within(row).getAllByRole('button', { name: 'Đạt' })).toHaveLength(1)
    expect(within(row).getAllByRole('button', { name: 'Không đạt' })).toHaveLength(1)
  })

  it('từ chối runtime bắt nhập lý do và gửi đúng checklist/type/lý do đã trim', () => {
    const onRejectType = vi.fn()
    mount({
      item: RUNTIME_ITEM,
      onApproveType: vi.fn(),
      onRejectType,
    })

    const row = screen.getByText('Ảnh hiện trạng thửa đất').closest('.wf-check-type')
    fireEvent.click(within(row).getByRole('button', { name: 'Không đạt' }))
    expect(within(row).getByRole('button', { name: 'Xác nhận không đạt' })).toBeDisabled()
    fireEvent.change(within(row).getByLabelText('Lý do không đạt'), {
      target: { value: '  Trang hai bị mờ  ' },
    })
    fireEvent.click(within(row).getByRole('button', { name: 'Xác nhận không đạt' }))

    expect(onRejectType).toHaveBeenCalledWith('CR-RUNTIME', 'TYPE-ANH', 'Trang hai bị mờ')
  })

  it('loại runtime không có file khóa cả Đạt và Không đạt', () => {
    mount({
      item: RUNTIME_ITEM,
      onApproveType: vi.fn(),
      onRejectType: vi.fn(),
    })
    const row = screen.getByText('Biên nhận hồ sơ').closest('.wf-check-type')
    expect(within(row).getByText('Pháp lý')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Đạt' })).toBeDisabled()
    expect(within(row).getByRole('button', { name: 'Không đạt' })).toBeDisabled()
  })

  it('busy chỉ khóa đúng loại đang gửi để chặn double submit', () => {
    const secondType = {
      ...RUNTIME_ITEM.runtime.document_types[0],
      id: 'TYPE-SECOND',
      name: 'Bản đồ kiểm tra',
    }
    mount({
      item: {
        ...RUNTIME_ITEM,
        runtime: {
          ...RUNTIME_ITEM.runtime,
          document_types: [RUNTIME_ITEM.runtime.document_types[0], secondType],
        },
      },
      reviewingTypeId: 'TYPE-ANH',
      onApproveType: vi.fn(),
      onRejectType: vi.fn(),
    })

    const busyRow = screen.getByText('Ảnh hiện trạng thửa đất').closest('.wf-check-type')
    const freeRow = screen.getByText('Bản đồ kiểm tra').closest('.wf-check-type')
    expect(within(busyRow).getByRole('button', { name: 'Đạt' })).toBeDisabled()
    expect(within(freeRow).getByRole('button', { name: 'Đạt' })).toBeEnabled()
  })

  it('document_types rỗng là runtime rỗng, không rơi về giấy legacy', () => {
    mount({ item: { ...ITEM, runtime: { id: 'CR-EMPTY', document_types: [] } } })
    expect(screen.queryByText('CCCD chủ đất')).not.toBeInTheDocument()
    expect(screen.getByText('Chưa có loại giấy nào trong checklist.')).toBeInTheDocument()
  })

  it('runtime approved/rejected chỉ hiện một verdict cấp loại và nguyên văn lý do', () => {
    const item = {
      ...RUNTIME_ITEM,
      runtime: {
        ...RUNTIME_ITEM.runtime,
        document_types: [
          { ...RUNTIME_ITEM.runtime.document_types[0], status: 'approved' },
          {
            ...RUNTIME_ITEM.runtime.document_types[0],
            id: 'TYPE-REJECTED',
            name: 'Bản vẽ pháp lý',
            source: 'KHACH_HANG',
            status: 'rejected',
            rejection_reason: 'Thiếu dấu giáp lai',
          },
        ],
      },
    }
    mount({ item, onApproveType: vi.fn(), onRejectType: vi.fn() })

    const approved = screen.getByText('Ảnh hiện trạng thửa đất').closest('.wf-check-type')
    const rejected = screen.getByText('Bản vẽ pháp lý').closest('.wf-check-type')
    expect(within(approved).getAllByText('Đạt')).toHaveLength(1)
    expect(within(approved).queryByRole('button', { name: 'Đạt' })).not.toBeInTheDocument()
    expect(within(rejected).getByText('Khách hàng cung cấp')).toBeInTheDocument()
    expect(within(rejected).getAllByText('Không đạt')).toHaveLength(1)
    expect(within(rejected).getByText('Thiếu dấu giáp lai')).toBeInTheDocument()
  })
})
