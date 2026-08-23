import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, Eye, FolderDown, Lock, Plus, ShieldAlert, ShieldCheck } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { SensitiveActionModal, Select } from '../../components/ui'
import ReceiptFileInput from '../../components/finance/ReceiptFileInput'
import ReceiptLinks from '../../components/finance/ReceiptLinks'
import { buildPaymentFormData } from '../../components/finance/paymentReceipts'
import './handover.css'

/**
 * Khung đặc biệt cho bước BÀN GIAO — cổng tài chính cuối cùng.
 *
 * Bước này khác mọi bước khác ở CÔNG NỢ, không ở cách hoàn thành:
 *   · Giao hồ sơ cho khách = việc trong CHECKLIST của bước, chốt bằng NGHIỆM THU
 *     như mọi bước khác (không có nút "xác nhận bàn giao" riêng).
 *   · Tiền là việc của KẾ TOÁN: ghi nhận từng đợt thu, giám đốc duyệt.
 *
 * Cổng công nợ nằm ở lúc NGHIỆM THU: còn nợ thì không duyệt đạt được, trừ khi
 * Giám đốc duyệt cho nợ ngoại lệ. Khung này chỉ lo phần tiền + tải bộ hồ sơ.
 */

const formatMoney = (v) => `${Number(v || 0).toLocaleString('vi-VN')}₫`

const formatDate = (v) => {
  if (!v) return ''
  try { return new Intl.DateTimeFormat('vi-VN').format(new Date(v)) } catch { return v }
}

const formatShortDate = (v) => {
  if (!v) return ''
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return v
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  } catch { return v }
}

export default function HandoverPanel({ taskNodeId, addToast, onChanged, readOnly = false, hideIfNotHandover = false }) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPayment, setShowPayment] = useState(false)
  const [showDeliver, setShowDeliver] = useState(false)
  const [deliverNote, setDeliverNote] = useState('')
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ amount: '', payment_method: 'CASH', note: '' })
  const [receiptFiles, setReceiptFiles] = useState([])

  const handleOverrideHandover = async (reason) => {
    if (!state?.contract_id) return
    setSaving(true)
    try {
      const res = await fetch(`/api/contracts/${encodeURIComponent(state.contract_id)}/override-handover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        addToast?.(payload.detail || 'Không thực hiện được ngoại lệ', 'error')
        return
      }
      addToast?.('Giám đốc đã duyệt ngoại lệ cho nợ & mở khóa bàn giao!', 'success')
      setShowOverrideModal(false)
      await load()
      onChanged?.()
    } catch {
      addToast?.('Lỗi kết nối máy chủ', 'error')
    } finally {
      setSaving(false)
    }
  }

  const [goiTaiLieu, setGoiTaiLieu] = useState(null)
  const [dangTaiGoi, setDangTaiGoi] = useState(false)

  const load = useCallback(async () => {
    if (!taskNodeId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/handover/${taskNodeId}`)
      if (!res.ok) {
        setState(null)
        // 400 = bước này không phải bước bàn giao. Ở màn nhân viên (hideIfNotHandover)
        // thì IM LẶNG — trả null, không bày box đỏ lên node thường. Ở màn thiết kế thì
        // vẫn nhắc để giám đốc biết cần bấm Áp dụng sau khi tick cờ "Bước bàn giao".
        setError(res.status === 400
          ? (hideIfNotHandover ? '' : 'Bước này chưa được ghi nhận là bước bàn giao. Bấm Áp dụng để lưu thay đổi, khối công nợ sẽ hiện ra.')
          : `Không tải được thông tin bàn giao (lỗi ${res.status}).`)
        return
      }
      setState((await res.json()).data)
    } catch {
      setError('Mất kết nối tới máy chủ.')
    } finally {
      setLoading(false)
    }
  }, [taskNodeId, hideIfNotHandover])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!taskNodeId) return undefined
    let huy = false
    fetch(`/api/handover/${taskNodeId}/deliverables`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!huy) setGoiTaiLieu(d?.data || null) })
      .catch(() => {})
    return () => { huy = true }
  }, [taskNodeId])

  const post = useCallback(async (endpoint, body, successMessage) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/handover/${taskNodeId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        addToast?.(payload.detail || 'Không thực hiện được', 'error')
        return false
      }
      addToast?.(successMessage, 'success')
      await load()
      onChanged?.()
      return true
    } catch {
      addToast?.('Mất kết nối tới máy chủ', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }, [taskNodeId, addToast, load, onChanged])

  const submitPayment = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/handover/${taskNodeId}/payments`, {
        method: 'POST',
        body: buildPaymentFormData(form, receiptFiles),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        addToast?.(payload.detail || 'Không ghi nhận được thanh toán', 'error')
        return false
      }
      addToast?.('Đã ghi nhận, chờ giám đốc duyệt', 'success')
      await load()
      onChanged?.()
      return true
    } catch {
      addToast?.('Mất kết nối tới máy chủ', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  const taiTronBo = async () => {
    setDangTaiGoi(true)
    try {
      const res = await fetch(`/api/handover/${taskNodeId}/deliverables.zip`)
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        addToast?.(payload.detail || "Không tải được bộ hồ sơ", "error")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `HoSoBanGiao_${(state?.contract_id || "").replace(/\//g, "-")}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      addToast?.("Đã tải bộ hồ sơ bàn giao", "success")
    } catch {
      addToast?.("Mất kết nối tới máy chủ", "error")
    } finally {
      setDangTaiGoi(false)
    }
  }

  if (loading) return <div className="handover handover--loading">Đang tải khối công nợ…</div>
  if (error) return <p className="handover handover--pending"><Lock size={14} /> {error}</p>
  if (!state) return null

  const { debt, gate, lane_a: laneA, lane_b: laneB, installments = [] } = state
  const hasOutstandingDebt = !debt.is_settled

  return (
    <section className={`handover${hasOutstandingDebt ? ' handover--debt' : ''}`}>
      {!gate.is_open && (
        <p className="handover__gate"><Lock size={14} /> {gate.reason} — chưa bàn giao được</p>
      )}

      {/* ── Tiền: một thẻ, một con số, một thanh ────────────────────
          Trước đây là bảng ba dòng Giá trị / Đã thu / Còn thiếu, ba con số
          cùng cỡ nên mắt không biết bám vào đâu. Người nhìn khối này chỉ hỏi
          đúng một câu: còn phải đòi bao nhiêu nữa. Cho con số đó cỡ lớn nhất,
          phần còn lại lùi xuống thành dòng phụ. */}
      <div className={`handover__money${hasOutstandingDebt ? ' is-debt' : ' is-settled'}`}>
        <div className="handover__money-head">
          <span className="handover__money-state">
            {hasOutstandingDebt ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            {hasOutstandingDebt ? 'Còn thiếu' : 'Đã thu đủ'}
          </span>
          <strong className="handover__money-figure">
            {formatMoney(hasOutstandingDebt ? debt.remaining : debt.total_value)}
          </strong>
        </div>
        <div className="handover__money-bar" role="presentation">
          <span style={{ width: `${Math.min(100, Math.max(0, Number(debt.percent) || 0))}%` }} />
        </div>
        <p className="handover__money-detail">
          {formatMoney(debt.paid)} / {formatMoney(debt.total_value)} · {debt.percent}%
        </p>
        {debt.pending_amount > 0 && (
          <p className="handover__pending">
            <AlertTriangle size={13} /> {formatMoney(debt.pending_amount)} đã ghi nhận nhưng
            <strong> giám đốc chưa duyệt</strong> — chưa trừ vào công nợ.
          </p>
        )}

        {debt.has_override && (
          <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10b98144', borderRadius: 6, fontSize: '0.8rem', color: '#059669', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={14} />
            <span>Đã duyệt ngoại lệ cho nợ (Lý do: {debt.override_reason || 'Giám đốc phê duyệt'})</span>
          </div>
        )}

        {hasOutstandingDebt && !debt.has_override && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-warning btn-sm"
              onClick={() => setShowOverrideModal(true)}
              style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#fff', fontSize: '0.8rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ShieldAlert size={14} /> Giám đốc duyệt cho nợ & Bàn giao
            </button>
          </div>
        )}
      </div>

      {installments.length > 0 && (
        <div className="handover__history">
          <div className="handover__history-head">
            <span>Lịch sử thu tiền</span>
            <em>{installments.length} đợt</em>
          </div>
          <ul className="handover__installments">
            {installments.map((d) => (
              <li key={d.id} className={d.is_approved ? '' : 'is-pending'}>
                <span className="handover__inst-date">{formatShortDate(d.transaction_date)}</span>
                <span className="handover__inst-amount">{formatMoney(d.amount)}</span>
                {d.receipt_attachments?.length || d.receipt_attachment_url
                  ? <ReceiptLinks attachments={d.receipt_attachments} legacyUrl={d.receipt_attachment_url} addToast={addToast} compact />
                  : <span className="handover__inst-nobill" title="Thiếu ảnh bill">—</span>}
                <span className={`handover__inst-status${d.is_approved ? '' : ' is-waiting'}`}>
                  {d.is_approved ? 'Đã duyệt' : 'Chờ duyệt'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {goiTaiLieu && goiTaiLieu.items.length > 0 && (
        <div className="handover__package">
          <div>
            <strong>Bộ hồ sơ bàn giao</strong>
            <p>{goiTaiLieu.items.length} tài liệu: hợp đồng, hồ sơ pháp lý, bản vẽ, minh chứng các bước</p>
            {!goiTaiLieu.can_download && (
              <small><Lock size={12} /> {goiTaiLieu.blocked_reason}</small>
            )}
          </div>
          <button type="button" className="btn btn-secondary btn-sm"
            disabled={!goiTaiLieu.can_download || dangTaiGoi} onClick={taiTronBo}>
            <FolderDown size={15} /> {dangTaiGoi ? "Đang gói…" : "Tải trọn bộ"}
          </button>
        </div>
      )}

      {/* ── Thu tiền & Bàn giao ─────────────────────────────────── */}
      <div className="handover__lanes">
        {[laneA, laneB].filter(Boolean).map((lane, i) => {
          const isDossierLane = i === 0 && Boolean(laneA)
          const subInfo = lane.done
            ? [lane.actor, isDossierLane ? formatDate(lane.delivered_at) : null].filter(Boolean).join(' · ')
            : lane.desc
          return (
            <div key={lane.label} className={`handover__lane${lane.done ? ' is-done' : ''}`}>
              <span className="handover__lane-mark">
                {lane.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
              </span>
              <div>
                <strong>{lane.label}</strong>
                <p>{subInfo}</p>
                {isDossierLane && lane.done && lane.acknowledged_debt && (
                  <small className="handover__lane-warn">
                    Giao khi còn thiếu {formatMoney(lane.remaining_at_delivery)}
                  </small>
                )}
                {!lane.done && lane.actor && <small className="handover__lane-who">Người phụ trách: {lane.actor}</small>}
              </div>
              {!readOnly && isDossierLane && lane.can_do && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowDeliver(true)}>
                  Xác nhận bàn giao
                </button>
              )}
              {!readOnly && !isDossierLane && lane.can_record_payment && !lane.done && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                  setForm({ amount: '', payment_method: 'CASH', note: '' })
                  setReceiptFiles([])
                  setShowPayment(true)
                }}>
                  <Plus size={14} /> Ghi nhận thanh toán
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Chỉ nhắc khi còn vướng tiền — giao hồ sơ đã là việc của nghiệm thu. */}
      {!state.is_finished && gate.is_open && (
        hasOutstandingDebt
          ? <p className="handover__verdict">Còn thiếu {formatMoney(debt.remaining)} — thu đủ hoặc Giám đốc duyệt cho nợ ngoại lệ thì mới nghiệm thu hoàn thành bước bàn giao.</p>
          : <p className="handover__verdict is-ok">Đã thu đủ tiền — nghiệm thu bước này để hoàn thành bàn giao.</p>
      )}

      {readOnly && (
        /* Sơ đồ quy trình là màn hình của GIÁM ĐỐC — chỉ xem, không bấm thay ai. */
        <p className="handover__readonly"><Eye size={13} /> Chỉ xem — do người được phân công thực hiện</p>
      )}

      {/* ── Ghi nhận một đợt thu ───────────────────────────────── */}
      <Modal open={showPayment} onClose={() => { setShowPayment(false); setReceiptFiles([]) }} title="Ghi nhận đợt thanh toán" overlayClassName="modal-overlay--top">
        <div className="handover__form">
          <p className="handover__form-hint">
            Còn thiếu <strong>{formatMoney(debt.remaining)}</strong>. Phiếu tạo ra ở trạng thái
            <strong> Chờ duyệt</strong> — công nợ chỉ giảm sau khi giám đốc duyệt.
          </p>
          <label>Số tiền khách đưa
            <input className="form-control" type="number" min="0" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <div className="receipt-field">
            <span className="receipt-field__label">Ảnh bill / biên lai <span className="handover__req">*</span></span>
            <ReceiptFileInput files={receiptFiles} onChange={setReceiptFiles} disabled={saving} />
          </div>
          <label>Hình thức
            <Select
              value={form.payment_method}
              options={[
                { value: 'CASH', label: 'Tiền mặt' },
                { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
              ]}
              onChange={(value) => setForm(prev => ({ ...prev, payment_method: value }))}
              className="ui-select--field"
            />
          </label>
          <label>Ghi chú
            <input className="form-control" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <div className="handover__form-footer">
            <button type="button" className="btn btn-secondary" onClick={() => { setShowPayment(false); setReceiptFiles([]) }}>Huỷ</button>
            <button type="button" className="btn btn-primary"
              disabled={saving || !form.amount || Number(form.amount) <= 0
                || Number(form.amount) > Number(debt.remaining) || receiptFiles.length === 0}
              onClick={async () => {
                const ok = await submitPayment()
                if (ok) {
                  setShowPayment(false)
                  setForm({ amount: '', payment_method: 'CASH', note: '' })
                  setReceiptFiles([])
                }
              }}>
              {saving ? 'Đang lưu…' : 'Ghi nhận'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Xác nhận bàn giao khi còn nợ ───────────────────────── */}
      <Modal open={showDeliver} onClose={() => setShowDeliver(false)} title="Xác nhận bàn giao" overlayClassName="modal-overlay--top">
        <div className="handover__form">
          {hasOutstandingDebt ? (
            <div className="handover__confirm">
              <p className="handover__confirm-line">Giá trị <strong>{formatMoney(debt.total_value)}</strong></p>
              <p className="handover__confirm-line">Đã thu <strong>{formatMoney(debt.paid)}</strong> ({debt.percent}%)</p>
              <p className="handover__confirm-line handover__confirm-line--danger">
                Còn thiếu <strong>{formatMoney(debt.remaining)}</strong>
              </p>
              <p className="handover__confirm-ask">
                Bạn có chắc giao tài liệu cho khách khi <strong>chưa thu đủ tiền</strong> không?
              </p>
              <p className="handover__confirm-note">
                Hồ sơ sẽ ở trạng thái <strong>“Chưa hoàn thành”</strong> cho tới khi thu đủ công nợ,
                và việc bạn bấm nút này được ghi lại.
              </p>
            </div>
          ) : (
            <p className="handover__form-hint">Đã thu đủ công nợ. Xác nhận đã giao tài liệu cho khách.</p>
          )}
          <label>Ghi chú
            <input className="form-control" value={deliverNote}
              onChange={(e) => setDeliverNote(e.target.value)}
              placeholder="VD: khách cần gấp để làm thủ tục vay" />
          </label>
          <div className="handover__form-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setShowDeliver(false)}>Huỷ</button>
            <button type="button" className={`btn ${hasOutstandingDebt ? 'btn-danger' : 'btn-primary'}`}
              disabled={saving}
              onClick={async () => {
                const ok = await post('deliver',
                  { acknowledged_debt: hasOutstandingDebt, note: deliverNote || null },
                  hasOutstandingDebt ? 'Đã giao tài liệu — hồ sơ treo chờ thu đủ công nợ' : 'Đã ghi nhận bàn giao')
                if (ok) { setShowDeliver(false); setDeliverNote('') }
              }}>
              {saving ? 'Đang lưu…' : hasOutstandingDebt ? 'Vẫn giao tài liệu' : 'Xác nhận đã giao'}
            </button>
          </div>
        </div>
      </Modal>
      {/* Sensitive Action Modal for Handover Override */}
      <SensitiveActionModal
        isOpen={showOverrideModal}
        onClose={() => setShowOverrideModal(false)}
        onConfirm={handleOverrideHandover}
        title="Duyệt ngoại lệ bàn giao khi còn công nợ (Giám đốc)"
        description={`Hợp đồng ${state?.contract_id} hiện còn nợ ${formatMoney(debt.remaining)}. Sau khi duyệt ngoại lệ, quy trình sẽ được mở khóa hoàn thành Node K08.`}
        actionLabel="Duyệt cho nợ"
        actionVariant="warning"
        requireReason={true}
        placeholderReason="Nhập lý do duyệt cho nợ ngoại lệ (*)..."
        isLoading={saving}
        overlayClassName="modal-overlay--top"
      />
    </section>
  )
}
