import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  FileCode,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Plus,
  Upload,
  X,
} from 'lucide-react'

import ChecklistDocumentTypePicker from './ChecklistDocumentTypePicker'
import { documentCounter, mergeDocumentVerdicts } from './nodeWorkFormat'

const SOURCE_LABELS = {
  KHACH_HANG: 'Khách hàng cung cấp',
  CONG_TY: 'Công ty soạn',
  CO_QUAN: 'Pháp lý',
}

const RUNTIME_STATUS_LABELS = {
  draft: 'Chưa nộp',
  pending_review: 'Chờ duyệt',
  approved: 'Đạt',
  rejected: 'Bị từ chối',
}

const EDITABLE_NODE_STATUSES = new Set(['ready', 'in_progress', 'rework_required'])

const renderDocIcon = (name = '') => {
  const lower = name.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'svg'].some(ext => lower.endsWith('.' + ext))) {
    return <ImageIcon size={16} className="eiw-doc__type-icon is-image" />
  }
  if (['dwg', 'dxf', 'dgn'].some(ext => lower.endsWith('.' + ext))) {
    return <FileCode size={16} className="eiw-doc__type-icon is-cad" />
  }
  if (['xlsx', 'xls', 'csv'].some(ext => lower.endsWith('.' + ext))) {
    return <FileSpreadsheet size={16} className="eiw-doc__type-icon is-sheet" />
  }
  if (['pdf'].some(ext => lower.endsWith('.' + ext))) {
    return <FileText size={16} className="eiw-doc__type-icon is-pdf" />
  }
  return <FileText size={16} className="eiw-doc__type-icon is-doc" />
}

// Nhãn cho trình đọc màn hình mà không phá bố cục đã duyệt. Nút tải lên chỉ có
// icon; tên "Tải lên <tờ>" nằm trong span ẩn này để nút có tên truy cập đúng tờ,
// còn ô <input> nhận aria-label riêng — hai thứ không đè danh tính lên nhau.
const SR_ONLY = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

export default function NodeOutputList({
  checklistItem,
  ...props
}) {
  const hasRuntimeTypes = Object.prototype.hasOwnProperty.call(checklistItem || {}, 'document_types')
  if (hasRuntimeTypes) {
    return <RuntimeNodeOutputList checklistItem={checklistItem} {...props} />
  }
  return <LegacyNodeOutputList checklistItem={checklistItem} {...props} />
}

function RuntimeNodeOutputList({
  checklistItem,
  nodeStatus,
  taskNodeId,
  canPropose = false,
  defaultOpen = true,
  onOpenDocument,
  onUploadDocument,
  onDeleteDocument,
  onChanged,
  addToast,
}) {
  const [collapsed, setCollapsed] = useState(!defaultOpen)
  const [adding, setAdding] = useState(false)
  const [expandedTypeIds, setExpandedTypeIds] = useState(() => new Set())
  const [uploadingId, setUploadingId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [changeDialog, setChangeDialog] = useState(null)
  const [dialogReason, setDialogReason] = useState('')
  const pendingUploadReasons = useRef({})
  const inputRefs = useRef({})
  const [types, setTypes] = useState(() => checklistItem?.document_types || [])

  useEffect(() => {
    setTypes(checklistItem?.document_types || [])
  }, [checklistItem?.document_types])

  const isPaperless = types.length === 0
  const isPaperlessApproved = isPaperless && (
    checklistItem?.status === 'approved' || checklistItem?.status === 'late_approved'
  )
  const isPaperlessSubmitted = isPaperless && (
    checklistItem?.status === 'pending_approval'
    || checklistItem?.status === 'late_pending_approval'
    || isPaperlessApproved
  )
  const isPaperlessRejected = isPaperless && checklistItem?.status === 'failed'

  const approved = types.filter(type => type.status === 'approved').length
  const hasRejections = types.some(type => (
    type.status === 'rejected' || Boolean(type.rejection_reason)
  )) || isPaperlessRejected
  const allApproved = isPaperless ? isPaperlessApproved : (types.length > 0 && approved === types.length)
  const overallState = hasRejections ? 'rejected' : allApproved ? 'valid' : isPaperlessSubmitted ? 'valid' : 'pending'
  const canEdit = EDITABLE_NODE_STATUSES.has(nodeStatus)


  const toggleType = (typeId) => {
    setExpandedTypeIds(current => {
      const next = new Set(current)
      if (next.has(typeId)) next.delete(typeId)
      else next.add(typeId)
      return next
    })
  }

  const uploadFiles = async (type, fileList, requiresReason = false) => {
    const files = Array.from(fileList || [])
    if (files.length === 0 || !onUploadDocument) return
    const changeReason = String(pendingUploadReasons.current[type.id] || '').trim()
    if (requiresReason && !changeReason) return
    setUploadingId(type.id)
    try {
      const uploaded = await onUploadDocument({
        typeId: type.id,
        files,
        ...(changeReason ? { changeReason } : {}),
      })
      if (Array.isArray(uploaded) && uploaded.length > 0) {
        setTypes(current => current.map(candidate => {
          if (candidate.id !== type.id) return candidate
          const existingIds = new Set(
            (candidate.files || []).map(file => file.document_id || file.id).filter(Boolean),
          )
          const newFiles = uploaded
            .filter(file => !existingIds.has(file.document_id || file.id))
            .map(file => ({
              ...file,
              status: file.review_status || 'draft',
            }))
          const finalCount = Number(uploaded.at(-1)?.file_count)
          return {
            ...candidate,
            status: 'draft',
            files: [...(candidate.files || []), ...newFiles],
            file_count: Number.isFinite(finalCount)
              ? finalCount
              : (candidate.files || []).length + newFiles.length,
          }
        }))
      }
      delete pendingUploadReasons.current[type.id]
    } finally {
      setUploadingId('')
    }
  }

  const deleteFile = async (type, file, changeReason = '') => {
    if (!file?.document_id || !onDeleteDocument) return
    const key = `${type.id}:${file.document_id}`
    setDeletingId(key)
    const prevTypes = types
    const targetDocId = file.document_id || file.id
    // Optimistic removal: remove file from UI immediately in 0ms!
    setTypes(current => current.map(candidate => {
      if (candidate.id !== type.id) return candidate
      const remainingFiles = (candidate.files || []).filter(f => (f.document_id || f.id) !== targetDocId)
      return {
        ...candidate,
        files: remainingFiles,
        file_count: Math.max(0, (candidate.file_count || 1) - 1),
      }
    }))
    try {
      await onDeleteDocument({
        typeId: type.id,
        documentId: file.document_id,
        ...(changeReason ? { changeReason } : {}),
      })
    } catch (err) {
      setTypes(prevTypes)
      throw err
    } finally {
      setDeletingId('')
    }
  }

  return (
    <section className="eiw-docs" aria-label={`Checklist ${checklistItem?.name || ''}`}>
      <div className={`eiw-checklist-item-card ${hasRejections ? 'is-rejected' : ''}`} id={`checklist-item-${checklistItem?.id || 'main'}`}>
        <div className="eiw-checklist-item-head">
          <div className="eiw-checklist-item-head__left">
            <div
              className={`eiw-checklist-status-icon is-${overallState}`}
              title={isPaperless ? 'Nhiệm vụ không yêu cầu giấy' : `${types.length} loại giấy`}
            >
              {isPaperless ? (isPaperlessApproved ? '✓' : isPaperlessSubmitted ? '…' : '!') : types.length}
            </div>
            <div className="eiw-checklist-item-info">
              <div className="eiw-checklist-item-title-row">
                <h3>{checklistItem?.name || 'Checklist'}</h3>
                <span className={`eiw-checklist-badge is-${overallState}`}>
                  {hasRejections && <AlertTriangle size={12} />}
                  {allApproved
                    ? 'Hoàn tất'
                    : hasRejections
                      ? 'Cần sửa'
                      : isPaperlessSubmitted
                        ? 'Chờ duyệt'
                        : 'Chờ xử lý'}
                </span>
              </div>
              <div className="eiw-checklist-item-meta">
                {isPaperless ? (
                  <span className="eiw-docs__count"><i>Không yêu cầu loại giấy</i></span>
                ) : (
                  <span className="eiw-docs__count"><b>{approved}/{types.length}</b><i>loại đạt</i></span>
                )}
                {checklistItem?.note && <span> • <span>{checklistItem.note}</span></span>}
              </div>
            </div>
          </div>
          <div className="eiw-checklist-item-head__right">
            {canPropose && canEdit && (
              <button
                type="button"
                className="eiw-docs__add eiw-checklist-add-doc-btn"
                onClick={() => setAdding(value => !value)}
                aria-expanded={adding}
              >
                <Plus size={14} /> <span>Thêm loại giấy</span>
              </button>
            )}
            <button
              type="button"
              className="eiw-checklist-collapse-btn"
              onClick={() => setCollapsed(value => !value)}
              title={collapsed ? 'Mở checklist' : 'Thu gọn checklist'}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            {adding && (
              <ChecklistDocumentTypePicker
                taskNodeId={taskNodeId}
                checklistResultId={checklistItem?.id}
                addToast={addToast}
                onClose={() => setAdding(false)}
                onAdded={(created) => {
                  setAdding(false)
                  if (created?.id) {
                    setTypes(current => {
                      if (current.some(t => t.id === created.id)) return current
                      return [...current, { ...created, files: created.files || [], file_count: created.file_count || 0, status: created.status || 'draft' }]
                    })
                  }
                  onChanged?.()
                }}
              />
            )}
            <div className="eiw-docs__scroll">
              {types.length === 0 && (
                isPaperlessSubmitted ? (
                  <div className="eiw-paperless-box is-submitted" data-testid="paperless-submitted-box">
                    <div className="eiw-paperless-box__header">
                      <CheckCircle2 size={16} className="text-success" />
                      <strong>Đã nộp checklist hoàn thành</strong>
                      <span className={`eiw-checklist-badge ${isPaperlessApproved ? 'is-valid' : 'is-pending'}`}>
                        {isPaperlessApproved ? 'Đã duyệt' : 'Chờ duyệt'}
                      </span>
                    </div>
                    {checklistItem?.note && (
                      <p className="eiw-paperless-box__note">
                        <b>Lý do / Ghi chú:</b> {checklistItem.note}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="eiw-paperless-box is-pending" data-testid="paperless-info-box">
                    <p className="eiw-paperless-box__desc">
                      Checklist này chưa có loại giấy nào. Khi nộp nghiệm thu hệ thống sẽ yêu cầu nhập lý do.
                    </p>
                  </div>
                )
              )}
              {types.map(type => {
                const files = type.files || []
                const fileCount = Number.isFinite(Number(type.file_count))
                  ? Number(type.file_count)
                  : files.length
                const expanded = expandedTypeIds.has(type.id)
                const editableType = canEdit && type.status !== 'pending_review'
                const removableType = canEdit && type.status !== 'pending_review'
                const requiresChangeReason = type.status === 'approved'
                const awaitingResubmission = type.status === 'draft' && Boolean(type.rejection_reason)
                const typeStatusLabel = awaitingResubmission
                  ? 'Đã cập nhật — nộp lại'
                  : RUNTIME_STATUS_LABELS[type.status] || type.status
                return (
                  <article
                    className={`eiw-doc eiw-document-type is-${type.status}${awaitingResubmission ? ' is-rework' : ''}`}
                    key={type.id}
                    id={`checklist-doc-${type.id}`}
                  >
                    <div className="eiw-doc__row">
                      <div className="eiw-doc__info-col">
                        <div className="eiw-doc__icon-box">{renderDocIcon(files[0]?.file_name || type.name)}</div>
                        <div className="eiw-doc__text-box">
                          <div className="eiw-doc__name-row">
                            <span className="eiw-doc__name">{type.name}</span>
                            <span className={`eiw-doc__source is-${String(type.source || '').toLowerCase()}`}>
                              {type.source_label || SOURCE_LABELS[type.source] || type.source}
                            </span>
                            <span className={`eiw-doc__badge eiw-doc__badge--${type.status}`}>
                              {type.status === 'approved' && <Check size={11} />}
                              {type.status === 'rejected' && <AlertTriangle size={11} />}
                              {typeStatusLabel}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="eiw-doc__actions">
                        <button
                          type="button"
                          className="eiw-doc__files-toggle"
                          onClick={() => toggleType(type.id)}
                          aria-expanded={expanded}
                          aria-label={`Xem ${fileCount} file của ${type.name}`}
                        >
                          <FileText size={14} />
                          <span className="eiw-doc__file-count-badge">{fileCount}</span>
                        </button>
                        {editableType && onUploadDocument && (
                          <>
                            <input
                              type="file"
                              multiple
                              className="eiw-doc__file-input"
                              style={SR_ONLY}
                              ref={element => { inputRefs.current[type.id] = element }}
                              aria-label={`Tải file cho ${type.name}`}
                              disabled={uploadingId === type.id}
                              onChange={event => {
                                // FileList là đối tượng sống: reset input có thể làm rỗng
                                // chính FileList đó. Phải chụp thành mảng trước khi reset.
                                const selectedFiles = Array.from(event.target.files || [])
                                event.target.value = ''
                                uploadFiles(type, selectedFiles, requiresChangeReason)
                              }}
                            />
                            <button
                              type="button"
                              className="eiw-doc__upload-btn"
                              disabled={uploadingId === type.id}
                              onClick={() => {
                                if (requiresChangeReason) {
                                  setDialogReason('')
                                  setChangeDialog({ action: 'upload', type })
                                }
                                else inputRefs.current[type.id]?.click()
                              }}
                              aria-label={requiresChangeReason
                                ? `Tải thêm file cho ${type.name}`
                                : `Chọn file cho ${type.name}`}
                              title="Tải thêm hoặc thay file"
                            >
                              <Upload size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {type.rejection_reason && (
                      <div className="eiw-doc__reason">
                        <b>{type.status === 'rejected' ? 'Lý do không đạt' : 'Ghi chú Giám đốc'}</b>
                        <span>{type.rejection_reason}</span>
                      </div>
                    )}

                    {expanded && (
                      <ul className="eiw-document-type__files" aria-label={`File của ${type.name}`}>
                        {files.length === 0 ? (
                          <li className="is-empty">Chưa có file hoặc ảnh.</li>
                        ) : files.map(file => {
                          const deleteKey = `${type.id}:${file.document_id}`
                          return (
                          <li
                            className="is-attached"
                            key={file.document_id || file.id || file.file_name}
                          >
                            <span className="eiw-document-type__file-icon">{renderDocIcon(file.file_name)}</span>
                            <span className="eiw-document-type__file-main">
                              <span>{file.file_name || file.name || 'Tệp không tên'}</span>
                              {file.change_reason && <small>Lý do bổ sung: {file.change_reason}</small>}
                            </span>
                            <button
                              type="button"
                              onClick={() => onOpenDocument?.({ ...file, name: type.name })}
                              aria-label={`Mở ${file.file_name || file.name || type.name}`}
                            >
                              <Eye size={13} /> Xem
                            </button>
                            {removableType && onDeleteDocument && file.document_id && (
                              <button
                                type="button"
                                className="eiw-document-type__file-delete"
                                disabled={deletingId === deleteKey}
                                onClick={() => {
                                  if (requiresChangeReason) {
                                    setDialogReason('')
                                    setChangeDialog({ action: 'delete', type, file })
                                  } else {
                                    deleteFile(type, file)
                                  }
                                }}
                                aria-label={`Xóa ${file.file_name || file.name || type.name}`}
                                title="Gỡ file để tải lại"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </li>
                          )
                        })}
                      </ul>
                    )}
                  </article>
                )
              })}
            </div>
          </>
        )}
      </div>
      {changeDialog && (
        <div className="eiw-change-dialog__backdrop" role="presentation">
          <section
            className="eiw-change-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Lý do thay đổi ${changeDialog.type.name}`}
          >
            <div className="eiw-change-dialog__head">
              <div>
                <strong>Lý do thay đổi tài liệu đã đạt</strong>
                <span>{changeDialog.type.name}</span>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setChangeDialog(null)}
              >
                <X size={16} />
              </button>
            </div>
            <label>
              <span>Lý do thay đổi</span>
              <input
                type="text"
                autoFocus
                value={dialogReason}
                aria-label="Lý do thay đổi"
                placeholder="Ví dụ: thay bằng bản có đủ chữ ký…"
                onChange={event => setDialogReason(event.target.value)}
              />
            </label>
            <div className="eiw-change-dialog__actions">
              <button type="button" onClick={() => setChangeDialog(null)}>Huỷ</button>
              <button
                type="button"
                className="is-primary"
                disabled={!dialogReason.trim()}
                onClick={() => {
                  const normalized = dialogReason.trim()
                  if (changeDialog.action === 'upload') {
                    pendingUploadReasons.current[changeDialog.type.id] = normalized
                    const typeId = changeDialog.type.id
                    setChangeDialog(null)
                    inputRefs.current[typeId]?.click()
                    return
                  }
                  const { type, file } = changeDialog
                  setChangeDialog(null)
                  deleteFile(type, file, normalized)
                }}
              >
                {changeDialog.action === 'upload' ? 'Tiếp tục chọn file' : 'Xác nhận gỡ file'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

/**
 * Fallback tạm thời cho response cũ chưa có key document_types.
 */
function LegacyNodeOutputList({
  checklistItem,
  nodeStatus,
  docTemplateById,
  canPropose = false,
  onOpenDocument,
  onProposeDocument,
  onUploadDocument,
}) {
  const [collapsed, setCollapsed] = useState(false)
  // Một ô <input type=file> cho MỖI tờ, giữ theo template_id. Khoá theo id bền
  // thay vì chỉ số mảng: sắp lại danh sách hay thêm tờ mới không được làm tệp
  // rơi sang tờ khác.
  const inputRefs = useRef({})
  // Tờ đang gửi — khoá riêng từng hàng, không khoá cả danh mục.
  const [uploadingId, setUploadingId] = useState('')
  // API review_by_template chỉ trả phán quyết, không trả lại tên file. Giữ tên
  // file vừa chọn theo template để UI không quay về tên giả sau khi upload.
  const [uploadedFileNames, setUploadedFileNames] = useState({})
  const documents = mergeDocumentVerdicts(checklistItem)
  const counter = documentCounter(documents, nodeStatus)

  const pickFile = (doc) => {
    inputRefs.current[doc.template_id]?.click()
  }

  const onFileChosen = async (doc, file) => {
    if (!file || !onUploadDocument) return
    setUploadingId(doc.template_id)
    try {
      await onUploadDocument({
        checklistResultId: checklistItem?.id,
        templateId: doc.template_id,
        documentId: doc.document_id || null,
        file,
      })
      setUploadedFileNames(previous => ({
        ...previous,
        [doc.template_id]: file.name,
      }))
    } finally {
      setUploadingId('')
    }
  }

  const templateName = (doc) =>
    checklistItem?.template_names?.[doc.template_id]
    || docTemplateById?.get?.(doc.template_id)?.name
    || doc.name
    || doc.template_id
    || 'Giấy chưa đặt tên'

  const docState = (doc) => {
    if (doc.review_status === 'approved') return 'approved'
    if (doc.review_status === 'rejected') return 'rejected'
    if (doc.document_id) return 'pending'
    return 'missing'
  }

  const stateLabel = (state) => {
    if (state === 'approved') return 'Đã duyệt'
    if (state === 'rejected') return 'Bị từ chối'
    if (state === 'pending') return 'Chờ duyệt'
    return 'Chưa nộp'
  }

  const hasRejections = documents.some(d => docState(d) === 'rejected')
  const allApproved = documents.length > 0 && documents.every(d => docState(d) === 'approved')
  const overallState = hasRejections ? 'rejected' : allApproved ? 'valid' : 'pending'

  return (
    <section className="eiw-docs" aria-label="Giấy tờ đầu ra">
      <div className={`eiw-checklist-item-card ${hasRejections ? 'is-rejected' : ''}`} id={`checklist-item-${checklistItem?.id || 'main'}`}>
        {/* Top of Checklist Item Card */}
        <div className="eiw-checklist-item-head">
          <div className="eiw-checklist-item-head__left">
            <div className={`eiw-checklist-status-icon is-${overallState}`} title={`${documents.length} giấy tờ đầu ra`}>
              {documents.length}
            </div>

            <div className="eiw-checklist-item-info">
              <div className="eiw-checklist-item-title-row">
                <h3>{checklistItem?.name || 'Giấy tờ đầu ra'}</h3>
                <span className={`eiw-checklist-badge is-${overallState}`}>
                  {overallState === 'rejected' && <AlertTriangle size={12} />}
                  {overallState === 'valid' ? 'Hợp lệ' : overallState === 'rejected' ? 'Cần bổ sung / Sửa lỗi' : 'Chờ xử lý'}
                </span>
              </div>

              <div className="eiw-checklist-item-meta">
                <span className="eiw-docs__count">
                  <b>{counter.primary}</b>
                  <i>{counter.note}</i>
                </span>
                {checklistItem?.note && <span> • <span>{checklistItem.note}</span></span>}
              </div>
            </div>
          </div>

          <div className="eiw-checklist-item-head__right">
            {canPropose && onProposeDocument && (
              <button
                type="button"
                className="eiw-docs__add eiw-checklist-add-doc-btn"
                onClick={() => onProposeDocument?.(checklistItem)}
              >
                <Plus size={14} /> <span>Thêm loại giấy</span>
              </button>
            )}

            <button
              type="button"
              className="eiw-checklist-collapse-btn"
              onClick={() => setCollapsed(v => !v)}
              title={collapsed ? 'Mở rộng danh sách giấy tờ' : 'Thu gọn danh sách giấy tờ'}
            >
              {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>
        </div>

        {/* Sub-documents / Attached files */}
        {!collapsed && (
          <div className="eiw-docs__scroll">
            {documents.length === 0 && (
              <p className="eiw-docs__empty">Bước này chưa khai loại giấy đầu ra nào.</p>
            )}

            {documents.map((doc) => {
              const state = docState(doc)
              const name = templateName(doc)
              const fileName = doc.file_name || doc.fileName || uploadedFileNames[doc.template_id] || null
              const isRejected = state === 'rejected'
              const documentForOpen = {
                ...doc,
                // Pass the resolved display name along with the document. The
                // parent must not fall back to template_id when opening it.
                name: doc.name || name,
                ...(fileName && !doc.file_name && !doc.fileName ? { file_name: fileName } : {}),
              }

              return (
                <div
                  className={`eiw-doc is-${state}`}
                  key={doc.template_id || doc.document_id}
                  id={`checklist-doc-${doc.document_id || doc.template_id}`}
                >
                  <div className="eiw-doc__row">
                    <div className="eiw-doc__info-col">
                      <div className="eiw-doc__icon-box">
                        {renderDocIcon(fileName || name)}
                      </div>
                      <div className="eiw-doc__text-box">
                        <div className="eiw-doc__name-row">
                          <span className="eiw-doc__name">{name}</span>
                          <span className={`eiw-doc__badge eiw-doc__badge--${state}`}>
                            {isRejected && <AlertTriangle size={11} />}
                            {stateLabel(state)}
                          </span>
                        </div>
                        {fileName && (
                          <div className="eiw-doc__sub-meta">
                            <span className="eiw-doc__filename-pill">{fileName}</span>
                            {doc.file_size && <span>• {doc.file_size}</span>}
                            {doc.updated_at && <span>• {doc.updated_at}</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="eiw-doc__actions">
                      <button
                        type="button"
                        className="eiw-doc__open"
                        title={
                          state === 'approved'
                            ? 'Đã duyệt — không thể thay thế'
                            : doc.document_id
                              ? 'Mở tệp'
                              : 'Xem chi tiết giấy tờ'
                        }
                        aria-label={`Mở ${name}`}
                        onClick={() => onOpenDocument?.(documentForOpen)}
                      >
                        <Eye size={13} />
                        <span>Xem</span>
                      </button>


                      {state !== 'approved' && onUploadDocument && (
                        <>
                          <input
                            type="file"
                            className="eiw-doc__file-input"
                            style={SR_ONLY}
                            ref={(el) => { inputRefs.current[doc.template_id] = el }}
                            aria-label={`Tải lên ${name}`}
                            id={`upload-input-${doc.document_id || doc.template_id}`}
                            disabled={uploadingId === doc.template_id}
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              // Xoá value NGAY để chọn lại đúng tệp đó vẫn bắn
                              // 'change' lần sau (thử lại cùng một tệp).
                              event.target.value = ''
                              onFileChosen(doc, file)
                            }}
                          />
                          <button
                            type="button"
                            className="eiw-doc__upload-btn"
                            title="Tải lên / Thay thế tệp này"
                            disabled={uploadingId === doc.template_id}
                            onClick={() => pickFile(doc)}
                          >
                            <Upload size={13} />
                            <span style={SR_ONLY}>Tải lên {name}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isRejected && doc.rejection_reason && (
                    <div className="eiw-doc__reason">
                      <b>Nguyên nhân từ chối</b>
                      <span>{doc.rejection_reason}</span>
                    </div>
                  )}

                  {state === 'approved' && (
                    <p className="eiw-doc__approved">
                      <Check size={12} /> Đã duyệt — không thể thay thế
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
