import React from 'react';

export default function DatePicker({ value, onChange, placeholder }) {
  return (
    <div className="filter-bar-modern__control-group">
      {placeholder && <span className="filter-bar-modern__control-label">{placeholder}:</span>}
      <input
        type="date"
        className="filter-bar-modern__control-input"
        value={value || ''}
        onChange={e => onChange && onChange(e.target.value)}
      />
    </div>
  );
}
