import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

import { countdown, effectiveDeadline } from './nodeWorkFormat'

const TICK_MS = 60_000

/**
 * Card hiển thị thời gian còn lại cho bước đang mở (giao diện Hình 2).
 */
export default function EiwTimingClock({ task, now: nowProp, PREFIX = 'Thời gian còn lại' }) {
  const [tick, setTick] = useState(() => Date.now())
  const frozen = Boolean(task?.paused_at)

  useEffect(() => {
    if (nowProp != null || frozen) return undefined
    const id = window.setInterval(() => setTick(Date.now()), TICK_MS)
    return () => window.clearInterval(id)
  }, [nowProp, frozen])

  const effectiveNow = nowProp ?? tick
  const deadline = effectiveDeadline(task)
  const clock = countdown(deadline, { now: effectiveNow, pausedAt: task?.paused_at })

  const badgeText = frozen
    ? 'Tạm dừng'
    : clock.tone === 'overdue'
      ? 'Chậm tiến độ'
      : clock.tone === 'urgent'
        ? 'Cần gấp'
        : clock.tone === 'none'
          ? 'Không giới hạn'
          : 'Đúng tiến độ'


  return (
    <div className="eiw-clock" id="card-remaining-time">
      <div className="eiw-clock__left">
        <div className="eiw-clock__icon">
          <Clock size={20} strokeWidth={1.8} />
        </div>
        <div className="eiw-clock__info">
          <span className="eiw-clock__label">{PREFIX}</span>
          <span className={`eiw-clock__value is-${clock.tone}`}>
            {clock.text}
            {clock.frozen && <em>đồng hồ đã dừng</em>}
          </span>
        </div>
      </div>
      <div className="eiw-clock__right">
        <span className="eiw-clock__badge" id="badge-ontime-status">{badgeText}</span>
      </div>
    </div>
  )
}

