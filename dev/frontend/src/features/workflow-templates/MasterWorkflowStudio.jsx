import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckSquare,
  Clock,
  Copy,
  FileStack,
  FileText,
  Layers,
  LayoutGrid,
  Plus,
  Save,
  Sliders,
  Star,
  Trash2,
  Workflow,
  X,
} from 'lucide-react'

import ConfirmationModal from '../../components/ui/ConfirmationModal'
import CustomSelect from '../../components/ui/CustomSelect'
import { useToast } from '../../contexts/ToastContext'
import { apiFetch, peekApiCache } from '../../lib/api'
import './masterWorkflowStudio.css'

// ── Danh mục Phòng ban chuẩn Bách Khoa ERP ──
export const STANDARD_DEPARTMENTS = [
  { value: 'SALES', label: 'Phòng Sale/CSKH' },
  { value: 'SURVEY', label: 'Phòng Đo vẽ' },
  { value: 'LEGAL', label: 'Phòng Pháp lý' },
  { value: 'ACCOUNTING', label: 'Phòng Kế toán' },
  { value: 'ADMIN', label: 'Ban Giám đốc' },
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

// ── Custom Node cho Studio ──
function StudioWorkflowNode({ id, data, selected }) {
  const checklistCount = data.checklist?.length || 0
  const docsCount = (data.checklist || []).reduce(
    (acc, item) => acc + (item.output_documents?.length || 0),
    0
  )
  const durationText = []
  if (data.durationDays > 0) durationText.push(`${data.durationDays} ngày`)
  if (data.durationHours > 0) durationText.push(`${data.durationHours} giờ`)

  return (
    <div className={`mws-node${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="mws-node__handle" />
      <div className="mws-node__head">
        <span className="mws-node__code">{data.code || 'K--'}</span>
        {data.poolDepartmentCode && (
          <span className="mws-node__dept">{departmentLabel(data.poolDepartmentCode)}</span>
        )}
      </div>
      <div className="mws-node__body">
        <div className="mws-node__title">{data.label || 'Bước quy trình'}</div>
        <div className="mws-node__stats">
          <span className="mws-node__stat-badge" title="Mục checklist">
            <CheckSquare size={12} /> {checklistCount}
          </span>
          {docsCount > 0 && (
            <span className="mws-node__stat-badge" title="Loại giấy đầu ra đính kèm">
              <FileText size={12} /> {docsCount} giấy
            </span>
          )}
          {durationText.length > 0 && (
            <span className="mws-node__stat-badge" title="Thời hạn xử lý tiêu chuẩn">
              <Clock size={12} /> {durationText.join(' ')}
            </span>
          )}
        </div>
        {(data.requiresGovSubmission || data.createsSurveyRecord || data.isHandover) && (
          <div className="mws-node__flags">
            {data.requiresGovSubmission && <span className="mws-node__flag-dot">Một cửa</span>}
            {data.createsSurveyRecord && <span className="mws-node__flag-dot">Khảo sát</span>}
            {data.isHandover && <span className="mws-node__flag-dot">Bàn giao</span>}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="mws-node__handle" />
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
    position: { x: 80 + index * 270, y: 180 + (index % 2) * 60 },
    data: {
      code: item.code,
      label: item.label,
      poolDepartmentCode: item.dept,
      durationDays: item.days,
      durationHours: item.hours,
      requiresGovSubmission: Boolean(item.requiresGovSubmission),
      createsSurveyRecord: Boolean(item.createsSurveyRecord),
      isHandover: Boolean(item.isHandover),
      checklist: (item.checklist || []).map((cl) => ({
        key: cl.key || `cl_${item.code.toLowerCase()}_${Math.random().toString(36).substr(2, 4)}`,
        name: cl.name,
        required: cl.required !== false,
        require_evidence: Boolean(cl.require_evidence),
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

  nodes.forEach(node => {
    const transitions = {}
    edges
      .filter(edge => edge.source === node.id)
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
      pool_department_code: node.data.poolDepartmentCode || null,
      checklist: (node.data.checklist || []).map(item => {
        const itemObj = {
          key: item.key,
          name: item.name,
          required: item.required !== false,
          require_evidence: Boolean(item.require_evidence),
        }
        const validDocs = (item.output_documents || [])
          .filter(doc => doc.template_id)
          .map(doc => ({
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
    position: graph.ui?.[key] || { x: 80 + index * 270, y: 180 + (index % 2) * 60 },
    data: {
      code: value.task_code || key.toUpperCase(),
      label: value.name || key,
      description: value.description || '',
      poolDepartmentCode: value.pool_department_code || '',
      durationDays: Number(value.duration_days) || 0,
      durationHours: Number(value.duration_hours) || 0,
      requiresGovSubmission: Boolean(value.requires_gov_submission),
      createsSurveyRecord: Boolean(value.creates_survey_record),
      isHandover: Boolean(value.is_handover),
      checklist: (value.checklist || []).map(item => ({
        key: item.key || `cl_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: item.name || '',
        required: item.required !== false,
        require_evidence: Boolean(item.require_evidence),
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
        style: { strokeWidth: 2, stroke: '#f97316' },
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
    return (rawDocs || []).flatMap(g => g.items || g.templates || [])
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

  // UI States
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nodePickerOpen, setNodePickerOpen] = useState(false)
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
        const flatDocs = (rawDocs || []).flatMap(g => g.items || g.templates || [])
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
    () => packageTree.find(p => p.id === selectedPackageId),
    [packageTree, selectedPackageId]
  )
  const currentTaskType = useMemo(
    () => currentPackage?.task_types?.find(t => t.id === selectedTaskTypeId),
    [currentPackage, selectedTaskTypeId]
  )

  // Lọc danh sách mẫu giấy tờ đầu ra THEO ĐÚNG COMBO (Gói + Hạng mục)
  // và LOẠI TRỪ giấy tờ khách hàng cung cấp (chỉ lấy CONG_TY và CO_QUAN)
  const applicableComboOutputDocs = useMemo(() => {
    if (!docTemplates || docTemplates.length === 0) return []
    return docTemplates
      .filter((tpl) => {
        // Chỉ lấy tài liệu đầu ra (Công ty soạn lập hoặc Cơ quan cấp), LOẠI TRỪ Khách hàng cung cấp
        if (tpl.source === 'KHACH_HANG') return false

        // 1. Nếu có task_type_id cụ thể
        if (tpl.task_type_id) {
          return Boolean(selectedTaskTypeId) && tpl.task_type_id === selectedTaskTypeId
        }
        // 2. Nếu có danh sách applicabilities
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
        // 3. Nếu không có applicabilities và không gắn task_type_id
        return true
      })
      .map((tpl) => {
        // Tìm node_code tương ứng theo cấu hình trong Danh mục mẫu giấy tờ
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
    async (pkgId, typeId) => {
      if (!pkgId || !typeId) return
      setLoading(true)
      try {
        const res = await apiFetch(
          `/api/contracts/workflow/templates?package_id=${pkgId}&task_type_id=${typeId}`
        )
        const list = res?.data || []
        setTemplates(list)

        const pkg = packageTree.find(p => p.id === pkgId)
        if (list.length > 0) {
          // Select default template first, or the first template
          const def = list.find(t => t.is_default) || list[0]
          setSelectedTemplateId(def.id)
          setTemplateName(def.name || '')
          setTemplateDescription(def.description || '')
          setIsDefault(Boolean(def.is_default))
          const flow = graphJsonToFlow(def.graph, pkg)
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
    const pkg = packageTree.find(p => p.id === pkgId)
    if (pkg?.task_types?.length > 0) {
      setSelectedTaskTypeId(pkg.task_types[0].id)
    } else {
      setSelectedTaskTypeId('')
    }
  }

  const handleSelectTemplate = (templateId) => {
    if (templateId === 'NEW') {
      handleCreateNew()
      return
    }
    const tpl = templates.find(t => t.id === templateId)
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
        position: { x: 80 + index * 270, y: 180 + (index % 2) * 60 },
      }))
    )
    addToast?.('Đã căn lề tự động các node trên sơ đồ', 'success')
  }

  const handleAddNodeFromCatalog = (catalogItem) => {
    setNodePickerOpen(false)
    const newId = `${catalogItem.code.toLowerCase()}_${Date.now().toString(36).substr(-4)}`
    const lastNode = nodes[nodes.length - 1]
    const nextX = lastNode ? lastNode.position.x + 270 : 80
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
        durationDays: 1,
        durationHours: 0,
        requiresGovSubmission: catalogItem.code === 'K05b',
        createsSurveyRecord: catalogItem.code === 'K02',
        isHandover: catalogItem.code === 'K06',
        checklist: [
          {
            key: `cl_${newId}_1`,
            name: `Nhiệm vụ bước ${catalogItem.code}`,
            required: true,
            require_evidence: false,
            output_documents: [],
          },
        ],
      },
    }

    setNodes((nds) => [...nds, newNode])
    setSelectedNodeId(newId)
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

      await loadTemplates(selectedPackageId, selectedTaskTypeId)
      if (res?.data?.id) {
        setSelectedTemplateId(res.data.id)
      }
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

  // Checklist manipulations on selectedNode with functional setNodes
  const addChecklistItem = () => {
    if (!selectedNodeId) return
    const newItem = {
      key: `cl_${selectedNodeId}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`,
      name: '',
      required: true,
      require_evidence: false,
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
              { template_id: template.id, template_name: template.name },
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

  return (
    <div className="mws-container">
      {/* ── Top Bar ── */}
      <header className="mws-topbar">
        {/* Row 1: Combo Selection & Top Action Buttons */}
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

          <div className="mws-template-actions">
            <button
              type="button"
              className="mws-btn"
              onClick={handleCreateNew}
              title="Tạo quy trình mẫu mới cho combo này"
            >
              <Plus size={15} /> Tạo mẫu mới
            </button>
            <button
              type="button"
              className="mws-btn"
              disabled={selectedTemplateId === 'NEW' || !selectedTemplateId}
              onClick={handleDuplicate}
              title="Nhân bản mẫu hiện tại"
            >
              <Copy size={15} /> Nhân bản
            </button>
            <button
              type="button"
              className="mws-btn mws-btn--primary"
              disabled={saving}
              onClick={handleSave}
              title="Lưu mẫu quy trình vào hệ thống"
            >
              <Save size={15} /> {saving ? 'Đang lưu…' : 'Lưu mẫu quy trình'}
            </button>
            <button
              type="button"
              className="mws-btn mws-btn--danger"
              disabled={!selectedTemplateId || selectedTemplateId === 'NEW'}
              onClick={() => setConfirmDeleteOpen(true)}
              title="Xóa mẫu quy trình này"
            >
              <Trash2 size={15} /> Xóa
            </button>
          </div>
        </div>

        {/* Row 2: Template Configuration Card Strip */}
        <div className="mws-template-card-strip">
          {/* 1. Bộ chọn Bản Mẫu chuẩn CustomSelect */}
          <div className="mws-strip-field mws-strip-field--template">
            <label className="mws-field-label">Bản mẫu quy trình</label>
            <CustomSelect
              aria-label="Chọn mẫu quy trình"
              className="mws-custom-select mws-template-select"
              value={selectedTemplateId || ''}
              options={[
                ...templates.map((tpl) => ({
                  value: tpl.id,
                  label: `${tpl.name}${tpl.is_default ? ' ★ (Mặc định)' : ''}`,
                })),
                ...(selectedTemplateId === 'NEW'
                  ? [{ value: 'NEW', label: '✨ Mẫu mới (chưa lưu)' }]
                  : []),
              ]}
              onChange={(val) => handleSelectTemplate(val)}
              placeholder="— Chọn mẫu —"
            />
          </div>

          {/* 2. Ô nhập Tên mẫu */}
          <div className="mws-strip-field mws-strip-field--name">
            <label className="mws-field-label">Tên mẫu quy trình</label>
            <input
              type="text"
              className="mws-name-input"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Tên mẫu quy trình (VD: Đo vẽ cắm mốc chuẩn - V1)..."
            />
          </div>

          {/* 3. Ô nhập Ghi chú */}
          <div className="mws-strip-field mws-strip-field--desc">
            <label className="mws-field-label">Ghi chú định hướng</label>
            <input
              type="text"
              className="mws-desc-input"
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Ghi chú định hướng / lời dặn cho nhân viên khi áp dụng mẫu này..."
            />
          </div>

          {/* 4. Nút gạt Đặt làm mặc định */}
          <div className="mws-strip-field mws-strip-field--default">
            <label className="mws-field-label">Áp dụng</label>
            <label className={`mws-default-toggle${isDefault ? ' is-default' : ''}`}>
              <input
                type="checkbox"
                aria-label="Mặc định của combo"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              <Star size={14} fill={isDefault ? '#f59e0b' : 'none'} color={isDefault ? '#f59e0b' : '#64748b'} />
              <span>{isDefault ? 'Mặc định Combo' : 'Đặt làm mặc định'}</span>
            </label>
          </div>
        </div>
      </header>

      {/* ── Main Body: Canvas + Inspector ── */}
      <div className="mws-body">
        {/* Canvas Area */}
        <div className="mws-canvas-area">
          {/* Floating Toolbar */}
          <div className="mws-canvas-toolbar">
            <div className="mws-add-node-dropdown">
              <button
                type="button"
                className="mws-btn"
                onClick={() => setNodePickerOpen((v) => !v)}
              >
                <Plus size={14} /> Thêm node bước
              </button>
              {nodePickerOpen && (
                <div className="mws-catalog-menu">
                  {catalogNodes.map((cat) => (
                    <button
                      key={cat.code}
                      type="button"
                      className="mws-catalog-item"
                      onClick={() => handleAddNodeFromCatalog(cat)}
                    >
                      <span className="mws-catalog-code">{cat.code}</span>
                      <div className="mws-catalog-text">
                        <span className="mws-catalog-title">{cat.name}</span>
                        <span className="mws-catalog-desc">{cat.description}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="mws-btn"
              onClick={handleAutoLayout}
              title="Căn lề tự động các node"
            >
              <LayoutGrid size={14} /> Căn lề tự động
            </button>
          </div>

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            nodeTypes={NODE_TYPES}
            onNodeClick={(_evt, node) => setSelectedNodeId(node.id)}
            fitView
            minZoom={0.2}
            maxZoom={1.5}
          >
            <Background gap={18} size={1} color="#e2e8f0" />
            <Controls />
          </ReactFlow>
        </div>

        {/* Node Inspector Panel (Right) */}
        {selectedNode && (
          <aside className="mws-inspector">
            <div className="mws-inspector__head">
              <div className="mws-inspector__title">
                <Workflow size={16} color="var(--orange-500, #f97316)" />
                <span>Chi tiết bước [{selectedNode.data.code}]</span>
              </div>
              <button
                type="button"
                className="mws-icon-btn is-danger"
                title="Xóa bước này khỏi sơ đồ"
                onClick={() => handleDeleteNode(selectedNode.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>

            <div className="mws-inspector__body">
              {/* 1. Thông tin bước */}
              <div className="mws-inspector__section">
                <div className="mws-inspector__sec-title">
                  <div className="mws-sec-title-left">
                    <Sliders size={13} />
                    <span>Thông tin cơ bản</span>
                  </div>
                </div>
                <div className="mws-form-group">
                  <label className="mws-form-label">Tên bước thực hiện</label>
                  <input
                    type="text"
                    className="mws-form-input"
                    value={selectedNode.data.label || ''}
                    onChange={(e) => updateSelectedNodeData({ label: e.target.value })}
                    placeholder="VD: Tiếp nhận hồ sơ & Ký HĐ..."
                  />
                </div>
                <div className="mws-form-group">
                  <label className="mws-form-label">Phòng ban phụ trách</label>
                  <CustomSelect
                    className="mws-custom-select mws-dept-select"
                    value={normalizeDepartmentCode(selectedNode.data.poolDepartmentCode)}
                    options={STANDARD_DEPARTMENTS}
                    onChange={(val) => updateSelectedNodeData({ poolDepartmentCode: val })}
                    aria-label="Phòng ban phụ trách"
                  />
                </div>
              </div>

              {/* 2. SLA Tiêu Chuẩn */}
              <div className="mws-inspector__section">
                <div className="mws-inspector__sec-title">
                  <div className="mws-sec-title-left">
                    <Clock size={13} />
                    <span>Thời hạn SLA tiêu chuẩn</span>
                  </div>
                </div>
                <div className="mws-sla-grid">
                  <div className="mws-form-group">
                    <label className="mws-form-label">Số ngày</label>
                    <div className="mws-input-with-unit">
                      <input
                        type="number"
                        min="0"
                        className="mws-form-input"
                        value={selectedNode.data.durationDays ?? 0}
                        onChange={(e) =>
                          updateSelectedNodeData({ durationDays: parseInt(e.target.value, 10) || 0 })
                        }
                      />
                      <span className="mws-input-unit">ngày</span>
                    </div>
                  </div>
                  <div className="mws-form-group">
                    <label className="mws-form-label">Số giờ</label>
                    <div className="mws-input-with-unit">
                      <input
                        type="number"
                        min="0"
                        max="23"
                        className="mws-form-input"
                        value={selectedNode.data.durationHours ?? 0}
                        onChange={(e) =>
                          updateSelectedNodeData({ durationHours: parseInt(e.target.value, 10) || 0 })
                        }
                      />
                      <span className="mws-input-unit">giờ</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Đặc tính nghiệp vụ (Thẻ chọn hiện đại) */}
              <div className="mws-inspector__section">
                <div className="mws-inspector__sec-title">
                  <div className="mws-sec-title-left">
                    <Layers size={13} />
                    <span>Đặc tính nghiệp vụ</span>
                  </div>
                </div>
                <div className="mws-flag-card-group">
                  <label className={`mws-flag-card${selectedNode.data.requiresGovSubmission ? ' is-active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedNode.data.requiresGovSubmission)}
                      onChange={(e) =>
                        updateSelectedNodeData({ requiresGovSubmission: e.target.checked })
                      }
                    />
                    <div className="mws-flag-card__icon">🏛️</div>
                    <div className="mws-flag-card__content">
                      <div className="mws-flag-card__title">Nộp cơ quan nhà nước</div>
                      <div className="mws-flag-card__subtitle">Theo dõi một cửa & biên nhận hẹn trả</div>
                    </div>
                  </label>

                  <label className={`mws-flag-card${selectedNode.data.createsSurveyRecord ? ' is-active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedNode.data.createsSurveyRecord)}
                      onChange={(e) =>
                        updateSelectedNodeData({ createsSurveyRecord: e.target.checked })
                      }
                    />
                    <div className="mws-flag-card__icon">📐</div>
                    <div className="mws-flag-card__content">
                      <div className="mws-flag-card__title">Khảo sát / Đo đạc thực địa</div>
                      <div className="mws-flag-card__subtitle">Tạo biên bản đo đạc hiện trường & mốc ranh</div>
                    </div>
                  </label>

                  <label className={`mws-flag-card${selectedNode.data.isHandover ? ' is-active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedNode.data.isHandover)}
                      onChange={(e) => updateSelectedNodeData({ isHandover: e.target.checked })}
                    />
                    <div className="mws-flag-card__icon">🤝</div>
                    <div className="mws-flag-card__content">
                      <div className="mws-flag-card__title">Bàn giao hồ sơ khách hàng</div>
                      <div className="mws-flag-card__subtitle">Chốt công nợ & nghiệm thu bàn giao</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* 4. Checklist Tự Do */}
              <div className="mws-inspector__section">
                <div className="mws-inspector__sec-title">
                  <div className="mws-sec-title-left">
                    <CheckSquare size={13} />
                    <span>Checklist nhiệm vụ</span>
                    <span className="mws-cl-counter">({selectedNode.data.checklist?.length || 0})</span>
                  </div>
                  <button
                    type="button"
                    className="mws-cl-add-btn"
                    onClick={addChecklistItem}
                    title="Thêm nhiệm vụ checklist mới"
                  >
                    <Plus size={13} /> Thêm mục
                  </button>
                </div>

                <div className="mws-checklist-list">
                  {(selectedNode.data.checklist || []).map((item, idx) => (
                    <div key={item.key} className="mws-checklist-card">
                      <div className="mws-checklist-header">
                        <span className="mws-cl-index">#{idx + 1}</span>
                        {/* Tên checklist TỰ DO */}
                        <input
                          type="text"
                          className="mws-checklist-name-input"
                          placeholder="Nhập tên nhiệm vụ tự do..."
                          value={item.name}
                          onChange={(e) =>
                            updateChecklistItem(item.key, { name: e.target.value })
                          }
                        />
                        <div className="mws-checklist-actions">
                          <button
                            type="button"
                            className="mws-icon-btn"
                            title="Lên trên"
                            disabled={idx === 0}
                            onClick={() => moveChecklistItem(item.key, 'up')}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="mws-icon-btn"
                            title="Xuống dưới"
                            disabled={idx === (selectedNode.data.checklist?.length || 0) - 1}
                            onClick={() => moveChecklistItem(item.key, 'down')}
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            className="mws-icon-btn is-danger"
                            title="Xóa mục checklist này"
                            onClick={() => removeChecklistItem(item.key)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="mws-checklist-toggles">
                        <label className={`mws-cl-toggle-chip${item.required !== false ? ' is-active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={item.required !== false}
                            onChange={(e) =>
                              updateChecklistItem(item.key, { required: e.target.checked })
                            }
                          />
                          <span>Bắt buộc hoàn thành</span>
                        </label>
                        <label className={`mws-cl-toggle-chip${Boolean(item.require_evidence) ? ' is-active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={Boolean(item.require_evidence)}
                            onChange={(e) =>
                              updateChecklistItem(item.key, {
                                require_evidence: e.target.checked,
                              })
                            }
                          />
                          <span>Cần tài liệu minh chứng</span>
                        </label>
                      </div>

                      {/* Tài liệu đầu ra đính kèm - LỌC THEO ĐÚNG COMBO */}
                      <div className="mws-checklist-docs">
                        <div className="mws-cl-docs-header">
                          <FileText size={12} />
                          <span>Giấy tờ đầu ra ({item.output_documents?.length || 0})</span>
                        </div>
                        {item.output_documents?.length > 0 && (
                          <div className="mws-checklist-doc-tags">
                            {item.output_documents.map((doc) => {
                              const tplName =
                                doc.template_name ||
                                docTemplates.find((d) => d.id === doc.template_id)?.name ||
                                doc.template_id
                              return (
                                <span key={doc.template_id} className="mws-doc-tag">
                                  <FileText size={11} />
                                  <span className="mws-doc-tag-name">{tplName}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeOutputDoc(item.key, doc.template_id)}
                                    title="Gỡ loại giấy tờ này"
                                  >
                                    ×
                                  </button>
                                </span>
                              )
                            })}
                          </div>
                        )}
                        <select
                          className="mws-doc-select"
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

                          {/* Nhóm 1: Các mẫu chuẩn đúng cho bước này theo cấu hình Danh mục mẫu giấy tờ */}
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

                          {/* Nhóm 2: Các mẫu đầu ra khác trong Combo */}
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
                  ))}
                  {(selectedNode.data.checklist || []).length === 0 && (
                    <div className="mws-cl-empty">
                      <CheckSquare size={20} />
                      <span>Chưa có mục checklist nào. Bấm <strong>"+ Thêm mục"</strong> để tạo nhiệm vụ tự do.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Ghi chú & Lời dặn */}
              <div className="mws-inspector__section">
                <div className="mws-inspector__sec-title">
                  <div className="mws-sec-title-left">
                    <FileText size={13} />
                    <span>Lời dặn & Hướng dẫn kỹ thuật</span>
                  </div>
                </div>
                <textarea
                  className="mws-form-textarea"
                  rows={3}
                  value={selectedNode.data.description || ''}
                  onChange={(e) => updateSelectedNodeData({ description: e.target.value })}
                  placeholder="Lời dặn hoặc lưu ý nghiệp vụ cho nhân viên khi thực hiện bước này..."
                />
              </div>
            </div>
          </aside>
        )}
      </div>

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
