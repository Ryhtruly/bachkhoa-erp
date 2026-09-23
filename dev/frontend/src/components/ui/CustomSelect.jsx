import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Check, Search, X } from 'lucide-react';
import './CustomSelect.css';

function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export default function CustomSelect({
  label,
  options = [],
  value,
  onChange,
  placeholder = '— Chọn —',
  disabled = false,
  className = '',
  id,
  searchable,
  searchPlaceholder = 'Tìm kiếm...',
  'aria-label': ariaLabel,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const searchInputRef = useRef(null);

  // Normalize options to array of { value, label, title, description }
  const normalizedOptions = useMemo(() => {
    return options.map(opt => {
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
  }, [options]);

  const isSearchable = searchable ?? normalizedOptions.length >= 8;

  const filteredOptions = useMemo(() => {
    if (!isSearchable || !searchTerm.trim()) return normalizedOptions;
    const cleanSearch = removeVietnameseTones(searchTerm.trim());
    return normalizedOptions.filter(opt => {
      const cleanLabel = removeVietnameseTones(String(opt.label || ''));
      const cleanValue = removeVietnameseTones(String(opt.value || ''));
      const cleanDesc = removeVietnameseTones(String(opt.description || ''));
      return cleanLabel.includes(cleanSearch) || cleanValue.includes(cleanSearch) || cleanDesc.includes(cleanSearch);
    });
  }, [isSearchable, normalizedOptions, searchTerm]);

  const selectedOption = normalizedOptions.find(opt => String(opt.value) === String(value));

  // Focus search input on open & clear search on close
  useEffect(() => {
    if (isOpen) {
      if (isSearchable) {
        window.setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    } else {
      setSearchTerm('');
    }
  }, [isOpen, isSearchable]);

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

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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
        value={value ?? ''}
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
          {isSearchable && (
            <div className="custom-select-search" onClick={e => e.stopPropagation()}>
              <Search size={14} className="custom-select-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="custom-select-search-input"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.stopPropagation()}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="custom-select-search-clear"
                  onClick={() => setSearchTerm('')}
                  aria-label="Xoá tìm kiếm"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
          <div className="custom-select-options-list">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => {
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
              })
            ) : (
              <div className="custom-select-empty">Không tìm thấy kết quả</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
