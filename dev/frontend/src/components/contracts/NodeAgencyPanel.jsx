import { useCallback, useEffect, useState } from 'react';
import { FileClock, Pause, TriangleAlert } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import LegalDossierActions from '../../features/legal-dossier/LegalDossierActions';
import { daysUntil, latestSubmission, pauseNote } from './nodeAgency';

/**
 * Khối NỘP CƠ QUAN trong panel chi tiết Node — phía GIÁM ĐỐC.
 *
 * ── Hai bước khác nhau, không gộp làm một ─────────────────────────────────────
 * K05a — nộp và cầm biên nhận về. Đầu ra đúng MỘT tờ: ảnh biên nhận gốc. Xong
 *        khi Giám đốc duyệt tờ đó. Áp dụng cho mọi gói.
 * K05b — theo dõi cơ quan xử lý rồi rút kết quả. Đầu ra là đủ bộ: biên lai thuế
 *        + sổ mới / bản vẽ duyệt. CHỈ gói Pháp lý trọn gói mới có bước này, và nó
 *        dùng lại mã biên nhận + ngày hẹn mà K05a đã lấy về.
 *
 * ── Vì sao cần khối riêng ─────────────────────────────────────────────────────
 * Hai bước này không đi một chiều như mọi bước khác: có thể tạm dừng giữa chừng
 * (chờ cơ quan · chờ đo vẽ · chờ nội bộ) rồi chạy tiếp, và thời gian nằm chờ KHÔNG
 * tính vào KPI nhân viên. Giám đốc mở ra phải trả lời được ngay: hồ sơ đang đứng
 * ở đâu, vì sao đứng, hẹn ngày nào trả, đã quá hạn chưa.
 *
 * ── Phạm vi đợt này ───────────────────────────────────────────────────────────
 * CHỈ dựng giao diện phía Giám đốc. Máy trạng thái, lý do tạm dừng và danh sách
 * nút đều do máy chủ quyết định (`legal_lifecycle.py` → `available_actions`), nên
 * ở đây KHÔNG viết cứng nút nào — chỉ đọc những gì máy chủ cho phép. Luồng thao
 * tác của Nhân viên gắn sau qua `LegalDossierActions`, hiện để `readOnly`.
 */

const PAUSE_LABELS = {
  AGENCY: 'CƠ QUAN',
  SURVEYOR: 'ĐO VẼ',
  INTERNAL: 'NỘI BỘ',
};

const formatDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('vi-VN');
};

function DeadlineNote({ value }) {
  const days = daysUntil(value);
  if (days === null) return null;
  if (days < 0) return <em className="wf-agency__overdue">quá hạn {Math.abs(days)} ngày</em>;
  if (days === 0) return <em className="wf-agency__due">hẹn hôm nay</em>;
  return <em className="wf-agency__left">còn {days} ngày</em>;
}

function Row({ label, children }) {
  return (
    <div className="wf-agency__row">
      <span className="wf-agency__label">{label}</span>
      <div className="wf-agency__value">{children}</div>
    </div>
  );
}

export default function NodeAgencyPanel({
  taskNodeId,
  nodeCode,
  taskNode,
  addToast,
  onChanged,
  readOnly = true,
}) {
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!taskNodeId) { setDossier(null); setLoading(false); return; }
    setLoading(true);
    try {
      // by-task-node chỉ trả phần thân hồ sơ; nhật ký và các lần nộp nằm ở
      // endpoint chi tiết. Hai lượt gọi này được apiFetch gộp và nhớ lại nên mở
      // lại Node không tốn thêm vòng mạng nào.
      const found = await apiFetch(`/api/legal-dossiers/by-task-node/${taskNodeId}`);
      const id = found?.data?.id;
      if (!id) { setDossier(null); return; }
      const full = await apiFetch(`/api/legal-dossiers/${id}`);
      setDossier(full?.data || found?.data || null);
    } catch {
      // Bước chưa bắt đầu, hoặc node không bật cờ nộp cơ quan — khối tự ẩn.
      setDossier(null);
    } finally {
      setLoading(false);
    }
  }, [taskNodeId]);

  useEffect(() => { load(); }, [load]);

  const isTracking = nodeCode === 'K05b';
  const title = isTracking ? 'Theo dõi & rút kết quả' : 'Nộp & lấy biên nhận';

  // ── Bước chưa chạy ──
  // Xem trước cho biết sẽ có gì, thay vì để trống khiến Giám đốc tưởng chưa làm.
  if (!taskNodeId) {
    return (
      <section className="wf-agency" aria-label={title}>
        <div className="wf-agency__preview">
          <FileClock size={14} />
          <div>
            <strong>{title}</strong>
            <span>
              Bước chạy rồi mới có dữ liệu: mã biên nhận, ngày hẹn trả, trạng thái
              và {isTracking ? 'nhật ký tiến độ cơ quan' : 'nút tạm dừng / tiếp tục'}.
            </span>
          </div>
        </div>
      </section>
    );
  }

  if (loading) return null;

  if (!dossier) {
    if (taskNode?.pause_reason_type) {
      const pauseReason = taskNode.pause_reason_type;
      return (
        <section className="wf-agency" aria-label={title}>
          <div className="wf-agency__paused" role="status">
            <Pause size={13} />
            <strong>ĐANG TẠM DỪNG:</strong>
            <span>{taskNode.paused_note || 'Chờ giải quyết tạm dừng'}</span>
            <b>[{PAUSE_LABELS[pauseReason] || pauseReason}]</b>
          </div>
        </section>
      );
    }
    return null;
  }

  const paused = dossier.status === 'PENDING' || Boolean(taskNode?.pause_reason_type);
  const activePauseReason = taskNode?.pause_reason_type || dossier.sub_status;
  const activePauseNote = taskNode?.paused_note || pauseNote(dossier) || dossier.status_label;
  const latestSubmit = latestSubmission(dossier);
  const receiptCode = latestSubmit?.receipt_code || dossier.latest_receipt_code || null;
  const dueDate = latestSubmit?.expected_return_date || null;
  const daysLeft = daysUntil(dueDate);

  return (
    <section className="wf-agency" aria-label={title}>
      {/* Đang tạm dừng thì nói NGAY ở đầu khối, kèm lý do và ghi chú. Giám đốc mở
          ra phải thấy hồ sơ đứng vì cái gì, không phải đi tìm trong nhật ký. */}
      {paused && (
        <div className="wf-agency__paused" role="status">
          <Pause size={13} />
          <strong>ĐANG TẠM DỪNG:</strong>
          <span>{activePauseNote}</span>
          {activePauseReason && (
            <b>[{PAUSE_LABELS[activePauseReason] || activePauseReason}]</b>
          )}
        </div>
      )}

      <div className="wf-agency__grid">
        <Row label="Mã biên nhận">
          {receiptCode
            ? <strong>{receiptCode}</strong>
            : <span className="wf-agency__empty">chưa có</span>}
          {/* K05b không tự sinh mã — nó dùng lại đúng mã K05a đã lấy về. */}
          {isTracking && receiptCode && <em>kế thừa từ K05a</em>}
        </Row>

        {latestSubmit?.received_date && (
          <Row label="Ngày nhận">{formatDate(latestSubmit.received_date)}</Row>
        )}

        <Row label="Ngày hẹn trả">
          {formatDate(dueDate) || <span className="wf-agency__empty">chưa có</span>}
          <DeadlineNote value={dueDate} />
        </Row>

        <Row label="Trạng thái">
          <strong>{dossier.status_label}</strong>
          {dossier.submission_count > 1 && <em>đã nộp {dossier.submission_count} lần</em>}
        </Row>
      </div>

      {/* ── Điều kiện chặn ──
          Nói trước để Giám đốc không đi tìm nút không tồn tại. */}
      {paused && !isTracking && (
        <p className="wf-agency__gate">
          <TriangleAlert size={13} />
          Đang tạm dừng nên nhân viên chưa nộp nghiệm thu được. Bấm Tiếp tục mới mở lại.
        </p>
      )}
      {isTracking && dossier.status !== 'CLOSED' && (
        <p className="wf-agency__gate">
          <TriangleAlert size={13} />
          Chưa có kết quả chính thức từ cơ quan thì chưa đóng được bước này.
        </p>
      )}
      {!paused && !isTracking && daysLeft !== null && daysLeft < 0 && (
        <p className="wf-agency__gate is-overdue">
          <TriangleAlert size={13} />
          Quá ngày hẹn trả — hỏi lại cơ quan, hoặc tạm dừng với lý do CƠ QUAN.
        </p>
      )}

      {/* Nhật ký tiến độ: chỉ K05b cần. K05a nộp xong là hết việc với cơ quan,
          bày nhật ký ở đó chỉ làm dài panel. */}
      {isTracking && (dossier.events || []).length > 0 && (
        <details className="wf-agency__log">
          <summary>Nhật ký tiến độ cơ quan · {dossier.events.length} mốc</summary>
          <ul>
            {dossier.events.map(ev => (
              <li key={ev.id}>
                <span>{formatDate(ev.created_at)}</span>
                <strong>{ev.to_status}</strong>
                {ev.sub_status && <b>[{PAUSE_LABELS[ev.sub_status] || ev.sub_status}]</b>}
                {ev.note && <em>{ev.note}</em>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <LegalDossierActions
        dossier={dossier}
        addToast={addToast}
        readOnly={readOnly}
        onDone={() => { load(); onChanged?.(); }}
      />
    </section>
  );
}
