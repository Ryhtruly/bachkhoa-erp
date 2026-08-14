import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  Background,
  BaseEdge,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  getSmoothStepPath,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import {
  AlignHorizontalSpaceAround,
  Ban,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileCheck2,
  FolderOpen,
  GitBranch,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Play,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  UserPlus,
  UserRoundCog,
  X,
  XCircle,
} from 'lucide-react';
import Modal from '../ui/Modal';
import { apiFetch } from '../../lib/api';
import AvatarImage from '../AvatarImage';
import {
  DEFAULT_WORKFLOW_LABELS,
  WORKFLOW_NODE_STATUS_LABELS,
  WORKFLOW_OUTCOME_LABELS,
} from './workflowLabels';
import {
  createChecklistDefinition,
  removeChecklistDefinition,
} from './workflowChecklistState';
import HandoverPanel from '../../features/handover/HandoverPanel';
import LegalDossierNodePanel from '../../features/legal-dossier/LegalDossierNodePanel';

function resolveWorkflowLabels(graph) {
  return {
    ...DEFAULT_WORKFLOW_LABELS,
    ...(graph?.labels || {}),
    outcomes: { ...WORKFLOW_OUTCOME_LABELS, ...(graph?.labels?.outcomes || {}) },
    node_statuses: { ...WORKFLOW_NODE_STATUS_LABELS, ...(graph?.labels?.node_statuses || {}) },
  };
}

const NODE_COLORS = {
  accepted: '#22a06b',
  in_progress: '#f59e0b',
  submitted: '#3b82f6',
  blocked: '#ef4444',
  rework_required: '#ef4444',
  ready: '#14b8a6',
  pending: '#94a3b8',
  cancelled: '#64748b',
};

const CANCELLATION_OPTIONS = [
  ['CUSTOMER_REQUEST', 'Khách hàng yêu cầu hủy'],
  ['DUPLICATE_OR_ERROR', 'Tạo nhầm hoặc trùng quy trình'],
  ['CONTRACT_TERMINATED', 'Chấm dứt hợp đồng/dịch vụ'],
  ['SCOPE_CHANGED', 'Thay đổi phạm vi dịch vụ'],
  ['OTHER', 'Lý do khác'],
];

const EMPTY_CATALOG = [];

const formatMoney = value => `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))}đ`;
const formatDateTime = value => value
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : '—';
const safeExternalUrl = value => {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
};

function WorkflowNode({ data, selected }) {
  const status = data.executionStatus || 'pending';
  const incomingHandles = data.incomingHandles?.length
    ? data.incomingHandles
    : [{ id: 'in:default' }];
  const outgoingHandles = data.outgoingHandles?.length
    ? data.outgoingHandles
    : [{ id: 'out:default' }];
  return (
    <div className={`workflow-node${selected ? ' workflow-node--selected' : ''}`}>
      {incomingHandles.map((handle, index) => (
        <Handle
          id={handle.id}
          key={handle.id}
          type="target"
          position={Position.Left}
          className="workflow-node__handle"
          style={{ top: `${((index + 1) / (incomingHandles.length + 1)) * 100}%` }}
        />
      ))}
      <div className="workflow-node__topline">
        <span className="workflow-node__code">{data.code}</span>
        <span
          className="workflow-node__status-dot"
          style={{ background: NODE_COLORS[status] || NODE_COLORS.pending }}
          title={data.executionStatusLabel || WORKFLOW_NODE_STATUS_LABELS[status] || 'Chưa xác định'}
        />
      </div>
      <strong>{data.label}</strong>
      <p>{data.description || 'Chưa có mô tả đầu ra nghiệm thu'}</p>
      <div className="workflow-node__meta">
        <span><ListChecks size={13} /> {data.checklist?.length || 0} mục</span>
        <span><UserRoundCog size={13} /> {data.assignments?.length ? `${data.assignments.length} người` : 'Chưa giao'}</span>
      </div>
      {data.deadlineAt && (
        <div className={`workflow-node__deadline${data.isOverdue ? ' is-overdue' : ''}`}>
          <Clock3 size={13} /> Hạn chung: {formatDateTime(data.deadlineAt)}
        </div>
      )}
      {Boolean(data.assignments?.length) && (
        <div className="workflow-node__avatars">
          {data.assignments.slice(0, 4).map((assignment, index) => {
            const name = assignment.full_name || 'Nhân viên';
            const role = roleLabel(assignment.role_code || 'MAIN');
            const tooltip = `${name} · ${role}`;
            return (
              <AvatarImage
                key={`${assignment.employee_id || name}-${index}`}
                className="workflow-node__avatar workflow-node__avatar--img"
                fallbackClassName="workflow-node__avatar"
                src={assignment.avatar_url}
                name={name}
                title={tooltip}
              />
            );
          })}
          {data.assignments.length > 4 && (
            <span className="workflow-node__avatar workflow-node__avatar--more" title={`+${data.assignments.length - 4} người khác`}>
              +{data.assignments.length - 4}
            </span>
          )}
        </div>
      )}
      {outgoingHandles.map((handle, index) => (
        <Handle
          id={handle.id}
          key={handle.id}
          type="source"
          position={Position.Right}
          className="workflow-node__handle"
          style={{ top: `${((index + 1) / (outgoingHandles.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}

const NODE_TYPES = { workflowNode: WorkflowNode };
const WORKFLOW_NODE_WIDTH = 248;
const WORKFLOW_NODE_HEIGHT = 168;
let elkInstancePromise;

function getElkInstance() {
  if (!elkInstancePromise) {
    elkInstancePromise = import('elkjs/lib/elk.bundled.js')
      .then(module => new module.default());
  }
  return elkInstancePromise;
}

function pathMidpoint(points) {
  const segments = points.slice(1).map((point, index) => ({
    from: points[index],
    to: point,
    length: Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y),
  }));
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let travelled = 0;
  for (const segment of segments) {
    if (travelled + segment.length >= total / 2) {
      const ratio = segment.length ? (total / 2 - travelled) / segment.length : 0;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
      };
    }
    travelled += segment.length;
  }
  return points[Math.floor(points.length / 2)] || { x: 0, y: 0 };
}

function WorkflowEdge({
  id,
  data,
  markerEnd,
  style,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  interactionWidth,
  ...pathParams
}) {
  const routedPoints = data?.layoutPoints;
  const edgeProps = {
    id,
    markerEnd,
    style,
    label,
    labelStyle,
    labelBgStyle,
    labelBgPadding,
    labelBgBorderRadius,
    interactionWidth,
  };
  if (Array.isArray(routedPoints) && routedPoints.length >= 2) {
    const edgePath = routedPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
    const midpoint = pathMidpoint(routedPoints);
    return (
      <BaseEdge
        {...edgeProps}
        path={edgePath}
        labelX={midpoint.x}
        labelY={midpoint.y}
      />
    );
  }
  const [edgePath, labelX, labelY] = getSmoothStepPath(pathParams);
  return <BaseEdge {...edgeProps} path={edgePath} labelX={labelX} labelY={labelY} />;
}

const EDGE_TYPES = { workflowEdge: WorkflowEdge };

const ASSIGNMENT_ROLES = [
  ['MAIN', 'Phụ trách chính'],
  ['ASSISTANT', 'Phối hợp / phụ'],
  ['WRITER', 'Soạn hồ sơ'],
  ['SUBMITTER', 'Đi nộp hồ sơ'],
  ['REVIEWER', 'Nghiệm thu'],
];

const APPROVER_ROLES = [
  ['admin', 'Giám đốc'],
  ['accountant', 'Kế toán'],
  ['legal_staff', 'Nhân viên pháp lý'],
  ['survey_staff', 'Nhân viên đo vẽ'],
  ['sales', 'Sales'],
];

const roleLabel = code => ASSIGNMENT_ROLES.find(item => item[0] === code)?.[1] || code;

async function requestJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || 'Không thể cập nhật workflow');
  return payload;
}

function makeFallbackGraph(catalog = []) {
  const preferredCodes = ['K01', 'K02', 'K09'];
  const selected = preferredCodes
    .map(code => catalog.find(item => item.code === code))
    .filter(Boolean);
  const stages = selected.length > 0 ? selected : catalog.slice(0, 3);
  const nodes = {};
  const ui = {};

  stages.forEach((item, index) => {
    const key = item.code.toLowerCase();
    const next = stages[index + 1];
    nodes[key] = {
      task_code: item.code,
      name: item.name,
      description: item.description,
      checklist: [],
      transitions: next ? { COMPLETED: next.code.toLowerCase() } : {},
    };
    ui[key] = { x: 90 + index * 300, y: 190 };
  });

  return {
    start_node: stages[0]?.code.toLowerCase() || '',
    nodes,
    ui,
    labels: DEFAULT_WORKFLOW_LABELS,
  };
}

function graphToFlow(graph, catalog, executionNodes = [], options = {}) {
  const source = graph?.nodes ? graph : makeFallbackGraph(catalog);
  const labels = resolveWorkflowLabels(source);
  const entries = Object.entries(source.nodes || {});
  const savedEdgeRoutes = source.ui?.edges || {};
  const executionByKey = new Map(executionNodes.map(node => [node.node_key, node]));
  const connections = [];
  const incomingByNode = new Map();
  const outgoingByNode = new Map();
  entries.forEach(([sourceKey, value]) => {
    Object.entries(value.transitions || {}).forEach(([outcome, targetKey], index) => {
      if (!source.nodes[targetKey]) return;
      const edgeId = `${sourceKey}:${outcome}:${targetKey}:${index}`;
      const sourceHandle = `out:${outcome}:${targetKey}:${index}`;
      const targetHandle = `in:${sourceKey}:${outcome}:${index}`;
      const connection = { edgeId, sourceKey, targetKey, outcome, sourceHandle, targetHandle };
      connections.push(connection);
      outgoingByNode.set(sourceKey, [...(outgoingByNode.get(sourceKey) || []), { id: sourceHandle }]);
      incomingByNode.set(targetKey, [...(incomingByNode.get(targetKey) || []), { id: targetHandle }]);
    });
  });
  const nodes = entries.map(([key, value], index) => {
    const catalogItem = catalog.find(item => item.code === value.task_code);
    const execution = executionByKey.get(key);
    const runtimeChecklistByKey = new Map(
      (execution?.checklist_results || []).map(item => [item.checklist_key, item])
    );
    const configuredChecklist = Array.isArray(value.checklist) ? value.checklist : [];
    const checklist = configuredChecklist.map(item => ({
      ...item,
      require_evidence: Boolean(item.require_evidence ?? item.evidence_required),
      approver_role: item.approver_role || 'admin',
      assignee_employee_id: item.assignee_employee_id || null,
      runtime: runtimeChecklistByKey.get(item.key) || null,
    }));
    (execution?.checklist_results || []).forEach(item => {
      if (checklist.some(configured => configured.key === item.checklist_key)) return;
      checklist.push({
        key: item.checklist_key,
        name: item.checklist_name,
        required: item.is_required,
        require_evidence: Boolean(item.require_evidence ?? item.evidence_data?.required),
        approver_role: item.approver_role || 'admin',
        assignee_employee_id: item.assignee_employee_id || null,
        evidence_description: item.evidence_data?.description || '',
        drive_folder_url: item.evidence_data?.drive_folder_url || '',
        runtime: item,
      });
    });
    return {
      id: key,
      type: 'workflowNode',
      position: source.ui?.[key] || { x: 80 + index * 280, y: 180 + (index % 2) * 130 },
      data: {
        code: value.task_code || catalogItem?.code || 'K--',
        label: value.name || catalogItem?.name || key,
        description: value.description || catalogItem?.description || '',
        checklist,
        assignments: options.preferDefinitionAssignments
          ? (Array.isArray(value.assignments) ? value.assignments : [])
          : (execution?.assignments || (Array.isArray(value.assignments) ? value.assignments : [])),
        taskNodeId: execution?.id || null,
        requiresGovSubmission: Boolean(value.requires_gov_submission),
        createsSurveyRecord: Boolean(value.creates_survey_record),
        isHandover: Boolean(value.is_handover),
        durationDays: value.duration_days ?? '',
        durationHours: value.duration_hours ?? '',
        executionStatus: execution?.status || 'pending',
        deadlineAt: execution?.deadline_at || null,
        isOverdue: Boolean(execution?.is_overdue),
        executionStatusLabel: labels.node_statuses[execution?.status || 'pending'],
        outcome: execution?.outcome || '',
        transitions: value.transitions || {},
        pendingAcceptanceId: execution?.pending_acceptance_id || null,
        incomingHandles: incomingByNode.get(key) || [],
        outgoingHandles: outgoingByNode.get(key) || [],
      },
    };
  });

  const edges = connections.map(connection => ({
        id: connection.edgeId,
        source: connection.sourceKey,
        target: connection.targetKey,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        label: labels.outcomes[connection.outcome] || connection.outcome,
        type: 'workflowEdge',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2 },
        labelStyle: { fontSize: 10, fontWeight: 700 },
        data: {
          outcomeCode: connection.outcome,
          layoutPoints: savedEdgeRoutes[`${connection.sourceKey}:${connection.outcome}:${connection.targetKey}`] || null,
        },
      }));

  return { nodes, edges, startNode: source.start_node || nodes[0]?.id || '', labels };
}

function flowToGraph(nodes, edges, startNode, labels = DEFAULT_WORKFLOW_LABELS) {
  const graphNodes = {};
  const ui = { edges: {} };
  nodes.forEach(node => {
    const transitions = {};
    edges.filter(edge => edge.source === node.id).forEach((edge, index) => {
      const outcomeCode = edge.data?.outcomeCode || `COMPLETED_${index + 1}`;
      transitions[outcomeCode] = edge.target;
    });
    graphNodes[node.id] = {
      task_code: node.data.code,
      name: node.data.label,
      description: node.data.description || '',
      requires_gov_submission: Boolean(node.data.requiresGovSubmission),
      creates_survey_record: Boolean(node.data.createsSurveyRecord),
      is_handover: Boolean(node.data.isHandover),
      duration_days: Number(node.data.durationDays) || 0,
      duration_hours: Number(node.data.durationHours) || 0,
      checklist: (node.data.checklist || []).map(item => {
        const { runtime: _runtime, evidence_required: _legacyEvidence, ...definition } = item;
        return definition;
      }),
      assignments: node.data.assignments || [],
      transitions,
    };
    ui[node.id] = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
  });
  edges.forEach(edge => {
    if (!edge.data?.layoutPoints?.length) return;
    const outcomeCode = edge.data?.outcomeCode || 'COMPLETED';
    ui.edges[`${edge.source}:${outcomeCode}:${edge.target}`] = edge.data.layoutPoints;
  });
  return { start_node: startNode || nodes[0]?.id || '', nodes: graphNodes, ui, labels };
}

const ACTIVE_WORK_STATUSES = new Set(['in_progress', 'submitted', 'rework_required', 'blocked']);

function comparableNodeDefinition(node = {}) {
  const transitions = Object.fromEntries(
    Object.entries(node.transitions || {}).sort(([left], [right]) => left.localeCompare(right))
  );
  const assignments = (node.assignments || [])
    .map(item => ({
      employee_id: item.employee_id || '',
      role_code: item.role_code || 'MAIN',
      is_primary: Boolean(item.is_primary),
      notes: item.notes || null,
    }))
    .sort((left, right) => `${left.employee_id}:${left.role_code}`.localeCompare(`${right.employee_id}:${right.role_code}`));
  const checklist = (node.checklist || []).map(item => {
    const compensation = item.compensation || {};
    return {
      key: item.key || '',
      name: item.name || '',
      required: item.required !== false,
      require_evidence: Boolean(item.require_evidence ?? item.evidence_required),
      approver_role: item.approver_role || 'admin',
      assignee_employee_id: item.assignee_employee_id || null,
      evidence_description: item.evidence_description || '',
      drive_folder_url: item.drive_folder_url || null,
      compensation: compensation.is_payable ? {
        is_payable: true,
        work_item_id: compensation.work_item_id || null,
        pay_scope: compensation.pay_scope || 'ONCE_PER_WORKFLOW',
        pay_key: compensation.pay_key || compensation.work_item_id || null,
        pay_group_key: compensation.pay_group_key || compensation.work_item_id || null,
      } : { is_payable: false },
    };
  });
  return {
    task_code: node.task_code || '',
    name: node.name || '',
    description: node.description || '',
    requires_gov_submission: Boolean(node.requires_gov_submission),
    creates_survey_record: Boolean(node.creates_survey_record),
    is_handover: Boolean(node.is_handover),
    duration_days: Number(node.duration_days) || 0,
    duration_hours: Number(node.duration_hours) || 0,
    checklist,
    assignments,
    transitions,
  };
}

function changedActiveWorkNodes(activeGraph, draftGraph, executionNodes = []) {
  const liveNodes = executionNodes.filter(node => ACTIVE_WORK_STATUSES.has(node.status));
  if (!activeGraph?.nodes) return liveNodes;
  return liveNodes.filter(execution => {
    const activeNode = activeGraph.nodes[execution.node_key];
    const draftNode = draftGraph?.nodes?.[execution.node_key];
    if (!activeNode || !draftNode) return true;
    return JSON.stringify(comparableNodeDefinition(activeNode))
      !== JSON.stringify(comparableNodeDefinition(draftNode));
  });
}

export default function ContractWorkflowDesigner({
  serviceLine,
  catalog = EMPTY_CATALOG,
  templates = [],
  employees = [],
  workItems = [],
  capabilities = {},
  onPersisted,
  addToast,
  targetNodeKey,
  targetType,
  targetNonce,
}) {
  const workflow = serviceLine?.workflow;
  const hasActiveRuntime = Boolean(workflow?.active_revision_id);
  const isWorkflowCancelled = workflow?.status === 'cancelled';
  const isWorkflowCompleted = workflow?.status === 'completed';
  const isWorkflowTerminal = isWorkflowCancelled || isWorkflowCompleted;
  const hasDraftAmendment = hasActiveRuntime && !isWorkflowTerminal && workflow?.revision_status === 'draft';
  const canEdit = capabilities.edit_workflow !== false;
  const canActivate = capabilities.activate_workflow !== false;
  const canAssign = capabilities.assign_workflow !== false;
  const canViewCompensation = capabilities.view_workflow_compensation === true;
  const canManageCompensation = capabilities.manage_workflow_compensation === true;
  const canAmendWorkflow = capabilities.amend_workflow === true;
  const canCancelWorkflow = capabilities.cancel_workflow === true;
  const canReviewChecklist = capabilities.review_workflow_checklist === true;
  const canReviewNode = capabilities.review_workflow_node === true;
  const parsed = useMemo(
    () => graphToFlow(
      workflow?.graph,
      catalog,
      workflow?.execution_nodes || [],
      { preferDefinitionAssignments: hasDraftAmendment }
    ),
    [catalog, hasDraftAmendment, workflow?.execution_nodes, workflow?.graph]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(parsed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(parsed.edges);
  const [startNode, setStartNode] = useState(parsed.startNode);
  const [selectedNodeId, setSelectedNodeId] = useState(parsed.startNode);
  const [inspectorTab, setInspectorTab] = useState('node');
  // Thu khung bên phải để nhường diện tích cho sơ đồ quy trình. Nhớ lại lần sau
  // để khỏi phải bấm lại mỗi lần mở màn hình.
  const [inspectorCollapsed, setInspectorCollapsed] = useState(
    () => localStorage.getItem('bk:workflow-inspector-collapsed') === '1',
  );
  useEffect(() => {
    localStorage.setItem('bk:workflow-inspector-collapsed', inspectorCollapsed ? '1' : '0');
  }, [inspectorCollapsed]);
  // Cấu hình node (tên bước, mã cụm, cờ, thời hạn) ẩn mặc định — mã và tên đã hiện
  // ngay ở tiêu đề rồi, bày thêm ô nhập y hệt chỉ làm rối và đẩy phần việc thật xuống dưới.
  const [editingNodeConfig, setEditingNodeConfig] = useState(false);
  useEffect(() => { setEditingNodeConfig(false); }, [selectedNodeId]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(workflow?.template?.id || '');
  const [workflowLabels, setWorkflowLabels] = useState(parsed.labels);
  const [saving, setSaving] = useState(false);
  const [startingEdit, setStartingEdit] = useState(false);
  const [activating, setActivating] = useState(false);
  const [layouting, setLayouting] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [editMode, setEditMode] = useState(!isWorkflowTerminal && (!hasActiveRuntime || hasDraftAmendment));
  const [changeReason, setChangeReason] = useState(workflow?.change_reason || '');
  const [flowInstance, setFlowInstance] = useState(null);
  const [activationConfirmation, setActivationConfirmation] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancellationCode, setCancellationCode] = useState('CUSTOMER_REQUEST');
  const [cancellationReason, setCancellationReason] = useState('');
  const [agencyHandlingConfirmed, setAgencyHandlingConfirmed] = useState(false);
  const [agencyHandlingNote, setAgencyHandlingNote] = useState('');

  // Làm mới dữ liệu node/edge mỗi khi có bản mới (kể cả từ polling ngầm) —
  // KHÔNG đụng tới lựa chọn/chế độ sửa hiện tại, tránh giật màn hình khi tự cập nhật.
  useEffect(() => {
    if (!editMode) {
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
      setWorkflowLabels(parsed.labels);
      return;
    }
    // Đang sửa nháp: server vẫn trả graph CŨ (phần sửa chưa lưu), nên không ghi đè cấu trúc.
    // Nhưng vẫn phải bơm TRẠNG THÁI VẬN HÀNH mới nhất vào (node vừa được nộp, minh chứng vừa
    // gửi...) — nếu chặn sạch thì admin không bao giờ thấy nút duyệt cho tới khi tải lại trang.
    setNodes(current => current.map(node => {
      const fresh = parsed.nodes.find(item => item.id === node.id);
      if (!fresh) return node;
      return {
        ...node,
        data: {
          ...node.data,
          taskNodeId: fresh.data.taskNodeId,
          executionStatus: fresh.data.executionStatus,
          executionStatusLabel: fresh.data.executionStatusLabel,
          outcome: fresh.data.outcome,
          deadlineAt: fresh.data.deadlineAt,
          isOverdue: fresh.data.isOverdue,
          pendingAcceptanceId: fresh.data.pendingAcceptanceId,
          // Chỉ đồng bộ phần runtime của checklist (kết quả duyệt, minh chứng đã nộp),
          // giữ nguyên định nghĩa checklist đang sửa dở. Phân công cũng giữ nguyên vì
          // người dùng có thể đang chỉnh trong tab Phân công mà chưa bấm lưu.
          checklist: (node.data.checklist || []).map(item => {
            const freshItem = (fresh.data.checklist || []).find(candidate => candidate.key === item.key);
            return freshItem ? { ...item, runtime: freshItem.runtime } : item;
          }),
        },
      };
    }));
  }, [parsed, editMode, setEdges, setNodes]);

  // Chỉ reset lựa chọn/chế độ sửa khi thật sự chuyển sang Hạng mục khác —
  // ref giữ id trước đó nên polling cùng 1 Hạng mục không kích hoạt lại.
  const previousServiceLineIdRef = useRef(serviceLine?.id);
  useEffect(() => {
    if (previousServiceLineIdRef.current === serviceLine?.id) return;
    previousServiceLineIdRef.current = serviceLine?.id;
    setStartNode(parsed.startNode);
    setSelectedNodeId(parsed.startNode);
    setSelectedTemplateId(workflow?.template?.id || '');
    setEditMode(!isWorkflowTerminal && (!hasActiveRuntime || hasDraftAmendment));
    setChangeReason(workflow?.change_reason || '');
    setCancelOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceLine?.id]);

  // Nhảy tới đúng Node khi được điều hướng từ chuông thông báo — chỉ áp dụng 1 lần
  // cho mỗi LẦN BẤM (nonce), không ghi đè lựa chọn thủ công sau đó của người dùng.
  const consumedTargetRef = useRef(null);
  useEffect(() => {
    if (!targetNodeKey) return;
    const targetToken = `${targetNonce ?? ''}:${targetNodeKey}`;
    if (consumedTargetRef.current === targetToken) return;
    if (!nodes.some(node => node.id === targetNodeKey)) return;
    consumedTargetRef.current = targetToken;
    setSelectedNodeId(targetNodeKey);
    // Mở đúng tab chứa nút thao tác: duyệt minh chứng nằm ở tab Checklist,
    // còn duyệt nghiệm thu Node nằm ở tab Node.
    setInspectorTab(
      targetType === 'checklist_review' || targetType === 'checklist_resubmit' ? 'checklist' : 'node'
    );
  }, [targetNodeKey, targetType, targetNonce, nodes]);

  const selectedNode = nodes.find(node => node.id === selectedNodeId) || null;
  const structureEditable = !isWorkflowTerminal && canEdit && (!hasActiveRuntime || (editMode && canAmendWorkflow));
  const canMoveLayout = !isWorkflowTerminal && canEdit && (!hasActiveRuntime || canAmendWorkflow);
  const checklistEditable = structureEditable && (
    !selectedNode?.data.taskNodeId
    || ['pending', 'ready'].includes(selectedNode.data.executionStatus)
  );
  const selectedNodeHasPayableWork = Boolean(
    selectedNode?.data.checklist?.some(item => item.compensation?.is_payable)
  );
  const selectedNodeAllowsReassignment = !selectedNode?.data.taskNodeId
    || !['submitted', 'accepted', 'skipped', 'cancelled'].includes(selectedNode.data.executionStatus);
  const canEditSelectedAssignments = structureEditable && canAssign
    && selectedNodeAllowsReassignment
    && (!hasActiveRuntime || !selectedNodeHasPayableWork || canManageCompensation);
  const workItemById = useMemo(
    () => new Map(workItems.map(item => [item.id, item])),
    [workItems]
  );

  const projectedPayLines = useCallback((node, assignment) => (
    (node?.data.checklist || []).flatMap(item => {
      const compensation = item.compensation || {};
      if (!compensation.is_payable || !compensation.work_item_id) return [];
      const workItem = workItemById.get(compensation.work_item_id);
      const rate = workItem?.rates?.find(candidate => candidate.role_code === assignment.role_code);
      if (!rate) return [];
      return [{
        checklistKey: item.key,
        checklistName: item.name,
        workItemName: workItem.name,
        amount: Number(rate.amount || 0),
      }];
    })
  ), [workItemById]);

  const handleNodesChange = useCallback((changes) => {
    if (changes.some(change => change.type === 'position' && change.dragging)) {
      setEdges(current => current.map(edge => ({
        ...edge,
        data: { ...edge.data, layoutPoints: null },
      })));
    }
    onNodesChange(changes);
  }, [onNodesChange, setEdges]);

  const onConnect = useCallback((connection) => {
    if (!structureEditable) return;
    const connectionKey = `${connection.source}:${connection.target}:${Date.now()}`;
    const sourceHandle = `out:${connectionKey}`;
    const targetHandle = `in:${connectionKey}`;
    const usedOutcomes = new Set(
      edges.filter(edge => edge.source === connection.source).map(edge => edge.data?.outcomeCode)
    );
    const outcomeCode = Object.keys(workflowLabels.outcomes).find(code => !usedOutcomes.has(code))
      || `COMPLETED_${usedOutcomes.size + 1}`;
    setNodes(current => current.map(node => {
      if (node.id === connection.source) {
        return {
          ...node,
          data: {
            ...node.data,
            outgoingHandles: [...(node.data.outgoingHandles || []), { id: sourceHandle }],
          },
        };
      }
      if (node.id === connection.target) {
        return {
          ...node,
          data: {
            ...node.data,
            incomingHandles: [...(node.data.incomingHandles || []), { id: targetHandle }],
          },
        };
      }
      return node;
    }));
    setEdges(current => addEdge({
      ...connection,
      id: connectionKey,
      sourceHandle,
      targetHandle,
      label: workflowLabels.outcomes[outcomeCode] || outcomeCode,
      data: { outcomeCode },
      type: 'workflowEdge',
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2 },
    }, current));
  }, [edges, setEdges, setNodes, structureEditable, workflowLabels.outcomes]);

  const updateTransitionOutcome = useCallback((edgeId, outcomeCode) => {
    const targetEdge = edges.find(edge => edge.id === edgeId);
    if (!targetEdge || !structureEditable) return;
    if (edges.some(edge => (
      edge.id !== edgeId
      && edge.source === targetEdge.source
      && edge.data?.outcomeCode === outcomeCode
    ))) {
      addToast?.('Mỗi điều kiện chuyển bước chỉ được dùng một lần trên cùng Node', 'error');
      return;
    }
    setEdges(current => current.map(edge => (
      edge.id === edgeId
        ? {
            ...edge,
            label: workflowLabels.outcomes[outcomeCode] || outcomeCode,
            data: { ...edge.data, outcomeCode, layoutPoints: null },
          }
        : edge
    )));
  }, [addToast, edges, setEdges, structureEditable, workflowLabels.outcomes]);

  const updateSelectedNode = useCallback((patch) => {
    if (!selectedNodeId) return;
    setNodes(current => current.map(node => (
      node.id === selectedNodeId
        ? { ...node, data: { ...node.data, ...patch } }
        : node
    )));
  }, [selectedNodeId, setNodes]);

  const addCatalogNode = useCallback(() => {
    const used = new Set(nodes.map(node => node.data.code));
    const item = catalog.find(candidate => !used.has(candidate.code)) || {
      code: `K${String(nodes.length + 1).padStart(2, '0')}`,
      name: 'Công việc mới',
      description: '',
    };
    const baseKey = item.code.toLowerCase();
    let id = baseKey;
    let suffix = 2;
    while (nodes.some(node => node.id === id)) id = `${baseKey}_${suffix++}`;
    const next = {
      id,
      type: 'workflowNode',
      position: { x: 120 + nodes.length * 80, y: 120 + nodes.length * 55 },
      data: {
        code: item.code,
        label: item.name,
        description: item.description || '',
        checklist: [],
        role: '',
        requiresGovSubmission: false,
        createsSurveyRecord: false,
        isHandover: false,
        durationDays: '',
        durationHours: '',
        executionStatus: 'pending',
      },
    };
    setNodes(current => [...current, next]);
    setSelectedNodeId(id);
    if (!startNode) setStartNode(id);
  }, [catalog, nodes, setNodes, startNode]);

  const removeSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes(current => current.filter(node => node.id !== selectedNodeId));
    setEdges(current => current.filter(edge => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    if (startNode === selectedNodeId) setStartNode('');
    setSelectedNodeId('');
  }, [selectedNodeId, setEdges, setNodes, startNode]);

  const autoLayout = useCallback(async () => {
    if (nodes.length === 0 || layouting) return;
    setLayouting(true);
    try {
      const elk = await getElkInstance();
      const result = await elk.layout({
        id: 'workflow-root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.edgeRouting': 'ORTHOGONAL',
          'elk.spacing.nodeNode': '80',
          'elk.spacing.edgeEdge': '22',
          'elk.spacing.edgeNode': '32',
          'elk.layered.spacing.nodeNodeBetweenLayers': '145',
          'elk.layered.spacing.edgeNodeBetweenLayers': '48',
          'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
          'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
          'elk.layered.cycleBreaking.strategy': 'GREEDY',
          'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
          'elk.padding': '[top=70,left=70,bottom=70,right=70]',
        },
        children: nodes.map(node => {
          const incoming = node.data.incomingHandles?.length
            ? node.data.incomingHandles
            : [{ id: 'in:default' }];
          const outgoing = node.data.outgoingHandles?.length
            ? node.data.outgoingHandles
            : [{ id: 'out:default' }];
          return {
            id: node.id,
            width: WORKFLOW_NODE_WIDTH,
            height: WORKFLOW_NODE_HEIGHT,
            layoutOptions: { 'elk.portConstraints': 'FIXED_ORDER' },
            ports: [
              ...incoming.map(handle => ({
                id: `${node.id}__${handle.id}`,
                width: 1,
                height: 1,
                layoutOptions: { 'elk.port.side': 'WEST' },
              })),
              ...outgoing.map(handle => ({
                id: `${node.id}__${handle.id}`,
                width: 1,
                height: 1,
                layoutOptions: { 'elk.port.side': 'EAST' },
              })),
            ],
          };
        }),
        edges: edges.map(edge => ({
          id: edge.id,
          sources: [`${edge.source}__${edge.sourceHandle || 'out:default'}`],
          targets: [`${edge.target}__${edge.targetHandle || 'in:default'}`],
        })),
      });

      const layoutNodeById = new Map((result.children || []).map(node => [node.id, node]));
      const layoutEdgeById = new Map((result.edges || []).map(edge => [edge.id, edge]));
      setNodes(current => current.map(node => {
        const layoutNode = layoutNodeById.get(node.id);
        return layoutNode
          ? { ...node, position: { x: layoutNode.x || 0, y: layoutNode.y || 0 } }
          : node;
      }));
      setEdges(current => current.map(edge => {
        const section = layoutEdgeById.get(edge.id)?.sections?.[0];
        const layoutPoints = section
          ? [section.startPoint, ...(section.bendPoints || []), section.endPoint]
          : null;
        return { ...edge, type: 'workflowEdge', data: { ...edge.data, layoutPoints } };
      }));
      window.requestAnimationFrame(() => flowInstance?.fitView({ padding: 0.14, duration: 450 }));
    } catch (error) {
      addToast?.(`Không thể tự sắp xếp workflow: ${error.message}`, 'error');
    } finally {
      setLayouting(false);
    }
  }, [addToast, edges, flowInstance, layouting, nodes, setEdges, setNodes]);

  const addChecklistItem = useCallback(() => {
    if (!selectedNode) return;
    const current = selectedNode.data.checklist || [];
    updateSelectedNode({
      checklist: [...current, createChecklistDefinition(current.length + 1)],
    });
  }, [selectedNode, updateSelectedNode]);

  const updateChecklistItem = useCallback((index, patch) => {
    if (!selectedNode) return;
    updateSelectedNode({
      checklist: selectedNode.data.checklist.map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...patch } : item
      )),
    });
  }, [selectedNode, updateSelectedNode]);

  const removeChecklistItem = useCallback((index) => {
    if (!selectedNode || !checklistEditable) return;
    updateSelectedNode({
      checklist: removeChecklistDefinition(selectedNode.data.checklist, index),
    });
  }, [checklistEditable, selectedNode, updateSelectedNode]);

  const [reviewingNodeId, setReviewingNodeId] = useState('');
  const [reviewOutcome, setReviewOutcome] = useState('');
  const reviewNodeAcceptance = useCallback(async (acceptanceId, decision, outcome) => {
    setReviewingNodeId(acceptanceId);
    try {
      await apiFetch(`/api/contracts/workflow/acceptances/${acceptanceId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, outcome, note: null }),
      });
      addToast?.(decision === 'accepted' ? 'Đã duyệt đạt, đã mở bước tiếp theo' : 'Đã yêu cầu làm lại', 'success');
      setReviewOutcome('');
      await onPersisted?.();
    } catch (error) {
      addToast?.(error.message || 'Không thể duyệt node', 'error');
    } finally {
      setReviewingNodeId('');
    }
  }, [addToast, onPersisted]);

  const [reviewingChecklistId, setReviewingChecklistId] = useState('');
  const reviewChecklistEvidence = useCallback(async (checklistResultId, decision) => {
    setReviewingChecklistId(checklistResultId);
    try {
      await apiFetch(`/api/contracts/workflow/checklist/${checklistResultId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      addToast?.(decision === 'approved' ? 'Đã duyệt đạt checklist' : 'Đã từ chối checklist', 'success');
      await onPersisted?.();
    } catch (error) {
      addToast?.(error.message || 'Không thể duyệt minh chứng', 'error');
    } finally {
      setReviewingChecklistId('');
    }
  }, [addToast, onPersisted]);

  const currentPayload = (reason = changeReason) => ({
      graph: flowToGraph(nodes, edges, startNode, workflowLabels),
      source_workflow_version_id: selectedTemplateId || null,
      change_reason: reason?.trim() || null,
  });

  const beginWorkflowEdit = async () => {
    if (!serviceLine?.id || !hasActiveRuntime || !canAmendWorkflow || isWorkflowTerminal) return;
    setStartingEdit(true);
    try {
      const result = await requestJson(`/api/contracts/workflow/${encodeURIComponent(serviceLine.id)}/draft`, {
        method: 'PUT',
        body: JSON.stringify({
          graph: workflow?.active_graph || currentPayload(null).graph,
          source_workflow_version_id: workflow?.template?.id || selectedTemplateId || null,
          change_reason: null,
        }),
      });
      setChangeReason('');
      setEditMode(true);
      addToast?.(`Đã tạo bản tạm số ${result.revision_no} từ quy trình đang chạy`, 'success');
      await onPersisted?.();
    } catch (error) {
      addToast?.(error.message, 'error');
    } finally {
      setStartingEdit(false);
    }
  };

  const saveDraft = async () => {
    if (!serviceLine?.id || !structureEditable) return;
    setSaving(true);
    try {
      const result = await requestJson(`/api/contracts/workflow/${encodeURIComponent(serviceLine.id)}/draft`, {
        method: 'PUT',
        body: JSON.stringify(currentPayload()),
      });
      addToast?.(`Đã lưu tạm Revision ${result.revision_no}; bản đang chạy chưa thay đổi`, 'success');
      await onPersisted?.();
    } catch (error) {
      addToast?.(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const activateCurrentWorkflow = async () => {
    if (!serviceLine?.id || !canActivate || (hasActiveRuntime && !structureEditable)) return;
    const amendmentReason = changeReason;
    const hasUnassignedNode = nodes.some(node => !(node.data.assignments || []).length);
    const projectedKeys = new Set();
    const projectedTotal = nodes.reduce((total, node) => total + (node.data.assignments || []).reduce(
      (assignmentTotal, assignment) => assignmentTotal + projectedPayLines(node, assignment).reduce((lineTotal, line) => {
        const compensation = (node.data.checklist || []).find(item => item.key === line.checklistKey)?.compensation || {};
        const key = compensation.pay_scope === 'PER_OCCURRENCE'
          ? `${node.id}:${line.checklistKey}:${assignment.employee_id}:${assignment.role_code}`
          : `${compensation.work_item_id}:${assignment.employee_id}:${assignment.role_code}`;
        if (projectedKeys.has(key)) return lineTotal;
        projectedKeys.add(key);
        return lineTotal + line.amount;
      }, 0),
      0
    ), 0);
    const compensationMessage = projectedTotal > 0
      ? `\nKhoán dự kiến được khóa: ${formatMoney(projectedTotal)}. Tiền chỉ được ghi nhận sau nghiệm thu.`
      : '';
    const actionLabel = hasActiveRuntime ? 'Áp dụng bản sửa đổi' : 'Kích hoạt';
    const message = hasUnassignedNode
      ? `Một số Node chưa được phân công. Bạn vẫn muốn ${actionLabel.toLowerCase()}?`
      : `${actionLabel} sẽ lưu một Revision có lịch sử riêng.${compensationMessage}\nTiếp tục?`;
    setActivationConfirmation({ amendmentReason, message, phase: 'initial' });
  };

  const confirmWorkflowActivation = async () => {
    if (!activationConfirmation || !serviceLine?.id || activating) return;
    const amendmentReason = (activationConfirmation.amendmentReason || '').trim();
    if (hasActiveRuntime && !amendmentReason) {
      addToast?.('Cần nhập lý do để áp dụng bản sửa đổi', 'error');
      return;
    }

    if (hasActiveRuntime && activationConfirmation.phase !== 'impact-warning') {
      const draftGraph = currentPayload(amendmentReason).graph;
      const touchedNodes = changedActiveWorkNodes(
        workflow?.active_graph,
        draftGraph,
        workflow?.execution_nodes || []
      );
      if (touchedNodes.length > 0) {
        const nodeNames = touchedNodes
          .map(item => workflowLabels.node_statuses[item.status]
            ? `${item.node_code || item.node_key} (${workflowLabels.node_statuses[item.status]})`
            : (item.node_code || item.node_key))
          .join(', ');
        setActivationConfirmation(current => ({
          ...current,
          amendmentReason,
          phase: 'impact-warning',
          message: `Bản sửa đổi đang tác động tới ${touchedNodes.length} Node có công việc đang xử lý: ${nodeNames}.\n\n`
            + 'Phân công, checklist hoặc đường chuyển bước có thể ảnh hưởng tới nhân viên đang làm dở. '
            + 'Hãy kiểm tra kỹ trước khi xác nhận áp dụng ngay.',
        }));
        return;
      }
    }
    setChangeReason(amendmentReason);
    setActivating(true);
    try {
      const result = await requestJson(`/api/contracts/workflow/${encodeURIComponent(serviceLine.id)}/activate`, {
        method: 'POST',
        body: JSON.stringify(currentPayload(amendmentReason)),
      });
      addToast?.(
        `${result.amended ? 'Đã áp dụng bản sửa đổi' : 'Đã kích hoạt'}: ${result.node_count} Node mới, `
          + `${result.assignment_count} phân công và `
          + `${result.compensation_assignment_count || 0} khoản khoán dự kiến`,
        'success'
      );
      setEditMode(false);
      setChangeReason('');
      setActivationConfirmation(null);
      await onPersisted?.();
    } catch (error) {
      addToast?.(error.message, 'error');
    } finally {
      setActivating(false);
    }
  };

  const addAssignment = () => {
    if (!selectedNode || employees.length === 0) return;
    const current = selectedNode.data.assignments || [];
    const unused = employees.find(employee => !current.some(item => item.employee_id === employee.id));
    const employee = unused || employees[0];
    updateSelectedNode({
      assignments: [...current, {
        employee_id: employee.id,
        full_name: employee.full_name,
        department_name: employee.department_name,
        role_code: current.length === 0 ? 'MAIN' : 'ASSISTANT',
        is_primary: current.length === 0,
        notes: '',
      }],
    });
  };

  const updateAssignment = (index, patch) => {
    if (!selectedNode) return;
    const assignments = (selectedNode.data.assignments || []).map((item, itemIndex) => {
      if (itemIndex !== index) return patch.is_primary ? { ...item, is_primary: false } : item;
      const next = { ...item, ...patch };
      if (patch.employee_id) {
        const employee = employees.find(candidate => candidate.id === patch.employee_id);
        next.full_name = employee?.full_name || next.full_name;
        next.department_name = employee?.department_name || next.department_name;
      }
      return next;
    });
    updateSelectedNode({ assignments });
  };

  const removeAssignment = index => {
    if (!selectedNode) return;
    updateSelectedNode({
      assignments: (selectedNode.data.assignments || []).filter((_, itemIndex) => itemIndex !== index),
    });
  };

  const applyTemplate = (templateId) => {
    if (!structureEditable) return;
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const template = templates.find(item => item.id === templateId);
    if (!template?.graph) return;
    const next = graphToFlow(template.graph, catalog, []);
    setNodes(next.nodes);
    setEdges(next.edges);
    setStartNode(next.startNode);
    setSelectedNodeId(next.startNode);
    setWorkflowLabels(next.labels);
  };

  const saveActiveLayout = async () => {
    if (!serviceLine?.id || !hasActiveRuntime || !canAmendWorkflow || isWorkflowTerminal) return;
    setSavingLayout(true);
    try {
      const graph = flowToGraph(nodes, edges, startNode, workflowLabels);
      await requestJson(`/api/contracts/workflow/${encodeURIComponent(serviceLine.id)}/layout`, {
        method: 'PUT',
        body: JSON.stringify({ ui: graph.ui }),
      });
      addToast?.('Đã lưu vị trí Node và đường nối', 'success');
      await onPersisted?.();
    } catch (error) {
      addToast?.(error.message, 'error');
    } finally {
      setSavingLayout(false);
    }
  };

  const cancellationPreview = workflow?.cancellation_preview || {};
  const requiresAgencyHandling = cancellationPreview.requires_agency_handling === true;
  const canSubmitCancellation = cancellationReason.trim().length >= 5
    && (!requiresAgencyHandling || (
      agencyHandlingConfirmed && agencyHandlingNote.trim().length >= 5
    ));

  const cancelCurrentWorkflow = async () => {
    if (!serviceLine?.id || !canCancelWorkflow || isWorkflowTerminal || !canSubmitCancellation) return;
    setCancelling(true);
    try {
      const result = await requestJson(
        `/api/contracts/workflow/${encodeURIComponent(serviceLine.id)}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({
            cancellation_code: cancellationCode,
            reason: cancellationReason.trim(),
            agency_handling_confirmed: agencyHandlingConfirmed,
            agency_handling_note: agencyHandlingNote.trim() || null,
          }),
        }
      );
      setCancelOpen(false);
      addToast?.(
        `Đã hủy quy trình; ${result.cancelled_node_count || 0} Node đang mở đã được đóng. `
          + `${result.preserved_entitlement_count || 0} khoản khoán đã phát sinh được giữ nguyên.`,
        'success'
      );
      await onPersisted?.();
    } catch (error) {
      addToast?.(error.message, 'error');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="workflow-designer">
      <div className="workflow-designer__toolbar">
        <div>
          <span className="eyebrow">Sơ đồ quy trình</span>
          <strong>{serviceLine?.task_type || serviceLine?.service_type || 'Hạng mục chưa đặt tên'}</strong>
        </div>
        <div className="workflow-designer__toolbar-actions">
          {hasActiveRuntime && (
            <span className={`workflow-active-badge${isWorkflowCancelled ? ' cancelled' : ''}`}>
              {isWorkflowCancelled ? <Ban size={13} /> : editMode ? <Pencil size={13} /> : <LockKeyhole size={13} />}
              {isWorkflowCancelled
                ? 'Đã hủy'
                : editMode
                  ? `Đang sửa Revision ${workflow?.revision_no || ''}`
                  : isWorkflowCompleted ? 'Đã hoàn thành' : 'Đang vận hành'}
            </span>
          )}
          <label className="workflow-template-picker">
            <span>Mẫu quy trình</span>
            <select disabled={!structureEditable} value={selectedTemplateId} onChange={event => applyTemplate(event.target.value)}>
              <option value="">Tự thiết kế</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name} · V{template.version}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!structureEditable} className="workspace-icon-button" onClick={addCatalogNode}>
            <Plus size={16} /> Thêm node
          </button>
          <button type="button" disabled={!canMoveLayout || layouting} className="workspace-icon-button" onClick={autoLayout}>
            {layouting ? <LoaderCircle size={16} className="spin" /> : <AlignHorizontalSpaceAround size={16} />} Căn thông minh
          </button>
          {hasActiveRuntime && !isWorkflowTerminal && !editMode && canAmendWorkflow && (
            <>
              <button type="button" disabled={startingEdit} className="workspace-icon-button" onClick={beginWorkflowEdit}>
                {startingEdit ? <LoaderCircle size={15} className="spin" /> : <Pencil size={15} />} Sửa
              </button>
              <button type="button" disabled={savingLayout} className="workspace-icon-button" onClick={saveActiveLayout}>
                {savingLayout ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} Lưu bố cục
              </button>
            </>
          )}
          {(!hasActiveRuntime || (editMode && !isWorkflowTerminal)) && (
            <>
              <button type="button" disabled={saving || !structureEditable} className="workspace-icon-button" onClick={saveDraft}>
                {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} Lưu tạm
              </button>
              <button type="button" disabled={activating || !canActivate || !structureEditable} className="btn btn-primary btn-sm workflow-activate-button" onClick={activateCurrentWorkflow}>
                {activating ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}
                {hasActiveRuntime ? 'Áp dụng' : 'Kích hoạt'}
              </button>
            </>
          )}
          {hasActiveRuntime && !isWorkflowTerminal && canCancelWorkflow && (
            <button
              type="button"
              className="workspace-icon-button workflow-cancel-button"
              onClick={() => setCancelOpen(true)}
            >
              <Ban size={15} /> Hủy
            </button>
          )}
        </div>
      </div>

      {hasActiveRuntime && !isWorkflowTerminal && editMode && (
        <div className="workflow-amendment-reason">
          <Pencil size={16} />
          <label>
            <span>Lý do sửa quy trình đang vận hành</span>
            <input
              className="form-control"
              placeholder="Ví dụ: bổ sung bước kiểm tra hồ sơ và nhánh yêu cầu bổ sung"
              value={changeReason}
              onChange={event => setChangeReason(event.target.value)}
            />
          </label>
          <small>Bắt buộc khi áp dụng; Revision cũ vẫn được giữ nguyên để đối chiếu.</small>
        </div>
      )}

      {isWorkflowCancelled && workflow?.cancellation && (
        <div className="workflow-cancellation-summary">
          <Ban size={16} />
          <div>
            <strong>Quy trình đã bị hủy</strong>
            <span>{workflow.cancellation.reason}</span>
          </div>
          <small>
            {workflow.cancellation.cancelled_by_username || 'Giám đốc'} · {' '}
            {formatDateTime(workflow.cancellation.cancelled_at)}
          </small>
        </div>
      )}

      <div className="workflow-designer__body">
        <div className="workflow-designer__canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setFlowInstance}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId('')}
            fitView
            fitViewOptions={{ padding: 0.16, minZoom: 0.62, maxZoom: 1 }}
            snapToGrid
            snapGrid={[20, 20]}
            minZoom={0.45}
            maxZoom={1.5}
            defaultEdgeOptions={{ type: 'workflowEdge' }}
            nodesDraggable={canMoveLayout}
            nodesConnectable={structureEditable}
            elementsSelectable
          >
            <Background gap={20} size={1} color="var(--workflow-grid)" />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={node => NODE_COLORS[node.data.executionStatus] || NODE_COLORS.pending}
            />
          </ReactFlow>
          {nodes.length === 0 && (
            <div className="workflow-empty-canvas">
              <GitBranch size={28} />
              <strong>Quy trình chưa có Node</strong>
              <span>Thêm K01–K09 từ thanh công cụ để bắt đầu.</span>
            </div>
          )}
        </div>

        <aside className={`workflow-inspector${inspectorCollapsed ? ' workflow-inspector--collapsed' : ''}`}>
          {inspectorCollapsed ? (
            <div className="workflow-inspector__stub" onClick={() => setInspectorCollapsed(false)}>
              <span>{selectedNode?.data.code || 'Chi tiết'}</span>
            </div>
          ) : (
          <>
          <div className="workflow-inspector__tabs">
            {[
              ['node', 'Node'],
              ['checklist', 'Checklist'],
              ['assignment', 'Phân công'],
              ['transition', 'Điều kiện'],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={inspectorTab === key ? 'active' : ''}
                onClick={() => setInspectorTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {!selectedNode ? (
            <div className="workflow-inspector__empty">
              <CircleDashed size={28} />
              <strong>Chọn một Node</strong>
              <span>Thông tin, checklist, phân công và điều kiện chuyển bước sẽ hiện ở đây.</span>
            </div>
          ) : inspectorTab === 'node' ? (
            <div className="workflow-inspector__content">
              <div className="workflow-inspector__heading workflow-node-title">
                <div>
                  <span>{selectedNode.data.code} · Node</span>
                  <strong>{selectedNode.data.label}</strong>
                </div>
                <div className="workflow-inspector__heading-actions">
                  <button
                    type="button"
                    className={`workflow-icon-button${editingNodeConfig ? ' is-active' : ''}`}
                    onClick={() => setEditingNodeConfig(value => !value)}
                    title={editingNodeConfig ? 'Ẩn phần cấu hình' : 'Chỉnh sửa cấu hình bước'}
                    aria-label="Chỉnh sửa cấu hình bước"
                  >
                    <Pencil size={15} />
                  </button>
                  <button type="button" disabled={!structureEditable} className="danger-icon-button" onClick={removeSelectedNode} title="Xóa Node">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Tóm tắt chỉ đọc — thay cho việc bày lại toàn bộ ô nhập.
                  Mã và tên bước đã nằm ở tiêu đề nên không lặp lại ở đây. */}
              {/* Trạng thái, thời lượng và cờ đều là thuộc tính của cùng một bước —
                  xếp chung một hàng thì đọc được trong một nhịp mắt, thay vì rải
                  ra ba khối chồng lên nhau. */}
              <div className="workflow-node-meta">
                <em className={`workflow-status-pill workflow-status-pill--${selectedNode.data.executionStatus}`}>
                  {selectedNode.data.executionStatusLabel}
                </em>
                <span className="workflow-node-meta__dur">
                  <Clock3 size={13} />
                  {Number(selectedNode.data.durationDays) || Number(selectedNode.data.durationHours)
                    ? [
                        Number(selectedNode.data.durationDays) ? `${selectedNode.data.durationDays} ngày` : null,
                        Number(selectedNode.data.durationHours) ? `${selectedNode.data.durationHours} giờ` : null,
                      ].filter(Boolean).join(' ')
                    : 'Chưa đặt thời hạn'}
                </span>
                {selectedNode.data.requiresGovSubmission && <span className="is-flag">Nộp cơ quan</span>}
                {selectedNode.data.createsSurveyRecord && <span className="is-flag">Bước đo vẽ</span>}
                {selectedNode.data.isHandover && <span className="is-flag">Bàn giao</span>}
              </div>

              {/* Nhãn "Đầu ra nghiệm thu:" chiếm mất nửa dòng đầu để nói một điều
                  mà vị trí của câu đã nói rồi. */}
              {!editingNodeConfig && selectedNode.data.description && (
                <p className="workflow-node-desc">{selectedNode.data.description}</p>
              )}

              {/* Hai node đặc biệt: K06 vì THỜI GIAN (chờ cơ quan), K08 vì TIỀN
                  (cổng công nợ). Nhận diện bằng CỜ, không bằng mã node. */}
              {selectedNode.data.requiresGovSubmission && selectedNode.data.taskNodeId && (
                <LegalDossierNodePanel
                  taskNodeId={selectedNode.data.taskNodeId}
                  addToast={addToast}
                  onChanged={onPersisted}
                  readOnly
                />
              )}
              {selectedNode.data.isHandover && selectedNode.data.taskNodeId && (
                <HandoverPanel
                  taskNodeId={selectedNode.data.taskNodeId}
                  addToast={addToast}
                  onChanged={onPersisted}
                  readOnly
                />
              )}

              {selectedNode.data.pendingAcceptanceId && canReviewNode && (
                <div className="workflow-review-card">
                  <div className="workflow-review-card__title"><Clock3 size={14} /> Chờ duyệt nghiệm thu</div>
                  <label>
                    Kết quả xử lý
                    <select
                      className="form-control"
                      value={reviewOutcome}
                      onChange={event => setReviewOutcome(event.target.value)}
                    >
                      <option value="">— Chọn kết quả —</option>
                      {Object.keys(selectedNode.data.transitions || {}).map(code => (
                        <option key={code} value={code}>{workflowLabels.outcomes[code] || code}</option>
                      ))}
                    </select>
                  </label>
                  <div className="workflow-review-card__actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={reviewingNodeId === selectedNode.data.pendingAcceptanceId}
                      onClick={() => reviewNodeAcceptance(selectedNode.data.pendingAcceptanceId, 'rework_required')}
                    >
                      <XCircle size={14} /> Cần làm lại
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={reviewingNodeId === selectedNode.data.pendingAcceptanceId || (Object.keys(selectedNode.data.transitions || {}).length > 0 && !reviewOutcome)}
                      onClick={() => reviewNodeAcceptance(selectedNode.data.pendingAcceptanceId, 'accepted', reviewOutcome || null)}
                    >
                      <CheckCircle2 size={14} /> Duyệt đạt
                    </button>
                  </div>
                </div>
              )}

              {editingNodeConfig && (
              <>
              <label>
                Tên bước
                <input
                  className="form-control"
                  disabled={!structureEditable}
                  value={selectedNode.data.label}
                  onChange={event => updateSelectedNode({ label: event.target.value })}
                />
              </label>
              <label>
                Mã cụm công việc
                <select
                  className="form-control"
                  disabled={!structureEditable}
                  value={selectedNode.data.code}
                  onChange={event => {
                    const item = catalog.find(candidate => candidate.code === event.target.value);
                    updateSelectedNode({
                      code: event.target.value,
                      label: item?.name || selectedNode.data.label,
                      description: item?.description || selectedNode.data.description,
                    });
                  }}
                >
                  {catalog.map(item => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}
                </select>
              </label>
              <label>
                Đầu ra nghiệm thu
                <textarea
                  className="form-control"
                  disabled={!structureEditable}
                  rows={4}
                  value={selectedNode.data.description}
                  onChange={event => updateSelectedNode({ description: event.target.value })}
                />
              </label>
              <label className="workflow-check-row">
                <input
                  type="checkbox"
                  disabled={!structureEditable}
                  checked={Boolean(selectedNode.data.requiresGovSubmission)}
                  onChange={event => updateSelectedNode({ requiresGovSubmission: event.target.checked })}
                />
                Yêu cầu nộp cơ quan nhà nước (tự tạo hồ sơ Pháp lý khi bắt đầu)
              </label>
              <label className="workflow-check-row">
                <input
                  type="checkbox"
                  disabled={!structureEditable}
                  checked={Boolean(selectedNode.data.createsSurveyRecord)}
                  onChange={event => updateSelectedNode({ createsSurveyRecord: event.target.checked })}
                />
                Bước đo vẽ (tự tạo hồ sơ Đo vẽ khi bắt đầu)
              </label>
              <label className="workflow-check-row">
                <input
                  type="checkbox"
                  disabled={!structureEditable}
                  checked={Boolean(selectedNode.data.isHandover)}
                  onChange={event => updateSelectedNode({ isHandover: event.target.checked })}
                />
                Bước bàn giao (mở cổng công nợ — phải thu đủ tiền mới đóng được)
              </label>
              <div className="workflow-duration">
                <span className="workflow-duration__label">Thời hạn xử lý — tính từ lúc nhân viên bấm bắt đầu</span>
                <div className="workflow-duration__inputs">
                  <label>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      disabled={!structureEditable}
                      value={selectedNode.data.durationDays ?? ''}
                      onChange={event => updateSelectedNode({ durationDays: event.target.value })}
                    />
                    ngày
                  </label>
                  <label>
                    <input
                      type="number"
                      min="0"
                      max="23"
                      className="form-control"
                      disabled={!structureEditable}
                      value={selectedNode.data.durationHours ?? ''}
                      onChange={event => updateSelectedNode({ durationHours: event.target.value })}
                    />
                    giờ
                  </label>
                </div>
                <small>Để trống nếu bước này không đặt hạn.</small>
              </div>
              <button
                type="button"
                disabled={!structureEditable}
                className={`workflow-start-button${startNode === selectedNode.id ? ' active' : ''}`}
                onClick={() => setStartNode(selectedNode.id)}
              >
                <CheckCircle2 size={16} />
                {startNode === selectedNode.id ? 'Đây là Node bắt đầu' : 'Đặt làm Node bắt đầu'}
              </button>
              </>
              )}
            </div>
          ) : inspectorTab === 'checklist' ? (
            <div className="workflow-inspector__content">
              <div className={`workflow-node-deadline-banner${selectedNode.data.isOverdue ? ' is-overdue' : ''}`}>
                <Clock3 size={16} />
                <span>Hạn chung của toàn bộ checklist trong Node</span>
                <strong>{selectedNode.data.deadlineAt ? formatDateTime(selectedNode.data.deadlineAt) : 'Được tính khi nhân viên bắt đầu Node'}</strong>
              </div>
              <div className="workflow-inspector__section-title">
                <div><span>Danh sách nghiệm thu</span><strong>{selectedNode.data.checklist.length} mục</strong></div>
                <button type="button" disabled={!checklistEditable} className="workspace-round-button" onClick={addChecklistItem}><Plus size={16} /></button>
              </div>
              {selectedNode.data.checklist.length === 0 ? (
                <div className="workflow-inspector__empty compact">
                  <ListChecks size={24} />
                  <span>Chưa có checklist. Thêm mục để định nghĩa điều kiện Pass.</span>
                </div>
              ) : selectedNode.data.checklist.map((item, index) => (
                <div className="workflow-checklist-card" key={item.key || index}>
                  <div className="workflow-checklist-card__heading">
                    <input
                      className="form-control"
                      disabled={!checklistEditable}
                      value={item.name || ''}
                      onChange={event => updateChecklistItem(index, { name: event.target.value })}
                    />
                    <button
                      type="button"
                      className="danger-icon-button"
                      disabled={!checklistEditable}
                      onClick={() => removeChecklistItem(index)}
                      title="Xóa mục checklist"
                      aria-label={`Xóa ${item.name || `checklist ${index + 1}`}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <label className="workflow-check-row">
                    <input
                      type="checkbox"
                      disabled={!checklistEditable}
                      checked={item.required !== false}
                      onChange={event => updateChecklistItem(index, { required: event.target.checked })}
                    />
                    Bắt buộc hoàn thành
                  </label>
                  <label>
                    Người phụ trách checklist
                    <select
                      className="form-control"
                      disabled={!checklistEditable}
                      value={item.assignee_employee_id || ''}
                      onChange={event => updateChecklistItem(index, { assignee_employee_id: event.target.value || null })}
                    >
                      <option value="">Theo phân công chung của Node</option>
                      {(selectedNode.data.assignments || []).map(assignment => (
                        <option key={assignment.employee_id} value={assignment.employee_id}>
                          {assignment.full_name || employees.find(employee => employee.id === assignment.employee_id)?.full_name || assignment.employee_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Vai trò duyệt
                    <select
                      className="form-control"
                      disabled={!checklistEditable}
                      value={item.approver_role || 'admin'}
                      onChange={event => updateChecklistItem(index, { approver_role: event.target.value })}
                    >
                      {APPROVER_ROLES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  </label>
                  <div className={`workflow-checklist-evidence${item.require_evidence ? ' active' : ''}`}>
                    <label className="workflow-check-row">
                      <input
                        type="checkbox"
                        disabled={!checklistEditable}
                        checked={Boolean(item.require_evidence)}
                        onChange={event => updateChecklistItem(index, { require_evidence: event.target.checked })}
                      />
                      <FileCheck2 size={15} /> Checklist này bắt buộc có minh chứng
                    </label>
                    {item.require_evidence && (
                      <>
                        <textarea
                          className="form-control"
                          rows={2}
                          disabled={!checklistEditable}
                          placeholder="Mô tả file/ảnh cần nộp, ví dụ: ảnh hiện trạng và file tọa độ GPS"
                          value={item.evidence_description || ''}
                          onChange={event => updateChecklistItem(index, { evidence_description: event.target.value })}
                        />
                        {safeExternalUrl(item.drive_folder_url || item.runtime?.evidence_data?.drive_folder_url) && (
                          <a
                            className="workflow-evidence-link"
                            href={safeExternalUrl(item.drive_folder_url || item.runtime?.evidence_data?.drive_folder_url)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FolderOpen size={14} /> Mở liên kết minh chứng cũ <ExternalLink size={12} />
                          </a>
                        )}
                        <small>Nhân viên nộp file trực tiếp lên MinIO khi thực hiện checklist; không cần khai báo link Google Drive.</small>
                        <div className="workflow-evidence-files">
                          <span>File minh chứng đã nộp</span>
                          {(item.runtime?.evidence_data?.files || []).length > 0 ? (
                            item.runtime.evidence_data.files.map((file, fileIndex) => (
                              safeExternalUrl(file.url) ? (
                                <a key={`${file.url}-${fileIndex}`} href={safeExternalUrl(file.url)} target="_blank" rel="noreferrer">
                                  <FileCheck2 size={13} /> {file.name || `Minh chứng ${fileIndex + 1}`}
                                  <ExternalLink size={11} />
                                </a>
                              ) : (
                                <span key={`${file.name}-${fileIndex}`}><FileCheck2 size={13} /> {file.name || `Minh chứng ${fileIndex + 1}`}</span>
                              )
                            ))
                          ) : (
                            <small>Chưa có file minh chứng nào trong dữ liệu thực thi.</small>
                          )}
                        </div>
                      </>
                    )}
                    {['pending_approval', 'late_pending_approval'].includes(item.runtime?.status) && canReviewChecklist && (
                      <div className="workflow-evidence-review">
                        <span><CircleDashed size={13} /> {item.runtime.status === 'late_pending_approval' ? 'Nộp trễ, chờ duyệt' : 'Đã nộp, chờ duyệt'}</span>
                        {item.runtime.is_overdue && <small>Lý do trễ: {item.runtime.late_reason || 'Chưa ghi nhận'}</small>}
                        <div className="workflow-evidence-review__actions">
                          {item.runtime.status !== 'late_pending_approval' && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={reviewingChecklistId === item.runtime.id}
                              onClick={() => reviewChecklistEvidence(item.runtime.id, 'failed')}
                            >
                              <XCircle size={14} /> Từ chối
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={reviewingChecklistId === item.runtime.id}
                            onClick={() => reviewChecklistEvidence(item.runtime.id, 'approved')}
                          >
                            <CheckCircle2 size={14} /> Duyệt đạt
                          </button>
                        </div>
                      </div>
                    )}
                    {['approved', 'late_approved'].includes(item.runtime?.status) && (
                      <span className="workflow-evidence-decision workflow-evidence-decision--passed"><CheckCircle2 size={13} /> {item.runtime.status === 'late_approved' ? 'Đã duyệt trễ hạn' : 'Đã duyệt đạt'}</span>
                    )}
                    {item.runtime?.status === 'failed' && (
                      <span className="workflow-evidence-decision workflow-evidence-decision--failed"><XCircle size={13} /> Đã từ chối — chờ nhân viên nộp lại</span>
                    )}
                  </div>
                  {canViewCompensation && (
                    <div className={`workflow-checklist-pay${item.compensation?.is_payable ? ' active' : ''}`}>
                      <label className="workflow-check-row">
                        <input
                          type="checkbox"
                          disabled={!checklistEditable || !canManageCompensation}
                          checked={Boolean(item.compensation?.is_payable)}
                          onChange={event => {
                            const workItemId = item.compensation?.work_item_id || workItems[0]?.id || '';
                            updateChecklistItem(index, {
                              compensation: event.target.checked ? {
                                is_payable: true,
                                work_item_id: workItemId,
                                pay_scope: 'ONCE_PER_WORKFLOW',
                                pay_key: workItemId,
                                pay_group_key: workItemId,
                              } : { is_payable: false },
                            });
                          }}
                        />
                        <Banknote size={15} /> Có tính lương khoán khi nghiệm thu
                      </label>
                      {item.compensation?.is_payable && (
                        <>
                          <select
                            className="form-control"
                            disabled={!checklistEditable || !canManageCompensation}
                            value={item.compensation.work_item_id || ''}
                            onChange={event => updateChecklistItem(index, {
                              compensation: {
                                ...item.compensation,
                                work_item_id: event.target.value,
                                pay_key: event.target.value,
                                pay_group_key: event.target.value,
                              },
                            })}
                          >
                            <option value="">Chọn công việc khoán</option>
                            {workItems.map(workItem => (
                              <option key={workItem.id} value={workItem.id}>{workItem.name}</option>
                            ))}
                          </select>
                          <div className="workflow-checklist-pay__rates">
                            {(workItemById.get(item.compensation.work_item_id)?.rates || []).map(rate => (
                              <span key={rate.id}>
                                {roleLabel(rate.role_code)}: <strong>{formatMoney(rate.amount)}</strong>
                              </span>
                            ))}
                          </div>
                          <small>Khóa theo người và vai trò đã phân công; chỉ phát sinh thu nhập sau khi checklist Pass và Node được nghiệm thu.</small>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!checklistEditable && selectedNode.data.taskNodeId && (
                <div className="workflow-note-box">
                  <LockKeyhole size={16} /> Node đã bắt đầu nên danh sách nghiệm thu được khóa; bản sửa đổi chỉ được đổi đường chuyển bước hoặc thêm Node mới.
                </div>
              )}
            </div>
          ) : inspectorTab === 'assignment' ? (
            <div className="workflow-inspector__content workflow-assignment-panel">
              <div className="workflow-inspector__section-title">
                <div>
                  <span>Người thực hiện checklist trong Node</span>
                  <strong>{selectedNode.data.assignments?.length || 0} người</strong>
                </div>
                <button
                  type="button"
                  disabled={!canEditSelectedAssignments || employees.length === 0}
                  className="workspace-round-button"
                  onClick={addAssignment}
                  title="Thêm người thực hiện"
                >
                  <UserPlus size={16} />
                </button>
              </div>

              {employees.length === 0 ? (
                <div className="workflow-inspector__empty compact">
                  <UserRoundCog size={24} />
                  <span>Chưa có nhân viên đang hoạt động trong database.</span>
                </div>
              ) : !(selectedNode.data.assignments || []).length ? (
                <div className="workflow-inspector__empty compact">
                  <UserRoundCog size={24} />
                  <span>Node này chưa được phân công. Có thể kích hoạt trước và phân công sau.</span>
                </div>
              ) : (selectedNode.data.assignments || []).map((assignment, index) => {
                const payLines = canViewCompensation ? projectedPayLines(selectedNode, assignment) : [];
                const projectedAmount = payLines.reduce((sum, line) => sum + line.amount, 0);
                return (
                <article className="workflow-assignment-card" key={`${assignment.employee_id}-${assignment.role_code}-${index}`}>
                  <header>
                    <div>
                      <span>Phân công {index + 1}</span>
                      <strong>{assignment.full_name || employees.find(item => item.id === assignment.employee_id)?.full_name || 'Nhân viên'}</strong>
                    </div>
                    <button type="button" disabled={!canEditSelectedAssignments} onClick={() => removeAssignment(index)} title="Bỏ phân công">
                      <X size={15} />
                    </button>
                  </header>
                  <label>
                    Nhân viên
                    <select
                      className="form-control"
                      disabled={!canEditSelectedAssignments}
                      value={assignment.employee_id || ''}
                      onChange={event => updateAssignment(index, { employee_id: event.target.value })}
                    >
                      {employees.map(employee => (
                        <option key={employee.id} value={employee.id}>
                          {employee.full_name} · {employee.department_name || employee.job_title || 'Chưa có phòng ban'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Vai trò
                    <select
                      className="form-control"
                      disabled={!canEditSelectedAssignments}
                      value={assignment.role_code || 'MAIN'}
                      onChange={event => updateAssignment(index, { role_code: event.target.value })}
                    >
                      {ASSIGNMENT_ROLES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  </label>
                  <label className="workflow-check-row">
                    <input
                      type="checkbox"
                      disabled={!canEditSelectedAssignments}
                      checked={Boolean(assignment.is_primary)}
                      onChange={event => updateAssignment(index, { is_primary: event.target.checked })}
                    />
                    Người chịu trách nhiệm chính · {roleLabel(assignment.role_code || 'MAIN')}
                  </label>
                  {canViewCompensation && (
                    <div className={`workflow-assignment-card__pay${projectedAmount > 0 ? ' active' : ''}`}>
                      <div>
                        <span><Banknote size={14} /> Khoán dự kiến</span>
                        <strong>{formatMoney(projectedAmount)}</strong>
                      </div>
                      {payLines.length > 0 ? payLines.map(line => (
                        <small key={`${line.checklistKey}-${line.workItemName}`}>
                          {line.workItemName} · {roleLabel(assignment.role_code)}: {formatMoney(line.amount)}
                        </small>
                      )) : (
                        <small>Chưa có checklist khoán phù hợp với vai trò này.</small>
                      )}
                      <em>Đây là mức dự kiến, chưa phải lương đã nhận.</em>
                    </div>
                  )}
                </article>
                );
              })}

              <div className="workflow-note-box">
                <LockKeyhole size={16} />
                {isWorkflowCancelled
                  ? 'Quy trình đã hủy. Phân công, checklist, minh chứng và khoản khoán đã nghiệm thu chỉ còn ở chế độ đối chiếu.'
                  : hasActiveRuntime
                  ? 'Bấm “Lưu tạm” để giữ phần đang sửa mà không ảnh hưởng quy trình thật; chỉ “Áp dụng” mới có hiệu lực ngay.'
                  : 'Phân công được lưu chung với quy trình khi bấm “Lưu tạm”. Mức khoán lấy từ checklist và khóa khi Giám đốc kích hoạt.'}
              </div>
            </div>
          ) : (
            <div className="workflow-inspector__content">
              <div className="workflow-inspector__section-title">
                <div><span>Đường chuyển bước</span><strong>{edges.filter(edge => edge.source === selectedNode.id).length} nhánh</strong></div>
              </div>
              {edges.filter(edge => edge.source === selectedNode.id).map(edge => (
                <div className="workflow-transition-card" key={edge.id}>
                  <GitBranch size={16} />
                  <div>
                    <select
                      className="form-control"
                      disabled={!structureEditable}
                      value={edge.data?.outcomeCode || 'COMPLETED'}
                      onChange={event => updateTransitionOutcome(edge.id, event.target.value)}
                    >
                      {!workflowLabels.outcomes[edge.data?.outcomeCode] && (
                        <option value={edge.data?.outcomeCode}>{edge.data?.outcomeCode}</option>
                      )}
                      {Object.entries(workflowLabels.outcomes).map(([code, label]) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                    </select>
                    <strong>→ {nodes.find(node => node.id === edge.target)?.data.label || edge.target}</strong>
                  </div>
                </div>
              ))}
              <div className="workflow-note-box">
                <LockKeyhole size={16} />
                Nối từ chấm bên phải sang Node đích, sau đó chọn điều kiện cho từng nhánh. Bản sửa đổi chỉ áp dụng sau khi Giám đốc bấm “Áp dụng sửa đổi”.
              </div>
            </div>
          )}
          </>
          )}
        </aside>

        {/* Nút thu/mở nằm NGOÀI khung: đặt bên trong <aside> thì overflow của khung
            cắt mất nửa nút, nhìn như bị chìm. Ra ngoài mới nổi hẳn lên trên. */}
        <button
          type="button"
          className="workflow-inspector-toggle"
          onClick={() => setInspectorCollapsed(value => !value)}
          title={inspectorCollapsed ? 'Mở khung chi tiết' : 'Thu khung để sơ đồ rộng hơn'}
          aria-label={inspectorCollapsed ? 'Mở khung chi tiết' : 'Thu khung chi tiết'}
        >
          {inspectorCollapsed ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
        </button>
      </div>

      <Modal
        open={Boolean(activationConfirmation)}
        onClose={() => { if (!activating) setActivationConfirmation(null); }}
        closeOnOverlay={!activating}
        title={activationConfirmation?.phase === 'impact-warning'
          ? 'Cảnh báo tác động quy trình đang chạy'
          : 'Xác nhận kích hoạt quy trình'}
        id="workflow-activation-modal"
        footer={(
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={activating}
              onClick={() => setActivationConfirmation(null)}
            >
              Quay lại
            </button>
            <button
              type="button"
              className={`btn ${activationConfirmation?.phase === 'impact-warning' ? 'btn-danger' : 'btn-primary'} workflow-activation-confirm`}
              disabled={activating}
              onClick={confirmWorkflowActivation}
            >
              {activating ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}
              {activationConfirmation?.phase === 'impact-warning'
                ? 'Xác nhận áp dụng'
                : hasActiveRuntime ? 'Áp dụng bản sửa đổi' : 'Kích hoạt'}
            </button>
          </>
        )}
      >
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{activationConfirmation?.message}</p>
        {hasActiveRuntime && activationConfirmation?.phase !== 'impact-warning' && (
          <label style={{ display: 'block', marginTop: 16 }}>
            <span style={{ display: 'block', marginBottom: 6, fontSize: '0.84rem', fontWeight: 700 }}>
              Lý do sửa quy trình <span style={{ color: '#ef4444' }}>*</span>
            </span>
            <textarea
              className="form-control"
              rows={3}
              autoFocus={!activationConfirmation?.amendmentReason}
              value={activationConfirmation?.amendmentReason || ''}
              onChange={event => setActivationConfirmation(current => ({
                ...current,
                amendmentReason: event.target.value,
              }))}
              placeholder="Nhập lý do sửa quy trình đang vận hành..."
            />
          </label>
        )}
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => { if (!cancelling) setCancelOpen(false); }}
        closeOnOverlay={!cancelling}
        title="Hủy quy trình đang vận hành"
        id="workflow-cancellation-modal"
        footer={(
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={cancelling}
              onClick={() => setCancelOpen(false)}
            >
              Quay lại
            </button>
            <button
              type="button"
              className="btn workflow-cancellation-confirm"
              disabled={cancelling || !canSubmitCancellation}
              onClick={cancelCurrentWorkflow}
            >
              {cancelling ? <LoaderCircle size={16} className="spin" /> : <Ban size={16} />}
              Xác nhận hủy
            </button>
          </>
        )}
      >
        <div className="workflow-cancellation-modal">
          <div className="workflow-cancellation-warning">
            <TriangleAlert size={20} />
            <div>
              <strong>Đây là thao tác kết thúc vĩnh viễn phiên vận hành này.</strong>
              <span>Revision, checklist, file minh chứng và lịch sử vẫn được giữ để đối chiếu.</span>
            </div>
          </div>

          <div className="workflow-cancellation-stats">
            <div><strong>{cancellationPreview.open_node_count || 0}</strong><span>Node đang mở sẽ hủy</span></div>
            <div><strong>{cancellationPreview.preserved_node_count || 0}</strong><span>Node hoàn tất được giữ</span></div>
            <div>
              <strong>{formatMoney(cancellationPreview.entitlement_amount || 0)}</strong>
              <span>{cancellationPreview.entitlement_count || 0} khoản khoán giữ nguyên</span>
            </div>
          </div>

          <label>
            Nhóm lý do hủy
            <select
              className="form-control"
              value={cancellationCode}
              onChange={event => setCancellationCode(event.target.value)}
            >
              {CANCELLATION_OPTIONS.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </label>

          <label>
            Lý do chi tiết <span className="form-required">*</span>
            <textarea
              className="form-control"
              rows={3}
              maxLength={1000}
              placeholder="Ghi rõ nguyên nhân để kế toán và nhân viên có thể đối chiếu về sau"
              value={cancellationReason}
              onChange={event => setCancellationReason(event.target.value)}
            />
            <small>Tối thiểu 5 ký tự. Nội dung này được lưu vào lịch sử audit.</small>
          </label>

          {requiresAgencyHandling && (
            <div className="workflow-agency-cancellation">
              <div>
                <TriangleAlert size={17} />
                <strong>Hồ sơ đã đi vào khâu cơ quan nhà nước</strong>
              </div>
              <p>
                Có {cancellationPreview.agency_node_count || 0} Node liên quan K06–K08 đã bắt đầu.
                Cần ghi rõ cách rút hồ sơ, nhận lại giấy tờ hoặc bàn giao người tiếp tục theo dõi.
              </p>
              <textarea
                className="form-control"
                rows={3}
                maxLength={1000}
                placeholder="Phương án xử lý hồ sơ tại cơ quan…"
                value={agencyHandlingNote}
                onChange={event => setAgencyHandlingNote(event.target.value)}
              />
              <label className="workflow-check-row">
                <input
                  type="checkbox"
                  checked={agencyHandlingConfirmed}
                  onChange={event => setAgencyHandlingConfirmed(event.target.checked)}
                />
                Tôi xác nhận đã có người chịu trách nhiệm xử lý hồ sơ tại cơ quan.
              </label>
            </div>
          )}

          <div className="workflow-cancellation-policy">
            <CheckCircle2 size={16} />
            <span>Khoán đã nghiệm thu được giữ nguyên; phân công và khoán chưa nghiệm thu sẽ được đóng.</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
