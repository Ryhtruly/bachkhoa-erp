import { useState } from 'react';
import { ArrowUpRight, Check, Plus, X } from 'lucide-react';

import { payRateFor } from './nodeCompensation';

/**
 * Một mục checklist của Node — cấu hình VÀ chỗ Giám đốc duyệt từng tờ giấy.
 *
 * ── Luật nghiệp vụ ───────────────────────────────────────────────────────────
 * Checklist chỉ HOÀN THÀNH khi Giám đốc duyệt đủ 100% giấy tờ nhân viên đã gán.
 * Duyệt hết mới chốt lương khoán cho người phụ trách. Một tờ bị từ chối thì phải
 * ghi lý do, và checklist quay lại trạng thái chưa xong cho tới khi nhân viên
 * gán lại rồi được duyệt nốt.
 *
 * Vì thế nút Duyệt/Từ chối nằm trên TỪNG DÒNG GIẤY, không phải một nút chung cho
 * cả checklist: một nút chung sẽ khiến Giám đốc duyệt gộp mà không đọc từng tờ,
 * đúng thứ luật trên sinh ra để chặn.
 *
 * ── Phạm vi đợt này ──────────────────────────────────────────────────────────
 * Chỉ dựng UI phía Giám đốc. Backend hôm nay mới duyệt được ở mức MỤC CHECKLIST
 * (`task_node_checklist_results.status`), chưa duyệt tới từng tờ, và lương khoán
 * còn chốt lúc nghiệm thu cả Node. Nên mọi hành động thoát ra qua `onApprove` /
 * `onReject`; chưa truyền handler thì nút hiện disabled kèm tooltip nói rõ chưa
 * nối — không để nút bấm vào rồi im lặng.
 */

const formatMoney = (value) => new Intl.NumberFormat('vi-VN').format(Number(value) || 0);

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
  onChangeWorkItem,
}) {
  // Cấu hình khai LOẠI giấy đầu ra; phán quyết đến từ runtime, khoá theo
  // template_id. Trộn ở đây để DocumentRow chỉ phải đọc một object.
  const reviewByTemplate = item.runtime?.review_by_template || {};
  const documents = (item.output_documents || []).map(doc => ({
    ...doc,
    ...(reviewByTemplate[doc.template_id] || {}),
  }));
  const workItemId = item.compensation?.work_item_id || '';
  const workItem = workItems.find(candidate => candidate.id === workItemId) || null;

  // Chưa truyền handler nghĩa là luồng duyệt chưa nối — không giả vờ bấm được.
  const canReview = Boolean(onApprove && onReject) && (canReviewDocuments || !readOnly);

  return (
    <article className="wf-check-card">
      <header className="wf-check-card__head">
        {/* Badge đếm số GIẤY ĐẦU RA, không đếm gì khác — đó là khối lượng Giám
            đốc phải duyệt để checklist này xong. */}
        <span className="wf-check-card__count">{documents.length}</span>
        <span className="wf-check-card__name">{item.name || 'Chưa đặt tên'}</span>
        <button
          type="button"
          className="wf-check-card__add"
          disabled={readOnly}
          onClick={() => onAddDocument?.(index)}
        >
          <Plus size={12} /> thêm giấy
        </button>
      </header>

      <div className="wf-check-card__docs">
        {documents.length === 0 && (
          <p className="wf-check-card__empty">Chưa gán giấy tờ đầu ra nào.</p>
        )}
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
