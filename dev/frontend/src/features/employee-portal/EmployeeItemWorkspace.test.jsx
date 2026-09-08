import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import EmployeeItemWorkspace from './EmployeeItemWorkspace'
import { ToastProvider } from '../../contexts/ToastContext'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: () => null,
  peekApiCache: vi.fn(() => null),
}))
vi.mock('../document-register/DocumentRegister', () => ({
  default: () => <div data-testid="so-giay-to" />,
}))
vi.mock('./CustomerSourceDocuments', () => ({
  default: () => <div data-testid="kho-giay-khach" />,
}))
vi.mock('../legal-dossier/LegalDossierNodePanel', () => ({ default: () => null }))
vi.mock('../legal-dossier/SubmissionReceiptPanel', () => ({ default: () => null }))
vi.mock('../handover/HandoverPanel', () => ({ default: () => null }))
vi.mock('./EmployeeWorkspaceCalendar', () => ({
  ChecklistEvidenceItem: () => <div data-testid="minh-chung" />,
  NodeActionBar: ({ task, gate, handoverState }) => (
    <button
      type="button"
      disabled={(task.is_handover || task.node_code === 'K06') && !handoverState?.debt?.gate_open}
      data-gate-blockers={(gate?.blockers || []).map(b => b.kind).join(',')}
      data-gate-messages={(gate?.blockers || []).map(b => b.message).join('|')}
    >
      {(task.is_handover || task.node_code === 'K06') ? 'Nộp nghiệm thu' : `Hành động ${task.status}`}
    </button>
  ),
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
    expect(screen.getByRole('region', { name: 'Node hiện tại' })).toHaveTextContent('K02 · Khảo sát & đo hiện trường')
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
    expect(screen.getByRole('region', { name: 'Tủ hồ sơ đính kèm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mở tủ hồ sơ theo bước/ })).toBeInTheDocument()
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

  it('vùng checklist có tiêu đề và số mục giống cấu trúc chi tiết node của sếp', () => {
    mount()
    expect(screen.getByRole('heading', { name: /Danh sách checklist/ })).toHaveTextContent('1 mục')
  })

  it('mọi node đều có kho giấy thô để gán vào checklist hiện tại', () => {
    mount()
    expect(screen.getByRole('button', { name: /Kho giấy tờ khách gửi/ })).toBeInTheDocument()
  })

  it('cột phải giữ kho giấy và checklist trước footer; footer đặt hỗ trợ trái, nghiệm thu phải', () => {
    mount()
    const right = document.querySelector('.eiw-col--right')
    const raw = within(right).getByRole('button', { name: /Kho giấy tờ khách gửi/ })
    const checklist = within(right).getByRole('heading', { name: 'Bộ hồ sơ kỹ thuật' })
    const submit = within(right).getByRole('button', { name: /Hành động/ })
    const help = within(right).getByRole('button', { name: 'Nhờ hỗ trợ' })
    const footer = within(right).getByRole('contentinfo')

    expect(raw.compareDocumentPosition(checklist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(checklist.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(help.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(help).toHaveClass('eiw-btn--help')
  })
})

describe('Footer K06 và cổng công nợ', () => {
  it('đặt Hỗ trợ + Xin duyệt nợ bên trái, chỉ khóa Nộp nghiệm thu bên phải', async () => {
    const k06Item = {
      ...ITEM,
      current_task_node_id: 'n6',
      contract_total_value: 10_000_000,
      contract_paid_amount: 0,
      nodes: [{ id: 'n6', node_code: 'K06', name: 'Nhận kết quả & bàn giao', status: 'in_progress', mine: true }],
    }
    const k06Task = {
      ...TASK,
      id: 'n6',
      node_code: 'K06',
      is_handover: true,
      checklist: [],
    }
    apiFetch.mockReset()
    apiFetch.mockImplementation(url => {
      if (String(url) === '/api/handover/n6') {
        return Promise.resolve({ data: {
          debt: { remaining: 10_000_000, gate_open: false },
          debt_request: null,
          can_request_debt: true,
          can_submit_acceptance: false,
        } })
      }
      return Promise.resolve({ blockers: [] })
    })

    render(
      <ToastProvider>
        <EmployeeItemWorkspace
          item={k06Item}
          tasks={[k06Task]}
          onBack={vi.fn()}
          onRefresh={vi.fn()}
          onRequestHelp={vi.fn()}
        />
      </ToastProvider>,
    )

    const footer = await screen.findByTestId('node-action-footer')
    const support = within(footer).getByTestId('node-support-actions')
    const primary = within(footer).getByTestId('node-primary-action')
    expect(within(support).getByRole('button', { name: 'Nhờ hỗ trợ' })).toBeEnabled()
    expect(await within(support).findByRole('button', { name: 'Xin duyệt nợ' })).toBeEnabled()
    expect(within(primary).getByRole('button', { name: 'Nộp nghiệm thu' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Kho giấy tờ khách gửi/ })).toBeEnabled()
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

  // Task 3: gate /shortage đã nạp sẵn được CHUYỂN xuống NodeActionBar để nút
  // biết cổng cứng ngay từ đầu, không phải đợi bấm rồi mới hỏi lại.
  it('chuyển payload /shortage đã nạp xuống NodeActionBar qua prop gate', async () => {
    mount({}, {
      blockers: [
        { kind: 'rejected_documents', message: 'Còn 1 tờ bị Giám đốc trả lại chưa sửa.' },
      ],
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Hành động/ }))
        .toHaveAttribute('data-gate-blockers', 'rejected_documents')
    })
  })

  it('không render cảnh báo rời thiếu giấy nhưng vẫn giữ blocker trong gate của nút nộp', async () => {
    mount({}, {
      blockers: [
        { kind: 'missing_documents', message: 'Còn thiếu giấy tờ đầu ra ở 2 mục checklist.' },
      ],
      can_submit: false,
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(screen.queryByText('Còn thiếu giấy tờ đầu ra ở 2 mục checklist.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hành động/ }))
      .toHaveAttribute('data-gate-blockers', 'missing_documents')
  })

  it('không lặp cảnh báo thiếu file phía trên và thay số cũ bằng số đếm từ checklist đang hiển thị', async () => {
    const runtimeTask = {
      ...TASK,
      checklist: [{
        id: 'CR-RUNTIME',
        name: 'Checklist runtime',
        status: 'pending',
        document_types: [
          { id: 'TYPE-1', name: 'Giấy 1', status: 'draft', file_count: 1,
            files: [{ document_id: 'D-1', file_name: 'giay-1.pdf' }] },
          { id: 'TYPE-2', name: 'Giấy 2', status: 'draft', file_count: 1,
            files: [{ document_id: 'D-2', file_name: 'giay-2.pdf' }] },
          { id: 'TYPE-3', name: 'Giấy 3', status: 'draft', file_count: 0, files: [] },
        ],
      }],
    }
    mount({ tasks: [runtimeTask] }, {
      blockers: [{
        kind: 'missing_document_type_files',
        message: 'Còn 3 loại giấy chưa có file để nộp lại.',
      }],
      can_submit: false,
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(screen.queryByText(/Còn 3 loại giấy/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Còn 1 loại giấy chưa được gán file/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hành động/ }))
      .toHaveAttribute('data-gate-messages', 'Còn 1 loại giấy chưa được gán file.')
  })

  it('gỡ blocker runtime cũ ngay khi checklist mới đã có file và không còn loại bị từ chối', async () => {
    const runtimeTask = {
      ...TASK,
      status: 'rework_required',
      checklist: [{
        id: 'CR-RUNTIME', name: 'Checklist runtime', status: 'pending',
        document_types: [
          { id: 'TYPE-1', name: 'Giấy 1', status: 'draft', file_count: 1,
            files: [{ document_id: 'D-NEW', file_name: 'giay-moi.pdf' }] },
        ],
      }],
    }
    mount({ tasks: [runtimeTask] }, {
      blockers: [
        { kind: 'rejected_documents', message: 'Còn 1 loại giấy bị trả lại.' },
        { kind: 'missing_document_type_files', message: 'Còn 1 loại giấy chưa có file.' },
      ],
      can_submit: false,
      review_summary: { rejected_count: 0, runtime_type_rejected_count: 1 },
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /Hành động/ }))
      .toHaveAttribute('data-gate-blockers', '')
    expect(screen.queryByText(/bị trả lại/)).not.toBeInTheDocument()
  })
})

describe('Mật độ và thứ tự mở checklist', () => {
  const RUNTIME_TASK = {
    ...TASK,
    checklist: [
      {
        id: 'CR-FIRST',
        name: 'Checklist đầu tiên',
        document_types: [{
          id: 'TYPE-FIRST', name: 'Giấy ở checklist đầu', source: 'CONG_TY',
          status: 'draft', file_count: 0, files: [],
        }],
      },
      {
        id: 'CR-SECOND',
        name: 'Checklist thứ hai',
        document_types: [{
          id: 'TYPE-SECOND', name: 'Giấy ở checklist sau', source: 'CO_QUAN',
          status: 'draft', file_count: 0, files: [],
        }],
      },
    ],
  }

  it('checklist đầu mở mặc định, các checklist sau đóng và footer vẫn ở trong cột phải', () => {
    mount({ tasks: [RUNTIME_TASK] })

    expect(screen.getByText('Giấy ở checklist đầu')).toBeInTheDocument()
    expect(screen.queryByText('Giấy ở checklist sau')).not.toBeInTheDocument()
    const right = document.querySelector('.eiw-col--right')
    expect(within(right).getByRole('contentinfo')).toHaveClass('eiw-foot')
  })

  it('workspace dùng class fixed-viewport riêng để CSS trả về natural flow trên mobile', () => {
    mount({ tasks: [RUNTIME_TASK] })
    expect(document.querySelector('main.eiw-workspace')).toBeInTheDocument()
  })
})

describe('Upload nhiều file cho loại giấy runtime', () => {
  it('gửi nhiều trường files trong một request và không tải lại toàn workspace', async () => {
    const runtimeTask = {
      ...TASK,
      checklist: [{
        id: 'CR-RUNTIME',
        name: 'Checklist runtime',
        document_types: [{
          id: 'TYPE-RUNTIME', name: 'Ảnh mốc ranh', source: 'CONG_TY',
          status: 'rejected', rejection_reason: 'Ảnh mờ', file_count: 1,
          files: [{ document_id: 'D-OLD', file_name: 'anh-cu.jpg' }],
        }],
      }],
    }
    apiFetch.mockReset()
    apiFetch.mockImplementation((url, options) => {
      if (String(url).includes('/document-types/TYPE-RUNTIME/files') && options?.method === 'POST') {
        return Promise.resolve({ status: 'success', data: files.map((file, index) => ({
          document_id: `D-NEW-${index}`,
          file_name: file.name,
          status: 'success',
          review_status: 'draft',
          file_count: 3,
        })) })
      }
      return Promise.resolve({ blockers: [] })
    })
    const onRefresh = vi.fn()
    render(
      <ToastProvider>
        <EmployeeItemWorkspace
          item={ITEM}
          tasks={[runtimeTask]}
          onBack={vi.fn()}
          onRefresh={onRefresh}
        />
      </ToastProvider>,
    )

    const files = [
      new File(['1'], 'moc-1.jpg', { type: 'image/jpeg' }),
      new File(['2'], 'moc-2.jpg', { type: 'image/jpeg' }),
    ]
    fireEvent.change(screen.getByLabelText('Tải file cho Ảnh mốc ranh'), {
      target: { files },
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      '/api/employee-portal/tasks/n2/checklist/CR-RUNTIME/document-types/TYPE-RUNTIME/files',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    ))
    const upload = apiFetch.mock.calls.find(([url]) => String(url).includes('/document-types/TYPE-RUNTIME/files'))
    expect(upload[1].body.getAll('files')).toEqual(files)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('gửi change_reason khi bổ sung file vào loại giấy đã có file đạt', async () => {
    const runtimeTask = {
      ...TASK,
      checklist: [{
        id: 'CR-RUNTIME',
        name: 'Checklist runtime',
        document_types: [{
          id: 'TYPE-RUNTIME', name: 'Biên bản đã duyệt', source: 'CONG_TY',
          status: 'approved', file_count: 1,
          files: [{ document_id: 'D-OLD', file_name: 'bien-ban-cu.pdf', status: 'approved' }],
        }],
      }],
    }
    apiFetch.mockReset()
    apiFetch.mockImplementation((url, options) => {
      if (String(url).includes('/document-types/TYPE-RUNTIME/files') && options?.method === 'POST') {
        return Promise.resolve({ status: 'success', data: [] })
      }
      return Promise.resolve({ blockers: [] })
    })
    render(
      <ToastProvider>
        <EmployeeItemWorkspace
          item={ITEM}
          tasks={[runtimeTask]}
          onBack={vi.fn()}
          onRefresh={vi.fn()}
        />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm file cho Biên bản đã duyệt' }))
    const dialog = screen.getByRole('dialog', { name: 'Lý do thay đổi Biên bản đã duyệt' })
    fireEvent.change(within(dialog).getByLabelText('Lý do thay đổi'), {
      target: { value: 'Bổ sung bản có ký tên' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tiếp tục chọn file' }))
    const file = new File(['signed'], 'bien-ban-moi.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Tải file cho Biên bản đã duyệt'), {
      target: { files: [file] },
    })

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      '/api/employee-portal/tasks/n2/checklist/CR-RUNTIME/document-types/TYPE-RUNTIME/files',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    ))
    const upload = apiFetch.mock.calls.find(([url]) => String(url).includes('/document-types/TYPE-RUNTIME/files'))
    expect(upload[1].body.get('change_reason')).toBe('Bổ sung bản có ký tên')
  })
})

describe('Bước của người khác', () => {
  it('mở ra thì báo chờ, không bày khung làm việc', () => {
    mount({ item: { ...ITEM, current_task_node_id: 'n3' }, tasks: [] })

    expect(screen.getByRole('heading', { name: /K03 · Chuẩn hoá/ })).toBeInTheDocument()
    expect(screen.queryByText('Khoán nhiệm vụ')).not.toBeInTheDocument()
  })
})

describe('Trạng thái loading — locked state', () => {
  it('task === null renders locked skeleton (no distinct loading prop needed)', () => {
    mount({ tasks: [] })

    expect(screen.getByRole('heading', { name: /K02/ })).toBeInTheDocument()
    expect(screen.getByText(/Chưa tới lượt|chưa giao/)).toBeInTheDocument()
    expect(screen.queryByText('Khoán nhiệm vụ')).not.toBeInTheDocument()
  })

  it('shows assignee name when node has one', () => {
    mount({
      tasks: [],
      item: {
        ...ITEM,
        nodes: ITEM.nodes.map(n =>
          n.id === 'n2' ? { ...n, assignee_name: 'Trần Văn B' } : n),
      },
    })

    expect(screen.getByText(/Trần Văn B/)).toBeInTheDocument()
  })

  it('data-dependent sections do not render when task is absent', () => {
    mount({ tasks: [] })

    expect(screen.queryByText('Thời gian còn lại')).not.toBeInTheDocument()
    expect(screen.queryByText(/Đo đạc thực địa/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tủ hồ sơ/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Nhờ hỗ trợ')).not.toBeInTheDocument()
  })
})

describe('Mở tệp qua callback thật của cha (openDocument)', () => {
  const fileBlob = new Blob(['png-bytes'], { type: 'image/png' })

  afterEach(() => { vi.restoreAllMocks() })

  it('bấm mở trên NodeOutputList fetch tệp đúng bước/tờ và mở FilePreviewModal', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(fileBlob),
    })

    mount()
    fireEvent.click(screen.getByRole('button', { name: /Mở T-BANVE/ }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/employee-portal/tasks/n2/documents/d1/file',
        expect.anything(),
      )
    })
    await waitFor(() => {
      expect(screen.getByText(/Xem tài liệu T-BANVE/)).toBeInTheDocument()
    })
  })

  it('lỗi 403 từ openDocument hiện rõ trên màn, không im lặng', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ detail: 'Không đủ quyền' }),
    })

    mount()
    fireEvent.click(screen.getByRole('button', { name: /Mở T-BANVE/ }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/không có quyền/i)
    })
  })

  it('401 từ openDocument phát tín hiệu hết phiên trước khi hiện lỗi', async () => {
    const unauthorized = vi.fn()
    window.addEventListener('bachkhoa:unauthorized', unauthorized)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ detail: 'Token hết hạn' }),
    })

    mount()
    fireEvent.click(screen.getByRole('button', { name: /Mở T-BANVE/ }))

    await waitFor(() => expect(unauthorized).toHaveBeenCalledTimes(1))
    window.removeEventListener('bachkhoa:unauthorized', unauthorized)
  })

  it('đóng FilePreviewModal thu hồi blob URL và xoá ref', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:employee-preview')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(fileBlob),
    })

    mount()
    fireEvent.click(screen.getByRole('button', { name: /Mở T-BANVE/ }))
    await screen.findByText(/Xem tài liệu T-BANVE/)

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(revoke).toHaveBeenCalledWith('blob:employee-preview')
  })

  it('mở file đã duyệt trong Tủ hồ sơ qua callback thật cũng mở FilePreviewModal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(fileBlob),
    })
    // Tủ hồ sơ chuẩn trả về Node → loại giấy → file đã duyệt.
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({
      checklist_cabinet_by_node: [{
        node_code: 'K01',
        node_name: 'Tiếp nhận',
        task_node_id: 'n1',
        total: 1,
        done: 1,
        documents: [{
          id: 'type1',
          name: 'Hợp đồng lưu trữ',
          file_count: 1,
          files: [{ id: 'prior1', document_id: 'prior1', file_name: 'hop-dong-luu-tru.pdf' }],
        }],
      }],
    })

    render(
      <EmployeeItemWorkspace item={ITEM} tasks={[TASK]} onBack={vi.fn()} onRefresh={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Mở tủ hồ sơ theo bước/ }))

    fireEvent.click(await screen.findByRole('button', { name: /K01.*1\/1/ }))
    const typeButton = await screen.findByRole('button', { name: /Hợp đồng lưu trữ.*1 file/ })
    fireEvent.click(typeButton)
    fireEvent.click(screen.getByRole('button', { name: 'hop-dong-luu-tru.pdf' }))

    await waitFor(() => {
      expect(screen.getByText(/Xem tài liệu hop-dong-luu-tru.pdf/)).toBeInTheDocument()
    })
  })
})

describe('Tải lên tài liệu đầu ra qua API thật (multipart)', () => {
  const UPLOAD_TASK = {
    ...TASK,
    checklist: [{
      id: 'c1',
      name: 'Bộ hồ sơ kỹ thuật',
      template_names: { 'T-CCCD': 'CCCD chủ đất', 'T-BANVE': 'Bản vẽ hiện trạng' },
      output_documents: [{ template_id: 'T-CCCD' }, { template_id: 'T-BANVE' }],
      review_by_template: {
        'T-CCCD': { document_id: 'd1', review_status: 'approved' },
        'T-BANVE': { document_id: 'd2', review_status: 'rejected', rejection_reason: 'Ảnh mờ' },
      },
    }],
  }

  const mountUpload = (gate = { blockers: [] }) => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue(gate)
    const onRefresh = vi.fn()
    render(
      <ToastProvider>
        <EmployeeItemWorkspace item={ITEM} tasks={[UPLOAD_TASK]} onBack={vi.fn()} onRefresh={onRefresh} />
      </ToastProvider>,
    )
    return { onRefresh }
  }

  const selectChildBFile = () => {
    fireEvent.click(screen.getByRole('button', { name: /Tải lên Bản vẽ hiện trạng/i }))
    const file = new File(['replacement'], 'ban-ve-sua.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Tải lên Bản vẽ hiện trạng'), {
      target: { files: [file] },
    })
    return file
  }

  it('POST FormData đúng URL với template_id và File của tờ B', async () => {
    mountUpload()
    const file = selectChildBFile()

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/employee-portal/tasks/n2/checklist/c1/output-documents',
        expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
      )
    })

    const call = apiFetch.mock.calls.find(([url]) => String(url).includes('/output-documents'))
    const body = call[1].body
    expect(body.get('template_id')).toBe('T-BANVE')
    expect(body.get('file')).toBe(file)
  })

  it('không có request nào nhắm tới tờ A khi tải lên tờ B', async () => {
    mountUpload()
    selectChildBFile()

    await waitFor(() => {
      expect(
        apiFetch.mock.calls.some(([url]) => String(url).includes('/output-documents')),
      ).toBe(true)
    })
    // FormData chỉ mang template_id của B; không có lượt POST nào cho A.
    const posts = apiFetch.mock.calls.filter(([url]) => String(url).includes('/output-documents'))
    expect(posts).toHaveLength(1)
    expect(posts[0][1].body.get('template_id')).toBe('T-BANVE')
  })

  it('thành công thì gọi onRefresh SAU khi API trả về', async () => {
    const { onRefresh } = mountUpload()
    selectChildBFile()

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })
  })

  it('API lỗi thì KHÔNG gọi onRefresh và hiện lỗi API', async () => {
    apiFetch.mockReset()
    // Lượt shortage GET ban đầu ổn; lượt POST output-documents hỏng.
    apiFetch.mockImplementation((url, opts) => {
      if (String(url).includes('/output-documents') && opts?.method === 'POST') {
        return Promise.reject(new Error('Tệp vượt quá dung lượng cho phép'))
      }
      return Promise.resolve({ blockers: [] })
    })
    const onRefresh = vi.fn()
    render(
      <ToastProvider>
        <EmployeeItemWorkspace item={ITEM} tasks={[UPLOAD_TASK]} onBack={vi.fn()} onRefresh={onRefresh} />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Tải lên Bản vẽ hiện trạng/i }))
    fireEvent.change(screen.getByLabelText('Tải lên Bản vẽ hiện trạng'), {
      target: { files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] },
    })

    await waitFor(() => {
      expect(screen.getByText('Tệp vượt quá dung lượng cho phép')).toBeInTheDocument()
    })
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('tờ đã duyệt (CCCD) không có nút/ô tải lên ở màn cha', () => {
    mountUpload()
    expect(screen.queryByRole('button', { name: /Tải lên CCCD chủ đất/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tải lên CCCD chủ đất')).not.toBeInTheDocument()
  })

  const demShortage = () =>
    apiFetch.mock.calls.filter(([url]) => String(url).includes('/shortage')).length

  // ── ĐANG ĐỎ CÓ CHỦ ĐÍCH ─────────────────────────────────────────────────
  // Nộp tệp sửa xong thì cổng /shortage PHẢI được đọc lại: tờ vừa thay có thể
  // vừa gỡ đúng blocker 'rejected_documents' đang treo cạnh nút. Hôm nay handler
  // chỉ gọi onRefresh (làm mới ở CHA), còn effect đọc /shortage chỉ chạy lại khi
  // task.id/status/pause đổi — mà nộp tệp không đổi mấy thứ đó. Kết quả: cảnh báo
  // cũ đứng hình, nút vẫn xám dù đã sửa. Test này đỏ tới khi component tự đọc lại.
  it('nộp THÀNH CÔNG thì đọc lại cổng /shortage', async () => {
    const { onRefresh } = mountUpload()

    await waitFor(() => expect(demShortage()).toBeGreaterThanOrEqual(1))
    const truoc = demShortage()

    selectChildBFile()
    // Đợi lượt nộp đi qua đúng đường THÀNH CÔNG (onRefresh chỉ gọi sau khi API về).
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))

    await waitFor(() => expect(demShortage()).toBeGreaterThan(truoc))
  })

  it('nộp LỖI thì KHÔNG đọc lại cổng /shortage', async () => {
    apiFetch.mockReset()
    // Lượt shortage GET ban đầu ổn; lượt POST output-documents hỏng.
    apiFetch.mockImplementation((url, opts) => {
      if (String(url).includes('/output-documents') && opts?.method === 'POST') {
        return Promise.reject(new Error('Tệp vượt quá dung lượng cho phép'))
      }
      return Promise.resolve({ blockers: [] })
    })
    const onRefresh = vi.fn()
    render(
      <ToastProvider>
        <EmployeeItemWorkspace item={ITEM} tasks={[UPLOAD_TASK]} onBack={vi.fn()} onRefresh={onRefresh} />
      </ToastProvider>,
    )

    await waitFor(() => expect(demShortage()).toBeGreaterThanOrEqual(1))
    const truoc = demShortage()

    selectChildBFile()
    await waitFor(() =>
      expect(screen.getByText('Tệp vượt quá dung lượng cho phép')).toBeInTheDocument())

    // Nộp hỏng thì không có gì đổi để phải đọc lại — và không được nuốt lỗi bằng
    // một lượt làm mới lặng lẽ.
    expect(demShortage()).toBe(truoc)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('upload runtime cập nhật đúng hàng tại chỗ và không tải lại toàn workspace', async () => {
    const runtimeTask = {
      ...TASK,
      checklist: [{
        id: 'c-runtime',
        name: 'Hồ sơ bàn giao',
        document_types: [{
          id: 'TYPE-1',
          name: 'Giấy chứng nhận quyền sử dụng đất',
          source: 'KHACH_HANG',
          source_label: 'Khách hàng cung cấp',
          status: 'draft',
          file_count: 0,
          files: [],
        }],
      }],
    }
    let shortageReads = 0
    apiFetch.mockReset()
    apiFetch.mockImplementation((url, options) => {
      if (String(url).includes('/shortage')) {
        shortageReads += 1
        return Promise.resolve({ blockers: shortageReads === 1 ? [{ kind: 'missing_document_type_files' }] : [] })
      }
      if (String(url).includes('/document-types/TYPE-1/files') && options?.method === 'POST') {
        return Promise.resolve({
          status: 'success',
          data: [{
            document_id: 'DOC-NEW',
            file_name: 'so-hong-moi.pdf',
            content_type: 'application/pdf',
            size_bytes: 7,
            status: 'success',
            review_status: 'draft',
            file_count: 1,
          }],
        })
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`))
    })
    const onRefresh = vi.fn()
    render(
      <ToastProvider>
        <EmployeeItemWorkspace
          item={ITEM}
          tasks={[runtimeTask]}
          onBack={vi.fn()}
          onRefresh={onRefresh}
        />
      </ToastProvider>,
    )

    const input = screen.getByLabelText('Tải file cho Giấy chứng nhận quyền sử dụng đất')
    fireEvent.change(input, {
      target: { files: [new File(['so-hong'], 'so-hong-moi.pdf', { type: 'application/pdf' })] },
    })

    await waitFor(() => expect(shortageReads).toBe(2))
    expect(onRefresh).not.toHaveBeenCalled()
    expect(screen.getByText('1', { selector: '.eiw-doc__file-count-badge' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Xem 1 file của Giấy chứng nhận/ }))
    expect(screen.getByText('so-hong-moi.pdf')).toBeInTheDocument()
  })
})
