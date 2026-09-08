import { useEffect, useState } from 'react'
import { Clock, Coins, Rocket, Star, Users, Zap } from 'lucide-react'

import Modal from '../../components/ui/Modal'
import { apiFetch } from '../../lib/api'

const moneyLabel = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))}đ`

/** SLA của bước nói bằng đơn vị người ta hình dung được, không phải giây. */
const durationLabel = (seconds) => {
  const total = Number(seconds || 0)
  if (!total) return null
  const hours = Math.round(total / 3600)
  if (hours < 24) return `${hours} giờ`
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  return rest ? `${days} ngày ${rest} giờ` : `${days} ngày`
}

const deadlineLabel = (deadlineAt) => {
  if (!deadlineAt) return null
  const target = new Date(deadlineAt)
  const difference = target.getTime() - Date.now()
  const overdue = difference < 0
  const hours = Math.ceil(Math.abs(difference) / 3_600_000)
  const span = hours < 24 ? `${hours} giờ` : `${Math.round(hours / 24)} ngày`
  const stamp = target.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  return `${overdue ? 'Trễ' : 'Còn'} ${span} · hạn ${stamp}`
}

function Row({ label, children }) {
  if (!children) return null
  return <div className="pid-row">
    <span>{label}</span>
    <strong>{children}</strong>
  </div>
}

export default function PoolItemDetailModal({ taskNodeId, onClose, onClaim, claiming, blocked, blockedReason }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setError('')
    apiFetch(`/api/employee-portal/task-pool/${taskNodeId}/detail`)
      .then((payload) => { if (!cancelled) setDetail(payload) })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message || 'Không tải được chi tiết công việc.')
      })
    return () => { cancelled = true }
  }, [taskNodeId])

  const urgent = detail?.priority === 'URGENT'
  const high = detail?.priority === 'HIGH'
  const sla = deadlineLabel(detail?.deadline_at)
  const steps = detail?.steps || []
  const assistantTotal = Number(detail?.assistant_total_amount || 0)

  return <Modal
    open
    onClose={onClose}
    size="md"
    id={`pool-detail-${taskNodeId}`}
    title={detail ? detail.service_line_name : 'Chi tiết công việc'}
  >
    <div className="pid">
      {error && <p className="pid-error" role="alert">{error}</p>}
      {!detail && !error && <p className="pid-loading">Đang tải chi tiết…</p>}

      {detail && <>
        {(urgent || high) && (
          <span className={`pid-flag is-${urgent ? 'urgent' : 'high'}`}>
            {urgent ? <Zap size={12} /> : <Star size={12} />}{urgent ? 'Hồ sơ gấp' : 'Ưu tiên'}
          </span>
        )}

        <section className="pid-facts">
          <Row label="Hợp đồng">HĐ {detail.contract_id}</Row>
          <Row label="Khách hàng">
            {detail.customer_name}{detail.customer_phone ? ` · ${detail.customer_phone}` : ''}
          </Row>
          <Row label="Thửa đất">
            {detail.parcel_address || detail.location_label}
            {detail.certificate_number && <em> · GCN {detail.certificate_number}</em>}
          </Row>
          <Row label="Cam kết SLA">
            {sla && <span className="pid-sla"><Clock size={13} /> {sla}</span>}
          </Row>
        </section>

        <div className="pid-steps-head">
          <h3>Bạn nhận {steps.length > 1 ? `cả ${steps.length} bước` : 'bước này'}</h3>
          <span>Nhận là chịu trách nhiệm tới khi bước cuối được nghiệm thu</span>
        </div>

        {steps.map(step => {
          const duration = durationLabel(step.duration_seconds)
          return <article key={step.task_node_id} className="pid-step">
            <header>
              <span className="pid-step__code">{step.node_code}</span>
              <strong>{step.name}</strong>
              <b className="pid-step__money">{step.amount > 0 ? moneyLabel(step.amount) : '—'}</b>
            </header>

            {(duration || step.has_assistant_slot) && <div className="pid-step__meta">
              {duration && <span><Clock size={12} /> Thời lượng {duration}</span>}
              {step.has_assistant_slot && step.assistant_amount > 0 && (
                <span className="is-assist"><Users size={12} /> Có suất thợ phụ {moneyLabel(step.assistant_amount)}</span>
              )}
            </div>}

            {step.checklist.length > 0 ? (
              <ul className="pid-check">
                {step.checklist.map(row => <li key={row.id} className={row.is_payable ? 'is-paid' : undefined}>
                  <span className="pid-check__name">
                    {row.name}
                    {!row.is_required && <em> · không bắt buộc</em>}
                  </span>
                  {/* Chỉ mục có gắn đơn giá mới sinh khoán — nói thẳng ra để
                      không ai tưởng nộp mục nào cũng được tính tiền. */}
                  {row.is_payable && row.amount > 0 && (
                    <span className="pid-check__money"><Coins size={11} /> {moneyLabel(row.amount)}</span>
                  )}
                </li>)}
              </ul>
            ) : (
              <p className="pid-step__empty">Bước này chưa cấu hình đầu ra bắt buộc.</p>
            )}
          </article>
        })}

        <div className="pid-total">
          <div>
            <span>Tổng khoán trọn chuỗi</span>
            {assistantTotal > 0 && <em>Người đi phụ nhận riêng {moneyLabel(assistantTotal)}</em>}
          </div>
          <strong>{moneyLabel(detail.total_amount)}</strong>
        </div>

        {blocked && blockedReason && <p className="pid-block" role="status">🔒 {blockedReason}</p>}

        <div className="pid-actions">
          <button type="button" className="ew-btn ew-btn--ghost" onClick={onClose}>Để sau</button>
          <button
            type="button"
            className="ew-btn ew-btn--primary"
            disabled={blocked || claiming}
            onClick={onClaim}
          >
            {claiming ? 'Đang nhận…' : <><Rocket size={14} /> Nhận trọn chuỗi</>}
          </button>
        </div>
      </>}
    </div>
  </Modal>
}
