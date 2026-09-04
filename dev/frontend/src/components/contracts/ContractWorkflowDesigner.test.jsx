import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ContractWorkflowDesigner, { WorkflowEdge } from './ContractWorkflowDesigner';
import { neoTuyenVaoHandle } from './workflowEdgeRouting';
import { clearApiCache } from '../../lib/api';

const { duongDaVe } = vi.hoisted(() => ({ duongDaVe: [] }));

vi.mock('@xyflow/react', () => ({
  addEdge: (_connection, edges) => edges,
  Background: () => null,
  BaseEdge: props => { duongDaVe.push(props); return null; },
  Controls: () => null,
  Handle: () => null,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  MiniMap: () => null,
  Position: { Left: 'left', Right: 'right' },
  ReactFlow: ({ children, nodes = [], nodeTypes = {} }) => (
    <div>
      {nodes.map(node => {
        const NodeComponent = nodeTypes[node.type];
        return NodeComponent ? <NodeComponent key={node.id} id={node.id} data={node.data} /> : null;
      })}
      {children}
    </div>
  ),
  getSmoothStepPath: () => ['', 0, 0],
  useEdgesState: initial => {
    const [edges, setEdges] = React.useState(initial);
    return [edges, setEdges, vi.fn()];
  },
  useNodesState: initial => {
    const [nodes, setNodes] = React.useState(initial);
    return [nodes, setNodes, vi.fn()];
  },
  useUpdateNodeInternals: () => vi.fn(),
}));

// Panel duyệt nghiệm thu K01 có nhúng sổ giấy tờ và tình trạng giấy được miễn,
// nên khi node đang chờ duyệt thì designer phát thêm vài lệnh nạp dữ liệu. Các
// test dưới đây quan tâm ĐÚNG một lệnh ghi, vì vậy lọc theo endpoint thay vì
// đếm mọi lệnh fetch — đếm tất là dính nhiễu của panel con.
const goiToi = (fetchMock, phanDuong) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes(phanDuong));

const workItem = {
  id: 'work-1',
  name: 'Nghiệm thu hồ sơ',
  rates: [{ role_code: 'MAIN', amount: 150000 }],
};

function makeServiceLine({
  active = false,
  changedActiveNode = false,
  privateEvidence = false,
  description = '',
  durationDays = 0,
  durationHours = 0,
  durationMinutes = 0,
  pendingChecklistReview = false,
  // Bước chưa chạy (ready) thì checklist còn sửa được — trạng thái Giám đốc cấu
  // hình tài liệu đầu ra. Mặc định của harness là 'submitted', đã khoá.
  nodeReady = false,
  taskCode = 'K01',
  outputDocs = null,
  runtimeDocumentTypes,
} = {}) {
  const node = {
    task_code: taskCode,
    name: changedActiveNode ? 'Bản sửa Node' : 'Nghiệm thu',
    description,
    duration_days: durationDays,
    duration_hours: durationHours,
    duration_minutes: durationMinutes,
    pool_department_code: 'SURVEY',
    claim_roles: ['MAIN', 'ASSISTANT'],
    checklist: [{
      key: 'check-1',
      name: 'Biên bản nghiệm thu',
      ...(outputDocs ? { output_documents: outputDocs } : {}),
      required: true,
      require_evidence: privateEvidence,
      compensation: { is_payable: true, work_item_id: workItem.id },
    }],
    assignments: [{ employee_id: 'emp-1', full_name: 'Nguyễn Văn A', role_code: 'MAIN', is_primary: true }],
    transitions: {},
  };
  const activeNode = { ...node, name: changedActiveNode ? 'Bản gốc Node' : node.name };
  return {
    id: 'line-1',
    workflow: {
      status: 'active',
      active_revision_id: active ? 'revision-1' : null,
      revision_status: active ? 'draft' : null,
      graph: { start_node: 'node-1', nodes: { 'node-1': node }, ui: {} },
      active_graph: active ? { start_node: 'node-1', nodes: { 'node-1': activeNode }, ui: {} } : null,
      execution_nodes: active ? [{
        id: 'task-1', node_key: 'node-1', node_code: taskCode, status: 'in_progress',
        started_at: '2026-08-20T08:00:00.000Z',
        deadline_at: '2026-08-25T17:00:00.000Z',
        execution_data: { actual_duration_seconds: 90060 },
        checklist_results: privateEvidence || pendingChecklistReview ? [{
          id: 'result-1',
          checklist_key: 'check-1',
          checklist_name: 'Biên bản nghiệm thu',
          require_evidence: true,
          status: pendingChecklistReview ? 'pending_approval' : 'approved',
          evidence_data: { files: [{ name: 'bien-ban.pdf', url: 'contracts/2004/service-lines/line-1/nodes/task-1/bien-ban.pdf' }] },
          ...(runtimeDocumentTypes !== undefined ? { document_types: runtimeDocumentTypes } : {}),
        }] : [],
      }] : [{
        id: 'task-1', node_key: 'node-1', node_code: taskCode,
        status: nodeReady ? 'ready' : 'submitted',
        ...(nodeReady ? {} : { pending_acceptance_id: 'acceptance-1' }),
      }],
    },
  };
}

function renderDesigner(options = {}) {
  const { contractTotalValue, contractPaidAmount, ...lineOptions } = options;
  return render(
    <ContractWorkflowDesigner
      serviceLine={makeServiceLine(lineOptions)}
      contractTotalValue={contractTotalValue}
      contractPaidAmount={contractPaidAmount}
      workItems={[workItem]}
      capabilities={{
        amend_workflow: true,
        review_workflow_node: true,
        review_workflow_checklist: true,
      }}
      addToast={vi.fn()}
    />
  );
}

function getToolbarAction(label) {
  return screen.getAllByRole('button', { name: new RegExp(`^${label}$`, 'i') })
    .find(button => button.classList.contains('workflow-activate-button'));
}

describe('ContractWorkflowDesigner workflow activation', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows the Vietnamese outcome label and placeholder for node acceptance', () => {
    renderDesigner();

    expect(screen.getByText('Kết quả xử lý')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '— Chọn kết quả —' })).toBeInTheDocument();
  });

  it('mô tả để chế độ đọc, bấm cây bút mới mở ô nhập', () => {
    const description = 'Nội dung nghiệm thu chỉ xem trong bảng chi tiết';
    renderDesigner({ description });

    // Lúc nghỉ là chữ, KHÔNG phải ô nhập — ô nhập luôn mở khiến hàng mô tả
    // trông như đang sửa dở.
    expect(screen.queryByDisplayValue(description)).not.toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sửa mô tả bước' }));
    expect(screen.getByDisplayValue(description)).toBeInTheDocument();
    expect(screen.queryByText(description, { selector: '.workflow-node > p' })).not.toBeInTheDocument();
  });

  it('lets the director configure a node duration in days, hours and minutes', () => {
    renderDesigner({ durationDays: 1, durationHours: 2, durationMinutes: 30 });

    expect(screen.getByRole('spinbutton', { name: 'Ngày' })).toHaveValue(1);
    expect(screen.getByRole('spinbutton', { name: 'Giờ' })).toHaveValue(2);
    expect(screen.getByRole('spinbutton', { name: 'Phút' })).toHaveValue(30);
    expect(screen.getByText('1 ngày 2 giờ 30 phút')).toBeInTheDocument();
  });

  it('persists duration minutes in the workflow draft graph', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ id: 'revision-draft' }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    renderDesigner({ durationDays: 1, durationHours: 2, durationMinutes: 30 });

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Phút' }), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: /^Lưu tạm$/i }));

    await waitFor(() => expect(goiToi(fetchMock, '/draft')).toHaveLength(1));
    const request = goiToi(fetchMock, '/draft')[0][1];
    const payload = JSON.parse(request.body);
    expect(payload.graph.nodes['node-1'].duration_minutes).toBe(45);
  });

  it('persists the director task-pool department and claim roles in the revision graph', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ id: 'revision-draft' }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    renderDesigner();

    expect(screen.getByLabelText('Phòng ban nhận việc')).toHaveValue('SURVEY');
    expect(screen.getByRole('button', { name: 'Vai trò được nhận việc' }))
      .toHaveTextContent('Phụ trách chính, Phối hợp / phụ');
    fireEvent.click(screen.getByRole('button', { name: 'Vai trò được nhận việc' }));
    expect(screen.getByRole('option', { name: 'Phụ trách chính' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Phối hợp / phụ' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.change(screen.getByLabelText('Phòng ban nhận việc'), { target: { value: 'LEGAL' } });
    fireEvent.click(screen.getByRole('button', { name: /^Lưu tạm$/i }));

    await waitFor(() => expect(goiToi(fetchMock, '/draft')).toHaveLength(1));
    const payload = JSON.parse(goiToi(fetchMock, '/draft')[0][1].body);
    expect(payload.graph.nodes['node-1'].pool_department_code).toBe('LEGAL');
    expect(payload.graph.nodes['node-1'].claim_roles).toEqual(['MAIN', 'ASSISTANT']);
  });

  it('duyệt nhanh minh chứng ngay trong hộp Chờ duyệt cố định', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ status: 'success' }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    renderDesigner({ active: true, pendingChecklistReview: true });

    fireEvent.click(screen.getByRole('button', { name: /Chờ duyệt/ }));
    // Từ khi checklist gộp vào tab Node, chữ "Duyệt đạt" xuất hiện ở cả thẻ
    // nghiệm thu Node lẫn hộp Chờ duyệt — phải chỉ đích danh cái trong hộp.
    const hopChoDuyet = document.querySelector('.workflow-review-inbox');
    expect(within(hopChoDuyet).getByRole('link', { name: /bien-ban\.pdf/i })).toBeInTheDocument();
    fireEvent.click(within(hopChoDuyet).getByRole('button', { name: 'Duyệt đạt' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/contracts/workflow/checklist/result-1/review',
      expect.objectContaining({ method: 'POST' }),
    ));
  });

  it('duyệt loại giấy runtime bằng đúng endpoint/body, refresh sau từng quyết định', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ status: 'success' }), { status: 200 })));
    const onPersisted = vi.fn(() => Promise.resolve());
    const addToast = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const runtimeDocumentTypes = [
      {
        id: 'TYPE-APPROVE', name: 'Ảnh hiện trạng', source: 'CONG_TY', status: 'pending_review',
        file_count: 1, files: [{ document_id: 'DOC-1', file_name: 'hien-trang.jpg' }],
      },
      {
        id: 'TYPE-REJECT', name: 'Biên nhận hồ sơ', source: 'CO_QUAN', status: 'pending_review',
        file_count: 1, files: [{ document_id: 'DOC-2', file_name: 'bien-nhan.pdf' }],
      },
    ];
    render(
      <ContractWorkflowDesigner
        serviceLine={makeServiceLine({ active: true, pendingChecklistReview: true, runtimeDocumentTypes })}
        workItems={[workItem]}
        documentTemplates={[]}
        plannedNodeByTemplate={{}}
        capabilities={{ review_workflow_checklist: true }}
        onPersisted={onPersisted}
        addToast={addToast}
      />
    );

    const approveRow = screen.getByText('Ảnh hiện trạng').closest('.wf-check-type');
    fireEvent.click(within(approveRow).getByRole('button', { name: 'Đạt' }));
    await waitFor(() => expect(goiToi(fetchMock, '/document-types/TYPE-APPROVE/review')).toHaveLength(1));
    expect(goiToi(fetchMock, '/document-types/TYPE-APPROVE/review')[0]).toEqual([
      '/api/contracts/workflow/checklist/result-1/document-types/TYPE-APPROVE/review',
      expect.objectContaining({ method: 'POST' }),
    ]);
    expect(JSON.parse(goiToi(fetchMock, '/document-types/TYPE-APPROVE/review')[0][1].body)).toEqual({
      decision: 'approved',
      reason: null,
    });

    const rejectRow = screen.getByText('Biên nhận hồ sơ').closest('.wf-check-type');
    fireEvent.click(within(rejectRow).getByRole('button', { name: 'Không đạt' }));
    fireEvent.change(within(rejectRow).getByLabelText('Lý do không đạt'), {
      target: { value: '  Thiếu dấu tiếp nhận  ' },
    });
    fireEvent.click(within(rejectRow).getByRole('button', { name: 'Xác nhận không đạt' }));
    await waitFor(() => expect(goiToi(fetchMock, '/document-types/TYPE-REJECT/review')).toHaveLength(1));
    expect(JSON.parse(goiToi(fetchMock, '/document-types/TYPE-REJECT/review')[0][1].body)).toEqual({
      decision: 'rejected',
      reason: 'Thiếu dấu tiếp nhận',
    });
    await waitFor(() => expect(onPersisted).toHaveBeenCalledTimes(2));
  });

  it('giữ nguyên lỗi API duyệt loại giấy trên toast và không refresh sai', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      detail: 'Loại giấy không còn ở trạng thái chờ duyệt.',
    }), { status: 409 })));
    const onPersisted = vi.fn();
    const addToast = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ContractWorkflowDesigner
        serviceLine={makeServiceLine({
          active: true,
          pendingChecklistReview: true,
          runtimeDocumentTypes: [{
            id: 'TYPE-STALE', name: 'Phiếu tiếp nhận', source: 'CO_QUAN', status: 'pending_review',
            file_count: 1, files: [{ document_id: 'DOC-STALE', file_name: 'phieu.pdf' }],
          }],
        })}
        workItems={[workItem]}
        documentTemplates={[]}
        plannedNodeByTemplate={{}}
        capabilities={{ review_workflow_checklist: true }}
        onPersisted={onPersisted}
        addToast={addToast}
      />
    );

    fireEvent.click(within(screen.getByText('Phiếu tiếp nhận').closest('.wf-check-type'))
      .getByRole('button', { name: 'Đạt' }));

    await waitFor(() => expect(addToast).toHaveBeenCalledWith(
      'Loại giấy không còn ở trạng thái chờ duyệt.',
      'error',
    ));
    expect(onPersisted).not.toHaveBeenCalled();
  });

  it('runtime types ẩn action duyệt gộp ở node panel và Chờ duyệt; legacy vẫn giữ', async () => {
    const runtimeType = [{
      id: 'TYPE-1', name: 'CCCD', source: 'KHACH_HANG', status: 'pending_review',
      file_count: 1, files: [{ document_id: 'DOC-1', file_name: 'cccd.jpg' }],
    }];
    renderDesigner({ active: true, pendingChecklistReview: true, runtimeDocumentTypes: runtimeType });

    expect(screen.queryByRole('button', { name: 'Duyệt đạt' })).not.toBeInTheDocument();
    expect(screen.getByText('CCCD')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Chờ duyệt/ }));
    const inbox = document.querySelector('.workflow-review-inbox');
    expect(within(inbox).queryByRole('button', { name: 'Duyệt đạt' })).not.toBeInTheDocument();
    expect(within(inbox).getByText('CCCD')).toBeInTheDocument();

    cleanup();
    renderDesigner({ active: true, pendingChecklistReview: true });
    fireEvent.click(screen.getByRole('button', { name: /Chờ duyệt/ }));
    expect(within(document.querySelector('.workflow-review-inbox'))
      .getByRole('button', { name: 'Duyệt đạt' })).toBeInTheDocument();
  });

  it('shows cumulative processing time and marks an unfinished end date as planned', () => {
    renderDesigner({ active: true });

    expect(screen.getByText('KẾT THÚC DỰ KIẾN')).toBeInTheDocument();
    expect(screen.getByText('1 ngày 1 giờ 1 phút')).toBeInTheDocument();
  });

  it('waits for the activation modal confirmation before sending one activation request', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      amended: false, node_count: 1, assignment_count: 1, compensation_assignment_count: 1,
    }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn());
    renderDesigner();

    fireEvent.click(getToolbarAction('kích hoạt'));

    expect(screen.getByRole('heading', { name: 'Xác nhận kích hoạt quy trình' })).toBeInTheDocument();
    expect(screen.getByText(/Revision có lịch sử riêng/)).toBeInTheDocument();
    expect(screen.getByText(/Khoán dự kiến được khóa/)).toBeInTheDocument();
    expect(goiToi(fetchMock, '/activate')).toHaveLength(0);
    expect(window.confirm).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Xác nhận kích hoạt quy trình' })).getByRole('button', { name: /^kích hoạt$/i }));

    await waitFor(() => expect(goiToi(fetchMock, '/activate')).toHaveLength(1));
    expect(goiToi(fetchMock, '/activate')[0][0]).toBe('/api/contracts/workflow/line-1/activate');
  });

  it('keeps the final high-risk confirmation in a second application modal', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      amended: true, node_count: 1, assignment_count: 1, compensation_assignment_count: 1,
    }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    renderDesigner({ active: true, changedActiveNode: true });

    fireEvent.click(getToolbarAction('áp dụng'));
    const firstDialog = screen.getByRole('dialog', { name: 'Xác nhận áp dụng bản sửa đổi' });
    fireEvent.change(within(firstDialog).getByPlaceholderText('Nhập lý do sửa quy trình đang vận hành...'), {
      target: { value: 'Cập nhật phân công' },
    });
    fireEvent.click(within(firstDialog).getByRole('button', { name: /^áp dụng bản sửa đổi$/i }));

    const warningDialog = screen.getByRole('dialog', { name: 'Cảnh báo tác động quy trình đang chạy' });
    expect(within(warningDialog).getByText(/bản sửa đổi đang tác động tới/i)).toBeInTheDocument();
    // Designer nạp sẵn danh mục loại giấy để dựng bảng phân bổ, nên đếm MỌI
    // lệnh fetch là dính nhiễu. Chỉ quan tâm: chưa xác nhận thì chưa kích hoạt.
    expect(goiToi(fetchMock, '/activate')).toHaveLength(0);

    fireEvent.click(within(warningDialog).getByRole('button', { name: /^xác nhận áp dụng$/i }));
    await waitFor(() => expect(goiToi(fetchMock, '/activate')).toHaveLength(1));
  });

  it('asks for the amendment reason only after the director clicks Apply', () => {
    renderDesigner({ active: true, changedActiveNode: true });

    expect(screen.queryByText('Lý do sửa quy trình đang vận hành')).not.toBeInTheDocument();

    fireEvent.click(getToolbarAction('áp dụng'));

    const dialog = screen.getByRole('dialog', { name: 'Xác nhận áp dụng bản sửa đổi' });
    expect(within(dialog).getByText('Lý do sửa quy trình', { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText('Nhập lý do sửa quy trình đang vận hành...')).toBeInTheDocument();
  });

  it('lists every backend mandatory-allocation blocker when activation is rejected', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      detail: {
        code: 'ACTIVATION_READINESS_FAILED',
        message: 'Thiếu phân bổ loại giấy bắt buộc.',
        blockers: [
          { code: 'MANDATORY_OUTPUT_UNALLOCATED', template_id: 'TPL_SO_DO', template_name: 'Sổ đỏ gốc' },
          { code: 'MANDATORY_OUTPUT_UNALLOCATED', template_id: 'TPL_CCCD', template_name: 'CCCD/CMND' },
        ],
        warnings: [],
        requires_confirmation: false,
      },
    }), { status: 409 })));
    vi.stubGlobal('fetch', fetchMock);
    renderDesigner();

    fireEvent.click(getToolbarAction('kích hoạt'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Xác nhận kích hoạt quy trình' })).getByRole('button', { name: /^kích hoạt$/i }));

    const blockedDialog = await screen.findByRole('dialog', { name: 'Không thể kích hoạt quy trình' });
    expect(within(blockedDialog).getByText(/Sổ đỏ gốc/)).toBeInTheDocument();
    expect(within(blockedDialog).getByText(/CCCD\/CMND/)).toBeInTheDocument();
    expect(goiToi(fetchMock, '/activate')).toHaveLength(1);
  });

  it('warning-only activation keeps inactive when director cancels second confirmation', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      detail: {
        code: 'ACTIVATION_CONFIRMATION_REQUIRED',
        message: 'Một số bước chưa gắn khoán.',
        blockers: [],
        warnings: [{ code: 'MISSING_PIECE_RATE_MAPPING', node_key: 'node-1', node_name: 'Nghiệm thu' }],
        requires_confirmation: true,
      },
    }), { status: 409 })));
    vi.stubGlobal('fetch', fetchMock);
    renderDesigner();

    fireEvent.click(getToolbarAction('kích hoạt'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Xác nhận kích hoạt quy trình' })).getByRole('button', { name: /^kích hoạt$/i }));

    const warningDialog = await screen.findByRole('dialog', { name: 'Cảnh báo khoán chưa cấu hình' });
    expect(within(warningDialog).getByText(/không nhận khoán/i)).toBeInTheDocument();
    fireEvent.click(within(warningDialog).getByRole('button', { name: /^quay lại$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cảnh báo khoán chưa cấu hình' })).not.toBeInTheDocument());
    expect(goiToi(fetchMock, '/activate')).toHaveLength(1);
  });

  it('warning-only activation proceeds on explicit second confirmation', async () => {
    let activateCallCount = 0;
    const fetchMock = vi.fn((url) => {
      if (String(url).includes('/activate')) {
        activateCallCount += 1;
        if (activateCallCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({
            detail: {
              code: 'ACTIVATION_CONFIRMATION_REQUIRED',
              message: 'Một số bước chưa gắn khoán.',
              blockers: [],
              warnings: [{ code: 'MISSING_PIECE_RATE_MAPPING', node_key: 'node-1', node_name: 'Nghiệm thu' }],
              requires_confirmation: true,
            },
          }), { status: 409 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          amended: false, node_count: 1, assignment_count: 1, compensation_assignment_count: 0,
        }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: { groups: [] } }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderDesigner();

    fireEvent.click(getToolbarAction('kích hoạt'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Xác nhận kích hoạt quy trình' })).getByRole('button', { name: /^kích hoạt$/i }));

    const warningDialog = await screen.findByRole('dialog', { name: 'Cảnh báo khoán chưa cấu hình' });
    fireEvent.click(within(warningDialog).getByRole('button', { name: /^vẫn kích hoạt$/i }));

    await waitFor(() => expect(goiToi(fetchMock, '/activate')).toHaveLength(2));
    const secondRequest = goiToi(fetchMock, '/activate')[1][1];
    const secondPayload = JSON.parse(secondRequest.body);
    expect(secondPayload.confirm_warnings).toBe(true);
  });
});

// ── Tài liệu đầu ra ───────────────────────────────────────────────────────────
const DOC_TEMPLATES = [
  { id: 'TPL_SO_DO', name: 'Sổ đỏ gốc', source_label: 'Khách hàng cung cấp', is_active: true },
  { id: 'TPL_BAN_KY_THUAT_GOC', name: 'Bản kỹ thuật gốc', source_label: 'Công ty soạn/lập', is_active: true },
  { id: 'TPL_ANH_HIEN_TRANG', name: 'Ảnh hiện trạng', source_label: 'Công ty soạn/lập', is_active: true },
  { id: 'TPL_BIEN_NHAN', name: 'Biên nhận hồ sơ', source_label: 'Cơ quan Nhà nước trả', is_active: true },
];

// Panel checklist chỉ hiện khi đã chọn Node. Dùng targetNodeKey — đúng cơ chế
// component cung cấp để mở sẵn một Node, thay vì giả lập cú bấm trên canvas.
function renderWithDocs(serviceLineOptions = {}, docs = DOC_TEMPLATES) {
  return render(
    <ContractWorkflowDesigner
      serviceLine={makeServiceLine({ nodeReady: true, ...serviceLineOptions })}
      workItems={[workItem]}
      documentTemplates={docs}
      capabilities={{
        amend_workflow: true,
        review_workflow_node: true,
        review_workflow_checklist: true,
        view_workflow_compensation: true,
        manage_workflow_compensation: true,
      }}
      addToast={vi.fn()}
      targetNodeKey="node-1"
      targetType="checklist_review"
      targetNonce={1}
    />
  );
}

async function moPanelChecklist() {
  return screen.findByRole('button', { name: /Thêm giấy tờ đầu ra/ });
}

describe('Cấu hình tài liệu đầu ra của checklist', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('checklist chưa cấu hình tài liệu đầu ra thì chỉ hiện nút thêm gọn gàng', async () => {
    renderWithDocs();
    expect(await moPanelChecklist()).toBeInTheDocument();
    expect(screen.queryByText('Tài liệu chưa chọn')).not.toBeInTheDocument();
    expect(screen.queryByText('Tối thiểu')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Bỏ yêu cầu minh chứng')).not.toBeInTheDocument();
  });

  it('chọn rồi xoá một loại tài liệu đầu ra bằng modal giữa màn hình', async () => {
    renderWithDocs();
    await moPanelChecklist();
    fireEvent.click(await screen.findByRole('button', { name: /Thêm giấy tờ đầu ra/ }));
    expect(screen.getByRole('dialog', { name: /Chọn tài liệu đầu ra/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Bản kỹ thuật gốc/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Xong' }));

    expect(await screen.findByText('Bản kỹ thuật gốc')).toBeInTheDocument();
    expect(screen.getByLabelText(/bắt buộc/)).toBeChecked();
    // Một loại giấy gồm bao nhiêu file là do nhân viên nộp, nên KHÔNG còn ô Số
    // lượng; mọi giấy đều phải qua Giám đốc nên cũng không còn ô bật/tắt việc đó.
    expect(screen.queryByLabelText(/Số lượng/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Cần Giám đốc duyệt/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Bỏ Bản kỹ thuật gốc'));
    await waitFor(() => expect(screen.queryByTitle('Bỏ Bản kỹ thuật gốc')).not.toBeInTheDocument());
    // Xoá hết thì quay lại đúng trạng thái ban đầu.
    expect(screen.getByRole('button', { name: /Thêm giấy tờ đầu ra/ })).toBeInTheDocument();
  });

  it('modal chọn tài liệu đầu ra chia rõ ba nguồn giấy tờ', async () => {
    renderWithDocs();
    await moPanelChecklist();
    fireEvent.click(await screen.findByRole('button', { name: /Thêm giấy tờ đầu ra/ }));

    const dialog = screen.getByRole('dialog', { name: /Chọn tài liệu đầu ra/ });
    expect(within(dialog).getByRole('heading', { name: /Khách hàng cung cấp/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /Công ty soạn\/lập/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /Cơ quan nhà nước trả/ })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('option', { name: /Sổ đỏ gốc/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xong' }));
    expect(await screen.findByText('Sổ đỏ gốc')).toBeInTheDocument();
  });

  it('hiển thị đủ mọi loại giấy, gồm đúng hai giấy cứng khách hàng cung cấp, trong vùng cuộn chính', async () => {
    const docs = [
      ...DOC_TEMPLATES,
      { id: 'TPL_CCCD', name: 'CCCD/CMND của chủ sử dụng đất', source_label: 'Khách hàng cung cấp', is_active: true },
      { id: 'TPL_HON_NHAN', name: 'Giấy tờ hôn nhân', source_label: 'Khách hàng cung cấp', is_active: true },
      { id: 'TPL_TOA_DO', name: 'Tọa độ GPS', source_label: 'Công ty soạn/lập', is_active: true },
      { id: 'TPL_KET_QUA', name: 'Kết quả giải quyết hồ sơ', source_label: 'Cơ quan Nhà nước trả', is_active: true },
    ];
    renderWithDocs({}, docs);
    await moPanelChecklist();
    fireEvent.click(await screen.findByRole('button', { name: /Thêm giấy tờ đầu ra/ }));

    const dialog = screen.getByRole('dialog', { name: /Chọn tài liệu đầu ra/ });
    expect(dialog.querySelector('.wcl-output-modal__group--khach-hang .wcl-output-modal__group-count'))
      .toHaveTextContent('2 loại');
    expect(within(dialog).getByRole('option', { name: /Sổ đỏ gốc/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: /CCCD\/CMND/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('option', { name: /Giấy tờ hôn nhân/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: /Tọa độ GPS/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: /Kết quả giải quyết hồ sơ/ })).toBeInTheDocument();
    expect(document.querySelector('.workflow-output-documents-modal .modal-body'))
      .toBeInTheDocument();
  });

  it('dữ liệu cũ còn cờ Cần Giám đốc duyệt mà người duyệt khác admin thì vẫn cảnh báo', async () => {
    // Giao diện không còn bật/tắt cờ này, nhưng hồ sơ cũ vẫn mang nó và backend
    // vẫn từ chối lưu — cảnh báo phải còn, nếu không Giám đốc lưu mới biết hỏng.
    renderWithDocs({
      outputDocs: [{ template_id: 'TPL_BAN_KY_THUAT_GOC', needs_director_approval: true }],
    });
    await moPanelChecklist();
    fireEvent.click(screen.getByRole('button', { name: /Người duyệt: Giám đốc/ }));
    fireEvent.click(within(document.querySelector('.wcl-picker__menu'))
      .getByRole('option', { name: /Kế toán/ }));

    const canhBao = await screen.findByRole('alert');
    expect(canhBao).toHaveTextContent(/Cần Giám đốc duyệt nhưng người duyệt đang là/);
    expect(canhBao).toHaveTextContent(/lưu quy trình sẽ bị từ chối/);
  });

  it('hiển thị gói khoán bằng dropdown cùng ngôn ngữ chip', async () => {
    renderWithDocs();
    await moPanelChecklist();

    expect(screen.getByRole('button', { name: /Gói khoán: Nghiệm thu hồ sơ/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Gói khoán: Nghiệm thu hồ sơ/ }));

    const option = screen.getByRole('option', { name: /Nghiệm thu hồ sơ/ });
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Chính:/)).toHaveTextContent('150.000đ');
  });
});

// Lỗi thật đã gặp: ELK được khai node cao 168px trong khi node dựng ra chỉ cao
// 109px, nên mọi tuyến đã lưu bị vẽ thấp hơn chấm nối đúng 29,5px. Người dùng
// nhìn thấy đường nối chạy hụt phía dưới card.
describe('neoTuyenVaoHandle — đường nối phải dính vào chấm nối', () => {
  it('kéo tuyến ELK lệch xuống về đúng tâm handle và giữ đường thẳng', () => {
    // ELK: node y=190, cao 168 -> cổng ở y=274. Handle thật ở y=244,5.
    const tuyenElk = [{ x: 338, y: 274 }, { x: 390, y: 274 }];
    const daNeo = neoTuyenVaoHandle(tuyenElk, 344, 244.5, 390, 244.5);

    expect(daNeo[0]).toEqual({ x: 344, y: 244.5 });
    expect(daNeo[daNeo.length - 1]).toEqual({ x: 390, y: 244.5 });
    // Vẫn phải là một đường ngang, không được thành đường xiên.
    expect(new Set(daNeo.map(p => p.y)).size).toBe(1);
  });

  it('dịch cả điểm gãy nên tuyến gấp khúc không bị méo', () => {
    // Tuyến chữ Z: ra phải, đi xuống, vào trái. Lệch đều 30px xuống dưới.
    const tuyenElk = [
      { x: 100, y: 130 },
      { x: 150, y: 130 },
      { x: 150, y: 230 },
      { x: 200, y: 230 },
    ];
    const daNeo = neoTuyenVaoHandle(tuyenElk, 100, 100, 200, 200);

    expect(daNeo[0]).toEqual({ x: 100, y: 100 });
    expect(daNeo[3]).toEqual({ x: 200, y: 200 });
    // Hai điểm gãy giữ nguyên x, chỉ tụt lên 30px cùng hai đầu.
    expect(daNeo[1]).toEqual({ x: 150, y: 100 });
    expect(daNeo[2]).toEqual({ x: 150, y: 200 });
  });

  it('tuyến đã khớp handle thì giữ nguyên, không đụng vào', () => {
    const tuyen = [{ x: 10, y: 20 }, { x: 60, y: 20 }];
    expect(neoTuyenVaoHandle(tuyen, 10, 20, 60, 20)).toBe(tuyen);
  });

  it('thiếu toạ độ handle thì trả nguyên tuyến chứ không sinh NaN', () => {
    const tuyen = [{ x: 10, y: 20 }, { x: 60, y: 20 }];
    expect(neoTuyenVaoHandle(tuyen, undefined, 20, 60, 20)).toBe(tuyen);
    expect(neoTuyenVaoHandle(tuyen, NaN, 20, 60, 20)).toBe(tuyen);
  });

  it('tuyến rỗng hoặc chỉ một điểm thì bỏ qua', () => {
    expect(neoTuyenVaoHandle([], 0, 0, 1, 1)).toEqual([]);
    expect(neoTuyenVaoHandle(null, 0, 0, 1, 1)).toBeNull();
  });
});

describe('WorkflowEdge — nối dây từ tuyến đã lưu tới nét vẽ', () => {
  afterEach(() => { duongDaVe.length = 0; });

  it('vẽ theo tuyến ĐÃ NEO chứ không theo toạ độ ELK thô', () => {
    render(
      <WorkflowEdge
        id="k01:COMPLETED:k02:0"
        data={{ layoutPoints: [{ x: 338, y: 274 }, { x: 390, y: 274 }] }}
        sourceX={344}
        sourceY={244.5}
        targetX={390}
        targetY={244.5}
      />,
    );

    expect(duongDaVe).toHaveLength(1);
    const { path } = duongDaVe[0];
    // Nét vẽ phải bắt đầu và kết thúc đúng tâm chấm nối.
    expect(path).toBe('M 344 244.5 L 390 244.5');
    // Và tuyệt đối không được còn dấu vết của y=274 mà ELK đưa ra.
    expect(path).not.toContain('274');
  });

  it('nhãn giữa tuyến cũng bám theo tuyến đã neo', () => {
    render(
      <WorkflowEdge
        id="e1"
        data={{ layoutPoints: [{ x: 0, y: 100 }, { x: 100, y: 100 }] }}
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={0}
      />,
    );

    expect(duongDaVe[0].labelY).toBe(0);
  });
});


describe('Panel chi tiết Node — bố cục', () => {
  afterEach(cleanup);

  it('K06 hiện thanh tiền đã thu trên tổng hợp đồng', () => {
    renderDesigner({ taskCode: 'K06', contractTotalValue: 12300000, contractPaidAmount: 1230000 });

    expect(document.querySelector('.wf-node-money__text'))
      .toHaveTextContent('1.230.000/12.300.000 VND');
  });

  it('Node không phải K06 thì KHÔNG có thanh tiền', () => {
    // Một thanh luôn bằng 0 ở mọi bước chỉ làm nhiễu, và tệ hơn là gợi ý sai
    // rằng bước đó có dính tiền.
    renderDesigner({ taskCode: 'K01', contractTotalValue: 12300000, contractPaidAmount: 0 });

    expect(document.querySelector('.wf-node-money')).not.toBeInTheDocument();
  });

  it('cấu hình nằm ở vùng cố định, checklist nằm ở vùng cuộn riêng', () => {
    // Cả panel cuộn chung thì kéo tới checklist là mất luôn phòng ban / vai trò
    // / thời lượng đang cần đối chiếu.
    renderDesigner({ nodeReady: true });

    const fixed = document.querySelector('.wf-node-panel__fixed');
    const scroll = document.querySelector('.wf-node-panel__scroll');

    expect(fixed).toContainElement(document.querySelector('.wf-node-grid'));
    expect(scroll).toContainElement(document.querySelector('.workflow-checklist-card'));
    expect(fixed).not.toContainElement(document.querySelector('.workflow-checklist-card'));

    // Dải "danh sách checklist" phải nằm NGOÀI vùng cuộn: để bên trong thì kéo
    // sắp xếp card là dải tiêu đề trôi theo thứ nó đang gắn nhãn.
    expect(scroll).not.toContainElement(document.querySelector('.wcl-section-head'));
  });

  it('Nạp mẫu kéo theo đúng loại giấy Master Data đã gán cho bước', () => {
    // Nạp mẫu mà checklist vẫn trắng giấy thì Giám đốc phải tự thêm lại từng
    // tờ — đúng thứ Master Data đã khai sẵn ở màn Mẫu Giấy Tờ.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const docs = [
      {
        id: 'TPL_SO_DO', name: 'Sổ đỏ gốc', source_label: 'Khách hàng cung cấp',
        is_active: true, is_required: true, default_quantity: 2,
        applicabilities: [{ node_code: 'K01' }],
      },
      {
        id: 'TPL_BIEN_NHAN', name: 'Biên nhận hồ sơ', source_label: 'Cơ quan Nhà nước trả',
        is_active: true, applicabilities: [{ node_code: 'K05b' }],
      },
      // Gói KHÁC cũng gán loại này cho K01. Danh mục mẫu là của toàn hệ thống
      // nên nó vẫn nằm đây, nhưng hạng mục đang mở không dùng — lọc thẳng danh
      // mục theo node sẽ kéo nhầm nó về, đúng lỗi "K01 có 5 giấy mà nạp 16".
      {
        id: 'TPL_GOI_KHAC', name: 'Giấy của gói khác', source_label: 'Công ty soạn/lập',
        is_active: true, applicabilities: [{ node_code: 'K01' }],
      },
    ];
    render(
      <ContractWorkflowDesigner
        serviceLine={makeServiceLine({ nodeReady: true })}
        workItems={[workItem]}
        documentTemplates={docs}
        // Sổ giấy tờ của CHÍNH hạng mục này — đã lọc theo Gói + Hạng mục.
        plannedNodeByTemplate={{ TPL_SO_DO: 'K01', TPL_BIEN_NHAN: 'K05b' }}
        catalog={[{ code: 'K01', name: 'Nghiệm thu', checklist_template: [{ name: 'Kiểm tra đầu vào' }] }]}
        capabilities={{ amend_workflow: true, review_workflow_node: true, review_workflow_checklist: true }}
        addToast={vi.fn()}
        targetNodeKey="node-1"
        targetType="checklist_review"
        targetNonce={1}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Nạp checklist mẫu/ }));

    expect(screen.getByText('Sổ đỏ gốc')).toBeInTheDocument();
    // Bước khác, và giấy gói khác gán cho cùng K01, đều KHÔNG được lọt vào.
    expect(screen.queryByText('Biên nhận hồ sơ')).not.toBeInTheDocument();
    expect(screen.queryByText('Giấy của gói khác')).not.toBeInTheDocument();
  });

  it('menu chọn neo cố định để không bị vùng cuộn checklist cắt', () => {
    // Menu nằm trong .wf-node-panel__scroll (overflow-y:auto) nên nếu để
    // position:absolute thì bị cắt — trước đây "chữa" bằng cách bắt menu gói
    // khoán mở ngược lên, che mất tên checklist.
    renderWithDocs();

    const trigger = screen.getAllByRole('button', { name: /Người duyệt|Giám đốc/ })[0];
    fireEvent.click(trigger);

    const menu = document.querySelector('.wcl-picker__menu');
    expect(menu).toBeInTheDocument();
    expect(menu.style.position).toBe('fixed');
  });

  it('badge trên card đếm số giấy đầu ra, không đếm thứ khác', () => {
    renderDesigner({ nodeReady: true });

    // Checklist của harness chưa gán giấy đầu ra nào.
    expect(document.querySelector('.wcl-count')).toHaveTextContent('0');
  });
});

describe('Ô chọn tài liệu đầu ra lấy từ SỔ của hạng mục', () => {
  afterEach(() => {
    cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals();
    // apiFetch nhớ kết quả GET vài giây, và designer đọc thẳng cache đó lúc
    // dựng state. Hai khối test dùng CÙNG url sổ nên không dọn là khối sau
    // nhận payload của khối trước — xanh/đỏ theo thứ tự chạy.
    clearApiCache();
  });

  // Sổ giấy tờ của CHÍNH hạng mục này — đã lọc theo bốn trục Gói → Hạng mục →
  // Node → Loại giấy. Khác hẳn danh mục mẫu toàn hệ thống ở DOC_TEMPLATES.
  const SO_HANG_MUC = {
    planned_node_by_template: {},
    groups: [
      {
        source: 'KHACH_HANG',
        label: 'Khách hàng cung cấp',
        slots: [
          { id: 'S1', template_id: 'TPL_SO_DO', name: 'Sổ đỏ gốc',
            source_label: 'Khách hàng cung cấp', needs_original: true },
        ],
      },
      {
        source: 'CONG_TY',
        label: 'Công ty soạn/lập',
        slots: [
          { id: 'S2', template_id: 'TPL_BAN_KY_THUAT_GOC', name: 'Bản kỹ thuật gốc',
            source_label: 'Công ty soạn/lập', needs_original: false },
          // Ô TỰ THÊM: không có template_id nên không khai làm đầu ra được.
          { id: 'S3', template_id: null, name: 'Giấy phát sinh tự thêm',
            source_label: 'Công ty soạn/lập', needs_original: false },
        ],
      },
    ],
  };

  function renderCoSo() {
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(new Response(
      JSON.stringify(String(url).includes('/document-register/register') ? SO_HANG_MUC : {}),
      { status: 200 },
    ))));
    return render(
      <ContractWorkflowDesigner
        serviceLine={makeServiceLine({ nodeReady: true })}
        contractId="001/BK-2026"
        workItems={[workItem]}
        documentTemplates={DOC_TEMPLATES}
        capabilities={{ amend_workflow: true, review_workflow_checklist: true }}
        addToast={vi.fn()}
        targetNodeKey="node-1"
        targetType="checklist_review"
        targetNonce={1}
      />
    );
  }

  it('chỉ bày loại giấy CÓ trong sổ của hạng mục này', async () => {
    renderCoSo();
    fireEvent.click(await screen.findByRole('button', { name: /Thêm giấy tờ đầu ra/ }));
    const dialog = await screen.findByRole('dialog', { name: /Chọn tài liệu đầu ra/ });

    await waitFor(() =>
      expect(within(dialog).getByRole('option', { name: /Sổ đỏ gốc/ })).toBeInTheDocument());
    expect(within(dialog).getByRole('option', { name: /Bản kỹ thuật gốc/ })).toBeInTheDocument();
  });

  it('KHÔNG bày loại giấy chỉ có trong danh mục toàn hệ thống', async () => {
    renderCoSo();
    fireEvent.click(await screen.findByRole('button', { name: /Thêm giấy tờ đầu ra/ }));
    const dialog = await screen.findByRole('dialog', { name: /Chọn tài liệu đầu ra/ });
    await waitFor(() =>
      expect(within(dialog).getByRole('option', { name: /Sổ đỏ gốc/ })).toBeInTheDocument());

    // "Ảnh hiện trạng" và "Biên nhận hồ sơ" nằm trong DOC_TEMPLATES nhưng KHÔNG
    // có trong sổ của hạng mục này. Bày chúng ra là mời Giám đốc khai một tờ mà
    // sổ hồ sơ không bao giờ có ô để chứa.
    expect(within(dialog).queryByRole('option', { name: /Ảnh hiện trạng/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('option', { name: /Biên nhận hồ sơ/ })).not.toBeInTheDocument();
  });

  it('ô tự thêm không có loại giấy thì không khai làm đầu ra được', async () => {
    renderCoSo();
    fireEvent.click(await screen.findByRole('button', { name: /Thêm giấy tờ đầu ra/ }));
    const dialog = await screen.findByRole('dialog', { name: /Chọn tài liệu đầu ra/ });
    await waitFor(() =>
      expect(within(dialog).getByRole('option', { name: /Sổ đỏ gốc/ })).toBeInTheDocument());

    // output_documents khoá theo LOẠI giấy, không theo ô — ô không có loại thì
    // chọn xong cũng không lưu được vào đâu.
    expect(within(dialog).queryByRole('option', { name: /Giấy phát sinh tự thêm/ }))
      .not.toBeInTheDocument();
  });

  it('nhóm giữ đúng nhãn của sổ, không đặt lại tên', async () => {
    renderCoSo();
    fireEvent.click(await screen.findByRole('button', { name: /Thêm giấy tờ đầu ra/ }));
    const dialog = await screen.findByRole('dialog', { name: /Chọn tài liệu đầu ra/ });

    await waitFor(() =>
      expect(within(dialog).getByRole('heading', { name: /Khách hàng cung cấp/ })).toBeInTheDocument());
    expect(within(dialog).getByRole('heading', { name: /Công ty soạn\/lập/ })).toBeInTheDocument();
    // Sổ hạng mục này không có giấy cơ quan trả — nhóm rỗng thì ẩn hẳn.
    expect(within(dialog).queryByRole('heading', { name: /Cơ quan nhà nước/ })).not.toBeInTheDocument();
  });
});

describe('Ô chọn tài liệu đầu ra nói RÕ loại giấy đang nằm ở bước nào', () => {
  afterEach(() => {
    cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals();
    // apiFetch nhớ kết quả GET vài giây, và designer đọc thẳng cache đó lúc
    // dựng state. Hai khối test dùng CÙNG url sổ nên không dọn là khối sau
    // nhận payload của khối trước — xanh/đỏ theo thứ tự chạy.
    clearApiCache();
  });

  // Hai bước: K02 đã gán "Bản kỹ thuật gốc", K03 là bước đang mở picker.
  // Không có graph hai bước thì không dựng được đúng ca người dùng phàn nàn:
  // mở checklist sau thấy y hệt câu "đã dùng ở checklist khác" nên tưởng chưa gán.
  const hangMucHaiBuoc = () => {
    const k02 = {
      task_code: 'K02',
      name: 'Khảo sát',
      pool_department_code: 'SURVEY',
      claim_roles: ['MAIN'],
      checklist: [{
        key: 'c-k02',
        name: 'Đo hiện trường',
        required: true,
        output_documents: [{ template_id: 'TPL_BAN_KY_THUAT_GOC', min_count: 1 }],
        compensation: { is_payable: false },
      }],
      transitions: { pass: 'node-2' },
    };
    const k03 = {
      task_code: 'K03',
      name: 'Chuẩn hoá',
      pool_department_code: 'SURVEY',
      claim_roles: ['MAIN'],
      checklist: [{ key: 'c-k03', name: 'Chuẩn hoá bản vẽ', required: true, compensation: { is_payable: false } }],
      transitions: {},
    };
    return {
      id: 'line-1',
      workflow: {
        status: 'active',
        active_revision_id: null,
        revision_status: null,
        graph: { start_node: 'node-1', nodes: { 'node-1': k02, 'node-2': k03 }, ui: {} },
        active_graph: null,
        execution_nodes: [
          { id: 'task-1', node_key: 'node-1', node_code: 'K02', status: 'ready', checklist_results: [] },
          { id: 'task-2', node_key: 'node-2', node_code: 'K03', status: 'ready', checklist_results: [] },
        ],
      },
    };
  };

  const SO = {
    // Master data xếp "Ảnh hiện trạng" ở K05a — loại chưa gán vào bước nào.
    planned_node_by_template: { TPL_ANH_HIEN_TRANG: 'K05a' },
    groups: [{
      source: 'CONG_TY',
      label: 'Công ty soạn/lập',
      slots: [
        { id: 'S1', template_id: 'TPL_BAN_KY_THUAT_GOC', name: 'Bản kỹ thuật gốc',
          source_label: 'Công ty soạn/lập', needs_original: false },
        { id: 'S2', template_id: 'TPL_ANH_HIEN_TRANG', name: 'Ảnh hiện trạng',
          source_label: 'Công ty soạn/lập', needs_original: false },
        { id: 'S3', template_id: 'TPL_BIEN_NHAN', name: 'Biên nhận hồ sơ',
          source_label: 'Công ty soạn/lập', needs_original: false },
      ],
    }],
  };

  async function moPickerCuaK03() {
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(new Response(
      JSON.stringify(String(url).includes('/document-register/register') ? SO : {}),
      { status: 200 },
    ))));
    render(
      <ContractWorkflowDesigner
        serviceLine={hangMucHaiBuoc()}
        contractId="001/BK-2026"
        workItems={[workItem]}
        documentTemplates={DOC_TEMPLATES}
        capabilities={{ amend_workflow: true, review_workflow_checklist: true }}
        addToast={vi.fn()}
        targetNodeKey="node-2"
        targetType="checklist_review"
        targetNonce={1}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: /Thêm giấy tờ đầu ra/ }));
    const dialog = await screen.findByRole('dialog', { name: /Chọn tài liệu đầu ra/ });
    await waitFor(() =>
      expect(within(dialog).getByRole('option', { name: /Bản kỹ thuật gốc/ })).toBeInTheDocument());
    return dialog;
  }

  it('loại giấy đã gán ở bước khác thì NÊU ĐÍCH DANH bước đó', async () => {
    const dialog = await moPickerCuaK03();

    // "đã dùng ở checklist khác" là câu vô dụng: mở checklist nào cũng thấy y hệt.
    const o = within(dialog).getByRole('option', { name: /Bản kỹ thuật gốc/ });
    expect(o).toHaveTextContent(/Đang ở K02 · Đo hiện trường/);
    expect(o).not.toHaveTextContent('đã dùng ở checklist khác');
  });

  it('loại giấy chưa gán thì nói master data xếp nó ở bước nào', async () => {
    const dialog = await moPickerCuaK03();

    // Tủ hồ sơ đã phân giấy theo bước rất rõ — picker phải nói được cùng con số đó.
    expect(within(dialog).getByRole('option', { name: /Ảnh hiện trạng/ }))
      .toHaveTextContent(/master data xếp ở K05A/i);
  });

  it('loại giấy không thuộc bước nào thì nói thẳng là chưa gán', async () => {
    const dialog = await moPickerCuaK03();
    expect(within(dialog).getByRole('option', { name: /Biên nhận hồ sơ/ }))
      .toHaveTextContent(/Chưa gán vào bước nào/);
  });

  it('chọn vào checklist đang mở thì đổi sang "đã chọn ở checklist này"', async () => {
    const dialog = await moPickerCuaK03();
    fireEvent.click(within(dialog).getByRole('option', { name: /Biên nhận hồ sơ/ }));

    // Ở checklist NÀY và ở bước KHÁC là hai chuyện khác hẳn — gộp làm một câu
    // "đã dùng" thì người ta không biết mình vừa làm gì.
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Biên nhận hồ sơ/ }))
      .toHaveTextContent(/Đã chọn ở checklist này/));
  });
});

describe('Giấy chưa gán vào bước nào chỉ CẢNH BÁO, không chặn kích hoạt', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); clearApiCache(); });

  // Máy chủ trả 409 kèm readiness. Từ nay giấy thiếu nằm ở `warnings` và
  // requires_confirmation = true — không còn `blockers`.
  const READINESS = {
    code: 'ACTIVATION_CONFIRMATION_REQUIRED',
    message: '2 loại giấy trong bộ chuẩn của gói chưa gán vào bước nào. '
      + 'Quy trình này không cần tới chúng thì bỏ qua được. '
      + '1 bước chưa gắn khoán — nhân viên làm các bước đó sẽ không có tiền khoán.',
    blockers: [],
    requires_confirmation: true,
    warnings: [
      { code: 'MISSING_PIECE_RATE_MAPPING', node_key: 'node-1', node_name: 'K02 · Khảo sát' },
      { code: 'MANDATORY_OUTPUT_UNALLOCATED', template_id: 'TPL_HON_NHAN',
        template_name: 'Giấy tờ hôn nhân' },
      { code: 'MANDATORY_OUTPUT_UNALLOCATED', template_id: 'TPL_CU_TRU',
        template_name: 'Giấy xác nhận thông tin cư trú' },
    ],
  };

  async function bamKichHoat() {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).includes('/activate')) {
        return Promise.resolve(new Response(JSON.stringify({ detail: READINESS }), { status: 409 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    }));
    render(
      <ContractWorkflowDesigner
        serviceLine={makeServiceLine({ nodeReady: true })}
        workItems={[workItem]}
        documentTemplates={DOC_TEMPLATES}
        capabilities={{ amend_workflow: true }}
        addToast={vi.fn()}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: /Kích hoạt/ }));
    // Hộp xác nhận có nút trùng tên với nút trên thanh công cụ — trỏ theo lớp
    // của chính nút trong hộp, không trỏ theo tên.
    const nutXacNhan = await waitFor(() => {
      const nut = document.querySelector('.workflow-activation-confirm');
      expect(nut).toBeTruthy();
      return nut;
    });
    fireEvent.click(nutXacNhan);
  }

  it('vẫn cho kích hoạt — không phải hộp thoại chỉ có nút Đóng', async () => {
    await bamKichHoat();

    // Bộ chuẩn của gói là GỢI Ý. Một hợp đồng chỉ thuê đo vẽ rồi nhận bản vẽ có
    // quyền không dùng giấy pháp lý — chặn cứng là bắt dựng thêm bước chỉ để
    // thoả một danh sách.
    expect(await screen.findByRole('button', { name: /Vẫn kích hoạt/ })).toBeInTheDocument();
  });

  it('tách hai loại cảnh báo, mỗi loại một tiêu đề riêng', async () => {
    await bamKichHoat();
    await screen.findByRole('button', { name: /Vẫn kích hoạt/ });

    // Thiếu khoán là nhân viên mất tiền thật; thiếu giấy có thể chỉ vì quy trình
    // không cần. Gộp một danh sách thì người đọc không biết cái nào đáng lo.
    expect(screen.getByText(/sẽ không nhận khoán/)).toBeInTheDocument();
    expect(screen.getByText(/2 loại giấy chưa gán vào bước nào/)).toBeInTheDocument();
    expect(screen.getByText('K02 · Khảo sát')).toBeInTheDocument();
    expect(screen.getByText('Giấy tờ hôn nhân')).toBeInTheDocument();
  });

  it('bấm Vẫn kích hoạt thì gửi lại kèm cờ xác nhận', async () => {
    await bamKichHoat();
    fireEvent.click(await screen.findByRole('button', { name: /Vẫn kích hoạt/ }));

    await waitFor(() => {
      const lanCuoi = goiToi(globalThis.fetch, '/activate').at(-1);
      expect(JSON.parse(lanCuoi[1].body).confirm_warnings).toBe(true);
    });
  });
});
