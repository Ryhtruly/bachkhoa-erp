import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Send, Trash2, Upload } from 'lucide-react'

import Modal from '../../components/ui/Modal'
import { apiFetch } from '../../lib/api'

const SOURCES = [
  ['CONG_TY', 'Công ty soạn/lập'],
  ['KHACH_HANG', 'Khách hàng cung cấp'],
  ['CO_QUAN', 'Cơ quan Nhà nước trả'],
]

/**
 * Đề xuất một loại tài liệu phát sinh — nhân viên đặt tên rồi tải luôn tệp vào.
 *
 * Tệp được tải lên ngay để có document_id và khoá lưu trữ ổn định, nhưng chưa
 * vào hồ sơ chính thức: chưa có ô giấy, chưa có liên kết, chưa tính vào số
 * lượng tối thiểu của checklist. Chỉ khi Giám đốc duyệt mới sinh ô và nối vào.
 */
export default function SlotRequestModal({ checklistResultId, onClose, onDone, addToast = () => {} }) {
  const [request, setRequest] = useState(null)
  const [form, setForm] = useState({
    proposed_name: '', description: '', reason: '', quantity: 1, source: 'CONG_TY',
  })
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    if (!request?.id) return
    try {
      const payload = await apiFetch(`/api/slot-requests/${request.id}`)
      setRequest(payload?.data || null)
    } catch { /* giữ nguyên trạng thái đang có */ }
  }, [request?.id])

  useEffect(() => {
    let huy = false
    apiFetch(`/api/slot-requests?checklist_result_id=${encodeURIComponent(checklistResultId)}`)
      .then((payload) => {
        if (huy) return
        // Mở lại đề xuất GẦN NHẤT dù ở trạng thái nào. Chỉ lấy draft/rejected thì
        // đề xuất đang chờ duyệt không hiện ra, nhân viên tưởng chưa gửi và tạo
        // cái thứ hai — rồi đụng ràng buộc trùng tên, nhận một lỗi khó hiểu.
        const ganNhat = (payload?.data || [])[0]
        if (ganNhat) {
          setRequest(ganNhat)
          setForm({
            proposed_name: ganNhat.proposed_name || '', description: ganNhat.description || '',
            reason: ganNhat.reason || '', quantity: ganNhat.quantity || 1,
            source: ganNhat.source || 'CONG_TY',
          })
        }
      })
      .catch(() => {})
    return () => { huy = true }
  }, [checklistResultId])

  const taoDeXuat = async () => {
    setBusy(true)
    try {
      const payload = await apiFetch('/api/slot-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist_result_id: checklistResultId, kind: 'INPUT', ...form }),
      })
      const created = await apiFetch(`/api/slot-requests/${payload.data.id}`)
      setRequest(created?.data || null)
      addToast('Đã tạo bản nháp — tải tệp lên rồi gửi duyệt', 'success')
    } catch (error) {
      addToast(error.message || 'Không tạo được đề xuất', 'error')
    } finally {
      setBusy(false)
    }
  }

  const taiTep = async (file) => {
    if (!file || !request?.id) return
    setBusy(true)
    const body = new FormData()
    body.append('file', file)
    try {
      await apiFetch(`/api/slot-requests/${request.id}/documents`, { method: 'POST', body })
      await load()
    } catch (error) {
      addToast(error.message || 'Không tải được tệp', 'error')
    } finally {
      setBusy(false)
    }
  }

  const boTep = async (documentId) => {
    setBusy(true)
    try {
      await apiFetch(`/api/slot-requests/${request.id}/documents/${documentId}`, { method: 'DELETE' })
      await load()
    } catch (error) {
      addToast(error.message || 'Không gỡ được tệp', 'error')
    } finally {
      setBusy(false)
    }
  }

  const guiDuyet = async () => {
    setBusy(true)
    try {
      await apiFetch(`/api/slot-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      await apiFetch(`/api/slot-requests/${request.id}/submit`, { method: 'POST' })
      addToast('Đã gửi Giám đốc duyệt', 'success')
      await onDone?.()
      onClose()
    } catch (error) {
      addToast(error.message || 'Không gửi được', 'error')
    } finally {
      setBusy(false)
    }
  }

  const files = request?.files || []
  const daGui = request?.status === 'pending'
  const daDuyet = request?.status === 'approved'
  const biTuChoi = request?.status === 'rejected'
  const canBoSung = request?.status === 'needs_more'
  const suaDuoc = !daGui && !daDuyet
  const laDauVao = (request?.kind || 'INPUT') === 'INPUT'

  return <Modal open onClose={onClose} size="lg" id="slot-request" title="Đề xuất loại tài liệu phát sinh">
    {biTuChoi && (
      <p className="sr-reject" role="alert">
        <strong>Giám đốc đã từ chối.</strong> {request.review_note} — sửa lại rồi gửi tiếp.
      </p>
    )}
    {canBoSung && (
      <p className="sr-reject" role="alert">
        <strong>Giám đốc yêu cầu bổ sung.</strong> {request.review_note} — cập nhật rồi gửi lại phiếu này.
      </p>
    )}
    {daGui && <p className="sr-state">Đang chờ Giám đốc duyệt. Trong lúc chờ không sửa được.</p>}
    {daDuyet && (
      <p className="sr-state is-done">
        Đã duyệt — loại tài liệu chính thức: <strong>{request.approved_name || request.proposed_name}</strong>
      </p>
    )}

    <div className="sr-form">
      <label>
        Tên loại tài liệu
        <input
          className="form-control" disabled={!suaDuoc}
          value={form.proposed_name}
          onChange={(e) => setForm({ ...form, proposed_name: e.target.value })}
          placeholder="VD: Ảnh mốc ranh phát sinh"
        />
      </label>
      <label>
        Mô tả
        <input
          className="form-control" disabled={!suaDuoc}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <label>
        Lý do phát sinh
        <input
          className="form-control" disabled={!suaDuoc}
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          placeholder="Vì sao cần thêm loại giấy này"
        />
      </label>
      <div className="sr-form__row">
        <label>
          Số lượng
          <input
            type="number" min={1} className="form-control" disabled={!suaDuoc}
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label>
          Nguồn tài liệu
          <select
            className="form-control" disabled={!suaDuoc}
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          >
            {SOURCES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
      </div>
    </div>

    {!request && (
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={taoDeXuat}>
        Lưu nháp
      </button>
    )}

    {request && (
      <div className="sr-files">
        <div className="sr-files__head">
          <FileText size={13} /> <strong>Tệp đã tải ({files.length})</strong>
        </div>
        {files.length === 0 && (
          <p className="sr-empty">
            {laDauVao
              ? 'Chưa có tệp. Có thể gửi duyệt khi chưa có tệp để tạo ô giấy còn thiếu.'
              : 'Chưa có tệp nào. Tải lên ít nhất một tệp rồi mới gửi duyệt.'}
          </p>
        )}
        <ul className="sr-files__list">
          {files.map((tep) => (
            <li key={tep.document_id}>
              <span>{tep.file_name}</span>
              {suaDuoc && (
                <button type="button" onClick={() => boTep(tep.document_id)} title="Bỏ tệp này">
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>

        {suaDuoc && (
          <div className="sr-actions">
            <input
              ref={fileRef} type="file" className="sr-file-input"
              onChange={(e) => taiTep(e.target.files?.[0])}
            />
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload size={12} /> Thêm tệp
            </button>
            <button
              type="button" className="btn btn-primary btn-sm"
              disabled={busy || (!laDauVao && files.length === 0)}
              onClick={guiDuyet}
            >
              <Send size={12} /> Gửi duyệt
            </button>
          </div>
        )}
      </div>
    )}
  </Modal>
}
