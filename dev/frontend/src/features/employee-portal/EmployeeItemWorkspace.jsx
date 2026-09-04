import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, FolderOpen, Lock, TriangleAlert } from 'lucide-react'

import { useToast } from '../../contexts/ToastContext'
import { apiFetch, getAccessToken } from '../../lib/api'
import DocumentPreviewModal from './DocumentPreviewModal'
import { ChecklistEvidenceItem, NodeActionBar } from './EmployeeWorkspaceCalendar'

import NodeBusinessSlot from './NodeBusinessSlot'
import NodeChain from './NodeChain'
import NodeOutputList from './NodeOutputList'
import PauseReasonModal from './PauseReasonModal'
import PriorDocumentsDrawer from './PriorDocumentsDrawer'
import SlotRequestModal from './SlotRequestModal'
import RollbackPickerModal from './RollbackPickerModal'
import { countdown, effectiveDeadline, formatMoney } from './nodeWorkFormat'


/**
 * Màn làm việc của MỘT bước, phía nhân viên. Bốn tầng, đọc từ trên xuống:
 *
 *   1  Hợp đồng + dải bước K01 → K07
 *   2  Tên bước · đồng hồ | Nhiệm vụ · trạng thái
 *   3  Mô tả · Tủ hồ sơ · Tiền  |  Kho giấy khách · Danh mục giấy đầu ra
 *   4  Nhờ hỗ trợ · nút hành động chính
 *
 * ── Một khung, một ô thay đổi ────────────────────────────────────────────────
 * Bốn biến thể của bản vẽ (K01·K04·K07, K05a, K05b, K06) dùng CHUNG khung này;
 * chỉ hàng thứ hai cột phải đổi theo bước. Ô đó là `slot nghiệp vụ` bên dưới —
 * K05a/K05b/K06 sau này điền vào đúng chỗ ấy, không phải viết lại màn.
 *
 * Chọn theo CỜ CẤU HÌNH của bước, không theo mã K: `is_handover`,
 * `requires_gov_submission`. Ba cờ này khai ở danh mục nên đổi bước nào có gì
 * là một câu update, không phải một lần deploy.
 */

const DONE_STATUSES = new Set(['accepted', 'completed'])

const NODE_STATE_LABEL = {
  accepted: 'Đã xong',
  completed: 'Đã xong',
  in_progress: 'Đang thực hiện',
  submitted: 'Chờ giám đốc duyệt',
  ready: 'Sẵn sàng làm',
  rework_required: 'Cần sửa lại',
  pending: 'Chưa tới lượt',
  blocked: 'Bị chặn',
}

const PRIORITY_LABEL = { URGENT: 'Rất gấp', HIGH: 'Ưu tiên', NORMAL: 'Bình thường' }

const PAUSE_LABEL = {
  AGENCY: 'Chờ cơ quan',
  SURVEYOR: 'Chờ đo vẽ sửa',
  INTERNAL: 'Chờ nội bộ',
}

const humanizeOpenError = (err) => {
  const s = Number(err?.status)
  if (s === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang.'
  if (s === 403) return 'Bạn không có quyền xem tệp của bước này.'
  if (s === 404) return 'Không tìm thấy tệp trên hệ thống lưu trữ.'
  return err?.message || 'Không thể mở tệp.'
}

const dispatchUnauthorized = () => {
  try {
    window.dispatchEvent(new CustomEvent('bachkhoa:unauthorized'))
  } catch {}
}


export default function EmployeeItemWorkspace({

  item,
  tasks = [],
  onBack,
  onRefresh,
  onRequestHelp,
  onCancelHelp,
  isDirector = false,
}) {
  const { addToast } = useToast() || {}
  const [pickedNodeId, setPickedNodeId] = useState(null)
  const [cabinetOpen, setCabinetOpen] = useState(false)
  const [gate, setGate] = useState(null)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [openError, setOpenError] = useState(null)
  const objectUrlRef = useRef(null)
  // Số thứ tự lượt đọc /shortage: chỉ lượt MỚI NHẤT được ghi vào state, nên lượt
  // cũ về muộn (hay về sau khi component đã rời) không đạp lên kết quả mới.
  const gateReqRef = useRef(0)
  // Mục checklist đang xin thêm loại giấy. Nhân viên chỉ ĐỀ XUẤT —
  // Giám đốc duyệt thì ô giấy mới được tạo.
  const [proposeFor, setProposeFor] = useState(null)


  const nodes = item.nodes || []
  const activeNodeId = pickedNodeId || item.current_task_node_id
  const activeNode = useMemo(
    () => nodes.find(node => node.id === activeNodeId) || null,
    [nodes, activeNodeId],
  )
  // Chi tiết đầy đủ (checklist, mô tả, hạn) chỉ có ở các bước NHÂN VIÊN được giao.
  const task = useMemo(
    () => tasks.find(row => row.id === activeNodeId) || null,
    [tasks, activeNodeId],
  )
  const openableIds = useMemo(
    () => new Set(nodes.filter(node => node.mine && tasks.some(row => row.id === node.id))
      .map(node => node.id)),
    [nodes, tasks],
  )

  const checklist = task?.checklist || []
  const paused = Boolean(task?.pause_reason_type)
  const clock = countdown(effectiveDeadline(task), { pausedAt: task?.paused_at })

  // Vì sao chưa nộp được — máy chủ trả đủ ba lý do trong một lượt hỏi. Bày ra
  // thay vì để nút xám câm: nút không nói lý do là bắt nhân viên đoán rồi gọi
  // điện hỏi.
  //
  // Một helper DÙNG CHUNG cho cả hai đường đọc cổng: effect lúc đổi bước, và
  // sau khi nộp tệp thành công (tờ vừa thay có thể vừa gỡ blocker 'rejected'
  // đang treo). An toàn khi huỷ nhờ gateReqRef: mỗi lượt LẤY một số thứ tự mới
  // ngay từ đầu — kể cả nhánh không còn task — nên chỉ lượt mới nhất được ghi
  // state; kết quả cũ về muộn không đạp lên trạng thái mới.
  const refreshGate = useCallback(() => {
    const seq = ++gateReqRef.current
    if (!task?.id) { setGate(null); return Promise.resolve() }
    return apiFetch(`/api/employee-portal/tasks/${encodeURIComponent(task.id)}/shortage`)
      .then(res => { if (gateReqRef.current === seq) setGate(res) })
      .catch(() => { if (gateReqRef.current === seq) setGate(null) })
  }, [task?.id])

  useEffect(() => { refreshGate() }, [refreshGate, task?.status, task?.pause_reason_type])

  // Tạm dừng. Chọn SURVEYOR thì KHÔNG dừng ngay: bản vẽ sai ranh nghĩa là phải
  // kéo bước đo vẽ về sửa, mà đó là việc nặng nên đi tiếp một nhịp chọn bước.
  const handlePause = useCallback(async ({ reason_type, note }) => {
    if (reason_type === 'SURVEYOR') {
      setPauseOpen(false)
      setRollbackOpen(true)
      return
    }
    setBusy(true)
    try {
      await apiFetch(`/api/employee-portal/tasks/${encodeURIComponent(task.id)}/pause`, {
        method: 'POST',
        body: JSON.stringify({ reason_type, note }),
      })
      setPauseOpen(false)
      addToast?.('Đã tạm dừng, đồng hồ ngừng chạy', 'success')
      onRefresh?.()
    } catch (error) {
      addToast?.(error?.message || 'Không tạm dừng được', 'error')
    } finally {
      setBusy(false)
    }
  }, [task?.id, addToast, onRefresh])

  const handleResume = useCallback(async () => {
    setBusy(true)
    try {
      await apiFetch(`/api/employee-portal/tasks/${encodeURIComponent(task.id)}/resume`, {
        method: 'POST',
      })
      addToast?.('Đã chạy tiếp', 'success')
      onRefresh?.()
    } catch (error) {
      // Đơn nhiệm gác ở đây: đang chạy bước khác thì không tiếp tục được, và câu
      // báo của máy chủ nêu đích danh bước đang vướng.
      addToast?.(error?.message || 'Không chạy tiếp được', 'error')
    } finally {
      setBusy(false)
    }
  }, [task?.id, addToast, onRefresh])

  const handleRollback = useCallback(async ({ target_task_node_id, reason }) => {
    setBusy(true)
    try {
      await apiFetch(
        `/api/contracts/workflow/nodes/${encodeURIComponent(target_task_node_id)}/rollback-requests`,
        { method: 'POST', body: JSON.stringify({ reason }) },
      )
      setRollbackOpen(false)
      addToast?.('Đã gửi yêu cầu quay lại, chờ Giám đốc duyệt', 'success')
      onRefresh?.()
    } catch (error) {
      addToast?.(error?.message || 'Không gửi được yêu cầu', 'error')
    } finally {
      setBusy(false)
    }
  }, [addToast, onRefresh])

  // Nộp/thay tệp cho ĐÚNG một tờ đầu ra, dùng API multipart có sẵn. Danh tính
  // đi theo checklistResultId + templateId do NodeOutputList gửi lên — không
  // đoán theo chỉ số hàng, tờ đầu, hay tên tệp. Chỉ báo thành công SAU khi máy
  // chủ trả về, rồi để onRefresh nạp lại trạng thái thật thay cho state cục bộ.
  const handleUploadDocument = useCallback(async ({ checklistResultId, templateId, file }) => {
    if (!task?.id || !checklistResultId || !templateId || !file) return
    const body = new FormData()
    body.append('template_id', templateId)
    body.append('file', file)
    try {
      await apiFetch(
        `/api/employee-portal/tasks/${encodeURIComponent(task.id)}/checklist/${encodeURIComponent(checklistResultId)}/output-documents`,
        { method: 'POST', body },
      )
      // NỘP XONG THÌ ĐỌC LẠI CỔNG: tờ vừa thay có thể vừa gỡ đúng blocker
      // 'rejected_documents' đang treo cạnh nút. Effect /shortage chỉ chạy lại
      // khi task.id/status/pause đổi — nộp tệp không đổi mấy thứ đó — nên phải
      // tự gọi, nếu không cảnh báo cũ đứng hình và nút vẫn xám dù đã sửa.
      //
      // refreshGate KHÔNG được await và tự nuốt lỗi bên trong: POST đã THÀNH
      // CÔNG rồi, nên một lượt đọc cổng hỏng cũng không được biến thành "nộp
      // lỗi". Giữ nguyên báo thành công và để onRefresh của cha nạp lại thật.
      addToast?.('Đã nộp tài liệu vào hồ sơ', 'success')
      refreshGate()
      onRefresh?.()
    } catch (error) {
      // Nộp hỏng thì KHÔNG đọc lại cổng, KHÔNG gọi onRefresh, KHÔNG báo thành
      // công — chỉ nêu đúng lỗi của máy chủ.
      addToast?.(error?.message || 'Không nộp được tài liệu', 'error')
    }
  }, [task?.id, addToast, onRefresh, refreshGate])

  const closePreview = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setPreview(null)
  }, [])

  const openDocument = useCallback(async (doc) => {
    if (!doc) return
    const docName = doc.name || doc.file_name || doc.fileName || doc.template_id || 'Tài liệu'
    setOpenError(null)

    if (task?.id && doc.document_id) {
      try {
        const token = getAccessToken()
        const res = await fetch(
          `/api/employee-portal/tasks/${encodeURIComponent(task.id)}/documents/${encodeURIComponent(doc.document_id)}/file`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        )
        if (!res.ok) {
          if (res.status === 401) dispatchUnauthorized()
          const body = await res.json().catch(() => null)
          const err = new Error(body?.detail || `HTTP ${res.status}`)
          err.status = res.status
          throw err
        }
        const blob = await res.blob()
        if (blob.size === 0) {
          throw new Error('Tệp rỗng.')
        }
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url
        setPreview({ fileName: docName, mimeType: blob.type || '', url, blob, doc })
        return
      } catch (err) {
        setOpenError(humanizeOpenError(err))
        return
      }
    }

    // Nếu chưa có document_id trên server (ví dụ: tài liệu mẫu, chưa nộp tệp):
    // Vẫn mở DocumentPreviewModal để người dùng xem chi tiết thông tin tài liệu
    setPreview({
      fileName: docName,
      mimeType: doc.mimeType || doc.fileType || 'application/acad',
      url: doc.url || '',
      blob: null,
      doc,
    })
  }, [task?.id])



  const money = {
    base: Number(activeNode?.amount || 0),
    bonus: Number(activeNode?.bonus_amount || 0),
    settled: Boolean(activeNode?.amount_is_settled),
  }

  return (
    <main className="eiw">
      {/* ── TẦNG 1 · Hợp đồng và chuỗi bước ───────────────────────────── */}
      <header className="eiw-top">
        <button
          type="button"
          className="eiw-back"
          onClick={onBack}
          aria-label="Quay lại bàn làm việc"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="eiw-top__id">
          <span>
            HĐ {item.contract_id} · KH: {item.customer_name}
            {item.location_label ? ` · ${item.location_label}` : ''}
          </span>
          <h1>{item.service_line_name}</h1>
        </div>
        <span className={`eiw-top__flag is-${(item.priority || 'NORMAL').toLowerCase()}`}>
          {PRIORITY_LABEL[item.priority] || 'Bình thường'}
        </span>
      </header>

      <NodeChain
        nodes={nodes}
        activeNodeId={activeNodeId}
        openableIds={openableIds}
        onSelect={setPickedNodeId}
      />

      {!task ? (
        <section className="eiw-locked">
          <Lock size={20} />
          <h2>{activeNode?.node_code} · {activeNode?.name || 'Bước chưa tới lượt'}</h2>
          <p>
            {activeNode?.assignee_name
              ? `${activeNode.assignee_name} đang phụ trách bước này.`
              : 'Bước này chưa giao cho ai, hoặc chưa tới lượt bạn.'}
          </p>
        </section>
      ) : (
        <div className="eiw-grid">
          {/* ── CỘT TRÁI ────────────────────────────────────────────── */}
          <div className="eiw-col eiw-col--left">
            <section className="eiw-node-banner" aria-label="Node hiện tại">
              <h2 className="eiw-band eiw-band--name">
                {task.node_code} · {task.name}
              </h2>
            </section>



            <div className="eiw-clock">
              <span className="eiw-clock__label">Thời gian còn lại</span>
              <span className={`eiw-clock__value is-${clock.tone}`}>
                {clock.text}
                {clock.frozen && <em>đồng hồ đã dừng</em>}
              </span>
            </div>

            <div className="eiw-desc">
              {task.description || 'Bước này chưa có mô tả công việc.'}
            </div>

            <section className="eiw-card eiw-attachments-card" aria-label="Tủ hồ sơ đính kèm">
              <button
                type="button"
                className="eiw-band eiw-band--cabinet"
                aria-label="Mở tủ hồ sơ theo bước"
                onClick={() => setCabinetOpen(true)}
              >
                <FolderOpen size={16} /> Mở tủ hồ sơ theo bước
              </button>
            </section>



            <dl className="eiw-money">
              <div className="eiw-money__row">
                <dt>Khoán nhiệm vụ</dt>
                <dd>{formatMoney(money.base)}</dd>
              </div>
              <div className="eiw-money__row">
                <dt>Thưởng{money.settled ? '' : ' dự kiến'}</dt>
                <dd>{formatMoney(money.bonus)}</dd>
              </div>
              <div className="eiw-money__row is-total">
                <dt>Tổng</dt>
                <dd>{formatMoney(money.base + money.bonus)}</dd>
              </div>
            </dl>
          </div>

          {/* ── CỘT PHẢI ────────────────────────────────────────────── */}
          <div className="eiw-col eiw-col--right">
            <div className="eiw-band eiw-band--task">
              <span>Nhiệm vụ</span>
              <span className={`eiw-state is-${task.status}`}>
                {paused
                  ? PAUSE_LABEL[task.pause_reason_type] || 'Đang tạm dừng'
                  : NODE_STATE_LABEL[task.status] || task.status}
              </span>
            </div>

            {/* ── Ô NGHIỆP VỤ — thứ DUY NHẤT đổi theo bước ── */}
            <NodeBusinessSlot
              task={task}
              item={item}
              addToast={addToast}
              onRefresh={onRefresh}
              busy={busy}
              onPause={() => setPauseOpen(true)}
              onResume={handleResume}
            />

            {/* Mỗi mục checklist hiện ĐÚNG MỘT lần. Mục có khai giấy tờ đầu ra
                thì bày danh mục giấy (đúng bản vẽ); mục chỉ đòi minh chứng rời
                thì bày ô nộp minh chứng. Bày cả hai là một mục hai tiêu đề, và
                nhân viên tưởng có hai việc phải làm. */}
            {checklist.map(muc => (
              (muc.output_documents || []).length > 0 ? (
                <NodeOutputList
                  key={muc.id}
                  checklistItem={muc}
                  nodeStatus={task.status}
                  canPropose={!isDirector}
                  onProposeDocument={(muc) => setProposeFor(muc.id)}
                  onOpenDocument={openDocument}
                  onUploadDocument={handleUploadDocument}
                />
              ) : (
                <ChecklistEvidenceItem
                  key={muc.id}
                  taskNodeId={task.id}
                  item={muc}
                  deadlineAt={effectiveDeadline(task)}
                  nodeStatus={task.status}
                  contractId={item.contract_id}
                  onSubmitted={onRefresh}
                />
              )
            ))}

            {/* ── Thông báo của riêng bước này ──
                Đứng ngay trên nút, vì nó nói VÌ SAO nút chưa bấm được. */}
            {(gate?.blockers?.length > 0 || paused || openError) && (
              <div className="eiw-alerts" role="status">
                {openError && (
                  <p className="eiw-alert is-blocked" role="alert">
                    <TriangleAlert size={16} />
                    <span>{openError}</span>
                  </p>
                )}
                {paused && (
                  <p className="eiw-alert is-paused">
                    <TriangleAlert size={16} />
                    <span>
                      {PAUSE_LABEL[task.pause_reason_type] || 'Đang tạm dừng'}
                      {task.paused_note ? ` — ${task.paused_note}` : ''}
                    </span>
                  </p>
                )}
                {(gate?.blockers || [])
                  .filter(item => item.kind !== 'paused' || !paused)
                  .map(blocker => (
                    <p className={`eiw-alert is-${blocker.kind}`} key={blocker.kind}>
                      <TriangleAlert size={16} />
                      <span>{blocker.message}</span>
                    </p>
                  ))}
              </div>
            )}

          </div>

          {/* ── TẦNG 4 · Chân trang ─────────────────────────────────── */}
          <footer className="eiw-foot">
            {!isDirector && !DONE_STATUSES.has(task.status) && (
              activeNode?.my_help_request_id ? (
                <button
                  type="button"
                  className="eiw-btn eiw-btn--ghost"
                  onClick={() => onCancelHelp?.(activeNode.my_help_request_id)}
                >
                  Rút lời nhờ
                </button>
              ) : (
                <button
                  type="button"
                  className="eiw-btn eiw-btn--ghost"
                  onClick={() => onRequestHelp?.(task)}
                >
                  Nhờ hỗ trợ
                </button>
              )
            )}
            <NodeActionBar task={task} onChanged={onRefresh} gate={gate} />
          </footer>
        </div>
      )}

      <PriorDocumentsDrawer
        open={cabinetOpen}
        taskNodeId={task?.id}
        contractId={item.contract_id}
        serviceLineId={item.service_line_id}
        currentNodeCode={task?.node_code}
        onClose={() => setCabinetOpen(false)}
        onOpenDocument={openDocument}
      />

      <PauseReasonModal
        open={pauseOpen}
        busy={busy}
        onClose={() => setPauseOpen(false)}
        onConfirm={handlePause}
      />

      {proposeFor && (
        <SlotRequestModal
          checklistResultId={proposeFor}
          addToast={addToast}
          onClose={() => setProposeFor(null)}
          onDone={() => { setProposeFor(null); onRefresh?.() }}
        />
      )}

      <RollbackPickerModal
        open={rollbackOpen}
        nodes={nodes}
        currentTaskNodeId={activeNodeId}
        busy={busy}
        onClose={() => setRollbackOpen(false)}
        onSubmit={handleRollback}
      />

      <DocumentPreviewModal
        open={Boolean(preview)}
        fileName={preview?.fileName || ''}
        mimeType={preview?.mimeType || ''}
        url={preview?.url || ''}
        blob={preview?.blob || null}
        doc={preview?.doc || null}
        checklistItem={preview?.checklistItem || null}
        nodeId={task?.node_code || 'K01'}
        onClose={closePreview}
      />

    </main>
  )
}

