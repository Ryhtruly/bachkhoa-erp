import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, FileWarning, Paperclip, X } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import ReceiptLinks from '../../components/finance/ReceiptLinks'
import { useToast } from '../../contexts/ToastContext'
import { apiFetch } from '../../lib/api'
import './approvals.css'

/**
 * Chờ tôi duyệt — hộp việc của Giám đốc.
 *
 * Trước đây phiếu thu vào trạng thái "Chờ duyệt" rồi nằm đó vĩnh viễn: API duyệt
 * có sẵn nhưng không màn hình nào gọi tới. Kế toán ghi tiền → công nợ không bao
 * giờ về 0 → node bàn giao không bao giờ đóng. Cả cổng công nợ thành vô dụng chỉ
 * vì thiếu một cái nút.
 *
 * Hộp này gom việc lại một chỗ. Giám đốc không đi tìm việc; việc tự tìm tới.
 */

const formatMoney = (v) => `${Number(v || 0).toLocaleString('vi-VN')}₫`

const formatDate = (v) => {
  if (!v) return '—'
  try { return new Intl.DateTimeFormat('vi-VN').format(new Date(v)) } catch { return v }
}

export default function PendingApprovals() {
  const { addToast } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewingRow, setViewingRow] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const payload = await apiFetch('/api/finance/cashflow?limit=300')
      const all = Array.isArray(payload) ? payload : (payload.data || [])
      // Chỉ lấy phiếu THU đang chờ duyệt và CÓ gắn hợp đồng — phiếu không gắn
      // hợp đồng là dữ liệu cũ, không ảnh hưởng công nợ, để lẫn vào chỉ gây nhiễu.
      setRows(all.filter((r) =>
        ['Chờ duyệt', 'PENDING'].includes(r.status)
        && ['Thu', 'INCOME'].includes(r.transaction_type ?? r.type)
        && r.contract_id))
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 20000)
    return () => clearInterval(id)
  }, [load])

  const handleDecision = async (decision) => {
    if (decision === 'reject' && rejectReason.trim().length < 5) {
      addToast('Từ chối phải ghi lý do', 'error')
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/api/finance/cashflow/${viewingRow.id}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: decision === 'reject' ? JSON.stringify({ reason: rejectReason.trim() }) : '{}',
      })
      addToast(decision === 'approve'
        ? `Đã duyệt ${formatMoney(viewingRow.amount)} — công nợ đã trừ`
        : 'Đã từ chối phiếu', 'success')
      setViewingRow(null)
      setRejectReason('')
      load()
    } catch (err) {
      addToast(err.message || 'Không thực hiện được', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading || rows.length === 0) return null

  const totalAmount = rows.reduce((s, r) => s + Number(r.amount || 0), 0)

  return (
    <section className="approvals">
      <header className="approvals__head">
        <div>
          <span className="approvals__count">{rows.length}</span>
          <div>
            <strong>Phiếu thu chờ tôi duyệt</strong>
            <p>Công nợ chỉ giảm sau khi duyệt. Chưa duyệt thì hồ sơ vẫn treo.</p>
          </div>
        </div>
        <span className="approvals__total">{formatMoney(totalAmount)}</span>
      </header>

      <ul className="approvals__list">
        {rows.slice(0, 6).map((r) => (
          <li key={r.id}>
            <button type="button" className="approvals__row" onClick={() => { setViewingRow(r); setRejectReason('') }}>
              <span className="approvals__partner">{r.payer_payee_name || r.payer_payee || 'Không rõ người nộp'}</span>
              <span className="approvals__contract">{r.contract_id}</span>
              <span className="approvals__amount">{formatMoney(r.amount)}</span>
              {r.receipt_attachments?.length || r.receipt_attachment_url
                ? <span className="approvals__bill" title="Có bill/biên lai"><Paperclip size={13} />{r.receipt_attachments?.length || 1}</span>
                : <span className="approvals__bill is-missing" title="Thiếu ảnh bill"><FileWarning size={13} /></span>}
            </button>
          </li>
        ))}
      </ul>
      {rows.length > 6 && <p className="approvals__more">và {rows.length - 6} phiếu nữa</p>}

      <Modal open={Boolean(viewingRow)} onClose={() => setViewingRow(null)} title="Duyệt phiếu thu">
        {viewingRow && (
          <div className="approvals__form">
            <div className="approvals__detail">
              <p><span>Người nộp</span><strong>{viewingRow.payer_payee_name || viewingRow.payer_payee || '—'}</strong></p>
              <p><span>Hợp đồng</span><strong>{viewingRow.contract_id}</strong></p>
              <p><span>Số tiền</span><strong className="is-money">{formatMoney(viewingRow.amount)}</strong></p>
              <p><span>Ngày thu</span><strong>{formatDate(viewingRow.transaction_date)}</strong></p>
              <p><span>Hình thức</span><strong>{viewingRow.payment_method || '—'}</strong></p>
            </div>

            {viewingRow.receipt_attachments?.length || viewingRow.receipt_attachment_url ? (
              <ReceiptLinks
                attachments={viewingRow.receipt_attachments}
                legacyUrl={viewingRow.receipt_attachment_url}
                addToast={addToast}
              />
            ) : (
              <p className="approvals__warn">
                <AlertTriangle size={14} /> Phiếu này <strong>không có ảnh bill</strong>. Duyệt nghĩa là
                tin vào lời khai, không có gì đối chiếu.
              </p>
            )}

            <label>Lý do từ chối <span className="approvals__hint">chỉ cần khi từ chối</span>
              <input className="form-control" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="VD: bill mờ không đọc được số tiền" />
            </label>

            <div className="approvals__form-footer">
              <button type="button" className="btn btn-secondary" disabled={saving}
                onClick={() => handleDecision('reject')}>
                <X size={15} /> Từ chối
              </button>
              <button type="button" className="btn btn-primary" disabled={saving}
                onClick={() => handleDecision('approve')}>
                <Check size={15} /> {saving ? 'Đang lưu…' : 'Duyệt phiếu'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
