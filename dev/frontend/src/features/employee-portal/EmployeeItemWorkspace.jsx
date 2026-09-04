import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FolderOpen, Lock, TriangleAlert } from 'lucide-react'

import { useToast } from '../../contexts/ToastContext'
import { apiFetch } from '../../lib/api'
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
  useEffect(() => {
    if (!task?.id) { setGate(null); return undefined }
    let huy = false
    apiFetch(`/api/employee-portal/tasks/${encodeURIComponent(task.id)}/shortage`)
      .then(res => { if (!huy) setGate(res) })
      .catch(() => { if (!huy) setGate(null) })
    return () => { huy = true }
  }, [task?.id, task?.status, task?.pause_reason_type])

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

  const openDocument = useCallback((doc) => {
    // Link mở tệp xin theo từng tờ, đúng lúc bấm — xem PriorDocumentsDrawer.
    addToast?.(`Đang mở “${doc.name || doc.template_id}”…`, 'success')
  }, [addToast])

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
            <h2 className="eiw-band eiw-band--name">
              {task.node_code}: {task.name}
            </h2>

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

            <button
              type="button"
              className="eiw-band eiw-band--cabinet"
              onClick={() => setCabinetOpen(true)}
            >
              <FolderOpen size={16} /> Tủ hồ sơ
            </button>

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
            {(gate?.blockers?.length > 0 || paused) && (
              <div className="eiw-alerts" role="status">
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
            <NodeActionBar task={task} onChanged={onRefresh} />
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
    </main>
  )
}
