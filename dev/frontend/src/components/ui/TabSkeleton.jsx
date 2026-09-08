import React from 'react';

export default function TabSkeleton({ label = 'Đang tải phân hệ...' }) {
  return (
    <div className="tab-skeleton" role="status" aria-label={label}>
      <div className="tab-skeleton__header">
        <div className="skeleton tab-skeleton__title" />
        <div className="skeleton tab-skeleton__btn" />
      </div>
      <div className="tab-skeleton__filters">
        <div className="skeleton tab-skeleton__filter-input" />
        <div className="skeleton tab-skeleton__filter-select" />
        <div className="skeleton tab-skeleton__filter-select" />
      </div>
      <div className="tab-skeleton__body">
        <div className="tab-skeleton__row tab-skeleton__row--head">
          <div className="skeleton" style={{ width: '15%', height: 16 }} />
          <div className="skeleton" style={{ width: '25%', height: 16 }} />
          <div className="skeleton" style={{ width: '20%', height: 16 }} />
          <div className="skeleton" style={{ width: '20%', height: 16 }} />
          <div className="skeleton" style={{ width: '10%', height: 16 }} />
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="tab-skeleton__row">
            <div className="skeleton" style={{ width: `${12 + (i % 3) * 3}%`, height: 14 }} />
            <div className="skeleton" style={{ width: `${22 + (i % 4) * 4}%`, height: 14 }} />
            <div className="skeleton" style={{ width: `${18 + (i % 2) * 4}%`, height: 14 }} />
            <div className="skeleton" style={{ width: `${16 + (i % 3) * 3}%`, height: 14 }} />
            <div className="skeleton" style={{ width: `${8 + (i % 2) * 4}%`, height: 14 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

