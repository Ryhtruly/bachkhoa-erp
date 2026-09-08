import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import './CustomSelect.css';

export default function CustomSelect({
  label,
  options = [],
  value,
  onChange,
  placeholder = '— Chọn —',
  disabled = false,
  className = '',
  id,
  'aria-label': ariaLabel,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const menuRef = useRef(null);

  // Normalize options to array of { value, label, title, description }
  const normalizedOptions = options.map(opt => {
    if (Array.isArray(opt)) {
      return { value: opt[0], label: opt[1] };
    }
    if (typeof opt === 'object' && opt !== null) {
      return {
        value: opt.value !== undefined ? opt.value : opt.id,
        label: opt.label !== undefined ? opt.label : (opt.name !== undefined ? opt.name : opt.value),
        title: opt.title !== undefined ? opt.title : opt.description,
        description: opt.description,
      };
    }
    return { value: opt, label: String(opt) };
  });

  const selectedOption = normalizedOptions.find(opt => String(opt.value) === String(value));

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = event => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Chặn cuộn lọt ra ngoài modal/body cha khi lướt danh sách dropdown
  useEffect(() => {
    if (!isOpen) return;
    const menu = menuRef.current;
    if (!menu) return;

    const handleWheel = event => {
      event.stopPropagation();
      const { scrollTop, scrollHeight, clientHeight } = menu;
      const isScrollable = scrollHeight > clientHeight;
      if (!isScrollable) {
        event.preventDefault();
        return;
      }
      const isUp = event.deltaY < 0;
      const isDown = event.deltaY > 0;
      if ((isUp && scrollTop <= 0) || (isDown && scrollTop + clientHeight >= scrollHeight - 1)) {
        event.preventDefault();
      }
    };

    menu.addEventListener('wheel', handleWheel, { passive: false });
    return () => menu.removeEventListener('wheel', handleWheel);
  }, [isOpen]);

  const handleSelect = optValue => {
    onChange?.(optValue);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`custom-select-container ${className} ${isOpen ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}
      id={id}
    >
      {label && <span className="custom-select-label">{label}</span>}
      <select
        aria-label={ariaLabel}
        value={value || ''}
        onChange={e => onChange?.(e.target.value)}
        disabled={disabled}
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          width: '1px',
          height: '1px',
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
        }}
        tabIndex={-1}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {normalizedOptions.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        disabled={disabled}
        aria-expanded={isOpen}
      >
        <span className={`custom-select-value ${!selectedOption ? 'is-placeholder' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        {isOpen ? <ChevronUp size={16} className="custom-select-chevron" /> : <ChevronDown size={16} className="custom-select-chevron" />}
      </button>

      {isOpen && (
        <div ref={menuRef} className="custom-select-menu" role="listbox">
          {normalizedOptions.map(opt => {
            const isSelected = String(opt.value) === String(value);
            return (
              <div
                key={opt.value}
                className={`custom-select-option ${isSelected ? 'is-selected' : ''}`}
                onClick={() => handleSelect(opt.value)}
                role="option"
                aria-selected={isSelected}
                title={opt.title || opt.description || undefined}
              >
                <span className="custom-select-option-check">{isSelected && <Check size={15} />}</span>
                <span className="custom-select-option-content">
                  <span className="custom-select-option-text">{opt.label}</span>
                  {opt.description && (
                    <span className="custom-select-option-desc">{opt.description}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
