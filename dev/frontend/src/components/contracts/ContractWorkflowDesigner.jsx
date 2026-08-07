import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  CalendarClock,
  CheckCircle2,
  CircleDashed,
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
} from 'lucide-react';
import Modal from '../ui/Modal';
import {
  DEFAULT_WORKFLOW_LABELS,
  WORKFLOW_NODE_STATUS_LABELS,
  WORKFLOW_OUTCOME_LABELS,
} from './workflowLabels';

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
const WORKFLOW_NODE_HEIGHT = 145;
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

const roleLabel = code => ASSIGNMENT_ROLES.find(item => item[0] === code)?.[1] || code;

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function localInputToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

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

function graphToFlow(graph, catalog, executionNodes = []) {
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
      runtime: runtimeChecklistByKey.get(item.key) || null,
    }));
    (execution?.checklist_results || []).forEach(item => {
      if (checklist.some(configured => configured.key === item.checklist_key)) return;
      checklist.push({
        key: item.checklist_key,
        name: item.checklist_name,
        required: item.is_required,
        evidence_required: Boolean(item.evidence_data?.required),
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
        role: value.role || '',
        assignments: execution?.assignments || (Array.isArray(value.assignments) ? value.assignments : []),
        taskNodeId: execution?.id || null,
        evidenceRequired: Boolean(value.evidence_required),
        executionStatus: execution?.status || 'pending',
        executionStatusLabel: labels.node_statuses[execution?.status || 'pending'],
        outcome: execution?.outcome || '',
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
      role: node.data.role || '',
      evidence_required: Boolean(node.data.evidenceRequired),
      checklist: (node.data.checklist || []).map(item => {
        const { runtime: _runtime, ...definition } = item;
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

export default function ContractWorkflowDesigner({
  serviceLine,
  catalog = [],
  templates = [],
  employees = [],
  workItems = [],
  contractDateSigned = null,
  contractDriveUrl = null,
  capabilities = {},
  onPersisted,
  addToast,
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
  const parsed = useMemo(
    () => graphToFlow(workflow?.graph, catalog, workflow?.execution_nodes || []),
    [catalog, workflow?.execution_nodes, workflow?.graph]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(parsed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(parsed.edges);
  const [startNode, setStartNode] = useState(parsed.startNode);
  const [selectedNodeId, setSelectedNodeId] = useState(parsed.startNode);
  const [inspectorTab, setInspectorTab] = useState('node');
  const [selectedTemplateId, setSelectedTemplateId] = useState(workflow?.template?.id || '');
  const [workflowLabels, setWorkflowLabels] = useState(parsed.labels);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [layouting, setLayouting] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [editMode, setEditMode] = useState(!isWorkflowTerminal && (!hasActiveRuntime || hasDraftAmendment));
  const [changeReason, setChangeReason] = useState(workflow?.change_reason || '');
  const [flowInstance, setFlowInstance] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancellationCode, setCancellationCode] = useState('CUSTOMER_REQUEST');
  const [cancellationReason, setCancellationReason] = useState('');
  const [agencyHandlingConfirmed, setAgencyHandlingConfirmed] = useState(false);
  const [agencyHandlingNote, setAgencyHandlingNote] = useState('');

  useEffect(() => {
    setNodes(parsed.nodes);
    setEdges(parsed.edges);
    setStartNode(parsed.startNode);
    setSelectedNodeId(parsed.startNode);
    setSelectedTemplateId(workflow?.template?.id || '');
    setWorkflowLabels(parsed.labels);
    setEditMode(!isWorkflowTerminal && (!hasActiveRuntime || hasDraftAmendment));
    setChangeReason(workflow?.change_reason || '');
    setCancelOpen(false);
  }, [hasActiveRuntime, hasDraftAmendment, isWorkflowTerminal, parsed, setEdges, setNodes, workflow?.change_reason, workflow?.template?.id]);

  const selectedNode = nodes.find(node => node.id === selectedNodeId) || null;
  const structureEditable = !isWorkflowTerminal && canEdit && (!hasActiveRuntime || (editMode && canAmendWorkflow));
  const canMoveLayout = !isWorkflowTerminal && canEdit && (!hasActiveRuntime || canAmendWorkflow);
  const checklistEditable = structureEditable && (
    !selectedNode?.data.taskNodeId
    || ['pending', 'ready'].includes(selectedNode.data.executionStatus)
  );
  const minimumScheduleValue = contractDateSigned ? `${contractDateSigned}T00:00` : undefined;
  const selectedNodeHasPayableWork = Boolean(
    selectedNode?.data.checklist?.some(item => item.compensation?.is_payable)
  );
  const canEditSelectedAssignments = !isWorkflowTerminal && canAssign
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
        evidenceRequired: false,
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
      checklist: [...current, {
        key: `item_${current.length + 1}`,
        name: `Checklist ${current.length + 1}`,
        required: true,
        evidence_required: false,
        evidence_description: '',
        drive_folder_url: contractDriveUrl || '',
        compensation: { is_payable: false },
      }],
    });
  }, [contractDriveUrl, selectedNode, updateSelectedNode]);

  const updateChecklistItem = useCallback((index, patch) => {
    if (!selectedNode) return;
    updateSelectedNode({
      checklist: selectedNode.data.checklist.map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...patch } : item
      )),
    });
  }, [selectedNode, updateSelectedNode]);

  const currentPayload = (reason = changeReason) => ({
      graph: flowToGraph(nodes, edges, startNode, workflowLabels),
      source_workflow_version_id: selectedTemplateId || null,
      change_reason: reason?.trim() || null,
  });

  const saveDraft = async () => {
    if (!serviceLine?.id || !structureEditable) return;
    setSaving(true);
    try {
      const result = await requestJson(`/api/contracts/workflow/${encodeURIComponent(serviceLine.id)}/draft`, {
        method: 'PUT',
        body: JSON.stringify(currentPayload()),
      });
      addToast?.(`Đã lưu bản nháp số ${result.revision_no}`, 'success');
      await onPersisted?.();
    } catch (error) {
      addToast?.(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const activateCurrentWorkflow = async () => {
    if (!serviceLine?.id || !canActivate || (hasActiveRuntime && !structureEditable)) return;
    let amendmentReason = changeReason;
    if (hasActiveRuntime && !amendmentReason.trim()) {
      amendmentReason = window.prompt('Nhập lý do sửa quy trình đang vận hành:') || '';
      if (!amendmentReason.trim()) {
        addToast?.('Cần nhập lý do để áp dụng bản sửa đổi', 'error');
        return;
      }
      setChangeReason(amendmentReason);
    }
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
    if (!window.confirm(message)) return;
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
        planned_start: null,
        planned_end: null,
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

  const saveRuntimeAssignments = async () => {
    if (!selectedNode?.data.taskNodeId || !hasActiveRuntime || !canAssign) return;
    setSavingAssignments(true);
    try {
      const result = await requestJson(
        `/api/contracts/workflow/nodes/${encodeURIComponent(selectedNode.data.taskNodeId)}/assignments`,
        {
          method: 'PUT',
          body: JSON.stringify({
            assignments: selectedNode.data.assignments || [],
            replacement_reason: 'Điều chỉnh phân công từ màn hình vận hành hợp đồng',
          }),
        }
      );
      addToast?.(
        `Đã cập nhật ${result.assignment_count} phân công và `
          + `${result.compensation_assignment_count || 0} khoản khoán dự kiến`,
        'success'
      );
      await onPersisted?.();
    } catch (error) {
      addToast?.(error.message, 'error');
    } finally {
      setSavingAssignments(false);
    }
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
              <button type="button" className="workspace-icon-button" onClick={() => setEditMode(true)}>
                <Pencil size={15} /> Sửa quy trình
              </button>
              <button type="button" disabled={savingLayout} className="workspace-icon-button" onClick={saveActiveLayout}>
                {savingLayout ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} Lưu bố cục
              </button>
            </>
          )}
          {(!hasActiveRuntime || (editMode && !isWorkflowTerminal)) && (
            <>
              <button type="button" disabled={saving || !structureEditable} className="workspace-icon-button" onClick={saveDraft}>
                {saving ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />} Lưu nháp
              </button>
              <button type="button" disabled={activating || !canActivate || !structureEditable} className="btn btn-primary btn-sm workflow-activate-button" onClick={activateCurrentWorkflow}>
                {activating ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}
                {hasActiveRuntime ? 'Áp dụng sửa đổi' : 'Kích hoạt'}
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

        <aside className="workflow-inspector">
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
              <div className="workflow-inspector__heading">
                <div>
                  <span>{selectedNode.data.code}</span>
                  <strong>{selectedNode.data.label}</strong>
                </div>
                <button type="button" disabled={!structureEditable} className="danger-icon-button" onClick={removeSelectedNode} title="Xóa Node">
                  <Trash2 size={16} />
                </button>
              </div>
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
              <label>
                Vai trò mặc định
                <input
                  className="form-control"
                  disabled={!structureEditable}
                  placeholder="MAIN, ASSISTANT, SUBMITTER..."
                  value={selectedNode.data.role}
                  onChange={event => updateSelectedNode({ role: event.target.value.toUpperCase() })}
                />
              </label>
              <label className="workflow-check-row">
                <input
                  type="checkbox"
                  disabled={!structureEditable}
                  checked={selectedNode.data.evidenceRequired}
                  onChange={event => updateSelectedNode({ evidenceRequired: event.target.checked })}
                />
                Bắt buộc nộp minh chứng
              </label>
              <button
                type="button"
                disabled={!structureEditable}
                className={`workflow-start-button${startNode === selectedNode.id ? ' active' : ''}`}
                onClick={() => setStartNode(selectedNode.id)}
              >
                <CheckCircle2 size={16} />
                {startNode === selectedNode.id ? 'Đây là Node bắt đầu' : 'Đặt làm Node bắt đầu'}
              </button>
            </div>
          ) : inspectorTab === 'checklist' ? (
            <div className="workflow-inspector__content">
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
                  <input
                    className="form-control"
                    disabled={!checklistEditable}
                    value={item.name || ''}
                    onChange={event => updateChecklistItem(index, { name: event.target.value })}
                  />
                  <label className="workflow-check-row">
                    <input
                      type="checkbox"
                      disabled={!checklistEditable}
                      checked={item.required !== false}
                      onChange={event => updateChecklistItem(index, { required: event.target.checked })}
                    />
                    Bắt buộc hoàn thành
                  </label>
                  <div className={`workflow-checklist-evidence${item.evidence_required ? ' active' : ''}`}>
                    <label className="workflow-check-row">
                      <input
                        type="checkbox"
                        disabled={!checklistEditable}
                        checked={Boolean(item.evidence_required)}
                        onChange={event => updateChecklistItem(index, { evidence_required: event.target.checked })}
                      />
                      <FileCheck2 size={15} /> Checklist này bắt buộc có minh chứng
                    </label>
                    {item.evidence_required && (
                      <>
                        <textarea
                          className="form-control"
                          rows={2}
                          disabled={!checklistEditable}
                          placeholder="Mô tả file/ảnh cần nộp, ví dụ: ảnh hiện trạng và file tọa độ GPS"
                          value={item.evidence_description || ''}
                          onChange={event => updateChecklistItem(index, { evidence_description: event.target.value })}
                        />
                        <label className="workflow-evidence-drive-field">
                          <span><FolderOpen size={14} /> Thư mục Google Drive</span>
                          <input
                            className="form-control"
                            type="url"
                            disabled={!checklistEditable}
                            placeholder="https://drive.google.com/drive/folders/..."
                            value={item.drive_folder_url || ''}
                            onChange={event => updateChecklistItem(index, { drive_folder_url: event.target.value })}
                          />
                        </label>
                        {safeExternalUrl(item.drive_folder_url || item.runtime?.evidence_data?.drive_folder_url || contractDriveUrl) && (
                          <a
                            className="workflow-evidence-link"
                            href={safeExternalUrl(item.drive_folder_url || item.runtime?.evidence_data?.drive_folder_url || contractDriveUrl)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FolderOpen size={14} /> Mở thư mục Drive <ExternalLink size={12} />
                          </a>
                        )}
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
                  <span>Người thực hiện & lịch dự kiến</span>
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
                  <div className="workflow-assignment-card__schedule">
                    <label>
                      <CalendarClock size={13} /> Bắt đầu
                      <input
                        type="datetime-local"
                        className="form-control"
                        disabled={!canEditSelectedAssignments}
                        min={minimumScheduleValue}
                        value={toLocalInput(assignment.planned_start)}
                        onChange={event => {
                          if (minimumScheduleValue && event.target.value && event.target.value < minimumScheduleValue) {
                            addToast?.('Ngày bắt đầu không được trước ngày ký hợp đồng', 'error');
                            return;
                          }
                          updateAssignment(index, { planned_start: localInputToIso(event.target.value) });
                        }}
                      />
                    </label>
                    <label>
                      <CalendarClock size={13} /> Kết thúc
                      <input
                        type="datetime-local"
                        className="form-control"
                        disabled={!canEditSelectedAssignments}
                        min={minimumScheduleValue}
                        value={toLocalInput(assignment.planned_end)}
                        onChange={event => {
                          if (minimumScheduleValue && event.target.value && event.target.value < minimumScheduleValue) {
                            addToast?.('Ngày kết thúc không được trước ngày ký hợp đồng', 'error');
                            return;
                          }
                          updateAssignment(index, { planned_end: localInputToIso(event.target.value) });
                        }}
                      />
                    </label>
                  </div>
                  {contractDateSigned && (
                    <small className="workflow-schedule-limit">
                      Không được xếp lịch trước ngày ký hợp đồng {contractDateSigned.split('-').reverse().join('/')}.
                    </small>
                  )}
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

              {hasActiveRuntime && !isWorkflowTerminal && (
                <button
                  type="button"
                  disabled={savingAssignments || !canEditSelectedAssignments || !selectedNode.data.taskNodeId}
                  className="btn btn-primary workflow-assignment-save"
                  onClick={saveRuntimeAssignments}
                >
                  {savingAssignments ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}
                  Cập nhật phân công
                </button>
              )}
              <div className="workflow-note-box">
                <LockKeyhole size={16} />
                {isWorkflowCancelled
                  ? 'Quy trình đã hủy. Phân công, checklist, minh chứng và khoản khoán đã nghiệm thu chỉ còn ở chế độ đối chiếu.'
                  : hasActiveRuntime
                  ? 'Cấu trúc và mức khoán đã khóa. Tiền chỉ phát sinh sau khi checklist Pass và Node được nghiệm thu.'
                  : 'Phân công được lưu trong bản nháp. Mức khoán lấy từ checklist và khóa khi Giám đốc kích hoạt.'}
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
        </aside>
      </div>

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
