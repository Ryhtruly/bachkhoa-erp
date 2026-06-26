import React from 'react';
import { Search, Filter, X, RotateCcw } from 'lucide-react';

/**
 * FilterBar — Thanh tìm kiếm + lọc dữ liệu dùng chung
 *
 * Props:
 *   search?: string                — giá trị search hiện tại
 *   onSearchChange?: (v) => void
 *   searchPlaceholder?: string
 *   filters?: FilterConfig[]       — danh sách bộ lọc
 *   values?: Record<key, value>    — giá trị hiện tại của từng filter
 *   onFilterChange?: (key, value) => void
 *   onReset?: () => void           — reset về mặc định
 *   actions?: ReactNode            — slot button bên phải (VD: nút Thêm mới)
 *   activeCount?: number           — số filter đang active (tự tính nếu không truyền)
 *
 * FilterConfig: {
 *   key: string,
 *   label: string,
 *   type: 'select' | 'date' | 'daterange',
 *   options?: [{ value, label }]    — dùng khi type = 'select'
 *   width?: number
 * }
 */
export default function FilterBar({
  search = '',
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm...',
  filters = [],
  values = {},
  onFilterChange,
  onReset,
  actions,
  activeCount,
}) {
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  // Đếm số filter đang active (khác mặc định)
  const computedActive = activeCount ??
    filters.filter((f) => values[f.key] && values[f.key] !== 'All' && values[f.key] !== '').length;

  const hasActive = search.trim() !== '' || computedActive > 0;

  return (
    <div className="filter-bar">
      {/* Row 1: Search + Toggle + Actions */}
      <div className="filter-bar__top">
        <div className="filter-bar__search-wrap input-wrap" style={{ flex: 1, maxWidth: 420 }}>
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder}
            className="filter-bar__search"
            aria-label="Tìm kiếm"
            id="filter-search-input"
          />
          {search && (
            <button
              className="filter-bar__clear-search"
              onClick={() => onSearchChange?.('')}
              aria-label="Xóa tìm kiếm"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filter-bar__controls">
          {filters.length > 0 && (
            <button
              className={`btn btn-secondary btn-sm filter-bar__toggle${showAdvanced ? ' filter-bar__toggle--active' : ''}`}
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              id="filter-toggle-btn"
            >
              <Filter size={15} />
              Bộ lọc
              {computedActive > 0 && (
                <span className="filter-badge">{computedActive}</span>
              )}
            </button>
          )}

          {hasActive && onReset && (
            <button
              className="btn btn-ghost btn-sm filter-bar__reset"
              onClick={onReset}
              title="Xóa bộ lọc"
              aria-label="Reset bộ lọc"
            >
              <RotateCcw size={14} />
              Đặt lại
            </button>
          )}

          {actions && <div className="filter-bar__actions">{actions}</div>}
        </div>
      </div>

      {/* Row 2: Advanced filters */}
      {showAdvanced && filters.length > 0 && (
        <div className="filter-bar__advanced" id="filter-advanced-panel">
          {filters.map((f) => (
            <div key={f.key} className="filter-bar__field" style={{ width: f.width || 180 }}>
              <label htmlFor={`filter-${f.key}`}>{f.label}</label>
              {f.type === 'select' && (
                <select
                  id={`filter-${f.key}`}
                  value={values[f.key] ?? 'All'}
                  onChange={(e) => onFilterChange?.(f.key, e.target.value)}
                >
                  <option value="All">Tất cả</option>
                  {(f.options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label ?? opt.value}</option>
                  ))}
                </select>
              )}
              {f.type === 'date' && (
                <input
                  type="date"
                  id={`filter-${f.key}`}
                  value={values[f.key] ?? ''}
                  onChange={(e) => onFilterChange?.(f.key, e.target.value)}
                  className="input"
                />
              )}
              {f.type === 'daterange' && (
                <div className="filter-bar__daterange">
                  <input
                    type="date"
                    id={`filter-${f.key}-from`}
                    value={values[`${f.key}_from`] ?? ''}
                    onChange={(e) => onFilterChange?.(`${f.key}_from`, e.target.value)}
                    className="input"
                    placeholder="Từ ngày"
                  />
                  <span className="filter-bar__daterange-sep">→</span>
                  <input
                    type="date"
                    id={`filter-${f.key}-to`}
                    value={values[`${f.key}_to`] ?? ''}
                    onChange={(e) => onFilterChange?.(`${f.key}_to`, e.target.value)}
                    className="input"
                    placeholder="Đến ngày"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
