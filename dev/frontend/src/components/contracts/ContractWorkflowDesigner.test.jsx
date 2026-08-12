import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ContractWorkflowDesigner from './ContractWorkflowDesigner';

vi.mock('@xyflow/react', () => ({
  addEdge: (_connection, edges) => edges,
  Background: () => null,
  BaseEdge: () => null,
  Controls: () => null,
  Handle: () => null,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  MiniMap: () => null,
  Position: { Left: 'left', Right: 'right' },
  ReactFlow: ({ children }) => <div>{children}</div>,
  getSmoothStepPath: () => ['', 0, 0],
  useEdgesState: initial => {
    const [edges, setEdges] = React.useState(initial);
    return [edges, setEdges, vi.fn()];
  },
  useNodesState: initial => {
    const [nodes, setNodes] = React.useState(initial);
    return [nodes, setNodes, vi.fn()];
  },
}));

const workItem = {
  id: 'work-1',
  name: 'Nghiệm thu hồ sơ',
  rates: [{ role_code: 'MAIN', amount: 150000 }],
};

function makeServiceLine({ active = false, changedActiveNode = false } = {}) {
  const node = {
    task_code: 'K01',
    name: changedActiveNode ? 'Bản sửa Node' : 'Nghiệm thu',
    description: '',
    checklist: [{
      key: 'check-1',
      name: 'Biên bản nghiệm thu',
      required: true,
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
      }] : [{
        id: 'task-1', node_key: 'node-1', node_code: 'K01', status: 'submitted', pending_acceptance_id: 'acceptance-1',
      }],
    },
  };
}

function renderDesigner(options) {
  return render(
    <ContractWorkflowDesigner
      serviceLine={makeServiceLine(options)}
      workItems={[workItem]}
      capabilities={{ amend_workflow: true, review_workflow_node: true }}
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
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Xác nhận kích hoạt quy trình' })).getByRole('button', { name: /^kích hoạt$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/contracts/workflow/line-1/activate');
  });

  it('keeps the final high-risk confirmation separate after the activation modal', () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal('prompt', vi.fn(() => 'Cập nhật phân công'));
    vi.stubGlobal('confirm', confirmMock);
    renderDesigner({ active: true, changedActiveNode: true });

    fireEvent.click(getToolbarAction('áp dụng'));
    expect(confirmMock).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Xác nhận kích hoạt quy trình' })).getByRole('button', { name: /^kích hoạt$/i }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('Cảnh báo: bản sửa đổi đang tác động tới'));
  });
});
