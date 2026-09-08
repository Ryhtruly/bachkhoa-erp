import { useMemo, useState } from 'react'
import { BriefcaseBusiness, CheckCircle2, ChevronRight, Clock, Info, LifeBuoy, MapPin, Plus, Rocket, RotateCcw, Star, Users, Zap } from 'lucide-react'

import AvatarImage from '../../components/AvatarImage'
import CompletedItemsModal from './CompletedItemsModal'
import EmployeeItemWorkspace from './EmployeeItemWorkspace'
import EmployeeWorkspaceCalendar from './EmployeeWorkspaceCalendar'
import PoolItemDetailModal from './PoolItemDetailModal'

const moneyLabel = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))}đ`

const shortMoney = (value) => {
  const amount = Number(value || 0)
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}tr`
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}k`
  return String(amount)
}

const DEPARTMENT_LABEL = {
  SURVEY: 'Đo vẽ',
  LEGAL: 'Pháp lý',
  SALES: 'Sale / CSKH',
  ACCOUNTING: 'Kế toán',
}

// Trạng thái node quy về đúng 3 sắc thái mà nhân viên cần phân biệt trên thẻ
// Hạng mục: xong / đang làm / chưa tới lượt. Chi tiết hơn để dành cho màn thao tác.
const STEP_TONE = {
  accepted: 'done',
  completed: 'done',
  in_progress: 'active',
  submitted: 'active',
  rework_required: 'rework',
  ready: 'active',
}

const deadlineLabel = (deadlineAt) => {
  if (!deadlineAt) return null
  const difference = new Date(deadlineAt).getTime() - Date.now()
  const overdue = difference < 0
  const hours = Math.ceil(Math.abs(difference) / 3_600_000)
  if (hours < 24) return `${overdue ? 'Trễ' : 'SLA'} ${hours} giờ`
  return `${overdue ? 'Trễ' : 'SLA'} ${Math.round(hours / 24)} ngày`
}

function PriorityBadge({ priority }) {
  if (!priority || priority === 'NORMAL') return null
  const urgent = priority === 'URGENT'
  return <span className={`ew-badge ew-badge--${urgent ? 'urgent' : 'high'}`}>
    {urgent ? <Zap size={11} /> : <Star size={11} />}{urgent ? 'Gấp' : 'Ưu tiên'}
  </span>
}

/** Thanh tiến độ theo BƯỚC — mỗi ô là một bước thật của chuỗi, không phải phần trăm ước lượng. */
function StepMeter({ nodes = [] }) {
  return <div className="ew-steps" aria-hidden="true">
    {nodes.map((node) => (
      <span key={node.id} className={`ew-steps__cell is-${STEP_TONE[node.status] || 'idle'}`} />
    ))}
  </div>
}

function HeldItemCard({ item, departmentLabel, onOpen, onYield, onCancelYield }) {
  const stepLabel = `${item.steps_done}/${item.steps_total} bước`
  const running = item.current_node_status === 'in_progress'
  const rework = item.current_node_status === 'rework_required'
  // Bước của mình nhưng chưa tới lượt thì không mở ra làm được — bước trước
  // chưa nghiệm thu xong. Cho bấm vào sẽ chỉ nhận lỗi từ máy chủ.
  const waiting = item.current_node_status === 'pending'
  // Đã nhờ rồi thì không nhờ lại được nữa — máy chủ chặn bằng 409. Nút phải nói
  // đúng trạng thái đó thay vì để nhân viên bấm vào rồi mới biết.
  const daNho = Boolean(item.current_help_request_open)
  const idLoiNhoCuaMinh = item.current_help_request_id || null

  return <article className={`ew-held${rework ? ' is-rework' : ''}`}>
    <header className="ew-held__top">
      <span className="ew-chip ew-chip--dept">{departmentLabel}</span>
      {rework
        ? <span className="ew-held__state is-rework">● Cần sửa</span>
        : running
          ? <span className="ew-held__state is-running">● Đang làm</span>
          : waiting
            ? <span className="ew-held__state">● Chờ bước trước</span>
            : <span className="ew-held__state is-running">● Sẵn sàng làm</span>}
    </header>

    <strong className="ew-held__title">{item.service_line_name} · HĐ {item.contract_id}</strong>
    <p className="ew-held__meta">
      KH: {item.customer_name}{item.location_label ? ` · ${item.location_label}` : ''}
    </p>

    <p className="ew-held__current">
      <ChevronRight size={13} />
      <span className="ew-held__current-label">Bước:</span>
      <strong title={`${item.current_node_code} ${item.current_node_name}`}>
        {item.current_node_code} {item.current_node_name}
      </strong>
    </p>

    <div className="ew-held__progress">
      <StepMeter nodes={item.nodes} />
      <div className="ew-held__progress-labels">
        <span>{stepLabel}</span>
        {item.amount_total > 0 && (
          <span>
            <strong>{shortMoney(item.amount_earned)}</strong>/{shortMoney(item.amount_total)}
          </span>
        )}
      </div>
    </div>

    <div className="ew-held__actions">
      <button
        type="button"
        className="ew-btn ew-btn--dark"
        onClick={onOpen}
      >
        Mở ra làm
      </button>
      {idLoiNhoCuaMinh ? (
        <button
          type="button"
          className="ew-btn ew-btn--sos"
          title="Rút bước này khỏi Bể việc, tự làm tiếp"
          onClick={() => onCancelYield(idLoiNhoCuaMinh, item.current_node_code)}
        >
          <LifeBuoy size={14} /> Rút lại lời nhờ
        </button>
      ) : (
        <button
          type="button"
          className="ew-btn ew-btn--sos"
          disabled={!item.current_task_node_id || waiting || daNho}
          title={
            daNho ? 'Bước này đang nằm trên Bể việc, chờ đồng đội nhận'
              : waiting ? 'Bước chưa tới lượt thì chưa nhường được'
                : 'Đẩy bước này lên Bể việc nhờ đồng đội làm hộ'
          }
          onClick={() => onYield(item.current_task_node_id, item.current_node_code, item.current_node_name)}
        >
          <LifeBuoy size={14} /> {daNho ? 'Đang chờ người nhận' : 'Nhờ hỗ trợ'}
        </button>
      )}
    </div>
  </article>
}

function EmptySlotCard({ remaining }) {
  return <div className="ew-held ew-held--empty">
    <div className="ew-held--empty-icon">
      <Plus size={16} />
    </div>
    <strong>Còn {remaining} slot trống</strong>
    <span>Nhận hạng mục mới từ Bể việc</span>
  </div>
}

function ChainPoolCard({ item, departmentLabel, onClaim, onDetail, claiming, blocked, blockedReason }) {
  const role = item.available_roles.find(code => code !== 'ASSISTANT') || 'MAIN'
  const amount = item.chain_amount || item.role_amounts?.[role] || 0
  const sla = deadlineLabel(item.deadline_at)

  return <article className="ew-card">
    <header className="ew-card__top">
      <span className="ew-chip ew-chip--dept">{departmentLabel}</span>
      <PriorityBadge priority={item.priority} />
    </header>
    <strong className="ew-card__title">{item.service_line_name}</strong>
    <p className="ew-card__meta">HĐ {item.contract_id} · KH: {item.customer_name}</p>
    {(item.location_label || sla) && <p className="ew-card__meta ew-card__meta--place">
      {item.location_label && <><MapPin size={12} />{item.location_label}</>}
      {sla && <><Clock size={12} />{sla}</>}
    </p>}

    <div className="ew-card__rule" />

    <div className="ew-card__chain">
      {(item.chain_codes || [item.node_code]).map((code, index) => (
        <span key={code} className="ew-card__chain-item">
          {index > 0 && <i>→</i>}
          <b>{code}</b>
        </span>
      ))}
      <span className="ew-card__chain-note">
        · {item.step_count || 1} bước{item.output_count ? ` · ${item.output_count} đầu ra` : ''}
      </span>
    </div>

    <div className="ew-card__money">
      <span>Tổng khoán dự kiến</span>
      <strong>{moneyLabel(amount)}</strong>
    </div>

    <div className="ew-card__actions">
      <button type="button" className="ew-btn ew-btn--ghost" onClick={() => onDetail(item.id)}>
        Chi tiết
      </button>
      {item.can_claim === false ? (
        <p className="ew-card__note" role="note">{item.cannot_claim_reason}</p>
      ) : (
        <button
          type="button"
          className="ew-btn ew-btn--primary"
          disabled={blocked || claiming}
          title={blocked ? blockedReason : undefined}
          onClick={() => onClaim(item.id, role)}
        >
          {claiming ? 'Đang nhận…' : <><Rocket size={14} /> Nhận trọn</>}
        </button>
      )}
    </div>
  </article>
}

function AssistPoolCard({ item, onClaim, claiming }) {
  const amount = item.role_amounts?.ASSISTANT || 0
  const sla = deadlineLabel(item.deadline_at)

  return <article className="ew-card ew-card--assist">
    <header className="ew-card__top">
      <span className="ew-chip ew-chip--assist"><Users size={11} /> Slot thợ phụ</span>
      <PriorityBadge priority={item.priority} />
    </header>
    <strong className="ew-card__title">{item.node_code} · {item.name}</strong>
    <p className="ew-card__meta">HĐ {item.contract_id} · KH: {item.customer_name}</p>
    {(item.location_label || sla) && <p className="ew-card__meta ew-card__meta--place">
      {item.location_label && <><MapPin size={12} />{item.location_label}</>}
      {sla && <><Clock size={12} />{sla}</>}
    </p>}

    <p className="ew-card__note">
      Đi cùng thợ chính ra hiện trường. Suất này đóng lại ngay khi thợ chính bấm
      <strong> Bắt đầu đo</strong>, nên nhận sớm mới còn.
    </p>

    <div className="ew-card__money">
      <span>Khoán cố định</span>
      <strong className="is-assist">{moneyLabel(amount)}</strong>
    </div>

    <div className="ew-card__actions">
      {item.can_claim === false ? (
        <p className="ew-card__note" role="note">{item.cannot_claim_reason}</p>
      ) : (
        <button
          type="button"
          className="ew-btn ew-btn--assist"
          disabled={claiming}
          onClick={() => onClaim(item.id, 'ASSISTANT')}
        >
          {claiming ? 'Đang nhận…' : <><Users size={14} /> Nhận làm phụ</>}
        </button>
      )}
    </div>
  </article>
}

function HelpPoolCard({ item, onClaim, claiming }) {
  const sla = deadlineLabel(item.deadline_at)

  return <article className="ew-card ew-card--help">
    <header className="ew-card__top">
      <span className="ew-chip ew-chip--help"><LifeBuoy size={11} /> Cần hỗ trợ</span>
      <PriorityBadge priority={item.priority} />
    </header>
    <strong className="ew-card__title">{item.node_code} · {item.name}</strong>
    <p className="ew-card__meta">HĐ {item.contract_id} · KH: {item.customer_name}</p>
    {(item.location_label || sla) && <p className="ew-card__meta ew-card__meta--place">
      {item.location_label && <><MapPin size={12} />{item.location_label}</>}
      {sla && <><Clock size={12} />{sla}</>}
    </p>}

    {/* Lý do nhường nói bằng lời của chính người nhường — người nhận cần biết
        mình đang gánh cái gì trước khi bấm. */}
    <blockquote className="ew-card__quote">
      <b>{item.yielded_by_name}:</b> “{item.reason}”
    </blockquote>

    <div className="ew-card__money">
      <span>Khoán đề xuất</span>
      <div className="ew-card__money-right">
        <strong className="is-help">{item.proposed_amount > 0 ? moneyLabel(item.proposed_amount) : 'Sếp chốt'}</strong>
        <em>* Giám đốc chốt khi duyệt, có thể khác</em>
      </div>
    </div>

    <div className="ew-card__actions">
      {/* Thẻ hiện cho cả người nhờ lẫn phòng khác để ai cũng nắm được bước đang
          kẹt. Nhưng chỉ người thực sự nhận được mới thấy nút — bày nút cho người
          không có quyền chỉ tổ để họ bấm rồi ăn lỗi từ máy chủ. */}
      {item.can_claim === false ? (
        <p className="ew-card__note" role="note">{item.cannot_claim_reason}</p>
      ) : (
        <button
          type="button"
          className="ew-btn ew-btn--help"
          disabled={claiming}
          onClick={() => onClaim(item.help_request_id)}
        >
          {claiming ? 'Đang nhận…' : <><LifeBuoy size={14} /> Nhận làm hộ</>}
        </button>
      )}
    </div>
  </article>
}

const POOL_TABS = [
  { id: 'CHAIN', label: 'Nhận trọn' },
  { id: 'ASSIST', label: 'Thợ phụ' },
  { id: 'HELP', label: 'Hỗ trợ' },
]

export default function EmployeeWorkspace({
  employee,
  tasks = [],
  heldItems = [],
  taskPool = { items: [], restrictions: {} },
  dailySummary = null,
  completedItems = { count: 0, items: [] },
  onClaim,
  onClaimHelp,
  onYield,
  onCancelYield,
  claimingKey = '',
  onRefresh,
  isDirector = false,
}) {
  const [openItemId, setOpenItemId] = useState(null)
  const [detailNodeId, setDetailNodeId] = useState(null)
  const [activeTab, setActiveTab] = useState('CHAIN')
  const [historyOpen, setHistoryOpen] = useState(false)

  const doneItems = completedItems?.items || []
  const doneCount = Number(completedItems?.count ?? doneItems.length)

  const departmentCode = (taskPool.department_code || '').toUpperCase()
  const departmentLabel = DEPARTMENT_LABEL[departmentCode] || employee?.department || 'Phòng ban'
  const restrictions = taskPool.restrictions || {}

  const poolItems = taskPool.items || []
  const byGroup = useMemo(() => {
    const chain = []
    const assist = []
    poolItems.forEach((item) => {
      const groups = item.groups || []
      if (groups.includes('CHAIN')) chain.push(item)
      if (groups.includes('ASSIST')) assist.push(item)
    })
    return { CHAIN: chain, ASSIST: assist, HELP: taskPool.help_items || [] }
  }, [poolItems, taskPool.help_items])

  const openItem = useMemo(
    () => heldItems.find(entry => entry.workflow_instance_id === openItemId) || null,
    [heldItems, openItemId],
  )

  const wipLimit = Number(restrictions.wip_limit || 3)
  const wipUsed = Number(restrictions.held_items || 0)
  const activeInProgress = Number(restrictions.active_in_progress || 0)

  const wipLocked = Boolean(restrictions.wip_locked)
  const chainClaimLocked = wipLocked || activeInProgress >= 1
  const freeSlots = Math.max(0, wipLimit - wipUsed)

  const claimBlockedReason = activeInProgress >= 1
    ? 'Bạn đang có một bước đang làm dở dang. Hãy hoàn thành hoặc nhường lại trước khi nhận chuỗi mới.'
    : wipLocked
      ? `Bạn đang giữ tối đa ${wipLimit} hạng mục dở dang. Hãy hoàn thành nghiệm thu một hạng mục để nhận thêm việc mới.`
      : ''

  const visibleItems = byGroup[activeTab] || []

  // Bấm vào một hạng mục đang giữ là mở hẳn màn làm việc của hạng mục đó, chứ
  // không phải mở hộp thoại một bước — nhân viên cần thấy cả chuỗi để biết mình
  // đang ở đâu và còn bao nhiêu tiền phía trước.
  if (openItem) {
    return <EmployeeItemWorkspace
      item={openItem}
      tasks={tasks}
      onBack={() => setOpenItemId(null)}
      onRefresh={onRefresh}
      // Nhờ hỗ trợ dùng lại đúng hai handler của bàn làm việc, không dựng đường
      // gọi thứ hai cho cùng một việc.
      onRequestHelp={(task) => onYield(task.id, task.node_code, task.name)}
      onCancelHelp={(requestId, nodeCode, nodeName) => onCancelYield(
        requestId,
        nodeCode || openItem.current_node_code,
        nodeName || openItem.current_node_name,
      )}
      isDirector={isDirector}
    />
  }

  return <main className="ew">
    {/* ============ TẢI CỦA BẠN ============ */}
    {/* Một dải ngang riêng, không nhét vào góc phải đầu trang: đây là hàng rào
        quyết định nhân viên còn được nhận việc hay không, phải đọc được ngay. */}
    <div className="ew-load">
      <span className="ew-load__label">Tải của bạn</span>
      <div className="ew-load__bar">
        <i style={{ width: `${Math.min(100, (wipUsed / wipLimit) * 100)}%` }} className={wipLocked ? 'is-full' : ''} />
      </div>
      <strong className="ew-load__count">{wipUsed} / {wipLimit} hạng mục</strong>
      <p className={`ew-load__hint${wipLocked ? ' is-full' : ''}`}>
        <Info size={14} />
        {wipLocked
          ? 'Đủ tải — hoàn thành một hạng mục để nhận thêm'
          : `Còn ${freeSlots} slot — nhận thêm ở Bể việc bên dưới`}
      </p>
    </div>

    <EmployeeWorkspaceCalendar
      tasks={tasks}
      taskPool={taskPool}
      dailySummary={dailySummary}
      onClaim={onClaim}
      claimingKey={claimingKey}
      onRefresh={onRefresh}
      isDirector={isDirector}
      hidePool
    />

    {/* ============ HẠNG MỤC ĐÃ NHẬN ============ */}
    <section className="ew-section" aria-label="Hạng mục bạn đã nhận">
      <div className="ew-section__head">
        <span className="ew-section__icon is-green"><CheckCircle2 size={18} /></span>
        <h2>Hạng mục bạn đã nhận</h2>

        {/* Lịch sử nằm ngay cạnh khối việc đang làm, không phải ở góc trang:
            nhân viên đối chiếu "đang làm gì" với "đã làm gì" trong cùng tầm mắt. */}
        <button
          type="button"
          className="ew-section__link"
          onClick={() => setHistoryOpen(true)}
          disabled={doneCount === 0}
          title={doneCount === 0 ? 'Chưa hoàn thành hạng mục nào' : 'Xem lại quy trình đã làm'}
        >
          <RotateCcw size={14} />
          Xem quy trình đã hoàn thành
          {doneCount > 0 && <span className="ew-section__link-count">{doneCount}</span>}
        </button>
      </div>

      <div className="ew-held-grid">
        {heldItems.map(item => <HeldItemCard
          key={item.workflow_instance_id}
          item={item}
          departmentLabel={departmentLabel}
          onOpen={() => setOpenItemId(item.workflow_instance_id)}
          onYield={onYield}
          onCancelYield={onCancelYield}
        />)}
        {freeSlots > 0 && <EmptySlotCard remaining={freeSlots} />}
        {heldItems.length === 0 && freeSlots === 0 && (
          <p className="ew-empty">Bạn chưa nhận hạng mục nào. Chọn việc ở Bể việc bên dưới.</p>
        )}
      </div>
    </section>

    <div className="ew-divider" />

    {/* ============ BỂ VIỆC ============ */}
    <section className="ew-section" aria-label="Bể việc">
      <div className="ew-section__head">
        <span className="ew-section__icon is-orange"><BriefcaseBusiness size={18} /></span>
        <h2>
          Bể việc phòng {departmentLabel}
          <span className="ew-section__sub"> · {poolItems.length} việc có thể nhận</span>
        </h2>

        <div className="ew-tabs" role="tablist" aria-label="Nhóm việc trong bể việc">
          {POOL_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`ew-tab-${tab.id.toLowerCase()}`}
              aria-controls={`ew-pool-panel-${tab.id.toLowerCase()}`}
              aria-selected={activeTab === tab.id}
              className={`ew-tab ew-tab--${tab.id.toLowerCase()}${activeTab === tab.id ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <span className="ew-tab__count">{(byGroup[tab.id] || []).length}</span>
            </button>
          ))}
        </div>
      </div>

      {chainClaimLocked && activeTab === 'CHAIN' && <div className="ew-lock" role="status">
        🔒 {claimBlockedReason}
      </div>}

      <div
        className="ew-pool"
        role="tabpanel"
        id={`ew-pool-panel-${activeTab.toLowerCase()}`}
        aria-labelledby={`ew-tab-${activeTab.toLowerCase()}`}
        tabIndex={0}
      >
        {visibleItems.map((item) => {
          if (activeTab === 'HELP') {
            return <HelpPoolCard
              key={item.help_request_id}
              item={item}
              onClaim={onClaimHelp}
              claiming={claimingKey === `help:${item.help_request_id}`}
            />
          }
          if (activeTab === 'ASSIST') {
            return <AssistPoolCard
              key={`${item.id}:ASSISTANT`}
              item={item}
              onClaim={onClaim}
              claiming={claimingKey === `${item.id}:ASSISTANT`}
            />
          }
          const role = item.available_roles.find(code => code !== 'ASSISTANT') || 'MAIN'
          return <ChainPoolCard
            key={`${item.id}:${role}`}
            item={item}
            departmentLabel={departmentLabel}
            onClaim={onClaim}
            onDetail={setDetailNodeId}
            claiming={claimingKey === `${item.id}:${role}`}
            blocked={chainClaimLocked || item.preference_locked}
            blockedReason={item.preference_locked
              ? 'Bước này đang được ưu tiên cho người đã đo K02.'
              : claimBlockedReason}
          />
        })}

        {visibleItems.length === 0 && <p className="ew-empty ew-empty--pool">
          {activeTab === 'HELP'
            ? 'Chưa có bước nào được nhường lên Bể việc.'
            : 'Không có việc nào trong nhóm này.'}
        </p>}
      </div>
    </section>

    {detailNodeId && (() => {
      const target = poolItems.find(entry => entry.id === detailNodeId)
      const role = target?.available_roles?.find(code => code !== 'ASSISTANT') || 'MAIN'
      const itemBlocked = target?.can_claim === false || target?.preference_locked;
      const itemBlockedReason = target?.can_claim === false
        ? target.cannot_claim_reason
        : 'Bước này đang được ưu tiên cho người đã đo K02.';
      const isBlocked = chainClaimLocked || itemBlocked;
      const finalReason = itemBlocked ? itemBlockedReason : claimBlockedReason;

      return <PoolItemDetailModal
        taskNodeId={detailNodeId}
        onClose={() => setDetailNodeId(null)}
        claiming={claimingKey.startsWith(`${detailNodeId}:`)}
        blocked={isBlocked}
        blockedReason={finalReason}
        onClaim={() => {
          setDetailNodeId(null)
          onClaim(detailNodeId, role)
        }}
      />
    })()}

    {historyOpen && <CompletedItemsModal
      items={doneItems}
      onClose={() => setHistoryOpen(false)}
    />}
  </main>
}
