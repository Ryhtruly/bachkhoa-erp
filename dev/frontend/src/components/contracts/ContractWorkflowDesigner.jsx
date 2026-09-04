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
  useUpdateNodeInternals,
} from '@xyflow/react';
import {
  AlignHorizontalSpaceAround,
  Ban,
  Banknote,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileCheck2,
  GitBranch,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Play,
  Plus,
  Save,
  Star,
  Trash2,
  TriangleAlert,
  UserPlus,
  UserRound,
  UserRoundCog,
  X,
  XCircle,
} from 'lucide-react';
import Modal from '../ui/Modal';
import FilePreviewModal from '../ui/FilePreviewModal';
import CustomSelect from '../ui/CustomSelect';
import { apiFetch, getAccessToken, peekApiCache } from '../../lib/api';
import AvatarImage from '../AvatarImage';
import { registerUnsavedChangesGuard } from '../../lib/unsavedChangesGuard';
import { getGraphFingerprint } from './workflowDirty';
import { isPrivateObjectKey, openPrivateObject } from '../../lib/privateStorage';
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
import DocumentRegister from '../../features/document-register/DocumentRegister';
import GiayDuocMien from '../../features/document-register/GiayDuocMien';
import ThieuTaiLieuKhiNop from '../../features/document-register/ThieuTaiLieuKhiNop';
import NodeChecklistCard from './NodeChecklistCard';
import LegalDossierNodePanel from '../../features/legal-dossier/LegalDossierNodePanel';
import NodeAgencyPanel from './NodeAgencyPanel';
import {
  calculateWorkflowProgress,
  formatWorkflowDuration,
} from './workflowProgress';
import { neoTuyenVaoHandle, pathMidpoint } from './workflowEdgeRouting';

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

const OUTPUT_DOCUMENT_SOURCE_GROUPS = [
  {
    key: 'KHACH_HANG',
    label: 'Khách hàng cung cấp',
    hint: 'Giấy khách gửi ban đầu hoặc bổ sung sau.',
  },
  {
    key: 'CONG_TY',
    label: 'Công ty soạn/lập',
    hint: 'Bản vẽ, biểu mẫu, sản phẩm kỹ thuật do công ty tạo.',
  },
  {
    key: 'CO_QUAN',
    label: 'Cơ quan nhà nước trả',
    hint: 'Biên nhận, giấy hẹn, kết quả từ cơ quan.',
  },
];

const HARD_COPY_CUSTOMER_DOCUMENT_NAME_KEYS = new Set([
  'giay chung nhan quyen su dung dat so do so hong',
  'so do goc',
  'cccd cmnd cua chu su dung dat',
]);

const boDauTiengViet = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase();

const outputDocumentSourceKey = template => {
  const raw = boDauTiengViet(
    template?.source || template?.source_code || template?.source_key || template?.source_label || ''
  );
  if (raw.includes('khach')) return 'KHACH_HANG';
  if (raw.includes('cong ty') || raw.includes('cong_ty') || raw.includes('cong')) return 'CONG_TY';
  if (raw.includes('co quan') || raw.includes('co_quan') || raw.includes('nha nuoc')) return 'CO_QUAN';
  return 'KHAC';
};

const outputDocumentNameKey = value => boDauTiengViet(value)
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const isHardCopyCustomerDocument = template => (
  outputDocumentSourceKey(template) !== 'KHACH_HANG'
  || HARD_COPY_CUSTOMER_DOCUMENT_NAME_KEYS.has(outputDocumentNameKey(template?.name))
);

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
const formatShortDateTime = value => {
  if (!value) return '—';
  const d = new Date(value);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const day = d.getDate();
  const month = d.getMonth() + 1;
  return `${hours}:${minutes} · ${day}/${month}`;
};
const visibleNodeAssignments = (data = {}) => {
  const runtimeAssignments = Array.isArray(data.runtimeAssignments) ? data.runtimeAssignments : [];
  if (runtimeAssignments.length) return runtimeAssignments;
  const visibleAssignments = Array.isArray(data.visibleAssignments) ? data.visibleAssignments : [];
  if (visibleAssignments.length) return visibleAssignments;
  return Array.isArray(data.assignments) ? data.assignments : [];
};

function WorkflowElapsed({ startedAt, completedAt, actualDurationSeconds, status }) {
  const running = status === 'in_progress' && Boolean(startedAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const timerId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [running]);
  if (!startedAt && !actualDurationSeconds) return null;
  const seconds = actualDurationSeconds
    || Math.max(0, Math.floor(((completedAt ? new Date(completedAt).getTime() : now) - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const label = [hours, minutes, rest].map(value => String(value).padStart(2, '0')).join(':');
  return <time className={`workflow-node__timer${running ? ' is-running' : ''}`}>⏱ {label}</time>;
}

function WorkflowNode({ id, data, selected }) {
  const status = data.executionStatus || 'pending';
  const assignmentsForDisplay = visibleNodeAssignments(data);
  const incomingHandles = data.incomingHandles?.length
    ? data.incomingHandles
    : [{ id: 'in:default' }];
  const outgoingHandles = data.outgoingHandles?.length
    ? data.outgoingHandles
    : [{ id: 'out:default' }];

  // React Flow chỉ đo vị trí các điểm nối một lần lúc node xuất hiện. Node ở đây
  // sinh điểm nối động theo số nhánh, và component không bị dựng lại khi số nhánh
  // đổi — nên bảng vị trí giữ nguyên bản cũ. Hậu quả: lúc thả chuột nó không tìm
  // ra điểm nối của node đích, quay sang tóm chính điểm vừa kéo ra rồi bỏ kết nối.
  const updateNodeInternals = useUpdateNodeInternals();
  const handleKey = `${incomingHandles.map(h => h.id).join('|')}#${outgoingHandles.map(h => h.id).join('|')}`;
  useEffect(() => {
    if (id) updateNodeInternals(id);
  }, [id, handleKey, updateNodeInternals]);

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
      <div className="workflow-node__meta">
        <span><ListChecks size={13} /> {data.checklist?.length || 0} mục</span>
        <span>
          <UserRoundCog size={13} />
          {assignmentsForDisplay.length
            ? `${assignmentsForDisplay.length} người`
            : (data.poolDepartmentLabel || 'Chưa cấu hình')}
        </span>
      </div>
      {data.deadlineAt && (
        <div className={`workflow-node__deadline${data.isOverdue ? ' is-overdue' : ''}`}>
          <Clock3 size={13} /> Hạn chung: {formatDateTime(data.deadlineAt)}
        </div>
      )}
      {Boolean(assignmentsForDisplay.length)
        && Boolean(data.startedAt || ['in_progress', 'submitted', 'rework_required', 'blocked', 'accepted'].includes(status)) && (
        <div className={`workflow-node__team${status === 'in_progress' ? ' is-active' : ''}`}>
          <div className="workflow-node__avatars">
            {assignmentsForDisplay.slice(0, 4).map((assignment, index) => {
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
            {assignmentsForDisplay.length > 4 && (
              <span className="workflow-node__avatar workflow-node__avatar--more" title={`+${assignmentsForDisplay.length - 4} người khác`}>
                +{assignmentsForDisplay.length - 4}
              </span>
            )}
          </div>
          <div className="workflow-node__role-chips">
            {assignmentsForDisplay.slice(0, 2).map((assignment, index) => (
              <span
                key={`${assignment.employee_id || index}:role`}
                className={`workflow-node__role-chip workflow-node__role-chip--${(assignment.role_code || 'MAIN').toLowerCase()}`}
              >
                {assignment.role_code === 'MAIN' ? 'Chính' : assignment.role_code === 'ASSISTANT' ? 'Phụ' : roleLabel(assignment.role_code)}: {(assignment.full_name || 'NV').split(' ').at(-1)}
              </span>
            ))}
          </div>
        </div>
      )}
      <WorkflowElapsed
        startedAt={data.startedAt}
        completedAt={data.completedAt}
        actualDurationSeconds={data.actualDurationSeconds}
        status={status}
      />
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
// Chỉ dùng khi React Flow chưa kịp đo node (lần dựng đầu). Node thật cao thấp
// khác nhau tuỳ có avatar/hạn chung hay không, nên không con số cố định nào đúng
// cho mọi node — phải đọc kích thước đo được.
const WORKFLOW_NODE_WIDTH = 254;
const WORKFLOW_NODE_HEIGHT = 109;
let elkInstancePromise;

function getElkInstance() {
  if (!elkInstancePromise) {
    elkInstancePromise = import('elkjs/lib/elk.bundled.js')
      .then(module => new module.default());
  }
  return elkInstancePromise;
}

export function WorkflowEdge({
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
    const diemDaNeo = neoTuyenVaoHandle(
      routedPoints,
      pathParams.sourceX,
      pathParams.sourceY,
      pathParams.targetX,
      pathParams.targetY,
    );
    const edgePath = diemDaNeo
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
    const midpoint = pathMidpoint(diemDaNeo);
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

const POOL_DEPARTMENTS = [
  ['SALES', 'Phòng Sale/CSKH'],
  ['SURVEY', 'Phòng Đo vẽ'],
  ['LEGAL', 'Phòng Pháp lý'],
  ['ACCOUNTING', 'Phòng Kế toán'],
  ['ADMIN', 'Ban Giám đốc'],
];

const DEFAULT_POOL_BY_NODE_CODE = {
  K01: { department: 'SALES', roles: ['MAIN'] },
  K02: { department: 'SURVEY', roles: ['MAIN', 'ASSISTANT'] },
  K03: { department: 'SURVEY', roles: ['MAIN'] },
  K04: { department: 'LEGAL', roles: ['MAIN'] },
  K05: { department: 'LEGAL', roles: ['SUBMITTER'] },
  K06: { department: 'LEGAL', roles: ['MAIN'] },
  K07: { department: 'LEGAL', roles: ['MAIN'] },
};

const poolDefaults = code => DEFAULT_POOL_BY_NODE_CODE[code] || { department: '', roles: [] };
const poolDepartmentLabel = code => POOL_DEPARTMENTS.find(item => item[0] === code)?.[1] || code;

const APPROVER_ROLES = [
  ['admin', 'Giám đốc'],
  ['accountant', 'Kế toán'],
  ['legal_staff', 'Nhân viên pháp lý'],
  ['survey_staff', 'Nhân viên đo vẽ'],
  ['sales', 'Sales'],
];

const roleLabel = code => ASSIGNMENT_ROLES.find(item => item[0] === code)?.[1] || code;

function RoleMultiSelect({
  label,
  value = [],
  options = [],
  disabled = false,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = Array.isArray(value) ? value : [];
  const selectedLabel = selected.length
    ? selected.map(roleLabel).join(', ')
    : '— Chọn vai trò —';

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = event => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);

  const toggleRole = roleCode => {
    const next = selected.includes(roleCode)
      ? selected.filter(item => item !== roleCode)
      : [...selected, roleCode];
    onChange?.(next);
  };

  return (
    <div
      ref={containerRef}
      className={`custom-select-container workflow-role-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}
    >
      <span className="custom-select-label">{label}</span>
      <button
        type="button"
        className="custom-select-trigger"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(prev => !prev)}
      >
        <span className={`custom-select-value ${selected.length ? '' : 'is-placeholder'}`}>
          {selectedLabel}
        </span>
        <ChevronDown size={16} className="custom-select-chevron" />
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" aria-label={label}>
          {options.map(([code, optionLabel]) => {
            const checked = selected.includes(code);
            return (
              <button
                key={code}
                type="button"
                className={`custom-select-option ${checked ? 'is-selected' : ''}`}
                role="option"
                aria-selected={checked}
                onClick={() => toggleRole(code)}
              >
                <span className="custom-select-option-check">{checked && <Check size={15} />}</span>
                <span className="custom-select-option-text">{optionLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detailMessage = typeof payload.detail === 'string'
      ? payload.detail
      : payload.detail?.message;
    const error = new Error(detailMessage || payload.message || 'Không thể cập nhật workflow');
    error.status = response.status;
    error.detail = payload.detail;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function makeFallbackGraph(catalog = []) {
  const preferredCodes = ['K01', 'K02', 'K07'];
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
      pool_department_code: poolDefaults(item.code).department,
      claim_roles: poolDefaults(item.code).roles,
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
    const definitionAssignments = Array.isArray(value.assignments) ? value.assignments : [];
    const runtimeAssignments = Array.isArray(execution?.assignments) ? execution.assignments : [];
    const assignments = options.preferDefinitionAssignments
      ? definitionAssignments
      : (runtimeAssignments.length ? runtimeAssignments : definitionAssignments);
    const visibleAssignments = runtimeAssignments.length ? runtimeAssignments : assignments;
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
        assignments,
        runtimeAssignments,
        visibleAssignments,
        poolDepartmentCode: Object.hasOwn(value, 'pool_department_code')
          ? (value.pool_department_code || '')
          : poolDefaults(value.task_code).department,
        poolDepartmentLabel: poolDepartmentLabel(
          Object.hasOwn(value, 'pool_department_code')
            ? (value.pool_department_code || '')
            : poolDefaults(value.task_code).department
        ),
        claimRoles: Object.hasOwn(value, 'claim_roles') && Array.isArray(value.claim_roles)
          ? value.claim_roles
          : poolDefaults(value.task_code).roles,
        taskNodeId: execution?.id || null,
        requiresGovSubmission: Boolean(value.requires_gov_submission),
        createsSurveyRecord: Boolean(value.creates_survey_record),
        isHandover: Boolean(value.is_handover),
        durationDays: value.duration_days ?? '',
        durationHours: value.duration_hours ?? '',
        durationMinutes: value.duration_minutes ?? '',
        executionStatus: execution?.status || 'pending',
        startedAt: execution?.started_at || null,
        completedAt: execution?.completed_at || null,
        actualDurationSeconds: Number(execution?.execution_data?.actual_duration_seconds || 0),
        deadlineAt: execution?.deadline_at || null,
        isOverdue: Boolean(execution?.is_overdue),
        executionStatusLabel: labels.node_statuses[execution?.status || 'pending'],
        outcome: execution?.outcome || '',
        transitions: value.transitions || {},
        pendingAcceptanceId: execution?.pending_acceptance_id || null,
        pendingMissing: execution?.pending_missing || [],
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
      duration_minutes: Number(node.data.durationMinutes) || 0,
      checklist: (node.data.checklist || []).map(item => {
        const { runtime: _runtime, evidence_required: _legacyEvidence, ...definition } = item;
        return definition;
      }),
      assignments: node.data.assignments || [],
      pool_department_code: node.data.poolDepartmentCode || null,
      claim_roles: node.data.claimRoles || [],
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
      // Chỉ đính kèm khi thật sự có cấu hình. Checklist cũ giữ nguyên payload,
      // không mọc thêm khoá nào — backend cũng từ chối field lạ.
      ...((item.output_documents || []).length
        ? {
            output_documents: item.output_documents
              .filter(doc => doc.template_id)
              .map(doc => ({
                template_id: doc.template_id,
                min_count: Math.max(1, Number(doc.min_count) || 1),
                required_before_submit: doc.required_before_submit !== false,
                needs_director_approval: Boolean(doc.needs_director_approval),
              })),
          }
        : {}),
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
    duration_minutes: Number(node.duration_minutes) || 0,
    pool_department_code: node.pool_department_code || null,
    claim_roles: [...(node.claim_roles || [])].sort(),
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

// Tiền trên thanh tiến độ K06 in dạng số thuần kèm "VND", không dùng ký hiệu ₫:
// hai số đứng cạnh nhau qua dấu gạch chéo, thêm ký hiệu vào là dòng dài gấp rưỡi
// và rối mắt.
const formatMoneyPlain = (value) => new Intl.NumberFormat('vi-VN').format(Number(value) || 0);

const DOC_TEMPLATES_URL = '/api/document-register/templates';

/** Hai bước nộp cơ quan có khối riêng phía Giám đốc. K06 vẫn dùng khối cũ. */
const AGENCY_NODE_CODES = new Set(['K05a', 'K05b']);

const hasRuntimeDocumentTypes = item => Object.hasOwn(item?.runtime || {}, 'document_types');

const registerUrlOf = (contractId, serviceLineId) => (
  `/api/document-register/register?contract_id=${encodeURIComponent(contractId)}`
  + `&service_line_id=${encodeURIComponent(serviceLineId)}`
);

/** Gộp mọi Dạng hồ sơ thành một danh sách phẳng: quy trình dùng chung cho nhiều
 *  Hạng mục nên không lọc theo một thủ tục cụ thể ở đây.
 *
 *  API trả {status, data:{groups}}; apiFetch KHÔNG bóc lớp data. Bản trước đọc
 *  thẳng payload.groups nên luôn ra rỗng — dropdown "Chọn loại tài liệu" chưa
 *  bao giờ có lựa chọn nào, mà không ai thấy vì nó im lặng rơi về mảng rỗng.
 *
 *  Trả null khi chưa có payload, để bên gọi phân biệt "chưa nạp" với "nạp rồi
 *  mà rỗng" — hai thứ đó vẽ ra hai thứ khác nhau.
 */
function flattenDocTemplates(payload) {
  if (!payload) return null;
  return ((payload?.data?.groups) || payload?.groups || [])
    .flatMap(group => (group.items || []).map(item => ({ ...item, group: group.task_type_name })))
    .filter(item => item.is_active);
}

export default function ContractWorkflowDesigner({
  serviceLine,
  // Cần cho sổ giấy tờ hiện ngay trong panel duyệt K01: Giám đốc phải thấy
  // giấy nào được miễn TRƯỚC khi bấm duyệt đạt, không phải mở sang màn khác.
  contractId = '',
  catalog = EMPTY_CATALOG,
  // template_id -> node_code theo Master Data, ĐÃ lọc theo Gói + Hạng mục của
  // chính hạng mục này. Truyền thẳng thì bỏ qua bước tự nạp.
  plannedNodeByTemplate: plannedNodeByTemplateProp,
  templates = [],
  employees = [],
  workItems = [],
  // Tiền hợp đồng cho thanh tiến độ ở Node K06 — bước đó chỉ đóng được khi đã
  // thu đủ, nên Giám đốc phải thấy ngay tại chỗ thay vì mở sang màn Thu chi.
  contractTotalValue = 0,
  contractPaidAmount = 0,
  // Hai chỗ nối luồng duyệt TỪNG TỜ giấy trong checklist. Chưa truyền thì nút
  // duyệt/từ chối hiện disabled kèm tooltip — không để nút bấm vào rồi im lặng.
  onApproveDocument,
  onRejectDocument,
  // Chốt đợt duyệt: gom mọi phán quyết vừa ghi thành ĐÚNG MỘT thông báo.
  onFlushReviewBatch,
  // Chừa sẵn cho luồng Nhân viên gửi nghiệm thu ở đợt sau. Đổi tên biến cục bộ
  // để lint không kêu chưa dùng, nhưng TÊN PROP giữ nguyên cho bên gọi.
  onSubmitReview: _onSubmitReview,
  // Danh mục loại giấy tờ để Giám đốc chọn tài liệu đầu ra. Truyền từ ngoài vào
  // được (test dựng sẵn), không truyền thì tự nạp.
  documentTemplates = null,
  capabilities = {},
  onPersisted,
  addToast,
  targetNodeKey,
  targetType,
  targetNonce,
}) {
  // Gieo từ cache NGAY lúc render. Chỉ dựa vào effect thì khung hình đầu tiên
  // luôn chưa có danh mục, nên mọi dòng giấy hiện "Tài liệu chưa rõ" rồi giật
  // một cái khi dữ liệu về.
  const [loadedDocTemplates, setLoadedDocTemplates] = useState(
    () => flattenDocTemplates(peekApiCache(DOC_TEMPLATES_URL)),
  );
  const docTemplates = documentTemplates ?? loadedDocTemplates ?? [];

  // Nạp KHI CẦN, không nạp lúc mở designer: phần lớn quy trình không dùng tài
  // liệu đầu ra, và một request cho thứ không ai mở tới là request thừa.
  // Bản đồ loại giấy → bước, lấy từ CHÍNH sổ giấy tờ của hạng mục này — cùng
  // nguồn Tủ hồ sơ ở sidebar đang dùng. Không tự lọc từ danh mục mẫu toàn hệ
  // thống: danh mục đó gộp mọi Gói và mọi Hạng mục, lọc theo mỗi node sẽ vơ cả
  // giấy của gói khác về (K01 có 5 loại thì lôi về 16).
  const [loadedPlannedNode, setLoadedPlannedNode] = useState(() => (
    contractId && serviceLine?.id
      ? (peekApiCache(registerUrlOf(contractId, serviceLine.id))?.planned_node_by_template ?? null)
      : null
  ));
  // Giữ luôn các nhóm giấy của sổ. Cùng một lượt gọi, và đây mới là nguồn đúng
  // cho ô chọn tài liệu đầu ra — xem outputDocumentGroups.
  const [registerGroups, setRegisterGroups] = useState(() => (
    contractId && serviceLine?.id
      ? (peekApiCache(registerUrlOf(contractId, serviceLine.id))?.groups ?? null)
      : null
  ));
  const plannedNodeByTemplate = plannedNodeByTemplateProp ?? loadedPlannedNode ?? {};

  useEffect(() => {
    if (plannedNodeByTemplateProp || loadedPlannedNode !== null) return;
    if (!contractId || !serviceLine?.id) return;
    setLoadedPlannedNode({});
    apiFetch(registerUrlOf(contractId, serviceLine.id))
      .then(payload => {
        setLoadedPlannedNode(payload?.planned_node_by_template || {});
        setRegisterGroups(payload?.groups || []);
      })
      .catch(() => { setLoadedPlannedNode({}); setRegisterGroups([]); });
  }, [plannedNodeByTemplateProp, loadedPlannedNode, contractId, serviceLine?.id]);

  // Tách "đang nạp" khỏi "nạp xong mà rỗng". Trước đây cả hai cùng là mảng rỗng
  // nên lúc chưa có danh mục, mọi dòng giấy bị khẳng định là "Tài liệu chưa rõ".
  const [loadingDocTemplates, setLoadingDocTemplates] = useState(false);
  const docTemplatesReady = Boolean(documentTemplates) || loadedDocTemplates !== null;

  const ensureDocTemplates = useCallback(() => {
    if (documentTemplates || loadedDocTemplates !== null || loadingDocTemplates) return;
    setLoadingDocTemplates(true);
    apiFetch(DOC_TEMPLATES_URL)
      .then(payload => setLoadedDocTemplates(flattenDocTemplates(payload) || []))
      .catch(() => setLoadedDocTemplates([]))
      .finally(() => setLoadingDocTemplates(false));
  }, [documentTemplates, loadedDocTemplates, loadingDocTemplates]);

  const openEvidenceFile = useCallback(async (event, file) => {
    if (!isPrivateObjectKey(file.url)) return;
    event.preventDefault();
    try {
      await openPrivateObject(file.url);
    } catch (error) {
      addToast?.(error.message || 'Không thể mở file minh chứng', 'error');
    }
  }, [addToast]);
  const reviewPreviewUrlRef = useRef('');
  const [reviewDocumentPreview, setReviewDocumentPreview] = useState(null);
  const closeReviewDocumentPreview = useCallback(() => {
    if (reviewPreviewUrlRef.current) URL.revokeObjectURL(reviewPreviewUrlRef.current);
    reviewPreviewUrlRef.current = '';
    setReviewDocumentPreview(null);
  }, []);
  useEffect(() => () => {
    if (reviewPreviewUrlRef.current) URL.revokeObjectURL(reviewPreviewUrlRef.current);
  }, []);
  const openChecklistDocument = useCallback(async (taskNodeId, file) => {
    if (!taskNodeId || !file?.document_id) return;
    try {
      const token = getAccessToken();
      const response = await fetch(
        `/api/employee-portal/tasks/${encodeURIComponent(taskNodeId)}`
          + `/documents/${encodeURIComponent(file.document_id)}/file`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || `Không thể tải file (HTTP ${response.status})`);
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('File không có nội dung.');
      if (reviewPreviewUrlRef.current) URL.revokeObjectURL(reviewPreviewUrlRef.current);
      const url = URL.createObjectURL(blob);
      reviewPreviewUrlRef.current = url;
      setReviewDocumentPreview({
        fileName: file.file_name || 'Tài liệu',
        mimeType: file.content_type || blob.type || '',
        url,
        blob,
      });
    } catch (error) {
      addToast?.(error.message || 'Không thể mở file để duyệt', 'error');
    }
  }, [addToast]);
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

  // Bảng tổng quan phân bổ cần biết TOÀN BỘ danh mục loại giấy, không chỉ những
  // loại đã được gắn. Nạp lười theo thao tác mở trình sửa là quá muộn: Giám đốc
  // mở panel node ra đã phải thấy ngay còn sót bao nhiêu loại.
  useEffect(() => { ensureDocTemplates(); }, [ensureDocTemplates]);

  // PHÂN BỔ TÀI LIỆU — loại giấy nào đã được gắn vào Checklist của bước nào.
  // Không có bảng này thì Giám đốc cấu hình xong không biết mình còn sót loại
  // nào; hậu quả là loại đó không xuất hiện ở bước nào và không ai thu.
  const phanBoTaiLieu = useMemo(() => {
    const cua = new Map();
    nodes.forEach(node => {
      (node.data?.checklist || []).forEach(item => {
        (item.output_documents || []).forEach(doc => {
          if (!doc.template_id) return;
          if (!cua.has(doc.template_id)) cua.set(doc.template_id, []);
          cua.get(doc.template_id).push(`${(node.data.code || node.id).toUpperCase()} · ${item.name || 'Checklist'}`);
        });
      });
    });
    const chuaGan = docTemplates.filter(t => !cua.has(t.id));
    return { cua, chuaGan, daGan: docTemplates.length - chuaGan.length };
  }, [nodes, docTemplates]);
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
  // Kéo-thả sắp xếp checklist trong Node.
  const [dragChecklistIndex, setDragChecklistIndex] = useState(null);
  const [openChecklistPicker, setOpenChecklistPicker] = useState(null);
  const [outputDocumentModalIndex, setOutputDocumentModalIndex] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(workflow?.template?.id || '');
  const [workflowLabels, setWorkflowLabels] = useState(parsed.labels);
  const [saving, setSaving] = useState(false);
  const [startingEdit, setStartingEdit] = useState(false);
  const [activating, setActivating] = useState(false);
  const [layouting, setLayouting] = useState(false);
  const [isSelectingNode, setIsSelectingNode] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const historyRef = useRef({ snapshots: [], index: -1, isRestoring: false });
  const [_canUndo, setCanUndo] = useState(false);
  const [_canRedo, setCanRedo] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [isSavingTemplateInProgress, setIsSavingTemplateInProgress] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [editMode, setEditMode] = useState(!isWorkflowTerminal && (!hasActiveRuntime || hasDraftAmendment));
  const [changeReason, setChangeReason] = useState(workflow?.change_reason || '');
  const [flowInstance, setFlowInstance] = useState(null);
  const [activationConfirmation, setActivationConfirmation] = useState(null);
  const [activationBlockers, setActivationBlockers] = useState(null);
  const [activationWarningConfirmation, setActivationWarningConfirmation] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancellationCode, setCancellationCode] = useState('CUSTOMER_REQUEST');
  const [cancellationReason, setCancellationReason] = useState('');
  const [agencyHandlingConfirmed, setAgencyHandlingConfirmed] = useState(false);
  const [agencyHandlingNote, setAgencyHandlingNote] = useState('');
  const [reviewInboxOpen, setReviewInboxOpen] = useState(false);
  // Các bước vừa được chấm trong phiên duyệt này. Dùng ref chứ không state: nó
  // không vẽ lại gì cả, và đổi state giữa lúc Giám đốc đang bấm là làm danh sách
  // nhảy chỗ dưới tay họ.
  const reviewedNodeIds = useRef(new Set());
  const [savedFingerprint, setSavedFingerprint] = useState(null);
  const [pendingNavigationPrompt, setPendingNavigationPrompt] = useState(null);

  // Sync node/edge state on updates
  useEffect(() => {
    if (!editMode) {
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
      setWorkflowLabels(parsed.labels);
      setSavedFingerprint(getGraphFingerprint(
        flowToGraph(parsed.nodes, parsed.edges, parsed.startNode, parsed.labels)
      ));
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
          runtimeAssignments: fresh.data.runtimeAssignments || [],
          visibleAssignments: (fresh.data.runtimeAssignments || []).length
            ? fresh.data.runtimeAssignments
            : visibleNodeAssignments(node.data),
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

  // Mốc so sánh lúc mở màn và mỗi khi đổi sang Hạng mục khác. Bản nháp mới toanh
  // vào thẳng chế độ sửa nên nhánh `!editMode` ở trên không chạy — thiếu chỗ này
  // là mốc mãi rỗng và không bao giờ phát hiện được thay đổi.
  useEffect(() => {
    setSavedFingerprint(getGraphFingerprint(
      flowToGraph(parsed.nodes, parsed.edges, parsed.startNode, parsed.labels)
    ));
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
    // Checklist đã gộp vào tab Node nên mọi đường dẫn tới đều về 'node'. Giữ
    // nhánh cũ trỏ 'checklist' sẽ rơi vào tab không tồn tại → panel trắng.
    setInspectorTab('node');
  }, [targetNodeKey, targetType, targetNonce, nodes]);

  const selectedNode = nodes.find(node => node.id === selectedNodeId) || null;
  const selectedAssignmentsForDisplay = visibleNodeAssignments(selectedNode?.data);
  const selectedHasRuntimeOnlyAssignments = Boolean(
    selectedNode?.data?.runtimeAssignments?.length
    && !(selectedNode?.data?.assignments || []).length
  );
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
  const canEditSelectedDuration = structureEditable && (
    !selectedNode?.data.taskNodeId
    || ['pending', 'ready'].includes(selectedNode.data.executionStatus)
  );
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

  const availableCatalogNodes = useMemo(() => {
    const usedCodes = new Set(nodes.map(node => node.data.code));
    return catalog.filter(item => !usedCodes.has(item.code));
  }, [catalog, nodes]);

  const addCatalogNode = useCallback((item) => {
    if (!item) return;
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
        poolDepartmentCode: poolDefaults(item.code).department,
        poolDepartmentLabel: poolDepartmentLabel(poolDefaults(item.code).department),
        claimRoles: poolDefaults(item.code).roles,
        requiresGovSubmission: AGENCY_NODE_CODES.has(item.code),
        createsSurveyRecord: false,
        isHandover: false,
        durationDays: '',
        durationHours: '',
        durationMinutes: '',
        executionStatus: 'pending',
      },
    };
    setNodes(current => [...current, next]);
    setSelectedNodeId(id);
    if (!startNode) setStartNode(id);
    setIsSelectingNode(false);
  }, [nodes, setNodes, startNode]);

  const removeSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes(current => current.filter(node => node.id !== selectedNodeId));
    setEdges(current => current.filter(edge => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    if (startNode === selectedNodeId) setStartNode('');
    setSelectedNodeId('');
  }, [selectedNodeId, setEdges, setNodes, startNode]);

  const openContextMenu = useCallback((event, targetItem, type) => {
    event.preventDefault();
    if (!structureEditable) return;
    const containerRect = event.currentTarget.closest('.workflow-designer__canvas')?.getBoundingClientRect();
    setContextMenu({
      type,
      id: targetItem.id,
      label: type === 'node' ? targetItem.data?.label : (targetItem.label || 'nhánh này'),
      x: event.clientX - (containerRect?.left || 0),
      y: event.clientY - (containerRect?.top || 0),
    });
  }, [structureEditable]);

  const deleteEdge = useCallback((edgeId) => {
    const targetEdge = edges.find(edge => edge.id === edgeId);
    if (!targetEdge) return;
    setEdges(current => current.filter(edge => edge.id !== edgeId));
    setNodes(current => current.map(node => {
      if (node.id === targetEdge.source) {
        return { ...node, data: { ...node.data,
          outgoingHandles: (node.data.outgoingHandles || []).filter(h => h.id !== targetEdge.sourceHandle) } };
      }
      if (node.id === targetEdge.target) {
        return { ...node, data: { ...node.data,
          incomingHandles: (node.data.incomingHandles || []).filter(h => h.id !== targetEdge.targetHandle) } };
      }
      return node;
    }));
    setContextMenu(null);
  }, [edges, setEdges, setNodes]);

  const deleteNode = useCallback((nodeId) => {
    setNodes(current => current.filter(node => node.id !== nodeId));
    setEdges(current => current.filter(edge => edge.source !== nodeId && edge.target !== nodeId));
    if (startNode === nodeId) setStartNode('');
    if (selectedNodeId === nodeId) setSelectedNodeId('');
    setContextMenu(null);
  }, [selectedNodeId, setEdges, setNodes, startNode]);

  // Record history snapshot with debounce
  useEffect(() => {
    if (!structureEditable) return undefined;
    const history = historyRef.current;
    if (history.isRestoring) {
      const timer = setTimeout(() => { history.isRestoring = false; }, 600);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      const signature = JSON.stringify({
        n: nodes.map(x => [x.id, Math.round(x.position?.x || 0), Math.round(x.position?.y || 0)]),
        e: edges.map(x => [x.id, x.source, x.target, x.sourceHandle, x.targetHandle]),
        s: startNode,
      });
      if (history.snapshots[history.index]?.signature === signature) return;
      history.snapshots = [...history.snapshots.slice(0, history.index + 1), { nodes, edges, startNode, signature }].slice(-60);
      history.index = history.snapshots.length - 1;
      setCanUndo(history.index > 0);
      setCanRedo(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [nodes, edges, startNode, structureEditable]);

  const applyHistorySnapshot = useCallback((step) => {
    const history = historyRef.current;
    const targetIndex = history.index + step;
    if (targetIndex < 0 || targetIndex >= history.snapshots.length) return;
    const snapshot = history.snapshots[targetIndex];
    history.isRestoring = true;
    history.index = targetIndex;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setStartNode(snapshot.startNode);
    setCanUndo(targetIndex > 0);
    setCanRedo(targetIndex < history.snapshots.length - 1);
    setContextMenu(null);
  }, [setEdges, setNodes]);

  const cleanupDeletedHandles = useCallback((deletedEdges) => {
    if (!deletedEdges.length) return;
    setNodes(current => current.map(node => {
      const removedOutgoing = deletedEdges.filter(e => e.source === node.id).map(e => e.sourceHandle);
      const removedIncoming = deletedEdges.filter(e => e.target === node.id).map(e => e.targetHandle);
      if (!removedOutgoing.length && !removedIncoming.length) return node;
      return { ...node, data: { ...node.data,
        outgoingHandles: (node.data.outgoingHandles || []).filter(h => !removedOutgoing.includes(h.id)),
        incomingHandles: (node.data.incomingHandles || []).filter(h => !removedIncoming.includes(h.id)) } };
    }));
  }, [setNodes]);

  const handleEdgesDelete = useCallback((deletedEdges) => { cleanupDeletedHandles(deletedEdges); }, [cleanupDeletedHandles]);

  const handleNodesDelete = useCallback((deletedNodes) => {
    const ids = deletedNodes.map(node => node.id);
    setEdges(current => current.filter(edge => !ids.includes(edge.source) && !ids.includes(edge.target)));
    if (ids.includes(startNode)) setStartNode('');
    if (ids.includes(selectedNodeId)) setSelectedNodeId('');
  }, [selectedNodeId, setEdges, startNode]);

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
          // Kích thước ĐO ĐƯỢC, không phải hằng số: node có avatar hay hạn chung
          // thì cao hơn hẳn node trống, khai cứng một con số là tuyến lệch ngay.
          const width = node.measured?.width || node.width || WORKFLOW_NODE_WIDTH;
          const height = node.measured?.height || node.height || WORKFLOW_NODE_HEIGHT;
          // Vị trí cổng phải khớp đúng công thức đặt handle trong WorkflowNode,
          // và FIXED_POS để ELK giữ nguyên chứ không tự rải lại theo ý nó.
          const viTriCong = (index, total) => ((index + 1) / (total + 1)) * height;
          return {
            id: node.id,
            width,
            height,
            layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
            ports: [
              ...incoming.map((handle, index) => ({
                id: `${node.id}__${handle.id}`,
                width: 1,
                height: 1,
                x: 0,
                y: viTriCong(index, incoming.length),
                layoutOptions: { 'elk.port.side': 'WEST' },
              })),
              ...outgoing.map((handle, index) => ({
                id: `${node.id}__${handle.id}`,
                width: 1,
                height: 1,
                x: width,
                y: viTriCong(index, outgoing.length),
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

  // Ba thao tác trên danh sách tài liệu đầu ra. Cố ý XOÁ HẲN khoá khi danh sách
  // rỗng: checklist không cấu hình gì thì payload gửi lên phải y hệt trước đây,
  // không có "output_documents": [] lơ lửng.
  const setOutputDocuments = useCallback((index, list) => {
    if (!selectedNode) return;
    updateSelectedNode({
      checklist: selectedNode.data.checklist.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item };
        if (list.length) next.output_documents = list;
        else delete next.output_documents;
        return next;
      }),
    });
  }, [selectedNode, updateSelectedNode]);

  const addOutputDocument = useCallback((index) => {
    ensureDocTemplates();
    const current = selectedNode?.data.checklist?.[index]?.output_documents || [];
    setOutputDocuments(index, [...current, {
      template_id: '', min_count: 1,
      required_before_submit: true, needs_director_approval: false,
    }]);
  }, [selectedNode, setOutputDocuments, ensureDocTemplates]);

  const updateOutputDocument = useCallback((index, docIndex, patch) => {
    const current = selectedNode?.data.checklist?.[index]?.output_documents || [];
    setOutputDocuments(index, current.map((doc, i) => (i === docIndex ? { ...doc, ...patch } : doc)));
  }, [selectedNode, setOutputDocuments]);

  const removeOutputDocument = useCallback((index, docIndex) => {
    const current = selectedNode?.data.checklist?.[index]?.output_documents || [];
    setOutputDocuments(index, current.filter((_, i) => i !== docIndex));
  }, [selectedNode, setOutputDocuments]);

  const [pickerAnchor, setPickerAnchor] = useState(null);

  const toggleChecklistPicker = useCallback((key, event) => {
    // Đo NGAY tại đây. Đọc event.currentTarget bên trong updater là đọc hụt:
    // updater chạy lúc render, khi đó currentTarget đã bị React trả về null.
    const box = event?.currentTarget?.getBoundingClientRect() || null;
    setOpenChecklistPicker(current => (current === key ? null : key));
    setPickerAnchor(box && { top: box.bottom, bottom: box.top, left: box.left, width: box.width });
  }, []);

  const closeChecklistPicker = useCallback(() => {
    setOpenChecklistPicker(null);
    setPickerAnchor(null);
  }, []);

  /** Toạ độ cố định cho menu đang mở. Lật lên khi dưới trigger không đủ chỗ. */
  const pickerMenuStyle = useCallback(() => {
    if (!pickerAnchor) return undefined;
    const CAO_TOI_DA = 210;
    const conLai = window.innerHeight - pickerAnchor.top - 8;
    const latLen = conLai < 120 && pickerAnchor.bottom > conLai;
    return {
      position: 'fixed',
      left: pickerAnchor.left,
      width: pickerAnchor.width,
      maxHeight: Math.min(CAO_TOI_DA, latLen ? pickerAnchor.bottom - 16 : conLai),
      ...(latLen
        ? { bottom: window.innerHeight - pickerAnchor.bottom + 6, top: 'auto' }
        : { top: pickerAnchor.top + 6 }),
    };
  }, [pickerAnchor]);

  const openOutputDocumentModal = useCallback((index) => {
    ensureDocTemplates();
    closeChecklistPicker();
    setOutputDocumentModalIndex(index);
  }, [closeChecklistPicker, ensureDocTemplates]);

  const closeOutputDocumentModal = useCallback(() => {
    setOutputDocumentModalIndex(null);
  }, []);

  const toggleOutputDocument = useCallback((index, templateId) => {
    ensureDocTemplates();
    const current = selectedNode?.data.checklist?.[index]?.output_documents || [];
    if (!templateId) return;
    if (current.some(doc => doc.template_id === templateId)) {
      setOutputDocuments(index, current.filter(doc => doc.template_id !== templateId));
      return;
    }
    setOutputDocuments(index, [...current, {
      template_id: templateId,
      min_count: 1,
      required_before_submit: true,
      needs_director_approval: false,
    }]);
  }, [ensureDocTemplates, selectedNode, setOutputDocuments]);

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

  // Kéo mục checklist từ vị trí `from` thả vào `to` để đổi thứ tự.
  const moveChecklistItem = useCallback((from, to) => {
    if (!selectedNode || !checklistEditable || from == null || from === to) return;
    const list = [...(selectedNode.data.checklist || [])];
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    updateSelectedNode({ checklist: list });
  }, [checklistEditable, selectedNode, updateSelectedNode]);

  // Nhãn vai trò ngắn cho phần đơn giá khoán (Chính / Phụ / Người nộp).
  const shortRoleLabel = (code) => (
    { MAIN: 'Chính', ASSISTANT: 'Phụ', SUBMITTER: 'Người nộp' }[code] || roleLabel(code)
  );

  // ── Auto-Fill: nạp checklist mẫu theo loại bước (workflow_nodes.checklist_template) ──
  // Mỗi mục mẫu -> một checklist đầy đủ; mã khoán (work_item_code) tự resolve sang id.
  const buildItemsFromTemplate = (template) => (Array.isArray(template) ? template : []).map((t) => {
    const wi = t.work_item_code ? workItems.find(w => w.code === t.work_item_code) : null;
    const workItemId = wi?.id || null;
    const gen = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return {
      key: `item_${gen}`,
      name: t.name || 'Checklist',
      required: t.required !== false,
      require_evidence: Boolean(t.require_evidence),
      approver_role: t.approver_role || 'admin',
      assignee_employee_id: null,
      evidence_description: '',
      drive_folder_url: '',
      compensation: (workItemId && canManageCompensation)
        ? { is_payable: true, work_item_id: workItemId, pay_scope: 'ONCE_PER_WORKFLOW', pay_key: workItemId, pay_group_key: workItemId }
        : { is_payable: false },
    };
  });

  const nodeChecklistTemplate = () => {
    const catalogItem = catalog.find(c => c.code === selectedNode?.data.code);
    return Array.isArray(catalogItem?.checklist_template) ? catalogItem.checklist_template : [];
  };

  /** Loại giấy Master Data đã gán cho đúng bước này, TRONG hạng mục này.
   *
   * Phải đi qua sổ giấy tờ của hạng mục (``planned_node_by_template``) chứ
   * không lọc thẳng danh mục mẫu toàn hệ thống: danh mục gộp mọi Gói và mọi
   * Hạng mục, nên lọc theo mỗi node sẽ kéo về cả giấy của gói khác.
   */
  const nodeOutputTemplates = (nodeCode) => {
    if (!nodeCode) return [];
    const byId = new Map(docTemplates.map(template => [template.id, template]));
    return Object.entries(plannedNodeByTemplate)
      .filter(([, code]) => code === nodeCode)
      .map(([templateId]) => byId.get(templateId))
      .filter(Boolean);
  };

  const napMauChecklist = () => {
    if (!selectedNode || !checklistEditable) return;
    const template = nodeChecklistTemplate();
    if (template.length === 0) {
      addToast?.('Bước này chưa có checklist mẫu trong danh mục.', 'error');
      return;
    }
    const current = selectedNode.data.checklist || [];
    if (current.length > 0 && !window.confirm('Thay toàn bộ checklist hiện tại bằng mẫu chuẩn của bước này?')) return;

    // Nạp mẫu mà không kéo theo giấy tờ thì Giám đốc vẫn phải tự thêm từng tờ —
    // đúng thứ Master Data đã khai sẵn. Gom hết vào mục đầu vì Master Data gán
    // giấy cho BƯỚC, không gán tới từng mục checklist.
    const items = buildItemsFromTemplate(template);
    const papers = nodeOutputTemplates(selectedNode.data.code);
    if (papers.length > 0 && items.length > 0) {
      items[0] = {
        ...items[0],
        output_documents: papers.map(paper => ({
          template_id: paper.id,
          min_count: paper.default_quantity || 1,
          required_before_submit: paper.is_required !== false,
          needs_director_approval: false,
        })),
      };
    }
    updateSelectedNode({ checklist: items });

    if (papers.length === 0) {
      addToast?.(
        `Đã nạp ${template.length} mục checklist cho ${selectedNode.data.code}, nhưng Master Data chưa gán loại giấy nào cho bước này.`,
        'error',
      );
      return;
    }
    addToast?.(
      `Đã nạp ${template.length} mục checklist và ${papers.length} loại giấy theo Master Data của ${selectedNode.data.code}.`,
      'success',
    );
  };

  // Mô tả để chế độ đọc; chỉ mở ô nhập khi bấm cây bút — bản vẽ là vậy, và ô
  // nhập luôn mở khiến hàng mô tả trông như đang sửa dở.
  const [descriptionEditingFor, setDescriptionEditingFor] = useState('');

  const [reviewingNodeId, setReviewingNodeId] = useState('');
  const [reviewOutcome, setReviewOutcome] = useState('');
  const [lyDoLamLai, setLyDoLamLai] = useState('');
  const reviewNodeAcceptance = useCallback(async (acceptanceId, decision, outcome, coThieu = false) => {
    // Trả việc về mà không nói vì sao thì nhân viên không biết phải sửa gì —
    // máy chủ vẫn nhận ghi chú, chỉ giao diện trước giờ gửi cứng null.
    const lyDo = lyDoLamLai.trim();
    if (decision === 'rework_required' && lyDo.length < 5) {
      addToast?.('Ghi rõ cần làm lại chỗ nào trước khi trả việc', 'error');
      return;
    }
    // Cho hồ sơ thiếu giấy đi tiếp là một ngoại lệ. Không ghi lý do thì sáu
    // tháng sau không ai trả lời được vì sao hồ sơ này được cho qua.
    if (decision === 'accepted' && coThieu && lyDo.length < 5) {
      addToast?.('Duyệt khi còn thiếu tài liệu thì phải ghi rõ lý do chấp nhận', 'error');
      return;
    }
    setReviewingNodeId(acceptanceId);
    try {
      await apiFetch(`/api/contracts/workflow/acceptances/${acceptanceId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          outcome,
          note: lyDo || null,
          // Duyệt đạt mà lượt nộp có ghi thiếu tài liệu thì đây là "chấp nhận
          // thiếu" — máy chủ bắt buộc phải có lý do, và lý do chính là ô này.
          shortage_accepted: decision === 'accepted' && coThieu,
          shortage_reason: decision === 'accepted' && coThieu ? lyDo : null,
        }),
      });
      addToast?.(decision === 'accepted' ? 'Đã duyệt đạt, đã mở bước tiếp theo' : 'Đã yêu cầu làm lại', 'success');
      setReviewOutcome('');
      setLyDoLamLai('');
      await onPersisted?.();
    } catch (error) {
      addToast?.(error.message || 'Không thể duyệt node', 'error');
    } finally {
      setReviewingNodeId('');
    }
  }, [addToast, onPersisted, lyDoLamLai]);

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

  const [reviewingDocumentTypeId, setReviewingDocumentTypeId] = useState('');
  const reviewDocumentType = useCallback(async (checklistResultId, typeId, decision, reason = null) => {
    const normalizedReason = String(reason || '').trim();
    if (decision === 'rejected' && !normalizedReason) {
      addToast?.('Nhập lý do không đạt trước khi trả loại giấy', 'error');
      return;
    }
    setReviewingDocumentTypeId(typeId);
    try {
      await apiFetch(
        `/api/contracts/workflow/checklist/${encodeURIComponent(checklistResultId)}`
          + `/document-types/${encodeURIComponent(typeId)}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision,
            reason: decision === 'rejected' ? normalizedReason : null,
          }),
        },
      );
      addToast?.(
        decision === 'approved' ? 'Đã đánh dấu loại giấy đạt' : 'Đã trả loại giấy kèm lý do',
        'success',
      );
      await onPersisted?.();
    } catch (error) {
      addToast?.(error.message || 'Không thể duyệt loại giấy', 'error');
    } finally {
      setReviewingDocumentTypeId('');
    }
  }, [addToast, onPersisted]);

  const currentPayload = (reason = changeReason) => ({
      graph: flowToGraph(nodes, edges, startNode, workflowLabels),
      source_workflow_version_id: selectedTemplateId || null,
      change_reason: reason?.trim() || null,
  });

  const hasUnsavedChanges = useMemo(() => {
    if (!structureEditable || savedFingerprint == null) return false;
    return getGraphFingerprint(flowToGraph(nodes, edges, startNode, workflowLabels)) !== savedFingerprint;
  }, [structureEditable, savedFingerprint, nodes, edges, startNode, workflowLabels]);

  const unsavedChangesRef = useRef(false);
  useEffect(() => { unsavedChangesRef.current = hasUnsavedChanges; }, [hasUnsavedChanges]);

  useEffect(() => registerUnsavedChangesGuard({
    hasChanges: () => unsavedChangesRef.current,
    promptConfirm: () => new Promise(resolve => setPendingNavigationPrompt({ resolve })),
  }), []);

  /** Handles navigation prompt choice: 'save' | 'discard' | 'stay' */
  const handleNavigationPromptChoice = async (choice) => {
    const prompt = pendingNavigationPrompt;
    if (!prompt) return;
    if (choice === 'save') {
      const saved = await saveDraft();
      if (!saved) return;
    }
    if (choice === 'discard') {
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
      setStartNode(parsed.startNode);
      setWorkflowLabels(parsed.labels);
      setSavedFingerprint(getGraphFingerprint(
        flowToGraph(parsed.nodes, parsed.edges, parsed.startNode, parsed.labels)
      ));
    }
    setPendingNavigationPrompt(null);
    prompt.resolve(choice !== 'stay');
  };

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
      setSavedFingerprint(getGraphFingerprint(
        flowToGraph(parsed.nodes, parsed.edges, parsed.startNode, parsed.labels)
      ));
      addToast?.(`Đã tạo bản tạm số ${result.revision_no} từ quy trình đang chạy`, 'success');
      await onPersisted?.();
    } catch (error) {
      addToast?.(error.message, 'error');
    } finally {
      setStartingEdit(false);
    }
  };

  /** Trả về true nếu lưu được — hộp thoại "thoát" dựa vào đây để biết có nên đi tiếp. */
  const saveDraft = async () => {
    if (!serviceLine?.id || !structureEditable) return false;
    setSaving(true);
    const payloadToSend = currentPayload();
    try {
      const result = await requestJson(`/api/contracts/workflow/${encodeURIComponent(serviceLine.id)}/draft`, {
        method: 'PUT',
        body: JSON.stringify(payloadToSend),
      });
      addToast?.(`Đã lưu tạm Revision ${result.revision_no}; bản đang chạy chưa thay đổi`, 'success');
      setSavedFingerprint(getGraphFingerprint(payloadToSend.graph));
      await onPersisted?.();
      return true;
    } catch (error) {
      addToast?.(error.message, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const activateCurrentWorkflow = async () => {
    if (!serviceLine?.id || !canActivate || (hasActiveRuntime && !structureEditable)) return;
    const amendmentReason = changeReason;
    const hasUnassignedNode = nodes.some(node => (
      !(node.data.assignments || []).length
      && !(node.data.poolDepartmentCode && (node.data.claimRoles || []).length)
    ));
    const SURVEY_DEPARTMENT = 'Phòng Đo vẽ';
    const surveyNodesWithoutPieceRate = nodes.filter(node => {
      const hasSurveyStaff = node.data.poolDepartmentCode === 'SURVEY' || (node.data.assignments || []).some(a => {
        const dept = a.department_name || employees.find(e => e.id === a.employee_id)?.department_name;
        return dept === SURVEY_DEPARTMENT;
      });
      if (!hasSurveyStaff) return false;
      const hasPieceRate = (node.data.checklist || []).some(
        item => item.compensation?.is_payable && item.compensation?.work_item_id
      );
      return !hasPieceRate;
    }).map(node => node.data.code || node.data.label || node.id);
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
    const warnings = [];
    if (hasUnassignedNode) warnings.push('Một số Node chưa có phòng ban hoặc vai trò nhận việc.');
    if (surveyNodesWithoutPieceRate.length) {
      warnings.push(
        `Node đo vẽ chưa gắn hạng mục khoán: ${surveyNodesWithoutPieceRate.join(', ')} — `
        + 'nhân viên đo vẽ sẽ không nhận khoán cho các bước này.'
      );
    }
    const message = warnings.length
      ? `${warnings.join('\n')}\nBạn vẫn muốn ${actionLabel.toLowerCase()}?`
      : `${actionLabel} sẽ lưu một Revision có lịch sử riêng.${compensationMessage}\nTiếp tục?`;
    setActivationConfirmation({ amendmentReason, message, phase: 'initial' });
  };

  const executeActivation = async (confirmWarnings = false, explicitAmendmentReason = null) => {
    if (!serviceLine?.id || activating) return;
    const amendmentReason = (explicitAmendmentReason ?? activationConfirmation?.amendmentReason ?? changeReason ?? '').trim();
    if (hasActiveRuntime && !amendmentReason) {
      addToast?.('Cần nhập lý do để áp dụng bản sửa đổi', 'error');
      return;
    }

    setChangeReason(amendmentReason);
    setActivating(true);
    const payloadToSend = {
      ...currentPayload(amendmentReason),
      confirm_warnings: confirmWarnings,
    };
    try {
      const result = await requestJson(`/api/contracts/workflow/${encodeURIComponent(serviceLine.id)}/activate`, {
        method: 'POST',
        body: JSON.stringify(payloadToSend),
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
      setActivationBlockers(null);
      setActivationWarningConfirmation(null);
      setSavedFingerprint(getGraphFingerprint(payloadToSend.graph));
      await onPersisted?.();
    } catch (error) {
      if (error.status === 409 && error.detail) {
        const detail = error.detail;
        if (detail.blockers && detail.blockers.length > 0) {
          setActivationConfirmation(null);
          setActivationWarningConfirmation(null);
          setActivationBlockers(detail);
          return;
        }
        if (detail.requires_confirmation && detail.warnings && detail.warnings.length > 0) {
          setActivationConfirmation(null);
          setActivationBlockers(null);
          setActivationWarningConfirmation({
            ...detail,
            amendmentReason,
          });
          return;
        }
      }
      addToast?.(error.message, 'error');
    } finally {
      setActivating(false);
    }
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
    await executeActivation(false, amendmentReason);
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

  // Quy trình vẽ xong chỉ dùng cho hạng mục này. Lưu thành mẫu để hợp đồng sau
  const handleSaveAsTemplate = async () => {
    const name = templateName.trim();
    if (name.length < 2) { addToast?.('Đặt tên cho mẫu quy trình', 'error'); return; }
    setIsSavingTemplateInProgress(true);
    try {
      const graph = flowToGraph(nodes, edges, startNode, workflowLabels);
      const res = await requestJson('/api/contracts/workflow/templates', {
        method: 'POST',
        body: JSON.stringify({ name, graph }),
      });
      addToast?.(`Đã lưu mẫu “${res?.data?.name || name}”`, 'success');
      setIsSavingTemplate(false);
      setTemplateName('');
      onPersisted?.();
    } catch (error) {
      addToast?.(error.message || 'Không lưu được mẫu quy trình', 'error');
    } finally {
      setIsSavingTemplateInProgress(false);
    }
  };

  // Keyboard shortcuts on workflow canvas
  const saveDraftRef = useRef(saveDraft);
  saveDraftRef.current = saveDraft;

  useEffect(() => {
    if (!structureEditable) return undefined;
    const isTypingInInput = () => {
      const el = document.activeElement;
      if (!el) return false;
      return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    };
    const onKey = (event) => {
      const cmd = event.metaKey || event.ctrlKey;
      if (!cmd) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        if (isTypingInInput()) return;
        event.preventDefault();
        applyHistorySnapshot(event.shiftKey ? 1 : -1);
      } else if (key === 's') {
        event.preventDefault();
        saveDraftRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [structureEditable, applyHistorySnapshot]);

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

  const hasRunningWorkflowNode = Boolean(
    workflow?.execution_nodes?.some(node => node.status === 'in_progress'),
  );
  const [workflowClockMs, setWorkflowClockMs] = useState(() => Date.now());
  useEffect(() => {
    if (!hasRunningWorkflowNode) return undefined;
    const timerId = window.setInterval(() => setWorkflowClockMs(Date.now()), 30000);
    return () => window.clearInterval(timerId);
  }, [hasRunningWorkflowNode]);

  const workflowProgress = useMemo(() => calculateWorkflowProgress(
    workflow?.execution_nodes || [],
    workflow?.status,
    workflowClockMs,
  ), [workflow?.execution_nodes, workflow?.status, workflowClockMs]);

  const pendingReviewItems = useMemo(() => nodes.flatMap(node => {
    const pending = [];
    if (canReviewNode && node.data.pendingAcceptanceId) {
      pending.push({
        id: `node:${node.data.pendingAcceptanceId}`,
        nodeId: node.id,
        tab: 'node',
        code: node.data.code,
        label: node.data.label,
        typeLabel: 'Nghiệm thu Node',
      });
    }
    if (canReviewChecklist) {
      (node.data.checklist || []).forEach(item => {
        if (!['pending_approval', 'late_pending_approval'].includes(item.runtime?.status)) return;
        pending.push({
          id: `checklist:${item.runtime.id || `${node.id}:${item.key}`}`,
          nodeId: node.id,
          // Checklist đã gộp vào tab Node — trỏ 'checklist' là rơi vào tab
          // không tồn tại, panel hiện trắng.
          tab: 'node',
          code: node.data.code,
          label: item.name,
          checklistResultId: item.runtime.id,
          // id bước trong DB, khác node.id (id trên sơ đồ). Chốt đợt duyệt gọi
          // theo id DB — nhầm hai thứ này là gọi vào một bước không tồn tại.
          taskNodeId: node.data.taskNodeId,
          // Kèm chính mục checklist để thanh Chờ duyệt bày được đúng card như
          // trong tab Node, thay vì dựng một cách hiển thị thứ hai cho cùng dữ
          // liệu — hai cách hiển thị là sớm muộn nói khác nhau.
          checklistItem: item,
          checklistIndex: (node.data.checklist || []).indexOf(item),
          evidenceFiles: Array.isArray(item.runtime?.evidence_data?.files)
            ? item.runtime.evidence_data.files
            : [],
          typeLabel: item.runtime.status === 'late_pending_approval'
            ? 'Minh chứng nộp trễ'
            : 'Minh chứng checklist',
        });
      });
    }
    return pending;
  }), [canReviewChecklist, canReviewNode, nodes]);

  useEffect(() => {
    if (pendingReviewItems.length === 0) setReviewInboxOpen(false);
  }, [pendingReviewItems.length]);

  const outputDocumentModalItem = outputDocumentModalIndex !== null
    ? selectedNode?.data.checklist?.[outputDocumentModalIndex]
    : null;
  const outputDocumentModalSelected = useMemo(
    () => new Set(outputDocumentModalItem?.output_documents?.map(doc => doc.template_id) || []),
    [outputDocumentModalItem],
  );

  // Nhãn của CHÍNH checklist đang mở, đúng cách phanBoTaiLieu ghi ("K02 · Đo
  // hiện trường"). Cần để tách "loại này đã ở checklist NÀY" khỏi "đang ở bước
  // khác" — hai chuyện khác hẳn nhau mà một chữ "đã dùng" thì gộp làm một.
  const outputDocumentModalTag = outputDocumentModalItem && selectedNode
    ? `${(selectedNode.data.code || selectedNode.id).toUpperCase()} · ${outputDocumentModalItem.name || 'Checklist'}`
    : null;

  /**
   * Loại giấy này ĐANG NẰM Ở ĐÂU — câu trả lời cho đúng ô người dùng đang nhìn.
   *
   * Trước đây chỉ ghi "đã dùng ở checklist khác": không nói bước nào, nên mở
   * checklist sau lại thấy y hệt câu đó và tưởng chưa gán gì. Trong khi Tủ hồ sơ
   * đã phân giấy theo bước rất rõ — hai màn nói về cùng một hồ sơ mà một bên nói
   * được, một bên không.
   */
  const viTriLoaiGiay = useCallback((templateId) => {
    const daGan = phanBoTaiLieu.cua.get(templateId) || [];
    const noiKhac = daGan.filter(tag => tag !== outputDocumentModalTag);
    // Đã nằm ở bước KHÁC là một ràng buộc thật, phải nổi lên: chọn thêm ở đây
    // nghĩa là một loại giấy bị đòi ở hai bước.
    if (noiKhac.length) return { text: `Đang ở ${noiKhac.join(' · ')}`, tone: 'taken' };
    if (daGan.length) return { text: 'Đã chọn ở checklist này', tone: 'here' };
    // Chưa gán vào bước nào thì nói MASTER DATA xếp nó ở bước nào — cùng con số
    // Tủ hồ sơ dán nhãn, để hai chỗ không nói khác nhau.
    const duKien = plannedNodeByTemplate?.[templateId];
    return duKien
      ? { text: `Chưa gán · master data xếp ở ${String(duKien).toUpperCase()}`, tone: 'planned' }
      : { text: 'Chưa gán vào bước nào', tone: 'free' };
  }, [phanBoTaiLieu, outputDocumentModalTag, plannedNodeByTemplate]);
  // Tra tên loại giấy từ template_id — dòng giấy đầu ra chỉ lưu mã, mà Giám đốc
  // cần đọc tên.
  const docTemplateById = useMemo(
    () => new Map(docTemplates.map(template => [template.id, template])),
    [docTemplates],
  );

  const outputDocumentGroups = useMemo(() => {
    // ── Nguồn: SỔ GIẤY TỜ CỦA CHÍNH HẠNG MỤC NÀY ──
    //
    // Không lấy danh mục mẫu toàn hệ thống. Danh mục đó gộp mọi Gói và mọi Hạng
    // mục, nên nó mời Giám đốc khai một loại giấy KHÔNG thuộc hạng mục đang mở —
    // rồi checklist đòi một tờ mà sổ hồ sơ không bao giờ có ô để chứa.
    //
    // Sổ đã lọc sẵn theo bốn trục Gói → Hạng mục → Node → Loại giấy, và đó cũng
    // đúng những gì Tủ hồ sơ ở sidebar đang bày. Hai chỗ nói về cùng một hồ sơ
    // thì phải nói giống nhau.
    if (registerGroups?.length) {
      const nhan = new Map(OUTPUT_DOCUMENT_SOURCE_GROUPS.map(group => [group.key, group]));
      return registerGroups
        .map(group => ({
          key: group.source,
          label: group.label || nhan.get(group.source)?.label || group.source,
          hint: nhan.get(group.source)?.hint || '',
          // Ô tự thêm không có template_id nên không khai làm đầu ra được:
          // output_documents khoá theo loại giấy, không theo ô.
          items: (group.slots || [])
            .filter(slot => slot.template_id)
            .map(slot => ({
              id: slot.template_id,
              name: slot.name,
              source_label: slot.source_label,
              needs_original: slot.needs_original,
            })),
        }))
        .filter(group => group.items.length > 0);
    }

    // Chưa gắn hợp đồng (đang dựng quy trình mẫu) thì không có sổ để đọc — rơi
    // về danh mục chung, chứ để trống là không khai được gì.
    const buckets = new Map(OUTPUT_DOCUMENT_SOURCE_GROUPS.map(group => [group.key, []]));
    const khac = [];
    docTemplates.forEach(template => {
      if (!isHardCopyCustomerDocument(template)) return;
      const key = outputDocumentSourceKey(template);
      if (buckets.has(key)) buckets.get(key).push(template);
      else khac.push(template);
    });
    const groups = OUTPUT_DOCUMENT_SOURCE_GROUPS
      .map(group => ({ ...group, items: buckets.get(group.key) || [] }))
      .filter(group => group.items.length > 0);
    if (khac.length) {
      groups.push({
        key: 'KHAC',
        label: 'Khác',
        hint: 'Mẫu chưa khai rõ nguồn, cần kiểm tra lại cấu hình.',
        items: khac,
      });
    }
    return groups;
  }, [docTemplates, registerGroups]);

  return (
    <div className="workflow-designer">
      <div className="workflow-designer__toolbar">
        <div className="workflow-designer__toolbar-actions">
          {/* Quy trình đang chạy thì luồng bị khoá cho tới khi bấm Sửa. Nhãn chỉ
              ghi "Đang vận hành" thì người dùng bấm Thêm node mãi không được mà
              không biết vướng ở đâu — khoá thì phải nói là khoá, và nói cách mở. */}
          {hasActiveRuntime && (
            <span className={`workflow-active-badge${isWorkflowCancelled ? ' cancelled' : ''}${
              !editMode && !isWorkflowTerminal ? ' is-locked' : ''
            }`}>
              {isWorkflowCancelled ? <Ban size={13} /> : editMode ? <Pencil size={13} /> : <LockKeyhole size={13} />}
              {isWorkflowCancelled
                ? 'Đã hủy'
                : editMode
                  ? `Sửa R${workflow?.revision_no || ''}`
                  : isWorkflowCompleted
                    ? 'Hoàn thành'
                    : canAmendWorkflow
                      ? 'Đang vận hành'
                      : 'Chỉ xem'}
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
          {/* Trước đây nút này tự chọn hộ: quét danh mục, lấy bước đầu tiên chưa
              dùng rồi nhét vào sơ đồ. Người dựng quy trình không được chọn thêm
              bước nào — mà đó mới là việc chính của họ. */}
          <div className="workflow-node-picker">
            <button type="button" disabled={!structureEditable} className="workspace-icon-button"
title="Thêm node"
              aria-expanded={isSelectingNode} aria-haspopup="listbox"
              onClick={() => setIsSelectingNode(value => !value)}>
              <Plus size={16} /> Thêm node
            </button>
            {isSelectingNode && structureEditable && (
              <>
                <div className="workflow-node-picker__backdrop" onClick={() => setIsSelectingNode(false)} />
                <div className="workflow-node-picker__menu" role="listbox">
                  {availableCatalogNodes.length === 0 ? (
                    <p className="workflow-node-picker__empty">
                      Đã dùng hết {catalog.length} bước trong danh mục. Mỗi bước chỉ đặt được một lần
                      trong cùng quy trình.
                    </p>
                  ) : availableCatalogNodes.map(item => (
                    <button key={item.code} type="button" role="option"
                      className="workflow-node-picker__item" onClick={() => addCatalogNode(item)}>
                      <span className="workflow-node-picker__code">{item.code}</span>
                      <span>
                        <strong>{item.name}</strong>
                        {item.description && <em>{item.description}</em>}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {structureEditable && nodes.length > 0 && (
            <div className="workflow-node-picker">
              <button type="button" className="workspace-icon-button"
title="Lưu quy trình hiện tại thành mẫu"
                onClick={() => { setIsSavingTemplate(value => !value); setTemplateName(''); }}>
                <Save size={15} /> Lưu thành mẫu
              </button>
              {isSavingTemplate && (
                <>
                  <div className="workflow-node-picker__backdrop" onClick={() => setIsSavingTemplate(false)} />
                  <div className="workflow-node-picker__menu workflow-save-template">
                    <label htmlFor="ten-mau-quy-trinh">Tên mẫu quy trình</label>
                    <input id="ten-mau-quy-trinh" className="form-control" value={templateName} autoFocus
                      placeholder="VD: Quy trình tách thửa rút gọn"
                      onChange={(event) => setTemplateName(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') handleSaveAsTemplate(); }} />
                    <p>Lưu {nodes.length} bước đang vẽ. Mẫu hiện trong danh sách “Mẫu quy trình” cho mọi hợp đồng sau.</p>
                    <div className="workflow-save-template__footer">
                      <button type="button" className="workspace-icon-button" onClick={() => setIsSavingTemplate(false)}>Huỷ</button>
                      <button type="button" className="btn btn-primary btn-sm" disabled={isSavingTemplateInProgress || templateName.trim().length < 2}
                        onClick={handleSaveAsTemplate}>
                        {isSavingTemplateInProgress ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} Lưu mẫu
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <button type="button" disabled={!canMoveLayout || layouting} className="workspace-icon-button" onClick={autoLayout} title="Căn thông minh">
            {layouting ? <LoaderCircle size={16} className="spin" /> : <AlignHorizontalSpaceAround size={16} />} Căn
          </button>
          {hasActiveRuntime && !isWorkflowTerminal && !editMode && canAmendWorkflow && (
            <>
              <button type="button" disabled={startingEdit} className="workspace-icon-button" onClick={beginWorkflowEdit}>
                {startingEdit ? <LoaderCircle size={15} className="spin" /> : <Pencil size={15} />} Sửa
              </button>
              <button type="button" disabled={savingLayout} className="workspace-icon-button" onClick={saveActiveLayout} title="Lưu vị trí node và đường nối">
                {savingLayout ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} Lưu vị trí
              </button>
            </>
          )}
          {(!hasActiveRuntime || (editMode && !isWorkflowTerminal)) && (
            <>
              <button
                type="button"
                disabled={saving || !structureEditable}
                className="workspace-icon-button"
                onClick={saveDraft}
                title="Lưu tạm bản đang sửa"
                aria-label="Lưu tạm"
              >
                {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} Lưu
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

      {workflowProgress && (
        <section className="workflow-progress-compact-pill" aria-label="Tiến độ quy trình">
          <div className="workflow-progress-compact-pill__dates">
            <span className="workflow-progress-compact-pill__label">BẮT ĐẦU</span>
            <strong className="workflow-progress-compact-pill__value">{formatShortDateTime(workflowProgress.startedAt)}</strong>
            <span className="workflow-progress-compact-pill__arrow">→</span>
            <span className="workflow-progress-compact-pill__label">{workflowProgress.endLabel}</span>
            <strong className="workflow-progress-compact-pill__value">{formatShortDateTime(workflowProgress.endAt)}</strong>
          </div>

          <span className="workflow-progress-compact-pill__divider" />

          <div className="workflow-progress-compact-pill__timing">
            <span className="workflow-progress-compact-pill__label">XỬ LÝ</span>
            <strong className="workflow-progress-compact-pill__value is-mono">{formatWorkflowDuration(workflowProgress.durationSeconds)}</strong>
          </div>

          <span className="workflow-progress-compact-pill__divider" />

          <div className="workflow-progress-compact-pill__progress">
            <span className="workflow-progress-compact-pill__steps">{workflowProgress.finished}/{workflowProgress.total} bước</span>
            <div className="workflow-progress-compact-pill__track">
              <i style={{ transform: `scaleX(${workflowProgress.percent / 100})` }} />
            </div>
            <strong className="workflow-progress-compact-pill__percent">{workflowProgress.percent}%</strong>
          </div>
        </section>
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
            onPaneClick={() => { setSelectedNodeId(''); setContextMenu(null); }}
            onNodeContextMenu={(event, node) => openContextMenu(event, node, 'node')}
            onEdgeContextMenu={(event, edge) => openContextMenu(event, edge, 'edge')}
            onNodesDelete={handleNodesDelete}
            onEdgesDelete={handleEdgesDelete}
            deleteKeyCode={structureEditable ? ['Delete', 'Backspace'] : null}
            multiSelectionKeyCode={['Meta', 'Control']}
            selectionKeyCode={'Shift'}
            onMoveStart={() => setContextMenu(null)}
            fitView
            fitViewOptions={{ padding: 0.16, minZoom: 0.62, maxZoom: 1 }}
            snapToGrid
            snapGrid={[20, 20]}
            minZoom={0.45}
            maxZoom={1.5}
            defaultEdgeOptions={{ type: 'workflowEdge' }}
            connectionRadius={45}
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
          {contextMenu && (
            <>
              <div className="workflow-ctx__backdrop" onClick={() => setContextMenu(null)}
                onContextMenu={(event) => { event.preventDefault(); setContextMenu(null); }} />
              <div className="workflow-ctx" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu">
                <p className="workflow-ctx__title">
                  {contextMenu.type === 'node' ? 'Bước' : 'Nhánh'} · {contextMenu.label}
                </p>
                {contextMenu.type === 'node' ? (
                  <>
                    <button type="button" role="menuitem" onClick={() => { setStartNode(contextMenu.id); setContextMenu(null); }}>
                      <Play size={14} /> Đặt làm bước bắt đầu
                    </button>
                    <button type="button" role="menuitem" className="is-danger" onClick={() => deleteNode(contextMenu.id)}>
                      <Trash2 size={14} /> Xoá bước này
                    </button>
                  </>
                ) : (
                  <button type="button" role="menuitem" className="is-danger" onClick={() => deleteEdge(contextMenu.id)}>
                    <Trash2 size={14} /> Xoá nhánh này
                  </button>
                )}
              </div>
            </>
          )}
          {nodes.length === 0 && (
            <div className="workflow-empty-canvas">
              <GitBranch size={28} />
              <strong>Quy trình chưa có Node</strong>
              <span>Thêm K01–K07 từ thanh công cụ để bắt đầu.</span>
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
            {/* Ba tab đúng bản vẽ. Checklist KHÔNG còn tab riêng — nó là phần
                của cấu hình Node, tách ra thì Giám đốc phải nhảy qua nhảy lại
                giữa hai tab để khai xong một bước. */}
            {[
              ['node', 'Node'],
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
            <div className="workflow-inspector__content wf-node-panel">
              <div className="wf-node-panel__fixed">
              {/* Tiến độ thu tiền — CHỈ Node K06.
                  K06 là bước nhận kết quả và bàn giao, và luật nghiệp vụ là phải
                  THU ĐỦ tiền hợp đồng mới đóng được bước này. Bày ở đây để Giám
                  đốc thấy ngay còn thiếu bao nhiêu, không phải mở sang Thu chi
                  rồi quay lại. Các Node khác không dính tiền nên không hiện —
                  thêm một thanh luôn bằng 0 chỉ làm nhiễu. */}
              {selectedNode.data.code === 'K06' && (
                <section className="wf-node-money" aria-label="Tiến độ thu tiền hợp đồng">
                  <div
                    className="wf-node-money__bar"
                    style={{
                      '--wf-money-pct': `${contractTotalValue > 0
                        ? Math.min(100, Math.round((contractPaidAmount / contractTotalValue) * 100))
                        : 0}%`,
                    }}
                  >
                    <span className="wf-node-money__text">
                      {formatMoneyPlain(contractPaidAmount)}/{formatMoneyPlain(contractTotalValue)} VND
                    </span>
                  </div>
                </section>
              )}

              {/* K05a · K05b: hồ sơ nộp cơ quan. Đặt trên cùng vì "đang tạm dừng
                  vì cái gì" và "hẹn ngày nào trả" là hai câu Giám đốc hỏi đầu tiên. */}
              {AGENCY_NODE_CODES.has(selectedNode.data.code) && (
                <NodeAgencyPanel
                  taskNodeId={selectedNode.data.taskNodeId}
                  nodeCode={selectedNode.data.code}
                  addToast={addToast}
                  onChanged={onPersisted}
                  readOnly
                />
              )}

              {/* Người nhận việc + lối tắt sang chi tiết phân công. Avatar chồng
                  nhau để một Node nhiều người vẫn gọn một dòng. */}
              {/* Lưới cấu hình theo bản vẽ: nhãn cam cột trái, giá trị cột phải.
                  Bốn hàng mô tả · phòng ban · vai trò · thời lượng dùng lại đúng
                  các điều khiển đã có, chỉ đổi cách bày. */}
              <div className="wf-node-grid">
                <div className="wf-node-grid__row">
                  <span className="wf-node-grid__label">Nhân sự</span>
                  <div className="wf-node-grid__value wf-node-people" aria-label="Người thực hiện">
                    <div className="wf-node-people__avatars">
                      {(selectedAssignmentsForDisplay.length
                        ? selectedAssignmentsForDisplay
                        : [null, null]
                      ).slice(0, 3).map((assignment, index) => (
                        <span
                          key={assignment?.id || `trong-${index}`}
                          className={`wf-node-people__avatar${assignment ? '' : ' is-empty'}`}
                          title={assignment?.employee_name || 'Chưa phân công'}
                        >
                          {(assignment?.employee_name || '').trim().charAt(0).toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="wf-node-grid__row">
                  <span className="wf-node-grid__label">Mô tả</span>
                  <div className="wf-node-grid__value wf-node-grid__value--desc">
                    {structureEditable && descriptionEditingFor === selectedNode.id ? (
                      <textarea
                        rows={2}
                        autoFocus
                        placeholder="Việc phải làm ở bước này…"
                        value={selectedNode.data.description || ''}
                        onChange={event => updateSelectedNode({ description: event.target.value })}
                        onBlur={() => setDescriptionEditingFor('')}
                      />
                    ) : (
                      <>
                        <p>{selectedNode.data.description || '—'}</p>
                        {structureEditable && (
                          <button
                            type="button"
                            className="wf-node-grid__edit"
                            onClick={() => setDescriptionEditingFor(selectedNode.id)}
                            title="Sửa mô tả bước"
                            aria-label="Sửa mô tả bước"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

              <section className="workflow-pool-config" aria-label="Đội ngũ nhận việc">
                <div className="workflow-pool-config__heading">
                  <span>Đội ngũ</span>
                  <strong>Bể việc</strong>
                </div>
                <div className="workflow-pool-config__department">
                  <span className="workflow-pool-config__label">Phòng ban nhận việc</span>
                  <CustomSelect
                    aria-label="Phòng ban nhận việc"
                    disabled={!structureEditable}
                    value={selectedNode.data.poolDepartmentCode || ''}
                    options={POOL_DEPARTMENTS}
                    placeholder="— Chọn phòng ban —"
                    onChange={val => updateSelectedNode({
                      poolDepartmentCode: val,
                      poolDepartmentLabel: poolDepartmentLabel(val),
                    })}
                  />
                </div>
                <div className="workflow-pool-config__roles">
                  <RoleMultiSelect
                    label="Vai trò được nhận việc"
                    disabled={!structureEditable}
                    value={selectedNode.data.claimRoles || []}
                    options={ASSIGNMENT_ROLES}
                    onChange={claimRoles => updateSelectedNode({ claimRoles })}
                  />
                </div>
              </section>

              <section className="workflow-duration-editor" aria-label="Thời hạn xử lý Node">
                <div className="workflow-duration-editor__heading">
                  <span>Thời hạn xử lý</span>
                  <strong>
                    {selectedNode.data.deadlineAt
                      ? `Hạn ${formatDateTime(selectedNode.data.deadlineAt)}`
                      : ([
                          Number(selectedNode.data.durationDays) ? `${selectedNode.data.durationDays} ngày` : null,
                          Number(selectedNode.data.durationHours) ? `${selectedNode.data.durationHours} giờ` : null,
                          Number(selectedNode.data.durationMinutes) ? `${selectedNode.data.durationMinutes} phút` : null,
                        ].filter(Boolean).join(' ') || 'Không đặt hạn')}
                  </strong>
                </div>
                <div className="workflow-duration-editor__fields">
                  {[
                    ['durationDays', 'Ngày', 3650],
                    ['durationHours', 'Giờ', 23],
                    ['durationMinutes', 'Phút', 59],
                  ].map(([field, label, max]) => (
                    <label key={field}>
                      <input
                        type="number"
                        min="0"
                        max={max}
                        step="1"
                        aria-label={label}
                        disabled={!canEditSelectedDuration}
                        value={selectedNode.data[field] ?? ''}
                        onChange={event => {
                          const raw = event.target.value;
                          updateSelectedNode({
                            [field]: raw === '' ? '' : Math.min(max, Math.max(0, Math.trunc(Number(raw) || 0))),
                          });
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </section>
              </div>
              </div>

              {/* Dải cam là NẮP của khối checklist, nằm NGOÀI vùng cuộn.
                  Để nó bên trong (dính bằng sticky) thì kéo sắp xếp card là nó
                  trôi theo — dải tiêu đề không bao giờ được di chuyển cùng thứ
                  nó đang gắn nhãn. */}
              <div className="wcl-section-head">
                <div className="wcl-section-head__meta">
                  <div className="wcl-section-title">
                    <span className="wcl-section-dot" />
                    Danh sách checklist
                    <em>· {selectedNode.data.checklist.length} mục</em>
                  </div>
                  <div className={`wcl-section-deadline${selectedNode.data.isOverdue ? ' is-overdue' : ''}`}>
                    <Clock3 size={13} />
                    <span>Hạn: <strong>{selectedNode.data.deadlineAt ? formatDateTime(selectedNode.data.deadlineAt) : 'Tự động khi bắt đầu Node'}</strong></span>
                  </div>
                </div>
                <div className="wcl-section-actions">
                  {checklistEditable && nodeChecklistTemplate().length > 0 && (
                    <button
                      type="button"
                      className="wcl-btn wcl-btn--ghost wcl-btn--icon"
                      onClick={napMauChecklist}
                      title={`Nạp checklist mẫu chuẩn cho bước ${selectedNode.data.code}`}
                      aria-label={`Nạp checklist mẫu chuẩn cho bước ${selectedNode.data.code}`}
                    >
                      <ListChecks size={14} />
                    </button>
                  )}
                  {/* Dải chỉ rộng ~314px: hai nút có chữ đẩy tiêu đề xuống ba dòng.
                      Chữ chuyển hết sang title + aria-label nên không mất gì. */}
                  <button
                    type="button"
                    disabled={!checklistEditable}
                    className="wcl-btn wcl-btn--primary wcl-btn--icon"
                    onClick={addChecklistItem}
                    title="Thêm mục checklist"
                    aria-label="Thêm mục checklist"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              {/* Chỉ vùng này cuộn: cấu hình ở trên và Node bắt đầu / Chờ duyệt
                  ở dưới phải đứng yên để còn đối chiếu khi cuộn checklist. */}
              <div className="wf-node-panel__scroll">

              {/* Hai node đặc biệt: K05 (nộp cơ quan) và K06 (bàn giao) nếu có runtime */}
              {selectedNode.data.requiresGovSubmission
                && selectedNode.data.taskNodeId
                && !AGENCY_NODE_CODES.has(selectedNode.data.code) && (
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
                  isDirector={canReviewNode}
                  checklist={selectedNode.data.checklist || []}
                  deadlineAt={selectedNode.data.deadlineAt || null}
                  readOnly
                />
              )}

              {/* Review Card khi có yêu cầu nghiệm thu */}
              {selectedNode.data.pendingAcceptanceId && canReviewNode && (
                <div className="workflow-review-card">
                  <div className="workflow-review-card__title"><Clock3 size={14} /> Chờ duyệt nghiệm thu</div>

                  <ThieuTaiLieuKhiNop danhSach={selectedNode.data.pendingMissing || []} />

                  {/* K01 là bước rà soát giấy đầu vào. Quyết định nghiệm thu ở
                      đây CHỐT LUÔN các phiếu xin miễn đang chờ, nên Giám đốc
                      phải thấy danh sách đó trước khi bấm — và thấy cả sổ giấy
                      để đối chiếu, không phải mở sang màn hợp đồng rồi quay lại. */}
                  {selectedNode.data.code === 'K01' && serviceLine?.id && (
                    <>
                      <GiayDuocMien serviceLineId={serviceLine.id} />
                      {contractId && (
                        <DocumentRegister
                          contractId={contractId}
                          serviceLineId={serviceLine.id}
                          addToast={addToast}
                          collapsible
                          title="Sổ giấy tờ khách cung cấp"
                          showSourceRepository
                        />
                      )}
                    </>
                  )}

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
                  <label>
                    {(selectedNode.data.pendingMissing || []).length
                      ? 'Lý do trả lại / lý do chấp nhận thiếu'
                      : 'Lý do trả lại'}
                    <span className="workflow-review-card__hint">
                      {(selectedNode.data.pendingMissing || []).length
                        ? 'bắt buộc cho cả hai lựa chọn'
                        : 'chỉ cần khi yêu cầu làm lại'}
                    </span>
                    <input
                      className="form-control"
                      value={lyDoLamLai}
                      placeholder="VD: thiếu ảnh hiện trạng mặt sau thửa đất"
                      onChange={event => setLyDoLamLai(event.target.value)}
                    />
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
                      onClick={() => reviewNodeAcceptance(
                        selectedNode.data.pendingAcceptanceId,
                        'accepted',
                        reviewOutcome || null,
                        (selectedNode.data.pendingMissing || []).length > 0,
                      )}
                    >
                      <CheckCircle2 size={14} />
                      {(selectedNode.data.pendingMissing || []).length
                        ? ' Duyệt chấp nhận thiếu'
                        : ' Duyệt đạt'}
                    </button>
                  </div>
                </div>
              )}


              {selectedNode.data.checklist.length === 0 ? (
                <div className="workflow-inspector__empty compact">
                  <ListChecks size={24} />
                  <span>Chưa có checklist. Thêm mục để định nghĩa điều kiện Pass.</span>
                </div>
              ) : selectedNode.data.checklist.map((item, index) => (
                hasRuntimeDocumentTypes(item) ? (
                  <NodeChecklistCard
                    key={item.key || item.runtime?.id || index}
                    item={item}
                    index={index}
                    docTemplateById={docTemplateById}
                    workItems={workItems}
                    roleCode={item.approver_role}
                    canManageCompensation={canManageCompensation}
                    readOnly
                    canReviewDocuments={canReviewChecklist}
                    reviewingTypeId={reviewingDocumentTypeId}
                    onOpenDocument={file => openChecklistDocument(selectedNode.data.taskNodeId, file)}
                    onApproveType={(checklistResultId, typeId) => {
                      reviewDocumentType(checklistResultId, typeId, 'approved');
                    }}
                    onRejectType={(checklistResultId, typeId, reason) => {
                      reviewDocumentType(checklistResultId, typeId, 'rejected', reason);
                    }}
                  />
                ) : (
                <div
                  className={`workflow-checklist-card${dragChecklistIndex === index ? ' is-dragging' : ''}`}
                  key={item.key || index}
                  onDragOver={event => { if (dragChecklistIndex != null) event.preventDefault(); }}
                  onDrop={event => { event.preventDefault(); moveChecklistItem(dragChecklistIndex, index); setDragChecklistIndex(null); }}
                >
                  {/* Hàng đầu: kéo-sắp-xếp · Bắt buộc · tên việc · xoá */}
                  <div className="wcl-top">
                    {/* Đếm số GIẤY ĐẦU RA — khối lượng Giám đốc phải duyệt để mục
                        này xong. Kiêm luôn tay cầm kéo sắp xếp, nên đầu card
                        không phải gánh thêm một biểu tượng nào nữa. */}
                    <span
                      className="wcl-count"
                      draggable={checklistEditable}
                      onDragStart={() => setDragChecklistIndex(index)}
                      onDragEnd={() => setDragChecklistIndex(null)}
                      title={`${(item.output_documents || []).length} giấy tờ đầu ra — kéo để sắp xếp thứ tự`}
                    >
                      {(item.output_documents || []).length}
                    </span>
                    {/* Panel chỉ rộng ~314px nên tên dài vẫn cụt trên một dòng —
                        title cho đọc trọn mà không phải bấm vào ô. */}
                    <input
                      className="wcl-name-inline"
                      disabled={!checklistEditable}
                      value={item.name || ''}
                      title={item.name || 'Chưa đặt tên'}
                      placeholder="Tên việc cần nghiệm thu…"
                      onChange={event => updateChecklistItem(index, { name: event.target.value })}
                    />
                    <button
                      type="button"
                      className="wcl-add-doc"
                      disabled={!checklistEditable}
                      onClick={() => openOutputDocumentModal(index)}
                      title="Thêm giấy tờ đầu ra cho mục này"
                      aria-label="Thêm giấy tờ đầu ra cho mục này"
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      type="button"
                      className="wcl-x"
                      disabled={!checklistEditable}
                      onClick={() => removeChecklistItem(index)}
                      title="Xóa mục checklist"
                      aria-label={`Xóa ${item.name || `checklist ${index + 1}`}`}
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Hàng: Người duyệt */}
                  <div className="wcl-prop">
                    <span className="wcl-prop__label"><UserRound size={13} /> Duyệt</span>
                    <div className="wcl-prop__field">
                      <div className="wcl-picker wcl-picker--full">
                        <button
                          type="button"
                          className={`wcl-picker__trigger${openChecklistPicker === `approver-${index}` ? ' is-open' : ''}`}
                          disabled={!checklistEditable}
                          aria-haspopup="listbox"
                          aria-expanded={openChecklistPicker === `approver-${index}`}
                          aria-label={`Người duyệt: ${(APPROVER_ROLES.find(([code]) => code === (item.approver_role || 'admin')) || [null, item.approver_role || 'Giám đốc'])[1]}`}
                          onClick={event => toggleChecklistPicker(`approver-${index}`, event)}
                        >
                          <span className="wcl-chip wcl-chip--person">
                            <UserRound size={13} />
                            {(APPROVER_ROLES.find(([code]) => code === (item.approver_role || 'admin')) || [null, item.approver_role || 'Giám đốc'])[1]}
                          </span>
                          <ChevronDown size={14} />
                        </button>
                        {openChecklistPicker === `approver-${index}` && (
                          <div className="wcl-picker__menu" role="listbox" style={pickerMenuStyle()}>
                            {APPROVER_ROLES.map(([code, label]) => (
                              <button
                                type="button"
                                key={code}
                                role="option"
                                aria-selected={code === (item.approver_role || 'admin')}
                                className={`wcl-picker__option${code === (item.approver_role || 'admin') ? ' is-selected' : ''}`}
                                onClick={() => {
                                  updateChecklistItem(index, { approver_role: code });
                                  closeChecklistPicker();
                                }}
                              >
                                {code === (item.approver_role || 'admin') && <Check size={13} />}
                                <span>{label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Hàng: Tài liệu đầu ra — thứ checklist này phải SINH RA và
                      đưa vào hồ sơ có cấu trúc. Khác minh chứng: minh chứng chứng
                      minh đã làm việc, tài liệu đầu ra là thành phần chính thức
                      của hồ sơ Hạng mục. Mặc định thu gọn. */}
                  {(item.output_documents || []).length > 0 ? (
                    <div className="wcl-prop wcl-prop--output">
                      <span className="wcl-prop__label"><FileCheck2 size={13} /> Tài liệu đầu ra</span>
                      <div className="wcl-output-panel">
                        <div className="wcl-output-panel__scroll">
                        {(item.output_documents || []).map((doc, docIndex) => {
                          const canhBao = doc.needs_director_approval && (item.approver_role || 'admin') !== 'admin';
                          const mau = docTemplates.find(t => t.id === doc.template_id);
                          // Chưa nạp xong danh mục thì KHÔNG khẳng định gì — vẽ vệt
                          // chờ. Nói "Tài liệu chưa rõ" rồi đổi tên là vừa sai vừa giật.
                          const tenTaiLieu = mau?.name
                            || (docTemplatesReady ? (doc.template_id || 'Tài liệu chưa rõ') : '');
                          const noiDung = phanBoTaiLieu.cua.get(doc.template_id) || [];
                          return (
                            <div className={`wcl-output-row${canhBao ? ' is-warn' : ''}`} key={`${doc.template_id}-${docIndex}`}>
                              {/* Một hàng, một dòng, không đổi chiều cao khi rê chuột.
                                  Nguồn giấy và "cần bản chính" đưa vào tooltip: đó là
                                  thông tin tra cứu, không phải thứ phải đọc mọi lúc.

                                  KHÔNG còn ô Số lượng: một loại giấy có thể gồm nhiều
                                  file, nhân viên nộp bao nhiêu là bấy nhiêu.
                                  KHÔNG còn "Cần Giám đốc duyệt": mọi giấy đều phải qua
                                  Giám đốc nên bật/tắt từng tờ là vô nghĩa. */}
                              <div
                                className="wcl-output-row__top"
                                title={mau
                                  ? `${tenTaiLieu} — ${mau.source_label}${mau.needs_original ? ' · cần bản chính' : ''}${noiDung.length > 1 ? ` · dùng ở ${noiDung.length} checklist` : ''}`
                                  : tenTaiLieu}
                              >
                                <span className="wcl-chip wcl-chip--doc">
                                  <FileCheck2 size={12} />
                                  {tenTaiLieu || <i className="wcl-chip__skeleton" aria-label="Đang nạp tên giấy" />}
                                </span>
                                <label className="wcl-output-row__req">
                                  <input
                                    type="checkbox"
                                    disabled={!checklistEditable}
                                    checked={doc.required_before_submit !== false}
                                    onChange={event => updateOutputDocument(index, docIndex, {
                                      required_before_submit: event.target.checked,
                                    })}
                                  />
                                  bắt buộc
                                </label>
                                {checklistEditable && (
                                  <button
                                    type="button"
                                    className="wcl-chip__x"
                                    onClick={() => removeOutputDocument(index, docIndex)}
                                    title={`Bỏ ${tenTaiLieu}`}
                                    aria-label={`Bỏ ${tenTaiLieu}`}
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </div>
                              {canhBao && (
                                <p className="wcl-output-row__warn" role="alert">
                                  Cần Giám đốc duyệt nhưng người duyệt đang là “{
                                    (APPROVER_ROLES.find(([code]) => code === item.approver_role) || [])[1] || item.approver_role
                                  }”. Đổi người duyệt sang Giám đốc, nếu không lưu quy trình sẽ bị từ chối.
                                </p>
                              )}
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="wcl-prop wcl-prop--output">
                      <span className="wcl-prop__label"><FileCheck2 size={13} /> Tài liệu đầu ra</span>
                      <span className="wcl-prop__none">
                        {checklistEditable ? 'Chưa gán giấy tờ đầu ra' : 'Không yêu cầu'}
                      </span>
                    </div>
                  )}

                  {/* Hàng: Công việc + lương khoán — đơn giá theo vai trò (Chính · Phụ) */}
                  {canViewCompensation && (
                    item.compensation?.is_payable ? (
                      <div className="wcl-prop wcl-prop--pay">
                        <span className="wcl-prop__label"><Banknote size={13} /> Công việc</span>
                        <div className="wcl-prop__field">
                          <div className="wcl-picker wcl-picker--full">
                            <button
                              type="button"
                              className={`wcl-picker__trigger${openChecklistPicker === `pay-${index}` ? ' is-open' : ''}`}
                              disabled={!checklistEditable || !canManageCompensation}
                              aria-haspopup="listbox"
                              aria-expanded={openChecklistPicker === `pay-${index}`}
                              aria-label={`Gói khoán: ${workItemById.get(item.compensation.work_item_id)?.name || 'Chưa chọn'}`}
                              onClick={event => toggleChecklistPicker(`pay-${index}`, event)}
                            >
                              <span className="wcl-chip">
                                <Banknote size={13} />
                                {workItemById.get(item.compensation.work_item_id)?.name || 'Chưa chọn'}
                              </span>
                              <ChevronDown size={14} />
                            </button>
                            {openChecklistPicker === `pay-${index}` && (
                              <div className="wcl-picker__menu" role="listbox" style={pickerMenuStyle()}>
                                {workItems.map(workItem => (
                                  <button
                                    type="button"
                                    key={workItem.id}
                                    role="option"
                                    aria-selected={workItem.id === item.compensation.work_item_id}
                                    className={`wcl-picker__option${workItem.id === item.compensation.work_item_id ? ' is-selected' : ''}`}
                                    onClick={() => {
                                      updateChecklistItem(index, {
                                        compensation: {
                                          ...item.compensation,
                                          work_item_id: workItem.id,
                                          pay_key: workItem.id,
                                          pay_group_key: workItem.id,
                                        },
                                      });
                                      closeChecklistPicker();
                                    }}
                                  >
                                    {workItem.id === item.compensation.work_item_id && <Check size={13} />}
                                    <span>{workItem.name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {checklistEditable && canManageCompensation && (
                            <button type="button" className="wcl-prop__clear" onClick={() => updateChecklistItem(index, { compensation: { is_payable: false } })} title="Bỏ gói khoán">
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        {(workItemById.get(item.compensation.work_item_id)?.rates || []).length > 0 && (
                          <div className="wcl-rate-readout">
                            {(workItemById.get(item.compensation.work_item_id)?.rates || []).map(rate => (
                              <span key={rate.id} className={`wcl-rr${Number(rate.amount) > 0 ? '' : ' is-zero'}`}>
                                {shortRoleLabel(rate.role_code)}: <strong>{formatMoney(rate.amount)}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="wcl-prop wcl-prop--pay">
                        <span className="wcl-prop__label"><Banknote size={13} /> Công việc</span>
                        <button
                          type="button"
                          className="wcl-add-inline"
                          disabled={!checklistEditable || !canManageCompensation}
                          onClick={() => {
                            const workItemId = workItems[0]?.id || '';
                            updateChecklistItem(index, {
                              compensation: { is_payable: true, work_item_id: workItemId, pay_scope: 'ONCE_PER_WORKFLOW', pay_key: workItemId, pay_group_key: workItemId },
                            });
                          }}
                        >
                          <Plus size={13} /> Gắn gói khoán
                        </button>
                      </div>
                    )
                  )}

                  {/* Duyệt minh chứng (runtime) — footer trạng thái thực thi */}
                  {['pending_approval', 'late_pending_approval'].includes(item.runtime?.status) && canReviewChecklist && !hasRuntimeDocumentTypes(item) && (
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
                )
              ))}
              {!checklistEditable && selectedNode.data.taskNodeId && (
                <div className="workflow-note-box">
                  <LockKeyhole size={16} /> Node đã bắt đầu nên danh sách nghiệm thu được khóa; bản sửa đổi chỉ được đổi đường chuyển bước hoặc thêm Node mới.
                </div>
              )}
              </div>

              {/* Ngoài vùng cuộn: mockup đặt "Node bắt đầu" nằm giữa danh sách
                  checklist và thanh Chờ duyệt, cả hai đều đứng yên. */}
              <div className="wf-node-panel__foot">
                <button
                  type="button"
                  disabled={!structureEditable}
                  className={`workflow-start-node-dashed-btn${startNode === selectedNode.id ? ' is-active' : ''}`}
                  onClick={() => setStartNode(selectedNode.id)}
                >
                  <CheckCircle2 size={15} />
                  {startNode === selectedNode.id ? 'Node bắt đầu' : 'Đặt làm node bắt đầu'}
                </button>
              </div>
            </div>
          ) : inspectorTab === 'assignment' ? (
            <div className="workflow-inspector__content workflow-assignment-panel">
              <div className="workflow-inspector__section-title">
                <div>
                  <span>Người thực hiện checklist trong Node</span>
                  <strong>{selectedAssignmentsForDisplay.length} người</strong>
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
              ) : !selectedAssignmentsForDisplay.length ? (
                <div className="workflow-inspector__empty compact">
                  <UserRoundCog size={24} />
                  <span>Node này chưa được phân công. Có thể kích hoạt trước và phân công sau.</span>
                </div>
              ) : selectedAssignmentsForDisplay.map((assignment, index) => {
                const payLines = canViewCompensation ? projectedPayLines(selectedNode, assignment) : [];
                const projectedAmount = payLines.reduce((sum, line) => sum + line.amount, 0);
                const emp = employees.find(item => item.id === assignment.employee_id);
                const name = assignment.full_name || emp?.full_name || 'Chưa chọn nhân viên';
                const dept = emp?.department_name || emp?.job_title || '';
                const laChinh = Boolean(assignment.is_primary);
                return (
                <article className={`workflow-assignment-card${laChinh ? ' is-primary' : ''}`} key={`${assignment.employee_id}-${assignment.role_code}-${index}`}>
                  <header className="wa-head">
                    <AvatarImage
                      className="wa-ava wa-ava--img"
                      fallbackClassName="wa-ava"
                      src={assignment.avatar_url || emp?.avatar_url}
                      name={name}
                      title={name}
                    />
                    <div className="wa-who">
                      <strong title={name}>{name}</strong>
                      {dept && <small title={dept}>{dept}</small>}
                    </div>
                    <button type="button" className="wa-x" disabled={selectedHasRuntimeOnlyAssignments || !canEditSelectedAssignments} onClick={() => removeAssignment(index)} title="Bỏ phân công">
                      <X size={15} />
                    </button>
                  </header>

                  <div className="wa-grid">
                    <label className="wa-field">
                      <span>Nhân viên</span>
                      <select
                        className="form-control"
                        disabled={selectedHasRuntimeOnlyAssignments || !canEditSelectedAssignments}
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
                    <label className="wa-field">
                      <span>Vai trò</span>
                      <select
                        className="form-control"
                        disabled={selectedHasRuntimeOnlyAssignments || !canEditSelectedAssignments}
                        value={assignment.role_code || 'MAIN'}
                        onChange={event => updateAssignment(index, { role_code: event.target.value })}
                      >
                        {ASSIGNMENT_ROLES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                      </select>
                    </label>
                  </div>

                  <button
                    type="button"
                    className={`wa-primary-toggle${laChinh ? ' is-on' : ''}`}
                    disabled={selectedHasRuntimeOnlyAssignments || !canEditSelectedAssignments}
                    onClick={() => updateAssignment(index, { is_primary: !laChinh })}
                    title="Người chịu trách nhiệm chính của bước — mức khoán cao hơn tính theo vai trò này"
                  >
                    <Star size={13} /> Chịu trách nhiệm chính
                  </button>

                  {canViewCompensation && (
                    <div className={`wa-pay${projectedAmount > 0 ? ' is-active' : ''}`}>
                      <div className="wa-pay__head">
                        <span><Banknote size={13} /> Khoán dự kiến</span>
                        <strong>{formatMoney(projectedAmount)}</strong>
                      </div>
                      {payLines.length > 0 ? (
                        <div className="wa-pay__lines">
                          {payLines.map(line => (
                            <small key={`${line.checklistKey}-${line.workItemName}`}>
                              {line.workItemName} · {formatMoney(line.amount)}
                            </small>
                          ))}
                        </div>
                      ) : (
                        <small className="wa-pay__hint">Chưa có mức khoán cho vai trò này</small>
                      )}
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
              {/* Ba cờ này ĐÚNG NGHĨA là điều kiện của bước, nên thuộc tab
                  "điều kiện" chứ không phải tab "node". Để ở tab node làm phần
                  cấu hình dài thêm mà bản vẽ không có chỗ cho nó. */}
              {/* Mục: ĐIỀU KIỆN KÍCH HOẠT */}
              <div className="workflow-section-block">
                <label className="workflow-section-block__label">ĐIỀU KIỆN KÍCH HOẠT</label>
                <div className="workflow-trigger-group">
                  <label className="workflow-trigger-item">
                    <input
                      type="checkbox"
                      disabled={!structureEditable || AGENCY_NODE_CODES.has(selectedNode.data.code)}
                      checked={Boolean(selectedNode.data.requiresGovSubmission)
                        || AGENCY_NODE_CODES.has(selectedNode.data.code)}
                      onChange={event => updateSelectedNode({ requiresGovSubmission: event.target.checked })}
                    />
                    <div className="workflow-trigger-item__info">
                      <strong>Yêu cầu nộp cơ quan nhà nước</strong>
                      {AGENCY_NODE_CODES.has(selectedNode.data.code) && (
                        <span>Bước {selectedNode.data.code} luôn nộp cơ quan — không tắt được.</span>
                      )}
                    </div>
                  </label>

                  <label className="workflow-trigger-item">
                    <input
                      type="checkbox"
                      disabled={!structureEditable}
                      checked={Boolean(selectedNode.data.createsSurveyRecord)}
                      onChange={event => updateSelectedNode({ createsSurveyRecord: event.target.checked })}
                    />
                    <div className="workflow-trigger-item__info">
                      <strong>Bước đo vẽ</strong>
                    </div>
                  </label>

                  <label className="workflow-trigger-item">
                    <input
                      type="checkbox"
                      disabled={!structureEditable}
                      checked={Boolean(selectedNode.data.isHandover)}
                      onChange={event => updateSelectedNode({ isHandover: event.target.checked })}
                    />
                    <div className="workflow-trigger-item__info">
                      <strong>Bước bàn giao</strong>
                    </div>
                  </label>
                </div>
              </div>
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

          {(canReviewChecklist || canReviewNode) && (
            <section
              className={`workflow-review-inbox${reviewInboxOpen ? ' is-open' : ''}${pendingReviewItems.length ? ' has-items' : ''}`}
              aria-label="Thông báo chờ duyệt"
            >
              <button
                type="button"
                className="workflow-review-inbox__trigger"
                aria-expanded={reviewInboxOpen}
                disabled={pendingReviewItems.length === 0}
                onClick={() => setReviewInboxOpen(value => {
                  // Đóng Drawer là một lần CỐ GẮNG chốt, không phải bảo đảm:
                  // mất mạng hay đóng tab là mất. Lưới an toàn thật nằm ở đường
                  // chốt lười phía máy chủ.
                  if (value) reviewedNodeIds.current.forEach(id => onFlushReviewBatch?.(id));
                  reviewedNodeIds.current.clear();
                  return !value;
                })}
              >
                <span><CircleDashed size={14} /> Chờ duyệt</span>
                {/* Bằng 0 thì ẩn hẳn badge — câu "Không có yêu cầu mới" bên dưới
                    đã nói đủ, thêm một con số 0 chỉ làm nhiễu mắt. */}
                {pendingReviewItems.length > 0 && (
                  <strong title={`${pendingReviewItems.length} việc chờ duyệt`}>
                    {pendingReviewItems.length}
                  </strong>
                )}
                {reviewInboxOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
              {pendingReviewItems.length > 0 && reviewInboxOpen ? (
                <div className="workflow-review-inbox__dropup">
                  <div className="workflow-review-inbox__list">
                    {pendingReviewItems.map(item => (
                      item.checklistResultId ? (
                        <article className="workflow-review-inbox__item" key={item.id}>
                          <div className="workflow-review-inbox__item-heading">
                            <span>{item.code}</span>
                            <div>
                              <strong>{item.label}</strong>
                              <small>{item.typeLabel}</small>
                            </div>
                          </div>
                          {/* Bấm Chờ duyệt là bày ra ĐÚNG card như trong tab Node:
                              Giám đốc duyệt từng tờ giấy ngay tại đây, không phải
                              nhớ tờ nào đã xem rồi nhảy sang tab khác. */}
                          {item.checklistItem && (
                            <NodeChecklistCard
                              item={item.checklistItem}
                              index={item.checklistIndex}
                              docTemplateById={docTemplateById}
                              workItems={workItems}
                              roleCode={item.checklistItem.approver_role}
                              canManageCompensation={canManageCompensation}
                              readOnly
                              canReviewDocuments={canReviewChecklist}
                              reviewingTypeId={reviewingDocumentTypeId}
                              onOpenDocument={file => {
                                if (hasRuntimeDocumentTypes(item.checklistItem)) {
                                  openChecklistDocument(item.taskNodeId, file);
                                  return;
                                }
                                setSelectedNodeId(item.nodeId);
                                setInspectorTab('node');
                                setReviewInboxOpen(false);
                              }}
                              // Bên nhận cần ID mục checklist, không cần chỉ số
                              // dòng — chỉ số chỉ có nghĩa bên trong thẻ.
                              onApprove={(_index, doc) => {
                                reviewedNodeIds.current.add(item.taskNodeId);
                                onApproveDocument?.(item.checklistResultId, doc);
                              }}
                              onReject={(_index, doc, reason) => {
                                reviewedNodeIds.current.add(item.taskNodeId);
                                onRejectDocument?.(item.checklistResultId, doc, reason);
                              }}
                              onApproveType={(checklistResultId, typeId) => {
                                reviewDocumentType(checklistResultId, typeId, 'approved');
                              }}
                              onRejectType={(checklistResultId, typeId, reason) => {
                                reviewDocumentType(checklistResultId, typeId, 'rejected', reason);
                              }}
                            />
                          )}
                          <div className="workflow-review-inbox__evidence">
                            {item.evidenceFiles.length > 0 ? item.evidenceFiles.map((file, fileIndex) => (
                              safeExternalUrl(file.url) || isPrivateObjectKey(file.url) ? (
                                <a
                                  key={`${file.url}-${fileIndex}`}
                                  href={isPrivateObjectKey(file.url) ? '#' : safeExternalUrl(file.url)}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => openEvidenceFile(event, file)}
                                >
                                  <FileCheck2 size={13} />
                                  {file.name || `Minh chứng ${fileIndex + 1}`}
                                  <ExternalLink size={11} />
                                </a>
                              ) : (
                                <span key={`${file.name}-${fileIndex}`}>
                                  <FileCheck2 size={13} /> {file.name || `Minh chứng ${fileIndex + 1}`}
                                </span>
                              )
                            )) : <span>Không có tệp minh chứng</span>}
                          </div>
                          {!hasRuntimeDocumentTypes(item.checklistItem) && (
                          <div className="workflow-review-inbox__actions">
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={reviewingChecklistId === item.checklistResultId}
                              onClick={() => reviewChecklistEvidence(item.checklistResultId, 'failed')}
                            >
                              <XCircle size={13} /> Từ chối
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={reviewingChecklistId === item.checklistResultId}
                              onClick={() => reviewChecklistEvidence(item.checklistResultId, 'approved')}
                            >
                              <CheckCircle2 size={13} /> Duyệt đạt
                            </button>
                          </div>
                          )}
                        </article>
                      ) : (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => {
                            setSelectedNodeId(item.nodeId);
                            setInspectorTab(item.tab);
                            setReviewInboxOpen(false);
                          }}
                        >
                          <span>{item.code}</span>
                          <div>
                            <strong>{item.label}</strong>
                            <small>{item.typeLabel}</small>
                          </div>
                          <ChevronRight size={14} />
                        </button>
                      )
                    ))}
                  </div>
                </div>
              ) : null}
              {pendingReviewItems.length === 0 && <p>Không có yêu cầu mới</p>}
            </section>
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
        open={outputDocumentModalIndex !== null}
        onClose={closeOutputDocumentModal}
        title="Chọn tài liệu đầu ra"
        id="workflow-output-documents-modal"
        size="lg"
        className='workflow-output-documents-modal'
        footer={(
          <button type="button" className="btn btn-primary" onClick={closeOutputDocumentModal}>
            Xong
          </button>
        )}
      >
        <div className="wcl-output-modal">
          <p className="wcl-output-modal__hint">
            Chọn các loại giấy tờ mà checklist này cần tạo ra. Có thể chọn nhiều loại, hệ thống sẽ tự đưa vào cấu trúc hồ sơ của Hạng mục sau khi nộp và duyệt.
          </p>
          {outputDocumentGroups.length > 0 ? (
            <div className="wcl-output-modal__groups">
              {outputDocumentGroups.map(group => (
                <section
                  key={group.key}
                  className={`wcl-output-modal__group wcl-output-modal__group--${group.key.toLowerCase().replaceAll('_', '-')}`}
                >
                  <div className="wcl-output-modal__group-head">
                    <div>
                      <h3 className="wcl-output-modal__group-title">{group.label}</h3>
                      <p className="wcl-output-modal__group-hint">{group.hint}</p>
                    </div>
                    <span className="wcl-output-modal__group-count">{group.items.length} loại</span>
                  </div>
                  <div
                    className="wcl-output-modal__grid"
                    role="listbox"
                    aria-label={group.label}
                    aria-multiselectable="true"
                  >
                    {group.items.map(template => {
                      const selected = outputDocumentModalSelected.has(template.id);
                      const viTri = viTriLoaiGiay(template.id);
                      return (
                        <button
                          type="button"
                          key={template.id}
                          role="option"
                          aria-selected={selected}
                          className={`wcl-output-modal__option${selected ? ' is-selected' : ''}`}
                          onClick={() => {
                            if (outputDocumentModalIndex === null) return;
                            toggleOutputDocument(outputDocumentModalIndex, template.id);
                          }}
                        >
                          <span className="wcl-output-modal__check" aria-hidden="true">
                            {selected ? <Check size={14} /> : null}
                          </span>
                          <span className="wcl-output-modal__name">{template.name}</span>
                          <span className="wcl-output-modal__source">{template.source_label || group.label}</span>
                          <span className="wcl-output-modal__meta">
                            {template.needs_original ? 'Cần bản chính' : 'Bản sao được'}
                            {' · '}
                            <b className={`wcl-output-modal__where is-${viTri.tone}`}>{viTri.text}</b>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="wcl-output-modal__empty">Chưa có mẫu tài liệu để chọn.</p>
          )}
        </div>
      </Modal>

      {/* Rời khỏi màn khi còn thay đổi chưa lưu. "Lưu" ở đây chỉ LƯU TẠM —
          Áp dụng vào quy trình đang chạy là quyết định lớn, bắt buộc nhập lý do
          và làm đổi việc của nhân viên, không nên nằm sau một hộp thoại bấm vội. */}

      <Modal
        open={Boolean(pendingNavigationPrompt)}
        onClose={() => handleNavigationPromptChoice('stay')}
        closeOnOverlay={!saving}
        title="Quy trình còn thay đổi chưa lưu"
        id="workflow-unsaved-modal"
        footer={(
          <>
            <button type="button" className="btn btn-secondary" disabled={saving}
              onClick={() => handleNavigationPromptChoice('stay')}>
              Ở lại
            </button>
            <button type="button" className="btn btn-secondary workflow-unsaved-discard" disabled={saving}
              onClick={() => handleNavigationPromptChoice('discard')}>
              Thoát không lưu
            </button>
            <button type="button" className="btn btn-primary workflow-unsaved-save" disabled={saving}
              onClick={() => handleNavigationPromptChoice('save')}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Lưu tạm rồi thoát
            </button>
          </>
        )}
      >
        <p style={{ margin: 0 }}>
          Sơ đồ quy trình đang có thay đổi chưa được lưu. Thoát bây giờ là mất hết.
        </p>
        <p style={{ margin: '10px 0 0', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
          Lưu tạm chỉ cất bản nháp — quy trình đang chạy không đổi cho tới khi bấm
          {hasActiveRuntime ? ' “Áp dụng”' : ' “Kích hoạt”'}.
        </p>
      </Modal>

      <Modal
        open={Boolean(activationConfirmation)}
        onClose={() => { if (!activating) setActivationConfirmation(null); }}
        closeOnOverlay={!activating}
        title={activationConfirmation?.phase === 'impact-warning'
          ? 'Cảnh báo tác động quy trình đang chạy'
          : hasActiveRuntime
            ? 'Xác nhận áp dụng bản sửa đổi'
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
        open={Boolean(activationBlockers)}
        onClose={() => setActivationBlockers(null)}
        title="Không thể kích hoạt quy trình"
        id="workflow-activation-blocked-modal"
        footer={(
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setActivationBlockers(null)}
          >
            Đóng
          </button>
        )}
      >
        <div className="workflow-activation-blocked">
          <p style={{ margin: 0, fontWeight: 600, color: '#ef4444' }}>
            {activationBlockers?.message || 'Thiếu phân bổ loại giấy tờ bắt buộc vào checklist của workflow.'}
          </p>
          <p style={{ margin: '8px 0 12px', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Các loại giấy tờ bắt buộc sau đây chưa được gán vào bất kỳ bước nào trong quy trình:
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {(activationBlockers?.blockers || []).map((item, index) => (
              <li key={item.template_id || index} style={{ marginBottom: 4 }}>
                <strong>{item.template_name || item.template_id}</strong>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <Modal
        open={Boolean(activationWarningConfirmation)}
        onClose={() => { if (!activating) setActivationWarningConfirmation(null); }}
        closeOnOverlay={!activating}
        title="Cảnh báo khoán chưa cấu hình"
        id="workflow-activation-warning-modal"
        footer={(
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={activating}
              onClick={() => setActivationWarningConfirmation(null)}
            >
              Quay lại
            </button>
            <button
              type="button"
              className="btn btn-primary workflow-activation-warning-confirm"
              disabled={activating}
              onClick={() => executeActivation(true, activationWarningConfirmation?.amendmentReason)}
            >
              {activating ? <LoaderCircle size={16} className="spin" /> : <Play size={16} />}
              Vẫn kích hoạt
            </button>
          </>
        )}
      >
        <div className="workflow-activation-warning-dialog">
          <p style={{ margin: 0, whiteSpace: 'pre-line' }}>
            {activationWarningConfirmation?.message
              || 'Một số bước chưa gắn khoán. Công việc tại các bước này sẽ không có tiền khoán nếu tiếp tục kích hoạt.'}
          </p>
          {/* Hai loại cảnh báo, hai hậu quả khác hẳn nhau — gộp một danh sách
              thì người đọc không biết cái nào đáng lo. Thiếu khoán là nhân viên
              mất tiền thật; thiếu giấy có thể chỉ vì quy trình này không cần. */}
          {(() => {
            const warnings = activationWarningConfirmation?.warnings || [];
            const thieuKhoan = warnings.filter(item => item.code === 'MISSING_PIECE_RATE_MAPPING');
            const thieuGiay = warnings.filter(item => item.code === 'MANDATORY_OUTPUT_UNALLOCATED');
            return (
              <>
                {thieuKhoan.length > 0 && (
                  <>
                    <p className="workflow-activation-warning-dialog__head">
                      Nhân viên thực hiện các bước sau sẽ không nhận khoán:
                    </p>
                    <ul className="workflow-activation-warning-dialog__list">
                      {thieuKhoan.map((item, index) => (
                        <li key={item.node_key || `pay-${index}`}>{item.node_name || item.node_key}</li>
                      ))}
                    </ul>
                  </>
                )}
                {thieuGiay.length > 0 && (
                  <>
                    <p className="workflow-activation-warning-dialog__head">
                      Bộ chuẩn của gói có {thieuGiay.length} loại giấy chưa gán vào bước nào.
                      Quy trình này không cần tới chúng thì bỏ qua được:
                    </p>
                    <ul className="workflow-activation-warning-dialog__list">
                      {thieuGiay.map((item, index) => (
                        <li key={item.template_id || `doc-${index}`}>
                          {item.template_name || item.template_id}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            );
          })()}
        </div>
      </Modal>

      <FilePreviewModal
        open={Boolean(reviewDocumentPreview)}
        fileName={reviewDocumentPreview?.fileName || ''}
        mimeType={reviewDocumentPreview?.mimeType || ''}
        url={reviewDocumentPreview?.url || ''}
        blob={reviewDocumentPreview?.blob || null}
        onClose={closeReviewDocumentPreview}
      />

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
                Có {cancellationPreview.agency_node_count || 0} Node liên quan K05–K06 đã bắt đầu.
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
