import { useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, FileText, Plus, X } from 'lucide-react';

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
  onOpen,
  onApprove,
  onReject,
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const files = Array.isArray(type.files) ? type.files : [];
  const hasFiles = files.length > 0;
  const pending = type.status === 'pending_review';
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
    <section className={`wf-check-type is-${type.status || 'draft'}`}>
      <div className="wf-check-type__summary">
        <div className="wf-check-type__identity">
          <strong>{type.name || 'Loại giấy chưa đặt tên'}</strong>
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
      </div>

      {expanded && (
        <div className="wf-check-type__files" aria-label={`Tệp của ${type.name || 'loại giấy'}`}>
          {files.map((file, fileIndex) => (
            <button
              type="button"
              key={file.document_id || `${file.file_name}-${fileIndex}`}
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
          ))}
        </div>
      )}

      {type.status === 'rejected' && type.rejection_reason && (
        <p className="wf-check-type__reason"><strong>Lý do:</strong> {type.rejection_reason}</p>
      )}

      {pending && (
        rejecting ? (
          <div className="wf-check-type__reject">
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
          </div>
        ) : (
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
        )
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
  reviewingTypeId = '',
  onChangeWorkItem,
}) {
  // Sự tồn tại của key là ranh giới rollout: mảng runtime rỗng vẫn là nguồn thật,
  // không được rơi về cấu hình legacy và làm lộ những dòng chưa materialize.
  const usesRuntimeTypes = hasRuntimeDocumentTypes(item);
  const documentTypes = usesRuntimeTypes && Array.isArray(item.runtime.document_types)
    ? item.runtime.document_types
    : [];
  const reviewByTemplate = item.runtime?.review_by_template || {};
  const documents = usesRuntimeTypes ? [] : (item.output_documents || []).map(doc => ({
    ...doc,
    ...(reviewByTemplate[doc.template_id] || {}),
  }));
  const workItemId = item.compensation?.work_item_id || '';
  const workItem = workItems.find(candidate => candidate.id === workItemId) || null;

  // Chưa truyền handler nghĩa là luồng duyệt chưa nối — không giả vờ bấm được.
  const canReview = Boolean(onApprove && onReject) && (canReviewDocuments || !readOnly);
  const canReviewTypes = Boolean(onApproveType && onRejectType) && (canReviewDocuments || !readOnly);
  const reviewCount = usesRuntimeTypes ? documentTypes.length : documents.length;

  return (
    <article className="wf-check-card">
      <header className="wf-check-card__head">
        {/* Badge đếm số GIẤY ĐẦU RA, không đếm gì khác — đó là khối lượng Giám
            đốc phải duyệt để checklist này xong. */}
        <span className="wf-check-card__count">{reviewCount}</span>
        <span className="wf-check-card__name">{item.name || 'Chưa đặt tên'}</span>
        {usesRuntimeTypes ? (
          <span className="wf-check-card__mode">Duyệt theo loại</span>
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
          <p className="wf-check-card__empty">
            {usesRuntimeTypes ? 'Chưa có loại giấy nào trong checklist.' : 'Chưa gán giấy tờ đầu ra nào.'}
          </p>
        )}
        {documentTypes.map(type => (
          <DocumentTypeRow
            key={type.id}
            checklistResultId={item.runtime.id}
            type={type}
            canReview={canReviewTypes}
            busy={reviewingTypeId === type.id}
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

      <div className="wf-check-card__foot">
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
      </div>
    </article>
  );
}
