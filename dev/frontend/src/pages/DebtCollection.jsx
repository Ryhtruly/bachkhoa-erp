import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Lock, PackageCheck, Plus, RefreshCw } from 'lucide-react'
import Modal from '../components/ui/Modal'
import { useToast } from '../contexts/ToastContext'
import './debtCollection.css'

/**
 * Thu Công Nợ — màn hình làm việc của Kế toán.
 *
 * Trước đây kế toán phải đi Hợp Đồng → chọn hợp đồng → Quy trình → tìm node K08
 * mới thấy nút ghi nhận tiền. Bốn cú bấm, và phải TỰ BIẾT hợp đồng nào còn nợ —
 * thứ mà hệ thống đã biết sẵn.
 *
 * Danh sách này tự sinh từ những hồ sơ đã giao cho khách mà chưa thu đủ tiền.
 * Thu đủ thì dòng đó tự biến mất. Không ai phải đánh dấu gì.
 */

const tien = (v) => `${Number(v || 0).toLocaleString('vi-VN')}₫`

const ngay = (v) => {
  if (!v) return '—'
  try { return new Intl.DateTimeFormat('vi-VN').format(new Date(v)) } catch { return v }
}

const soNgay = (v) => {
  if (!v) return null
  const d = Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000)
  return d > 0 ? d : 0
}

export default function DebtCollection() {
  const { addToast } = useToast()
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ total: 0, total_remaining: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dangGhi, setDangGhi] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ amount: '', receipt_photo_url: '', payment_method: 'Tiền mặt', note: '' })

  const load = useCallback(async (hienVongXoay = true) => {
    if (hienVongXoay) setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/handover/outstanding')
      if (!res.ok) {
        setError(`Không tải được danh sách (lỗi ${res.status}).`)
        return
      }
      const payload = await res.json()
      setRows(payload.data || [])
      setMeta(payload.meta || { total: 0, total_remaining: 0 })
    } catch {
      setError('Mất kết nối tới máy chủ.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => load(false), 15000)
    return () => clearInterval(id)
  }, [load])

  const ghiNhan = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/handover/${dangGhi.task_node_id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(form.amount),
          receipt_photo_url: form.receipt_photo_url.trim(),
          payment_method: form.payment_method,
          note: form.note || null,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        addToast(payload.detail || 'Không ghi nhận được', 'error')
        return
      }
      addToast(`Đã ghi nhận ${tien(form.amount)} — chờ giám đốc duyệt`, 'success')
      setDangGhi(null)
      setForm({ amount: '', receipt_photo_url: '', payment_method: 'Tiền mặt', note: '' })
      load(false)
    } catch {
      addToast('Mất kết nối tới máy chủ', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="debt">
      <header className="debt__head">
        <div>
          <span className="debt__eyebrow">Kế toán</span>
          <h2>Thu công nợ</h2>
          <p>Hồ sơ đã giao cho khách nhưng chưa thu đủ tiền. Thu đủ thì tự biến mất khỏi danh sách.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => load()}>
          <RefreshCw size={14} /> Làm mới
        </button>
      </header>

      <div className="debt__totals">
        <div className="debt__total">
          <span>Hồ sơ đang nợ</span>
          <strong>{meta.total}</strong>
        </div>
        <div className="debt__total debt__total--money">
          <span>Tổng còn phải thu</span>
          <strong>{tien(meta.total_remaining)}</strong>
        </div>
      </div>

      {loading ? (
        <p className="debt__msg">Đang tải…</p>
      ) : error ? (
        <div className="debt__msg debt__msg--error">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => load()}>Thử lại</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="debt__empty">
          <CheckCircle2 size={30} />
          <strong>Không còn hồ sơ nào nợ tiền</strong>
          <span>Mọi hồ sơ đã bàn giao đều đã thu đủ. Hồ sơ mới sẽ tự hiện ở đây khi nhân viên giao tài liệu cho khách.</span>
        </div>
      ) : (
        <ul className="debt__list">
          {rows.map((r) => {
            const ngayTreo = soNgay(r.delivered_at)
            return (
              <li key={r.task_node_id} className="debt__card">
                <div className="debt__card-head">
                  <div>
                    <span className="debt__contract">{r.contract_id}</span>
                    <strong className="debt__customer">{r.customer_name || 'Chưa có tên khách'}</strong>
                    <span className="debt__service">{r.service_type}</span>
                  </div>
                  {r.da_ban_giao ? (
                    <span className={`debt__age${ngayTreo >= 7 ? ' is-late' : ''}`}>
                      {ngayTreo === 0 ? 'Giao hôm nay' : `Đã giao ${ngayTreo} ngày`}
                    </span>
                  ) : (
                    <span className={`debt__age ${r.blocked_reason ? 'debt__age--blocked' : 'debt__age--waiting'}`}>
                      {r.blocked_reason ? 'Chờ pháp lý' : 'Chưa bàn giao'}
                    </span>
                  )}
                </div>

                <div className="debt__bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, Math.round((r.paid / (r.total_value || 1)) * 100))}%` }} />
                </div>

                <div className="debt__figures">
                  <span>Giá trị <strong>{tien(r.total_value)}</strong></span>
                  <span>Đã thu <strong>{tien(r.paid)}</strong></span>
                  <span className="is-owed">Còn thiếu <strong>{tien(r.remaining)}</strong></span>
                </div>

                {/* Nút chết là thứ tệ nhất: người dùng bấm rồi mới biết không được.
                    Chặn thì nói thẳng đang chờ ai. */}
                {r.blocked_reason && (
                  <p className="debt__blocked"><Lock size={13} /> {r.blocked_reason}</p>
                )}

                {/* Kế toán chỉ lo tiền. Người mang hồ sơ đến cho khách và lấy chữ
                    ký là người phụ trách hồ sơ — cho biết đang chờ ai, đừng mời
                    bấm một nút sẽ bị chặn. */}
                {!r.da_ban_giao && !r.blocked_reason && (
                  <p className="debt__waiting">
                    <PackageCheck size={13} /> Chờ {r.nguoi_giao || 'người phụ trách hồ sơ'} giao hồ sơ cho khách
                  </p>
                )}

                <div className="debt__actions">
                  {r.remaining > 0 && (
                    <button type="button" className="btn btn-primary btn-sm"
                      onClick={() => { setDangGhi(r); setForm((f) => ({ ...f, amount: '' })) }}>
                      <Plus size={14} /> Ghi nhận thanh toán
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal open={Boolean(dangGhi)} onClose={() => setDangGhi(null)} title="Ghi nhận thanh toán">
        {dangGhi && (
          <div className="debt__form">
            <p className="debt__form-hint">
              <strong>{dangGhi.customer_name}</strong> · {dangGhi.contract_id}<br />
              Còn thiếu <strong>{tien(dangGhi.remaining)}</strong>. Phiếu tạo ra ở trạng thái
              <strong> Chờ duyệt</strong> — công nợ chỉ giảm sau khi giám đốc duyệt.
            </p>
            <label>Số tiền khách đưa
              <input className="form-control" type="number" min="0" max={dangGhi.remaining}
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label>Ảnh bill / biên lai <span className="debt__req">bắt buộc</span>
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
            {Number(form.amount) > dangGhi.remaining && (
              <p className="debt__warn"><AlertTriangle size={14} /> Vượt quá số còn thiếu.</p>
            )}
            <div className="debt__form-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setDangGhi(null)}>Huỷ</button>
              <button type="button" className="btn btn-primary"
                disabled={saving || !form.amount || Number(form.amount) <= 0
                  || Number(form.amount) > dangGhi.remaining || !form.receipt_photo_url.trim()}
                onClick={ghiNhan}>
                {saving ? 'Đang lưu…' : 'Ghi nhận'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
