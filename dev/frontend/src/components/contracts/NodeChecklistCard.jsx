import { useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, CircleDashed, FileText, Plus, X } from 'lucide-react';

import { payRateFor } from './nodeCompensation';

/**
 * Một mục checklist của Node — cấu hình legacy và nơi Giám đốc đọc, duyệt các
 * LOẠI giấy runtime. Mỗi loại có một verdict; mọi file của loại nằm trong cùng
 * disclosure để đọc bằng mắt trước khi quyết định. Khi key `document_types`
 * vắng mặt, card mới dùng đường duyệt từng document cũ trong giai đoạn chuyển đổi.
 */

const formatMoney = (value) => new Intl.NumberFormat('vi-VN').format(Number(value) || 0);

const SOURCE_LABELS = {
  KHACH_HANG: 'Khách hàng cung cấp',
  CONG_TY: 'Công ty soạn',
  CO_QUAN: 'Pháp lý',
};

const TYPE_STATUS_LABELS = {
  draft: 'Chưa nộp',
  pending_review: 'Chờ duyệt',
  approved: 'Đạt',
  rejected: 'Không đạt',
};

const hasRuntimeDocumentTypes = item => Object.hasOwn(item?.runtime || {}, 'document_types');

function DocumentTypeRow({
  checklistResultId,
  type,
  canReview,
  busy,
  isHighlighted = false,
  onOpen,
  onApprove,
  onReject,
}) {
  const [expanded, setExpanded] = useState(() => isHighlighted);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const files = Array.isArray(type.files) ? type.files : [];
  const hasFiles = files.length > 0;
  const pending = type.status === 'pending_review';
  const employeeChangeReason = type.employee_change_reason || '';
  const statusLabel = TYPE_STATUS_LABELS[type.status] || type.status || 'Chưa nộp';
  const sourceLabel = SOURCE_LABELS[type.source] || type.source_label || type.source || 'Chưa rõ nguồn';
  const reviewDisabled = !canReview || busy || !hasFiles;

  const submitRejection = () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) return;
    onReject?.(checklistResultId, type.id, trimmedReason);
    setRejecting(false);
    setReason('');
  };

  return (
    <section
      id={`doc-type-${type.id}`}
      className={`wf-check-type is-${type.status || 'draft'}${isHighlighted ? ' is-highlighted' : ''}`}
    >
      <div className="wf-check-type__summary">
        <div className="wf-check-type__identity">
          <button
            type="button"
            className="wf-check-type__name"
            aria-expanded={expanded}
            aria-label={`Mở file của loại giấy ${type.name || 'chưa đặt tên'}`}
            disabled={!hasFiles}
            onClick={() => setExpanded(value => !value)}
          >
            <strong>{type.name || 'Loại giấy chưa đặt tên'}</strong>
          </button>
          <span className={`wf-check-type__source is-${String(type.source || '').toLowerCase()}`}>
            {sourceLabel}
          </span>
        </div>
        <button
          type="button"
          className="wf-check-type__files-toggle"
          aria-expanded={expanded}
          aria-label={`Xem ${files.length} file của ${type.name || 'loại giấy'}`}
          disabled={!hasFiles}
          onClick={() => setExpanded(value => !value)}
        >
          <FileText size={12} /> {files.length} file
          <ChevronDown size={13} className={expanded ? 'is-open' : ''} />
        </button>
        <span className={`wf-check-type__status is-${type.status || 'draft'}`}>{statusLabel}</span>
        {pending && employeeChangeReason && (
          <span className="wf-check-type__updated">Cập nhật lại</span>
        )}
        {pending && canReview && (
          <div className="wf-check-type__actions">
            <button
              type="button"
              className="is-reject"
              disabled={reviewDisabled}
              title={hasFiles ? 'Ghi lý do không đạt cho loại giấy này' : 'Chưa có file nào để duyệt'}
              onClick={() => setRejecting(true)}
            >
              <X size={13} /> Không đạt
            </button>
            <button
              type="button"
              className="is-approve"
              disabled={reviewDisabled}
              title={hasFiles ? 'Xác nhận toàn bộ file của loại giấy đạt' : 'Chưa có file nào để duyệt'}
              onClick={() => onApprove?.(checklistResultId, type.id)}
            >
              <Check size={13} /> Đạt
            </button>
          </div>
        )}
      </div>

      {pending && employeeChangeReason && (
        <p className="wf-check-type__employee-note">
          <strong>Ghi chú nhân viên:</strong> {employeeChangeReason}
        </p>
      )}

      {expanded && (
        <div className="wf-check-type__files" aria-label={`Tệp của ${type.name || 'loại giấy'}`}>
          {files.map((file, fileIndex) => {
            return (
              <div
                className="wf-check-type__file"
                key={file.document_id || `${file.file_name}-${fileIndex}`}
              >
                <button
                  type="button"
                  disabled={!onOpen}
                  onClick={() => onOpen?.({
                    ...file,
                    document_type_id: type.id,
                    document_type_name: type.name,
                    source: type.source,
                  })}
                  aria-label={`Mở ${file.file_name || `file ${fileIndex + 1}`}`}
                >
                  <FileText size={13} />
                  <span>{file.file_name || `File ${fileIndex + 1}`}</span>
                  <ArrowUpRight size={12} />
                </button>
                {file.change_reason && (
                  <small><strong>Lý do bổ sung:</strong> {file.change_reason}</small>
                )}
              </div>
            );
          })}
        </div>
      )}

      {type.status === 'rejected' && type.rejection_reason && (
        <p className="wf-check-type__reason"><strong>Lý do:</strong> {type.rejection_reason}</p>
      )}

      {rejecting && (
        <div className="wf-review-modal__backdrop" role="presentation">
          <section
            className="wf-check-type__reject wf-review-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Từ chối loại giấy ${type.name || 'chưa đặt tên'}`}
          >
            <div className="wf-review-modal__head">
              <div>
                <strong>Không đạt: {type.name || 'Loại giấy'}</strong>
                <span>Chỉ rõ tài liệu hoặc nội dung nhân viên cần sửa.</span>
              </div>
              <button type="button" aria-label="Đóng" onClick={() => { setRejecting(false); setReason(''); }}>
                <X size={16} />
              </button>
            </div>
            <label>
              <span>Lý do không đạt</span>
              <input
                type="text"
                value={reason}
                autoFocus
                placeholder="Nêu rõ trang hoặc nội dung cần sửa…"
                onChange={event => setReason(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Escape') { setRejecting(false); setReason(''); }
                  if (event.key === 'Enter' && reason.trim()) submitRejection();
                }}
              />
            </label>
            <div>
              <button type="button" onClick={() => { setRejecting(false); setReason(''); }}>Huỷ</button>
              <button type="button" disabled={!reason.trim() || busy} onClick={submitRejection}>
                Xác nhận không đạt
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function DocumentRow({ doc, name, canReview, onOpen, onApprove, onReject }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const decided = doc.review_status === 'approved' || doc.review_status === 'rejected';
  // Chưa ai nộp tệp cho loại giấy này thì KHÔNG có gì để duyệt. Để nút sáng lên
  // là mời Giám đốc duyệt một tờ không tồn tại.
  const hasFile = Boolean(doc.document_id);

  return (
    <div className={`wf-check-doc${decided ? ' is-decided' : ''}`}>
      <div className="wf-check-doc__main">
        {/* Tờ bị từ chối phải nói NGAY vì sao, ngay trên dòng đó. Bắt người ta
            bấm vào mới thấy lý do là bắt nhân viên đi tìm thứ mình cần sửa. */}
        {doc.review_status === 'rejected' && doc.rejection_reason && (
          <span className="wf-check-doc__reason" title={doc.rejection_reason}>lí do</span>
        )}
        <span className="wf-check-doc__name">{name}</span>
        <button
          type="button"
          className="wf-check-doc__open"
          onClick={() => onOpen?.(doc)}
          title="Mở giấy trong Tủ hồ sơ"
          aria-label={`Mở ${name} trong Tủ hồ sơ`}
        >
          <ArrowUpRight size={13} />
        </button>
      </div>

      {decided ? (
        <span
          className={`wf-check-doc__verdict is-${doc.review_status}`}
          title={doc.review_status === 'rejected' ? doc.rejection_reason : 'Đã duyệt'}
        >
          {doc.review_status === 'approved' ? 'đã duyệt' : 'đã từ chối'}
        </span>
      ) : rejecting ? (
        <div className="wf-check-doc__reject">
          <input
            type="text"
            value={reason}
            autoFocus
            placeholder="Lý do từ chối…"
            aria-label="Lý do từ chối"
            onChange={(event) => setReason(event.target.value)}
          />
          {/* Từ chối mà không nêu lý do thì nhân viên không biết phải sửa gì —
              chặn ngay ở nút thay vì gửi lên rồi báo lỗi. */}
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={() => { onReject?.(doc, reason.trim()); setRejecting(false); setReason(''); }}
          >
            Gửi
          </button>
          <button type="button" onClick={() => { setRejecting(false); setReason(''); }}>Huỷ</button>
        </div>
      ) : (
        <div className="wf-check-doc__actions">
          <button
            type="button"
            className="is-approve"
            disabled={!canReview || !hasFile}
            title={hasFile ? 'Duyệt tờ này' : 'Chưa có tệp nào để duyệt'}
            onClick={() => onApprove?.(doc)}
          >
            <Check size={12} /> duyệt
          </button>
          <button
            type="button"
            className="is-reject"
            disabled={!canReview || !hasFile}
            title={hasFile ? 'Từ chối tờ này' : 'Chưa có tệp nào để duyệt'}
            onClick={() => setRejecting(true)}
          >
            <X size={12} /> từ chối
          </button>
        </div>
      )}
    </div>
  );
}

export default function NodeChecklistCard({
  item,
  index,
  docTemplateById = new Map(),
  workItems = [],
  roleCode,
  canManageCompensation = false,
  readOnly = false,
  // Quyền DUYỆT tách khỏi quyền SỬA cấu hình: thanh Chờ duyệt bày thẻ ở chế độ
  // chỉ đọc (không cho đổi công việc khoán, không cho thêm giấy) nhưng vẫn phải
  // duyệt được từng tờ — đó chính là việc của nó.
  canReviewDocuments = false,
  onAddDocument,
  onOpenDocument,
  onApprove,
  onReject,
  onApproveType,
  onRejectType,
  onApproveChecklist,
  onRejectChecklist,
  reviewingTypeId = '',
  reviewQueue = false,
  onChangeWorkItem,
  nodeStatus = null,
  highlightedDocumentTypeId = null,
  isHighlighted = false,
}) {
  // Sự tồn tại của key là ranh giới rollout: mảng runtime rỗng vẫn là nguồn thật,
  // không được rơi về cấu hình legacy và làm lộ những dòng chưa materialize.
  const usesRuntimeTypes = hasRuntimeDocumentTypes(item);
  const allDocumentTypes = usesRuntimeTypes && Array.isArray(item.runtime.document_types)
    ? item.runtime.document_types
    : [];
  const documentTypes = reviewQueue
    ? allDocumentTypes.filter(type => type.status === 'pending_review')
    : allDocumentTypes;
  const reviewByTemplate = item.runtime?.review_by_template || {};
  const documents = usesRuntimeTypes ? [] : (item.output_documents || []).map(doc => ({
    ...doc,
    ...(reviewByTemplate[doc.template_id] || {}),
  }));
  const workItemId = item.compensation?.work_item_id || '';
  const workItem = workItems.find(candidate => candidate.id === workItemId) || null;

  // Chưa truyền handler nghĩa là luồng duyệt chưa nối — không giả vờ bấm được.
  // Bước đã chốt hoàn tất hoặc đã huỷ thì không cho phép duyệt lại nữa.
  const isFinished = ['accepted', 'completed', 'cancelled', 'skipped'].includes(nodeStatus);
  const canReview = Boolean(onApprove && onReject) && (canReviewDocuments || !readOnly) && !isFinished;
  const canReviewTypes = Boolean(onApproveType && onRejectType) && (canReviewDocuments || !readOnly) && !isFinished;
  const canConfirmChecklist = Boolean(onApproveChecklist && onRejectChecklist) && (canReviewDocuments || !readOnly) && !isFinished;
  const reviewCount = usesRuntimeTypes ? documentTypes.length : documents.length;

  return (
    <article
      id={`checklist-card-${item.runtime?.id || index}`}
      className={`wf-check-card${isHighlighted ? ' is-highlighted' : ''}`}
    >
      <header className="wf-check-card__head">
        {/* Badge đếm số GIẤY ĐẦU RA, không đếm gì khác — đó là khối lượng Giám
            đốc phải duyệt để checklist này xong. */}
        <span className="wf-check-card__count">{reviewCount}</span>
        <span className="wf-check-card__name">{item.name || 'Chưa đặt tên'}</span>
        {usesRuntimeTypes ? (
          <span className="wf-check-card__mode" title="Chế độ: Duyệt theo từng loại giấy tờ">
            {reviewCount > 0 ? 'Duyệt theo loại' : 'Checklist công việc'}
          </span>
        ) : (
          <button
            type="button"
            className="wf-check-card__add"
            disabled={readOnly}
            onClick={() => onAddDocument?.(index)}
          >
            <Plus size={12} /> thêm giấy
          </button>
        )}
      </header>

      <div className="wf-check-card__docs">
        {reviewCount === 0 && (
          <div className="wf-check-card__paperless-body">
            <p className="wf-check-card__empty" style={{ margin: 0 }}>
              {usesRuntimeTypes ? 'Chưa có loại giấy nào trong checklist.' : 'Chưa gán giấy tờ đầu ra nào.'}
            </p>
            {['pending_approval', 'late_pending_approval'].includes(item.runtime?.status) && canConfirmChecklist && (
              <div className="wf-check-card__confirm-box" style={{ marginTop: 8, padding: '8px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CircleDashed size={13} /> Chờ Giám đốc xác nhận hoàn thành
                </span>
                <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: 11, padding: '3px 8px', height: 'auto', minHeight: 26 }}
                    onClick={() => {
                      const reason = window.prompt('Nhập lý do trả lại (tối thiểu 5 ký tự):');
                      if (reason === null) return;
                      if (reason.trim().length < 5) {
                        alert('Lý do từ chối phải từ 5 ký tự trở lên');
                        return;
                      }
                      onRejectChecklist?.(item.runtime.id, reason.trim());
                    }}
                  >
                    <X size={12} /> Trả lại
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: 11, padding: '3px 8px', height: 'auto', minHeight: 26 }}
                    onClick={() => onApproveChecklist?.(item.runtime.id)}
                  >
                    <Check size={12} /> Xác nhận hoàn thành
                  </button>
                </div>
              </div>
            )}
            {['approved', 'late_approved'].includes(item.runtime?.status) && (
              <div style={{ marginTop: 6 }}>
                <span className="workflow-evidence-decision workflow-evidence-decision--passed" style={{ fontSize: 11, color: '#166534', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                  <Check size={13} /> {item.runtime?.status === 'late_approved' ? 'Đã duyệt trễ hạn' : 'Đã xác nhận hoàn thành'}
                </span>
              </div>
            )}
            {item.runtime?.status === 'failed' && (
              <div style={{ marginTop: 6 }}>
                <span className="workflow-evidence-decision workflow-evidence-decision--failed" style={{ fontSize: 11, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                  <X size={13} /> Đã từ chối — chờ nhân viên nộp lại
                </span>
              </div>
            )}
          </div>
        )}
        {documentTypes.map(type => (
          <DocumentTypeRow
            key={type.id}
            checklistResultId={item.runtime.id}
            type={type}
            canReview={canReviewTypes}
            busy={reviewingTypeId === type.id}
            isHighlighted={Boolean(highlightedDocumentTypeId && String(type.id) === String(highlightedDocumentTypeId))}
            onOpen={onOpenDocument}
            onApprove={onApproveType}
            onReject={onRejectType}
          />
        ))}
        {documents.map((doc, docIndex) => (
          <DocumentRow
            key={doc.template_id || `doc-${docIndex}`}
            doc={doc}
            name={docTemplateById.get(doc.template_id)?.name || doc.template_id || 'Giấy chưa chọn'}
            canReview={canReview}
            onOpen={onOpenDocument}
            onApprove={(target) => onApprove?.(index, target)}
            onReject={(target, reason) => onReject?.(index, target, reason)}
          />
        ))}
      </div>

      {!reviewQueue && <div className="wf-check-card__foot">
        <label className="wf-check-card__field">
          <span>công việc</span>
          <select
            value={workItemId}
            disabled={readOnly || !canManageCompensation}
            onChange={(event) => onChangeWorkItem?.(index, event.target.value)}
          >
            <option value="">không có</option>
            {workItems.map(candidate => (
              <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
            ))}
          </select>
        </label>
        <div className="wf-check-card__field">
          <span>lương khoán</span>
          {/* Đọc thẳng từ bảng giá đã ban hành — không cho sửa tại chỗ, vì sửa ở
              đây là mỗi Node một giá và bảng giá chung mất tác dụng. */}
          <strong className="wf-check-card__pay">{formatMoney(payRateFor(workItem, roleCode))}</strong>
        </div>
      </div>}
    </article>
  );
}
