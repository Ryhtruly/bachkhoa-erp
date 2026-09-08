import { useCallback, useEffect, useState } from 'react'
import { CornerUpLeft, FilePlus2, FileWarning, Inbox, RefreshCw, ShieldCheck } from 'lucide-react'

import Modal from '../../components/ui/Modal'
import { useToast } from '../../contexts/ToastContext'
import { apiFetch, getAccessToken } from '../../lib/api'
import { loiHienThi } from '../../lib/schemaV2'
import './approvalQueue.css'

const dateLabel = (value) => {
  if (!value) return ''
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Hàng chờ duyệt của Giám đốc — gộp mọi loại phiếu cần một chữ ký.
 *
 * Tách mỗi loại một màn thì sếp phải nhớ có bao nhiêu chỗ cần vào xem, và
 * phiếu nằm ở màn ít mở sẽ treo hàng tuần.
 */
export default function ApprovalQueue() {
  // Bối cảnh Toast có thể vắng mặt khi component được dựng đơn lẻ trong test.
  const { addToast } = useToast() || {}
  const [rollbacks, setRollbacks] = useState([])
  const [documentChanges, setDocumentChanges] = useState([])
  const [slotRequests, setSlotRequests] = useState([])
  const [sua, setSua] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [warnings, setWarnings] = useState([])
  const [reviewDialog, setReviewDialog] = useState(null)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewError, setReviewError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [rollbackResult, documentResult, slotResult] = await Promise.allSettled([
      apiFetch('/api/contracts/workflow/rollback-requests'),
      apiFetch('/api/document-register/change-requests'),
      apiFetch('/api/slot-requests?status=pending'),
    ])
    setRollbacks(rollbackResult.status === 'fulfilled' ? rollbackResult.value?.data || [] : [])
    setDocumentChanges(documentResult.status === 'fulfilled' ? documentResult.value?.data || [] : [])
    setSlotRequests(slotResult.status === 'fulfilled' ? slotResult.value?.data || [] : [])
    setWarnings([...new Set(
      [rollbackResult, documentResult, slotResult]
        .filter(result => result.status === 'rejected')
        .map(result => loiHienThi(result.reason, 'Không tải được một nhóm phiếu duyệt.')),
    )])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Nghe cùng luồng SSE với workspace nhân viên: nhân viên gửi đề xuất ở máy họ
  // thì hàng chờ bên Giám đốc tự hiện, không cần F5 và không polling.
  useEffect(() => {
    const token = getAccessToken?.()
    if (!token) return undefined
    let dung = false
    let retryId = null
    let controller = null

    const connect = async () => {
      controller = new AbortController()
      try {
        const response = await fetch('/api/employee-portal/events', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        })
        // 401/403/404 là lỗi vĩnh viễn: thử lại 1,5 giây một lần chỉ tạo ra
        // hàng trăm dòng lỗi mà không bao giờ thành công.
        if ([401, 403, 404].includes(response.status)) return
        if (!response.ok || !response.body) throw new Error('SSE unavailable')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!dung) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const messages = buffer.split('\n\n')
          buffer = messages.pop() || ''
          if (messages.some(m => m.includes('event: employee-task-change'))) load()
        }
      } catch (streamError) {
        if (streamError.name !== 'AbortError' && !dung) {
          retryId = window.setTimeout(connect, 1500)
        }
      }
    }
    connect()
    return () => {
      dung = true
      controller?.abort()
      if (retryId) window.clearTimeout(retryId)
    }
  }, [load])

  const openReview = (payload) => {
    setReviewDialog(payload)
    setReviewNote('')
    setReviewError('')
  }

  const closeReview = () => {
    if (busy) return
    setReviewDialog(null)
    setReviewNote('')
    setReviewError('')
  }

  const submitReview = async () => {
    if (!reviewDialog) return
    const note = reviewNote.trim()
    const batBuocLyDo = ['rejected', 'needs_more'].includes(reviewDialog.decision)
    if (batBuocLyDo && !note) {
      setReviewError(reviewDialog.decision === 'needs_more'
        ? 'Nhập nội dung cần bổ sung.'
        : 'Nhập lý do từ chối.')
      return
    }

    const { kind, row, decision } = reviewDialog
    setBusy(row.id)
    try {
      let url
      let body = { decision, review_note: note || null }
      if (kind === 'rollback') {
        url = `/api/contracts/workflow/rollback-requests/${row.id}/review`
      } else if (kind === 'document') {
        url = `/api/document-register/change-requests/${row.id}/review`
      } else if (kind === 'waiver') {
        url = `/api/document-register/waivers/${row.id}/review`
      } else {
        const chinh = sua[row.id] || {}
        url = `/api/slot-requests/${row.id}/review`
        body = {
          ...body,
          approved_name: chinh.name ?? row.proposed_name,
          approved_quantity: Number(chinh.quantity ?? row.quantity) || 1,
          approved_source: chinh.source || null,
          required_before_submit: Boolean(chinh.required ?? row.required_before_submit),
          needs_director_approval: Boolean(chinh.needsApproval ?? row.needs_director_approval),
          promotion_scope: chinh.promotionScope ?? 'HANG_MUC_NAY',
        }
      }
      await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const message = decision === 'approved'
        ? (kind === 'slot' ? 'Đã duyệt và tạo loại tài liệu' : 'Đã duyệt')
        : decision === 'needs_more' ? 'Đã yêu cầu nhân viên bổ sung' : 'Đã từ chối'
      addToast?.(message, 'success')
      setReviewDialog(null)
      setReviewNote('')
      await load()
    } catch (error) {
      addToast?.(loiHienThi(error, 'Không xử lý được phiếu.'), 'error')
    } finally {
      setBusy('')
    }
  }

  const waivers = documentChanges.filter(row => row.kind === 'WAIVE')
  const normalDocumentChanges = documentChanges.filter(row => row.kind !== 'WAIVE')
  const total = rollbacks.length + documentChanges.length + slotRequests.length

  return <section className="aq" aria-label="Hàng chờ duyệt">
    <header className="aq-head">
      <h2><Inbox size={19} /> Hàng chờ duyệt</h2>
      <span className={total ? 'aq-count is-busy' : 'aq-count'}>{total} phiếu</span>
      <button type="button" className="aq-refresh" onClick={load} title="Tải lại">
        <RefreshCw size={15} />
      </button>
    </header>

    {loading && <p className="aq-empty">Đang tải hàng chờ…</p>}

    {warnings.map(message => (
      <p key={message} className="aq-warning" role="alert">{message}</p>
    ))}

    {!loading && total === 0 && (
      <p className="aq-empty">Không có phiếu nào chờ duyệt.</p>
    )}

    {rollbacks.length > 0 && <div className="aq-group">
      <h3><CornerUpLeft size={15} /> Xin quay lại bước · {rollbacks.length}</h3>
      {rollbacks.map(row => <article key={row.id} className="aq-card is-rollback">
        <div className="aq-card__top">
          <strong>{row.service_line_name} · HĐ {row.contract_id}</strong>
          <span>{dateLabel(row.created_at)}</span>
        </div>
        <p className="aq-card__meta">
          KH: {row.customer_name} · Người gửi: <b>{row.requested_by_name || '—'}</b>
        </p>
        <p className="aq-card__target">
          Quay về <b>{row.node_code} {row.node_name}</b>
          {row.affected_count > 0 && <em> · {row.affected_count} bước bị ảnh hưởng</em>}
        </p>
        <blockquote>“{row.reason}”</blockquote>
        <div className="aq-card__actions">
          <button
            type="button"
            className="aq-btn aq-btn--reject"
            disabled={busy === row.id}
            onClick={() => openReview({ kind: 'rollback', row, decision: 'rejected' })}
          >
            Từ chối
          </button>
          <button
            type="button"
            className="aq-btn aq-btn--approve"
            disabled={busy === row.id}
            onClick={() => openReview({ kind: 'rollback', row, decision: 'approved' })}
          >
            {busy === row.id ? 'Đang xử lý…' : `Duyệt & trả về ${row.node_code}`}
          </button>
        </div>
      </article>)}
    </div>}

    {slotRequests.length > 0 && <div className="aq-group">
      <h3><FilePlus2 size={15} /> Đề xuất loại tài liệu phát sinh · {slotRequests.length}</h3>
      {slotRequests.map(row => {
        const chinh = sua[row.id] || {}
        return <article key={row.id} className="aq-card is-slot-request">
          <div className="aq-card__top">
            <strong>{row.proposed_name}</strong>
            <span>{dateLabel(row.created_at)}</span>
          </div>
          <p className="aq-card__meta">
            HĐ {row.contract_id} · {row.service_line_name} · {row.node_code} “{row.checklist_name}”
            {' · '}Người gửi: <b>{row.requested_by_name || '—'}</b>
          </p>
          <blockquote>“{row.reason}”</blockquote>

          <ul className="aq-files">
            {(row.files || []).map(tep => (
              <li key={tep.document_id}>
                <FileWarning size={12} /> {tep.file_name}
              </li>
            ))}
          </ul>

          <div className="aq-adjust">
            <label>
              Tên chính thức
              <input
                className="form-control"
                value={chinh.name ?? row.proposed_name}
                onChange={(e) => setSua({ ...sua, [row.id]: { ...chinh, name: e.target.value } })}
              />
            </label>
            <label>
              Số lượng
              <input
                type="number" min={1} className="form-control"
                value={chinh.quantity ?? row.quantity}
                onChange={(e) => setSua({ ...sua, [row.id]: { ...chinh, quantity: e.target.value } })}
              />
            </label>
            <label>
              Nguồn chính thức
              <select
                className="form-control"
                value={chinh.source ?? ''}
                onChange={(e) => setSua({ ...sua, [row.id]: { ...chinh, source: e.target.value } })}
              >
                <option value="">Tự suy theo bước</option>
                <option value="CONG_TY">Công ty soạn/lập</option>
                <option value="CO_QUAN">Cơ quan Nhà nước trả</option>
                <option value="KHACH_HANG">Khách hàng cung cấp</option>
              </select>
            </label>
            <label>
              Phạm vi áp dụng
              <select
                aria-label="Phạm vi áp dụng"
                className="form-control"
                value={chinh.promotionScope ?? 'HANG_MUC_NAY'}
                onChange={(e) => setSua(current => ({
                  ...current,
                  [row.id]: { ...chinh, promotionScope: e.target.value },
                }))}
              >
                <option value="HANG_MUC_NAY">Chỉ Hạng mục này</option>
                <option value="TASK_TYPE">Mọi Hạng mục cùng loại</option>
                <option value="PACKAGE">Mọi Hạng mục cùng gói dịch vụ</option>
                <option value="GLOBAL">Mọi Hạng mục</option>
              </select>
            </label>
            <label className="aq-adjust__check">
              <input
                type="checkbox" checked={Boolean(chinh.required ?? row.required_before_submit)}
                onChange={(e) => setSua({ ...sua, [row.id]: { ...chinh, required: e.target.checked } })}
              />
              Bắt buộc trước khi nộp
            </label>
            <label className="aq-adjust__check">
              <input
                type="checkbox" checked={Boolean(chinh.needsApproval ?? row.needs_director_approval)}
                onChange={(e) => setSua({ ...sua, [row.id]: { ...chinh, needsApproval: e.target.checked } })}
              />
              Cần Giám đốc duyệt
            </label>
          </div>

          <div className="aq-card__actions">
            <button
              type="button" className="aq-btn aq-btn--reject" disabled={busy === row.id}
              onClick={() => openReview({ kind: 'slot', row, decision: 'rejected' })}
            >
              Từ chối
            </button>
            <button
              type="button" className="aq-btn aq-btn--needs-more" disabled={busy === row.id}
              onClick={() => openReview({ kind: 'slot', row, decision: 'needs_more' })}
            >
              Yêu cầu bổ sung
            </button>
            <button
              type="button" className="aq-btn aq-btn--approve" disabled={busy === row.id}
              onClick={() => openReview({ kind: 'slot', row, decision: 'approved' })}
            >
              {busy === row.id ? 'Đang xử lý…' : `Duyệt · tạo loại tài liệu (${(row.files || []).length} tệp)`}
            </button>
          </div>
        </article>
      })}
    </div>}

    {waivers.length > 0 && <div className="aq-group">
      <h3><ShieldCheck size={15} /> Xin miễn giấy · {waivers.length}</h3>
      {waivers.map(row => <article key={row.id} className="aq-card is-waiver">
        <div className="aq-card__top">
          <strong>{row.slot_name}</strong>
          <span>{dateLabel(row.created_at)}</span>
        </div>
        <p className="aq-card__meta">
          HĐ {row.contract_id}
          {row.service_line_name && <> · {row.service_line_name}</>}
          {' · '}Người gửi: <b>{row.requested_by_name || '—'}</b>
        </p>
        <blockquote>“{row.reason}”</blockquote>
        <div className="aq-card__actions">
          <button
            type="button" className="aq-btn aq-btn--reject" disabled={busy === row.id}
            onClick={() => openReview({ kind: 'waiver', row, decision: 'rejected' })}
          >
            Từ chối
          </button>
          <button
            type="button" className="aq-btn aq-btn--approve" disabled={busy === row.id}
            onClick={() => openReview({ kind: 'waiver', row, decision: 'approved' })}
          >
            {busy === row.id ? 'Đang xử lý…' : 'Duyệt miễn'}
          </button>
        </div>
      </article>)}
    </div>}

    {normalDocumentChanges.length > 0 && <div className="aq-group">
      <h3><FileWarning size={15} /> Xin sửa tài liệu chuyển giao · {normalDocumentChanges.length}</h3>
      {normalDocumentChanges.map(row => <article key={row.id} className="aq-card is-document">
        <div className="aq-card__top">
          <strong>{row.slot_name}</strong>
          <span>{dateLabel(row.created_at)}</span>
        </div>
        <p className="aq-card__meta">
          HĐ {row.contract_id} · Người gửi: <b>{row.requested_by_name || '—'}</b>
        </p>
        <blockquote>“{row.reason}”</blockquote>
        <div className="aq-card__actions">
          <button
            type="button"
            className="aq-btn aq-btn--reject"
            disabled={busy === row.id}
            onClick={() => openReview({ kind: 'document', row, decision: 'rejected' })}
          >
            Từ chối
          </button>
          <button
            type="button"
            className="aq-btn aq-btn--approve"
            disabled={busy === row.id}
            onClick={() => openReview({ kind: 'document', row, decision: 'approved' })}
          >
            {busy === row.id ? 'Đang xử lý…' : 'Duyệt · mở khoá 24 giờ'}
          </button>
        </div>
      </article>)}
    </div>}

    <Modal
      open={Boolean(reviewDialog)}
      onClose={closeReview}
      title={reviewDialog?.decision === 'needs_more'
        ? 'Yêu cầu bổ sung thông tin'
        : reviewDialog?.decision === 'rejected' ? 'Từ chối phiếu' : 'Xác nhận duyệt'}
      size="sm"
      id="approval-review"
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={closeReview} disabled={Boolean(busy)}>
          Đóng
        </button>
        <button type="button" className="btn btn-primary" onClick={submitReview} disabled={Boolean(busy)}>
          {busy
            ? 'Đang xử lý…'
            : reviewDialog?.decision === 'needs_more'
              ? 'Xác nhận yêu cầu bổ sung'
              : reviewDialog?.decision === 'rejected' ? 'Xác nhận từ chối' : 'Xác nhận duyệt'}
        </button>
      </>}
    >
      <div className="aq-review-note">
        <label htmlFor="approval-review-note">
          {reviewDialog?.decision === 'needs_more'
            ? 'Nội dung cần bổ sung'
            : reviewDialog?.decision === 'rejected' ? 'Lý do từ chối' : 'Ghi chú (không bắt buộc)'}
        </label>
        <textarea
          id="approval-review-note"
          className="form-control"
          rows={4}
          value={reviewNote}
          onChange={(event) => {
            setReviewNote(event.target.value)
            if (reviewError) setReviewError('')
          }}
          autoFocus
        />
        {reviewError && <p role="alert">{reviewError}</p>}
      </div>
    </Modal>
  </section>
}
