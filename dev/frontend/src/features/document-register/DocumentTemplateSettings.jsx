import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, ChevronRight, FileStack, Pencil, Plus, Power, Workflow } from 'lucide-react'

import ConfirmationModal from '../../components/ui/ConfirmationModal'
import { useToast } from '../../contexts/ToastContext'
import { apiFetch, peekApiCache, prefetchApi } from '../../lib/api'
import { safeViewTransition } from '../../lib/viewTransition'
import MasterWorkflowStudio from '../workflow-templates/MasterWorkflowStudio'
import StorageLocationsModal from './StorageLocationsModal'
import TemplateFormModal from './TemplateFormModal'
import {
  assignmentsInScope, buildScopePayload, filterTemplates, flattenTemplates,
} from './templateScope'
import './documentRegister.css'

/**
 * Master Data giấy tờ — nơi Giám đốc khai cây năm trục.
 *
 *     Gói → Hạng mục → Nhóm nguồn gốc → Node thực thi → Loại giấy tờ
 *
 * Bố cục ba cột vì đó là hình dạng thật của dữ liệu: đứng ở một (Gói, Hạng mục,
 * Nhóm) thì chỉ có một nhúm giấy liên quan, và mỗi tờ có bản ghi gán riêng của
 * nhánh đó. Bảng phẳng trước đây bày cả 31 mẫu cùng lúc nên không trả lời được
 * câu hỏi duy nhất người ta vào đây để hỏi: "hạng mục này cần những tờ gì".
 *
 * Sửa ở đây là sửa cho tương lai — hồ sơ đang chạy giữ nguyên bộ giấy đã đổ lúc
 * mở sổ.
 */

const SOURCE_TABS = [
  { id: 'KHACH_HANG', label: 'Khách hàng cung cấp' },
  { id: 'CO_QUAN', label: 'Cơ quan nhà nước' },
  { id: 'CONG_TY', label: 'Công ty soạn lập' },
]

const EMPTY_FORM = {
  id: null,
  applicabilityId: null,
  name: '',
  source: 'KHACH_HANG',
  note: '',
  is_required: true,
  needs_original: false,
  default_quantity: 1,
  sort_order: 100,
  is_active: true,
  nodeCode: '',
  scope: { globalAll: false, packageIds: [], taskTypeIds: [] },
}

export default function DocumentTemplateSettings({ initialTab = 'docs' }) {
  const { addToast } = useToast() || {}
  const [activeMainTab, setActiveMainTab] = useState(initialTab)
  const [visitedSubTabs, setVisitedSubTabs] = useState(() => new Set([initialTab]))

  const handleTabChange = useCallback((tabId) => {
    safeViewTransition(() => {
      setActiveMainTab(tabId)
      setVisitedSubTabs(prev => {
        if (prev.has(tabId)) return prev
        const next = new Set(prev)
        next.add(tabId)
        return next
      })
    })
  }, [])

  const [data, setData] = useState(() => (typeof peekApiCache === 'function' ? peekApiCache('/api/document-register/templates')?.data : null) || null)
  const [packageTree, setPackageTree] = useState(() => (typeof peekApiCache === 'function' ? peekApiCache('/api/catalog/service-packages')?.data : null) || [])
  const [nodes, setNodes] = useState(() => (typeof peekApiCache === 'function' ? peekApiCache('/api/document-register/workflow-nodes')?.data : null) || [])
  const [places, setPlaces] = useState(() => (typeof peekApiCache === 'function' ? peekApiCache('/api/document-register/storage-locations')?.data : null) || [])

  const [selectedPackage, setSelectedPackage] = useState('')
  const [selectedTaskType, setSelectedTaskType] = useState('')
  const [selectedSource, setSelectedSource] = useState('KHACH_HANG')
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null)

  const [modalMode, setModalMode] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [placesOpen, setPlacesOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState(null)

  const load = useCallback(async () => {
    try {
      const [templatePayload, placePayload, packagePayload, nodePayload] = await Promise.all([
        apiFetch('/api/document-register/templates'),
        apiFetch('/api/document-register/storage-locations'),
        apiFetch('/api/catalog/service-packages'),
        apiFetch('/api/document-register/workflow-nodes'),
      ])
      setData(templatePayload?.data || null)
      setPlaces(placePayload?.data || [])
      setPackageTree(packagePayload?.data || [])
      setNodes(nodePayload?.data || [])
    } catch (requestError) {
      addToast?.(requestError.message || 'Không tải được bộ mẫu.', 'error')
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (selectedPackage || packageTree.length === 0) return
    const first = packageTree[0]
    setSelectedPackage(first.id)
    setSelectedTaskType(first.task_types?.[0]?.id || '')
  }, [packageTree, selectedPackage])

  const templates = useMemo(() => flattenTemplates(data?.groups), [data])

  const visibleTemplates = useMemo(() => filterTemplates(templates, {
    packageId: selectedPackage,
    taskTypeId: selectedTaskType,
    source: selectedSource,
  }), [templates, selectedPackage, selectedTaskType, selectedSource])

  const selectedTemplate = useMemo(
    () => visibleTemplates.find(item => item.id === selectedTemplateId) || null,
    [visibleTemplates, selectedTemplateId],
  )

  const assignments = useMemo(
    () => (selectedTemplate
      ? assignmentsInScope(selectedTemplate, selectedPackage, selectedTaskType)
      : []),
    [selectedTemplate, selectedPackage, selectedTaskType],
  )

  const activeAssignment = assignments.find(item => item.id === selectedAssignmentId)
    || assignments[0]
    || null

  const currentPackage = packageTree.find(pkg => pkg.id === selectedPackage)
  const currentTaskType = currentPackage?.task_types
    ?.find(type => type.id === selectedTaskType)

  const changeContext = (patch) => {
    setSelectedTemplateId(null)
    setSelectedAssignmentId(null)
    if (patch.packageId !== undefined) {
      setSelectedPackage(patch.packageId)
      const pkg = packageTree.find(item => item.id === patch.packageId)
      setSelectedTaskType(pkg?.task_types?.[0]?.id || '')
    }
    if (patch.taskTypeId !== undefined) setSelectedTaskType(patch.taskTypeId)
    if (patch.source !== undefined) setSelectedSource(patch.source)
  }

  const openCreate = () => {
    setFormData({
      ...EMPTY_FORM,
      source: selectedSource,
      // Mở sẵn đúng ngữ cảnh đang đứng — đó là phạm vi người ta muốn khai chín
      // trên mười lần. Vẫn sửa lại được.
      scope: {
        globalAll: false,
        packageIds: [],
        taskTypeIds: selectedTaskType ? [selectedTaskType] : [],
      },
    })
    setModalMode('create')
  }

  const openEdit = (assignment) => {
    if (!selectedTemplate || !assignment) return
    setFormData({
      ...EMPTY_FORM,
      id: selectedTemplate.id,
      applicabilityId: assignment.id,
      name: selectedTemplate.name,
      source: selectedTemplate.source,
      note: selectedTemplate.note || '',
      is_required: selectedTemplate.is_required,
      needs_original: selectedTemplate.needs_original,
      default_quantity: selectedTemplate.default_quantity,
      sort_order: selectedTemplate.sort_order,
      is_active: selectedTemplate.is_active,
      nodeCode: assignment.node_code || '',
    })
    setModalMode('edit')
  }

  const submitForm = async () => {
    setSaving(true)
    try {
      const saved = await apiFetch('/api/document-register/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: formData.id,
          task_type_id: null,
          name: formData.name,
          source: formData.source,
          is_required: formData.is_required,
          needs_original: formData.needs_original,
          default_quantity: formData.default_quantity,
          sort_order: formData.sort_order,
          note: formData.note,
          is_active: formData.is_active,
        }),
      })
      // Sửa thì id đã biết chắc từ dòng đang chọn; chỉ khi Thêm mới ta mới phải
      // chờ server cấp id. Lấy theo phản hồi server cho cả hai đường là tự đặt
      // ra một cửa hỏng không cần thiết — ghi phạm vi vào nhầm mẫu.
      const templateId = modalMode === 'edit' ? formData.id : saved?.data?.id

      if (modalMode === 'edit') {
        // Ghi theo id của ĐÚNG bản ghi đang sửa. Gửi lại cả cụm sẽ xoá bản ghi
        // của hạng mục khác — hai nhánh đáng lẽ độc lập.
        await apiFetch(
          `/api/document-register/templates/${templateId}/applicabilities/${formData.applicabilityId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node_code: formData.nodeCode || null, is_default: true }),
          },
        )
      } else {
        const items = buildScopePayload({ ...formData.scope, nodeCode: formData.nodeCode })
        // Mẫu vừa tạo thì chưa có dòng nào để đè, nên bulk PUT là an toàn.
        await apiFetch(`/api/document-register/templates/${templateId}/applicabilities`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        })
      }

      addToast?.(modalMode === 'edit' ? 'Đã lưu thay đổi' : 'Đã thêm vào mẫu', 'success')
      setModalMode(null)
      await load()
    } catch (saveError) {
      addToast?.(saveError.message || 'Không lưu được.', 'error')
      // Nạp lại kể cả khi hỏng: mẫu có thể đã tạo xong mà phạm vi chưa, màn phải
      // hiện đúng thực tế để Giám đốc bấm Sửa chứ không tạo lại một bản trùng.
      await load()
    } finally {
      setSaving(false)
    }
  }

  const deactivateTemplate = async () => {
    const target = confirmTarget
    setConfirmTarget(null)
    try {
      await apiFetch(`/api/document-register/templates/${target.id}`, { method: 'DELETE' })
      addToast?.('Đã tắt khỏi mẫu', 'success')
      setSelectedTemplateId(null)
      await load()
    } catch (deleteError) {
      addToast?.(deleteError.message || 'Không tắt được.', 'error')
    }
  }

  const savePlace = async (place) => {
    try {
      await apiFetch('/api/document-register/storage-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...place, implies_status: place.implies_status || null }),
      })
      addToast?.('Đã lưu nơi lưu', 'success')
      await load()
    } catch (saveError) {
      addToast?.(saveError.message || 'Không lưu được.', 'error')
    }
  }

  const deactivatePlace = async (place) => {
    if (!window.confirm(
      `Tắt “${place.name}” khỏi danh mục?\n\n`
      + 'Hồ sơ đang trỏ vào nơi này vẫn giữ nguyên — chỉ là không chọn mới được nữa.'
    )) return
    try {
      await apiFetch(`/api/document-register/storage-locations/${place.id}`, { method: 'DELETE' })
      addToast?.('Đã tắt khỏi danh mục', 'success')
      await load()
    } catch (deleteError) {
      addToast?.(deleteError.message || 'Không tắt được.', 'error')
    }
  }

  const lockedScopeLabel = [
    currentPackage?.name && `Gói ${currentPackage.name}`,
    currentTaskType?.name,
  ].filter(Boolean).join(' › ')

  // Bỏ nấc chưa chọn thay vì in ô trống: một đường dẫn có lỗ hổng làm người ta
  // tưởng mất dữ liệu, trong khi thật ra chỉ là chưa bấm tới nấc đó.
  const breadcrumb = [
    currentPackage && { key: 'goi', label: currentPackage.name },
    currentTaskType && { key: 'hangmuc', label: currentTaskType.name },
    { key: 'nhom', label: SOURCE_TABS.find(tab => tab.id === selectedSource)?.label },
    selectedTemplate && { key: 'giay', label: selectedTemplate.name },
  ].filter(Boolean)

  return (
    <div className="tab-pane active list-page-frame" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* ── THANH ĐIỀU HƯỚNG TAB CHÍNH ── */}
      <nav className="doc-templates-main-tabs" aria-label="Phân hệ Quy trình và Mẫu giấy">
        <button
          type="button"
          aria-pressed={activeMainTab === 'workflow'}
          className={`doc-templates-main-tab${activeMainTab === 'workflow' ? ' is-active' : ''}`}
          onClick={() => handleTabChange('workflow')}
          onMouseEnter={() => {
            prefetchApi?.('/api/contracts/workflow/templates')
            prefetchApi?.('/api/contracts/workflow/catalog')
          }}
        >
          <Workflow size={16} /> Sơ đồ quy trình mẫu (Workflow Studio)
        </button>
        <button
          type="button"
          aria-pressed={activeMainTab === 'docs'}
          className={`doc-templates-main-tab${activeMainTab === 'docs' ? ' is-active' : ''}`}
          onClick={() => handleTabChange('docs')}
          onMouseEnter={() => {
            prefetchApi?.('/api/document-register/templates')
            prefetchApi?.('/api/document-register/workflow-nodes')
          }}
        >
          <FileStack size={16} /> Danh mục mẫu giấy tờ (Document Register)
        </button>
      </nav>

      {visitedSubTabs.has('workflow') && (
        <div
          style={{
            display: activeMainTab === 'workflow' ? 'flex' : 'none',
            flex: '1 1 auto',
            minHeight: 0,
            overflow: 'hidden',
            flexDirection: 'column',
          }}
        >
          <MasterWorkflowStudio />
        </div>
      )}

      {visitedSubTabs.has('docs') && (
        <div
          style={{
            display: activeMainTab === 'docs' ? 'flex' : 'none',
            flex: '1 1 auto',
            minHeight: 0,
            overflow: 'hidden',
            flexDirection: 'column',
          }}
        >
          <section className="dtm list-page-frame" aria-label="Mẫu giấy tờ" style={{ flex: '1 1 auto', minHeight: 0 }}>
          {/* ── HÀNG 1: tiêu đề màn + đường đi ── */}
          <header className="contract-pane-title dtm__bar">
            <div>
              <FileStack size={19} style={{ color: 'var(--orange-500)' }} />
              <span>Mẫu Giấy Tờ</span>
              <strong>{templates.length}</strong>
              <nav className="dtm__crumb" aria-label="Đường dẫn">
                {breadcrumb.map((buoc, thuTu) => (
                  <span key={buoc.key} className={thuTu === breadcrumb.length - 1 ? 'is-cuoi' : ''}>
                    {thuTu > 0 && <ChevronRight size={12} aria-hidden="true" />}
                    {buoc.label}
                  </span>
                ))}
              </nav>
            </div>
            <div className="dtm__bar-tools">
              <button
                type="button"
                className="dtm__places"
                onClick={() => setPlacesOpen(true)}
                title="Danh mục nơi lưu bản cứng"
                aria-label="Danh mục nơi lưu bản cứng"
              >
                <Archive size={16} />
              </button>
              <button
                type="button"
                className="contract-add-button"
                onClick={openCreate}
                title="Thêm loại giấy tờ vào mẫu"
                aria-label="Thêm loại giấy tờ"
              >
                <Plus size={20} />
              </button>
            </div>
          </header>

          {/* ── HÀNG 2: đầu cột ── */}
          <div className="dtm__grid dtm__heads">
            <div className="dtm__head" role="tablist" aria-label="Gói dịch vụ">
              {packageTree.map(pkg => (
                <button
                  key={pkg.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedPackage === pkg.id}
                  className={`dtm__tab${selectedPackage === pkg.id ? ' is-active' : ''}`}
                  onClick={() => changeContext({ packageId: pkg.id })}
                >
                  {pkg.name}
                </button>
              ))}
            </div>
            <div className="dtm__head" role="tablist" aria-label="Nhóm nguồn gốc">
              {SOURCE_TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedSource === tab.id}
                  className={`dtm__tab${selectedSource === tab.id ? ' is-active' : ''}`}
                  onClick={() => changeContext({ source: tab.id })}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="dtm__head is-label">Node đã áp dụng</div>
          </div>

          {/* ── HÀNG 3: ba cột ── */}
          <div className="dtm__grid dtm__cols">
            <div className="dtm__col" data-col="types">
              <div className="dtm__col-body">
                {(currentPackage?.task_types || []).map(type => (
                  <button
                    key={type.id}
                    type="button"
                    className={`dtm__item${selectedTaskType === type.id ? ' is-active' : ''}`}
                    onClick={() => changeContext({ taskTypeId: type.id })}
                  >
                    {type.name}
                  </button>
                ))}
                {(currentPackage?.task_types || []).length === 0 && (
                  <p className="dtm__empty">Gói này chưa có hạng mục nào.</p>
                )}
              </div>
            </div>

            <div className="dtm__col" data-col="docs">
              <div className="dtm__col-body">
                {!data && <p className="dtm__empty">Đang tải bộ mẫu…</p>}
                {data && visibleTemplates.length === 0 && (
                  <p className="dtm__empty">
                    Chưa có loại giấy nào cho hạng mục và nhóm này.
                    Bấm <strong>+</strong> ở góc trên để thêm.
                  </p>
                )}
                {visibleTemplates.map(template => (
                  <button
                    key={template.id}
                    type="button"
                    className={`dtm__item${selectedTemplateId === template.id ? ' is-active' : ''}`
                      + (template.is_active ? '' : ' is-off')}
                    onClick={() => { setSelectedTemplateId(template.id); setSelectedAssignmentId(null) }}
                  >
                    <span>{template.name}</span>
                    {!template.is_active && <span className="dr-tag">đã tắt</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="dtm__col" data-col="nodes">
              <div className="dtm__col-body">
                {!selectedTemplate && (
                  <p className="dtm__empty">
                    Vui lòng chọn 1 loại giấy tờ bên trái để xem chi tiết và thao tác.
                  </p>
                )}
                {selectedTemplate && assignments.length === 0 && (
                  <p className="dtm__empty">Tờ giấy này chưa gán bước nào trong hạng mục đang chọn.</p>
                )}
                {selectedTemplate && assignments.map(assignment => {
                  const node = nodes.find(item => item.code === assignment.node_code)
                  return (
                    <button
                      key={assignment.id}
                      type="button"
                      className={`dtm__node${activeAssignment?.id === assignment.id ? ' is-active' : ''}`}
                      onClick={() => setSelectedAssignmentId(assignment.id)}
                    >
                      {assignment.node_code
                        ? <span><b>{assignment.node_code}</b> · {node?.name || 'bước không còn trong danh mục'}</span>
                        : <span className="dr-tag is-chua-phan">chưa gán bước</span>}
                      <em>{assignment.scope_label}</em>
                    </button>
                  )
                })}
              </div>

              <div className="dtm__foot">
                <button
                  type="button"
                  className="dtm__act"
                  disabled={!activeAssignment}
                  onClick={() => openEdit(activeAssignment)}
                >
                  <Pencil size={13} /> Sửa
                </button>
                <button
                  type="button"
                  className="dtm__act is-off"
                  disabled={!selectedTemplate}
                  onClick={() => setConfirmTarget(selectedTemplate)}
                >
                  <Power size={13} /> Xoá
                </button>
              </div>
            </div>
          </div>

          <TemplateFormModal
            open={Boolean(modalMode)}
            mode={modalMode}
            value={formData}
            packageTree={packageTree}
            nodes={nodes}
            lockedScopeLabel={lockedScopeLabel}
            saving={saving}
            onChange={setFormData}
            onSubmit={submitForm}
            onClose={() => setModalMode(null)}
          />

          <StorageLocationsModal
            open={placesOpen}
            places={places}
            onClose={() => setPlacesOpen(false)}
            onSave={savePlace}
            onDeactivate={deactivatePlace}
          />

          <ConfirmationModal
            open={Boolean(confirmTarget)}
            onClose={() => setConfirmTarget(null)}
            onConfirm={deactivateTemplate}
            title={`Tắt “${confirmTarget?.name || ''}” khỏi mẫu?`}
            description={
              `${confirmTarget?.in_use || 0} hồ sơ đang dùng mục này vẫn giữ nguyên — `
              + 'chỉ hợp đồng mới là không còn đòi tờ giấy này nữa.'
            }
            confirmLabel="Tắt khỏi mẫu"
            variant="warning"
          />
        </section>
      </div>
      )}
    </div>
  )
}
