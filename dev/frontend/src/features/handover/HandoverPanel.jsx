import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Circle, Eye, Lock, Paperclip, Plus, X } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import './handover.css'

/**
 * Khung đặc biệt cho node BÀN GIAO (K08) — cổng tài chính cuối cùng.
 *
 * Node này khác mọi node khác ở chỗ nó chia làm hai làn, hai người lo:
 *
 *     Làn A · HIỆN VẬT   NV phụ trách   → xong thì mở khoá bước Lưu trữ
 *     Làn B · TIỀN       Kế toán        → xong thì đóng được node
 *
 * Nguyên tắc: KHÔNG chặn bàn giao khi còn nợ. Hỏi xác nhận, cho giao, nhưng
 * quy trình treo ở "chưa hoàn thành" cho tới khi thu đủ rồi tự đóng.
 *
 * Backend quyết định mọi thứ (`can_do`, `can_close`, `blocked_reason`); khung này
 * chỉ vẽ ra và không tự suy luận.
 */

const tien = (v) => `${Number(v || 0).toLocaleString('vi-VN')}₫`

const ngay = (v) => {
  if (!v) return ''
  try { return new Intl.DateTimeFormat('vi-VN').format(new Date(v)) } catch { return v }
}

// Cột ngày trong lịch sử thu tiền rất hẹp. Năm chỉ đáng chiếm chỗ khi nó khác
// năm nay — mọi phiếu trong cùng năm thì "13/8" là đủ để phân biệt.
const ngayGon = (v) => {
  if (!v) return ''
  try {
    const d = new Date(v)
    return d.getFullYear() === new Date().getFullYear()
      ? `${d.getDate()}/${d.getMonth() + 1}`
      : new Intl.DateTimeFormat('vi-VN').format(d)
  } catch { return v }
}

export default function HandoverPanel({ taskNodeId, addToast, onChanged, readOnly = false }) {
  // Chế độ chỉ đọc chặn việc LÀM THAY nhân viên. Nhưng DUYỆT PHIẾU là việc của
  // chính giám đốc — phải bấm được ngay chỗ đang nhìn thấy tiền, không bắt họ
  // đi vòng sang màn hình khác.
  const [dangDuyet, setDangDuyet] = useState(null)
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPayment, setShowPayment] = useState(false)
  const [showDeliver, setShowDeliver] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ amount: '', receipt_photo_url: '', payment_method: 'Tiền mặt', note: '' })
  const [deliverNote, setDeliverNote] = useState('')

  const load = useCallback(async () => {
    if (!taskNodeId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/handover/${taskNodeId}`)
      if (!res.ok) {
        setState(null)
        setError(res.status === 400 ? '' : `Không tải được thông tin bàn giao (lỗi ${res.status}).`)
        return
      }
      setState((await res.json()).data)
    } catch {
      setError('Mất kết nối tới máy chủ.')
    } finally {
      setLoading(false)
    }
  }, [taskNodeId])

  useEffect(() => { load() }, [load])

  const post = useCallback(async (duong, than, thanhCong) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/handover/${taskNodeId}/${duong}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(than),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        addToast?.(payload.detail || 'Không thực hiện được', 'error')
        return false
      }
      addToast?.(thanhCong, 'success')
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

  const quyetPhieu = async (voucherId, dinh) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/finance/cashflow/${voucherId}/${dinh}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: dinh === 'reject' ? JSON.stringify({ reason: 'Từ chối tại bước bàn giao' }) : '{}',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        addToast?.(payload.detail || 'Không thực hiện được', 'error')
        return
      }
      addToast?.(dinh === 'approve' ? 'Đã duyệt — công nợ đã trừ' : 'Đã từ chối phiếu', 'success')
      setDangDuyet(null)
      await load()
      onChanged?.()
    } catch {
      addToast?.('Mất kết nối tới máy chủ', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="handover handover--loading">Đang tải khối công nợ…</div>
  if (error) return <div className="handover handover--error">{error}</div>
  if (!state) return null

  const { debt, gate, lane_a: lanA, lane_b: lanB, installments: dot } = state
  const conNo = !debt.is_settled

  return (
    <section className={`handover${conNo ? ' handover--debt' : ''}`}>
      {!gate.is_open && (
        <p className="handover__gate"><Lock size={14} /> {gate.reason} — chưa bàn giao được</p>
      )}

      {/* ── Tiền: một thẻ, một con số, một thanh ────────────────────
          Trước đây là bảng ba dòng Giá trị / Đã thu / Còn thiếu, ba con số
          cùng cỡ nên mắt không biết bám vào đâu. Người nhìn khối này chỉ hỏi
          đúng một câu: còn phải đòi bao nhiêu nữa. Cho con số đó cỡ lớn nhất,
          phần còn lại lùi xuống thành dòng phụ. */}
      <div className={`handover__money${conNo ? ' is-debt' : ' is-settled'}`}>
        <div className="handover__money-head">
          <span className="handover__money-state">
            {conNo ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            {conNo ? 'Còn thiếu' : 'Đã thu đủ'}
          </span>
          <strong className="handover__money-figure">
            {tien(conNo ? debt.remaining : debt.total_value)}
          </strong>
        </div>
        <div className="handover__money-bar" role="presentation">
          <span style={{ width: `${Math.min(100, Math.max(0, Number(debt.percent) || 0))}%` }} />
        </div>
        <p className="handover__money-detail">
          {tien(debt.paid)} / {tien(debt.total_value)} · {debt.percent}%
        </p>
        {debt.pending_amount > 0 && (
          <p className="handover__pending">
            <AlertTriangle size={13} /> {tien(debt.pending_amount)} đã ghi nhận nhưng
            <strong> giám đốc chưa duyệt</strong> — chưa trừ vào công nợ.
          </p>
        )}
      </div>

      {dot.length > 0 && (
        <div className="handover__history">
          <div className="handover__history-head">
            <span>Lịch sử thu tiền</span>
            <em>{dot.length} đợt</em>
          </div>
          <ul className="handover__installments">
            {dot.map((d) => (
              <li key={d.id} className={d.is_approved ? '' : 'is-pending'}>
                <span className="handover__inst-date">{ngayGon(d.transaction_date)}</span>
                <span className="handover__inst-amount">{tien(d.amount)}</span>
                {d.receipt_attachment_url
                  ? <a href={d.receipt_attachment_url} target="_blank" rel="noreferrer" title="Xem ảnh bill"><Paperclip size={13} /></a>
                  : <span className="handover__inst-nobill" title="Thiếu ảnh bill">—</span>}
                {d.is_approved ? (
                  <span className="handover__inst-status">Đã duyệt</span>
                ) : (
                  <span className="handover__inst-approve">
                    <button type="button" title="Duyệt phiếu này" disabled={saving}
                      onClick={() => quyetPhieu(d.id, 'approve')}>
                      <Check size={13} />
                    </button>
                    <button type="button" className="is-reject" title="Từ chối" disabled={saving}
                      onClick={() => quyetPhieu(d.id, 'reject')}>
                      <X size={13} />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Hai việc, hai người ─────────────────────────────────────
          Việc xong rồi thì chỉ cần biết AI làm và LÚC NÀO — mô tả cách làm là
          thừa. Việc chưa xong mới cần câu hướng dẫn. */}
      <div className="handover__lanes">
        {[lanA, lanB].map((lan, i) => {
          const laHoSo = i === 0
          const phu = lan.done
            ? [lan.actor, laHoSo ? ngay(lan.delivered_at) : null].filter(Boolean).join(' · ')
            : lan.desc
          return (
            <div key={lan.label} className={`handover__lane${lan.done ? ' is-done' : ''}`}>
              <span className="handover__lane-mark">
                {lan.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
              </span>
              <div>
                <strong>{lan.label}</strong>
                <p>{phu}</p>
                {laHoSo && lan.done && lan.acknowledged_debt && (
                  <small className="handover__lane-warn">
                    Giao khi còn thiếu {tien(lan.remaining_at_delivery)}
                  </small>
                )}
                {!lan.done && lan.actor && <small className="handover__lane-who">Người phụ trách: {lan.actor}</small>}
              </div>
              {!readOnly && laHoSo && lan.can_do && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowDeliver(true)}>
                  Xác nhận bàn giao
                </button>
              )}
              {!readOnly && !laHoSo && lan.can_record_payment && !lan.done && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPayment(true)}>
                  <Plus size={14} /> Ghi nhận thanh toán
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Xong rồi thì hai thẻ xanh ở trên đã nói hết — thêm một câu tổng kết
          nữa chỉ là lặp lại. Chỉ nói khi còn vướng, và nói đang vướng gì. */}
      {/* Cửa đóng thì lý do đã nằm ngay dòng khoá ở đầu khối — nhắc lại y nguyên
          ở cuối chỉ làm người đọc tưởng có hai vấn đề khác nhau. */}
      {!state.is_finished && (
        state.can_close
          ? <p className="handover__verdict is-ok">Đã giao hồ sơ và thu đủ tiền — trình nghiệm thu được.</p>
          : (gate.is_open || state.blocked_reason !== gate.reason) && (
            <p className="handover__verdict">{state.blocked_reason || 'Chưa đóng được bước này'}</p>
          )
      )}

      {readOnly && (
        /* Sơ đồ quy trình là màn hình của GIÁM ĐỐC — chỉ xem, không bấm thay ai. */
        <p className="handover__readonly"><Eye size={13} /> Chỉ xem — do người được phân công thực hiện</p>
      )}

      {/* ── Ghi nhận một đợt thu ───────────────────────────────── */}
      <Modal open={showPayment} onClose={() => setShowPayment(false)} title="Ghi nhận đợt thanh toán">
        <div className="handover__form">
          <p className="handover__form-hint">
            Còn thiếu <strong>{tien(debt.remaining)}</strong>. Phiếu tạo ra ở trạng thái
            <strong> Chờ duyệt</strong> — công nợ chỉ giảm sau khi giám đốc duyệt.
          </p>
          <label>Số tiền khách đưa
            <input className="form-control" type="number" min="0" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label>Ảnh bill / biên lai <span className="handover__req">bắt buộc</span>
            <input className="form-control" placeholder="Dán đường dẫn ảnh đã tải lên"
              value={form.receipt_photo_url}
              onChange={(e) => setForm({ ...form, receipt_photo_url: e.target.value })} />
          </label>
          <label>Hình thức
            <select className="form-control" value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              <option>Tiền mặt</option>
              <option>Chuyển khoản</option>
            </select>
          </label>
          <label>Ghi chú
            <input className="form-control" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <div className="handover__form-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setShowPayment(false)}>Huỷ</button>
            <button type="button" className="btn btn-primary"
              disabled={saving || !form.amount || !form.receipt_photo_url.trim()}
              onClick={async () => {
                const ok = await post('payments', {
                  amount: Number(form.amount),
                  receipt_photo_url: form.receipt_photo_url.trim(),
                  payment_method: form.payment_method,
                  note: form.note || null,
                }, 'Đã ghi nhận, chờ giám đốc duyệt')
                if (ok) { setShowPayment(false); setForm({ ...form, amount: '', receipt_photo_url: '', note: '' }) }
              }}>
              {saving ? 'Đang lưu…' : 'Ghi nhận'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Xác nhận bàn giao khi còn nợ ───────────────────────── */}
      <Modal open={showDeliver} onClose={() => setShowDeliver(false)} title="Xác nhận bàn giao">
        <div className="handover__form">
          {conNo ? (
            <div className="handover__confirm">
              <p className="handover__confirm-line">Giá trị <strong>{tien(debt.total_value)}</strong></p>
              <p className="handover__confirm-line">Đã thu <strong>{tien(debt.paid)}</strong> ({debt.percent}%)</p>
              <p className="handover__confirm-line handover__confirm-line--danger">
                Còn thiếu <strong>{tien(debt.remaining)}</strong>
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
            <button type="button" className={`btn ${conNo ? 'btn-danger' : 'btn-primary'}`}
              disabled={saving}
              onClick={async () => {
                const ok = await post('deliver',
                  { acknowledged_debt: conNo, note: deliverNote || null },
                  conNo ? 'Đã giao tài liệu — hồ sơ treo chờ thu đủ công nợ' : 'Đã ghi nhận bàn giao')
                if (ok) { setShowDeliver(false); setDeliverNote('') }
              }}>
              {saving ? 'Đang lưu…' : conNo ? 'Vẫn giao tài liệu' : 'Xác nhận đã giao'}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
