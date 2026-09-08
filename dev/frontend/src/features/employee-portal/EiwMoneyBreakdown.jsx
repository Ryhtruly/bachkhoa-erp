import { formatMoney } from './nodeWorkFormat'

/**
 * Bảng tiền của bước: khoán nhiệm vụ, thưởng, tổng (chuẩn giao diện Hình 2).
 */
export default function EiwMoneyBreakdown({ base = 0, bonus = 0, settled = false, currency = 'VNĐ' }) {
  const baseValue = Number(base) || 0
  const bonusValue = Number(bonus) || 0
  const bonusRate = (baseValue > 0 && bonusValue > 0) ? Math.round((bonusValue / baseValue) * 100) : null

  return (
    <dl className="eiw-money" id="card-cost-breakdown">
      <div className="eiw-money__head">
        <div className="eiw-money__title">
          <span className="eiw-money__currency-icon">đ</span>
          <h3>Chi phí & khoán nhiệm vụ</h3>
        </div>
        <span className="eiw-money__unit">Đơn vị: {currency}</span>
      </div>

      <div className="eiw-money__row">
        <dt>Khoán nhiệm vụ</dt>
        <dd>{formatMoney(baseValue)}</dd>
      </div>

      <div className="eiw-money__row">
        <dt>
          Thưởng{settled ? '' : ' dự kiến'}
          {bonusRate != null && (
            <span className="eiw-money__bonus-pill">+{bonusRate}%</span>
          )}
        </dt>
        <dd>{formatMoney(bonusValue)}</dd>
      </div>

      <div className="eiw-money__divider" />

      <div className="eiw-money__row is-total">
        <dt>
          <b>Tổng</b>
          <small>Sau khi hoàn thành và nghiệm thu</small>
        </dt>
        <dd>{formatMoney(baseValue + bonusValue)}</dd>
      </div>
    </dl>
  )
}

