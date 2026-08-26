import { useCallback, useMemo, useState } from 'react'
import { ArrowLeft, Check, ExternalLink, LayoutGrid, Lock } from 'lucide-react'

import { useToast } from '../../contexts/ToastContext'
import LegalDossierNodePanel from '../legal-dossier/LegalDossierNodePanel'
import SubmissionReceiptPanel from '../legal-dossier/SubmissionReceiptPanel'
import HandoverPanel from '../handover/HandoverPanel'
import DocumentRegister from '../document-register/DocumentRegister'
import { ChecklistEvidenceItem, NodeActionBar } from './EmployeeWorkspaceCalendar'

const moneyLabel = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))}đ`

const shortMoney = (value) => {
  const amount = Number(value || 0)
  if (!amount) return '—'
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}tr`
  return `${Math.round(amount / 1_000)}k`
}

const initials = (name) => (name || '?')
  .trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase()

const DONE_STATUSES = new Set(['accepted', 'completed'])
const OPEN_STATUSES = new Set(['in_progress', 'ready', 'rework_required', 'submitted'])

const NODE_STATE_LABEL = {
  accepted: 'Đã xong',
  completed: 'Đã xong',
  in_progress: 'Đang thực hiện',
  submitted: 'Đã nộp, chờ duyệt',
  ready: 'Sẵn sàng làm',
  rework_required: 'Cần làm lại',
  pending: 'Chưa tới',
  blocked: 'Bị chặn',
}

const remainingLabel = (deadlineAt) => {
  if (!deadlineAt) return null
  const difference = new Date(deadlineAt).getTime() - Date.now()
  const overdue = difference < 0
  const hours = Math.ceil(Math.abs(difference) / 3_600_000)
  if (hours < 24) return `${overdue ? 'Trễ' : 'Còn'} ${hours} giờ`
  return `${overdue ? 'Trễ' : 'Còn'} ${Math.round(hours / 24)} ngày`
}

/** Một ô bước trên sơ đồ chuỗi. Xếp so le trên/dưới để đọc được chuỗi dài. */
function ChainNode({ node, index, selected, selectable, onSelect }) {
  const done = DONE_STATUSES.has(node.status)
  const tone = done ? 'done' : selected ? 'current' : OPEN_STATUSES.has(node.status) ? 'open' : 'idle'

  return <button
    type="button"
    className={`eiw-node is-${tone}${index % 2 === 1 ? ' is-low' : ''}`}
    disabled={!selectable}
    onClick={() => selectable && onSelect(node.id)}
    aria-current={selected ? 'step' : undefined}
  >
    {node.assignee_name && <span className="eiw-node__who" title={node.assignee_name}>{initials(node.assignee_name)}</span>}
    <span className="eiw-node__code">{node.node_code}</span>
    {done && <Check size={14} className="eiw-node__tick" />}
    <strong className="eiw-node__name">{node.name}</strong>
    <span className="eiw-node__foot">
      <em>{selected ? 'ĐANG CHỌN' : NODE_STATE_LABEL[node.status] || node.status}</em>
      <b>{shortMoney(node.amount)}</b>
    </span>
  </button>
}

export default function EmployeeItemWorkspace({ item, tasks = [], onBack, onRefresh, isDirector = false }) {
  const { addToast } = useToast() || {}
  const [pickedNodeId, setPickedNodeId] = useState(null)
  const [k01Status, setK01Status] = useState(null)
  const handleK01StatusChange = useCallback(status => setK01Status(status), [])

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

  const checklist = task?.checklist || []
  const remaining = remainingLabel(task?.deadline_at)
  const isHandover = Boolean(task?.is_handover || task?.node_code === 'K06')
  const nextNode = useMemo(() => {
    const position = nodes.findIndex(node => node.id === activeNodeId)
    return position >= 0 ? nodes[position + 1] : null
  }, [nodes, activeNodeId])

  return <main className="eiw">
    <header className="eiw-top">
      <button type="button" className="eiw-back" onClick={onBack} aria-label="Quay lại bàn làm việc">
        <ArrowLeft size={18} />
      </button>
      <div className="eiw-top__id">
        <span>HĐ {item.contract_id} · KH: {item.customer_name}{item.location_label ? ` · ${item.location_label}` : ''}</span>
        <h1>{item.service_line_name}</h1>
      </div>
      <div className="eiw-top__money">
        <span>Khoán đã tích luỹ</span>
        <strong>{moneyLabel(item.amount_earned)} <i>/ {moneyLabel(item.amount_total)}</i></strong>
      </div>
    </header>

    <section className="eiw-panel" aria-label="Sơ đồ chuỗi công việc">
      <div className="eiw-panel__head">
        <h2><LayoutGrid size={17} /> SƠ ĐỒ CHUỖI CÔNG VIỆC</h2>
        <div className="eiw-legend">
          <span><i className="is-done" />Đã xong</span>
          <span><i className="is-current" />Đang chọn</span>
          <span><i className="is-idle" />Chưa tới</span>
        </div>
      </div>

      <div className="eiw-chain">
        {nodes.map((node, index) => (
          <ChainNode
            key={node.id}
            node={node}
            index={index}
            selected={node.id === activeNodeId}
            // Chỉ mở được bước của mình. Bước của người khác vẫn hiện đầy đủ để
            // nắm bối cảnh chuỗi, nhưng không bấm vào được.
            selectable={Boolean(node.mine) && tasks.some(row => row.id === node.id)}
            onSelect={setPickedNodeId}
          />
        ))}
      </div>
    </section>

    {task ? (
      <section className={`eiw-work${OPEN_STATUSES.has(task.status) ? ' is-open' : ''}`} aria-label="Bước đang làm">
        <div className="eiw-work__head">
          <span className="eiw-work__code">{task.node_code}</span>
          <h2>{task.name}</h2>
          <span className={`eiw-work__state is-${task.status}`}>{NODE_STATE_LABEL[task.status] || task.status}</span>
          {remaining && <span className="eiw-work__clock">⏱ {remaining}</span>}
        </div>

        <div className="eiw-work__who">
          <span>{initials(activeNode?.assignee_name)}</span>
          {activeNode?.assignee_name || 'Chưa phân công'}
        </div>

        {task.description && <p className="eiw-work__brief">{task.description}</p>}

        {/* K01 là bước rà soát và phân loại giấy khách đưa. Việc của bước này
            NẰM TRONG sổ gốc, nên đưa sổ vào thẳng đây thay vì bắt nhân viên
            mở sang màn hợp đồng rồi quay lại. */}
        {/* SỔ TÀI LIỆU HẠNG MỤC — cấu trúc TỔNG, hiện ở MỌI bước.
            Trước đây chỉ K01 có sổ, K02…K07 không thấy gì: người làm bước sau
            không biết hồ sơ đang có những giấy nào, phải mở sang màn hợp đồng.
            Mà sổ là thứ xuyên suốt cả quy trình, không phải tài sản của K01.
            K01 thu giấy đầu vào nên mở kèm kho tệp thô; bước khác chỉ cần sổ. */}
        <DocumentRegister
          contractId={item.contract_id}
          serviceLineId={item.service_line_id}
          addToast={addToast}
          title={task.node_code === 'K01'
            ? 'Phân loại giấy tờ khách cung cấp'
            : 'Sổ tài liệu Hạng mục'}
          inputOnly
          collapsible={task.node_code !== 'K01'}
          nodeKey={(task.node_key || task.node_code || '').toLowerCase()}
          onK01StatusChange={task.node_code === 'K01' ? handleK01StatusChange : undefined}
          checklistResultId={checklist[0]?.id || ''}
        />

        {/* Thiếu giấy KHÔNG khoá nút nữa: NodeActionBar tự hỏi máy chủ còn
            thiếu gì rồi mở Modal xác nhận. Chặn ở đây là treo bước khi giấy
            khách không có thật. */}
        <NodeActionBar task={task} onChanged={onRefresh} />

        {/* Panel chuyên biệt tự ẩn khi không đúng loại bước. */}
        <LegalDossierNodePanel taskNodeId={task.id} addToast={addToast} onChanged={onRefresh} />
        <SubmissionReceiptPanel taskNodeId={task.id} addToast={addToast} onChanged={onRefresh} />
        <HandoverPanel
          taskNodeId={task.id}
          addToast={addToast}
          onChanged={onRefresh}
          onRefresh={onRefresh}
          isDirector={isDirector}
          checklist={checklist}
          deadlineAt={task.deadline_at}
          hideIfNotHandover
        />

        {/* KHÔNG truyền disabledReason theo tình trạng giấy tờ nữa. Thiếu giấy mà
            khoá luôn việc đánh dấu nhiệm vụ xong thì bước không bao giờ nộp
            được — đúng cái ngõ cụt §4 cấm. Thiếu giấy xử ở Modal lúc bấm "Nộp
            nghiệm thu", và Giám đốc là người quyết. */}
        {!isHandover && (checklist.length > 0 ? (
          <ul className="eiw-checklist">
            {checklist.map(row => <ChecklistEvidenceItem
              key={row.id || row.key}
              taskNodeId={task.id}
              item={row}
              contractId={item.contract_id}
              deadlineAt={task.deadline_at}
              nodeStatus={task.status}
              onSubmitted={onRefresh}
            />)}
          </ul>
        ) : <p className="eiw-empty">Bước này không có checklist minh chứng.</p>)}

        {!isHandover && checklist.length > 0 && (
          <p className="eiw-hint">
            Nộp minh chứng → quản lý duyệt hết mục checklist → hệ thống <strong>tự đóng bước</strong>
            {nextNode ? <> và mở tiếp <strong>{nextNode.node_code} {nextNode.name}</strong></> : null}, không cần bấm nộp nghiệm thu.
          </p>
        )}
        {isHandover && (
          <p className="eiw-hint">
            Bước bàn giao là ngoại lệ: phải <strong>chủ động nộp nghiệm thu</strong> và Giám đốc duyệt cả bước,
            checklist lẻ không tự đóng bước. Cổng công nợ phải mở trước.
          </p>
        )}

        <button
          type="button"
          className="eiw-full"
          onClick={() => window.dispatchEvent(new CustomEvent('bachkhoa:open-workflow-node-full-detail', {
            detail: {
              taskNodeId: task.id,
              nodeKey: task.node_key,
              contractId: item.contract_id,
              serviceLineId: item.service_line_id,
            },
          }))}
        >
          <ExternalLink size={14} /> Xem chi tiết đầy đủ
        </button>
      </section>
    ) : (
      <section className="eiw-work" aria-label="Bước chưa tới lượt">
        <p className="eiw-empty">
          <Lock size={15} />
          {activeNode
            ? `${activeNode.node_code} ${activeNode.name} chưa tới lượt bạn — bước trước chưa nghiệm thu xong.`
            : 'Chọn một bước của bạn trên sơ đồ để bắt đầu làm.'}
        </p>
      </section>
    )}
  </main>
}
