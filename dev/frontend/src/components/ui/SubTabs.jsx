import React from 'react';

/**
 * SubTabs — Thanh tab con dùng chung
 *
 * Props:
 *   tabs: [{ id, label, icon?: ReactNode, count?: number }]
 *   active: string (id của tab đang active)
 *   onChange: (id) => void
 *   variant?: 'line' | 'pill'   (mặc định 'line')
 *   size?: 'sm' | 'md'          (mặc định 'md')
 */
export default function SubTabs({ tabs = [], active, onChange, variant = 'line', size = 'md' }) {
  return (
    <div className={`subtabs subtabs--${variant} subtabs--${size}`} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`panel-${tab.id}`}
          className={`subtabs__item${active === tab.id ? ' subtabs__item--active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon && <span className="subtabs__icon">{tab.icon}</span>}
          <span className="subtabs__label">{tab.label}</span>
          {tab.count !== undefined && (
            <span className={`subtabs__badge${tab.count === 0 ? ' subtabs__badge--zero' : ''}`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
