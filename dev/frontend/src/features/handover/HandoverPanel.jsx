import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  Eye,
  FolderDown,
  Lock,
  Plus,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { SensitiveActionModal, Select } from '../../components/ui'
import ReceiptFileInput from '../../components/finance/ReceiptFileInput'
import ReceiptLinks from '../../components/finance/ReceiptLinks'
import { buildPaymentFormData } from '../../components/finance/paymentReceipts'
import { apiFetch, getAccessToken } from '../../lib/api'
import './handover.css'

const formatMoney = (value) => `${Number(value || 0).toLocaleString('vi-VN')}₫`

const formatDate = (value) => {
  if (!value) return ''
  try { return new Intl.DateTimeFormat('vi-VN').format(new Date(value)) } catch { return value }
}

const CHECKLIST_EDITABLE_STATUSES = new Set(['pending', 'failed', 'NOT_STARTED', 'REJECTED'])

export default function HandoverPanel({
  taskNodeId,
  addToast,
  onChanged,
  onRefresh,
  isDirector = false,
  checklist = [],
  deadlineAt = null,
  readOnly = false,
  hideIfNotHandover = false,
}) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [showDebtRequest, setShowDebtRequest] = useState(false)
  const [showApproveRequest, setShowApproveRequest] = useState(false)
  const [showRejectRequest, setShowRejectRequest] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_method: 'Tiền mặt', note: '' })
  const [paymentFiles, setPaymentFiles] = useState([])
  const [requestForm, setRequestForm] = useState({ reason: '', promised_payment_date: '' })
  const [commitmentFiles, setCommitmentFiles] = useState([])
  const [checklistFiles, setChecklistFiles] = useState({})
  const [checklistLateReasons, setChecklistLateReasons] = useState({})
  const [submittingChecklistId, setSubmittingChecklistId] = useState(null)
  const [deliverables, setDeliverables] = useState(null)
  const [downloading, setDownloading] = useState(false)

  const refreshParent = useCallback(async () => {
    await (onRefresh || onChanged)?.()
  }, [onRefresh, onChanged])

  const load = useCallback(async () => {
    if (!taskNodeId) {
      setState(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const payload = await apiFetch(`/api/handover/${taskNodeId}`)
      setState(payload?.data || null)
    } catch (loadError) {
      setState(null)
      setError(loadError?.status === 400
        ? (hideIfNotHandover ? '' : 'Bước này chưa được cấu hình là bước bàn giao.')
        : (loadError?.message || 'Mất kết nối tới máy chủ.'))
    } finally {
      setLoading(false)
    }
  }, [hideIfNotHandover, taskNodeId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!taskNodeId) return undefined
    let cancelled = false
    apiFetch(`/api/handover/${taskNodeId}/deliverables`)
      .then((payload) => { if (!cancelled) setDeliverables(payload?.data || null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [taskNodeId])

  const refreshAll = useCallback(async () => {
    await load()
    await refreshParent()
  }, [load, refreshParent])

  const submitChecklistEvidence = useCallback(async (item) => {
    const files = checklistFiles[item.id] || []
    const isLate = Boolean(deadlineAt && new Date(deadlineAt).getTime() < Date.now())
    const lateReason = (checklistLateReasons[item.id] || '').trim()
    if (item.require_evidence && files.length === 0) {
      addToast?.('Checklist này bắt buộc có minh chứng', 'error')
      return
    }
    if (isLate && !lateReason) {
      addToast?.('Bắt buộc nhập lý do nộp trễ', 'error')
      return
    }

    const body = new FormData()
    if (files[0]) body.append('file', files[0])
    if (lateReason) body.append('late_reason', lateReason)
    setSubmittingChecklistId(item.id)
    try {
      await apiFetch(`/api/employee-portal/tasks/${taskNodeId}/checklist/${item.id}/submit`, {
        method: 'POST',
        ...((files.length || lateReason) ? { body } : {}),
      })
      addToast?.('Đã nộp checklist, chờ Giám đốc nghiệm thu', 'success')
      setChecklistFiles((current) => ({ ...current, [item.id]: [] }))
      setChecklistLateReasons((current) => ({ ...current, [item.id]: '' }))
      await refreshAll()
    } catch (submitError) {
      addToast?.(submitError.message || 'Không thể nộp checklist', 'error')
    } finally {
      setSubmittingChecklistId(null)
    }
  }, [addToast, checklistFiles, checklistLateReasons, deadlineAt, refreshAll, taskNodeId])

  const sendDebtRequest = useCallback(async () => {
    setSaving(true)
    try {
      const body = new FormData()
      body.append('reason', requestForm.reason.trim())
      body.append('promised_payment_date', requestForm.promised_payment_date)
      if (commitmentFiles[0]) body.append('commitment_file', commitmentFiles[0])
      await apiFetch(`/api/handover/${taskNodeId}/debt-requests`, {
        method: 'POST',
        body,
      })
      setShowDebtRequest(false)
      setRequestForm({ reason: '', promised_payment_date: '' })
      setCommitmentFiles([])
      addToast?.('Đã gửi yêu cầu, chờ Giám đốc duyệt nợ', 'success')
      await refreshAll()
    } catch (requestError) {
      addToast?.(requestError.message || 'Mất kết nối tới máy chủ', 'error')
    } finally {
      setSaving(false)
    }
  }, [addToast, commitmentFiles, refreshAll, requestForm, taskNodeId])

  const reviewDebtRequest = useCallback(async (decision, reviewNote) => {
    if (!state?.debt_request?.id) return
    setSaving(true)
    try {
      await apiFetch(`/api/handover/debt-requests/${state.debt_request.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, review_note: reviewNote || null }),
      })
      setShowApproveRequest(false)
      setShowRejectRequest(false)
      addToast?.(decision === 'approved' ? 'Đã duyệt nợ và mở khóa K06' : 'Đã từ chối yêu cầu', 'success')
      await refreshAll()
    } catch (reviewError) {
      addToast?.(reviewError.message || 'Mất kết nối tới máy chủ', 'error')
    } finally {
      setSaving(false)
    }
  }, [addToast, refreshAll, state?.debt_request?.id])

  const submitPayment = useCallback(async () => {
    setSaving(true)
    try {
      await apiFetch(`/api/handover/${taskNodeId}/payments`, {
        method: 'POST',
        body: buildPaymentFormData(paymentForm, paymentFiles),
      })
      setShowPayment(false)
      setPaymentForm({ amount: '', payment_method: 'Tiền mặt', note: '' })
      setPaymentFiles([])
      addToast?.('Đã ghi nhận, chờ Giám đốc duyệt phiếu thu', 'success')
      await refreshAll()
    } catch (paymentError) {
      addToast?.(paymentError.message || 'Mất kết nối tới máy chủ', 'error')
    } finally {
      setSaving(false)
    }
  }, [addToast, paymentFiles, paymentForm, refreshAll, taskNodeId])

  const downloadAll = useCallback(async () => {
    setDownloading(true)
    try {
      const token = getAccessToken()
      const response = await fetch(`/api/handover/${taskNodeId}/deliverables.zip`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail || 'Không tải được bộ hồ sơ')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `HoSoBanGiao_${(state?.contract_id || '').replace(/\//g, '-')}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (downloadError) {
      addToast?.(downloadError.message, 'error')
    } finally {
      setDownloading(false)
    }
  }, [addToast, state?.contract_id, taskNodeId])

  const checklistLocked = useMemo(() => (
    readOnly
    || !state?.lane_a?.can_do
    || state?.node_status !== 'in_progress'
    || state?.business_status === 'pending_acceptance'
  ), [readOnly, state?.business_status, state?.lane_a?.can_do, state?.node_status])

  if (loading) return <div className="handover handover--loading">Đang tải bước bàn giao…</div>
  if (error) return error ? <p className="handover handover--pending"><Lock size={14} /> {error}</p> : null
  if (!state) return null

  const { debt, gate, lane_a: delivery, lane_b: collection, installments = [], debt_request: debtRequest } = state
  const hasOutstandingDebt = Number(debt.remaining || 0) > 0.009
  const requestPending = debtRequest?.status === 'pending'
  const requestApproved = debtRequest?.status === 'approved'
  const isWorkAccepted = state.business_status === 'work_accepted_awaiting_payment'
  const isCompleted = state.business_status === 'completed'

  return (
    <section className={`handover${hasOutstandingDebt ? ' handover--debt' : ''}`}>
      {!gate.is_open && <p className="handover__gate"><Lock size={14} /> {gate.reason}</p>}

      <div className={`handover__status handover__status--${state.business_status || 'in_progress'}`}>
        {state.business_status === 'debt_locked' && <><Lock size={15} /> Khóa nợ</>}
        {state.business_status === 'debt_request_pending' && <><Clock3 size={15} /> Chờ Giám đốc duyệt nợ</>}
        {state.business_status === 'in_progress' && <><Circle size={15} /> Đang thực hiện</>}
        {isWorkAccepted && <><ShieldCheck size={15} /> Đã bàn giao — còn công nợ</>}
        {isCompleted && <><CheckCircle2 size={15} /> Đã hoàn thành</>}
      </div>

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
        {Number(debt.pending_amount || 0) > 0 && (
          <p className="handover__pending"><AlertTriangle size={13} /> {formatMoney(debt.pending_amount)} đang chờ duyệt phiếu thu.</p>
        )}
        {requestApproved && (
          <p className="handover__override-note">
            <ShieldCheck size={14} /> Đã duyệt ngoại lệ cho nợ — chỉ mở khóa bàn giao, công nợ vẫn còn {formatMoney(debt.remaining)}.
          </p>
        )}
        {requestPending && (
          <div className="handover__request-summary">
            <strong>Lý do:</strong> {debtRequest.reason}
            <span>Hẹn thanh toán: {formatDate(debtRequest.promised_payment_date)}</span>
          </div>
        )}
        {debtRequest?.commitment_attachment && (
          <div className="handover__request-summary">
            <strong>File cam kết</strong>
            <ReceiptLinks
              attachments={[debtRequest.commitment_attachment]}
              addToast={addToast}
            />
          </div>
        )}
      </div>

      {installments.length > 0 && (
        <div className="handover__history">
          <div className="handover__history-head"><span>Lịch sử thu tiền</span><em>{installments.length} đợt</em></div>
          <ul className="handover__installments">
            {installments.map((item) => (
              <li key={item.id} className={item.is_approved ? '' : 'is-pending'}>
                <span className="handover__inst-date">{formatDate(item.transaction_date)}</span>
                <span className="handover__inst-amount">{formatMoney(item.amount)}</span>
                {item.receipt_attachments?.length || item.receipt_attachment_url
                  ? <ReceiptLinks attachments={item.receipt_attachments} legacyUrl={item.receipt_attachment_url} addToast={addToast} compact />
                  : <span>—</span>}
                <span className={`handover__inst-status${item.is_approved ? '' : ' is-waiting'}`}>
                  {item.is_approved ? 'Đã duyệt' : 'Chờ duyệt'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {deliverables?.items?.length > 0 && (
        <div className="handover__package">
          <div>
            <strong>Bộ hồ sơ bàn giao</strong>
            <p>{deliverables.items.length} tài liệu từ hợp đồng, hồ sơ, bản vẽ và minh chứng.</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!deliverables.can_download || downloading} onClick={downloadAll}>
            <FolderDown size={15} /> {downloading ? 'Đang gói…' : 'Tải trọn bộ'}
          </button>
        </div>
      )}

      <div className="handover__cards">
        <article className={`handover__card${delivery?.done ? ' is-done' : ''}${checklistLocked ? ' is-locked' : ''}`}>
          <span className="handover__card-mark">{delivery?.done ? <CheckCircle2 size={17} /> : <Circle size={17} />}</span>
          <div className="handover__card-body">
            <strong>Giao hồ sơ cho khách</strong>
            {delivery?.actor && <small className="handover__card-who">Người phụ trách: {delivery.actor}</small>}

            {checklist.length > 0 && (
              <div className="handover__checklist">
                <span className="handover__checklist-title">Checklist minh chứng bàn giao</span>
                {checklist.map((item) => {
                  const itemFiles = checklistFiles[item.id] || []
                  const canSubmitItem = !checklistLocked && CHECKLIST_EDITABLE_STATUSES.has(item.status)
                  const isLate = Boolean(deadlineAt && new Date(deadlineAt).getTime() < Date.now())
                  return (
                    <div key={item.id || item.key} className="handover__checklist-item">
                      <div className="handover__checklist-row">
                        <span>{item.name}</span>
                        <em>{item.require_evidence ? 'Bắt buộc có minh chứng' : 'Minh chứng tùy chọn'}</em>
                      </div>
                      <small>Trạng thái: {item.status_label || item.status || 'Chưa thực hiện'}</small>
                      {canSubmitItem && (
                        <div className="handover__checklist-submit">
                          <ReceiptFileInput
                            files={itemFiles}
                            onChange={(files) => setChecklistFiles((current) => ({ ...current, [item.id]: files.slice(0, 1) }))}
                            disabled={submittingChecklistId === item.id}
                          />
                          {isLate && (
                            <input
                              className="form-control"
                              value={checklistLateReasons[item.id] || ''}
                              onChange={(event) => setChecklistLateReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                              placeholder="Lý do nộp trễ (bắt buộc)"
                            />
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={submittingChecklistId === item.id || (item.require_evidence && itemFiles.length === 0)}
                            onClick={() => submitChecklistEvidence(item)}
                          >
                            <UploadCloud size={14} /> {submittingChecklistId === item.id ? 'Đang nộp…' : 'Nộp checklist'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
)}
          </div>
        </article>

        <article className={`handover__card${collection?.done || debt.is_settled ? ' is-done' : ''}`}>
          <span className="handover__card-mark">{debt.is_settled ? <CheckCircle2 size={17} /> : <Circle size={17} />}</span>
          <div className="handover__card-body">
            <strong>Thu đủ tiền hợp đồng</strong>
            {collection?.actor && <small className="handover__card-who">Người phụ trách: {collection.actor}</small>}
            {!readOnly && collection?.can_record_payment && !debt.is_settled && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPayment(true)}>
                <Plus size={14} /> Ghi nhận thanh toán
              </button>
            )}
          </div>
        </article>

      </div>

      {readOnly && !isDirector && <p className="handover__readonly"><Eye size={13} /> Chỉ xem</p>}

      <div className="handover__footer">
        {isDirector && requestPending ? (
          <>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setShowRejectRequest(true)}>
              <XCircle size={15} /> Từ chối
            </button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => setShowApproveRequest(true)}>
              <ShieldCheck size={15} /> Duyệt nợ
            </button>
          </>
        ) : !readOnly && state.can_request_debt ? (
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => setShowDebtRequest(true)}>
            Xin duyệt nợ
          </button>
        ) : !readOnly && requestPending ? (
          <button type="button" className="btn btn-primary" disabled>Chờ duyệt nợ</button>
        ) : null}
      </div>

      <Modal open={showDebtRequest} onClose={() => setShowDebtRequest(false)} title="Xin duyệt bàn giao khi còn nợ" overlayClassName="modal-overlay--top">
        <div className="handover__form">
          <p className="handover__form-hint">Số tiền còn nợ: <strong>{formatMoney(debt.remaining)}</strong>. Phê duyệt chỉ mở khóa K06, không xóa công nợ.</p>
          <label>Lý do bàn giao khi còn nợ
            <textarea
              className="form-control"
              rows={3}
              placeholder="Nêu rõ vì sao cho nợ (tối thiểu 5 ký tự)..."
              value={requestForm.reason}
              onChange={(event) => setRequestForm((current) => ({ ...current, reason: event.target.value }))}
            />
          </label>
          <label>Hạn thanh toán cam kết
            <input
              className="form-control"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={requestForm.promised_payment_date}
              onChange={(event) => setRequestForm((current) => ({ ...current, promised_payment_date: event.target.value }))}
            />
          </label>
          <div className="receipt-field">
            <span className="receipt-field__label">File cam kết (nếu có)</span>
            <ReceiptFileInput files={commitmentFiles} onChange={(files) => setCommitmentFiles(files.slice(0, 1))} disabled={saving} />
          </div>
          <div className="handover__form-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setShowDebtRequest(false)}>Hủy</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || requestForm.reason.trim().length < 5 || !requestForm.promised_payment_date}
              onClick={sendDebtRequest}
            >
              {saving ? 'Đang gửi…' : 'Gửi yêu cầu'}
            </button>
          </div>
        </div>
      </Modal>

      <SensitiveActionModal
        isOpen={showApproveRequest}
        onClose={() => setShowApproveRequest(false)}
        onConfirm={(reason) => reviewDebtRequest('approved', reason)}
        title="Duyệt bàn giao khi còn công nợ"
        description={`Chỉ mở khóa Node này. Hợp đồng vẫn còn nợ ${formatMoney(debt.remaining)} và thẻ Kế toán tiếp tục báo đỏ.`}
        actionLabel="Xác nhận duyệt nợ"
        actionVariant="warning"
        requireReason
        placeholderReason="Ghi chú phê duyệt (*)"
        isLoading={saving}
        overlayClassName="modal-overlay--top"
      />

      <SensitiveActionModal
        isOpen={showRejectRequest}
        onClose={() => setShowRejectRequest(false)}
        onConfirm={(reason) => reviewDebtRequest('rejected', reason)}
        title="Từ chối yêu cầu bàn giao trước"
        description="Checklist và minh chứng của K06 sẽ tiếp tục bị khóa cho đến khi thu đủ tiền hoặc có yêu cầu mới được duyệt."
        actionLabel="Xác nhận từ chối"
        actionVariant="danger"
        requireReason
        placeholderReason="Ghi rõ lý do từ chối (*)"
        isLoading={saving}
        overlayClassName="modal-overlay--top"
      />

      <Modal open={showPayment} onClose={() => setShowPayment(false)} title="Ghi nhận đợt thanh toán" overlayClassName="modal-overlay--top">
        <div className="handover__form">
          <p className="handover__form-hint">Còn thiếu <strong>{formatMoney(debt.remaining)}</strong>. Công nợ chỉ giảm sau khi phiếu được duyệt.</p>
          <label>Số tiền khách đưa
            <input className="form-control" type="number" min="0" value={paymentForm.amount}
              onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} />
          </label>
          <div className="receipt-field">
            <span className="receipt-field__label">Ảnh bill / biên lai *</span>
            <ReceiptFileInput files={paymentFiles} onChange={setPaymentFiles} disabled={saving} />
          </div>
          <label>Hình thức
            <Select
              value={paymentForm.payment_method}
              options={[
                { value: 'Tiền mặt', label: 'Tiền mặt' },
                { value: 'Chuyển khoản', label: 'Chuyển khoản' },
              ]}
              onChange={(value) => setPaymentForm((current) => ({ ...current, payment_method: value }))}
              className="ui-select--field"
            />
          </label>
          <label>Ghi chú
            <input className="form-control" value={paymentForm.note}
              onChange={(event) => setPaymentForm((current) => ({ ...current, note: event.target.value }))} />
          </label>
          <div className="handover__form-footer">
            <button type="button" className="btn btn-secondary" onClick={() => { setShowPayment(false); setPaymentFiles([]) }}>Hủy</button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || !paymentForm.amount || Number(paymentForm.amount) <= 0 || Number(paymentForm.amount) > Number(debt.remaining) || paymentFiles.length === 0}
              onClick={submitPayment}
            >
              {saving ? 'Đang lưu…' : 'Ghi nhận'}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
