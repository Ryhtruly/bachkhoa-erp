import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import viLocale from '@fullcalendar/core/locales/vi'
import { AlertTriangle, BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Circle, Clock, Coins, ExternalLink, LockKeyhole, MinusCircle, Paperclip, Play, Star, UploadCloud, UserRound, XCircle } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import ChecklistOutputDocuments from './ChecklistOutputDocuments'
import ModalThieuTaiLieu from './ModalThieuTaiLieu'
import { apiFetch } from '../../lib/api'
import AvatarImage from '../../components/AvatarImage'
import { isPrivateObjectKey, openPrivateObject } from '../../lib/privateStorage'
import { groupConcurrentCalendarEvents, mapTasksToCalendarEvents } from './employeePortalMappers'
import { WORKFLOW_NODE_STATUS_LABELS } from '../../components/contracts/workflowLabels'
import Modal from '../../components/ui/Modal'
import LegalDossierNodePanel from '../legal-dossier/LegalDossierNodePanel'
import SubmissionReceiptPanel from '../legal-dossier/SubmissionReceiptPanel'
import HandoverPanel from '../handover/HandoverPanel'

const requiresGovSubmission = (task) => task?.requires_gov_submission === true
const isHandoverTask = (task) => task?.is_handover === true || task?.node_code === 'K06'

const CHECKLIST_STATUS = Object.freeze({
  NOT_STARTED: 'pending',
  PENDING_APPROVAL: 'pending_approval',
  LATE_PENDING_APPROVAL: 'late_pending_approval',
  APPROVED: 'approved',
  LATE_APPROVED: 'late_approved',
  REJECTED: 'failed',
  NOT_APPLICABLE: 'not_applicable',
})

// Đúng bộ trạng thái mà máy chủ chấp nhận khi nộp nghiệm thu — xem
// submit_task_node_for_acceptance trong contracts/workflow_runtime.py.
const CHECKLIST_PASSED_STATUSES = new Set(['approved', 'late_approved', 'not_applicable'])

// Nhãn TRẠNG THÁI CHUẨN BỊ của từng mục checklist.
//
// Từ 27/08 nhân viên KHÔNG nộp từng mục nữa — cả gói đi cùng nút "Nộp nghiệm
// thu" của Node. Nên `pending_approval` ở đây không còn nghĩa "đã nộp lên chờ
// Giám đốc" mà là "phần việc này đã chuẩn bị xong, chờ nộp cả gói". Gọi nó là
// "Đã nộp, chờ duyệt" khiến người làm tưởng đã gửi rồi và không bấm nộp Node.
const CHECKLIST_STATUS_LABEL = {
  approved: 'Đã duyệt',
  late_approved: 'Đã duyệt trễ hạn',
  failed: 'Cần bổ sung',
  not_applicable: 'Không áp dụng',
  pending_approval: 'Đã chuẩn bị xong',
  late_pending_approval: 'Đã chuẩn bị xong (trễ hạn)',
  pending: 'Chưa thực hiện',
  in_progress: 'Đang thực hiện',
}

function ChecklistStatusIcon({ status, size = 15 }) {
  if (status === CHECKLIST_STATUS.APPROVED) {
    return <CheckCircle2 size={size} className="employee-workspace-checklist__icon--passed" aria-label="Đã duyệt" />
  }
  if (status === CHECKLIST_STATUS.LATE_APPROVED) {
    return <span className="employee-workspace-checklist__late-approved" aria-label="Đã duyệt trễ hạn">
      <CheckCircle2 size={size} className="employee-workspace-checklist__icon--passed" />
      <small>Trễ</small>
    </span>
  }
  if (status === CHECKLIST_STATUS.REJECTED) {
    return <XCircle size={size} className="employee-workspace-checklist__icon--failed" aria-label="Bị từ chối" />
  }
  if (status === CHECKLIST_STATUS.NOT_APPLICABLE) {
    return <MinusCircle size={size} className="employee-workspace-checklist__icon--na" aria-label="Không áp dụng" />
  }
  if (status === CHECKLIST_STATUS.LATE_PENDING_APPROVAL) {
    return <span className="employee-workspace-checklist__late-pending" aria-label="Nộp trễ, chờ duyệt">
      <Clock size={size} />
      <AlertTriangle size={Math.max(9, size - 5)} />
    </span>
  }
  if (status === CHECKLIST_STATUS.PENDING_APPROVAL) {
    return <Clock size={size} className="employee-workspace-checklist__icon--submitted" aria-label="Chờ duyệt" />
  }
  return <Circle size={size} className="employee-workspace-checklist__icon--pending" aria-label="Chưa nộp" />
}

function AssigneeAvatars({ assignees = [] }) {
  if (assignees.length === 0) {
    return <span className="employee-workspace-assignees__empty" title="Chưa phân công"><UserRound size={13} /></span>
  }
  const visible = assignees.slice(0, 3)
  return <div className="employee-workspace-assignees" aria-label={`${assignees.length} người được phân công`}>
    {visible.map(assignee => (
      <AvatarImage key={assignee.employee_id} src={assignee.avatar_url} name={assignee.full_name} title={assignee.full_name} />
    ))}
    {assignees.length > visible.length && <em>+{assignees.length - visible.length}</em>}
  </div>
}

// Việc đã nghiệm thu thì đếm ngược tới hạn là vô nghĩa — nhân viên nhìn thẻ đã
// xong mà thấy "Còn 17 ngày" sẽ tưởng chưa làm. Xong rồi thì thứ đáng nói là
// làm sớm hay trễ so với hạn, chứ không phải còn bao lâu.
const COMPLETED_NODE_STATUSES = new Set(['accepted', 'completed'])

const formatDurationHoursDays = (milliseconds) => {
  const totalHours = Math.ceil(milliseconds / 3_600_000)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  const parts = []
  if (days) parts.push(`${days} ngày`)
  if (hours) parts.push(`${hours} giờ`)
  return parts.join(' ')
}

const finishedTimeLabel = (deadlineAt, finishedAt) => {
  if (!finishedAt) return 'Đã xong'
  if (!deadlineAt) return `Xong ${new Date(finishedAt).toLocaleDateString('vi-VN')}`
  const difference = new Date(deadlineAt).getTime() - new Date(finishedAt).getTime()
  if (Math.abs(difference) < 3_600_000) return 'Xong đúng hạn'
  return difference > 0
    ? `Xong sớm ${formatDurationHoursDays(difference)}`
    : `Xong trễ ${formatDurationHoursDays(-difference)}`
}

const remainingTimeLabel = (deadlineAt) => {
  if (!deadlineAt) return 'Không đặt hạn'
  const difference = new Date(deadlineAt).getTime() - Date.now()
  const overdue = difference < 0
  const absoluteDifference = Math.abs(difference)
  if (absoluteDifference < 3_600_000) return `${overdue ? 'Trễ' : 'Còn'} dưới 1 giờ`
  const totalHours = Math.ceil(absoluteDifference / 3_600_000)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  const parts = []
  if (days) parts.push(`${days} ngày`)
  if (hours) parts.push(`${hours} giờ`)
  return `${overdue ? 'Trễ' : 'Còn'} ${parts.join(' ')}`
}

function TimetableNodeCard({ task, statusColor, expanded, onSelect }) {
  const checklistCount = task.checklist?.length || 0
  const visibleChecklist = (task.checklist || []).slice(0, 3)
  const hiddenChecklistCount = Math.max(0, checklistCount - visibleChecklist.length)
  const narrowHiddenChecklistCount = Math.max(0, checklistCount - 2)

  return <article
    className={`employee-workspace-node-card${expanded ? ' is-expanded' : ''}${task.is_overdue ? ' is-overdue' : ''}`}
    data-timetable-node-card={task.id}
    style={{ '--node-status-color': statusColor }}
    onClick={expanded ? undefined : onSelect}
  >
    <button
      type="button"
      className="employee-workspace-node-card__header"
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      aria-expanded={expanded}
    >
      <strong>{task.name || task.node_code}</strong>
      {/* Hồ sơ ưu tiên → nhân viên biết trước có thưởng khi hoàn thành (Q7).
          Chỉ nói "dự kiến", số cuối do giám đốc chốt lúc hoàn thành. */}
      {task.priority && task.priority !== 'NORMAL' && (
        <span className={`employee-workspace-node-card__prio is-${task.priority.toLowerCase()}`}
          title="Hồ sơ ưu tiên — có thưởng dự kiến khi hoàn thành">
          {task.priority === 'URGENT' ? '⚡ Gấp' : '★ Ưu tiên'}
          <span className="employee-workspace-node-card__prio-suffix"> · thưởng dự kiến</span>
        </span>
      )}
      <span className={`employee-workspace-node-card__remaining${
        task.is_overdue && !COMPLETED_NODE_STATUSES.has(task.status) ? ' is-overdue' : ''
      }${COMPLETED_NODE_STATUSES.has(task.status) ? ' is-done' : ''}`}>
        {task.is_overdue && !COMPLETED_NODE_STATUSES.has(task.status) && <AlertTriangle size={11} />}
        {COMPLETED_NODE_STATUSES.has(task.status)
          ? finishedTimeLabel(task.deadline_at, task.completion_date)
          : remainingTimeLabel(task.deadline_at)}
      </span>
    </button>
    <div className="employee-workspace-node-card__checklist">
      {visibleChecklist.map(item => <div key={item.id || item.key}>
        <span title={item.name}>{item.name}</span>
        <ChecklistStatusIcon status={item.status} size={14} />
      </div>)}
      {hiddenChecklistCount > 0 && <small className="employee-workspace-node-card__more">+{hiddenChecklistCount} mục khác</small>}
      {narrowHiddenChecklistCount > 0 && <small className="employee-workspace-node-card__more-narrow">+{narrowHiddenChecklistCount} mục khác</small>}
      {checklistCount === 0 && <small>Node không có checklist</small>}
    </div>
    <footer><AssigneeAvatars assignees={task.assignees || []} /></footer>
  </article>
}

export function ChecklistEvidenceItem({ taskNodeId, item, deadlineAt, nodeStatus, disabledReason = '', contractId = '', onSubmitted }) {
  const { addToast = () => {} } = useToast() || {}
  // Mục checklist đòi tài liệu đầu ra thì thiếu tài liệu là KHÔNG nộp được. Khoá
  // ở đây chỉ để người dùng khỏi bấm oan — máy chủ vẫn chặn thật.
  const [thieuTaiLieu, setThieuTaiLieu] = useState([])
  const outputDocuments = item.output_documents || []
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [note, setNote] = useState('')
  const [lateReason, setLateReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Chỉ nộp được khi bước đang chạy. Nộp minh chứng cho bước chưa bấm Bắt đầu
  // thì không có mốc khởi động, thời hạn tính từ đâu cũng không biết.
  const buocDangChay = nodeStatus === 'in_progress'
  const canSubmit = (item.status === 'pending' || item.status === 'failed') && buocDangChay && !disabledReason
  const files = item.evidence_files || []
  const isPastDeadline = Boolean(deadlineAt && Date.now() > new Date(deadlineAt).getTime())

  const openEvidence = async (event, evidenceFile) => {
    if (!isPrivateObjectKey(evidenceFile.url)) return
    event.preventDefault()
    try {
      await openPrivateObject(evidenceFile.url)
    } catch (error) {
      addToast(error.message || 'Không thể mở file minh chứng', 'error')
    }
  }

  const submit = async () => {
    if (item.require_evidence && !file) {
      fileInputRef.current?.click()
      return
    }
    if (isPastDeadline && !lateReason.trim()) {
      addToast('Công việc đã quá hạn, vui lòng nhập lý do nộp trễ', 'error')
      return
    }
    setSubmitting(true)
    // Checklist không đòi minh chứng thì không có gì để đính kèm. FormData rỗng
    // vẫn gửi header multipart nhưng không có phần nào, và máy chủ đọc đó là body
    // hỏng — nút bấm không ăn. Không có gì gửi thì gửi không body.
    const body = new FormData()
    if (file) body.append('file', file)
    if (note) body.append('note', note)
    if (lateReason.trim()) body.append('late_reason', lateReason.trim())
    const hasAttachment = Boolean(file || note || lateReason.trim())
    try {
      await apiFetch(`/api/employee-portal/tasks/${taskNodeId}/checklist/${item.id}/submit`, {
        method: 'POST',
        ...(hasAttachment ? { body } : {}),
      })
      addToast('Đã nộp minh chứng, chờ duyệt', 'success')
      setFile(null)
      setNote('')
      setLateReason('')
      await onSubmitted()
    } catch (error) {
      addToast(error.message || 'Không thể nộp minh chứng', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return <li className="employee-workspace-checklist__item">
    <div className="employee-workspace-checklist__row">
      <ChecklistStatusIcon status={item.status} />
      <span>{item.name}</span>
      {item.is_required && <em>Bắt buộc</em>}
    </div>
    <small className="employee-workspace-checklist__status-label">{CHECKLIST_STATUS_LABEL[item.status] || item.status}</small>
    {item.submitted_at && (
      <small className="employee-workspace-checklist__status-label">
        <Clock size={11} /> Nộp lúc {new Date(item.submitted_at).toLocaleString('vi-VN')}
      </small>
    )}
    {item.is_overdue && <small className="employee-workspace-checklist__status-label">Quá hạn: {item.late_reason}</small>}

    {/* Giám đốc trả việc mà không nói vì sao thì nhân viên mở ra chỉ thấy "Cần
        bổ sung" rồi ngồi đoán. Đặt ngay dưới tên nhiệm vụ, không giấu trong
        chi tiết. */}
    {item.status === 'failed' && item.director_note && (
      <p className="employee-workspace-checklist__tra-lai" role="alert">
        <AlertTriangle size={13} /> Giám đốc trả lại: {item.director_note}
      </p>
    )}

    {files.length > 0 && (
      <div className="employee-workspace-checklist__files">
        {files.map((evidenceFile, index) => (
          <a
            key={`${evidenceFile.url}-${index}`}
            href={isPrivateObjectKey(evidenceFile.url) ? '#' : evidenceFile.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => openEvidence(event, evidenceFile)}
          >
            <Paperclip size={12} />{evidenceFile.name || `Minh chứng ${index + 1}`}
          </a>
        ))}
      </div>
    )}

    {!buocDangChay && (item.status === 'pending' || item.status === 'failed') && (
      <small className="employee-workspace-checklist__locked">
        Bấm “Bắt đầu làm” ở trên rồi mới nộp được minh chứng
      </small>
    )}

    {buocDangChay && disabledReason && (item.status === 'pending' || item.status === 'failed') && (
      <small className="employee-workspace-checklist__locked">{disabledReason}</small>
    )}

    {outputDocuments.length > 0 && (
      <ChecklistOutputDocuments
        taskNodeId={taskNodeId}
        checklistResultId={item.id}
        outputDocuments={outputDocuments}
        reviewByTemplate={item.review_by_template}
        contractId={contractId}
        editable={canSubmit}
        addToast={addToast}
        onChanged={async (status) => { setThieuTaiLieu(status?.missing || []) }}
      />
    )}

    {canSubmit && (
      <div className="employee-workspace-checklist__submit">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          className="employee-workspace-checklist__file-input"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />
        {isPastDeadline && (
          <input
            className="form-control"
            required
            placeholder="Lý do nộp trễ (bắt buộc)"
            value={lateReason}
            onChange={(event) => setLateReason(event.target.value)}
          />
        )}
        {file && (
          <input
            className="form-control"
            placeholder="Ghi chú (không bắt buộc)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={submitting}
          onClick={submit}
        >
          {item.require_evidence ? <UploadCloud size={14} /> : <CheckCircle2 size={14} />}
          {submitting
            ? 'Đang gửi...'
            : item.require_evidence
              ? (file ? 'Nộp minh chứng' : 'Chọn file minh chứng')
              : 'Đánh dấu chuẩn bị xong'}
        </button>
        {/* Thiếu tài liệu KHÔNG còn khoá nút. Khoá ở đây là ngõ cụt: nhiệm vụ
            không đánh dấu xong được thì Node cũng không nộp nghiệm thu được,
            và giấy khách không có thật thì treo vĩnh viễn. Chỉ cảnh báo; việc
            quyết cho qua hay bắt lấy bằng được là của Giám đốc lúc nghiệm thu. */}
        {thieuTaiLieu.length > 0 && (
          <small className="employee-workspace-checklist__locked" role="status">
            Còn thiếu: {thieuTaiLieu.join('; ')} — vẫn đánh dấu xong được,
            Giám đốc sẽ thấy danh sách này khi duyệt.
          </small>
        )}
      </div>
    )}
  </li>
}

// Cổng CỨNG của máy chủ: đang tạm dừng, hoặc còn tờ bị Giám đốc trả lại chưa
// sửa — hai thứ này khoá nút nộp. `missing_documents` KHÔNG nằm đây: giấy khách
// không có thật thì khoá là treo bước vĩnh viễn, nên nó là cảnh báo mềm (Modal
// xác nhận). Xem node_shortage() trong routes_employee_portal.py.
const HARD_BLOCKER_KINDS = new Set(['paused', 'rejected_documents'])

// Rút blocker cứng đầu tiên từ payload /shortage (đã xếp sẵn theo thứ tự máy chủ
// muốn nhân viên xử: tạm dừng trước, rồi tờ bị trả). Trả null nếu không có.
const hardBlockerFrom = (gate) =>
  (gate?.blockers || []).find(blocker => HARD_BLOCKER_KINDS.has(blocker?.kind)) || null

// gate là payload /shortage đã nạp sẵn (do EmployeeItemWorkspace truyền vào).
// Người gọi không truyền gate (lịch/modal) thì vẫn dựa vào lượt hỏi /shortage
// lúc bấm — cổng cứng vẫn được kiểm ngay trước khi gọi /submit.
export function NodeActionBar({ task, onChanged, gate = null }) {
  // Bối cảnh Toast có thể vắng mặt (component dựng đơn lẻ trong test) — thiếu
  // hàm báo lỗi không được phép làm sập cả màn làm việc.
  const { addToast = () => {} } = useToast() || {}
  const [busy, setBusy] = useState(false)
  const [thieu, setThieu] = useState(null)

  const start = async () => {
    setBusy(true)
    try {
      await apiFetch(`/api/employee-portal/tasks/${task.id}/start`, { method: 'POST' })
      addToast('Đã bắt đầu công việc', 'success')
      await onChanged()
    } catch (error) {
      addToast(error.message || 'Không thể bắt đầu công việc', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (task.status === 'ready' || task.status === 'rework_required') {
    return <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={start}>
      <Play size={14} /> {task.status === 'rework_required' ? 'Làm lại' : 'Bắt đầu làm'}
    </button>
  }
  if (task.status === 'in_progress') {
    // K06 có cổng công nợ và hành động bàn giao chuyên biệt ở cuối panel.
    // Không render nút submit chung để tránh hai đường hoàn thành cạnh tranh nhau.
    if (task.is_handover || task.node_code === 'K06') return null

    // Thợ chính tới hiện trường bấm mốc này. Từ đây suất thợ phụ 100.000đ đóng
    // lại nếu chưa ai nhận — người tới sau không còn hỗ trợ được gì cho ca đo.
    if (task.node_code === 'K02' && !task.field_started_at) {
      const startFieldWork = async () => {
        setBusy(true)
        try {
          const result = await apiFetch(`/api/employee-portal/tasks/${task.id}/field-start`, { method: 'POST' })
          addToast(
            result?.assistant_slot_closed
              ? 'Đã bắt đầu đo — suất thợ phụ của ca này đã đóng'
              : 'Đã bắt đầu đo hiện trường',
            'success',
          )
          await onChanged()
        } catch (error) {
          addToast(error.message || 'Không thể bắt đầu đo hiện trường', 'error')
        } finally {
          setBusy(false)
        }
      }
      return <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={startFieldWork}>
        <Play size={14} /> Bắt đầu đo hiện trường
      </button>
    }

    const checklistItems = task.checklist || []

    // MỘT NÚT DUY NHẤT cho mọi bước: điền đủ nhiệm vụ rồi nộp một lần, Giám đốc
    // duyệt một lần.
    //
    // Chỉ chặn những NHIỆM VỤ chưa điền — đó là phần việc của chính nhân viên.
    // THIẾU TÀI LIỆU thì KHÔNG chặn: giấy khách không có thật thì khoá nút là
    // treo bước vĩnh viễn. Thay vào đó bấm nộp sẽ mở Modal liệt kê thiếu gì,
    // xác nhận rồi vẫn gửi, và danh sách đó được lưu cho Giám đốc đọc.
    const chuaDien = checklistItems.filter(
      item => item.status === 'pending' || item.status === 'failed' || item.status === 'in_progress',
    )
    const lyDoChan = chuaDien.length
      ? `Còn ${chuaDien.length} nhiệm vụ chưa điền xong: ${chuaDien.map(i => i.checklist_name || i.name).filter(Boolean).join(' · ')}`
      : ''

    // Cổng cứng từ máy chủ (gate đã nạp) hoặc cờ tạm dừng của bước → khoá nút và
    // nêu ĐÚNG câu máy chủ trả về. `pending_approval` là "đã làm xong chờ Giám
    // đốc", KHÔNG phải chưa điền — nên không rơi vào chuaDien ở trên.
    const chanCung = hardBlockerFrom(gate)
    const lyDoCung = chanCung?.message
      || (task.pause_reason_type ? 'Bước đang tạm dừng — bấm “Chạy tiếp” rồi mới nộp được.' : '')
    // Ưu tiên bày cổng cứng trước (tạm dừng/tờ bị trả), rồi tới nhiệm vụ chưa điền.
    const lyDoKhoa = lyDoCung || lyDoChan

    const guiThat = async () => {
      setBusy(true)
      try {
        await apiFetch(`/api/employee-portal/tasks/${task.id}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: null }),
        })
        addToast('Đã nộp nghiệm thu — chờ Giám đốc duyệt', 'success')
        setThieu(null)
        await onChanged()
      } catch (error) {
        addToast(error.message || 'Không thể nộp nghiệm thu', 'error')
      } finally {
        setBusy(false)
      }
    }

    const bamNop = async () => {
      setBusy(true)
      try {
        const ket = await apiFetch(`/api/employee-portal/tasks/${task.id}/shortage`)
        // Cổng cứng MỚI (tờ vừa bị trả, bước vừa bị dừng) phải chặn tại đây, kể
        // cả khi gate ban đầu còn sạch/null — không được để lọt xuống /submit.
        const chanCungMoi = hardBlockerFrom(ket)
        if (chanCungMoi) {
          addToast(chanCungMoi.message, 'error')
          setBusy(false)
          return
        }
        const danhSach = ket?.data || []
        if (danhSach.length) {
          // Còn thiếu (mềm) → hỏi trước, không gửi ngay.
          setThieu(danhSach)
          setBusy(false)
          return
        }
      } catch {
        // Không đọc được danh sách thiếu thì vẫn cho nộp — máy chủ mới là cổng
        // thật, và chặn ở đây chỉ vì một lệnh phụ hỏng là chặn nhầm.
      }
      await guiThat()
    }

    return <div className="employee-workspace-task-modal__gate">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={busy || Boolean(lyDoKhoa)}
        title={lyDoKhoa || undefined}
        onClick={bamNop}
      >
        <CheckCircle2 size={14} /> Nộp nghiệm thu
      </button>
      <small style={{ marginTop: 6, display: 'block', opacity: 0.7 }}>
        {lyDoKhoa || 'Nộp một lần cả nhiệm vụ, minh chứng và sổ giấy tờ — Giám đốc duyệt một lần.'}
      </small>

      <ModalThieuTaiLieu
        open={Boolean(thieu)}
        danhSach={thieu || []}
        dangGui={busy}
        onHuy={() => setThieu(null)}
        onXacNhan={guiThat}
      />
    </div>
  }
  if (task.status === 'submitted') {
    return <span className="employee-workspace-checklist__status-label"><Clock size={13} /> Đang chờ quản lý duyệt</span>
  }
  return null
}

const ROLE_LABELS = { MAIN: 'việc chính', ASSISTANT: 'việc phụ', SUBMITTER: 'đi nộp' }

const moneyLabel = (value) => new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + 'đ'

function liveDurationLabel(startedAt, now) {
  if (!startedAt) return '00:00:00'
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return [hours, minutes, rest].map(value => String(value).padStart(2, '0')).join(':')
}

function TaskPoolPanel({ taskPool, onClaim, claimingKey, now }) {
  const items = taskPool?.items || []
  const restrictions = taskPool?.restrictions || {}
  const preferenceSecondsLeft = (item) => Math.max(
    0,
    Math.floor((new Date(item.preference_until).getTime() - now) / 1000),
  )
  const preferred = items.filter(item => item.is_preferred_for_me && preferenceSecondsLeft(item) > 0)
  if (!items.length && !restrictions.wip_locked) return null

  return <section className="employee-task-pool" aria-label="Bể việc chờ nhận">
    <header className="employee-task-pool__header">
      <div>
        <span className="employee-task-pool__eyebrow"><BriefcaseBusiness size={14} /> Bể việc</span>
        <h2>{items.length} công việc sẵn sàng</h2>
      </div>
      {preferred.length > 0 && <span className="employee-task-pool__preferred-count"><Star size={13} /> {preferred.length} ưu tiên</span>}
    </header>
    {restrictions.wip_locked && <div className="employee-task-pool__lock" role="status">
      <LockKeyhole size={16} /> <strong>Đang khóa nhận ca đo</strong>
      <span>{restrictions.held_items}/3 bản CAD tồn</span>
    </div>}
    <div className="employee-task-pool__grid">
      {items.map(item => <article
        key={item.id}
        className={`employee-task-pool__card${item.is_preferred_for_me && preferenceSecondsLeft(item) > 0 ? ' is-preferred' : ''}`}
      >
        <div className="employee-task-pool__card-top">
          <span className="employee-task-pool__code">{item.node_code}</span>
          {item.is_preferred_for_me && preferenceSecondsLeft(item) > 0 && <span className="employee-task-pool__badge"><Star size={11} /> Cùng HĐ · {String(Math.floor(preferenceSecondsLeft(item) / 60)).padStart(2, '0')}:{String(preferenceSecondsLeft(item) % 60).padStart(2, '0')}</span>}
          {item.preference_locked && preferenceSecondsLeft(item) > 0 && <span className="employee-task-pool__badge is-locked"><LockKeyhole size={11} /> Đang ưu tiên</span>}
        </div>
        <strong className="employee-task-pool__name">{item.name}</strong>
        <span className="employee-task-pool__contract">{item.contract_id} · {item.customer_name}</span>
        <div className="employee-task-pool__actions">
          {item.available_roles.map(role => {
            const key = `${item.id}:${role}`
            const blocked = (item.preference_locked && preferenceSecondsLeft(item) > 0)
              || restrictions.active_in_progress > 0
              || (item.node_code === 'K02' && restrictions.wip_locked)
            return <button
              key={role}
              type="button"
              className="btn btn-primary btn-sm"
              disabled={blocked || claimingKey === key}
              onClick={() => onClaim?.(item.id, role)}
              aria-label={`Nhận ${ROLE_LABELS[role] || role}`}
            >
              {claimingKey === key ? 'Đang nhận…' : `Nhận ${ROLE_LABELS[role] || role}`}
              {Number(item.role_amounts?.[role] || 0) > 0 && <span>{moneyLabel(item.role_amounts[role])}</span>}
            </button>
          })}
        </div>
      </article>)}
    </div>
  </section>
}

function ActiveWorkStrip({ tasks, now }) {
  const active = tasks.filter(task => task.status === 'in_progress')
  const today = new Date(now).toDateString()
  const submitted = tasks.filter(task => task.status === 'submitted'
    && task.submitted_at
    && new Date(task.submitted_at).toDateString() === today)
  if (!active.length && !submitted.length) return null
  return <section className="employee-active-work" aria-label="Tiến độ công việc hôm nay">
    {active.map(task => <div key={task.id} className="employee-active-work__item">
      <span className="employee-active-work__pulse" />
      <div><strong>{task.node_code} · {task.name}</strong><span>{task.contract_id}</span></div>
      <time dateTime={task.started_at}>⏱ {liveDurationLabel(task.started_at, now)}</time>
    </div>)}
    {submitted.length > 0 && <div className="employee-active-work__submitted-list">
      <span className="employee-active-work__submitted">{submitted.length} ca đã nộp hôm nay</span>
      {submitted.map(task => <span key={task.id}>{task.node_code} · {task.name}</span>)}
    </div>}
  </section>
}

/**
 * Cửa sổ làm việc của MỘT bước. Tách riêng vì bàn làm việc mới (thẻ Hạng mục)
 * và lịch tuần cùng mở đúng một màn thao tác này — hai bản sao sẽ lệch nhau
 * ngay lần sửa nghiệp vụ đầu tiên.
 */
export function EmployeeNodeModal({ task, onClose, onRefresh, isDirector = false }) {
  const { addToast } = useToast() || {}
  if (!task) return null

  return createPortal(
    <Modal
      open
      onClose={onClose}
      title={task.name || task.node_code || 'Chi tiết công việc'}
      size="md"
      id={`employee-node-${task.id}`}
      overlayClassName="employee-workspace-node-modal-overlay"
    >
      <div className="employee-workspace-node-modal">
        <div className="employee-workspace-node-card__summary">
          <strong>{WORKFLOW_NODE_STATUS_LABELS[task.status] || task.status}</strong>
          <span>{COMPLETED_NODE_STATUSES.has(task.status)
            ? finishedTimeLabel(task.deadline_at, task.completion_date)
            : remainingTimeLabel(task.deadline_at)}</span>
        </div>
        <div className="employee-workspace-node-card__people">
          <AssigneeAvatars assignees={task.assignees || []} />
          <span>{(task.assignees || []).map(item => item.full_name).join(', ') || 'Chưa phân công'}</span>
        </div>
        {/* Giám đốc viết đầu ra nghiệm thu ở khung thiết kế quy trình, nhưng người
            phải làm ra nó lại không thấy — nộp xong mới biết mình hiểu sai việc. */}
        {task.description && (
          <p className="employee-workspace-task-modal__outcome">{task.description}</p>
        )}
        {(task.inherited_files || []).length > 0 && (
          <section className="employee-workspace-inherited-files" aria-label="Tài liệu kế thừa">
            <strong><Paperclip size={15} /> Tài liệu kế thừa</strong>
            <div>
              {task.inherited_files.map((file, index) => {
                const target = file.object_key || file.file_key || file.url || file.evidence_url
                const label = file.file_name || file.name || `Tài liệu ${index + 1}`
                return <button
                  key={`${target || label}-${index}`}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!target}
                  onClick={() => target && (isPrivateObjectKey(target)
                    ? openPrivateObject(target)
                    : window.open(target, '_blank', 'noopener,noreferrer'))}
                >
                  <Paperclip size={13} /> {label}
                </button>
              })}
            </div>
          </section>
        )}
        <div className="employee-workspace-task-modal__action">
          <NodeActionBar task={task} onChanged={onRefresh} />
        </div>

        {/* Hai node đặc biệt — mỗi panel TỰ ẨN khi không đúng loại bước (LegalDossier
            trả null khi không có hồ sơ; Handover được truyền hideIfNotHandover để im
            lặng thay vì hiện box đỏ). Không chặn theo cờ graph vì cờ có thể lệch với
            hồ sơ/loại bước thực tế. */}
        {requiresGovSubmission(task) && (
          <LegalDossierNodePanel taskNodeId={task.id} addToast={addToast} onChanged={onRefresh} />
        )}
        {/* Số biên nhận cơ quan — điền tại chỗ, lưu thẳng sang tab Pháp Lý.
            Tự ẩn nếu Node không gắn hồ sơ nộp cơ quan. */}
        {requiresGovSubmission(task) && (
          <SubmissionReceiptPanel taskNodeId={task.id} addToast={addToast} onChanged={onRefresh} />
        )}
        {isHandoverTask(task) && (
          <HandoverPanel
            taskNodeId={task.id}
            addToast={addToast}
            onChanged={onRefresh}
            onRefresh={onRefresh}
            isDirector={isDirector}
            checklist={task.checklist || []}
            deadlineAt={task.deadline_at}
            hideIfNotHandover
          />
        )}
        {!isHandoverTask(task) && (task.checklist?.length || 0) > 0 ? (
          <ul className="employee-workspace-checklist">
            {task.checklist.map(item => <ChecklistEvidenceItem
              key={item.id || item.key}
              taskNodeId={task.id}
              item={item}
              deadlineAt={task.deadline_at}
              nodeStatus={task.status}
              onSubmitted={onRefresh}
            />)}
          </ul>
        ) : !isHandoverTask(task) ? (
          <p className="employee-workspace-panel__empty">Không có checklist cho công việc này</p>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary btn-sm employee-workspace-node-card__details"
          onClick={() => window.dispatchEvent(new CustomEvent('bachkhoa:open-workflow-node-full-detail', {
            detail: {
              taskNodeId: task.id,
              nodeKey: task.node_key,
              contractId: task.contract_id,
              serviceLineId: task.service_line_id,
            },
          }))}
        >
          <ExternalLink size={14} /> Xem chi tiết đầy đủ
        </button>
      </div>
    </Modal>,
    document.body,
  )
}

export default function EmployeeWorkspaceCalendar({
  tasks = [],
  taskPool = { items: [], restrictions: {} },
  dailySummary = null,
  onClaim,
  claimingKey = '',
  onRefresh,
  isDirector = false,
  hidePool = false,
}) {
  // Bối cảnh Toast có thể vắng mặt (ví dụ trong test dựng component đơn lẻ),
  // nên không phá vỡ cả màn hình chỉ vì thiếu một hàm báo lỗi.
  const { addToast } = useToast() || {}
  const calendarRef = useRef(null)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [weekLabel, setWeekLabel] = useState('')
  const hasActiveTask = tasks.some(task => task.status === 'in_progress')
  const hasPreferenceCountdown = (taskPool?.items || []).some(item => item.is_preferred_for_me)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!hasActiveTask && !hasPreferenceCountdown) return undefined
    const timerId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timerId)
  }, [hasActiveTask, hasPreferenceCountdown])

  const events = useMemo(
    () => groupConcurrentCalendarEvents(mapTasksToCalendarEvents(tasks)),
    [tasks],
  )
  const selectedTask = useMemo(
    () => tasks.find(task => task.id === selectedTaskId) || null,
    [tasks, selectedTaskId],
  )

  // Khung giờ hiển thị phải bao trọn mọi công việc. Cố định 07:00–18:00 sẽ ẩn mất
  // những việc được xếp ngoài giờ hành chính — nhìn như lịch trống dù dữ liệu vẫn có.
  const slotBounds = useMemo(() => {
    let minHour = 7
    let maxHour = 18
    events.forEach((event) => {
      const start = new Date(event.start)
      const end = new Date(event.end)
      minHour = Math.min(minHour, start.getHours())
      const endHour = end.getMinutes() > 0 ? end.getHours() + 1 : end.getHours()
      // Việc kéo dài qua ngày khác thì phần cuối không dùng để nới khung giờ.
      if (end.toDateString() === start.toDateString()) maxHour = Math.max(maxHour, endHour)
      else maxHour = Math.max(maxHour, start.getHours() + 1)
    })
    const pad = (hour) => `${String(Math.max(0, Math.min(24, hour))).padStart(2, '0')}:00:00`
    return { min: pad(minHour), max: pad(maxHour) }
  }, [events])

  // Không có việc nào trong tuần đang xem -> tự nhảy tới tuần có việc gần nhất,
  // thay vì để nhân viên nhìn lịch trống rồi tưởng hệ thống mất dữ liệu.
  const autoJumpedRef = useRef(false)
  useEffect(() => {
    if (autoJumpedRef.current || events.length === 0) return
    const api = calendarRef.current?.getApi()
    if (!api) return
    autoJumpedRef.current = true
    const { activeStart, activeEnd } = api.view
    if (events.some((event) => event.start >= activeStart && event.start < activeEnd)) return
    const now = new Date()
    const sorted = [...events].sort((a, b) => a.start - b.start)
    const target = sorted.find((event) => event.start >= now) || sorted[sorted.length - 1]
    if (target) api.gotoDate(target.start)
  }, [events])

  useEffect(() => {
    if (selectedTaskId && !tasks.some((task) => task.id === selectedTaskId)) setSelectedTaskId(null)
  }, [tasks, selectedTaskId])

  // Bấm 1 dòng thông báo ở chuông -> mở đúng công việc đó và kéo lịch tới đúng ngày,
  // để nhân viên thao tác ngay chứ không phải tự đi tìm trong tuần.
  useEffect(() => {
    const handler = (event) => {
      const taskNodeId = event.detail?.taskNodeId
      if (!taskNodeId) return
      const target = tasks.find((task) => task.id === taskNodeId)
      if (!target) return
      setSelectedTaskId(taskNodeId)
      if (target.started_at) calendarRef.current?.getApi()?.gotoDate(target.started_at)
    }
    window.addEventListener('bachkhoa:open-employee-task', handler)
    return () => window.removeEventListener('bachkhoa:open-employee-task', handler)
  }, [tasks])

  const navigate = (action) => {
    calendarRef.current?.getApi()[action]()
  }

  return <div className="employee-workspace__main">
  <div className="employee-workspace-operations">
    {!hidePool && <TaskPoolPanel taskPool={taskPool} onClaim={onClaim} claimingKey={claimingKey} now={now} />}
    <ActiveWorkStrip tasks={tasks} now={now} />
    {dailySummary && <section className="employee-daily-summary" aria-label="Thành tích hôm nay">
      <span><CheckCircle2 size={14} /> {dailySummary.submitted_count || 0} ca đã nộp</span>
      <span><Clock size={14} /> {dailySummary.in_progress_count || 0} đang làm</span>
      <span><Coins size={14} /> {moneyLabel(dailySummary.earned_amount)}</span>
    </section>}
  </div>
  <section className="employee-workspace-calendar">
    <div className="employee-workspace-calendar__header">
      <h1><CalendarDays size={19} />Lịch làm việc{weekLabel ? ` · ${weekLabel}` : ''}</h1>
      <div className="employee-workspace-calendar__controls" aria-label="Điều hướng lịch">
        <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={() => navigate('prev')} aria-label="Tuần trước" title="Tuần trước"><ChevronLeft size={18} /></button>
        <button type="button" className="employee-workspace-calendar__today" onClick={() => navigate('today')} aria-label="Hiện tại"><CalendarDays size={16} />Hiện tại</button>
        <button type="button" className="btn btn-icon btn-ghost btn-sm" onClick={() => navigate('next')} aria-label="Tuần sau" title="Tuần sau"><ChevronRight size={18} /></button>
      </div>
    </div>
    <div className="employee-workspace-calendar__body">
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin]}
        locale={viLocale}
        initialView="timeGridWeek"
        firstDay={1}
        headerToolbar={false}
        allDaySlot={false}
        slotMinTime={slotBounds.min}
        slotMaxTime={slotBounds.max}
        slotDuration="00:30:00"
        slotEventOverlap={false}
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        slotLabelContent={(arg) => {
          if (arg.date.getHours() === 7 && arg.date.getMinutes() === 0) return 'Sáng'
          if (arg.date.getHours() === 13 && arg.date.getMinutes() === 0) return 'Chiều'
          return ''
        }}
        slotLaneClassNames={(arg) => arg.date.getHours() === 13 && arg.date.getMinutes() === 0 ? ['employee-workspace-calendar__afternoon'] : []}
        dayHeaderContent={(arg) => <>
          <span className="employee-workspace-calendar__weekday">{new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(arg.date)}</span>
          <span className="employee-workspace-calendar__date">{new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(arg.date)}</span>
        </>}
        height={620}
        expandRows
        datesSet={(arg) => {
          const fmt = (date) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date)
          const lastDay = new Date(arg.end.getTime() - 86_400_000)
          setWeekLabel(`${fmt(arg.start)} – ${fmt(lastDay)}/${lastDay.getFullYear()}`)
        }}
        events={events}
        eventClassNames={(arg) => [
          arg.event.extendedProps.tasks.some((task) => task.id === selectedTaskId) ? 'is-node-expanded' : '',
          arg.event.extendedProps.tasks.some((task) => task.is_overdue) ? 'is-node-overdue' : '',
        ].filter(Boolean)}
        eventContent={(arg) => {
          return <div className="employee-workspace-node-stack">
            {arg.event.extendedProps.tasks.map((task) => {
              const expanded = selectedTaskId === task.id
              return <TimetableNodeCard
                key={task.id}
                task={task}
                statusColor={arg.event.backgroundColor}
                expanded={expanded}
                onSelect={() => setSelectedTaskId(expanded ? null : task.id)}
              />
            })}
          </div>
        }}
      />
    </div>
  </section>
  <EmployeeNodeModal
    task={selectedTask}
    onClose={() => setSelectedTaskId(null)}
    onRefresh={onRefresh}
    isDirector={isDirector}
  />
  </div>
}
