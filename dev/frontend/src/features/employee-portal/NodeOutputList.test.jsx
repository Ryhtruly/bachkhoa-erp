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
  // Máy chủ gửi kèm tên loại giấy. Thiếu nó là màn nhân viên bày nguyên UUID —
  // đúng lỗi đã thấy trên trình duyệt với dữ liệu thật.
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
    // Lý do phải nằm cùng dòng giấy. Gom vào một hộp chung ở cuối là năm tờ bị
    // trả với năm lý do, người ta phải tự ghép lý do nào của tờ nào.
    expect(within(row).getByText('Thiếu tọa độ mốc ranh số 4')).toBeInTheDocument()
  })

  it('tờ CHƯA AI CHẤM có hình thức riêng, không trông giống tờ đã duyệt', () => {
    mount()
    const cho = rowOf('Sơ đồ hiện trạng vị trí')

    // Bản vẽ tay chỉ có xanh và hồng. Để tờ chờ duyệt trắng trơn thì nhân viên
    // tưởng đã qua.
    expect(cho).toHaveClass('is-pending')
    expect(cho).not.toHaveClass('is-approved')
  })

  it('loại giấy chưa ai nộp tệp thì không mở được', () => {
    mount({
      checklistItem: { ...ITEM, review_by_template: {} },
    })
    const row = rowOf('CCCD chủ đất')
    expect(within(row).getByRole('button', { name: /Mở CCCD chủ đất/ })).toBeDisabled()
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
