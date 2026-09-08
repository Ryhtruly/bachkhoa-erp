import { useCallback, useEffect, useMemo, useState } from 'react'
import { Receipt, Check, ExternalLink, AlertTriangle } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import './legalDossier.css'

/**
 * Biên nhận & theo dõi hồ sơ tại cơ quan — ngay tại Node "Nộp & theo dõi hồ sơ"
 * trong Lịch của nhân viên pháp lý. Nộp xong ở cơ quan là điền số biên nhận,
 * tình trạng và ngày hẹn trả tại chỗ; lưu thẳng vào legal_submissions nên đồng
 * bộ luôn sang tab Pháp Lý (cột SỐ BIÊN NHẬN · TÌNH TRẠNG · NGÀY HẸN TRẢ).
 *
 * Nhà nước không có API mở để tự tra theo số biên nhận, nên thêm nút deep-link
 * mở thẳng trang Tra cứu hồ sơ của Cổng Dịch vụ công (kèm copy sẵn số biên nhận
 * để dán vào ô tra cứu) — bán tự động, an toàn.
 *
 * Node không gắn hồ sơ nộp cơ quan (404) → panel tự ẩn.
 */

// Khớp GOV_STATUSES trong routes_legal_submissions.py
const GOV_STATUSES = ['Đang chi nhánh', 'Hoàn thành', 'Rút hồ sơ', 'Trả công văn']

const AGENCY_SUGGESTIONS = [
  'Chi nhánh VP ĐKĐĐ',
  'Một cửa UBND Quận/Huyện',
  'UBND Xã/Phường',
  'Sở Xây Dựng',
  'Phòng QLĐT Quận/Huyện',
  'Sở Tài nguyên & Môi trường',
]
const STATUS_TONE = {
  'Đang chi nhánh': 'info',
  'Hoàn thành': 'success',
  'Rút hồ sơ': 'warning',
  'Trả công văn': 'neutral',
}
// Trang Tra cứu hồ sơ của Cổng Dịch vụ công Quốc gia. Có thể đổi sang cổng DVC
// cấp tỉnh nếu công ty dùng cổng riêng.
const DVC_TRACUU_URL = 'https://dichvucong.gov.vn/p/home/dvc-tra-cuu-ho-so.html'

const dmy = (iso) => {
  const s = (iso || '').slice(0, 10)
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return d && m && y ? `${d}/${m}/${y}` : s
}

export default function SubmissionReceiptPanel({ taskNodeId, addToast, onChanged, readOnly = false }) {
  const [submission, setSubmission] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ receipt_code: '', gov_status: 'Đang chi nhánh', expected_return_date: '', received_date: '', submitted_agency: '' })

  const load = useCallback(async () => {
    if (!taskNodeId) { setSubmission(null); setLoading(false); return }
    setLoading(true)
    try {
      // apiFetch gắn Bearer token; không có hồ sơ (404) → throw → panel tự ẩn.
      const res = await apiFetch(`/api/legal-submissions/by-task-node/${taskNodeId}`)
      const data = res?.data || null
      setSubmission(data)
      setForm({
        receipt_code: data?.receipt_code || '',
        gov_status: data?.gov_status || 'Đang chi nhánh',
        expected_return_date: (data?.expected_return_date || '').slice(0, 10),
        received_date: (data?.received_date || '').slice(0, 10),
        submitted_agency: data?.submitted_agency || '',
      })
      // Chưa có biên nhận và hồ sơ chưa khoá → mở sẵn ô nhập cho đỡ phải bấm.
      setEditing(Boolean(data) && !data.receipt_code && !data.is_locked)
    } catch {
      setSubmission(null)
    } finally {
      setLoading(false)
    }
  }, [taskNodeId])

  useEffect(() => { load() }, [load])

  const save = useCallback(async () => {
    if (!submission) return
    setSaving(true)
    try {
      await apiFetch(`/api/legal-submissions/${submission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt_code: form.receipt_code.trim() || null,
          gov_status: form.gov_status,
          expected_return_date: form.expected_return_date || null,
          received_date: form.received_date || null,
          submitted_agency: form.submitted_agency.trim() || null,
        }),
      })
      addToast?.('Đã lưu & đồng bộ sang tab Pháp Lý', 'success')
      await load()
      onChanged?.()
    } catch (error) {
      addToast?.(error.message || 'Không lưu được', 'error')
    } finally {
      setSaving(false)
    }
  }, [submission, form, addToast, load, onChanged])

  const traCuu = useCallback(() => {
    const code = (submission?.receipt_code || '').trim()
    if (code && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code)
        .then(() => addToast?.('Đã copy số biên nhận — dán vào ô tra cứu trên cổng', 'info'))
        .catch(() => {})
    }
    window.open(DVC_TRACUU_URL, '_blank', 'noopener,noreferrer')
  }, [submission, addToast])

  const overdue = useMemo(() => {
    const due = (submission?.expected_return_date || '').slice(0, 10)
    if (!due || submission?.gov_status === 'Hoàn thành') return false
    return due < new Date().toISOString().slice(0, 10)
  }, [submission])

  if (loading || !submission) return null

  const locked = Boolean(submission.is_locked)
  const canEdit = !readOnly && !locked

  return (
    <div className="legal-receipt-panel">
      <span className="legal-receipt-panel__title">
        <Receipt size={15} /> Biên nhận &amp; theo dõi cơ quan
      </span>

      {editing && canEdit ? (
        <div className="legal-receipt-panel__form">
          <label className="legal-receipt-panel__field">
            Số biên nhận
            <input
              className="form-control"
              placeholder="Nhập số biên nhận cơ quan cấp…"
              value={form.receipt_code}
              disabled={saving}
              onChange={(e) => setForm((f) => ({ ...f, receipt_code: e.target.value }))}
            />
          </label>
          <label className="legal-receipt-panel__field">
            Cơ quan tiếp nhận
            <input
              className="form-control"
              list="agency-suggestions"
              placeholder="Chọn hoặc nhập cơ quan nộp…"
              value={form.submitted_agency}
              disabled={saving}
              onChange={(e) => setForm((f) => ({ ...f, submitted_agency: e.target.value }))}
            />
            <datalist id="agency-suggestions">
              {AGENCY_SUGGESTIONS.map((a) => <option key={a} value={a} />)}
            </datalist>
          </label>
          <div className="legal-receipt-panel__row">
            <label className="legal-receipt-panel__field">
              Tình trạng tại cơ quan
              <select
                className="form-control"
                value={form.gov_status}
                disabled={saving}
                onChange={(e) => setForm((f) => ({ ...f, gov_status: e.target.value }))}
              >
                {GOV_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="legal-receipt-panel__field">
              Ngày nhận biên nhận
              <input
                type="date"
                className="form-control"
                value={form.received_date}
                disabled={saving}
                onChange={(e) => setForm((f) => ({ ...f, received_date: e.target.value }))}
              />
            </label>
            <label className="legal-receipt-panel__field">
              Ngày hẹn trả kết quả
              <input
                type="date"
                className="form-control"
                value={form.expected_return_date}
                disabled={saving}
                onChange={(e) => setForm((f) => ({ ...f, expected_return_date: e.target.value }))}
              />
            </label>
          </div>
          <div className="legal-receipt-panel__actions">
            <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={traCuu}>
              <ExternalLink size={14} /> Tra cứu tại Cổng DVC
            </button>
            <span className="legal-receipt-panel__spacer" />
            {submission.receipt_code && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving}
                onClick={() => { setEditing(false); load() }}>
                Huỷ
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
              <Check size={14} /> {saving ? 'Đang lưu…' : 'Lưu theo dõi'}
            </button>
          </div>
        </div>
      ) : (
        <div className="legal-receipt-panel__view">
          <div className="legal-receipt-panel__view-main">
            <span className="legal-receipt-panel__code">
              {submission.receipt_code || 'Chưa có số biên nhận'}
            </span>
            <span className={`legal-receipt-panel__badge is-${STATUS_TONE[submission.gov_status] || 'neutral'}`}>
              {submission.gov_status || 'Đang chi nhánh'}
            </span>
          </div>
          <div className="legal-receipt-panel__view-meta">
            {submission.submitted_agency && (
              <span>Nơi nộp: <strong>{submission.submitted_agency}</strong></span>
            )}
            {submission.received_date && (
              <span>Nhận biên nhận: {dmy(submission.received_date)}</span>
            )}
            {submission.expected_return_date ? (
              <span className={overdue ? 'is-overdue' : ''}>
                {overdue && <AlertTriangle size={13} />} Hẹn trả kết quả {dmy(submission.expected_return_date)}
                {overdue && ' · Quá hạn'}
              </span>
            ) : (
              <span className="legal-receipt-panel__muted">Chưa đặt ngày hẹn trả</span>
            )}
          </div>
          <div className="legal-receipt-panel__actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={traCuu}>
              <ExternalLink size={14} /> Tra cứu tại Cổng DVC
            </button>
            <span className="legal-receipt-panel__spacer" />
            {canEdit && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                Cập nhật
              </button>
            )}
          </div>
          {locked && <p className="legal-receipt-panel__muted">Hồ sơ đã hoàn tất — không chỉnh sửa được.</p>}
        </div>
      )}
    </div>
  )
}
