import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock3, PauseCircle, PlayCircle, Send } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { apiFetch } from '../../lib/api'
import './legalDossier.css'

// Danh mục lý do/kết quả tĩnh — fallback an toàn khi /meta chưa tải kịp hoặc lỗi
// mạng, để dropdown không bao giờ rỗng (nút Xác nhận không bị kẹt disabled).
// Phải khớp PAUSE_REASONS / CLOSE_RESULTS trong dossiers/legal_lifecycle.py.
const DEFAULT_PAUSE_REASONS = [
  { value: 'AGENCY', label: 'Chờ cơ quan — đang thẩm định, ra thông báo thuế, đòi bổ sung giấy tờ' },
  { value: 'SURVEYOR', label: 'Chờ đo vẽ — bản vẽ sai ranh, phải đo lại' },
  { value: 'INTERNAL', label: 'Chờ nội bộ — chờ sếp ký, chờ khách đóng thuế' },
]
const DEFAULT_CLOSE_RESULTS = [
  { value: 'DONE', label: 'Lấy được kết quả' },
  { value: 'REJECTED', label: 'Bị bác hẳn' },
]
const FALLBACK_OPTIONS = { pause_reasons: DEFAULT_PAUSE_REASONS, close_results: DEFAULT_CLOSE_RESULTS }

/**
 * Bộ nút xử lý hồ sơ pháp lý: Tiếp nhận · Tạm dừng · Tiếp tục · Đóng hồ sơ.
 *
 * Dùng CHUNG cho trang Hồ Sơ Pháp Lý lẫn Lịch trình của nhân viên. Viết hai bản
 * là hai chỗ để lệch nhau — đúng cái bệnh đang chữa ở toàn bộ đợt này.
 *
 * Backend là nơi quyết định bấm được nút nào (`available_actions`); component này
 * chỉ vẽ ra, không tự suy luận trạng thái.
 */

const ICONS = {
  accept: CheckCircle2,
  pause: PauseCircle,
  resume: PlayCircle,
  close: Send,
}

// Hành động nào cần chọn thêm lý do / kết quả trước khi gửi
const NEEDS_REASON = { pause: 'pause_reasons', close: 'close_results' }

const STATUS_TONE = {
  ASSIGNED: 'warning',
  PROCESSING: 'info',
  PENDING: 'danger',
  CLOSED: 'success',
}

export default function LegalDossierActions({ dossier, onDone, addToast, readOnly = false }) {
  const [meta, setMeta] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [subStatus, setSubStatus] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    // apiFetch tự gắn Bearer token — fetch trần bị 401, meta rỗng, dropdown kẹt.
    apiFetch('/api/legal-dossiers/meta')
      .then((d) => { if (alive && d?.data) setMeta(d.data) })
      .catch(() => {}) // lỗi thì để FALLBACK_OPTIONS lo, không chặn thao tác
    return () => { alive = false }
  }, [])

  const send = useCallback(async (action, sub, ghiChu) => {
    setSaving(true)
    try {
      const payload = await apiFetch(`/api/legal-dossiers/${dossier.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sub_status: sub || null, note: ghiChu || null }),
      })
      if (payload.data?.reopened_survey) {
        addToast?.('Đã đẩy việc ngược về bộ phận đo vẽ để sửa bản vẽ', 'info')
      } else {
        addToast?.('Đã cập nhật hồ sơ', 'success')
      }
      setPendingAction(null)
      setSubStatus('')
      setNote('')
      onDone?.()
    } catch (error) {
      addToast?.(error.message || 'Không thực hiện được thao tác', 'error')
    } finally {
      setSaving(false)
    }
  }, [dossier?.id, addToast, onDone])

  if (!dossier) return null

  const actions = dossier.available_actions || []
  const optionsKey = pendingAction ? NEEDS_REASON[pendingAction.action] : null
  const options = optionsKey ? (meta?.[optionsKey] || FALLBACK_OPTIONS[optionsKey] || []) : []

  return (
    <div className="legal-actions">
      <div className="legal-actions__status">
        <span className={`legal-actions__pill legal-actions__pill--${STATUS_TONE[dossier.status] || 'neutral'}`}>
          {dossier.status_label}
        </span>
        {dossier.so_lan_nop > 1 && (
          <span className="legal-actions__meta">Đã nộp {dossier.so_lan_nop} lần</span>
        )}
        {dossier.working_seconds > 0 && (
          <span className="legal-actions__meta">
            <Clock3 size={13} /> Xử lý {Math.round(dossier.working_seconds / 3600)}h
            {dossier.total_pending_seconds > 0 && ' (đã trừ thời gian chờ)'}
          </span>
        )}
      </div>

      {readOnly ? (
        /* Sơ đồ quy trình là màn hình của GIÁM ĐỐC — ông ấy duyệt kết quả, không
           tự làm việc thay nhân viên. Ở đây chỉ xem, không có nút thao tác. */
        <p className="legal-actions__readonly">
          {actions.length === 0
            ? 'Hồ sơ đã đóng.'
            : `Đang chờ nhân viên pháp lý: ${actions.map((a) => a.label).join(' · ')}`}
        </p>
      ) : actions.length === 0 ? (
        <p className="legal-actions__done">Hồ sơ đã đóng — không còn thao tác nào.</p>
      ) : (
        <div className="legal-actions__buttons">
          {actions.map(({ action, label }) => {
            const Icon = ICONS[action] || CheckCircle2
            const primary = action === 'accept' || action === 'resume' || action === 'close'
            return (
              <button
                key={action}
                type="button"
                className={`btn btn-sm ${primary ? 'btn-primary' : 'btn-secondary'}`}
                disabled={saving}
                onClick={() => (NEEDS_REASON[action]
                  ? setPendingAction({ action, label })
                  : send(action))}
              >
                <Icon size={15} /> {label}
              </button>
            )
          })}
        </div>
      )}

      <Modal
        open={Boolean(pendingAction)}
        onClose={() => setPendingAction(null)}
        title={pendingAction?.label || ''}
        overlayClassName="modal-overlay--top"
      >
        <div className="legal-actions__form">
          <label>
            {pendingAction?.action === 'pause' ? 'Lý do tạm dừng' : 'Kết quả'}
            <select className="form-control" value={subStatus}
              onChange={(e) => setSubStatus(e.target.value)}>
              <option value="">— Bắt buộc chọn —</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {subStatus === 'SURVEYOR' && (
            <p className="legal-actions__warn">
              Chọn lý do này sẽ <strong>mở lại việc cho bộ phận đo vẽ</strong> và báo cho họ.
            </p>
          )}
          <label>
            Ghi chú
            <textarea className="form-control" rows={3} value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mô tả ngắn để người sau đọc lại còn hiểu" />
          </label>
          <div className="legal-actions__form-footer">
            <button type="button" className="btn btn-secondary"
              onClick={() => setPendingAction(null)}>Huỷ</button>
            <button type="button" className="btn btn-primary"
              disabled={!subStatus || saving}
              onClick={() => send(pendingAction.action, subStatus, note)}>
              {saving ? 'Đang lưu…' : `Xác nhận ${pendingAction?.label?.toLowerCase()}`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
