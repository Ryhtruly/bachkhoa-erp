import { useState } from 'react'
import {
  AlertTriangle,
  Check,
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

import { documentCounter, mergeDocumentVerdicts } from './nodeWorkFormat'

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

/**
 * Danh mục giấy tờ đầu ra của một mục checklist (chuẩn giao diện Hình 2).
 */
export default function NodeOutputList({
  checklistItem,
  nodeStatus,
  docTemplateById,
  canPropose = false,
  onOpenDocument,
  onProposeDocument,
  onUploadDocument,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const documents = mergeDocumentVerdicts(checklistItem)
  const counter = documentCounter(documents, nodeStatus)

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
            <div className={`eiw-checklist-status-icon is-${overallState}`}>
              {overallState === 'valid' ? (
                <Check size={16} strokeWidth={2.5} />
              ) : overallState === 'rejected' ? (
                <X size={16} strokeWidth={2.5} />
              ) : (
                <FileText size={16} strokeWidth={2} />
              )}
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
            <span className="eiw-checklist-docs-count">
              {documents.length} giấy tờ
            </span>

            {canPropose && (
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

            {documents.map((doc, index) => {
              const state = docState(doc)
              const name = templateName(doc)
              const fileName = doc.file_name || doc.fileName || (doc.document_id ? `${name}.pdf` : null)
              const isRejected = state === 'rejected'

              return (
                <div
                  className={`eiw-doc is-${state}`}
                  key={doc.template_id || `doc-${index}`}
                  id={`checklist-doc-${doc.document_id || doc.template_id || index}`}
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
                        onClick={() => onOpenDocument?.(doc)}
                      >
                        <Eye size={13} />
                        <span>Xem</span>
                      </button>


                      {state !== 'approved' && onUploadDocument && (
                        <button
                          type="button"
                          className="eiw-doc__upload-btn"
                          title="Tải lên / Thay thế tệp này"
                          onClick={() => onUploadDocument(doc)}
                        >
                          <Upload size={13} />
                        </button>
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

