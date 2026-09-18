import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  Building2,
  ChevronDown,
  ChevronRight,
  FileStack,
  Info,
  Landmark,
  Pencil,
  Plus,
  Power,
  Search,
  UserCheck,
  Workflow,
} from 'lucide-react'

import ConfirmationModal from '../../components/ui/ConfirmationModal'
import { useToast } from '../../contexts/ToastContext'
import { apiFetch, clearApiCache, peekApiCache, prefetchApi } from '../../lib/api'
import { safeViewTransition } from '../../lib/viewTransition'
import MasterWorkflowStudio from '../workflow-templates/MasterWorkflowStudio'
import CatalogManageModal from '../../components/catalog/CatalogManageModal'
import StorageLocationsModal from './StorageLocationsModal'
import TemplateFormModal from './TemplateFormModal'
import {
  assignmentsInScope, buildScopePayload, filterTemplates, flattenTemplates,
} from './templateScope'
import './documentRegister.css'

/**
 * Master Data Danh Mục Mẫu Giấy Tờ (Document Register)
 * Bố cục 2 vùng chuẩn Enterprise:
 * - Vùng 1: Panel Danh mục Gói dịch vụ & Hạng mục công việc (Treeview, Search, CRUD)
 * - Vùng 2: Workspace Quản lý Mẫu giấy tờ theo Nguồn gốc & Bảng dữ liệu có Scroll Containment
 */

const SOURCE_TABS = [
  { id: 'ALL', label: 'Tất cả', icon: FileStack },
  { id: 'KHACH_HANG', label: 'Khách hàng cung cấp', icon: UserCheck },
  { id: 'CO_QUAN', label: 'Cơ quan Nhà nước', icon: Landmark },
  { id: 'CONG_TY', label: 'Công ty soạn lập', icon: Building2 },
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
      parentPackageId: parentPackageId || selectedPackage,
    })
  }

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
  const [selectedSource, setSelectedSource] = useState('ALL')
  const [taskTypeSearch, setTaskTypeSearch] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedPackages, setExpandedPackages] = useState({})

  const [modalMode, setModalMode] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [placesOpen, setPlacesOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [recentlyAddedId, setRecentlyAddedId] = useState(null)

  const load = useCallback(async () => {
    try {
      const [templatePayload, placePayload, packagePayload, nodePayload] = await Promise.all([
        apiFetch('/api/document-register/templates'),
        apiFetch('/api/document-register/storage-locations'),
        apiFetch('/api/catalog/service-packages'),
        apiFetch('/api/document-register/workflow-nodes'),
      ])
      const pkgs = packagePayload?.data || []
      setData(templatePayload?.data || null)
      setPlaces(placePayload?.data || [])
      setPackageTree(pkgs)
      setNodes(nodePayload?.data || [])
      setSelectedPackage(prev => prev || pkgs[0]?.id || '')
      setSelectedTaskType(prev => prev || pkgs[0]?.task_types?.[0]?.id || '')
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

  // Tự động mở rộng tất cả các gói trong danh mục ban đầu
  useEffect(() => {
    if (packageTree.length > 0) {
      setExpandedPackages(prev => {
        const next = { ...prev }
        packageTree.forEach(pkg => {
          if (next[pkg.id] === undefined) {
            next[pkg.id] = true
          }
        })
        return next
      })
    }
  }, [packageTree])

  const togglePackageExpand = (pkgId, e) => {
    e?.stopPropagation()
    setExpandedPackages(prev => ({
      ...prev,
      [pkgId]: !prev[pkgId],
    }))
  }

  const templates = useMemo(() => flattenTemplates(data?.groups), [data])

  const currentPackage = packageTree.find(pkg => pkg.id === selectedPackage)
  const currentTaskType = currentPackage?.task_types?.find(type => type.id === selectedTaskType)

  // Đếm số mẫu theo từng hạng mục
  const countForTaskType = useCallback((pkgId, typeId) => {
    return templates.filter(t => (t.applicabilities || []).some(a =>
      a.applicability_type === 'GLOBAL' ||
      (a.applicability_type === 'PACKAGE' && a.service_package_id === pkgId) ||
      (a.applicability_type === 'TASK_TYPE' && a.task_type_id === typeId)
    )).length
  }, [templates])

  // Lấy danh sách mẫu trong ngữ cảnh gói/hạng mục hiện tại để đếm theo 4 tab nguồn
  const templatesInScopeAll = useMemo(() => filterTemplates(templates, {
    packageId: selectedPackage,
    taskTypeId: selectedTaskType,
    source: 'ALL',
  }), [templates, selectedPackage, selectedTaskType])

  const sourceCounts = useMemo(() => {
    const counts = { ALL: 0, KHACH_HANG: 0, CO_QUAN: 0, CONG_TY: 0 }
    templatesInScopeAll.forEach(t => {
      counts.ALL++
      if (counts[t.source] !== undefined) counts[t.source]++
    })
    return counts
  }, [templatesInScopeAll])

  // Mẫu giấy lọc theo Tab nguồn hiện tại
  const visibleTemplates = useMemo(() => filterTemplates(templates, {
    packageId: selectedPackage,
    taskTypeId: selectedTaskType,
    source: selectedSource,
  }), [templates, selectedPackage, selectedTaskType, selectedSource])

  // Mẫu giấy lọc tiếp theo từ khóa tìm kiếm
  const displayTemplates = useMemo(() => {
    let list = visibleTemplates
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      list = list.filter(t =>
        t.name?.toLowerCase().includes(q) ||
        t.note?.toLowerCase().includes(q)
      )
    }
    if (recentlyAddedId) {
      const idx = list.findIndex(t => t.id === recentlyAddedId)
      if (idx > 0) {
        const item = list[idx]
        list = [item, ...list.slice(0, idx), ...list.slice(idx + 1)]
      }
    }
    return list
  }, [visibleTemplates, searchTerm, recentlyAddedId])

  // Phân trang danh mục mẫu giấy tờ (khớp footer cố định chuẩn hệ thống)
  const PAGE_SIZE = 12
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [selectedPackage, selectedTaskType, selectedSource, searchTerm])

  const totalPages = Math.max(1, Math.ceil(displayTemplates.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedTemplates = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return displayTemplates.slice(start, start + PAGE_SIZE)
  }, [displayTemplates, currentPage])

  const selectTaskType = (pkgId, typeId) => {
    setSelectedPackage(pkgId)
    setSelectedTaskType(typeId)
  }

  const openCreate = () => {
    setFormData({
      ...EMPTY_FORM,
      source: selectedSource === 'ALL' ? 'KHACH_HANG' : selectedSource,
      scope: {
        globalAll: false,
        packageIds: [],
        taskTypeIds: selectedTaskType ? [selectedTaskType] : [],
      },
    })
    setModalMode('create')
  }

  const openEdit = (template) => {
    if (!template) return
    const currentAssignments = assignmentsInScope(template, selectedPackage, selectedTaskType)
    const primaryAssignment = currentAssignments[0] || template.applicabilities?.[0] || null

    setFormData({
      ...EMPTY_FORM,
      id: template.id,
      applicabilityId: primaryAssignment?.id || null,
      name: template.name,
      source: template.source,
      note: template.note || '',
      is_required: template.is_required,
      needs_original: template.needs_original,
      default_quantity: template.default_quantity,
      sort_order: template.sort_order,
      is_active: template.is_active,
      nodeCode: '',
      scope: {
        globalAll: primaryAssignment?.applicability_type === 'GLOBAL',
        packageIds: primaryAssignment?.service_package_id ? [primaryAssignment.service_package_id] : [],
        taskTypeIds: primaryAssignment?.task_type_id ? [primaryAssignment.task_type_id] : (selectedTaskType ? [selectedTaskType] : []),
      },
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

      const templateId = modalMode === 'edit' ? formData.id : saved?.data?.id

      if (modalMode === 'edit') {
        if (formData.applicabilityId) {
          await apiFetch(
            `/api/document-register/templates/${templateId}/applicabilities/${formData.applicabilityId}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ node_code: null, is_default: true }),
            },
          )
        }
      } else {
        const items = buildScopePayload({ ...formData.scope, nodeCode: null })
        await apiFetch(`/api/document-register/templates/${templateId}/applicabilities`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        })
      }

      clearApiCache('/api/document-register')
      clearApiCache('/api/contracts')
      if (templateId) {
        setRecentlyAddedId(templateId)
        setPage(1)
      }
      addToast?.(modalMode === 'edit' ? 'Đã lưu thay đổi' : 'Đã thêm vào mẫu', 'success')
      setModalMode(null)
      await load()
    } catch (saveError) {
      addToast?.(saveError.message || 'Không lưu được.', 'error')
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
      clearApiCache('/api/document-register')
      clearApiCache('/api/contracts')
      addToast?.('Đã tắt khỏi mẫu', 'success')
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

  // Nguồn nhãn & style helper
  const getSourceBadge = (source) => {
    switch (source) {
      case 'KHACH_HANG':
        return { label: 'Khách hàng cung cấp', cls: 'is-khach-hang' }
      case 'CO_QUAN':
        return { label: 'Cơ quan Nhà nước', cls: 'is-co-quan' }
      case 'CONG_TY':
        return { label: 'Công ty soạn lập', cls: 'is-cong-ty' }
      default:
        return { label: source, cls: '' }
    }
  }

  return (
    <div className="tab-pane active list-page-frame" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - var(--header-h) - 6px)', maxHeight: 'calc(100dvh - var(--header-h) - 6px)', minHeight: 0, overflow: 'hidden' }}>
      {/* ── THANH ĐIỀU HƯỚNG TAB CẤP CAO ── */}
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
            flex: '1 1 0%',
            height: '100%',
            maxHeight: '100%',
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
            flex: '1 1 0%',
            height: '100%',
            maxHeight: '100%',
            minHeight: 0,
            overflow: 'hidden',
            flexDirection: 'column',
          }}
        >
          <div className="dtr-root" aria-label="Mẫu giấy tờ">
            {/* ── TOP BAR: Tiêu đề + Nút thao tác toàn cục ── */}
            <header className="dtr-top-bar">
              <div className="dtr-top-bar__left">
                <h1 className="dtr-top-bar__title">
                  <FileStack size={20} style={{ color: 'var(--orange-500, #eb4a23)' }} />
                  <span>Mẫu Giấy Tờ</span>
                  <span className="dtr-top-bar__badge">{templates.length}</span>
                </h1>
              </div>
              <div className="dtr-top-bar__actions">
                <button
                  type="button"
                  className="dtr-btn-places"
                  onClick={() => setPlacesOpen(true)}
                  title="Danh mục nơi lưu bản cứng"
                  aria-label="Danh mục nơi lưu bản cứng"
                >
                  <Archive size={15} />
                  <span>Nơi lưu bản cứng</span>
                </button>
                <button
                  type="button"
                  className="dtr-btn-add"
                  onClick={openCreate}
                  title="Thêm loại giấy tờ vào mẫu"
                  aria-label="Thêm loại giấy tờ"
                >
                  <Plus size={16} />
                  <span>Thêm loại giấy</span>
                </button>
              </div>
            </header>

            {/* ── MAIN 2-ZONE GRID ── */}
            <main className="dtr-main-grid">
              {/* ── VÙNG 1: PANEL TRÁI (DANH MỤC GÓI & HẠNG MỤC) ── */}
              <aside className="dtr-panel-catalog" aria-label="Danh mục Gói và Hạng mục">
                <div className="dtr-panel-catalog__head">
                  <span className="dtr-panel-catalog__title">Gói & Hạng mục</span>
                  <div className="dtr-panel-catalog__tools">
                    <button
                      type="button"
                      className="dtr-btn-mini"
                      onClick={() => openCatalogModal('PACKAGE', 'create')}
                      title="Thêm Gói dịch vụ mới"
                    >
                      <Plus size={11} /> Gói
                    </button>
                    <button
                      type="button"
                      className="dtr-btn-mini"
                      onClick={() => openCatalogModal('TASK_TYPE', 'create', null, selectedPackage)}
                      title="Thêm Hạng mục mới"
                    >
                      <Plus size={11} /> Hạng mục
                    </button>
                  </div>
                </div>

                <div className="dtr-search-box">
                  <Search size={13} />
                  <input
                    type="text"
                    className="dtr-search-input"
                    placeholder="Lọc hạng mục..."
                    value={taskTypeSearch}
                    onChange={(e) => setTaskTypeSearch(e.target.value)}
                  />
                </div>

                <div className="dtr-panel-catalog__body" role="tablist" aria-label="Cây Gói và Hạng mục">
                  {packageTree.map(pkg => {
                    const isExpanded = expandedPackages[pkg.id] !== false
                    const filteredTaskTypes = (pkg.task_types || []).filter(t =>
                      !taskTypeSearch.trim() || t.name.toLowerCase().includes(taskTypeSearch.toLowerCase().trim())
                    )

                    if (taskTypeSearch.trim() && filteredTaskTypes.length === 0) {
                      return null
                    }

                    return (
                      <div key={pkg.id} className="dtr-pkg-group">
                        <div
                          className={`dtr-pkg-header${selectedPackage === pkg.id ? ' is-selected' : ''}`}
                          onClick={() => {
                            setSelectedPackage(pkg.id)
                            if (pkg.task_types?.[0] && selectedPackage !== pkg.id) {
                              setSelectedTaskType(pkg.task_types[0].id)
                            }
                          }}
                        >
                          <div className="dtr-pkg-header__left">
                            <span
                              onClick={(e) => togglePackageExpand(pkg.id, e)}
                              style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                            >
                              {isExpanded ? <ChevronDown size={14} color="#64748b" /> : <ChevronRight size={14} color="#64748b" />}
                            </span>
                            <span className="dtr-pkg-dot" style={{ backgroundColor: pkg.color || '#3b82f6' }} />
                            <span className="dtr-pkg-name">{pkg.name}</span>
                            <span className="dtr-pkg-count">{pkg.task_types?.length || 0}</span>
                          </div>
                          <div className="dtr-pkg-header__right">
                            <button
                              type="button"
                              className="dtr-btn-icon-subtle"
                              onClick={(e) => {
                                e.stopPropagation()
                                openCatalogModal('PACKAGE', 'edit', pkg)
                              }}
                              title={`Chỉnh sửa Gói: ${pkg.name}`}
                              aria-label={`Chỉnh sửa Gói: ${pkg.name}`}
                            >
                              <Pencil size={11} />
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="dtr-task-list">
                            {filteredTaskTypes.map(type => {
                              const isActive = selectedTaskType === type.id
                              const count = countForTaskType(pkg.id, type.id)
                              return (
                                <div
                                  key={type.id}
                                  role="tab"
                                  aria-selected={isActive}
                                  className={`dtr-task-item${isActive ? ' is-active' : ''}`}
                                  onClick={() => selectTaskType(pkg.id, type.id)}
                                >
                                  <span className="dtr-task-item__name">{type.name}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span className="dtr-task-item__count">{count}</span>
                                    <button
                                      type="button"
                                      className="dtr-btn-icon-subtle"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openCatalogModal('TASK_TYPE', 'edit', type, pkg.id)
                                      }}
                                      title={`Chỉnh sửa Hạng mục: ${type.name}`}
                                      aria-label={`Chỉnh sửa Hạng mục: ${type.name}`}
                                    >
                                      <Pencil size={10} />
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                            {filteredTaskTypes.length === 0 && (
                              <div style={{ padding: '8px 12px', fontSize: '11.5px', color: '#94a3b8' }}>
                                Chưa có hạng mục
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {packageTree.length === 0 && (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                      Chưa có Gói dịch vụ nào.
                    </div>
                  )}
                </div>
              </aside>

              {/* ── VÙNG 2: WORKSPACE PHẢI (QUẢN LÝ MẪU GIẤY TỜ) ── */}
              <section className="dtr-panel-workspace" aria-label="Danh sách Mẫu giấy tờ">
                {/* Header Workspace: Breadcrumb Path */}
                <header className="dtr-ws-header">
                  <nav className="dtr-ws-crumb" aria-label="Đường dẫn">
                    <span>Gói {currentPackage?.name || '...'}</span>
                    <ChevronRight size={13} />
                    <h2 className="dtr-ws-title">{currentTaskType?.name || 'Tất cả hạng mục'}</h2>
                  </nav>
                </header>

                {/* Source Filter Cards */}
                <div className="dtr-source-bar" role="tablist" aria-label="Bộ lọc nguồn phát sinh">
                  {SOURCE_TABS.map(tab => {
                    const TabIcon = tab.icon
                    const isActive = selectedSource === tab.id
                    const count = sourceCounts[tab.id] || 0
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        className={`dtr-source-card${isActive ? ' is-active' : ''}`}
                        data-src={tab.id}
                        onClick={() => setSelectedSource(tab.id)}
                      >
                        <div className="dtr-source-card__info">
                          <span className="dtr-source-card__icon">
                            <TabIcon size={14} />
                          </span>
                          <span className="dtr-source-card__name">{tab.label}</span>
                        </div>
                        <span className="dtr-source-card__count">{count}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Filter Row: Quick Search */}
                <div className="dtr-filter-row">
                  <div className="dtr-doc-search">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="Tìm tên giấy tờ trong hạng mục này..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <span className="dtr-doc-count-note">
                    Hiển thị <strong>{displayTemplates.length}</strong> / {templatesInScopeAll.length} loại giấy tờ
                  </span>
                </div>

                {/* Data Table with Scroll Containment */}
                <div className="dtr-table-wrap">
                  <table className="dtr-table">
                    <thead>
                      <tr>
                        <th style={{ width: '38%' }}>Tên giấy tờ &amp; Ghi chú</th>
                        <th style={{ width: '22%' }}>Nguồn phát sinh</th>
                        <th style={{ width: '20%' }}>Quy cách</th>
                        <th style={{ width: '10%' }}>Trạng thái</th>
                        <th style={{ width: '10%', textAlign: 'right' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayTemplates.length === 0 && (
                        <tr>
                          <td colSpan={5}>
                            <div className="dtr-table-empty">
                              <FileStack size={36} strokeWidth={1.5} />
                              <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#334155' }}>
                                Chưa có loại giấy nào trong mục này
                              </p>
                              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                                Bấm <strong>&quot;+ Thêm loại giấy&quot;</strong> ở góc trên để bổ sung vào danh mục mẫu.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                      {pagedTemplates.map(template => {
                        const badge = getSourceBadge(template.source)
                        return (
                          <tr key={template.id} className={!template.is_active ? 'is-disabled' : ''}>
                            <td className="dtr-cell-doc">
                              <div className="dtr-doc-name">
                                {template.name}
                                {template.id === recentlyAddedId && (
                                  <span style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '1px 5px',
                                    marginLeft: '6px',
                                    backgroundColor: 'var(--color-primary-subtle, #e0f2fe)',
                                    color: 'var(--color-primary, #0369a1)',
                                    borderRadius: '4px',
                                    display: 'inline-block',
                                    verticalAlign: 'middle',
                                  }}>Mới</span>
                                )}
                              </div>
                              {template.note && (
                                <div className="dtr-doc-note">
                                  <Info size={11} />
                                  <span>{template.note}</span>
                                </div>
                              )}
                              {template.in_use > 0 && (
                                <div style={{ marginTop: '4px' }}>
                                  <span className="dr-tag" style={{ margin: 0 }}>
                                    {template.in_use} hồ sơ đang dùng
                                  </span>
                                </div>
                              )}
                            </td>
                            <td>
                              <span className={`dtr-badge-source ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td>
                              <div className="dtr-specs-group">
                                {template.is_required ? (
                                  <span className="dtr-chip is-required">Bắt buộc</span>
                                ) : (
                                  <span className="dtr-chip is-optional">Tùy chọn</span>
                                )}
                                {template.needs_original && (
                                  <span className="dtr-chip is-original">Bản gốc</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className={`dtr-status-pill ${template.is_active ? 'is-active' : 'is-off'}`}>
                                {template.is_active ? 'Đang dùng' : 'Đã tắt'}
                              </span>
                            </td>
                            <td>
                              <div className="dtr-row-actions" style={{ justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="dtr-btn-row-edit"
                                  onClick={() => openEdit(template)}
                                  title="Chỉnh sửa mẫu giấy tờ"
                                  aria-label={`Sửa ${template.name}`}
                                >
                                  <Pencil size={12} />
                                  <span>Sửa</span>
                                </button>
                                <button
                                  type="button"
                                  className="dtr-btn-row-toggle"
                                  onClick={() => setConfirmTarget(template)}
                                  title="Tắt/Xóa khỏi mẫu"
                                  aria-label={`Xoá ${template.name}`}
                                >
                                  <Power size={12} />
                                  <span>Xoá</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── FOOTER PHÂN TRANG CỐ ĐỊNH (Khớp chuẩn Ảnh 1) ── */}
                <footer className="contract-server-pagination" aria-label="Phân trang danh mục giấy tờ">
                  <span>
                    {displayTemplates.length === 0
                      ? '0 loại giấy tờ'
                      : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, displayTemplates.length)} / ${displayTemplates.length} loại giấy tờ`}
                  </span>
                  <div className="contract-server-pagination__controls">
                    <button
                      type="button"
                      className="contract-page-button"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(1)}
                      aria-label="Trang đầu"
                    >
                      «
                    </button>
                    <button
                      type="button"
                      className="contract-page-button"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Trang trước"
                    >
                      ‹
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`contract-page-button${currentPage === p ? ' contract-page-button--active' : ''}`}
                        onClick={() => setPage(p)}
                        aria-label={`Trang ${p}`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="contract-page-button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="Trang sau"
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      className="contract-page-button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage(totalPages)}
                      aria-label="Trang cuối"
                    >
                      »
                    </button>
                  </div>
                </footer>
              </section>
            </main>

            {/* ── MODALS ── */}
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

            <CatalogManageModal
              open={catalogModalConfig.open}
              targetType={catalogModalConfig.targetType}
              mode={catalogModalConfig.mode}
              item={catalogModalConfig.item}
              parentPackageId={catalogModalConfig.parentPackageId}
              packageList={packageTree}
              addToast={addToast}
              onClose={() => setCatalogModalConfig((prev) => ({ ...prev, open: false }))}
              onSuccess={load}
            />
          </div>
        </div>
      )}
    </div>
  )
}
