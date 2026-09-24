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
  Banknote,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Compass,
  Copy,
  FileCheck2,
  GitBranch,
  Landmark,
  ListChecks,
  LockKeyhole,
  Monitor,
  Pencil,
  Plus,
  Receipt,
  Save,
  Scale,
  Settings,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  UserRoundCog,
  Workflow,
  X,
} from 'lucide-react'

import CatalogManageModal from '../../components/catalog/CatalogManageModal'
import ConfirmationModal from '../../components/ui/ConfirmationModal'
import CustomSelect from '../../components/ui/CustomSelect'
import Modal from '../../components/ui/Modal'
import { useToast } from '../../contexts/ToastContext'
import { apiFetch, peekApiCache } from '../../lib/api'
import '../../components/contracts/contracts.css'
import './masterWorkflowStudio.css'
import { checkSequentialConnection } from '../../components/contracts/workflowEdgeRouting'
import {
  GOV_SUBMIT_CAPABILITY,
  GOV_TRACKING_CAPABILITY,
  LEGACY_GOV_SUBMISSION_CAPABILITY,
  normalizeGovernmentCapability,
} from '../../components/contracts/governmentCapability'

// ── Danh mục Phòng ban chuẩn Bách Khoa ERP ──
export const STANDARD_DEPARTMENTS = [
  { value: 'SALES', label: 'Phòng Sale/CSKH' },
  { value: 'SURVEY', label: 'Phòng Đo vẽ' },
  { value: 'LEGAL', label: 'Phòng Pháp lý' },
  { value: 'ACCOUNTING', label: 'Phòng Kế toán' },
]

export const POOL_DEPARTMENTS = [
  ['SALES', 'Phòng Sale/CSKH'],
  ['SURVEY', 'Phòng Đo vẽ'],
  ['LEGAL', 'Phòng Pháp lý'],
  ['ACCOUNTING', 'Phòng Kế toán'],
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

// ── 6 Năng Lực Chuẩn Bách Khoa ERP (Combo-First Architecture) ──
export const CAPABILITIES = [
  {
    code: 'STANDARD',
    label: 'Tác nghiệp tiêu chuẩn',
    desc: 'Checklist thông thường, tải tài liệu',
    icon: CheckCircle2,
    color: '#3b82f6',
    suggestDept: 'SALES',
  },
  {
    code: 'SURVEY_FIELD',
    label: 'Khảo sát & Đo thực địa',
    desc: 'Tự động tạo Sổ Đo Đạc, bấm giờ xuất phát đo',
    icon: Compass,
    color: '#10b981',
    suggestDept: 'SURVEY',
  },
  {
    code: 'SURVEY_CAD',
    label: 'Biên tập bản vẽ CAD',
    desc: 'Xử lý toạ độ GPS, kế thừa số liệu đo',
    icon: Monitor,
    color: '#0d9488',
    suggestDept: 'SURVEY',
  },
  {
    code: 'LEGAL_PREP',
    label: 'Soạn thảo hồ sơ pháp lý',
    desc: 'Rà quy hoạch, chuẩn bị đơn từ',
    icon: Scale,
    color: '#8b5cf6',
    suggestDept: 'LEGAL',
  },
  {
    code: GOV_SUBMIT_CAPABILITY,
    label: 'Nộp hồ sơ & nhập biên nhận',
    desc: 'Lưu số biên nhận và bằng chứng đã nộp, không theo dõi vòng đời',
    icon: Landmark,
    color: '#ea580c',
    suggestDept: 'LEGAL',
  },
  {
    code: GOV_TRACKING_CAPABILITY,
    label: 'Theo dõi hồ sơ Một cửa',
    desc: 'Theo dõi trạng thái hồ sơ đến khi hoàn thành',
    icon: Landmark,
    color: '#ea580c',
    suggestDept: 'LEGAL',
  },
  {
    code: 'HANDOVER',
    label: 'Bàn giao & Quyết toán',
    desc: 'Cổng đối soát công nợ kế toán',
    icon: Receipt,
    color: '#d97706',
    suggestDept: 'SALES',
  },
]

export function capabilityMeta(code) {
  return CAPABILITIES.find((c) => c.code === code) || CAPABILITIES[0]
}

// ── Custom Node cho Studio (đồng bộ giao diện với ContractWorkflowDesigner) ──
function StudioWorkflowNode({ id, data, selected }) {
  const checklistCount = data.checklist?.length || 0
  const poolDept = departmentLabel(data.poolDepartmentCode)
  const cap = capabilityMeta(data.capability)
  const capSlug = (data.capability || 'standard').toLowerCase().replace(/_/g, '-')
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
      {data.capability && data.capability !== 'STANDARD' && (
        <div className={`workflow-node__cap-tag workflow-node__cap-tag--${capSlug}`}>
          {cap.label}
        </div>
      )}
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
    capability: 'STANDARD',
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
    capability: 'SURVEY_FIELD',
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
    capability: 'SURVEY_CAD',
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
    capability: 'STANDARD',
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
    capability: 'HANDOVER',
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
    capability: 'STANDARD',
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
    capability: 'STANDARD',
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
    capability: 'LEGAL_PREP',
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
    capability: GOV_TRACKING_CAPABILITY,
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
    capability: 'HANDOVER',
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
    capability: 'STANDARD',
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
      capability: item.capability || 'STANDARD',
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

    const cap = node.data.capability || 'STANDARD'
    graphNodes[node.id] = {
      task_code: node.data.code,
      name: node.data.label,
      capability: cap,
      description: node.data.description || '',
      requires_gov_submission: Boolean(
        node.data.requiresGovSubmission
        || cap === GOV_TRACKING_CAPABILITY
        || cap === LEGACY_GOV_SUBMISSION_CAPABILITY
      ),
      creates_survey_record: Boolean(node.data.createsSurveyRecord || cap === 'SURVEY_FIELD'),
      is_handover: Boolean(node.data.isHandover || cap === 'HANDOVER'),
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
        if (item.compensation) {
          itemObj.compensation = item.compensation
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
  const nodes = entries.map(([key, value], index) => {
    const capCode = normalizeGovernmentCapability(value.capability || (
      value.creates_survey_record || value.task_code === 'K02' ? 'SURVEY_FIELD'
      : value.requires_gov_submission || value.task_code === 'K05' || value.task_code === 'K05B' || value.task_code === 'K05b' ? GOV_TRACKING_CAPABILITY
      : value.is_handover || value.task_code === 'K06' ? 'HANDOVER'
      : value.task_code === 'K03' ? 'SURVEY_CAD'
      : value.task_code === 'K04' ? 'LEGAL_PREP'
      : 'STANDARD'
    ))
    return {
      id: key,
      type: 'studioNode',
      position: graph.ui?.[key] || { x: 80 + index * 280, y: 180 },
      data: {
        code: value.task_code || key.toUpperCase(),
        label: value.name || key,
        capability: normalizeGovernmentCapability(capCode),
        description: value.description || '',
        poolDepartmentCode: value.pool_department_code || '',
        claimRoles: Array.isArray(value.claim_roles) && value.claim_roles.length > 0 ? value.claim_roles : ['MAIN'],
        durationDays: Number(value.duration_days) || 0,
        durationHours: Number(value.duration_hours) || 0,
        durationMinutes: Number(value.duration_minutes) || 0,
        requiresGovSubmission: Boolean(
          value.requires_gov_submission
          || capCode === GOV_TRACKING_CAPABILITY
          || capCode === LEGACY_GOV_SUBMISSION_CAPABILITY
        ),
        createsSurveyRecord: Boolean(value.creates_survey_record || capCode === 'SURVEY_FIELD'),
        isHandover: Boolean(value.is_handover || capCode === 'HANDOVER'),
        checklist: (value.checklist || []).map((item) => ({
          key: item.key || `cl_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: item.name || '',
          required: item.required !== false,
          require_evidence: Boolean(item.require_evidence),
          approver_role: item.approver_role || 'admin',
          output_documents: item.output_documents || [],
          compensation: item.compensation,
        })),
      },
    }
  })

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
  const [outputDocModalItemKey, setOutputDocModalItemKey] = useState(null)
  const [dragChecklistIndex, setDragChecklistIndex] = useState(null)

  // UI States
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [workItems, setWorkItems] = useState([])

  // 1-Click Clone States
  const [cloneModalOpen, setCloneModalOpen] = useState(false)
  const [cloneTargetPackageId, setCloneTargetPackageId] = useState('')
  const [cloneTargetTaskTypeId, setCloneTargetTaskTypeId] = useState('')
  const [cloneTemplateName, setCloneTemplateName] = useState('')
  const [cloneDescription, setCloneDescription] = useState('')
  const [cloneIsDefault, setCloneIsDefault] = useState(false)
  const [cloning, setCloning] = useState(false)

  // Document Source Filter in Modal
  const [docSourceFilter, setDocSourceFilter] = useState('ALL') // 'ALL' | 'KHACH_HANG' | 'CONG_TY' | 'CO_QUAN'

  // Catalog Management Modal State
  const [catalogModalConfig, setCatalogModalConfig] = useState({
    open: false,
    targetType: 'PACKAGE',
    mode: 'create',
    item: null,
    parentPackageId: null,
  })

  const openCatalogModal = (targetType, mode, item = null, parentPackageId = null) => {
    setCatalogModalConfig({
      open: true,
      targetType,
      mode,
      item,
      parentPackageId: parentPackageId || selectedPackageId,
    })
  }

  const reloadCatalogTree = useCallback(async (preferredPackageId = null, preferredTaskTypeId = null) => {
    try {
      const pkgRes = await apiFetch('/api/catalog/service-packages')
      const pkgs = pkgRes?.data || []
      setPackageTree(pkgs)
      if (preferredPackageId) {
        setSelectedPackageId(preferredPackageId)
        const pkg = pkgs.find((p) => p.id === preferredPackageId)
        if (preferredTaskTypeId) {
          setSelectedTaskTypeId(preferredTaskTypeId)
        } else if (pkg?.task_types?.length > 0) {
          setSelectedTaskTypeId(pkg.task_types[0].id)
        }
      } else if (pkgs.length > 0 && (!selectedPackageId || !pkgs.some((p) => p.id === selectedPackageId))) {
        setSelectedPackageId(pkgs[0].id)
        if (pkgs[0].task_types?.length > 0) {
          setSelectedTaskTypeId(pkgs[0].task_types[0].id)
        }
      }
    } catch (err) {
      console.error('Lỗi tải lại danh mục:', err)
    }
  }, [selectedPackageId])

  // Load catalogs on mount
  useEffect(() => {
    async function init() {
      try {
        const [pkgRes, nodeRes, docRes, workItemRes] = await Promise.all([
          apiFetch('/api/catalog/service-packages').catch((err) => {
            console.error('Lỗi tải service-packages:', err)
            return { data: [] }
          }),
          apiFetch('/api/document-register/workflow-nodes').catch((err) => {
            console.error('Lỗi tải workflow-nodes:', err)
            return { data: [] }
          }),
          apiFetch('/api/document-register/templates').catch((err) => {
            console.error('Lỗi tải templates:', err)
            return { data: { groups: [] } }
          }),
          apiFetch('/api/catalog/work-items').catch((err) => {
            console.error('Lỗi tải work-items:', err)
            return { data: [] }
          }),
        ])
        const pkgs = pkgRes?.data || []
        if (pkgs.length === 0) {
          addToast?.('Không thể tải danh mục gói & hạng mục', 'error')
        }
        setPackageTree(pkgs)
        setCatalogNodes(nodeRes?.data || [])
        const rawDocs = docRes?.data?.groups || []
        const flatDocs = (rawDocs || []).flatMap((g) => g.items || g.templates || [])
        setDocTemplates(flatDocs)
        setWorkItems(workItemRes?.data || [])

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

  const workItemOptions = useMemo(
    () => (workItems || []).map((wi) => ({ value: wi.id, label: wi.name })),
    [workItems]
  )

  const currentPackage = useMemo(
    () => packageTree.find((p) => p.id === selectedPackageId),
    [packageTree, selectedPackageId]
  )
  const currentTaskType = useMemo(
    () => currentPackage?.task_types?.find((t) => t.id === selectedTaskTypeId),
    [currentPackage, selectedTaskTypeId]
  )

  // Lọc danh sách mẫu giấy tờ THEO ĐÚNG COMBO (Gói + Hạng mục)
  // và BAO GỒM cả 3 nguồn (Khách hàng, Cơ quan, Công ty)
  const applicableComboOutputDocs = useMemo(() => {
    if (!docTemplates || docTemplates.length === 0) return []
    return docTemplates
      .filter((tpl) => {
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
            if (app.applicability_type === 'COMBO') {
              return (
                (!app.task_type_id || app.task_type_id === selectedTaskTypeId) &&
                (!app.service_package_id || app.service_package_id === selectedPackageId)
              )
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
          if (app.applicability_type === 'COMBO' &&
              (!app.task_type_id || app.task_type_id === selectedTaskTypeId) &&
              (!app.service_package_id || app.service_package_id === selectedPackageId)) return true
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

  const isValidConnection = useCallback(
    (connection) => {
      return checkSequentialConnection(connection, edges).ok
    },
    [edges]
  )

  const connectingNodeRef = useRef(null)

  const handleConnectStart = useCallback(
    (event, { nodeId, handleType }) => {
      connectingNodeRef.current = { nodeId, handleType }
      if (handleType === 'source') {
        const alreadyHasOutgoing = edges.some((e) => e.source === nodeId)
        if (alreadyHasOutgoing) {
          addToast?.('Đầu ra của bước này đã có đường nối. Mỗi đầu chỉ được phép có 1 đường nối duy nhất!', 'warning')
        }
      } else if (handleType === 'target') {
        const alreadyHasIncoming = edges.some((e) => e.target === nodeId)
        if (alreadyHasIncoming) {
          addToast?.('Đầu vào của bước này đã có đường nối. Mỗi đầu chỉ được phép có 1 đường nối duy nhất!', 'warning')
        }
      }
    },
    [addToast, edges]
  )

  const handleConnectEnd = useCallback(
    (event) => {
      const startInfo = connectingNodeRef.current
      connectingNodeRef.current = null
      if (!startInfo) return
      if (!event || typeof document === 'undefined') return

      const clientX = event.clientX ?? event.changedTouches?.[0]?.clientX
      const clientY = event.clientY ?? event.changedTouches?.[0]?.clientY
      if (clientX == null || clientY == null) return

      const targetEl = document.elementFromPoint(clientX, clientY)
      const nodeEl = targetEl?.closest('.react-flow__node')
      if (!nodeEl) return

      const targetNodeId = nodeEl.getAttribute('data-id')
      if (!targetNodeId) return

      const check =
        startInfo.handleType === 'target'
          ? checkSequentialConnection({ source: targetNodeId, target: startInfo.nodeId }, edges)
          : checkSequentialConnection({ source: startInfo.nodeId, target: targetNodeId }, edges)

      if (!check.ok) {
        addToast?.(check.message, 'warning')
      }
    },
    [addToast, edges]
  )

  const handleConnect = useCallback(
    (params) => {
      const validation = checkSequentialConnection(params, edges)
      if (!validation.ok) {
        addToast?.(validation.message, 'warning')
        return
      }
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
    [addToast, edges, setEdges]
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

  const handleAddNewCustomNode = () => {
    const nextIndex = nodes.length + 1
    const newId = `node_${Date.now().toString(36).substr(-4)}`
    const lastNode = nodes[nodes.length - 1]
    const nextX = lastNode ? lastNode.position.x + 280 : 80
    const nextY = lastNode ? lastNode.position.y : 180

    const newNode = {
      id: newId,
      type: 'studioNode',
      position: { x: nextX, y: nextY },
      data: {
        code: `N${String(nextIndex).padStart(2, '0')}`,
        name: 'Bước mới',
        label: 'Bước mới',
        description: '',
        capability: 'STANDARD',
        capability_code: 'STANDARD',
        poolDepartmentCode: 'SALES',
        claimRoles: ['MAIN'],
        durationDays: 1,
        durationHours: 0,
        durationMinutes: 0,
        checklist: [
          {
            key: `cl_${newId}_1`,
            name: 'Nhiệm vụ 1',
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
    addToast?.('Đã tạo bước mới. Bạn có thể đổi tên và gán Năng lực ngầm ở cột bên phải.', 'success')
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

  const filteredNodeDocs = useMemo(() => {
    if (docSourceFilter === 'ALL') return nodeSpecificDocs
    return nodeSpecificDocs.filter((d) => d.source === docSourceFilter)
  }, [nodeSpecificDocs, docSourceFilter])

  const filteredOtherDocs = useMemo(() => {
    if (docSourceFilter === 'ALL') return otherComboDocs
    return otherComboDocs.filter((d) => d.source === docSourceFilter)
  }, [otherComboDocs, docSourceFilter])

  const cloneTargetPackage = useMemo(
    () => packageTree.find((p) => p.id === cloneTargetPackageId),
    [packageTree, cloneTargetPackageId]
  )

  const handleOpenCloneModal = () => {
    if (!selectedTemplateId || selectedTemplateId === 'NEW') return
    setCloneTargetPackageId(selectedPackageId || '')
    setCloneTargetTaskTypeId(selectedTaskTypeId || '')
    setCloneTemplateName(`Bản sao - ${templateName || ''}`)
    setCloneDescription(templateDescription || '')
    setCloneIsDefault(false)
    setCloneModalOpen(true)
  }

  const handleExecuteClone = async () => {
    if (!cloneTargetPackageId || !cloneTargetTaskTypeId) {
      addToast?.('Vui lòng chọn Gói dịch vụ và Hạng mục công việc đích', 'error')
      return
    }
    if (!cloneTemplateName.trim()) {
      addToast?.('Vui lòng nhập tên mẫu quy trình mới', 'error')
      return
    }
    setCloning(true)
    try {
      const res = await apiFetch(`/api/contracts/workflow/templates/${selectedTemplateId}/clone`, {
        method: 'POST',
        body: JSON.stringify({
          service_package_id: cloneTargetPackageId,
          task_type_id: cloneTargetTaskTypeId,
          name: cloneTemplateName.trim(),
          description: cloneDescription.trim() || null,
          is_default: Boolean(cloneIsDefault),
        }),
      })
      const cloned = res?.data
      addToast?.('Đã nhân bản quy trình thành công!', 'success')
      setCloneModalOpen(false)
      setSelectedPackageId(cloneTargetPackageId)
      setSelectedTaskTypeId(cloneTargetTaskTypeId)
      await loadTemplates(cloneTargetPackageId, cloneTargetTaskTypeId, cloned?.id)
    } catch (err) {
      addToast?.(err.message || 'Lỗi khi nhân bản quy trình', 'error')
    } finally {
      setCloning(false)
    }
  }

  const handleSelectCapability = (capCode) => {
    const cap = CAPABILITIES.find((c) => c.code === capCode)
    const updates = {
      capability: capCode,
      createsSurveyRecord: capCode === 'SURVEY_FIELD',
      requiresGovSubmission: capCode === GOV_TRACKING_CAPABILITY,
      isHandover: capCode === 'HANDOVER',
    }
    if (cap?.suggestDept) {
      updates.poolDepartmentCode = cap.suggestDept
    }
    updateSelectedNodeData(updates)
  }

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

  const reorderChecklistItems = (fromIndex, toIndex) => {
    if (!selectedNodeId || fromIndex === toIndex) return
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selectedNodeId) return n
        const current = [...(n.data?.checklist || [])]
        if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length) return n
        const [moved] = current.splice(fromIndex, 1)
        current.splice(toIndex, 0, moved)
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
              <CustomSelect
                aria-label="Gói dịch vụ"
                className="mws-custom-select mws-package-select"
                value={selectedPackageId}
                options={packageTree.map((pkg) => ({
                  value: pkg.id,
                  label: pkg.name,
                }))}
                onChange={handleSelectPackage}
                placeholder="— Chọn gói dịch vụ —"
              />
              <button
                type="button"
                className="mws-add-catalog-btn"
                title="Thêm Gói dịch vụ mới"
                aria-label="Thêm Gói dịch vụ mới"
                onClick={() => openCatalogModal('PACKAGE', 'create')}
              >
                <Plus size={13} /> Thêm Gói
              </button>
              {currentPackage && (
                <button
                  type="button"
                  className="mws-edit-catalog-btn"
                  title={`Chỉnh sửa Gói: ${currentPackage.name}`}
                  aria-label={`Chỉnh sửa Gói: ${currentPackage.name}`}
                  onClick={() => openCatalogModal('PACKAGE', 'edit', currentPackage)}
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>

            <div className="mws-divider-vertical" />

            {/* Hạng mục công việc chuẩn CustomSelect */}
            <div className="mws-combo-group mws-task-type-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
              <button
                type="button"
                className="mws-add-catalog-btn"
                title="Thêm Hạng mục công việc mới"
                aria-label="Thêm Hạng mục công việc"
                onClick={() => openCatalogModal('TASK_TYPE', 'create', null, selectedPackageId)}
              >
                <Plus size={13} /> Thêm Hạng mục
              </button>
              {currentTaskType && (
                <button
                  type="button"
                  className="mws-edit-catalog-btn"
                  title={`Chỉnh sửa Hạng mục: ${currentTaskType.name}`}
                  aria-label={`Chỉnh sửa Hạng mục: ${currentTaskType.name}`}
                  onClick={() => openCatalogModal('TASK_TYPE', 'edit', currentTaskType, selectedPackageId)}
                >
                  <Pencil size={13} />
                </button>
              )}
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
          <button
            type="button"
            className="workspace-icon-button"
            title="Thêm node mới"
            onClick={handleAddNewCustomNode}
          >
            <Plus size={16} /> Thêm node
          </button>

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

          {/* 5. Nút Nhân bản nội bộ */}
          <button
            type="button"
            className="workspace-icon-button"
            disabled={selectedTemplateId === 'NEW' || !selectedTemplateId}
            onClick={handleDuplicate}
            title="Nhân bản mẫu hiện tại"
          >
            <Copy size={15} /> Nhân bản
          </button>

          {/* 5b. Nút Nhân bản sang Combo khác */}
          <button
            type="button"
            className="workspace-icon-button"
            disabled={selectedTemplateId === 'NEW' || !selectedTemplateId}
            onClick={handleOpenCloneModal}
            title="Nhân bản quy trình sang Combo (Gói & Hạng mục) khác"
            aria-label="Nhân bản sang Combo"
          >
            <Sparkles size={15} /> ⚡ Nhân bản sang Combo
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
            isValidConnection={isValidConnection}
            onConnectStart={handleConnectStart}
            onConnectEnd={handleConnectEnd}
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
              ['capability', 'Năng lực'],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={(inspectorTab === key || (key === 'capability' && inspectorTab === 'transition')) ? 'active' : ''}
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
                    <span className="wf-node-grid__label">Năng lực bước</span>
                    <div className="wf-node-grid__value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`workflow-node__cap-tag workflow-node__cap-tag--${(selectedNode.data.capability || 'STANDARD').toLowerCase().replace(/_/g, '-')}`}>
                        {capabilityMeta(selectedNode.data.capability).label}
                      </span>
                      <button
                        type="button"
                        className="mws-capability-link"
                        onClick={() => setInspectorTab('capability')}
                      >
                        Đổi năng lực →
                      </button>
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
                    <div
                      className={`workflow-checklist-card${dragChecklistIndex === index ? ' is-dragging' : ''}`}
                      key={item.key || index}
                      onDragOver={(e) => {
                        if (dragChecklistIndex !== null) e.preventDefault()
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (dragChecklistIndex !== null && dragChecklistIndex !== index) {
                          reorderChecklistItems(dragChecklistIndex, index)
                        }
                        setDragChecklistIndex(null)
                      }}
                    >
                      {/* Hàng 1: Badge cam số lượng giấy đầu ra, input sửa tên nhiệm vụ, nút X, nút + tròn xanh */}
                      <div className="wcl-top">
                        <span
                          className="wcl-count"
                          draggable
                          onDragStart={() => setDragChecklistIndex(index)}
                          onDragEnd={() => setDragChecklistIndex(null)}
                          title={`${(item.output_documents || []).length} giấy tờ đầu ra — kéo để sắp xếp thứ tự`}
                        >
                          {(item.output_documents || []).length}
                        </span>
                        <input
                          className="wcl-name-inline"
                          value={item.name || ''}
                          title={item.name || 'Chưa đặt tên'}
                          placeholder="Nhập tên nhiệm vụ tự do..."
                          onChange={(e) => updateChecklistItem(item.key, { name: e.target.value })}
                        />
                        <button
                          type="button"
                          className="wcl-x"
                          onClick={() => removeChecklistItem(item.key)}
                          title="Xóa mục checklist này"
                          aria-label="Xóa mục checklist"
                        >
                          <X size={15} />
                        </button>
                        <button
                          type="button"
                          className="wcl-add-doc"
                          onClick={() => setOutputDocModalItemKey(item.key)}
                          title="Thêm giấy tờ đầu ra cho mục này"
                          aria-label="Thêm giấy tờ đầu ra cho mục này"
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      {/* Hàng 2: Tài liệu đầu ra */}
                      <div className="wcl-prop wcl-prop--output">
                        <span className="wcl-prop__label"><FileCheck2 size={13} /> Tài liệu đầu ra</span>
                        {(item.output_documents || []).length > 0 ? (
                          <div className="wcl-output-panel">
                            <div className="wcl-output-panel__scroll">
                              {item.output_documents.map((doc, docIdx) => {
                                const tpl = docTemplates.find((d) => d.id === doc.template_id)
                                const tenTaiLieu = doc.template_name || tpl?.name || doc.template_id
                                return (
                                  <div className="wcl-output-row" key={`${doc.template_id}-${docIdx}`}>
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
                                        aria-label={`Bỏ ${tenTaiLieu}`}
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
                      </div>

                      {/* Hàng 3: Công việc (Gắn gói khoán) */}
                      <div className="wcl-prop wcl-prop--pay">
                        <span className="wcl-prop__label"><Banknote size={13} /> Công việc</span>
                        <div className="wcl-prop__field">
                          {item.compensation?.is_payable ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                              <CustomSelect
                                aria-label="Chọn công việc khoán"
                                className="wcl-work-item-select"
                                value={
                                  item.compensation?.work_item_id ||
                                  workItems.find((w) => w.name === item.compensation?.work_item_name)?.id ||
                                  ''
                                }
                                placeholder="— Chọn công việc —"
                                options={
                                  item.compensation?.work_item_name &&
                                  !workItems.some(
                                    (w) =>
                                      w.id === item.compensation?.work_item_id ||
                                      w.name === item.compensation?.work_item_name
                                  )
                                    ? [
                                        {
                                          value: item.compensation.work_item_id || 'custom',
                                          label: item.compensation.work_item_name,
                                        },
                                        ...workItemOptions,
                                      ]
                                    : workItemOptions
                                }
                                onChange={(val) => {
                                  const selectedWi = workItems.find((w) => w.id === val)
                                  if (selectedWi) {
                                    updateChecklistItem(item.key, {
                                      compensation: {
                                        is_payable: true,
                                        work_item_id: selectedWi.id,
                                        work_item_name: selectedWi.name,
                                      },
                                    })
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="wcl-prop__clear"
                                onClick={() => updateChecklistItem(item.key, { compensation: { is_payable: false } })}
                                title="Bỏ gói khoán"
                                aria-label="Bỏ gói khoán"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="wcl-add-inline"
                              onClick={() => {
                                const defaultWi = workItems[0]
                                updateChecklistItem(item.key, {
                                  compensation: {
                                    is_payable: true,
                                    work_item_id: defaultWi?.id || '',
                                    work_item_name: defaultWi?.name || 'Gói khoán theo hạng mục',
                                  },
                                })
                              }}
                            >
                              <Plus size={13} /> Gắn gói khoán
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Hàng 3b: Lương khoán (định mức động từ CSDL theo công việc đã chọn) */}
                      {item.compensation?.is_payable && (() => {
                        const currentWiId =
                          item.compensation?.work_item_id ||
                          workItems.find((w) => w.name === item.compensation?.work_item_name)?.id
                        const currentWi = workItems.find((w) => w.id === currentWiId)
                        const ROLE_ORDER = { MAIN: 0, ASSISTANT: 1, SUBMITTER: 2 }
                        const rates = [...(currentWi?.rates || [])].sort(
                          (a, b) => (ROLE_ORDER[a.role_code] ?? 9) - (ROLE_ORDER[b.role_code] ?? 9)
                        )
                        const shortRoleLabel = (code) =>
                          ({ MAIN: 'Chính', ASSISTANT: 'Phụ', SUBMITTER: 'Nộp' }[code] || code)
                        return (
                          <div className="wcl-prop wcl-prop--rate">
                            <span className="wcl-prop__label"><Banknote size={13} /> Lương khoán</span>
                            <div className="wcl-prop__field wcl-rate-summary">
                              {rates.length > 0 ? (
                                rates.map((r) => {
                                  const amount = Number(r.amount || 0)
                                  return (
                                    <div
                                      key={r.id || r.role_code}
                                      className={`wcl-rate-line${amount > 0 ? '' : ' is-zero'}`}
                                      title={
                                        r.role_code === 'ASSISTANT' && amount > 0
                                          ? 'Có thợ phụ: tự động mở suất theo bảng lương khoán'
                                          : undefined
                                      }
                                    >
                                      <span className="wcl-rate-line__role">{shortRoleLabel(r.role_code)}</span>
                                      <span className="wcl-rate-line__amount">
                                        {amount > 0 ? `${amount.toLocaleString('vi-VN')}đ` : '—'}
                                      </span>
                                    </div>
                                  )
                                })
                              ) : (
                                <span className="wcl-rate-empty">Chưa thiết lập định mức</span>
                              )}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Hàng 4: Người duyệt (CustomSelect chuẩn project) */}
                      <div className="wcl-prop">
                        <span className="wcl-prop__label"><UserRound size={13} /> Duyệt</span>
                        <div className="wcl-prop__field">
                          <CustomSelect
                            aria-label="Người duyệt"
                            className="wcl-approver-select"
                            value={item.approver_role || 'admin'}
                            options={APPROVER_ROLES}
                            onChange={(val) => updateChecklistItem(item.key, { approver_role: val })}
                          />
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
            /* Tab Năng lực & Chuyển bước */
            <div className="workflow-inspector__content">
              <div className="workflow-section-block">
                <label className="workflow-section-block__label">NĂNG LỰC BƯỚC (CHẠY NGẦM TỰ ĐỘNG)</label>
                <div className="mws-capability-grid">
                  {CAPABILITIES.map((cap) => {
                    const Icon = cap.icon
                    const isSelected = (selectedNode.data.capability || 'STANDARD') === cap.code
                    return (
                      <button
                        type="button"
                        key={cap.code}
                        className={`mws-capability-card${isSelected ? ' is-selected' : ''}`}
                        onClick={() => handleSelectCapability(cap.code)}
                      >
                        <div className="mws-capability-card__header">
                          <Icon size={14} color={isSelected ? '#ea580c' : cap.color} />
                          <span>{cap.label}</span>
                        </div>
                        <span className="mws-capability-card__desc">{cap.desc}</span>
                      </button>
                    )
                  })}
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

      {/* Modal Chọn Tài Liệu Đầu Ra */}
      <Modal
        open={Boolean(outputDocModalItemKey)}
        onClose={() => setOutputDocModalItemKey(null)}
        title="Chọn tài liệu đầu ra"
        id="mws-output-documents-modal"
        size="lg"
        className="workflow-output-documents-modal"
        footer={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setOutputDocModalItemKey(null)}
          >
            Xong
          </button>
        }
      >
        <div className="wcl-output-modal">
          <p className="wcl-output-modal__hint">
            Chọn các loại giấy tờ đầu ra mà checklist này cần tạo ra. Có thể chọn nhiều loại, hệ thống sẽ tự đưa vào cấu trúc hồ sơ sau khi duyệt.
          </p>

          <div className="wcl-source-tabs" role="tablist" aria-label="Lọc theo nguồn tài liệu">
            <button
              type="button"
              className={`wcl-source-tab${docSourceFilter === 'ALL' ? ' is-active' : ''}`}
              onClick={() => setDocSourceFilter('ALL')}
            >
              Tất cả nguồn
            </button>
            <button
              type="button"
              className={`wcl-source-tab${docSourceFilter === 'KHACH_HANG' ? ' is-active' : ''}`}
              onClick={() => setDocSourceFilter('KHACH_HANG')}
            >
              Khách hàng cung cấp
            </button>
            <button
              type="button"
              className={`wcl-source-tab${docSourceFilter === 'CONG_TY' ? ' is-active' : ''}`}
              onClick={() => setDocSourceFilter('CONG_TY')}
            >
              Nội bộ công ty
            </button>
            <button
              type="button"
              className={`wcl-source-tab${docSourceFilter === 'CO_QUAN' ? ' is-active' : ''}`}
              onClick={() => setDocSourceFilter('CO_QUAN')}
            >
              Cơ quan nhà nước
            </button>
          </div>

          {applicableComboOutputDocs.length === 0 ? (
            <div className="wcl-output-modal__empty">
              Chưa có tài liệu đầu ra nào phù hợp với Combo này.
            </div>
          ) : (
            <div className="wcl-output-modal__groups">
              {filteredNodeDocs.length > 0 && (
                <section className="wcl-output-modal__group wcl-output-modal__group--cong-ty">
                  <div className="wcl-output-modal__group-head">
                    <div>
                      <h3 className="wcl-output-modal__group-title">
                        ★ Khuyến nghị cho bước [{currentNodeCode}]
                      </h3>
                      <p className="wcl-output-modal__group-hint">
                        Các tài liệu đầu ra chuẩn được gắn với mã bước này
                      </p>
                    </div>
                    <span className="wcl-output-modal__group-count">
                      {filteredNodeDocs.length} loại
                    </span>
                  </div>
                  <div
                    className="wcl-output-modal__grid"
                    role="listbox"
                    aria-label="Khuyến nghị cho bước"
                    aria-multiselectable="true"
                  >
                    {filteredNodeDocs.map((dt) => {
                      const currentItem = (selectedNode?.data?.checklist || []).find(
                        (it) => it.key === outputDocModalItemKey
                      )
                      const isSelected = (currentItem?.output_documents || []).some(
                        (d) => d.template_id === dt.id
                      )
                      return (
                        <button
                          type="button"
                          key={dt.id}
                          role="option"
                          aria-selected={isSelected}
                          className={`wcl-output-modal__option${isSelected ? ' is-selected' : ''}`}
                          onClick={() => {
                            if (isSelected) {
                              removeOutputDoc(outputDocModalItemKey, dt.id)
                            } else {
                              addOutputDoc(outputDocModalItemKey, dt.id)
                            }
                          }}
                        >
                          <span className="wcl-output-modal__check" aria-hidden="true">
                            {isSelected ? <Check size={14} /> : null}
                          </span>
                          <span className="wcl-output-modal__name">{dt.name}</span>
                          <span className="wcl-output-modal__source">
                            {DOC_SOURCE_LABELS[dt.source] || 'Đầu ra'}
                          </span>
                          <span className="wcl-output-modal__meta">
                            Bước [{dt.assigned_node_code}] · Mẫu chuẩn
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {filteredOtherDocs.length > 0 && (
                <section className="wcl-output-modal__group wcl-output-modal__group--co-quan">
                  <div className="wcl-output-modal__group-head">
                    <div>
                      <h3 className="wcl-output-modal__group-title">
                        Các mẫu đầu ra khác trong Combo
                      </h3>
                      <p className="wcl-output-modal__group-hint">
                        Các tài liệu đầu ra dùng chung cho gói dịch vụ & hạng mục này
                      </p>
                    </div>
                    <span className="wcl-output-modal__group-count">
                      {filteredOtherDocs.length} loại
                    </span>
                  </div>
                  <div
                    className="wcl-output-modal__grid"
                    role="listbox"
                    aria-label="Các mẫu đầu ra khác trong combo"
                    aria-multiselectable="true"
                  >
                    {filteredOtherDocs.map((dt) => {
                      const currentItem = (selectedNode?.data?.checklist || []).find(
                        (it) => it.key === outputDocModalItemKey
                      )
                      const isSelected = (currentItem?.output_documents || []).some(
                        (d) => d.template_id === dt.id
                      )
                      return (
                        <button
                          type="button"
                          key={dt.id}
                          role="option"
                          aria-selected={isSelected}
                          className={`wcl-output-modal__option${isSelected ? ' is-selected' : ''}`}
                          onClick={() => {
                            if (isSelected) {
                              removeOutputDoc(outputDocModalItemKey, dt.id)
                            } else {
                              addOutputDoc(outputDocModalItemKey, dt.id)
                            }
                          }}
                        >
                          <span className="wcl-output-modal__check" aria-hidden="true">
                            {isSelected ? <Check size={14} /> : null}
                          </span>
                          <span className="wcl-output-modal__name">{dt.name}</span>
                          <span className="wcl-output-modal__source">
                            {DOC_SOURCE_LABELS[dt.source] || 'Đầu ra'}
                          </span>
                          <span className="wcl-output-modal__meta">
                            {dt.assigned_node_code
                              ? `Bước [${dt.assigned_node_code}]`
                              : 'Dùng chung cho combo'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Nhân Bản Quy Trình Sang Combo Khác */}
      <Modal
        open={cloneModalOpen}
        onClose={() => setCloneModalOpen(false)}
        title="⚡ Nhân bản quy trình sang Combo khác"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCloneModalOpen(false)}
            >
              Huỷ
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={cloning || !cloneTargetPackageId || !cloneTargetTaskTypeId || !cloneTemplateName.trim()}
              onClick={handleExecuteClone}
            >
              <Sparkles size={15} /> {cloning ? 'Đang nhân bản…' : 'Xác nhận nhân bản'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Nhân bản toàn bộ sơ đồ, các bước và danh sách checklist của mẫu hiện tại sang một Gói dịch vụ hoặc Hạng mục công việc mới chỉ trong 1 chạm.
          </p>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>
              Gói dịch vụ đích <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <CustomSelect
              aria-label="Gói dịch vụ đích"
              value={cloneTargetPackageId}
              options={(packageTree || []).map((p) => ({ value: p.id, label: p.name }))}
              placeholder="— Chọn gói dịch vụ đích —"
              onChange={(val) => {
                setCloneTargetPackageId(val)
                const targetPkg = packageTree.find((p) => p.id === val)
                if (targetPkg?.task_types?.length > 0) {
                  setCloneTargetTaskTypeId(targetPkg.task_types[0].id)
                } else {
                  setCloneTargetTaskTypeId('')
                }
              }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>
              Hạng mục công việc đích <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <CustomSelect
              aria-label="Hạng mục công việc đích"
              value={cloneTargetTaskTypeId}
              options={(cloneTargetPackage?.task_types || []).map((t) => ({ value: t.id, label: t.name }))}
              placeholder="— Chọn hạng mục công việc đích —"
              onChange={(val) => setCloneTargetTaskTypeId(val)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>
              Tên mẫu quy trình mới <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              className="form-control"
              value={cloneTemplateName}
              onChange={(e) => setCloneTemplateName(e.target.value)}
              placeholder="VD: Quy trình Cắm mốc nhanh - V1"
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>
              Ghi chú định hướng
            </label>
            <textarea
              className="form-control"
              rows={2}
              value={cloneDescription}
              onChange={(e) => setCloneDescription(e.target.value)}
              maxLength={1000}
              placeholder="Ghi chú sử dụng..."
            />
          </div>

          <label className={`mws-default-toggle${cloneIsDefault ? ' is-default' : ''}`} style={{ marginTop: 4 }}>
            <input
              type="checkbox"
              aria-label="Mặc định của combo đích"
              checked={cloneIsDefault}
              onChange={(e) => setCloneIsDefault(e.target.checked)}
            />
            <Star size={14} fill={cloneIsDefault ? '#f59e0b' : 'none'} color={cloneIsDefault ? '#f59e0b' : '#64748b'} />
            <span>{cloneIsDefault ? 'Đặt làm mặc định cho Combo đích' : 'Đặt làm mặc định cho Combo đích'}</span>
          </label>
        </div>
      </Modal>

      {/* Modal Quản lý Gói dịch vụ & Hạng mục công việc */}
      <CatalogManageModal
        open={catalogModalConfig.open}
        targetType={catalogModalConfig.targetType}
        mode={catalogModalConfig.mode}
        item={catalogModalConfig.item}
        parentPackageId={catalogModalConfig.parentPackageId}
        packageList={packageTree}
        addToast={addToast}
        onClose={() => setCatalogModalConfig((prev) => ({ ...prev, open: false }))}
        onSuccess={reloadCatalogTree}
      />
    </div>
  )
}
