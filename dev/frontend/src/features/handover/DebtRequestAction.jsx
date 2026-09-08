import { useCallback, useEffect, useState } from 'react'
import { Clock3, ShieldAlert } from 'lucide-react'

import ReceiptFileInput from '../../components/finance/ReceiptFileInput'
import Modal from '../../components/ui/Modal'
import { apiFetch } from '../../lib/api'

const money = value => `${Number(value || 0).toLocaleString('vi-VN')}₫`

export default function DebtRequestAction({ taskNodeId, addToast, onChanged, onStateChange }) {
  const [state, setState] = useState(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState('')
  const [promisedDate, setPromisedDate] = useState('')
  const [files, setFiles] = useState([])

  const load = useCallback(async () => {
    if (!taskNodeId) return
    try {
      const response = await apiFetch(`/api/handover/${taskNodeId}`)
      const next = response?.data || null
      setState(next)
      onStateChange?.(next)
    } catch (error) {
      addToast?.(error.message || 'Không đọc được trạng thái công nợ', 'error')
    }
  }, [addToast, onStateChange, taskNodeId])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (saving) return
    const body = new FormData()
    body.append('reason', reason.trim())
    body.append('promised_payment_date', promisedDate)
    if (files[0]) body.append('commitment_file', files[0])
    setSaving(true)
    try {
      await apiFetch(`/api/handover/${taskNodeId}/debt-requests`, { method: 'POST', body })
      setOpen(false)
      setReason('')
      setPromisedDate('')
      setFiles([])
      addToast?.('Đã gửi yêu cầu, chờ Giám đốc duyệt nợ', 'success')
      await load()
      await onChanged?.()
    } catch (error) {
      addToast?.(error.message || 'Không gửi được yêu cầu duyệt nợ', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!state) return null
  if (state?.debt_request?.status === 'pending') {
    return <button type="button" className="eiw-btn eiw-btn--debt" disabled>
      <Clock3 size={14} /> Chờ duyệt nợ
    </button>
  }
  if (!state.can_request_debt) {
    if (state.debt?.is_settled || (state.debt?.remaining ?? 0) <= 0.009) {
      return (
        <button
          type="button"
          className="eiw-btn eiw-btn--debt is-disabled"
          disabled
          title="Hợp đồng đã thu đủ 100% tiền — không cần xin duyệt nợ"
        >
          <ShieldAlert size={14} /> Xin duyệt nợ
        </button>
      )
    }
    if (state.debt?.gate_open) {
      return (
        <button
          type="button"
          className="eiw-btn eiw-btn--debt is-disabled"
          disabled
          title="Đã được Giám đốc duyệt cho nợ"
        >
          <ShieldAlert size={14} /> Đã duyệt nợ
        </button>
      )
    }
    return null
  }

  const valid = reason.trim().length >= 10 && Boolean(promisedDate) && files.length > 0

  return <>
    <button type="button" className="eiw-btn eiw-btn--debt" onClick={() => setOpen(true)}>
      <ShieldAlert size={14} /> Xin duyệt nợ
    </button>
    <Modal
      open={open}
      onClose={() => !saving && setOpen(false)}
      title="Xin duyệt nợ cho K06"
      size="sm"
      overlayClassName="modal-overlay--top"
    >
      <div className="handover__form">
        <p className="handover__form-hint">
          Hợp đồng còn nợ <strong>{money(state.debt?.remaining)}</strong>. Duyệt nợ chỉ mở nút nộp nghiệm thu K06, không xóa công nợ.
        </p>
        <label htmlFor="k06-debt-reason">Lý do xin duyệt nợ *</label>
        <textarea
          id="k06-debt-reason"
          className="form-control"
          rows={3}
          value={reason}
          onChange={event => setReason(event.target.value)}
          placeholder="Nêu rõ lý do và phương án thanh toán (ít nhất 10 ký tự)"
        />
        <label htmlFor="k06-debt-date">Hạn thanh toán cam kết *</label>
        <input
          id="k06-debt-date"
          className="form-control"
          type="date"
          min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
          value={promisedDate}
          onChange={event => setPromisedDate(event.target.value)}
        />
        <div className="receipt-field">
          <span className="receipt-field__label">Cam kết thanh toán *</span>
          <ReceiptFileInput files={files} onChange={next => setFiles(next.slice(0, 1))} disabled={saving} />
        </div>
        <div className="handover__form-footer">
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setOpen(false)}>Hủy</button>
          <button type="button" className="btn btn-primary" disabled={saving || !valid} onClick={submit}>
            {saving ? 'Đang gửi…' : 'Gửi yêu cầu'}
          </button>
        </div>
      </div>
    </Modal>
  </>
}
