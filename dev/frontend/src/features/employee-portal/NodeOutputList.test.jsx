import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import NodeOutputList from './NodeOutputList'

const TEMPLATES = new Map([
  ['T-CCCD', { id: 'T-CCCD', name: 'CCCD chủ đất' }],
  ['T-BANVE', { id: 'T-BANVE', name: 'Bản vẽ hiện trạng' }],
  ['T-SODO', { id: 'T-SODO', name: 'Sơ đồ hiện trạng vị trí' }],
])

const ITEM = {
  id: 'CR-1',
  name: 'Bộ hồ sơ kỹ thuật',
  template_names: {
    'T-CCCD': 'CCCD chủ đất',
    'T-BANVE': 'Bản vẽ hiện trạng',
    'T-SODO': 'Sơ đồ hiện trạng vị trí',
  },
  output_documents: [
    { template_id: 'T-CCCD' },
    { template_id: 'T-BANVE' },
    { template_id: 'T-SODO' },
  ],
  review_by_template: {
    'T-CCCD': { document_id: 'd1', review_status: 'approved' },
    'T-BANVE': {
      document_id: 'd2',
      review_status: 'rejected',
      rejection_reason: 'Thiếu tọa độ mốc ranh số 4',
    },
    'T-SODO': { document_id: 'd3', review_status: 'pending_review' },
  },
}

const mount = (props = {}) => render(
  <NodeOutputList
    checklistItem={ITEM}
    nodeStatus="submitted"
    docTemplateById={TEMPLATES}
    {...props}
  />,
)

const rowOf = (name) => screen.getByText(name).closest('.eiw-doc')

afterEach(cleanup)

describe('Ba trạng thái của một tờ giấy', () => {
  it('tờ đã duyệt hiện màu đạt', () => {
    mount()
    expect(rowOf('CCCD chủ đất')).toHaveClass('is-approved')
  })

  it('tờ bị từ chối hiện dải NGUYÊN NHÂN kèm đúng lý do, ngay dưới tờ đó', () => {
    mount()
    const row = rowOf('Bản vẽ hiện trạng')

    expect(row).toHaveClass('is-rejected')
    expect(within(row).getByText('Nguyên nhân từ chối')).toBeInTheDocument()
    expect(within(row).getByText('Thiếu tọa độ mốc ranh số 4')).toBeInTheDocument()
  })

  it('tờ CHƯA AI CHẤM có hình thức riêng, không trông giống tờ đã duyệt', () => {
    mount()
    const cho = rowOf('Sơ đồ hiện trạng vị trí')

    expect(cho).toHaveClass('is-pending')
    expect(cho).not.toHaveClass('is-approved')
  })

  it('loại giấy chưa ai nộp tệp thì hiện_MISSING', () => {
    mount({
      checklistItem: { ...ITEM, review_by_template: {} },
    })
    const row = rowOf('CCCD chủ đất')
    expect(row).toHaveClass('is-missing')
  })
})

describe('Trạng thái và nhãn', () => {
  it('tờ đã duyệt hiển thị nhãn "Đã duyệt"', () => {
    mount()
    const row = rowOf('CCCD chủ đất')
    expect(within(row).getByText('Đã duyệt')).toBeInTheDocument()
  })

  it('tờ bị từ chối hiển thị nhãn "Bị từ chối"', () => {
    mount()
    const row = rowOf('Bản vẽ hiện trạng')
    expect(within(row).getByText('Bị từ chối')).toBeInTheDocument()
  })

  it('tờ chờ duyệt hiển thị nhãn "Chờ duyệt"', () => {
    mount()
    const row = rowOf('Sơ đồ hiện trạng vị trí')
    expect(within(row).getByText('Chờ duyệt')).toBeInTheDocument()
  })

  it('tờ chưa nộp hiển thị nhãn "Chưa nộp"', () => {
    mount({
      checklistItem: { ...ITEM, review_by_template: {} },
    })
    const row = rowOf('CCCD chủ đất')
    expect(within(row).getByText('Chưa nộp')).toBeInTheDocument()
  })
})

describe('Bảo vệ tờ đã duyệt', () => {
  it('nút mở tờ đã duyệt có title cảnh báo không thể thay thế', () => {
    mount()
    const row = rowOf('CCCD chủ đất')
    const btn = within(row).getByRole('button', { name: /Mở CCCD chủ đất/ })
    expect(btn).not.toBeDisabled()
    expect(btn).toHaveAttribute('title', 'Đã duyệt — không thể thay thế')
  })

  it('hiện thông báo "Đã duyệt — không thể thay thế" dưới tờ đã duyệt', () => {
    mount()
    const row = rowOf('CCCD chủ đất')
    expect(within(row).getByText(/Đã duyệt — không thể thay thế/)).toBeInTheDocument()
  })

  it('tờ đã duyệt VẪN CÓ THỂ mở (xem), chỉ không thay thế', () => {
    const onOpenDocument = vi.fn()
    mount({ onOpenDocument })
    fireEvent.click(screen.getByRole('button', { name: /Mở CCCD chủ đất/ }))
    expect(onOpenDocument).toHaveBeenCalledWith(
      expect.objectContaining({ template_id: 'T-CCCD', document_id: 'd1' }),
    )
  })
})

describe('Badge đếm ở đầu danh mục', () => {
  it('bước đã nộp thì đếm đã duyệt', () => {
    mount({ nodeStatus: 'submitted' })
    expect(screen.getByText('1/3')).toBeInTheDocument()
    expect(screen.getByText('đã duyệt')).toBeInTheDocument()
  })

  it('bước ĐANG LÀM thì đếm đã tải, không hiện 0/3', () => {
    mount({ nodeStatus: 'in_progress' })
    expect(screen.getByText('3/3')).toBeInTheDocument()
    expect(screen.queryByText('0/3')).not.toBeInTheDocument()
  })

  it('bước đang làm có tờ bị từ chối thì badge hiện tổng đã tải', () => {
    mount({ nodeStatus: 'in_progress' })
    // Tất cả 3 tờ đều có document_id (approved, rejected, pending) → 3/3
    expect(screen.getByText('3/3')).toBeInTheDocument()
  })

  it('bước có tờ chưa nộp thì đếm đúng số đã tải', () => {
    mount({
      nodeStatus: 'in_progress',
      checklistItem: {
        ...ITEM,
        review_by_template: {
          'T-CCCD': { document_id: 'd1', review_status: 'approved' },
        },
      },
    })
    // 1 trong 3 tờ có document_id → 1/3
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })
})

describe('Thêm loại giấy', () => {
  it('nhân viên thấy nút đề xuất thêm giấy', () => {
    const onProposeDocument = vi.fn()
    mount({ canPropose: true, onProposeDocument })

    fireEvent.click(screen.getByRole('button', { name: /Thêm loại giấy/ }))
    expect(onProposeDocument).toHaveBeenCalledWith(ITEM)
  })

  it('không có quyền thì ẩn hẳn nút, không bày nút bấm vào rồi im lặng', () => {
    mount({ canPropose: false })
    expect(screen.queryByRole('button', { name: /Thêm loại giấy/ })).not.toBeInTheDocument()
  })
})

describe('Mở tệp', () => {
  it('bấm mũi tên gọi đúng tờ đang bấm', () => {
    const onOpenDocument = vi.fn()
    mount({ onOpenDocument })

    fireEvent.click(screen.getByRole('button', { name: /Mở Bản vẽ hiện trạng/ }))
    expect(onOpenDocument).toHaveBeenCalledWith(
      expect.objectContaining({ template_id: 'T-BANVE', document_id: 'd2' }),
    )
  })

  it('callback nhận document_id để cha có thể fetch tệp thật', () => {
    const onOpenDocument = vi.fn()
    mount({ onOpenDocument })

    fireEvent.click(screen.getByRole('button', { name: /Mở Bản vẽ hiện trạng/ }))
    const doc = onOpenDocument.mock.calls[0][0]
    expect(doc.document_id).toBe('d2')
    expect(doc).toHaveProperty('template_id', 'T-BANVE')
  })
})

describe('Bước chưa khai giấy đầu ra', () => {
  it('nói rõ chưa khai, không để một khung rỗng không lời', () => {
    mount({ checklistItem: { id: 'CR-2', name: 'Mục rỗng', output_documents: [] } })
    expect(screen.getByText(/chưa khai loại giấy đầu ra nào/)).toBeInTheDocument()
  })
})

describe('Tên loại giấy', () => {
  it('đọc tên máy chủ gửi kèm, không bày UUID', () => {
    render(
      <NodeOutputList
        checklistItem={{
          id: 'CR-9',
          name: 'Giấy khách gửi',
          output_documents: [{ template_id: '96e083eb-4220-4ed8-b467-9f6b55c0678e' }],
          template_names: { '96e083eb-4220-4ed8-b467-9f6b55c0678e': 'CCCD/CMND của người sử dụng đất' },
        }}
        nodeStatus="in_progress"
      />,
    )

    expect(screen.getByText('CCCD/CMND của người sử dụng đất')).toBeInTheDocument()
    expect(screen.queryByText(/96e083eb/)).not.toBeInTheDocument()
  })

  it('máy chủ chưa gửi tên thì mới rơi về mã, không bịa tên', () => {
    render(
      <NodeOutputList
        checklistItem={{ id: 'CR-9', name: 'X', output_documents: [{ template_id: 'TPL-LA' }] }}
        nodeStatus="in_progress"
      />,
    )
    expect(screen.getByText('TPL-LA')).toBeInTheDocument()
  })
})

describe('Tờ bị từ chối và nộp lại — lý do không cũ', () => {
  it('tờ mới nộp lại sau khi bị trả hiện "Chờ duyệt", không hiện lý do cũ', () => {
    mount({
      checklistItem: {
        ...ITEM,
        review_by_template: {
          'T-BANVE': { document_id: 'd2-new', review_status: 'pending_review' },
        },
      },
    })
    const row = rowOf('Bản vẽ hiện trạng')
    expect(row).toHaveClass('is-pending')
    expect(within(row).queryByText('Nguyên nhân từ chối')).not.toBeInTheDocument()
  })
})

describe('Tải lên đúng tờ — danh tính bền theo template_id', () => {
  it('bấm nút tải lên của tờ B rồi chọn tệp gọi callback ĐÚNG template_id/document_id của tờ đó', async () => {
    const onUploadDocument = vi.fn().mockResolvedValue(undefined)
    mount({ nodeStatus: 'in_progress', onUploadDocument })

    // Bấm đúng nút tải lên của tờ B (Bản vẽ hiện trạng) TRƯỚC khi chọn tệp.
    fireEvent.click(screen.getByRole('button', { name: /Tải lên Bản vẽ hiện trạng/i }))

    const file = new File(['replacement'], 'ban-ve-sua.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Tải lên Bản vẽ hiện trạng'), {
      target: { files: [file] },
    })

    expect(onUploadDocument).toHaveBeenCalledTimes(1)
    expect(onUploadDocument).toHaveBeenCalledWith({
      checklistResultId: 'CR-1',
      templateId: 'T-BANVE',
      documentId: 'd2',
      file,
    })
    // Không được đụng tới tờ khác (A/CCCD hay Sơ đồ).
    expect(onUploadDocument.mock.calls[0][0].templateId).not.toBe('T-CCCD')
    expect(onUploadDocument.mock.calls[0][0].templateId).not.toBe('T-SODO')
  })

  it('tờ CHƯA NỘP gửi documentId là null, không mượn id của tờ khác', () => {
    const onUploadDocument = vi.fn().mockResolvedValue(undefined)
    mount({
      nodeStatus: 'in_progress',
      onUploadDocument,
      checklistItem: {
        ...ITEM,
        review_by_template: {
          'T-CCCD': { document_id: 'd1', review_status: 'approved' },
        },
      },
    })

    const file = new File(['x'], 'so-do.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Tải lên Sơ đồ hiện trạng vị trí'), {
      target: { files: [file] },
    })

    expect(onUploadDocument).toHaveBeenCalledWith({
      checklistResultId: 'CR-1',
      templateId: 'T-SODO',
      documentId: null,
      file,
    })
  })

  it('tờ ĐÃ DUYỆT không có ô/nút tải lên nào', () => {
    const onUploadDocument = vi.fn()
    mount({ nodeStatus: 'submitted', onUploadDocument })

    expect(
      screen.queryByRole('button', { name: /Tải lên CCCD chủ đất/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tải lên CCCD chủ đất')).not.toBeInTheDocument()
  })

  it('chọn LẠI cùng một tệp vẫn kích hoạt tải lên lần nữa (input được xoá giá trị)', () => {
    const onUploadDocument = vi.fn().mockResolvedValue(undefined)
    mount({ nodeStatus: 'in_progress', onUploadDocument })

    const input = screen.getByLabelText('Tải lên Bản vẽ hiện trạng')
    const file = new File(['same'], 'same.pdf', { type: 'application/pdf' })

    fireEvent.change(input, { target: { files: [file] } })
    // Xoá value sau mỗi lượt để chọn lại đúng tệp đó vẫn bắn 'change'.
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { files: [file] } })

    expect(onUploadDocument).toHaveBeenCalledTimes(2)
    expect(onUploadDocument.mock.calls.every(([p]) => p.templateId === 'T-BANVE')).toBe(true)
  })

  it('không truyền onUploadDocument thì không bày nút tải lên nào', () => {
    mount({ nodeStatus: 'in_progress' })
    expect(screen.queryByRole('button', { name: /Tải lên/i })).not.toBeInTheDocument()
  })
})

describe('Danh tính hàng bền — không rơi về chỉ số mảng khi đổi thứ tự', () => {
  it('id DOM và danh tính React bám theo document_id/template_id, không đổi khi đảo thứ tự danh sách', () => {
    const { rerender } = mount()

    const cccdTruoc = rowOf('CCCD chủ đất')
    const banVeTruoc = rowOf('Bản vẽ hiện trạng')
    const soDoTruoc = rowOf('Sơ đồ hiện trạng vị trí')

    // document_id ưu tiên cho DOM id khi có — KHÔNG phải vị trí (0/1/2).
    expect(cccdTruoc.id).toBe('checklist-doc-d1')
    expect(banVeTruoc.id).toBe('checklist-doc-d2')
    expect(soDoTruoc.id).toBe('checklist-doc-d3')

    // Đảo ngược thứ tự output_documents. Nếu key/id rơi về chỉ số mảng thì
    // tờ CCCD (đang ở vị trí 0) sẽ nhảy sang id vị trí 2 — điều không được phép.
    rerender(
      <NodeOutputList
        checklistItem={{
          ...ITEM,
          output_documents: [
            { template_id: 'T-SODO' },
            { template_id: 'T-BANVE' },
            { template_id: 'T-CCCD' },
          ],
        }}
        nodeStatus="submitted"
        docTemplateById={TEMPLATES}
      />,
    )

    const cccdSau = rowOf('CCCD chủ đất')
    const banVeSau = rowOf('Bản vẽ hiện trạng')
    const soDoSau = rowOf('Sơ đồ hiện trạng vị trí')

    // id vẫn dán theo tờ, bất kể vị trí mới.
    expect(cccdSau.id).toBe('checklist-doc-d1')
    expect(banVeSau.id).toBe('checklist-doc-d2')
    expect(soDoSau.id).toBe('checklist-doc-d3')

    // React tái dùng ĐÚNG nút DOM cũ (khoá theo template_id, không theo chỉ số):
    // với key theo chỉ số, node ở vị trí 0 bị tái dùng cho tờ khác nên tham chiếu đổi.
    expect(cccdSau).toBe(cccdTruoc)
    expect(banVeSau).toBe(banVeTruoc)
    expect(soDoSau).toBe(soDoTruoc)
  })
})
