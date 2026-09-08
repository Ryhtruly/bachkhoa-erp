import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarClock, CheckCircle2, CircleDollarSign, XCircle } from 'lucide-react'

import ReceiptLinks from '../../components/finance/ReceiptLinks'
import { SensitiveActionModal } from '../../components/ui'
import { apiFetch } from '../../lib/api'
import './handover.css'

const money = value => `${Number(value || 0).toLocaleString('vi-VN')}₫`
const date = value => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : 'Chưa hẹn'

export default function DebtReviewCard({
  taskNodeId,
  targetRequestId,
  focusNonce,
  addToast,
  onChanged,
}) {
  const [state, setState] = useState(null)
  const [saving, setSaving] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const cardRef = useRef(null)

  const load = useCallback(async () => {
    if (!taskNodeId) return
    try {
      const response = await apiFetch(`/api/handover/${taskNodeId}`)
      setState(response?.data || null)
    } catch (error) {
      addToast?.(error.message || 'Không đọc được yêu cầu duyệt nợ', 'error')
    }
  }, [addToast, taskNodeId])

  useEffect(() => { load() }, [load])

  const request = state?.debt_request
  useEffect(() => {
    if (!request || request.id !== targetRequestId || !focusNonce) return
    const frame = requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      cardRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusNonce, request, targetRequestId])

  const review = async (decision, reviewNote) => {
    if (!request?.id || saving) return
    setSaving(true)
    try {
      await apiFetch(`/api/handover/debt-requests/${request.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, review_note: reviewNote || null }),
      })
      setRejectOpen(false)
      addToast?.(decision === 'approved' ? 'Đã duyệt cho nợ và mở K06' : 'Đã không duyệt yêu cầu nợ', 'success')
      await load()
      await onChanged?.()
    } catch (error) {
      addToast?.(error.message || 'Không xử lý được yêu cầu duyệt nợ', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!request || request.status !== 'pending') return null

  return <>
    <section
      ref={cardRef}
      tabIndex={-1}
      data-testid="debt-review-card"
      data-request-id={request.id}
      className={`handover-debt-review${request.id === targetRequestId ? ' is-targeted' : ''}`}
      aria-label="Yêu cầu duyệt nợ đang chờ"
    >
      <div className="handover-debt-review__head">
        <span><CircleDollarSign size={16} /> Xin duyệt nợ</span>
        <strong>{money(request.remaining_amount_snapshot ?? state.debt?.remaining)}</strong>
      </div>
      <dl>
        <div><dt>Người đề nghị</dt><dd>{request.requester_name || 'Nhân viên phụ trách'}</dd></div>
        <div><dt>Lý do</dt><dd>{request.reason}</dd></div>
        <div><dt>Ngày hẹn</dt><dd><CalendarClock size={13} /> {date(request.promised_payment_date)}</dd></div>
      </dl>
      {request.commitment_attachment && (
        <ReceiptLinks attachments={[request.commitment_attachment]} addToast={addToast} compact />
      )}
      <div className="handover-debt-review__actions">
        <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setRejectOpen(true)}>
          <XCircle size={14} /> Không duyệt
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => review('approved', null)}>
          <CheckCircle2 size={14} /> Duyệt cho nợ
        </button>
      </div>
    </section>
    <SensitiveActionModal
      open={rejectOpen}
      onClose={() => setRejectOpen(false)}
      onConfirm={reason => review('rejected', reason)}
      title="Không duyệt yêu cầu nợ"
      description="Ghi rõ lý do để nhân viên biết cần bổ sung điều kiện gì trước khi gửi lại."
      actionLabel="Xác nhận không duyệt"
      actionVariant="danger"
      placeholderReason="Ghi rõ lý do không duyệt (*)"
      isLoading={saving}
      overlayClassName="modal-overlay--top"
    />
  </>
}
