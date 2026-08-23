import React from 'react';
import Select from './Select';

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
      <Select
        label={label}
        options={placeholder ? [{ value: '', label: placeholder }, ...(options || [])] : options}
        value={value || ''}
        onChange={onChange}
        disabled={disabled}
        required={required}
        className="ui-select--field"
      />
    </div>
  );
}
