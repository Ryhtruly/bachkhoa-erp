import React from 'react';

export function Dropdown({ 
  label, 
  options, 
  value, 
  onChange, 
  placeholder, 
  disabled, 
  style, 
  className,
  required
}) {
  return (
    <div className={`dropdown-wrapper flex flex-col ${className || ''}`} style={style}>
      {label && <label className="text-sm font-semibold text-gray-700 mb-1">{label}</label>}
      <select
        className="form-control"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options && options.map((opt, i) => {
          const optValue = typeof opt === 'object' ? (opt.value !== undefined ? opt.value : opt.id) : opt;
          const optLabel = typeof opt === 'object' ? (opt.label !== undefined ? opt.label : (opt.name !== undefined ? opt.name : optValue)) : opt;
          return (
            <option key={i} value={optValue}>
              {optLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
}
