import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, FileCheck2, Link2, Plus, Upload, X } from 'lucide-react'

import { apiFetch } from '../../lib/api'
import { mergeDocumentVerdicts } from './nodeWorkFormat'
import SlotRequestModal from './SlotRequestModal'

/**
 * Tài liệu đầu ra của một mục checklist.
 *
 * Khác minh chứng: minh chứng chứng minh nhân viên đã làm việc, còn tài liệu đầu
 * ra trở thành thành phần chính thức của hồ sơ Hạng mục. Cùng một tệp có thể đóng
 * cả hai vai, nhưng chỉ nằm MỘT bản trên kho lưu trữ — mọi thứ khác là quan hệ.
 *
 * Chỉ hiện khi mục checklist có cấu hình; mục thường không thấy khu này.
 *
 * ── Trạng thái từng tờ ──────────────────────────────────────────────────────
 * approved: đã duyệt · rejected: bị từ chối (kèm lý do) · pending: chờ duyệt ·
 * missing: chưa nộp. Tờ đã duyệt ẩn nút tải lên/dùng lại — nhân viên không thể
 * tự thay tờ đã duyệt, backend trả 409 nếu cố.
 */
export default function ChecklistOutputDocuments({
  taskNodeId,
  checklistResultId,
  outputDocuments = [],
  reviewByTemplate = {},
  contractId,
  editable = true,
  addToast = () => {},
  onChanged,
}) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState('')
  const [reusing, setReusing] = useState('')
  const [reusable, setReusable] = useState([])
  const [deXuat, setDeXuat] = useState(false)
  const inputRefs = useRef({})

  const soLoai = outputDocuments.length

  const load = useCallback(async () => {
    // Mục checklist thường không hỏi máy chủ câu nào. Hook vẫn phải chạy (luật
    // của React) nhưng thân hàm thoát ngay — nếu không, mỗi mục checklist bình
    // thường lại tốn một request chỉ để nhận về "không có gì".
    if (!checklistResultId || !soLoai) return
    try {
      const payload = await apiFetch(
        `/api/employee-portal/tasks/${taskNodeId}/checklist/${checklistResultId}/output-status`
      )
      setStatus(payload)
      onChanged?.(payload)
    } catch {
      setStatus(null)
    }
  }, [taskNodeId, checklistResultId, soLoai, onChanged])

  useEffect(() => { load() }, [load])

  if (!soLoai) return null

  const upload = async (templateId, file) => {
    if (!file) return
    setBusy(templateId)
    const body = new FormData()
    body.append('template_id', templateId)
    body.append('file', file)
    try {
      await apiFetch(
        `/api/employee-portal/tasks/${taskNodeId}/checklist/${checklistResultId}/output-documents`,
        { method: 'POST', body },
      )
      addToast('Đã nộp tài liệu vào hồ sơ', 'success')
      await load()
    } catch (error) {
      addToast(error.message || 'Không nộp được tài liệu', 'error')
    } finally {
      setBusy('')
    }
  }

  const openReuse = async (templateId) => {
    if (reusing === templateId) { setReusing(''); return }
    setReusing(templateId)
    try {
      const payload = await apiFetch(
        `/api/document-register/contracts/${encodeURIComponent(contractId)}/source-documents`
      )
      setReusable(payload?.data || [])
    } catch {
      setReusable([])
    }
  }

  const reuse = async (templateId, documentId) => {
    setBusy(templateId)
    try {
      await apiFetch(
        `/api/employee-portal/tasks/${taskNodeId}/checklist/${checklistResultId}/output-documents/${documentId}`,
        { method: 'POST' },
      )
      addToast('Đã gắn tài liệu có sẵn — không tạo bản sao', 'success')
      setReusing('')
      await load()
    } catch (error) {
      addToast(error.message || 'Không gắn được tài liệu', 'error')
    } finally {
      setBusy('')
    }
  }

  const missingText = (status?.missing || []).join('; ')
  // Phán quyết từng tờ (approved/rejected/pending/missing) đến từ caller qua
  // reviewByTemplate — KHÔNG từ API output-status. Server chỉ trả số đếm và
  // cờ bổ sung; gộp lại theo template_id để hiển thị đúng cả hai nửa.
  const theoTemplate = new Map((status?.documents || []).map(d => [d.template_id, d]))
  const danhSach = mergeDocumentVerdicts({ output_documents: outputDocuments, review_by_template: reviewByTemplate })
    .map(doc => ({ ...doc, ...(theoTemplate.get(doc.template_id) || {}) }))

  const docState = (doc) => {
    if (doc.review_status === 'approved') return 'approved'
    if (doc.review_status === 'rejected') return 'rejected'
    if (doc.document_id) return 'pending'
    return 'missing'
  }

  return <div className="cod" aria-label="Tài liệu đầu ra cần nộp">
    <div className="cod__head">
      <FileCheck2 size={13} />
      <strong>Tài liệu đầu ra cần nộp</strong>
      {status && (status.can_submit
        ? <span className="cod__ok"><Check size={12} /> Đã đủ</span>
        : <span className="cod__warn"><AlertTriangle size={12} /> Còn thiếu</span>)}
    </div>

    <ul className="cod__list">
      {danhSach.map((doc) => {
        const ten = doc.slot_name || doc.template_name || doc.template_id
        const daCo = Number(doc.current_count ?? 0)
        const can = Number(doc.min_count ?? 1)
        const du = daCo >= can
        const state = docState(doc)
        const isApproved = state === 'approved'
        const isRejected = state === 'rejected'
        return <li key={doc.template_id} className={`${du ? 'is-done' : ''} is-${state}`}>
          <div className="cod__row">
            <span className="cod__name">{ten}</span>
            {doc.required_before_submit !== false && <em className="cod__req">Bắt buộc</em>}
            {doc.needs_director_approval && (
              <em className="cod__approval" title="Chỉ thành đầu ra chính thức sau khi Giám đốc duyệt mục checklist này">
                Chờ Giám đốc duyệt
              </em>
            )}
            <span className={`cod__status cod__status--${state}`}>
              {isApproved && <><Check size={11} /> Đã duyệt</>}
              {isRejected && <><X size={11} /> Bị từ chối</>}
              {!isApproved && !isRejected && <span className="cod__count">{daCo}/{can}</span>}
            </span>
          </div>

          {isRejected && doc.rejection_reason && (
            <p className="cod__reason">
              <b>Lý do:</b> {doc.rejection_reason}
            </p>
          )}

          {editable && !isApproved && (
            <div className="cod__actions">
              <input
                type="file"
                className="cod__file"
                ref={(el) => { inputRefs.current[doc.template_id] = el }}
                onChange={(event) => upload(doc.template_id, event.target.files?.[0])}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy === doc.template_id}
                onClick={() => inputRefs.current[doc.template_id]?.click()}
              >
                <Upload size={12} /> {busy === doc.template_id ? 'Đang nộp…' : 'Tải lên'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => openReuse(doc.template_id)}
                title="Dùng lại tài liệu đã có trong hợp đồng — không tạo bản sao"
              >
                <Link2 size={12} /> Dùng lại
              </button>
            </div>
          )}

          {isApproved && (
            <p className="cod__approved">
              <Check size={12} /> Đã duyệt — không thể thay thế
            </p>
          )}

          {reusing === doc.template_id && (
            <ul className="cod__reuse">
              {reusable.length === 0 && <li className="cod__empty">Hợp đồng chưa có tài liệu nào để dùng lại.</li>}
              {reusable.map((tep) => (
                <li key={tep.id}>
                  <button type="button" onClick={() => reuse(doc.template_id, tep.id)}>
                    <Link2 size={11} /> {tep.file_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </li>
      })}
    </ul>

    {missingText && <p className="cod__missing" role="status">Còn thiếu: {missingText}</p>}

    {/* Gặp sản phẩm phát sinh mà Giám đốc chưa cấu hình trước — nhân viên đặt
        tên và tải tệp ngay, rồi gửi duyệt. Chưa duyệt thì tệp chưa vào hồ sơ. */}
    {editable && (
      <button type="button" className="cod__propose" onClick={() => setDeXuat(true)}>
        <Plus size={12} /> Đề xuất loại tài liệu
      </button>
    )}

    {deXuat && <SlotRequestModal
      checklistResultId={checklistResultId}
      addToast={addToast}
      onClose={() => setDeXuat(false)}
      onDone={load}
    />}
  </div>
}
