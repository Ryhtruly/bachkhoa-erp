import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  AlignHorizontalSpaceAround,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Copy,
  FileCheck2,
  GitBranch,
  ListChecks,
  LockKeyhole,
  Pencil,
  Plus,
  Save,
  Star,
  Trash2,
  UserRound,
  UserRoundCog,
  Workflow,
  X,
} from 'lucide-react'

import ConfirmationModal from '../../components/ui/ConfirmationModal'
import CustomSelect from '../../components/ui/CustomSelect'
import Modal from '../../components/ui/Modal'
import { useToast } from '../../contexts/ToastContext'
import { apiFetch, peekApiCache } from '../../lib/api'
import '../../components/contracts/contracts.css'
import './masterWorkflowStudio.css'

// ── Danh mục Phòng ban chuẩn Bách Khoa ERP ──
export const STANDARD_DEPARTMENTS = [
  { value: 'SALES', label: 'Phòng Sale/CSKH' },
  { value: 'SURVEY', label: 'Phòng Đo vẽ' },
  { value: 'LEGAL', label: 'Phòng Pháp lý' },
  { value: 'ACCOUNTING', label: 'Phòng Kế toán' },
  { value: 'ADMIN', label: 'Ban Giám đốc' },
]

export const POOL_DEPARTMENTS = [
  ['SALES', 'Phòng Sale/CSKH'],
  ['SURVEY', 'Phòng Đo vẽ'],
  ['LEGAL', 'Phòng Pháp lý'],
  ['ACCOUNTING', 'Phòng Kế toán'],
  ['ADMIN', 'Ban Giám đốc'],
]

export const ASSIGNMENT_ROLES = [
  ['MAIN', 'Phụ trách chính'],
  ['ASSISTANT', 'Phối hợp / phụ'],
  ['WRITER', 'Soạn hồ sơ'],
  ['SUBMITTER', 'Đi nộp hồ sơ'],
  ['REVIEWER', 'Nghiệm thu'],
]

export const APPROVER_ROLES = [
  ['admin', 'Giám đốc'],
  ['accountant', 'Kế toán'],
  ['legal_staff', 'Nhân viên pháp lý'],
  ['survey_staff', 'Nhân viên đo vẽ'],
  ['sales', 'Sales'],
]

export function normalizeDepartmentCode(code) {
  if (!code) return 'SALES'
  const upper = String(code).toUpperCase().trim()
  if (upper === 'SALES' || upper.includes('KINH DOANH') || upper.includes('SALE') || upper.includes('CSKH')) return 'SALES'
  if (upper === 'SURVEY' || upper.includes('ĐO ĐẠC') || upper.includes('ĐO VẼ') || upper.includes('DO VE') || upper.includes('DO DAC')) return 'SURVEY'
  if (upper === 'LEGAL' || upper.includes('PHÁP LÝ') || upper.includes('PHAP LY')) return 'LEGAL'
  if (upper === 'ACCOUNTING' || upper.includes('KẾ TOÁN') || upper.includes('KE TOAN')) return 'ACCOUNTING'
  if (upper === 'ADMIN' || upper.includes('GIÁM ĐỐC') || upper.includes('GIAM DOC')) return 'ADMIN'
  return upper
}

export function departmentLabel(code) {
  const norm = normalizeDepartmentCode(code)
  return STANDARD_DEPARTMENTS.find((d) => d.value === norm)?.label || code || 'Phòng ban'
}

export function roleLabel(code) {
  return ASSIGNMENT_ROLES.find((item) => item[0] === code)?.[1] || code
}

// ── Multi-select vai trò nhận việc ──
function RoleMultiSelect({
  label,
  value = [],
  options = [],
  disabled = false,
  onChange,
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const selected = Array.isArray(value) ? value : []
  const selectedLabel = selected.length
    ? selected.map((code) => options.find((o) => o[0] === code)?.[1] || code).join(', ')
    : '— Chọn vai trò —'

  useEffect(() => {
    if (!open) return undefined
    const closeOnOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutside)
    return () => document.removeEventListener('mousedown', closeOnOutside)
  }, [open])

  const toggleRole = (roleCode) => {
    const next = selected.includes(roleCode)
      ? selected.filter((item) => item !== roleCode)
      : [...selected, roleCode]
    onChange?.(next)
  }

  return (
    <div
      ref={containerRef}
      className={`custom-select-container workflow-role-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}
    >
      {label && <span className="custom-select-label">{label}</span>}
      <button
        type="button"
        className="custom-select-trigger"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={`custom-select-value ${selected.length ? '' : 'is-placeholder'}`}>
          {selectedLabel}
        </span>
        <span className="custom-select-chevron">▾</span>
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" aria-label={label}>
          {options.map(([code, optionLabel]) => {
            const checked = selected.includes(code)
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
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Custom Node cho Studio (đồng bộ giao diện với ContractWorkflowDesigner) ──
function StudioWorkflowNode({ id, data, selected }) {
  const checklistCount = data.checklist?.length || 0
  const poolDept = departmentLabel(data.poolDepartmentCode)
  const durationText = []
  if (data.durationDays > 0) durationText.push(`${data.durationDays} ngày`)
  if (data.durationHours > 0) durationText.push(`${data.durationHours} giờ`)
  if (data.durationMinutes > 0) durationText.push(`${data.durationMinutes} phút`)

  return (
    <div className={`workflow-node${selected ? ' workflow-node--selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="workflow-node__handle" />
      <div className="workflow-node__topline">
        <span className="workflow-node__code">{data.code || 'K--'}</span>
        <span
          className="workflow-node__status-dot"
          style={{ background: data.isStart ? '#22a06b' : '#94a3b8' }}
          title={data.isStart ? 'Node bắt đầu (Sẵn sàng)' : 'Chờ kích hoạt'}
        />
      </div>
      <strong>{data.label || 'Bước quy trình'}</strong>
      <div className="workflow-node__meta">
        <span><ListChecks size={13} /> {checklistCount} mục</span>
        <span><UserRoundCog size={13} /> {poolDept}</span>
      </div>
      {durationText.length > 0 && (
        <div className="workflow-node__deadline">
          <Clock3 size={13} /> Hạn: {durationText.join(' ')}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="workflow-node__handle" />
    </div>
  )
}

const NODE_TYPES = { studioNode: StudioWorkflowNode }

export const DOC_SOURCE_LABELS = {
  CONG_TY: 'Công ty',
  CO_QUAN: 'Cơ quan',
  KHACH_HANG: 'Khách hàng',
}

export function defaultDeptForCode(code) {
  const upper = String(code || '').toUpperCase().trim()
  if (upper === 'K01' || upper === 'K06' || upper === 'K07') return 'SALES'
  if (upper === 'K02' || upper === 'K03' || upper === 'K05A') return 'SURVEY'
  if (upper === 'K04' || upper === 'K05B') return 'LEGAL'
  return 'SURVEY'
}

export const STARTER_NODES_SURVEY = [
  {
    code: 'K01',
    label: 'Tiếp nhận & kiểm tra đầu vào',
    dept: 'SALES',
    days: 1,
    hours: 0,
    checklist: [
      { key: 'cl_k01_1', name: 'Tiếp nhận hồ sơ & giấy tờ từ khách', required: true, require_evidence: true, output_documents: [] },
      { key: 'cl_k01_2', name: 'Kiểm tra tính hợp lệ giấy tờ đầu vào', required: true, require_evidence: false, output_documents: [] },
    ],
  },
  {
    code: 'K02',
    label: 'Khảo sát & đo hiện trường',
    dept: 'SURVEY',
    days: 2,
    hours: 0,
    createsSurveyRecord: true,
    checklist: [
      { key: 'cl_k02_1', name: 'Khảo sát & kiểm tra hiện trạng thực địa', required: true, require_evidence: true, output_documents: [] },
      { key: 'cl_k02_2', name: 'Đo đạc lấy toạ độ GPS RTK & mốc ranh', required: true, require_evidence: true, output_documents: [] },
    ],
  },
  {
    code: 'K03',
    label: 'Chuẩn hoá tài liệu kỹ thuật',
    dept: 'SURVEY',
    days: 2,
    hours: 0,
    checklist: [
      { key: 'cl_k03_1', name: 'Xử lý số liệu đo đạc & vẽ bản đồ', required: true, require_evidence: true, output_documents: [] },
      { key: 'cl_k03_2', name: 'Tính diện tích, rà soát & duyệt nội bộ', required: true, require_evidence: false, output_documents: [] },
    ],
  },
  {
    code: 'K05a',
    label: 'Nộp hồ sơ (Nội nghiệp)',
    dept: 'SURVEY',
    days: 2,
    hours: 0,
    checklist: [
      { key: 'cl_k05a_1', name: 'Nộp hồ sơ kỹ thuật thẩm định nội nghiệp', required: true, require_evidence: true, output_documents: [] },
      { key: 'cl_k05a_2', name: 'Theo dõi & nhận phiếu tiếp nhận nội nghiệp', required: true, require_evidence: true, output_documents: [] },
    ],
  },
  {
    code: 'K06',
    label: 'Nhận kết quả & bàn giao',
    dept: 'SALES',
    days: 1,
    hours: 0,
    isHandover: true,
    checklist: [
      { key: 'cl_k06_1', name: 'Kiểm tra hồ sơ hoàn chỉnh trước bàn giao', required: true, require_evidence: true, output_documents: [] },
      { key: 'cl_k06_2', name: 'Bàn giao hồ sơ cho khách hàng & ký biên bản', required: true, require_evidence: true, output_documents: [] },
    ],
  },
  {
    code: 'K07',
    label: 'Lưu trữ & đóng hồ sơ',
    dept: 'SALES',
    days: 1,
    hours: 0,
    checklist: [
      { key: 'cl_k07_1', name: 'Scan số hóa hồ sơ & lưu vào thư mục', required: true, require_evidence: false, output_documents: [] },
      { key: 'cl_k07_2', name: 'Lưu kho bản cứng & hoàn tất hợp đồng', required: true, require_evidence: false, output_documents: [] },
    ],
  },
]

export const STARTER_NODES_LEGAL = [
  {
    code: 'K01',
    label: 'Tiếp nhận & kiểm tra đầu vào',
    dept: 'SALES',
    days: 1,
    hours: 0,
    checklist: [
      { key: 'cl_k01_1', name: 'Tiếp nhận hồ sơ & giấy tờ từ khách', required: true, require_evidence: true, output_documents: [] },
      { key: 'cl_k01_2', name: 'Kiểm tra tính hợp lệ giấy tờ đầu vào', required: true, require_evidence: false, output_documents: [] },
    ],
  },
  {
    code: 'K04',
    label: 'Soạn bộ hồ sơ pháp lý',
    dept: 'LEGAL',
    days: 3,
    hours: 0,
    checklist: [
      { key: 'cl_k04_1', name: 'Gom giấy tờ & soạn đơn từ pháp lý', required: true, require_evidence: false, output_documents: [] },
      { key: 'cl_k04_2', name: 'Rà quy hoạch & hoàn thiện bộ hồ sơ', required: true, require_evidence: true, output_documents: [] },
    ],
  },
  {
    code: 'K05b',
    label: 'Nộp & theo dõi hồ sơ một cửa',
    dept: 'LEGAL',
    days: 7,
    hours: 0,
    requiresGovSubmission: true,
    checklist: [
      { key: 'cl_k05b_1', name: 'Nộp hồ sơ tại bộ phận một cửa cơ quan', required: true, require_evidence: true, output_documents: [] },
      { key: 'cl_k05b_2', name: 'Cập nhật mã biên nhận & theo dõi ngày hẹn', required: true, require_evidence: true, output_documents: [] },
    ],
  },
  {
    code: 'K06',
    label: 'Nhận kết quả & bàn giao',
    dept: 'SALES',
    days: 1,
    hours: 0,
    isHandover: true,
    checklist: [
      { key: 'cl_k06_1', name: 'Nhận kết quả từ cơ quan nhà nước', required: true, require_evidence: true, output_documents: [] },
      { key: 'cl_k06_2', name: 'Bàn giao hồ sơ cho khách hàng & ký biên bản', required: true, require_evidence: true, output_documents: [] },
    ],
  },
  {
    code: 'K07',
    label: 'Lưu trữ & đóng hồ sơ',
    dept: 'SALES',
    days: 1,
    hours: 0,
    checklist: [
      { key: 'cl_k07_1', name: 'Scan số hóa hồ sơ & lưu vào thư mục', required: true, require_evidence: false, output_documents: [] },
      { key: 'cl_k07_2', name: 'Lưu kho bản cứng & hoàn tất hợp đồng', required: true, require_evidence: false, output_documents: [] },
    ],
  },
]

export function getStarterNodesDef(packageObj) {
  const pkgName = String(packageObj?.name || '').toUpperCase()
  if (
    pkgName.includes('PHÁP LÝ') ||
    pkgName.includes('PHAP LY') ||
    pkgName.includes('XÂY DỰNG') ||
    pkgName.includes('XIN PHÉP')
  ) {
    return STARTER_NODES_LEGAL
  }
  return STARTER_NODES_SURVEY
}

export function makeStarterFlow(packageObj) {
  const starterDefs = getStarterNodesDef(packageObj)
  const nodes = starterDefs.map((item, index) => ({
    id: item.code.toLowerCase(),
    type: 'studioNode',
    position: { x: 80 + index * 280, y: 180 },
    data: {
      code: item.code,
      label: item.label,
      poolDepartmentCode: item.dept,
      claimRoles: ['MAIN'],
      durationDays: item.days,
      durationHours: item.hours,
      durationMinutes: 0,
      requiresGovSubmission: Boolean(item.requiresGovSubmission),
      createsSurveyRecord: Boolean(item.createsSurveyRecord),
      isHandover: Boolean(item.isHandover),
      checklist: (item.checklist || []).map((cl) => ({
        key: cl.key || `cl_${item.code.toLowerCase()}_${Math.random().toString(36).substr(2, 4)}`,
        name: cl.name,
        required: cl.required !== false,
        require_evidence: Boolean(cl.require_evidence),
        approver_role: 'admin',
        output_documents: cl.output_documents || [],
      })),
      description: item.description || '',
    },
  }))

  const edges = []
  for (let i = 0; i < nodes.length - 1; i += 1) {
    edges.push({
      id: `edge_${nodes[i].id}_to_${nodes[i + 1].id}`,
      source: nodes[i].id,
      target: nodes[i + 1].id,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2, stroke: '#f97316' },
    })
  }

  return { nodes, edges, startNode: nodes[0].id }
}

function flowToGraphJson(nodes, edges, startNode) {
  const graphNodes = {}
  const ui = {}

  nodes.forEach((node) => {
    const transitions = {}
    edges
      .filter((edge) => edge.source === node.id)
      .forEach((edge, index) => {
        transitions[`COMPLETED_${index + 1}`] = edge.target
      })

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
      pool_department_code: node.data.poolDepartmentCode || null,
      claim_roles: node.data.claimRoles || ['MAIN'],
      checklist: (node.data.checklist || []).map((item) => {
        const itemObj = {
          key: item.key,
          name: item.name,
          required: item.required !== false,
          require_evidence: Boolean(item.require_evidence),
          approver_role: item.approver_role || 'admin',
        }
        const validDocs = (item.output_documents || [])
          .filter((doc) => doc.template_id)
          .map((doc) => ({
            template_id: doc.template_id,
            min_count: Math.max(1, Number(doc.min_count) || 1),
            required_before_submit: doc.required_before_submit !== false,
            needs_director_approval: Boolean(doc.needs_director_approval),
          }))
        if (validDocs.length > 0) {
          itemObj.output_documents = validDocs
        }
        return itemObj
      }),
      transitions,
    }
    ui[node.id] = { x: Math.round(node.position.x), y: Math.round(node.position.y) }
  })

  return {
    start_node: startNode || nodes[0]?.id || '',
    nodes: graphNodes,
    ui,
  }
}

function graphJsonToFlow(graph, packageObj) {
  if (!graph?.nodes || Object.keys(graph.nodes).length === 0) {
    return makeStarterFlow(packageObj)
  }

  const entries = Object.entries(graph.nodes)
  const nodes = entries.map(([key, value], index) => ({
    id: key,
    type: 'studioNode',
    position: graph.ui?.[key] || { x: 80 + index * 280, y: 180 },
    data: {
      code: value.task_code || key.toUpperCase(),
      label: value.name || key,
      description: value.description || '',
      poolDepartmentCode: value.pool_department_code || '',
      claimRoles: Array.isArray(value.claim_roles) && value.claim_roles.length > 0 ? value.claim_roles : ['MAIN'],
      durationDays: Number(value.duration_days) || 0,
      durationHours: Number(value.duration_hours) || 0,
      durationMinutes: Number(value.duration_minutes) || 0,
      requiresGovSubmission: Boolean(value.requires_gov_submission),
      createsSurveyRecord: Boolean(value.creates_survey_record),
      isHandover: Boolean(value.is_handover),
      checklist: (value.checklist || []).map((item) => ({
        key: item.key || `cl_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: item.name || '',
        required: item.required !== false,
        require_evidence: Boolean(item.require_evidence),
        approver_role: item.approver_role || 'admin',
        output_documents: item.output_documents || [],
      })),
    },
  }))

  const edges = []
  entries.forEach(([sourceKey, value]) => {
    Object.entries(value.transitions || {}).forEach(([outcome, targetKey]) => {
      if (!graph.nodes[targetKey]) return
      edges.push({
        id: `edge_${sourceKey}_${targetKey}`,
        source: sourceKey,
        target: targetKey,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2, stroke: '#94a3b8' },
      })
    })
  })

  return {
    nodes,
    edges,
    startNode: graph.start_node || nodes[0]?.id || '',
  }
}

export default function MasterWorkflowStudio() {
  const { addToast } = useToast() || {}

  // Master Data
  const [packageTree, setPackageTree] = useState(() => (typeof peekApiCache === 'function' ? peekApiCache('/api/catalog/service-packages')?.data : null) || [])
  const [catalogNodes, setCatalogNodes] = useState(() => (typeof peekApiCache === 'function' ? peekApiCache('/api/document-register/workflow-nodes')?.data : null) || [])
  const [docTemplates, setDocTemplates] = useState(() => {
    if (typeof peekApiCache !== 'function') return []
    const rawDocs = peekApiCache('/api/document-register/templates')?.data?.groups || []
    return (rawDocs || []).flatMap((g) => g.items || g.templates || [])
  })

  // Selection
  const [selectedPackageId, setSelectedPackageId] = useState(() => {
    if (typeof peekApiCache !== 'function') return ''
    const pkgs = peekApiCache('/api/catalog/service-packages')?.data || []
    return pkgs[0]?.id || ''
  })
  const [selectedTaskTypeId, setSelectedTaskTypeId] = useState(() => {
    if (typeof peekApiCache !== 'function') return ''
    const pkgs = peekApiCache('/api/catalog/service-packages')?.data || []
    return pkgs[0]?.task_types?.[0]?.id || ''
  })

  // Templates
  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [isDefault, setIsDefault] = useState(false)

  // ReactFlow Canvas
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [startNode, setStartNode] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState(null)

  // Inspector States
  const [inspectorTab, setInspectorTab] = useState('node') // 'node' | 'assignment' | 'transition'
  const [isEditingDesc, setIsEditingDesc] = useState(false)

  // UI States
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nodePickerOpen, setNodePickerOpen] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // Load catalogs on mount
  useEffect(() => {
    async function init() {
      try {
        const [pkgRes, nodeRes, docRes] = await Promise.all([
          apiFetch('/api/catalog/service-packages'),
          apiFetch('/api/document-register/workflow-nodes'),
          apiFetch('/api/document-register/templates'),
        ])
        const pkgs = pkgRes?.data || []
        setPackageTree(pkgs)
        setCatalogNodes(nodeRes?.data || [])
        const rawDocs = docRes?.data?.groups || []
        const flatDocs = (rawDocs || []).flatMap((g) => g.items || g.templates || [])
        setDocTemplates(flatDocs)

        if (pkgs.length > 0) {
          setSelectedPackageId(pkgs[0].id)
          if (pkgs[0].task_types?.length > 0) {
            setSelectedTaskTypeId(pkgs[0].task_types[0].id)
          }
        }
      } catch (err) {
        addToast?.('Không thể tải danh mục gói & hạng mục', 'error')
      }
    }
    init()
  }, [addToast])

  const currentPackage = useMemo(
    () => packageTree.find((p) => p.id === selectedPackageId),
    [packageTree, selectedPackageId]
  )
  const currentTaskType = useMemo(
    () => currentPackage?.task_types?.find((t) => t.id === selectedTaskTypeId),
    [currentPackage, selectedTaskTypeId]
  )

  // Lọc danh sách mẫu giấy tờ đầu ra THEO ĐÚNG COMBO (Gói + Hạng mục)
  // và LOẠI TRỪ giấy tờ khách hàng cung cấp (chỉ lấy CONG_TY và CO_QUAN)
  const applicableComboOutputDocs = useMemo(() => {
    if (!docTemplates || docTemplates.length === 0) return []
    return docTemplates
      .filter((tpl) => {
        if (tpl.source === 'KHACH_HANG') return false

        if (tpl.task_type_id) {
          return Boolean(selectedTaskTypeId) && tpl.task_type_id === selectedTaskTypeId
        }
        if (Array.isArray(tpl.applicabilities) && tpl.applicabilities.length > 0) {
          return tpl.applicabilities.some((app) => {
            if (app.applicability_type === 'TASK_TYPE') {
              return Boolean(selectedTaskTypeId) && app.task_type_id === selectedTaskTypeId
            }
            if (app.applicability_type === 'PACKAGE') {
              return Boolean(selectedPackageId) && app.service_package_id === selectedPackageId
            }
            if (app.applicability_type === 'GLOBAL') {
              return true
            }
            return false
          })
        }
        return true
      })
      .map((tpl) => {
        const matchingApp = (tpl.applicabilities || []).find((app) => {
          if (app.applicability_type === 'TASK_TYPE' && app.task_type_id === selectedTaskTypeId) return true
          if (app.applicability_type === 'PACKAGE' && app.service_package_id === selectedPackageId) return true
          if (app.applicability_type === 'GLOBAL') return true
          return false
        })
        return {
          ...tpl,
          assigned_node_code: matchingApp?.node_code || null,
        }
      })
  }, [docTemplates, selectedPackageId, selectedTaskTypeId])

  // Load templates when Combo (Package + TaskType) changes
  const loadTemplates = useCallback(
    async (pkgId, typeId, preferredTemplateId = null) => {
      if (!pkgId || !typeId) return
      setLoading(true)
      try {
        const res = await apiFetch(
          `/api/contracts/workflow/templates?package_id=${pkgId}&task_type_id=${typeId}`
        )
        const list = res?.data || []
        setTemplates(list)

        const pkg = packageTree.find((p) => p.id === pkgId)
        if (list.length > 0) {
          let chosen = null
          if (preferredTemplateId) {
            chosen = list.find((t) => t.id === preferredTemplateId)
          }
          if (!chosen) {
            chosen = list.find((t) => t.is_default) || list[0]
          }
          setSelectedTemplateId(chosen.id)
          setTemplateName(chosen.name || '')
          setTemplateDescription(chosen.description || '')
          setIsDefault(Boolean(chosen.is_default))
          const flow = graphJsonToFlow(chosen.graph, pkg)
          setNodes(flow.nodes)
          setEdges(flow.edges)
          setStartNode(flow.startNode)
          setSelectedNodeId(flow.nodes[0]?.id || null)
        } else {
          // New combo with no templates: initialize starter flow!
          const starter = makeStarterFlow(pkg)
          setSelectedTemplateId('NEW')
          const taskTypeName = currentTaskType?.name || 'Chuẩn'
          setTemplateName(`Quy trình ${taskTypeName} chuẩn - V1`)
          setTemplateDescription(`Quy trình mẫu chuẩn cho ${taskTypeName}`)
          setIsDefault(true)
          setNodes(starter.nodes)
          setEdges(starter.edges)
          setStartNode(starter.startNode)
          setSelectedNodeId(starter.nodes[0]?.id || null)
        }
      } catch (err) {
        addToast?.(err.message || 'Không thể tải danh sách mẫu quy trình', 'error')
      } finally {
        setLoading(false)
      }
    },
    [addToast, currentTaskType?.name, packageTree, setEdges, setNodes]
  )

  useEffect(() => {
    if (selectedPackageId && selectedTaskTypeId) {
      loadTemplates(selectedPackageId, selectedTaskTypeId)
    }
  }, [selectedPackageId, selectedTaskTypeId, loadTemplates])

  const handleSelectPackage = (pkgId) => {
    setSelectedPackageId(pkgId)
    const pkg = packageTree.find((p) => p.id === pkgId)
    if (pkg?.task_types?.length > 0) {
      setSelectedTaskTypeId(pkg.task_types[0].id)
    } else {
      setSelectedTaskTypeId('')
    }
  }

  const handleSelectTemplate = (templateId) => {
    if (templateId === 'NEW' || templateId === '__CREATE_NEW__') {
      handleCreateNew()
      return
    }
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl) return
    setSelectedTemplateId(tpl.id)
    setTemplateName(tpl.name || '')
    setTemplateDescription(tpl.description || '')
    setIsDefault(Boolean(tpl.is_default))
    const flow = graphJsonToFlow(tpl.graph, currentPackage)
    setNodes(flow.nodes)
    setEdges(flow.edges)
    setStartNode(flow.startNode)
    setSelectedNodeId(flow.nodes[0]?.id || null)
  }

  const handleCreateNew = () => {
    const starter = makeStarterFlow(currentPackage)
    setSelectedTemplateId('NEW')
    const taskTypeName = currentTaskType?.name || 'Chuẩn'
    setTemplateName(`Quy trình ${taskTypeName} - Mới`)
    setTemplateDescription('')
    setIsDefault(templates.length === 0)
    setNodes(starter.nodes)
    setEdges(starter.edges)
    setStartNode(starter.startNode)
    setSelectedNodeId(starter.nodes[0]?.id || null)
    addToast?.('Đã tạo sơ đồ quy trình mới. Hãy chỉnh sửa và bấm [Lưu mẫu]', 'info')
  }

  const handleDuplicate = () => {
    setSelectedTemplateId('NEW')
    setTemplateName(`${templateName} (Bản sao)`)
    setIsDefault(false)
    addToast?.('Đã tạo bản sao. Hãy chỉnh sửa và bấm [Lưu mẫu]', 'info')
  }

  const handleConnect = useCallback(
    (params) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { strokeWidth: 2, stroke: '#f97316' },
          },
          eds
        )
      )
    },
    [setEdges]
  )

  const handleAutoLayout = () => {
    setNodes((nds) =>
      nds.map((node, index) => ({
        ...node,
        position: { x: 80 + index * 280, y: 180 },
      }))
    )
    addToast?.('Đã căn lề tự động các node trên sơ đồ', 'success')
  }

  const handleAddNodeFromCatalog = (catalogItem) => {
    setNodePickerOpen(false)
    const newId = `${catalogItem.code.toLowerCase()}_${Date.now().toString(36).substr(-4)}`
    const lastNode = nodes[nodes.length - 1]
    const nextX = lastNode ? lastNode.position.x + 280 : 80
    const nextY = lastNode ? lastNode.position.y : 180

    const newNode = {
      id: newId,
      type: 'studioNode',
      position: { x: nextX, y: nextY },
      data: {
        code: catalogItem.code,
        label: catalogItem.name,
        description: catalogItem.description || '',
        poolDepartmentCode: defaultDeptForCode(catalogItem.code),
        claimRoles: ['MAIN'],
        durationDays: 1,
        durationHours: 0,
        durationMinutes: 0,
        requiresGovSubmission: catalogItem.code === 'K05b',
        createsSurveyRecord: catalogItem.code === 'K02',
        isHandover: catalogItem.code === 'K06',
        checklist: [
          {
            key: `cl_${newId}_1`,
            name: `Nhiệm vụ bước ${catalogItem.code}`,
            required: true,
            require_evidence: false,
            approver_role: 'admin',
            output_documents: [],
          },
        ],
      },
    }

    setNodes((nds) => [...nds, newNode])
    setSelectedNodeId(newId)
    setInspectorTab('node')
    addToast?.(`Đã thêm bước [${catalogItem.code}] ${catalogItem.name}`, 'success')
  }

  const handleSave = async () => {
    const trimmedName = templateName.trim()
    if (!trimmedName || trimmedName.length < 2) {
      addToast?.('Tên mẫu quy trình phải có ít nhất 2 ký tự', 'error')
      return
    }
    if (nodes.length === 0) {
      addToast?.('Quy trình phải có ít nhất 1 node', 'error')
      return
    }

    setSaving(true)
    try {
      const graph = flowToGraphJson(nodes, edges, startNode)
      const payload = {
        name: trimmedName,
        description: templateDescription.trim() || null,
        service_package_id: selectedPackageId,
        task_type_id: selectedTaskTypeId,
        is_default: Boolean(isDefault),
        graph,
      }

      let res
      if (selectedTemplateId === 'NEW' || !selectedTemplateId) {
        res = await apiFetch('/api/contracts/workflow/templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        addToast?.(`Đã tạo mẫu quy trình “${trimmedName}” thành công!`, 'success')
      } else {
        res = await apiFetch(`/api/contracts/workflow/templates/${selectedTemplateId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        addToast?.(`Đã cập nhật mẫu quy trình “${trimmedName}” thành công!`, 'success')
      }

      const savedId = res?.data?.id || selectedTemplateId
      setSaveModalOpen(false)
      await loadTemplates(selectedPackageId, selectedTaskTypeId, savedId)
    } catch (err) {
      addToast?.(err.message || 'Lỗi khi lưu mẫu quy trình', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedTemplateId || selectedTemplateId === 'NEW') return
    try {
      await apiFetch(`/api/contracts/workflow/templates/${selectedTemplateId}`, {
        method: 'DELETE',
      })
      addToast?.('Đã xóa mẫu quy trình', 'success')
      setConfirmDeleteOpen(false)
      await loadTemplates(selectedPackageId, selectedTaskTypeId)
    } catch (err) {
      addToast?.(err.message || 'Không thể xóa mẫu này', 'error')
    }
  }

  // Node Inspector helper functions
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  )

  const currentNodeCode = selectedNode?.data?.code || ''

  const { nodeSpecificDocs, otherComboDocs } = useMemo(() => {
    const nodeSpecific = []
    const others = []

    applicableComboOutputDocs.forEach((dt) => {
      if (currentNodeCode && dt.assigned_node_code === currentNodeCode) {
        nodeSpecific.push(dt)
      } else {
        others.push(dt)
      }
    })

    return { nodeSpecificDocs: nodeSpecific, otherComboDocs: others }
  }, [applicableComboOutputDocs, currentNodeCode])

  const updateSelectedNodeData = useCallback(
    (patch) => {
      if (!selectedNodeId) return
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n))
      )
    },
    [selectedNodeId, setNodes]
  )

  const handleDeleteNode = (nodeId) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null)
    }
    addToast?.('Đã xóa node khỏi sơ đồ', 'info')
  }

  // Checklist manipulations
  const addChecklistItem = () => {
    if (!selectedNodeId) return
    const newItem = {
      key: `cl_${selectedNodeId}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`,
      name: '',
      required: true,
      require_evidence: false,
      approver_role: 'admin',
      output_documents: [],
    }
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selectedNodeId) return n
        const current = n.data?.checklist || []
        return { ...n, data: { ...n.data, checklist: [...current, newItem] } }
      })
    )
  }

  const updateChecklistItem = (itemKey, patch) => {
    if (!selectedNodeId) return
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selectedNodeId) return n
        const current = n.data?.checklist || []
        const next = current.map((item) => (item.key === itemKey ? { ...item, ...patch } : item))
        return { ...n, data: { ...n.data, checklist: next } }
      })
    )
  }

  const removeChecklistItem = (itemKey) => {
    if (!selectedNodeId) return
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selectedNodeId) return n
        const current = n.data?.checklist || []
        return { ...n, data: { ...n.data, checklist: current.filter((i) => i.key !== itemKey) } }
      })
    )
  }

  const moveChecklistItem = (itemKey, direction) => {
    if (!selectedNodeId) return
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selectedNodeId) return n
        const current = [...(n.data?.checklist || [])]
        const idx = current.findIndex((i) => i.key === itemKey)
        if (idx < 0) return n
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1
        if (targetIdx < 0 || targetIdx >= current.length) return n
        const [moved] = current.splice(idx, 1)
        current.splice(targetIdx, 0, moved)
        return { ...n, data: { ...n.data, checklist: current } }
      })
    )
  }

  const addOutputDoc = (itemKey, templateId) => {
    if (!templateId || !selectedNodeId) return
    const template = docTemplates.find((d) => d.id === templateId)
    if (!template) return
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selectedNodeId) return n
        const current = n.data?.checklist || []
        const next = current.map((item) => {
          if (item.key !== itemKey) return item
          const docs = item.output_documents || []
          if (docs.some((d) => d.template_id === templateId)) return item
          return {
            ...item,
            output_documents: [
              ...docs,
              { template_id: template.id, template_name: template.name, required_before_submit: true },
            ],
          }
        })
        return { ...n, data: { ...n.data, checklist: next } }
      })
    )
  }

  const removeOutputDoc = (itemKey, templateId) => {
    if (!selectedNodeId) return
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selectedNodeId) return n
        const current = n.data?.checklist || []
        const next = current.map((item) => {
          if (item.key !== itemKey) return item
          return {
            ...item,
            output_documents: (item.output_documents || []).filter((d) => d.template_id !== templateId),
          }
        })
        return { ...n, data: { ...n.data, checklist: next } }
      })
    )
  }

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isStart: n.id === startNode,
        },
      })),
    [nodes, startNode]
  )

  return (
    <div className="workflow-designer mws-container">
      {/* ── Top Bar: Combo Selection (Gói Dịch Vụ & Hạng Mục) ── */}
      <header className="mws-topbar">
        <div className="mws-topbar__row1">
          <div className="mws-combo-bar">
            {/* Gói dịch vụ */}
            <div className="mws-combo-group">
              <span className="mws-group-label">Gói Dịch Vụ:</span>
              <div className="mws-pkg-tabs" role="tablist">
                {packageTree.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    role="tab"
                    aria-selected={selectedPackageId === pkg.id}
                    className={`mws-pkg-tab${selectedPackageId === pkg.id ? ' is-active' : ''}`}
                    onClick={() => handleSelectPackage(pkg.id)}
                  >
                    {pkg.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mws-divider-vertical" />

            {/* Hạng mục công việc chuẩn CustomSelect */}
            <div className="mws-combo-group mws-task-type-group">
              <span className="mws-group-label">Hạng Mục:</span>
              <CustomSelect
                aria-label="Hạng mục công việc"
                className="mws-custom-select mws-task-type-select"
                value={selectedTaskTypeId}
                options={(currentPackage?.task_types || []).map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
                onChange={(val) => setSelectedTaskTypeId(val)}
                placeholder="— Chọn hạng mục —"
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── Canvas Toolbar: Đồng bộ với ContractWorkflowDesigner (media_1788839002191.png) ── */}
      <div className="workflow-designer__toolbar mws-toolbar">
        <div className="workflow-designer__toolbar-actions">
          {/* 1. Dropdown chọn Mẫu quy trình (có tooltip định hướng khi rê chuột) */}
          <div className="workflow-template-picker">
            <CustomSelect
              aria-label="Mẫu quy trình"
              className="workflow-template-select"
              value={selectedTemplateId || ''}
              options={[
                ...(templates || []).map((template) => {
                  const isComboMatch =
                    template.service_package_id === selectedPackageId &&
                    template.task_type_id === selectedTaskTypeId
                  const star = template.is_default ? ' ★ (Mặc định)' : (isComboMatch ? ' (Combo)' : '')
                  const note = template.description?.trim()
                    ? `Quy trình này dùng cho: ${template.description}`
                    : 'Quy trình chuẩn cho hạng mục này'
                  return {
                    value: template.id,
                    label: `${template.name}${star} · V${template.version || 1}`,
                    title: note,
                    description: note,
                  }
                }),
                ...(selectedTemplateId === 'NEW'
                  ? [
                      {
                        value: 'NEW',
                        label: '✨ Mẫu mới (chưa lưu)',
                        title: 'Mẫu quy trình mới đang thiết kế',
                        description: 'Mẫu quy trình mới đang thiết kế',
                      },
                    ]
                  : []),
                {
                  value: '__CREATE_NEW__',
                  label: '+ Tự thiết kế (Mẫu mới)',
                  title: 'Tạo quy trình mẫu mới hoàn toàn',
                  description: 'Tạo quy trình mẫu mới hoàn toàn',
                },
              ]}
              onChange={(val) => {
                if (val === '__CREATE_NEW__') {
                  handleCreateNew()
                } else {
                  handleSelectTemplate(val)
                }
              }}
              placeholder="— Chọn mẫu quy trình —"
            />
          </div>

          {/* 2. Nút Thêm node */}
          <div className="workflow-node-picker">
            <button
              type="button"
              className="workspace-icon-button"
              title="Thêm node"
              aria-expanded={nodePickerOpen}
              aria-haspopup="listbox"
              onClick={() => setNodePickerOpen((v) => !v)}
            >
              <Plus size={16} /> Thêm node
            </button>
            {nodePickerOpen && (
              <>
                <div
                  className="workflow-node-picker__backdrop"
                  onClick={() => setNodePickerOpen(false)}
                />
                <div className="workflow-node-picker__menu" role="listbox">
                  {catalogNodes.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      role="option"
                      className="workflow-node-picker__item"
                      onClick={() => handleAddNodeFromCatalog(item)}
                    >
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

          {/* 3. Nút Căn */}
          <button
            type="button"
            className="workspace-icon-button"
            onClick={handleAutoLayout}
            title="Căn lề tự động các node"
          >
            <AlignHorizontalSpaceAround size={16} /> Căn
          </button>

          {/* 4. Nút Lưu mẫu */}
          <button
            type="button"
            className="workspace-icon-button btn-primary"
            onClick={() => setSaveModalOpen(true)}
            title="Lưu mẫu"
            aria-label="Lưu mẫu"
          >
            <Save size={15} /> Lưu mẫu
          </button>

          {/* 5. Nút Nhân bản */}
          <button
            type="button"
            className="workspace-icon-button"
            disabled={selectedTemplateId === 'NEW' || !selectedTemplateId}
            onClick={handleDuplicate}
            title="Nhân bản mẫu hiện tại"
          >
            <Copy size={15} /> Nhân bản
          </button>

          {/* 6. Nút Xóa */}
          <button
            type="button"
            className="workspace-icon-button danger-icon-button"
            disabled={!selectedTemplateId || selectedTemplateId === 'NEW'}
            onClick={() => setConfirmDeleteOpen(true)}
            title="Xóa mẫu quy trình này"
          >
            <Trash2 size={15} /> Xóa
          </button>
        </div>
      </div>

      {/* ── Main Body: Canvas + Inspector 3 Tab ── */}
      <div className="workflow-designer__body mws-body">
        {/* Canvas Area */}
        <div className="workflow-designer__canvas mws-canvas-area">
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            nodeTypes={NODE_TYPES}
            onNodeClick={(_evt, node) => {
              setSelectedNodeId(node.id)
              setIsEditingDesc(false)
            }}
            onPaneClick={() => {
              setSelectedNodeId(null)
              setIsEditingDesc(false)
            }}
            fitView
            minZoom={0.2}
            maxZoom={1.5}
          >
            <Background gap={20} size={1} color="var(--workflow-grid, #e2e8f0)" />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeColor={(node) => (node.id === startNode ? '#22a06b' : '#94a3b8')}
            />
          </ReactFlow>
        </div>

        {/* Bảng Inspector bên phải (Chuẩn 3 Tab của ContractWorkflowDesigner) */}
        <aside className="workflow-inspector mws-inspector">
          <div className="workflow-inspector__tabs">
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
                {/* 1. Lưới cấu hình Node theo chuẩn contracts.css (.wf-node-grid) */}
                <div className="wf-node-grid">
                  <div className="wf-node-grid__row">
                    <span className="wf-node-grid__label">Tên bước</span>
                    <div className="wf-node-grid__value">
                      <input
                        type="text"
                        className="mws-node-title-input"
                        value={selectedNode.data.label || ''}
                        onChange={(e) => updateSelectedNodeData({ label: e.target.value })}
                        placeholder="Tên bước thực hiện..."
                      />
                    </div>
                  </div>

                  <div className="wf-node-grid__row">
                    <span className="wf-node-grid__label">Mô tả</span>
                    <div className="wf-node-grid__value wf-node-grid__value--desc">
                      {isEditingDesc ? (
                        <textarea
                          rows={2}
                          autoFocus
                          placeholder="Việc phải làm ở bước này…"
                          value={selectedNode.data.description || ''}
                          onChange={(e) => updateSelectedNodeData({ description: e.target.value })}
                          onBlur={() => setIsEditingDesc(false)}
                        />
                      ) : (
                        <>
                          <p>{selectedNode.data.description || '—'}</p>
                          <button
                            type="button"
                            className="wf-node-grid__edit"
                            onClick={() => setIsEditingDesc(true)}
                            title="Sửa mô tả bước"
                            aria-label="Sửa mô tả bước"
                          >
                            <Pencil size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 2. Đội ngũ Bể việc - contracts.css dùng display: contents để tạo dòng Phòng ban & Vai trò */}
                  <section className="workflow-pool-config" aria-label="Đội ngũ nhận việc">
                    <div className="workflow-pool-config__heading">
                      <span>Đội ngũ</span>
                      <strong>Bể việc</strong>
                    </div>
                    <div className="workflow-pool-config__department">
                      <span className="workflow-pool-config__label">Phòng ban nhận việc</span>
                      <CustomSelect
                        aria-label="Phòng ban phụ trách"
                        value={normalizeDepartmentCode(selectedNode.data.poolDepartmentCode)}
                        options={STANDARD_DEPARTMENTS}
                        placeholder="— Chọn phòng ban —"
                        onChange={(val) =>
                          updateSelectedNodeData({
                            poolDepartmentCode: val,
                          })
                        }
                      />
                    </div>
                    <div className="workflow-pool-config__roles">
                      <RoleMultiSelect
                        label="Vai trò được nhận việc"
                        value={selectedNode.data.claimRoles || ['MAIN']}
                        options={ASSIGNMENT_ROLES}
                        onChange={(claimRoles) => updateSelectedNodeData({ claimRoles })}
                      />
                    </div>
                  </section>

                  {/* 3. Thời hạn SLA - contracts.css dùng display: contents để tạo dòng Thời lượng */}
                  <section className="workflow-duration-editor" aria-label="Thời hạn xử lý Node">
                    <div className="workflow-duration-editor__heading">
                      <span>Thời hạn xử lý tiêu chuẩn</span>
                      <strong>
                        {[
                          Number(selectedNode.data.durationDays) ? `${selectedNode.data.durationDays} ngày` : null,
                          Number(selectedNode.data.durationHours) ? `${selectedNode.data.durationHours} giờ` : null,
                          Number(selectedNode.data.durationMinutes) ? `${selectedNode.data.durationMinutes} phút` : null,
                        ]
                          .filter(Boolean)
                          .join(' ') || 'Không đặt hạn'}
                      </strong>
                    </div>
                    <div className="workflow-duration-editor__fields">
                      {[
                        ['durationDays', 'Ngày', 365],
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
                            value={selectedNode.data[field] ?? ''}
                            onChange={(event) => {
                              const raw = event.target.value
                              updateSelectedNodeData({
                                [field]: raw === '' ? '' : Math.min(max, Math.max(0, Math.trunc(Number(raw) || 0))),
                              })
                            }}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                </div>
              </div>

              {/* 4. Dải tiêu đề Checklist */}
              <div className="wcl-section-head">
                <div className="wcl-section-head__meta">
                  <div className="wcl-section-title">
                    <span className="wcl-section-dot" />
                    Danh sách checklist
                    <em>· {selectedNode.data.checklist?.length || 0} mục</em>
                  </div>
                </div>
                <div className="wcl-section-actions">
                  <button
                    type="button"
                    className="wcl-btn wcl-btn--primary wcl-btn--icon"
                    onClick={addChecklistItem}
                    title="Thêm mục checklist"
                    aria-label="Thêm mục"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              {/* 5. Vùng cuộn Checklist cards */}
              <div className="wf-node-panel__scroll">
                {(selectedNode.data.checklist || []).length === 0 ? (
                  <div className="workflow-inspector__empty compact">
                    <ListChecks size={24} />
                    <span>Chưa có checklist. Bấm "+" để thêm nhiệm vụ.</span>
                  </div>
                ) : (
                  (selectedNode.data.checklist || []).map((item, index) => (
                    <div className="workflow-checklist-card" key={item.key || index}>
                      {/* Top: Số thứ tự cam tròn, tên việc inline, nút xoá */}
                      <div className="wcl-top">
                        <span className="wcl-count" title="Thứ tự">{index + 1}</span>
                        <input
                          className="wcl-name-inline"
                          value={item.name || ''}
                          title={item.name || 'Chưa đặt tên'}
                          placeholder="Nhập tên nhiệm vụ tự do..."
                          onChange={(e) => updateChecklistItem(item.key, { name: e.target.value })}
                        />
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button
                            type="button"
                            className="btn btn-icon btn-ghost btn-sm"
                            disabled={index === 0}
                            onClick={() => moveChecklistItem(item.key, 'up')}
                            title="Lên trên"
                            style={{ padding: 2, height: 22, width: 22 }}
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon btn-ghost btn-sm"
                            disabled={index === (selectedNode.data.checklist?.length || 0) - 1}
                            onClick={() => moveChecklistItem(item.key, 'down')}
                            title="Xuống dưới"
                            style={{ padding: 2, height: 22, width: 22 }}
                          >
                            <ArrowDown size={12} />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="wcl-x"
                          onClick={() => removeChecklistItem(item.key)}
                          title="Xóa mục checklist này"
                          aria-label="Xóa mục checklist"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      {/* Toggles: Bắt buộc & Minh chứng */}
                      <div className="wcl-prop" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 10px' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={item.required !== false}
                            onChange={(e) => updateChecklistItem(item.key, { required: e.target.checked })}
                          />
                          <span>Bắt buộc</span>
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(item.require_evidence)}
                            onChange={(e) => updateChecklistItem(item.key, { require_evidence: e.target.checked })}
                          />
                          <span>Minh chứng</span>
                        </label>
                      </div>

                      {/* Người duyệt */}
                      <div className="wcl-prop">
                        <span className="wcl-prop__label"><UserRound size={13} /> Duyệt</span>
                        <div className="wcl-prop__field">
                          <select
                            className="form-control form-control-sm"
                            value={item.approver_role || 'admin'}
                            onChange={(e) => updateChecklistItem(item.key, { approver_role: e.target.value })}
                          >
                            {APPROVER_ROLES.map(([code, label]) => (
                              <option key={code} value={code}>{label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Tài liệu đầu ra đính kèm theo Combo */}
                      <div className="wcl-prop wcl-prop--output">
                        <span className="wcl-prop__label"><FileCheck2 size={13} /> Tài liệu đầu ra</span>
                        {(item.output_documents || []).length > 0 ? (
                          <div className="wcl-output-panel">
                            <div className="wcl-output-panel__scroll">
                              {item.output_documents.map((doc) => {
                                const tpl = docTemplates.find((d) => d.id === doc.template_id)
                                const tenTaiLieu = doc.template_name || tpl?.name || doc.template_id
                                return (
                                  <div className="wcl-output-row" key={doc.template_id}>
                                    <div className="wcl-output-row__top" title={tenTaiLieu}>
                                      <span className="wcl-chip wcl-chip--doc">
                                        <FileCheck2 size={12} />
                                        {tenTaiLieu}
                                      </span>
                                      <label className="wcl-output-row__req">
                                        <input
                                          type="checkbox"
                                          checked={doc.required_before_submit !== false}
                                          onChange={(e) => {
                                            const nextDocs = item.output_documents.map((d) =>
                                              d.template_id === doc.template_id
                                                ? { ...d, required_before_submit: e.target.checked }
                                                : d
                                            )
                                            updateChecklistItem(item.key, { output_documents: nextDocs })
                                          }}
                                        />
                                        bắt buộc
                                      </label>
                                      <button
                                        type="button"
                                        className="wcl-chip__x"
                                        onClick={() => removeOutputDoc(item.key, doc.template_id)}
                                        title={`Bỏ ${tenTaiLieu}`}
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : (
                          <span className="wcl-prop__none">Chưa gán giấy tờ đầu ra</span>
                        )}

                        {/* Select gắn giấy tờ đầu ra từ Combo */}
                        <div style={{ marginTop: 6 }}>
                          <select
                            className="form-control form-control-sm mws-doc-select"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                addOutputDoc(item.key, e.target.value)
                              }
                            }}
                          >
                            <option value="">
                              {nodeSpecificDocs.length > 0
                                ? `+ Gắn giấy tờ đầu ra bước ${currentNodeCode}… (${nodeSpecificDocs.length} mẫu chuẩn)`
                                : `+ Gắn loại giấy tờ đầu ra… (${applicableComboOutputDocs.length} mẫu trong combo)`}
                            </option>
                            {nodeSpecificDocs.length > 0 && (
                              <optgroup label={`★ Khuyến nghị cho bước [${currentNodeCode}] (${nodeSpecificDocs.length} mẫu)`}>
                                {nodeSpecificDocs.map((dt) => {
                                  const isAttached = (item.output_documents || []).some((d) => d.template_id === dt.id)
                                  return (
                                    <option key={dt.id} value={dt.id} disabled={isAttached}>
                                      {isAttached ? '✓ ' : ''}[{DOC_SOURCE_LABELS[dt.source] || 'Đầu ra'}] {dt.name}
                                    </option>
                                  )
                                })}
                              </optgroup>
                            )}
                            {otherComboDocs.length > 0 && (
                              <optgroup label="Các mẫu đầu ra khác trong Combo">
                                {otherComboDocs.map((dt) => {
                                  const isAttached = (item.output_documents || []).some((d) => d.template_id === dt.id)
                                  const nodeHint = dt.assigned_node_code ? ` (Bước ${dt.assigned_node_code})` : ''
                                  return (
                                    <option key={dt.id} value={dt.id} disabled={isAttached}>
                                      {isAttached ? '✓ ' : ''}[{DOC_SOURCE_LABELS[dt.source] || 'Đầu ra'}] {dt.name}{nodeHint}
                                    </option>
                                  )
                                })}
                              </optgroup>
                            )}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 6. Chân Inspector: Nút "Node bắt đầu" */}
              <div className="wf-node-panel__foot">
                <button
                  type="button"
                  className={`workflow-start-node-dashed-btn${startNode === selectedNode.id ? ' is-active' : ''}`}
                  onClick={() => setStartNode(selectedNode.id)}
                >
                  <CheckCircle2 size={15} />
                  {startNode === selectedNode.id ? 'Node bắt đầu' : 'Đặt làm node bắt đầu'}
                </button>
              </div>
            </div>
          ) : inspectorTab === 'assignment' ? (
            /* Tab Phân công */
            <div className="workflow-inspector__content workflow-assignment-panel">
              <div className="workflow-inspector__section-title">
                <div>
                  <span>Cấu hình nhận việc từ Bể việc</span>
                  <strong>{selectedNode.data.code}</strong>
                </div>
              </div>

              <div className="workflow-pool-config">
                <div className="workflow-pool-config__heading">
                  <span>Đội ngũ tiếp nhận</span>
                  <strong>Bể việc</strong>
                </div>
                <div className="workflow-pool-config__department">
                  <span className="workflow-pool-config__label">Phòng ban nhận việc</span>
                  <CustomSelect
                    aria-label="Phòng ban nhận việc"
                    value={normalizeDepartmentCode(selectedNode.data.poolDepartmentCode)}
                    options={STANDARD_DEPARTMENTS}
                    onChange={(val) => updateSelectedNodeData({ poolDepartmentCode: val })}
                  />
                </div>
                <div className="workflow-pool-config__roles">
                  <RoleMultiSelect
                    label="Vai trò được nhận việc"
                    value={selectedNode.data.claimRoles || ['MAIN']}
                    options={ASSIGNMENT_ROLES}
                    onChange={(claimRoles) => updateSelectedNodeData({ claimRoles })}
                  />
                </div>
              </div>

              <div className="workflow-note-box" style={{ marginTop: 16 }}>
                <LockKeyhole size={16} />
                Khi khởi tạo hợp đồng thực tế từ mẫu này, các nhân viên thuộc phòng ban và vai trò trên sẽ thấy việc trong Bể việc để nhận và xử lý.
              </div>
            </div>
          ) : (
            /* Tab Điều kiện */
            <div className="workflow-inspector__content">
              <div className="workflow-section-block">
                <label className="workflow-section-block__label">ĐIỀU KIỆN KÍCH HOẠT</label>
                <div className="workflow-trigger-group">
                  <label className="workflow-trigger-item">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedNode.data.requiresGovSubmission)}
                      onChange={(e) => updateSelectedNodeData({ requiresGovSubmission: e.target.checked })}
                    />
                    <div className="workflow-trigger-item__info">
                      <strong>Yêu cầu nộp cơ quan nhà nước</strong>
                      <span>Theo dõi một cửa & biên nhận hẹn trả kết quả</span>
                    </div>
                  </label>

                  <label className="workflow-trigger-item">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedNode.data.createsSurveyRecord)}
                      onChange={(e) => updateSelectedNodeData({ createsSurveyRecord: e.target.checked })}
                    />
                    <div className="workflow-trigger-item__info">
                      <strong>Bước đo vẽ</strong>
                      <span>Tạo biên bản khảo sát hiện trường & toạ độ mốc ranh</span>
                    </div>
                  </label>

                  <label className="workflow-trigger-item">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedNode.data.isHandover)}
                      onChange={(e) => updateSelectedNodeData({ isHandover: e.target.checked })}
                    />
                    <div className="workflow-trigger-item__info">
                      <strong>Bước bàn giao</strong>
                      <span>Bàn giao hồ sơ cho khách hàng & chốt công nợ</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="workflow-inspector__section-title">
                <div>
                  <span>Đường chuyển bước</span>
                  <strong>{edges.filter((edge) => edge.source === selectedNode.id).length} nhánh</strong>
                </div>
              </div>

              {edges
                .filter((edge) => edge.source === selectedNode.id)
                .map((edge, eIdx) => {
                  const targetNode = nodes.find((n) => n.id === edge.target)
                  return (
                    <div className="workflow-transition-card" key={edge.id || eIdx}>
                      <GitBranch size={16} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                          Sau khi hoàn thành bước {selectedNode.data.code}
                        </div>
                        <strong>→ [{targetNode?.data?.code || 'K--'}] {targetNode?.data?.label || edge.target}</strong>
                      </div>
                      <button
                        type="button"
                        className="btn btn-icon btn-ghost btn-sm is-danger"
                        onClick={() => setEdges((eds) => eds.filter((e) => e.id !== edge.id))}
                        title="Xóa nhánh này"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
            </div>
          )}
        </aside>
      </div>

      {/* Modal Lưu Mẫu Quy Trình */}
      <Modal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title="Lưu mẫu quy trình"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSaveModalOpen(false)}
            >
              Huỷ
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || templateName.trim().length < 2}
              onClick={handleSave}
            >
              <Save size={15} /> {saving ? 'Đang lưu…' : 'Lưu mẫu quy trình'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>
              Tên mẫu quy trình <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              className="form-control"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="VD: Quy trình Cắm mốc chuẩn - V1"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>
              Ghi chú định hướng (Quy trình này dùng cho...)
            </label>
            <textarea
              className="form-control"
              rows={3}
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Ghi chú định hướng, ví dụ: Quy trình này dùng cho các thửa đất có tranh chấp ranh giới, hồ sơ trích lục phức tạp..."
            />
            <small style={{ color: 'var(--text-tertiary)', marginTop: 4, display: 'block' }}>
              Ghi chú này sẽ hiện ra khi rê chuột vào tên quy trình trong danh sách chọn mẫu.
            </small>
          </div>

          <label className={`mws-default-toggle${isDefault ? ' is-default' : ''}`} style={{ marginTop: 4 }}>
            <input
              type="checkbox"
              aria-label="Mặc định của combo"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <Star size={14} fill={isDefault ? '#f59e0b' : 'none'} color={isDefault ? '#f59e0b' : '#64748b'} />
            <span>{isDefault ? 'Mặc định Combo' : 'Đặt làm mặc định cho Combo'}</span>
          </label>
        </div>
      </Modal>

      {/* Confirmation Modal Xóa Mẫu */}
      <ConfirmationModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title={`Xóa mẫu quy trình “${templateName}”?`}
        description="Mẫu quy trình này sẽ bị xóa khỏi danh mục mẫu của Combo. Các hợp đồng đang chạy không bị ảnh hưởng."
        confirmLabel="Xác nhận xóa"
        variant="danger"
      />
    </div>
  )
}
