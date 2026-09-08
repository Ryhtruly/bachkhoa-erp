import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(async () => ({})),
  getAccessToken: vi.fn(() => 'token'),
}))
vi.mock('../legal-dossier/LegalDossierNodePanel', () => ({
  default: () => <div data-testid="legal-dossier-panel" />,
}))
vi.mock('../legal-dossier/SubmissionReceiptPanel', () => ({
  default: () => <div data-testid="submission-receipt-panel" />,
}))
vi.mock('../handover/HandoverPanel', () => ({
  default: () => <div data-testid="handover-panel" />,
}))

vi.mock('@fullcalendar/react', () => ({
  default: (props) => <div
    data-testid="calendar"
    data-slot-event-overlap={String(props.slotEventOverlap)}
    data-event-count={props.events.length}
    data-first-group-size={props.events[0]?.extendedProps.tasks?.length}
    data-first-duration-minutes={(props.events[0]?.end - props.events[0]?.start) / 60_000}
  >
    {props.events.map((event) => (
      <div key={event.id} data-testid={`event-${event.id}`}>
        {props.eventContent({
          event: {
            backgroundColor: event.backgroundColor,
            extendedProps: event.extendedProps,
          },
        })}
      </div>
    ))}
  </div>,
}))

import EmployeeWorkspaceCalendar, { NodeActionBar, EmployeeNodeModal } from './EmployeeWorkspaceCalendar'
import { apiFetch } from '../../lib/api'
import { ToastProvider } from '../../contexts/ToastContext'

describe('EmployeeWorkspaceCalendar', () => {
  // Thiếu cleanup thì DOM của test trước còn nguyên, và getByRole bắt trúng
  // nút của lần render cũ — lỗi giả trông y hệt lỗi thật.
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('groups time-overlapping items into one vertical timetable block even when starts differ', () => {
    render(<EmployeeWorkspaceCalendar tasks={[
      { id: 'one', name: 'Việc 1', started_at: '2026-08-12T08:00:00Z', status: 'in_progress' },
      { id: 'two', name: 'Việc 2', started_at: '2026-08-12T08:10:00Z', status: 'in_progress' },
      { id: 'three', name: 'Việc 3', started_at: '2026-08-12T08:20:00Z', status: 'in_progress' },
    ]} />)

    expect(screen.getByTestId('calendar')).toHaveAttribute('data-slot-event-overlap', 'false')
    expect(screen.getByTestId('calendar')).toHaveAttribute('data-event-count', '1')
    expect(screen.getByTestId('calendar')).toHaveAttribute('data-first-group-size', '3')
    expect(screen.getByTestId('calendar')).toHaveAttribute('data-first-duration-minutes', '360')
  })

  it('K06 chỉ khóa nút nộp nghiệm thu khi cổng công nợ chưa mở', () => {
    render(
      <ToastProvider>
        <NodeActionBar
          task={{
            id: 'k06', node_code: 'K06', status: 'in_progress', checklist: [{
              id: 'cr-1', name: 'Hồ sơ bàn giao', document_types: [{
                id: 'dt-1', name: 'Biên bản bàn giao', file_count: 1,
              }],
            }],
          }}
          handoverState={{ can_submit_acceptance: false, debt: { gate_open: false } }}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    )

    expect(screen.getByRole('button', { name: 'Nộp nghiệm thu' })).toBeDisabled()
    expect(screen.getByText(/còn công nợ/i)).toBeInTheDocument()
  })

  it('K06 mở nút và gọi endpoint nghiệm thu riêng sau khi được duyệt nợ', async () => {
    apiFetch.mockResolvedValue({ data: { status: 'submitted' } })
    const onChanged = vi.fn()
    render(
      <ToastProvider>
        <NodeActionBar
          task={{
            id: 'k06', node_code: 'K06', status: 'in_progress', checklist: [{
              id: 'cr-1', name: 'Hồ sơ bàn giao', document_types: [{
                id: 'dt-1', name: 'Biên bản bàn giao', file_count: 1,
              }],
            }],
          }}
          handoverState={{ can_submit_acceptance: true, debt: { gate_open: true } }}
          onChanged={onChanged}
        />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Nộp nghiệm thu' }))
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      '/api/handover/k06/submit-acceptance',
      expect.objectContaining({ method: 'POST' }),
    ))
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  // ĐỔI CHỦ ĐÍCH: một nút "Nộp nghiệm thu" duy nhất cho MỌI bước. Bản trước có
  // hai đường — bước không checklist thì có nút "Nộp hoàn thành công việc", bước
  // CÓ checklist thì không có nút nào và tự đóng khi mục cuối được duyệt. Cách
  // đó khiến không bao giờ tồn tại thời điểm Giám đốc nhìn trọn gói hồ sơ trước
  // khi chốt, và nhân viên phải gửi từng cái một.
  it('bước không có nhiệm vụ nào thì nộp nghiệm thu được ngay', () => {
    render(
      <ToastProvider>
        <NodeActionBar
          task={{ id: 'k03', node_code: 'K03', status: 'in_progress', checklist: [] }}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    )

    expect(screen.getByRole('button', { name: /Nộp nghiệm thu/i })).toBeEnabled()
  })

  it('bước CÓ nhiệm vụ cũng dùng đúng nút đó, không còn tự đóng lặng lẽ', () => {
    render(
      <ToastProvider>
        <NodeActionBar
          task={{
            id: 'k03', node_code: 'K03', status: 'in_progress',
            checklist: [
              { id: 'c1', checklist_name: 'Ảnh hiện trạng', status: 'pending_approval' },
              { id: 'c2', checklist_name: 'Biên bản mốc', status: 'approved' },
            ],
          }}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    )

    // Đã điền hết (chờ duyệt cũng là đã điền) → nộp được.
    expect(screen.getByRole('button', { name: /Nộp nghiệm thu/i })).toBeEnabled()
  })

  it('checklist runtime trạng thái pending vẫn cho nộp khi mọi loại giấy đã được gán file', () => {
    render(
      <ToastProvider>
        <NodeActionBar
          task={{
            id: 'k01-runtime', node_code: 'K01', status: 'in_progress',
            checklist: [{
              id: 'cr-runtime', checklist_name: 'Hồ sơ đầu vào', status: 'pending',
              document_types: [
                { id: 'type-a', name: 'CCCD', status: 'draft', file_count: 1,
                  files: [{ document_id: 'doc-a' }] },
                { id: 'type-b', name: 'Sổ đỏ', status: 'draft', file_count: 2,
                  files: [{ document_id: 'doc-b1' }, { document_id: 'doc-b2' }] },
              ],
            }],
          }}
          gate={{ blockers: [] }}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    )

    expect(screen.getByRole('button', { name: 'Nộp nghiệm thu' })).toBeEnabled()
    expect(screen.queryByText(/nhiệm vụ chưa điền xong/)).not.toBeInTheDocument()
  })

  it('bước bị trả bài cho nộp nghiệm thu lại trực tiếp, không bắt bấm Làm lại', () => {
    render(
      <ToastProvider>
        <NodeActionBar
          task={{ id: 'k01-rework', node_code: 'K01', status: 'rework_required', checklist: [] }}
          onChanged={vi.fn()}
          gate={{ blockers: [] }}
        />
      </ToastProvider>,
    )

    expect(screen.getByRole('button', { name: 'Nộp nghiệm thu lại' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Làm lại' })).not.toBeInTheDocument()
  })

  it('khóa nộp lại khi loại giấy đang sửa không còn file nào để Giám đốc duyệt', () => {
    render(
      <ToastProvider>
        <NodeActionBar
          task={{ id: 'k01-empty-type', node_code: 'K01', status: 'rework_required', checklist: [] }}
          onChanged={vi.fn()}
          gate={{ blockers: [{
            kind: 'missing_document_type_files',
            message: 'Còn 1 loại giấy chưa có file để nộp lại.',
          }] }}
        />
      </ToastProvider>,
    )

    const button = screen.getByRole('button', { name: 'Nộp nghiệm thu lại' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Còn 1 loại giấy chưa có file để nộp lại.')
  })

  it('còn nhiệm vụ chưa điền thì khoá nút và nói rõ thiếu cái gì', () => {
    render(
      <ToastProvider>
        <NodeActionBar
          task={{
            id: 'k03', node_code: 'K03', status: 'in_progress',
            checklist: [
              { id: 'c1', checklist_name: 'Ảnh hiện trạng', status: 'pending' },
              { id: 'c2', checklist_name: 'Biên bản mốc', status: 'failed' },
            ],
          }}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    )

    expect(screen.getByRole('button', { name: /Nộp nghiệm thu/i })).toBeDisabled()
    expect(screen.getByText(/Còn 2 nhiệm vụ chưa điền xong/)).toHaveTextContent('Ảnh hiện trạng')
  })

  // ĐÃ ĐỔI CHỦ ĐÍCH 27/08: thiếu TÀI LIỆU không khoá nút nữa. Khoá là treo bước
  // vĩnh viễn khi giấy khách không có thật, và nhân viên chỉ còn cách nhét đại
  // một tệp cho qua cổng. Thay bằng Modal liệt kê rồi buộc xác nhận.
  it('thiếu tài liệu thì KHÔNG khoá nút, mà mở Modal liệt kê rồi mới gửi', async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.includes('/shortage')) {
        return { status: 'success', data: [{
          checklist_result_id: 'CR-1', checklist_name: 'Chuẩn hoá bản vẽ',
          thieu: [{ template_id: 'T-1', name: 'Bản vẽ kỹ thuật', can: 2, da_co: 0, con_thieu: 2 }],
        }] }
      }
      return {}
    })

    render(
      <ToastProvider>
        <NodeActionBar
          task={{ id: 'k01', node_code: 'K01', status: 'in_progress', checklist: [] }}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    )

    const nut = screen.getByRole('button', { name: /Nộp nghiệm thu/i })
    expect(nut).toBeEnabled()
    fireEvent.click(nut)

    expect(await screen.findByText(/Hồ sơ còn thiếu tài liệu/)).toBeInTheDocument()
    expect(screen.getByText('Bản vẽ kỹ thuật')).toBeInTheDocument()
    // §5 đòi đủ ba số: cần bao nhiêu, đã có bao nhiêu, còn thiếu bao nhiêu.
    expect(screen.getByText(/cần 2 · đã có 0 ·/)).toBeInTheDocument()
    expect(screen.getByText(/thiếu 2/)).toBeInTheDocument()
    expect(screen.getByText(/Bạn có chắc muốn nộp không\?/)).toBeInTheDocument()

    // Chưa xác nhận thì TUYỆT ĐỐI chưa được gửi.
    expect(apiFetch.mock.calls.filter(([u]) => String(u).includes('/submit'))).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /Vẫn nộp nghiệm thu/ }))
    await vi.waitFor(() =>
      expect(apiFetch.mock.calls.filter(([u]) => String(u).includes('/submit'))).toHaveLength(1))
  })

  it('huỷ ở Modal thì không gửi gì cả', async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.includes('/shortage')) {
        return { status: 'success', data: [{
          checklist_result_id: 'CR-1', checklist_name: 'A',
          thieu: [{ name: 'Giấy X', can: 1, da_co: 0, con_thieu: 1 }],
        }] }
      }
      return {}
    })

    render(
      <ToastProvider>
        <NodeActionBar
          task={{ id: 'k01', node_code: 'K01', status: 'in_progress', checklist: [] }}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Nộp nghiệm thu/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Quay lại bổ sung/ }))

    expect(apiFetch.mock.calls.filter(([u]) => String(u).includes('/submit'))).toHaveLength(0)
  })

  it('khi sếp không tạo loại giấy, bấm Nộp nghiệm thu mở Modal và bắt buộc đính kèm lý do', async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.includes('/shortage')) {
        return { status: 'success', data: [] }
      }
      return { status: 'success' }
    })

    render(
      <ToastProvider>
        <NodeActionBar
          task={{
            id: 'k07-node',
            node_code: 'K07',
            status: 'in_progress',
            checklist: [{
              id: 'cr-paperless',
              name: 'Đóng hồ sơ & khoá hạng mục',
              status: 'pending',
              document_types: [],
            }],
          }}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    )

    const nut = screen.getByRole('button', { name: /Nộp nghiệm thu/i })
    expect(nut).toBeEnabled()
    fireEvent.click(nut)

    expect(await screen.findByText(/Checklist chưa có phân loại giấy tờ/)).toBeInTheDocument()
    const nutNop = screen.getByRole('button', { name: /Vẫn nộp nghiệm thu/ })
    expect(nutNop).toBeDisabled()

    const textarea = screen.getByPlaceholderText(/Nhập lý do hoàn thành checklist chưa có loại giấy/)
    fireEvent.change(textarea, { target: { value: 'Đã hoàn tất lưu kho và khoá hồ sơ' } })
    expect(nutNop).toBeEnabled()

    fireEvent.click(nutNop)

    await vi.waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/employee-portal/tasks/k07-node/submit',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ note: 'Đã hoàn tất lưu kho và khoá hồ sơ' }),
        }),
      )
    })
  })

  it('khi nhân viên không gán tài liệu vào loại giấy, đính kèm lý do giải trình khi nộp nghiệm thu', async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url.includes('/shortage')) {
        return {
          status: 'success',
          data: [{
            checklist_result_id: 'cr-1',
            checklist_name: 'Bản vẽ hiện trạng',
            thieu: [{ name: 'Bản vẽ CAD', can: 1, da_co: 0, con_thieu: 1 }],
          }],
        }
      }
      return { status: 'success' }
    })

    render(
      <ToastProvider>
        <NodeActionBar
          task={{
            id: 'k04-node',
            node_code: 'K04',
            status: 'in_progress',
            checklist: [{
              id: 'cr-1',
              name: 'Bản vẽ hiện trạng',
              status: 'pending',
              document_types: [{
                id: 'dt-1',
                name: 'Bản vẽ CAD',
                file_count: 0,
                files: [],
              }],
            }],
          }}
          onChanged={vi.fn()}
        />
      </ToastProvider>,
    )

    const nut = screen.getByRole('button', { name: /Nộp nghiệm thu/i })
    expect(nut).toBeEnabled()
    fireEvent.click(nut)

    expect(await screen.findByText('Bản vẽ CAD')).toBeInTheDocument()
    const textarea = screen.getByPlaceholderText(/Nhập lý do chưa có giấy tờ hoặc giải trình thực hiện/)
    fireEvent.change(textarea, { target: { value: 'Khách hàng chưa gửi file CAD gốc' } })

    fireEvent.click(screen.getByRole('button', { name: /Vẫn nộp nghiệm thu/ }))

    await vi.waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/employee-portal/tasks/k04-node/submit',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ note: 'Khách hàng chưa gửi file CAD gốc' }),
        }),
      )
    })
  })

  // ── Task 3: cổng CỨNG (paused / rejected_documents) vs cổng MỀM (missing) ──
  // NodeActionBar nhận payload /shortage đã nạp sẵn qua prop `gate` khi nhúng
  // trong EmployeeItemWorkspace. paused và rejected_documents khoá nút và nêu
  // đúng câu máy chủ; missing_documents thì KHÔNG khoá — vẫn qua Modal xác nhận.
  describe('cổng cứng/mềm theo blocker máy chủ (gate)', () => {
    it('cổng cứng paused (gate ban đầu) khoá nút và nêu đúng câu chặn của máy chủ', () => {
      render(
        <ToastProvider>
          <NodeActionBar
            task={{
              id: 'k01', node_code: 'K01', status: 'in_progress',
              pause_reason_type: 'AGENCY', checklist: [],
            }}
            gate={{ blockers: [{ kind: 'paused', message: 'Bước đang tạm dừng chờ cơ quan.' }] }}
            onChanged={vi.fn()}
          />
        </ToastProvider>,
      )

      expect(screen.getByRole('button', { name: /Nộp nghiệm thu/i })).toBeDisabled()
      expect(screen.getByText('Bước đang tạm dừng chờ cơ quan.')).toBeInTheDocument()
    })

    it('cổng cứng rejected_documents (gate ban đầu) khoá nút, nêu câu máy chủ, không gọi /submit', () => {
      render(
        <ToastProvider>
          <NodeActionBar
            task={{ id: 'k01', node_code: 'K01', status: 'in_progress', checklist: [] }}
            gate={{ blockers: [{ kind: 'rejected_documents', message: 'Còn 1 tờ bị Giám đốc trả lại chưa sửa.' }] }}
            onChanged={vi.fn()}
          />
        </ToastProvider>,
      )

      expect(screen.getByRole('button', { name: /Nộp nghiệm thu/i })).toBeDisabled()
      expect(screen.getByText(/Còn 1 tờ bị Giám đốc trả lại/)).toBeInTheDocument()
      expect(apiFetch.mock.calls.filter(([url]) => String(url).includes('/submit'))).toHaveLength(0)
    })

    it('gate ban đầu sạch nhưng /shortage lúc bấm trả cổng cứng thì DỪNG, tuyệt đối không gọi /submit', async () => {
      apiFetch.mockImplementation(async (url) => {
        if (String(url).includes('/shortage')) {
          return {
            status: 'success',
            data: [],
            blockers: [{ kind: 'rejected_documents', message: 'Còn 1 tờ bị Giám đốc trả lại chưa sửa.' }],
          }
        }
        return {}
      })

      render(
        <ToastProvider>
          <NodeActionBar
            task={{ id: 'k01', node_code: 'K01', status: 'in_progress', checklist: [] }}
            gate={null}
            onChanged={vi.fn()}
          />
        </ToastProvider>,
      )

      const nut = screen.getByRole('button', { name: /Nộp nghiệm thu/i })
      expect(nut).toBeEnabled()
      fireEvent.click(nut)

      // Câu chặn mới phải hiện ra (toast), và KHÔNG được có lượt /submit nào.
      expect(await screen.findByText(/Còn 1 tờ bị Giám đốc trả lại/)).toBeInTheDocument()
      await vi.waitFor(() =>
        expect(apiFetch.mock.calls.filter(([u]) => String(u).includes('/shortage')).length).toBeGreaterThan(0))
      expect(apiFetch.mock.calls.filter(([u]) => String(u).includes('/submit'))).toHaveLength(0)
    })

    it('missing_documents là cổng MỀM: không khoá nút, vẫn mở Modal xác nhận rồi mới gửi', async () => {
      apiFetch.mockImplementation(async (url) => {
        if (String(url).includes('/shortage')) {
          return {
            status: 'success',
            data: [{
              checklist_result_id: 'CR-1', checklist_name: 'Chuẩn hoá bản vẽ',
              thieu: [{ template_id: 'T-1', name: 'Bản vẽ kỹ thuật', can: 2, da_co: 0, con_thieu: 2 }],
            }],
            blockers: [{ kind: 'missing_documents', message: 'Còn thiếu giấy tờ đầu ra ở 1 mục checklist.' }],
          }
        }
        return {}
      })

      render(
        <ToastProvider>
          <NodeActionBar
            task={{ id: 'k01', node_code: 'K01', status: 'in_progress', checklist: [] }}
            gate={{ blockers: [{ kind: 'missing_documents', message: 'Còn thiếu giấy tờ đầu ra ở 1 mục checklist.' }] }}
            onChanged={vi.fn()}
          />
        </ToastProvider>,
      )

      const nut = screen.getByRole('button', { name: /Nộp nghiệm thu/i })
      expect(nut).toBeEnabled()
      fireEvent.click(nut)

      expect(await screen.findByText(/Hồ sơ còn thiếu tài liệu/)).toBeInTheDocument()
      expect(apiFetch.mock.calls.filter(([u]) => String(u).includes('/submit'))).toHaveLength(0)

      fireEvent.click(screen.getByRole('button', { name: /Vẫn nộp nghiệm thu/ }))
      await vi.waitFor(() =>
        expect(apiFetch.mock.calls.filter(([u]) => String(u).includes('/submit'))).toHaveLength(1))
    })

    it('pending_approval là trạng thái đã-làm-xong chờ Giám đốc, KHÔNG bị coi là chặn', () => {
      render(
        <ToastProvider>
          <NodeActionBar
            task={{
              id: 'k03', node_code: 'K03', status: 'in_progress', pause_reason_type: null,
              checklist: [
                { id: 'c1', checklist_name: 'Ảnh hiện trạng', status: 'pending_approval' },
                { id: 'c2', checklist_name: 'Biên bản mốc', status: 'late_pending_approval' },
              ],
            }}
            gate={{ blockers: [] }}
            onChanged={vi.fn()}
          />
        </ToastProvider>,
      )

      expect(screen.getByRole('button', { name: /Nộp nghiệm thu/i })).toBeEnabled()
    })

    it('K06 dùng nút nghiệm thu riêng nhưng vẫn tôn trọng blocker tài liệu', () => {
      render(
        <ToastProvider>
          <NodeActionBar
            task={{ id: 'k06', node_code: 'K06', status: 'in_progress', checklist: [] }}
            gate={{ blockers: [{ kind: 'rejected_documents', message: 'Còn tờ bị trả lại.' }] }}
            handoverState={{ can_submit_acceptance: false, debt: { gate_open: true } }}
            onChanged={vi.fn()}
          />
        </ToastProvider>,
      )

      const button = screen.getByRole('button', { name: /Nộp nghiệm thu/i })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'Còn tờ bị trả lại.')
    })
  })

  it('renders the shared task pool and claims the selected role', () => {
    const onClaim = vi.fn()
    render(
      <ToastProvider>
        <EmployeeWorkspaceCalendar
          tasks={[]}
          taskPool={{
            items: [{
              id: 'pool-k02',
              node_code: 'K02',
              name: 'Khảo sát & đo hiện trường',
              contract_id: '128/BK-2026',
              customer_name: 'Lê Quang Huy',
              available_roles: ['MAIN'],
              role_amounts: { MAIN: 250000 },
            }],
            restrictions: { active_in_progress: 0, wip_locked: false },
          }}
          onClaim={onClaim}
        />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Nhận việc chính/i }))
    expect(onClaim).toHaveBeenCalledWith('pool-k02', 'MAIN')
  })

  it('can hide the task pool when embedded beside the legacy dashboard pool', () => {
    render(
      <ToastProvider>
        <EmployeeWorkspaceCalendar
          taskPool={{ items: [{ id: 'pool-1', available_roles: ['MAIN'], name: 'Việc trùng' }] }}
          hidePool
        />
      </ToastProvider>,
    )

    expect(screen.queryByRole('region', { name: 'Bể việc chờ nhận' })).not.toBeInTheDocument()
  })

  it('drawing task mounts none of legal/submission/handover panels', () => {
    render(
      <ToastProvider>
        <EmployeeNodeModal
          task={{
            id: 't-draw', node_code: 'K02', name: 'Đo vẽ', status: 'in_progress',
            requires_gov_submission: false, is_handover: false, checklist: []
          }}
          onClose={vi.fn()}
          onRefresh={vi.fn()}
        />
      </ToastProvider>,
    )
    expect(screen.queryByTestId('legal-dossier-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('submission-receipt-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('handover-panel')).not.toBeInTheDocument()
  })

  it('gov-submission task mounts legal and submission panels only', () => {
    render(
      <ToastProvider>
        <EmployeeNodeModal
          task={{
            id: 't-gov', node_code: 'K04', name: 'Nộp cơ quan', status: 'in_progress',
            requires_gov_submission: true, is_handover: false, checklist: []
          }}
          onClose={vi.fn()}
          onRefresh={vi.fn()}
        />
      </ToastProvider>,
    )
    expect(screen.getByTestId('legal-dossier-panel')).toBeInTheDocument()
    expect(screen.getByTestId('submission-receipt-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('handover-panel')).not.toBeInTheDocument()
  })

  it('handover task mounts handover panel only', () => {
    render(
      <ToastProvider>
        <EmployeeNodeModal
          task={{
            id: 't-handover', node_code: 'K06', name: 'Bàn giao', status: 'in_progress',
            requires_gov_submission: false, is_handover: true, checklist: []
          }}
          onClose={vi.fn()}
          onRefresh={vi.fn()}
        />
      </ToastProvider>,
    )
    expect(screen.getByTestId('handover-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('legal-dossier-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('submission-receipt-panel')).not.toBeInTheDocument()
  })
})
