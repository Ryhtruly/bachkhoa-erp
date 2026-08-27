import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ContractWorkflowDesigner, { WorkflowEdge } from './ContractWorkflowDesigner';
import { neoTuyenVaoHandle } from './workflowEdgeRouting';

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
} = {}) {
  const node = {
    task_code: 'K01',
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
        id: 'task-1', node_key: 'node-1', node_code: 'K01', status: 'in_progress',
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
        }] : [],
      }] : [{
        id: 'task-1', node_key: 'node-1', node_code: 'K01',
        status: nodeReady ? 'ready' : 'submitted',
        ...(nodeReady ? {} : { pending_acceptance_id: 'acceptance-1' }),
      }],
    },
  };
}

function renderDesigner(options) {
  return render(
    <ContractWorkflowDesigner
      serviceLine={makeServiceLine(options)}
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

  it('keeps the node description in the detail editor but hides it from the compact card', () => {
    const description = 'Nội dung nghiệm thu chỉ xem trong bảng chi tiết';
    renderDesigner({ description });

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

  it('renders a private workflow evidence object key as an actionable link', () => {
    renderDesigner({ active: true, privateEvidence: true });
    fireEvent.click(screen.getByRole('button', { name: 'Checklist' }));

    expect(screen.getByRole('link', { name: /bien-ban\.pdf/i })).toBeInTheDocument();
  });

  it('duyệt nhanh minh chứng ngay trong hộp Chờ duyệt cố định', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ status: 'success' }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    renderDesigner({ active: true, pendingChecklistReview: true });

    fireEvent.click(screen.getByRole('button', { name: /Chờ duyệt/ }));
    expect(screen.getByRole('link', { name: /bien-ban\.pdf/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt đạt' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/contracts/workflow/checklist/result-1/review',
      expect.objectContaining({ method: 'POST' }),
    ));
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
  return screen.findByRole('button', { name: /Thêm tài liệu đầu ra/ });
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
    fireEvent.click(await screen.findByRole('button', { name: /Thêm tài liệu đầu ra/ }));
    expect(screen.getByRole('dialog', { name: /Chọn tài liệu đầu ra/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Bản kỹ thuật gốc/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Xong' }));

    expect(await screen.findByText('Bản kỹ thuật gốc')).toBeInTheDocument();
    expect(screen.getByLabelText(/Số lượng Bản kỹ thuật gốc/)).toHaveValue(1);
    expect(screen.getByLabelText(/Bắt buộc trước khi nộp/)).toBeChecked();
    expect(screen.getByLabelText(/Cần Giám đốc duyệt/)).not.toBeChecked();

    fireEvent.click(screen.getByTitle('Bỏ Bản kỹ thuật gốc'));
    await waitFor(() => expect(screen.queryByTitle('Bỏ Bản kỹ thuật gốc')).not.toBeInTheDocument());
    // Xoá hết thì quay lại đúng trạng thái ban đầu.
    expect(screen.getByRole('button', { name: /Thêm tài liệu đầu ra/ })).toBeInTheDocument();
  });

  it('modal chọn tài liệu đầu ra chia rõ ba nguồn giấy tờ', async () => {
    renderWithDocs();
    await moPanelChecklist();
    fireEvent.click(await screen.findByRole('button', { name: /Thêm tài liệu đầu ra/ }));

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
    fireEvent.click(await screen.findByRole('button', { name: /Thêm tài liệu đầu ra/ }));

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

  it('bật Cần Giám đốc duyệt mà người duyệt khác admin thì cảnh báo rõ ràng', async () => {
    renderWithDocs();
    await moPanelChecklist();
    fireEvent.click(screen.getByRole('button', { name: /Người duyệt: Giám đốc/ }));
    fireEvent.click(screen.getByRole('option', { name: /Kế toán/ }));

    fireEvent.click(await screen.findByRole('button', { name: /Thêm tài liệu đầu ra/ }));
    fireEvent.click(screen.getByRole('option', { name: /Bản kỹ thuật gốc/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Xong' }));

    fireEvent.click(screen.getByLabelText(/Cần Giám đốc duyệt/));

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
