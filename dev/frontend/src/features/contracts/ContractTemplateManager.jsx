import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  FileText,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Archive,
  Download,
  Copy,
  X,
  ArrowLeft,
  Search,
  HelpCircle,
  Plus,
  FileCheck,
  Eye,
  ChevronDown,
} from 'lucide-react'
import { apiFetch, downloadFile } from '../../lib/api'
import { fetchProtectedDocumentFile } from '../../lib/fileSave'
import { useToast } from '../../contexts/ToastContext'
import FilePreviewModal from '../../components/ui/FilePreviewModal'
import './contractTemplateManager.css'

export default function ContractTemplateManager({ onClose }) {
  const { addToast } = useToast()

  // State
  const [groups, setGroups] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [mode, setMode] = useState('new') // 'new' | 'version' | 'retry'

  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [placeholders, setPlaceholders] = useState(null)
  const [placeholdersLoading, setPlaceholdersLoading] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState(null)

  // Form state
  const [file, setFile] = useState(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [publishImmediately, setPublishImmediately] = useState(true)

  // In-flight & abort refs
  const submitInFlight = useRef(false)
  const loadControllerRef = useRef(null)
  const previewUrlRef = useRef(null)

  // Load templates
  const loadTemplates = useCallback(async () => {
    if (loadControllerRef.current) {
      loadControllerRef.current.abort()
    }
    const controller = new AbortController()
    loadControllerRef.current = controller

    const listPath = `/api/contracts/templates/manage?${new URLSearchParams({
      status: statusFilter,
      q: searchQuery.trim(),
    })}`

    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch(listPath, { signal: controller.signal })
      if (!controller.signal.aborted) {
        setGroups(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err.message || 'Lỗi tải danh sách mẫu hợp đồng')
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [statusFilter, searchQuery])

  useEffect(() => {
    loadTemplates()
    return () => {
      if (loadControllerRef.current) {
        loadControllerRef.current.abort()
      }
    }
  }, [loadTemplates])

  useEffect(() => () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [])

  // Open modal helpers
  const openNewModal = () => {
    setMode('new')
    setSelectedVersion(null)
    setSelectedGroup(null)
    setCode('')
    setName('')
    setDescription('')
    setFile(null)
    setPublishImmediately(true)
    setUploadModalOpen(true)
  }

  const openUpgradeModal = (version, group) => {
    setMode('version')
    setSelectedVersion(version)
    setSelectedGroup(group)
    setCode(version?.code || '')
    setName('') // blank to inherit
    setDescription('')
    setFile(null)
    setPublishImmediately(true)
    setUploadModalOpen(true)
  }

  const openRetryModal = (version, group) => {
    setMode('retry')
    setSelectedVersion(version)
    setSelectedGroup(group)
    setCode(version?.code || '')
    setFile(null)
    setUploadModalOpen(true)
  }

  // Submit upload/upgrade/retry
  const submitUpload = async (event) => {
    event.preventDefault()
    if (submitInFlight.current || !file) return

    if (!file.name.toLowerCase().endsWith('.docx') || file.size > 20 * 1024 * 1024) {
      addToast('Chọn tệp DOCX không quá 20 MiB', 'error')
      return
    }

    if (mode === 'new') {
      const trimmedCode = code.trim().toUpperCase()
      if (!/^[A-Z0-9_]{3,50}$/.test(trimmedCode)) {
        addToast('Mã mẫu phải gồm 3-50 ký tự (chữ hoa, số, gạch dưới)', 'error')
        return
      }
      if (!name.trim()) {
        addToast('Vui lòng nhập tên mẫu', 'error')
        return
      }
    }

    const payload = new FormData()
    payload.append('file', file)
    if (mode !== 'retry') {
      payload.append('name', name.trim())
      payload.append('description', description.trim())
      payload.append('publish_immediately', String(publishImmediately))
      if (mode === 'new') {
        payload.append('code', code.trim().toUpperCase())
      }
    }

    const path =
      mode === 'new'
        ? '/api/contracts/templates/upload'
        : `/api/contracts/templates/${selectedVersion?.id}/${mode === 'retry' ? 'retry-upload' : 'versions'}`

    submitInFlight.current = true
    setSubmitting(true)
    try {
      const result = await apiFetch(path, { method: 'POST', body: payload, timeout: 60000 })
      addToast(
        result?.publication_skipped
          ? 'Tệp đã sẵn sàng ở bản nháp vì có phiên bản mới hơn đang ban hành'
          : 'Đã lưu mẫu hợp đồng',
        'success',
      )
      setUploadModalOpen(false)
      setFile(null)
      setCode('')
      setName('')
      setDescription('')
    } catch (err) {
      addToast(
        err.message || 'Không thể hoàn tất tải mẫu; kiểm tra phiên bản trong danh sách',
        'error',
      )
    } finally {
      submitInFlight.current = false
      setSubmitting(false)
      await loadTemplates()
    }
  }

  // Handle status update (publish or archive)
  const handleStatusUpdate = async (version, targetStatus) => {
    try {
      setActionLoadingId(`status-${version.id}`)
      await apiFetch(`/api/contracts/templates/${version.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: targetStatus }),
      })
      addToast('Đã cập nhật trạng thái phiên bản', 'success')
      await loadTemplates()
    } catch (err) {
      addToast(err.message || 'Không thể cập nhật trạng thái', 'error')
    } finally {
      setActionLoadingId(null)
    }
  }

  // Handle download
  const handleDownload = async (version) => {
    try {
      setActionLoadingId(`download-${version.id}`)
      await downloadFile(
        `/api/contracts/templates/${version.id}/download`,
        version.template_file_name || `${version.code}_v${version.version}.docx`,
      )
    } catch (err) {
      addToast(err.message || 'Không thể tải tệp mẫu', 'error')
    } finally {
      setActionLoadingId(null)
    }
  }

  const closePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreview(null)
  }, [])

  const handlePreview = async (version) => {
    if (version.upload_state !== 'ready') return

    try {
      setActionLoadingId(`preview-${version.id}`)
      const result = await fetchProtectedDocumentFile(`/api/contracts/templates/${version.id}/download`)
      if (!result?.blob || result.blob.size <= 0) {
        throw new Error('Tệp Word rỗng, không thể xem trước')
      }

      const objectUrl = URL.createObjectURL(result.blob)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = objectUrl
      setPreview({
        url: objectUrl,
        blob: result.blob,
        fileName: result.fileName || version.template_file_name || `${version.code}_v${version.version}.docx`,
        mimeType: result.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    } catch (err) {
      addToast(err.message || 'Không thể xem trước tệp mẫu', 'error')
    } finally {
      setActionLoadingId(null)
    }
  }

  // Lazy fetch placeholders for drawer
  const openCheatSheet = async () => {
    setCheatSheetOpen(true)
    if (!placeholders && !placeholdersLoading) {
      setPlaceholdersLoading(true)
      try {
        const data = await apiFetch('/api/contracts/templates/placeholders')
        setPlaceholders(Array.isArray(data) ? data : [])
      } catch (err) {
        addToast(err.message || 'Lỗi tải danh mục placeholder', 'error')
      } finally {
        setPlaceholdersLoading(false)
      }
    }
  }

  const handleCopyPlaceholder = async (placeholder) => {
    const textToCopy = `{{${placeholder}}}`
    try {
      await navigator.clipboard.writeText(textToCopy)
      addToast(`Đã sao chép ${textToCopy}`, 'success')
    } catch {
      addToast('Không thể sao chép vào bộ nhớ tạm', 'error')
    }
  }

  return (
    <div className="contract-template-manager">
      {/* Top Header */}
      <header className="ctm-header">
        <div className="ctm-header-left">
          {onClose && (
            <button
              type="button"
              className="ctm-btn ctm-btn-ghost ctm-btn-back"
              onClick={onClose}
              aria-label="Quay lại danh sách"
            >
              <ArrowLeft size={18} />
              <span>Quay lại</span>
            </button>
          )}
          <div className="ctm-header-titles">
            <h1 className="ctm-title">Quản lý mẫu hợp đồng</h1>
            <p className="ctm-subtitle">
              Quản lý tài liệu Word mẫu DOCX, kiểm soát các phiên bản và ban hành hợp đồng
            </p>
          </div>
        </div>

        <div className="ctm-header-actions">
          <button
            type="button"
            className="ctm-btn ctm-btn-secondary"
            onClick={openCheatSheet}
            aria-label="Tra cứu placeholder"
          >
            <HelpCircle size={16} />
            <span>Tra cứu placeholder</span>
          </button>
          <button
            type="button"
            className="ctm-btn ctm-btn-primary"
            onClick={openNewModal}
            aria-label="Thêm mẫu mới"
          >
            <Plus size={16} />
            <span>Thêm mẫu mới</span>
          </button>
        </div>
      </header>

      {/* Filter and Search Bar */}
      <div className="ctm-filter-bar">
        <div className="ctm-search-box">
          <Search size={18} className="ctm-search-icon" />
          <input
            type="search"
            role="searchbox"
            aria-label="Tìm kiếm"
            className="ctm-search-input"
            placeholder="Tìm theo mã hoặc tên mẫu hợp đồng..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="ctm-filter-group">
          <label htmlFor="ctm-status-select" className="ctm-filter-label">
            Trạng thái
          </label>
          <div className="ctm-select-wrap">
            <select
              id="ctm-status-select"
              name="status"
              aria-label="Trạng thái"
              className="ctm-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="published">Đang ban hành</option>
              <option value="draft">Bản nháp</option>
              <option value="archived">Đã lưu trữ</option>
            </select>
            <ChevronDown className="ctm-select-arrow" size={15} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Main List Area */}
      <main className="ctm-content">
        {loading && (
          <div className="ctm-state-box ctm-state-loading">
            <RefreshCw size={28} className="ctm-spin" />
            <p>Đang tải danh sách mẫu hợp đồng...</p>
          </div>
        )}

        {!loading && error && (
          <div className="ctm-state-box ctm-state-error">
            <AlertCircle size={28} />
            <p>{error}</p>
            <button
              type="button"
              className="ctm-btn ctm-btn-secondary"
              onClick={loadTemplates}
              aria-label="Thử lại"
            >
              Thử lại
            </button>
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
          <div className="ctm-state-box ctm-state-empty">
            <FileText size={36} />
            <h3>Chưa có mẫu hợp đồng nào</h3>
            <p>Bắt đầu bằng cách thêm mẫu hợp đồng Word (.docx) đầu tiên vào hệ thống.</p>
            <button
              type="button"
              className="ctm-btn ctm-btn-primary"
              onClick={openNewModal}
            >
              <Plus size={16} />
              <span>Tạo mẫu ngay</span>
            </button>
          </div>
        )}

        {!loading && !error && groups.length > 0 && (
          <div className="ctm-group-list">
            {groups.map((group) => {
              const active = group.active_template
              const latest = group.display_template || group.versions?.[0]

              return (
                <section key={group.code} className="ctm-group-card" aria-labelledby={`group-${group.code}`}>
                  <header className="ctm-group-card-header">
                    <div className="ctm-group-info">
                      <div className="ctm-group-title-row">
                        <span className="ctm-group-code">{group.code}</span>
                        <h2 id={`group-${group.code}`} className="ctm-group-name">
                          {group.name}
                        </h2>
                      </div>
                      <div className="ctm-group-meta">
                        <span className="ctm-meta-badge">
                          Phiên bản mới nhất: <strong>v{group.latest_version}</strong>
                        </span>
                        {active ? (
                          <span className="ctm-meta-badge ctm-meta-published">
                            <CheckCircle2 size={13} />
                            <span>Đang ban hành: v{active.version}</span>
                          </span>
                        ) : (
                          <span className="ctm-meta-badge ctm-meta-unpublished">
                            <Clock size={13} />
                            <span>Chưa có bản ban hành</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="ctm-group-actions">
                      <button
                        type="button"
                        className="ctm-btn ctm-btn-secondary ctm-btn-sm"
                        onClick={() => openUpgradeModal(active || latest, group)}
                        aria-label={`Nâng cấp từ v${(active || latest)?.version}`}
                      >
                        <Plus size={14} />
                        <span>Nâng cấp từ v{(active || latest)?.version}</span>
                      </button>
                    </div>
                  </header>

                  <div className="ctm-table-wrapper">
                    <table className="ctm-table">
                      <thead>
                        <tr>
                          <th className="ctm-col-version">Phiên bản</th>
                          <th className="ctm-col-name">Tên & Mô tả</th>
                          <th className="ctm-col-file">Tệp mẫu</th>
                          <th className="ctm-col-upload">Tải lên</th>
                          <th className="ctm-col-status">Trạng thái</th>
                          <th className="ctm-col-creator">Người tạo</th>
                          <th className="ctm-col-actions">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.versions?.map((ver) => {
                          const isReady = ver.upload_state === 'ready'
                          const isFailed = ver.upload_state === 'failed'
                          const isPending = ver.upload_state === 'pending'
                          const isPublished = ver.status === 'published'

                          return (
                            <tr
                              key={ver.id}
                              className={`ctm-row ${isPublished ? 'ctm-row-published' : ''}`}
                            >
                              <td className="ctm-cell-version">
                                <span className="ctm-version-tag">v{ver.version}</span>
                              </td>
                              <td className="ctm-cell-name">
                                <div className="ctm-version-title">{ver.name}</div>
                                {ver.description && (
                                  <div className="ctm-version-desc">{ver.description}</div>
                                )}
                              </td>
                              <td className="ctm-cell-file">
                                <span className="ctm-file-name" title={ver.template_file_name}>
                                  {ver.template_file_name || '—'}
                                </span>
                              </td>
                              <td className="ctm-cell-upload">
                                {isReady && (
                                  <span className="ctm-badge ctm-badge-ready">Sẵn sàng</span>
                                )}
                                {isPending && (
                                  <span className="ctm-badge ctm-badge-pending">Chưa hoàn tất</span>
                                )}
                                {isFailed && (
                                  <span className="ctm-badge ctm-badge-failed">Tải lên thất bại</span>
                                )}
                              </td>
                              <td className="ctm-cell-status">
                                {isPublished && (
                                  <span className="ctm-badge ctm-badge-published">
                                    Đang ban hành
                                  </span>
                                )}
                                {ver.status === 'draft' && (
                                  <span className="ctm-badge ctm-badge-draft">Bản nháp</span>
                                )}
                                {ver.status === 'archived' && (
                                  <span className="ctm-badge ctm-badge-archived">Lưu trữ</span>
                                )}
                              </td>
                              <td className="ctm-cell-creator">
                                <div>{ver.created_by_name || '—'}</div>
                                {ver.created_at && (
                                  <small className="ctm-date">
                                    {new Date(ver.created_at).toLocaleDateString('vi-VN')}
                                  </small>
                                )}
                              </td>
                              <td className="ctm-cell-actions">
                                <div className="ctm-action-buttons">
                                  {/* Download DOCX button */}
                                  {/* Preview DOCX button */}
                                  <button
                                    type="button"
                                    className="ctm-btn-icon"
                                    disabled={!isReady || actionLoadingId === `preview-${ver.id}`}
                                    onClick={() => handlePreview(ver)}
                                    title={
                                      isReady
                                        ? `Xem trước DOCX v${ver.version}`
                                        : 'Tệp chưa sẵn sàng để xem trước'
                                    }
                                    aria-label={`Xem trước v${ver.version}`}
                                  >
                                    {actionLoadingId === `preview-${ver.id}` ? (
                                      <RefreshCw size={15} className="ctm-spin" />
                                    ) : (
                                      <Eye size={15} />
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    className="ctm-btn-icon"
                                    disabled={!isReady || actionLoadingId === `download-${ver.id}`}
                                    onClick={() => handleDownload(ver)}
                                    title={
                                      isReady
                                        ? `Tải file DOCX v${ver.version}`
                                        : 'Tệp chưa sẵn sàng để tải xuống'
                                    }
                                    aria-label={`Tải file DOCX v${ver.version}`}
                                  >
                                    <Download size={15} />
                                  </button>

                                  {/* Retry failed upload */}
                                  {ver.can_retry && (
                                    <button
                                      type="button"
                                      className="ctm-btn ctm-btn-warning ctm-btn-xs"
                                      onClick={() => openRetryModal(ver, group)}
                                      aria-label={`Thử tải lại cùng tệp v${ver.version}`}
                                    >
                                      <RefreshCw size={13} />
                                      <span>Thử tải lại cùng tệp v{ver.version}</span>
                                    </button>
                                  )}

                                  {/* Publish action */}
                                  {isReady && ver.status !== 'published' && (
                                    <button
                                      type="button"
                                      className="ctm-btn ctm-btn-success ctm-btn-xs"
                                      disabled={actionLoadingId === `status-${ver.id}`}
                                      onClick={() => handleStatusUpdate(ver, 'published')}
                                      aria-label={`Ban hành v${ver.version}`}
                                    >
                                      <FileCheck size={13} />
                                      <span>Ban hành v{ver.version}</span>
                                    </button>
                                  )}

                                  {/* Archive action */}
                                  {isReady && isPublished && (
                                    <button
                                      type="button"
                                      className="ctm-btn ctm-btn-archive ctm-btn-xs"
                                      disabled={actionLoadingId === `status-${ver.id}`}
                                      onClick={() => handleStatusUpdate(ver, 'archived')}
                                      aria-label={`Lưu trữ v${ver.version}`}
                                    >
                                      <Archive size={13} />
                                      <span>Lưu trữ v{ver.version}</span>
                                    </button>
                                  )}

                                  {/* New version from this row */}
                                  <button
                                    type="button"
                                    className="ctm-btn-icon"
                                    onClick={() => openUpgradeModal(ver, group)}
                                    title={`Nâng cấp từ v${ver.version}`}
                                    aria-label={`Nâng cấp từ v${ver.version}`}
                                  >
                                    <Plus size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </main>

      {/* Upload/Upgrade/Retry Modal */}
      {uploadModalOpen && (
        <div className="ctm-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ctm-modal">
            <header className="ctm-modal-header">
              <h3 className="ctm-modal-title">
                {mode === 'new' && 'Thêm mẫu hợp đồng mới'}
                {mode === 'version' && `Nâng cấp phiên bản cho ${selectedVersion?.code || selectedGroup?.code}`}
                {mode === 'retry' && `Thử tải lại tệp cho v${selectedVersion?.version} (${selectedVersion?.code})`}
              </h3>
              <button
                type="button"
                className="ctm-modal-close"
                onClick={() => !submitting && setUploadModalOpen(false)}
                aria-label="Đóng cửa sổ"
                disabled={submitting}
              >
                <X size={18} />
              </button>
            </header>

            <form onSubmit={submitUpload} noValidate className="ctm-modal-form">
              {mode === 'retry' && (
                <div className="ctm-notice-box">
                  <p>
                    <strong>Tệp ban đầu:</strong> {selectedVersion?.template_file_name}
                  </p>
                  <p>
                    Lựa chọn ban hành ban đầu sẽ được giữ nguyên. Tệp tải lên phải có cùng nội dung đã chuẩn bị cho phiên bản này.
                  </p>
                </div>
              )}

              {mode === 'new' && (
                <div className="ctm-form-field">
                  <label htmlFor="ctm-input-code" className="ctm-label">
                    Mã mẫu <span className="ctm-required">*</span>
                  </label>
                  <input
                    id="ctm-input-code"
                    type="text"
                    className="ctm-input ctm-input-code"
                    placeholder="VD: HD_DO_VE_2026"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    disabled={submitting}
                  />
                  <small className="ctm-field-hint">
                    3-50 ký tự in hoa, chữ số hoặc dấu gạch dưới (VD: HOP_DONG_DICH_VU).
                  </small>
                </div>
              )}

              {mode !== 'retry' && (
                <div className="ctm-form-field">
                  <label htmlFor="ctm-input-name" className="ctm-label">
                    Tên mẫu {mode === 'new' && <span className="ctm-required">*</span>}
                  </label>
                  <input
                    id="ctm-input-name"
                    type="text"
                    className="ctm-input"
                    placeholder={
                      mode === 'version'
                        ? 'Để trống để kế thừa tên hiện tại'
                        : 'VD: Hợp đồng dịch vụ đo đạc địa chính'
                    }
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              )}

              {mode !== 'retry' && (
                <div className="ctm-form-field">
                  <label htmlFor="ctm-input-desc" className="ctm-label">
                    Mô tả
                  </label>
                  <textarea
                    id="ctm-input-desc"
                    className="ctm-textarea"
                    rows={2}
                    placeholder="Ghi chú các điều khoản, đối tượng áp dụng hoặc thay đổi..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              )}

              <div className="ctm-form-field">
                <label htmlFor="ctm-input-file" className="ctm-label">
                  Tệp DOCX <span className="ctm-required">*</span>
                </label>
                <input
                  id="ctm-input-file"
                  type="file"
                  className="ctm-file-input"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  disabled={submitting}
                />
                <small className="ctm-field-hint">
                  Định dạng Word (.docx), kích thước tối đa 20 MiB.
                </small>
              </div>

              {mode !== 'retry' && (
                <div className="ctm-form-field-checkbox">
                  <label className="ctm-checkbox-label">
                    <input
                      type="checkbox"
                      checked={publishImmediately}
                      onChange={(e) => setPublishImmediately(e.target.checked)}
                      disabled={submitting}
                    />
                    <span>Ban hành ngay sau khi tải lên</span>
                  </label>
                  <small className="ctm-field-hint">
                    Nếu có phiên bản mới hơn đã ban hành, bản này sẽ được lưu ở dạng nháp.
                  </small>
                </div>
              )}

              <footer className="ctm-modal-footer">
                <button
                  type="button"
                  className="ctm-btn ctm-btn-ghost"
                  onClick={() => setUploadModalOpen(false)}
                  disabled={submitting}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="ctm-btn ctm-btn-primary"
                  disabled={submitting}
                  aria-label="Tải lên và lưu"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={15} className="ctm-spin" />
                      <span>Đang xử lý...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={15} />
                      <span>Tải lên và lưu</span>
                    </>
                  )}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      <FilePreviewModal
        open={Boolean(preview)}
        onClose={closePreview}
        fileName={preview?.fileName || ''}
        mimeType={preview?.mimeType || ''}
        url={preview?.url || ''}
        blob={preview?.blob || null}
      />

      {/* Placeholder Drawer / Cheat Sheet */}
      {cheatSheetOpen && (
        <aside className="ctm-drawer-backdrop" role="dialog" aria-modal="true">
          <div className="ctm-drawer">
            <header className="ctm-drawer-header">
              <div className="ctm-drawer-title-row">
                <FileText size={20} />
                <h3 className="ctm-drawer-title">Ký hiệu thay thế (Placeholders)</h3>
              </div>
              <button
                type="button"
                className="ctm-modal-close"
                onClick={() => setCheatSheetOpen(false)}
                aria-label="Đóng bảng tra cứu"
              >
                <X size={18} />
              </button>
            </header>

            <div className="ctm-drawer-body">
              <div className="ctm-drawer-intro">
                <p>
                  Sử dụng các ký hiệu thay thế dưới đây trong tệp Word mẫu (DOCX). Khi hệ thống tạo hợp đồng, các ký hiệu này sẽ được tự động điền dữ liệu thực tế.
                </p>
                <div className="ctm-scope-note">
                  <CheckCircle2 size={16} />
                  <span>
                    Hệ thống hỗ trợ thay thế placeholder trong các đoạn văn bản (paragraph) và bảng biểu (table).
                  </span>
                </div>
                <div className="ctm-caveat-note">
                  <AlertCircle size={16} />
                  <span>
                    Header, Footer hoặc Textbox hiện chưa được hỗ trợ thay thế tự động.
                  </span>
                </div>
                <div className="ctm-field-caveat">
                  <small>
                    Lưu ý: Các trường email, id_card_*, representative_* chưa được hỗ trợ trong phiên bản hiện tại. Địa chỉ dịch vụ dùng {'{{address}}'}, địa chỉ khách hàng dùng {'{{customer_address}}'}.
                  </small>
                </div>
              </div>

              {placeholdersLoading && (
                <div className="ctm-state-box ctm-state-loading">
                  <RefreshCw size={24} className="ctm-spin" />
                  <p>Đang tải danh mục ký hiệu...</p>
                </div>
              )}

              {!placeholdersLoading && placeholders && (
                <div className="ctm-placeholder-categories">
                  {placeholders.map((cat) => (
                    <section key={cat.category} className="ctm-placeholder-category">
                      <h4 className="ctm-category-name">{cat.category}</h4>
                      <div className="ctm-placeholder-list">
                        {cat.items?.map((item) => (
                          <div key={item.placeholder} className="ctm-placeholder-card">
                            <div className="ctm-ph-top">
                              <code className="ctm-ph-code">{`{{${item.placeholder}}}`}</code>
                              <button
                                type="button"
                                className="ctm-btn ctm-btn-ghost ctm-btn-copy"
                                onClick={() => handleCopyPlaceholder(item.placeholder)}
                                aria-label={`Sao chép {{${item.placeholder}}}`}
                              >
                                <Copy size={13} />
                                <span>Sao chép</span>
                              </button>
                            </div>
                            <div className="ctm-ph-details">
                              <span className="ctm-ph-label">{item.label}</span>
                              {item.example && (
                                <span className="ctm-ph-example">
                                  Ví dụ: <em>{item.example}</em>
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
