import React, { useState, useEffect, memo } from 'react';
import { Search, Filter, X, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import DatePicker from './DatePicker';

/**
 * FilterBar — Thanh tìm kiếm + lọc dữ liệu dùng chung
 */
const FilterBar = memo(function FilterBar({
  search = '',
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm...',
  filters = [],
  values = {},
  onFilterChange,
  onReset,
  actions,
  activeCount,
  month,
  onMonthChange,
  date,
  onDateChange,
  dateLabel = 'Chọn ngày',
  sort,
  onSortChange,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localSearch, setLocalSearch] = useState(search);

  // Sync external search prop to local
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      if (onSearchChange && localSearch !== search) {
        onSearchChange(localSearch);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [localSearch, onSearchChange, search]);

  const computedActive = activeCount ??
    filters.filter((f) => values[f.key] && values[f.key] !== 'All' && values[f.key] !== '').length;

  const hasActive = localSearch.trim() !== ''
    || computedActive > 0
    || Boolean(month)
    || Boolean(date);
  return (
    <div className="filter-bar-modern">
      {/* Row 1: Search + Controls */}
      <div className="filter-bar-modern__top">
        <div className="filter-bar-modern__search-wrap">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="filter-bar-modern__search"
            aria-label="Tìm kiếm"
          />
          {localSearch && (
            <button
              className="filter-bar-modern__clear-search"
              onClick={() => setLocalSearch('')}
              aria-label="Xóa tìm kiếm"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="filter-bar-modern__controls">
          {month !== undefined && (
            <div className="filter-bar-modern__control-group">
              <span className="filter-bar-modern__control-label">Tháng:</span>
              <input
                type="month"
                className="filter-bar-modern__control-input"
                value={month || ''}
                onChange={e => onMonthChange && onMonthChange(e.target.value)}
              />
            </div>
          )}

          {date !== undefined && (
            <DatePicker
              value={date}
              onChange={onDateChange}
              placeholder={dateLabel}
            />
          )}

          {sort !== undefined && (
            <div className="filter-bar-modern__control-group">
              <span className="filter-bar-modern__control-label">Sắp xếp:</span>
              <div className="filter-bar-modern__select-wrapper">
                <select
                  className="filter-bar-modern__control-select"
                  value={sort || 'desc'}
                  onChange={e => onSortChange && onSortChange(e.target.value)}
                >
                  <option value="desc">Mới nhất</option>
                  <option value="asc">Cũ nhất</option>
                </select>
                <ChevronDown size={14} className="select-icon" />
              </div>
            </div>
          )}

          {filters.length > 0 && (
            <button
              className={`btn-filter-toggle ${showAdvanced ? 'active' : ''}`}
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
            >
              <Filter size={16} />
              <span>Bộ lọc</span>
              {computedActive > 0 && (
                <span className="filter-badge">{computedActive}</span>
              )}
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}

          {hasActive && onReset && (
            <button
              className="btn-filter-reset"
              onClick={() => {
                setLocalSearch('');
                onReset();
              }}
              title="Xóa bộ lọc"
            >
              <RotateCcw size={16} />
              <span className="reset-text">Đặt lại</span>
            </button>
          )}

          {actions && <div className="filter-bar-modern__actions">{actions}</div>}
        </div>
      </div>

      {/* Row 2: Advanced filters */}
      <div className={`filter-bar-modern__advanced-wrap ${showAdvanced ? 'expanded' : ''}`}>
        <div className="filter-bar-modern__advanced">
          {filters.map((f) => (
            <div key={f.key} className="filter-bar-modern__field" style={{ width: f.width || 200 }}>
              <label htmlFor={`filter-${f.key}`}>{f.label}</label>
              {f.type === 'select' && (
                <div className="custom-select-wrap">
                  <select
                    id={`filter-${f.key}`}
                    value={values[f.key] ?? 'All'}
                    onChange={(e) => onFilterChange?.(f.key, e.target.value)}
                    className="custom-select"
                  >
                    <option value="All">Tất cả</option>
                    {(f.options || []).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label ?? opt.value}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="select-icon" />
                </div>
              )}
              {f.type === 'date' && (
                <input
                  type="date"
                  id={`filter-${f.key}`}
                  value={values[f.key] ?? ''}
                  onChange={(e) => onFilterChange?.(f.key, e.target.value)}
                  className="custom-date-input"
                />
              )}
              {f.type === 'daterange' && (
                <div className="filter-bar-modern__daterange">
                  <input
                    type="date"
                    id={`filter-${f.key}-from`}
                    value={values[`${f.key}_from`] ?? ''}
                    onChange={(e) => onFilterChange?.(`${f.key}_from`, e.target.value)}
                    className="custom-date-input"
                    placeholder="Từ ngày"
                  />
                  <span className="daterange-sep">-</span>
                  <input
                    type="date"
                    id={`filter-${f.key}-to`}
                    value={values[`${f.key}_to`] ?? ''}
                    onChange={(e) => onFilterChange?.(`${f.key}_to`, e.target.value)}
                    className="custom-date-input"
                    placeholder="Đến ngày"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default FilterBar;
