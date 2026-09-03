import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import EmployeeItemWorkspace from './EmployeeItemWorkspace'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn(), getAccessToken: () => null }))
vi.mock('../document-register/DocumentRegister', () => ({
  default: () => <div data-testid="so-giay-to" />,
}))
vi.mock('../legal-dossier/LegalDossierNodePanel', () => ({ default: () => null }))
vi.mock('../legal-dossier/SubmissionReceiptPanel', () => ({ default: () => null }))
vi.mock('../handover/HandoverPanel', () => ({ default: () => null }))
vi.mock('./EmployeeWorkspaceCalendar', () => ({
  ChecklistEvidenceItem: () => <div data-testid="minh-chung" />,
  NodeActionBar: ({ task }) => <button type="button">Hành động {task.status}</button>,
}))

const { apiFetch } = await import('../../lib/api')

const ITEM = {
  contract_id: '001/BK-2026',
  customer_name: 'Lê Quang Huy',
  location_label: '123/11 Quang Trung, Bồ Đề',
  service_line_name: 'Tách thửa – phần đo vẽ',
  service_line_id: 'SL-1',
  priority: 'HIGH',
  current_task_node_id: 'n2',
  nodes: [
    { id: 'n1', node_code: 'K01', name: 'Tiếp nhận', status: 'accepted', mine: true, amount: 300000 },
    { id: 'n2', node_code: 'K02', name: 'Khảo sát', status: 'in_progress', mine: true,
      amount: 500000, bonus_amount: 250000, amount_is_settled: false },
    { id: 'n3', node_code: 'K03', name: 'Chuẩn hoá', status: 'pending', mine: false, amount: 400000 },
  ],
}

const TASK = {
  id: 'n2',
  node_code: 'K02',
  node_key: 'k02',
  name: 'Khảo sát & đo hiện trường',
  description: 'Đo đạc thực địa, lấy toạ độ GPS 4 mốc ranh.',
  status: 'in_progress',
  deadline_at: '2099-01-01T00:00:00Z',
  checklist: [{
    id: 'c1',
    name: 'Bộ hồ sơ kỹ thuật',
    output_documents: [{ template_id: 'T-BANVE' }],
    review_by_template: {
      'T-BANVE': { document_id: 'd1', review_status: 'rejected', rejection_reason: 'Ảnh mờ không đọc được' },
    },
  }],
}

const mount = (props = {}, gate = { blockers: [] }) => {
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(gate)
  return render(
    <EmployeeItemWorkspace item={ITEM} tasks={[TASK]} onBack={vi.fn()} onRefresh={vi.fn()} {...props} />,
  )
}

afterEach(cleanup)

describe('Tầng 1 — hợp đồng và chuỗi bước', () => {
  it('đầu trang nói đủ hợp đồng, khách, địa chỉ, tên gói và mức ưu tiên', () => {
    mount()
    expect(screen.getByText(/HĐ 001\/BK-2026 · KH: Lê Quang Huy · 123\/11 Quang Trung/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tách thửa – phần đo vẽ' })).toBeInTheDocument()
    expect(screen.getByText('Ưu tiên')).toBeInTheDocument()
  })

  it('dải bước hiện đủ chuỗi, đánh dấu bước đang mở', () => {
    mount()
    const chain = screen.getByRole('list', { name: /Các bước của hạng mục/ })

    expect(within(chain).getAllByRole('listitem')).toHaveLength(3)
    expect(within(chain).getByRole('button', { current: 'step' })).toHaveTextContent('K02')
  })

  it('bước của người khác hiện đầy đủ nhưng KHÔNG bấm được', () => {
    mount()
    const chain = screen.getByRole('list', { name: /Các bước của hạng mục/ })
    expect(within(chain).getByRole('button', { name: /K03/ })).toBeDisabled()
  })
})

describe('Tầng 2 — tên bước và đồng hồ', () => {
  it('hiện mã bước kèm tên và ô đếm ngược', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'K02: Khảo sát & đo hiện trường' })).toBeInTheDocument()
    expect(screen.getByText('Thời gian còn lại')).toBeInTheDocument()
  })

  it('đang tạm dừng thì đồng hồ báo đã dừng, và trạng thái nói đang chờ ai', () => {
    mount({
      tasks: [{
        ...TASK,
        pause_reason_type: 'AGENCY',
        paused_at: '2026-09-01T00:00:00Z',
        paused_note: 'Chờ thông báo thuế từ chi cục',
      }],
    })

    expect(screen.getByText('đồng hồ đã dừng')).toBeInTheDocument()
    expect(screen.getAllByText(/Chờ cơ quan/).length).toBeGreaterThan(0)
  })
})

describe('Tầng 3 — hai cột', () => {
  it('cột trái có mô tả, tủ hồ sơ và bảng tiền ba dòng', () => {
    mount()
    expect(screen.getByText(/Đo đạc thực địa/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tủ hồ sơ/ })).toBeInTheDocument()
    expect(screen.getByText('Khoán nhiệm vụ')).toBeInTheDocument()
    expect(screen.getByText('Tổng')).toBeInTheDocument()
  })

  it('chưa nghiệm thu thì thưởng ghi rõ DỰ KIẾN, và tổng cộng đúng hai khoản', () => {
    mount()
    // Bày số trần lúc bước còn chạy là hứa một khoản chưa chắc có.
    expect(screen.getByText('Thưởng dự kiến')).toBeInTheDocument()
    expect(screen.getByText('750.000đ')).toBeInTheDocument()
  })

  it('nghiệm thu xong thì bỏ chữ dự kiến — số đã chốt', () => {
    mount({
      item: {
        ...ITEM,
        nodes: ITEM.nodes.map(node =>
          node.id === 'n2' ? { ...node, amount_is_settled: true } : node),
      },
    })
    expect(screen.getByText('Thưởng')).toBeInTheDocument()
    expect(screen.queryByText('Thưởng dự kiến')).not.toBeInTheDocument()
  })

  it('cột phải hiện lý do từ chối của tờ bị trả', () => {
    mount()
    expect(screen.getByText('Nguyên nhân từ chối')).toBeInTheDocument()
    expect(screen.getByText('Ảnh mờ không đọc được')).toBeInTheDocument()
  })

  it('chỉ K01 mở kho giấy tờ khách gửi', () => {
    mount()
    expect(screen.queryByRole('button', { name: /Kho giấy tờ khách gửi/ })).not.toBeInTheDocument()

    cleanup()
    mount({ tasks: [{ ...TASK, node_code: 'K01' }] })
    expect(screen.getByRole('button', { name: /Kho giấy tờ khách gửi/ })).toBeInTheDocument()
  })
})

describe('Tầng 4 — chân trang', () => {
  it('có nút nhờ hỗ trợ cạnh nút hành động chính', () => {
    const onRequestHelp = vi.fn()
    mount({ onRequestHelp })

    fireEvent.click(screen.getByRole('button', { name: 'Nhờ hỗ trợ' }))
    expect(onRequestHelp).toHaveBeenCalledWith(expect.objectContaining({ id: 'n2' }))
  })

  it('đã nhờ rồi thì đổi thành RÚT LỜI NHỜ, không mời nhờ lần hai', () => {
    mount({
      item: {
        ...ITEM,
        nodes: ITEM.nodes.map(node =>
          node.id === 'n2' ? { ...node, my_help_request_id: 'H-1' } : node),
      },
    })
    expect(screen.getByRole('button', { name: 'Rút lời nhờ' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nhờ hỗ trợ' })).not.toBeInTheDocument()
  })

  it('màn Giám đốc không có nút nhờ hỗ trợ', () => {
    mount({ isDirector: true })
    expect(screen.queryByRole('button', { name: /Nhờ hỗ trợ/ })).not.toBeInTheDocument()
  })
})

describe('Thông báo của bước', () => {
  it('nói RÕ vì sao chưa nộp được, ngay trên nút', async () => {
    mount({}, {
      blockers: [
        { kind: 'rejected_documents', message: 'Còn 1 tờ bị Giám đốc trả lại chưa sửa.' },
      ],
    })

    // Nút xám không nói lý do là bắt nhân viên đoán rồi gọi điện hỏi.
    await waitFor(() =>
      expect(screen.getByText('Còn 1 tờ bị Giám đốc trả lại chưa sửa.')).toBeInTheDocument())
  })

  it('không có gì chặn thì không bày dải cảnh báo rỗng', async () => {
    mount()
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('Bước của người khác', () => {
  it('mở ra thì báo chờ, không bày khung làm việc', () => {
    mount({ item: { ...ITEM, current_task_node_id: 'n3' }, tasks: [] })

    expect(screen.getByRole('heading', { name: /K03 · Chuẩn hoá/ })).toBeInTheDocument()
    expect(screen.queryByText('Khoán nhiệm vụ')).not.toBeInTheDocument()
  })
})
