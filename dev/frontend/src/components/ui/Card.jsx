import React from 'react';

/**
 * Card — Glass card wrapper dùng chung
 *
 * Props:
 *   title?: string | ReactNode
 *   subtitle?: string
 *   actions?: ReactNode        — slot button phải header
 *   footer?: ReactNode         — slot footer
 *   padding?: number | string
 *   noBorder?: boolean
 *   noHover?: boolean
 *   className?: string
 *   style?: React.CSSProperties
 *   children: ReactNode
 *   id?: string
 */
export default function Card({
  title,
  subtitle,
  actions,
  footer,
  padding = '24px',
  noBorder = false,
  noHover = false,
  className = '',
  style = {},
  children,
  id,
}) {
  return (
    <div
      id={id}
      className={`card${noHover ? ' card--no-hover' : ''}${noBorder ? ' card--no-border' : ''} ${className}`}
      style={style}
    >
      {(title || actions) && (
        <div
          className="card__header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `20px ${typeof padding === 'number' ? padding + 'px' : padding} 0`,
            marginBottom: 16,
          }}
        >
          <div>
            {title && (
              typeof title === 'string'
                ? <h3 className="card__title">{title}</h3>
                : title
            )}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </div>
      )}

      <div
        className="card__body"
        style={{ padding: typeof padding === 'number' ? `${padding}px` : padding }}
      >
        {children}
      </div>

      {footer && (
        <div
          className="card__footer"
          style={{
            padding: `16px ${typeof padding === 'number' ? padding + 'px' : padding}`,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}


/**
 * SectionHeader — Header chuẩn cho mỗi trang / section
 *
 * Props:
 *   title: string
 *   subtitle?: string
 *   actions?: ReactNode
 *   breadcrumb?: string[]
 */
export function SectionHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="section-header" style={{ marginBottom: 24 }}>
      {breadcrumb && (
        <div className="section-header__breadcrumb">
          {breadcrumb.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="breadcrumb-sep">/</span>}
              <span className={i === breadcrumb.length - 1 ? 'breadcrumb-current' : 'breadcrumb-item'}>
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 className="section-header__title">{title}</h2>
          {subtitle && <p className="section-header__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="section-header__actions">{actions}</div>}
      </div>
    </div>
  );
}


/**
 * EmptyState — Trạng thái rỗng dùng chung
 *
 * Props:
 *   icon?: ReactNode
 *   title?: string
 *   description?: string
 *   action?: ReactNode
 */
export function EmptyState({ icon, title = 'Không có dữ liệu', description, action }) {
  return (
    <div className="empty-state" style={{ padding: '60px 24px', textAlign: 'center' }}>
      {icon && <div style={{ marginBottom: 16, color: 'var(--text-tertiary)' }}>{icon}</div>}
      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>{title}</h4>
      {description && <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginBottom: 20 }}>{description}</p>}
      {action}
    </div>
  );
}


/**
 * Divider — Đường kẻ phân cách
 */
export function Divider({ label, style = {} }) {
  if (!label) return <hr className="divider" style={{ margin: '24px 0', border: 'none', borderTop: '1px solid var(--border-subtle)', ...style }} />;
  return (
    <div className="divider-label" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0', ...style }}>
      <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border-subtle)' }} />
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{label}</span>
      <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border-subtle)' }} />
    </div>
  );
}
