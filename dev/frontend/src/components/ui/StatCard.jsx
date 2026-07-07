import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * StatCard — Card thống kê dùng chung
 *
 * Props:
 *   label: string
 *   value: string | number
 *   icon?: ReactNode
 *   iconVariant?: 'orange' | 'green' | 'red' | 'amber' | 'blue' | 'purple'
 *   trend?: number        — % thay đổi so với kỳ trước (dương = tăng, âm = giảm)
 *   trendLabel?: string   — VD: "so tháng trước"
 *   format?: 'number' | 'currency' | 'percent' | 'none'
 *   size?: 'sm' | 'md' | 'lg'
 *   loading?: boolean
 *   onClick?: () => void
 */
export default function StatCard({
  label,
  value,
  icon,
  iconVariant = 'orange',
  trend,
  trendLabel = 'so kỳ trước',
  format = 'none',
  size = 'md',
  loading = false,
  onClick,
}) {
  const formatValue = (v) => {
    if (loading) return '···';
    if (v === null || v === undefined) return '—';
    switch (format) {
      case 'currency':
        return Number(v).toLocaleString('vi-VN') + ' ₫';
      case 'percent':
        return Number(v).toFixed(1) + '%';
      case 'number':
        return Number(v).toLocaleString('vi-VN');
      default:
        return v;
    }
  };

  const trendUp = trend > 0;
  const trendNeutral = trend === 0 || trend === undefined || trend === null;

  return (
    <div
      className={`stat-card card stat-card--${size}${onClick ? ' stat-card--clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {icon && (
        <div className={`stat-icon ${iconVariant}`}>
          {loading ? <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 4 }} /> : icon}
        </div>
      )}
      <div className="stat-info">
        <p className="stat-label">{label}</p>
        {loading ? (
          <div className="skeleton" style={{ width: 90, height: 28, borderRadius: 6, marginTop: 6 }} />
        ) : (
          <h3 className="stat-value">{formatValue(value)}</h3>
        )}
        {!loading && trend !== undefined && trend !== null && (
          <div className={`stat-trend ${trendNeutral ? 'neutral' : trendUp ? 'up' : 'down'}`}>
            {trendNeutral ? <Minus size={12} /> : trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{trendNeutral ? 'Không đổi' : `${trendUp ? '+' : ''}${trend.toFixed(1)}%`}</span>
            <span className="stat-trend__label">{trendLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}


/**
 * StatsGrid — Wrapper grid cho StatCard
 *
 * Props:
 *   cols?: number | 'auto'   — số cột (mặc định auto-fit)
 *   children: ReactNode
 */
export function StatsGrid({ children, cols = 'auto' }) {
  const gridStyle = cols === 'auto'
    ? { gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }
    : { gridTemplateColumns: `repeat(${cols}, 1fr)` };

  return (
    <div className="stats-grid" style={{ ...gridStyle, marginBottom: 28 }}>
      {children}
    </div>
  );
}
