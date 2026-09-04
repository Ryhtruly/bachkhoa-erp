import { ArrowUpRight, Plus } from 'lucide-react'

import { documentCounter, mergeDocumentVerdicts } from './nodeWorkFormat'

/**
 * Danh mục giấy tờ đầu ra của một mục checklist — nơi nhân viên đọc kết quả chấm.
 *
 * ── Ba trạng thái, ba hình thức ──────────────────────────────────────────────
 * Bản vẽ tay chỉ có xanh (đã duyệt) và hồng (bị từ chối). Tờ vừa gán lên chưa ai
 * đọc rơi vào đâu? Để trắng thì nó trông y hệt một dòng bình thường và nhân viên
 * tưởng đã qua — nên trạng thái chờ duyệt có nền gạch chéo riêng.
 *
 * ── Lý do từ chối nằm NGAY DƯỚI tờ đó ────────────────────────────────────────
 * Không gom vào một hộp chung ở cuối: năm tờ bị trả với năm lý do khác nhau thì
 * người ta phải tự ghép lý do nào của tờ nào.
 */

export default function NodeOutputList({
  checklistItem,
  nodeStatus,
  docTemplateById,
  canPropose = false,
  onOpenDocument,
  onProposeDocument,
}) {
  const documents = mergeDocumentVerdicts(checklistItem)
  const counter = documentCounter(documents, nodeStatus)
  // Tên loại giấy: máy chủ gửi kèm theo từng mục checklist. Thiếu nó thì rơi về
  // template_id, và màn nhân viên bày nguyên một chuỗi UUID.
  const templateName = (doc) =>
    checklistItem?.template_names?.[doc.template_id]
    || docTemplateById?.get?.(doc.template_id)?.name
    || doc.name
    || doc.template_id
    || 'Giấy chưa đặt tên'

  return (
    <section className="eiw-docs" aria-label="Giấy tờ đầu ra">
      <header className="eiw-docs__head">
        <span className="eiw-docs__count">
          <b>{counter.primary}</b>
          <i>{counter.note}</i>
        </span>
        <h3>{checklistItem?.name || 'Giấy tờ đầu ra'}</h3>
        {canPropose && (
          <button
            type="button"
            className="eiw-docs__add"
            onClick={() => onProposeDocument?.(checklistItem)}
          >
            <Plus size={14} /> Thêm loại giấy
          </button>
        )}
      </header>

      <div className="eiw-docs__scroll">
        {documents.length === 0 && (
          <p className="eiw-docs__empty">Bước này chưa khai loại giấy đầu ra nào.</p>
        )}

        {documents.map((doc, index) => {
          const state = doc.review_status === 'approved' ? 'approved'
            : doc.review_status === 'rejected' ? 'rejected'
              : doc.document_id ? 'pending' : 'empty'

          return (
            <div className={`eiw-doc is-${state}`} key={doc.template_id || `doc-${index}`}>
              <div className="eiw-doc__row">
                <span className="eiw-doc__name">{templateName(doc)}</span>
                <button
                  type="button"
                  className="eiw-doc__open"
                  disabled={!doc.document_id}
                  title={doc.document_id ? 'Mở tệp' : 'Chưa có tệp nào'}
                  aria-label={`Mở ${templateName(doc)}`}
                  onClick={() => doc.document_id && onOpenDocument?.(doc)}
                >
                  <ArrowUpRight size={15} />
                </button>
              </div>
              {state === 'rejected' && doc.rejection_reason && (
                <p className="eiw-doc__reason">
                  <b>Nguyên nhân từ chối</b>
                  <span>{doc.rejection_reason}</span>
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
