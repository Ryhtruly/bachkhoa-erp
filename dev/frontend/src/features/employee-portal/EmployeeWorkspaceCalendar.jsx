import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import viLocale from '@fullcalendar/core/locales/vi'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Circle, Clock, ExternalLink, MinusCircle, Paperclip, Play, UploadCloud, UserRound, XCircle } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { apiFetch } from '../../lib/api'
import AvatarImage from '../../components/AvatarImage'
import { groupConcurrentCalendarEvents, mapTasksToCalendarEvents } from './employeePortalMappers'
import { WORKFLOW_NODE_STATUS_LABELS } from '../../components/contracts/workflowLabels'
import Modal from '../../components/ui/Modal'
import LegalDossierNodePanel from '../legal-dossier/LegalDossierNodePanel'
import SubmissionReceiptPanel from '../legal-dossier/SubmissionReceiptPanel'
import HandoverPanel from '../handover/HandoverPanel'

export const CHECKLIST_STATUS = Object.freeze({
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

const CHECKLIST_STATUS_LABEL = {
  approved: 'Đã duyệt',
  late_approved: 'Đã duyệt trễ hạn',
  failed: 'Không đạt — nộp lại',
  not_applicable: 'Không áp dụng',
  pending_approval: 'Đã nộp, chờ duyệt',
  late_pending_approval: 'Nộp trễ, chờ duyệt',
  pending: 'Chưa hoàn thành',
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

function ChecklistEvidenceItem({ taskNodeId, item, deadlineAt, nodeStatus, onSubmitted }) {
  const { addToast } = useToast()
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [note, setNote] = useState('')
  const [lateReason, setLateReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Chỉ nộp được khi bước đang chạy. Nộp minh chứng cho bước chưa bấm Bắt đầu
  // thì không có mốc khởi động, thời hạn tính từ đâu cũng không biết.
  const buocDangChay = nodeStatus === 'in_progress'
  const canSubmit = (item.status === 'pending' || item.status === 'failed') && buocDangChay
  const files = item.evidence_files || []
  const isPastDeadline = Boolean(deadlineAt && Date.now() > new Date(deadlineAt).getTime())

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

    {files.length > 0 && (
      <div className="employee-workspace-checklist__files">
        {files.map((evidenceFile, index) => (
          <a key={`${evidenceFile.url}-${index}`} href={evidenceFile.url} target="_blank" rel="noreferrer">
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
              : 'Gửi hoàn thành checklist'}
        </button>
      </div>
    )}
  </li>
}

function NodeActionBar({ task, onChanged }) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState(false)

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
    const checklistItems = task.checklist || []

    // Node KHÔNG có checklist → hiển thị nút [Nộp hoàn thành công việc] để
    // nhân viên báo cáo xong, gửi quản lý / giám đốc duyệt nghiệm thu.
    // Nếu không có nút này, node sẽ kẹt in_progress vĩnh viễn vì không có
    // checklist nào để quản lý duyệt kích hoạt tự hoàn thành.
    if (checklistItems.length === 0) {
      const submitTask = async () => {
        setBusy(true)
        try {
          await apiFetch(`/api/employee-portal/tasks/${task.id}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: null }),
          })
          addToast('Đã nộp hoàn thành công việc — chờ quản lý duyệt', 'success')
          await onChanged()
        } catch (error) {
          addToast(error.message || 'Không thể nộp hoàn thành', 'error')
        } finally {
          setBusy(false)
        }
      }
      return <div className="employee-workspace-task-modal__gate">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={submitTask}>
          <CheckCircle2 size={14} /> Nộp hoàn thành công việc
        </button>
        <small style={{ marginTop: 6, display: 'block', opacity: 0.7 }}>
          Bước này không có checklist — bấm nộp để quản lý duyệt nghiệm thu.
        </small>
      </div>
    }

    // Node CÓ checklist → cơ chế cũ: quản lý duyệt hết checklist là bước tự hoàn thành.
    const unapprovedChecklistItems = checklistItems.filter(item => !CHECKLIST_PASSED_STATUSES.has(item.status))
    const pendingChecklistItems = unapprovedChecklistItems.filter(item => item.status === 'pending' || item.status === 'failed')
    return <div className="employee-workspace-task-modal__gate">
      <small>
        {pendingChecklistItems.length > 0
          ? `Còn ${pendingChecklistItems.length} việc bên dưới cần làm — quản lý duyệt hết checklist là bước tự hoàn thành.`
          : 'Đã nộp hết checklist, đang chờ quản lý duyệt — duyệt xong bước tự hoàn thành, không cần nộp nghiệm thu.'}
      </small>
    </div>
  }
  if (task.status === 'submitted') {
    return <span className="employee-workspace-checklist__status-label"><Clock size={13} /> Đang chờ quản lý duyệt</span>
  }
  return null
}

export default function EmployeeWorkspaceCalendar({ tasks = [], onRefresh }) {
  // Bối cảnh Toast có thể vắng mặt (ví dụ trong test dựng component đơn lẻ),
  // nên không phá vỡ cả màn hình chỉ vì thiếu một hàm báo lỗi.
  const { addToast } = useToast() || {}
  const calendarRef = useRef(null)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [weekLabel, setWeekLabel] = useState('')

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

  return <>
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
  {selectedTask && createPortal(
    <Modal
      open
      onClose={() => setSelectedTaskId(null)}
      title={selectedTask.name || selectedTask.node_code || 'Chi tiết công việc'}
      size="md"
      id={`employee-node-${selectedTask.id}`}
      overlayClassName="employee-workspace-node-modal-overlay"
    >
      <div className="employee-workspace-node-modal">
        <div className="employee-workspace-node-card__summary">
          <strong>{WORKFLOW_NODE_STATUS_LABELS[selectedTask.status] || selectedTask.status}</strong>
          <span>{COMPLETED_NODE_STATUSES.has(selectedTask.status)
            ? finishedTimeLabel(selectedTask.deadline_at, selectedTask.completion_date)
            : remainingTimeLabel(selectedTask.deadline_at)}</span>
        </div>
        <div className="employee-workspace-node-card__people">
          <AssigneeAvatars assignees={selectedTask.assignees || []} />
          <span>{(selectedTask.assignees || []).map(item => item.full_name).join(', ') || 'Chưa phân công'}</span>
        </div>
        {/* Giám đốc viết đầu ra nghiệm thu ở khung thiết kế quy trình, nhưng người
            phải làm ra nó lại không thấy — nộp xong mới biết mình hiểu sai việc. */}
        {selectedTask.description && (
          <p className="employee-workspace-task-modal__outcome">{selectedTask.description}</p>
        )}
        <div className="employee-workspace-task-modal__action">
          <NodeActionBar task={selectedTask} onChanged={onRefresh} />
        </div>

        {/* Hai node đặc biệt — mỗi panel TỰ ẨN khi không đúng loại bước (LegalDossier
            trả null khi không có hồ sơ; Handover được truyền hideIfNotHandover để im
            lặng thay vì hiện box đỏ). Không chặn theo cờ graph vì cờ có thể lệch với
            hồ sơ/loại bước thực tế. */}
        <LegalDossierNodePanel
          taskNodeId={selectedTask.id}
          addToast={addToast}
          onChanged={onRefresh}
        />
        {/* Số biên nhận cơ quan — điền tại chỗ, lưu thẳng sang tab Pháp Lý.
            Tự ẩn nếu Node không gắn hồ sơ nộp cơ quan. */}
        <SubmissionReceiptPanel
          taskNodeId={selectedTask.id}
          addToast={addToast}
          onChanged={onRefresh}
        />
        <HandoverPanel
          taskNodeId={selectedTask.id}
          addToast={addToast}
          onChanged={onRefresh}
          hideIfNotHandover
        />
        {(selectedTask.checklist?.length || 0) > 0 ? (
          <ul className="employee-workspace-checklist">
            {selectedTask.checklist.map(item => <ChecklistEvidenceItem
              key={item.id || item.key}
              taskNodeId={selectedTask.id}
              item={item}
              deadlineAt={selectedTask.deadline_at}
              nodeStatus={selectedTask.status}
              onSubmitted={onRefresh}
            />)}
          </ul>
        ) : <p className="employee-workspace-panel__empty">Không có checklist cho công việc này</p>}
        <button
          type="button"
          className="btn btn-secondary btn-sm employee-workspace-node-card__details"
          onClick={() => window.dispatchEvent(new CustomEvent('bachkhoa:open-workflow-node-full-detail', {
            detail: {
              taskNodeId: selectedTask.id,
              nodeKey: selectedTask.node_key,
              contractId: selectedTask.contract_id,
              serviceLineId: selectedTask.service_line_id,
            },
          }))}
        >
          <ExternalLink size={14} /> Xem chi tiết đầy đủ
        </button>
      </div>
    </Modal>,
    document.body,
  )}
  </>
}
