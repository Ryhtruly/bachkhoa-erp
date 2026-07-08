import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Inbox } from 'lucide-react';

/**
 * DataTable — Bảng dữ liệu dùng chung
 *
 * Props:
 *   columns: [{ key, label, width?, sortable?, render?(value, row) => ReactNode, align?: 'left'|'center'|'right' }]
 *   data: Array<Object>
 *   loading?: boolean
 *   emptyText?: string
 *   rowKey?: string | ((row) => string)      — key duy nhất cho mỗi row (mặc định 'id')
 *   onRowClick?: (row) => void
 *   rowClassName?: string | ((row) => string)
 *   selectable?: boolean                      — bật checkbox chọn row
 *   selected?: string[]                       — mảng key đã chọn
 *   onSelectionChange?: (keys: string[]) => void
 *   pageSize?: number                         — 0 = tắt phân trang
 *   stickyHeader?: boolean
 *   compact?: boolean
 */
export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  emptyText = 'Không có dữ liệu',
  rowKey = 'id',
  onRowClick,
  rowClassName,
  selectable = false,
  selected = [],
  onSelectionChange,
  pageSize = 20,
  stickyHeader = true,
  compact = false,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'
  const [page, setPage] = useState(1);

  const getKey = (row) =>
    typeof rowKey === 'function' ? rowKey(row) : row[rowKey];

  // ── Sort ──
  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv), 'vi', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  // ── Paginate ──
  const totalPages = pageSize > 0 ? Math.ceil(sorted.length / pageSize) : 1;
  const safePage = Math.min(page, totalPages || 1);
  const paged = pageSize > 0 ? sorted.slice((safePage - 1) * pageSize, safePage * pageSize) : sorted;

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  // ── Selection ──
  const allKeys = paged.map(getKey);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.includes(k));
  const someSelected = allKeys.some((k) => selected.includes(k));

  const toggleAll = () => {
    if (allSelected) onSelectionChange(selected.filter((k) => !allKeys.includes(k)));
    else onSelectionChange([...new Set([...selected, ...allKeys])]);
  };
  const toggleRow = (key) => {
    onSelectionChange(
      selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
    );
  };

  // ── Skeleton rows ──
  const skeletonRows = Array.from({ length: pageSize > 0 ? Math.min(pageSize, 8) : 8 });

  return (
    <div className={`dt-wrapper${compact ? ' dt-wrapper--compact' : ''}`}>
      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead className={stickyHeader ? 'dt-sticky-head' : ''}>
            <tr>
              {selectable && (
                <th style={{ width: 48 }}>
                  <input
                    type="checkbox"
                    className="dt-checkbox"
                    checked={allSelected}
                    ref={(el) => el && (el.indeterminate = someSelected && !allSelected)}
                    onChange={toggleAll}
                    aria-label="Chọn tất cả"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width, minWidth: col.width, textAlign: col.align || 'left' }}
                  className={`${col.sortable ? 'dt-sortable' : ''}${col.stickyRight ? ' dt-sticky-right' : ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                  aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <span className="dt-th-inner">
                    {col.label}
                    {col.sortable && (
                      <span className="dt-sort-icons">
                        <ChevronUp
                          size={12}
                          className={sortKey === col.key && sortDir === 'asc' ? 'dt-sort-active' : ''}
                        />
                        <ChevronDown
                          size={12}
                          className={sortKey === col.key && sortDir === 'desc' ? 'dt-sort-active' : ''}
                        />
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? skeletonRows.map((_, i) => (
                  <tr key={i} className="dt-skeleton-row">
                    {selectable && <td><div className="skeleton" style={{ width: 18, height: 18 }} /></td>}
                    {columns.map((col) => (
                      <td key={col.key} className={col.stickyRight ? 'dt-sticky-right' : ''}>
                        <div className="skeleton" style={{ height: 14, width: '70%', borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              : paged.length === 0
              ? (
                <tr>
                  <td colSpan={columns.length + (selectable ? 1 : 0)} className="dt-empty">
                    <div className="empty-state">
                      <Inbox size={40} strokeWidth={1.5} style={{ marginBottom: 12, color: 'var(--text-tertiary)' }} />
                      <p>{emptyText}</p>
                    </div>
                  </td>
                </tr>
              )
              : paged.map((row) => {
                  const key = getKey(row);
                  const isSelected = selected.includes(key);
                  const customRowClass = typeof rowClassName === 'function'
                    ? rowClassName(row)
                    : rowClassName;
                  return (
                    <tr
                      key={key}
                      className={`dt-row${isSelected ? ' dt-row--selected' : ''}${onRowClick ? ' dt-row--clickable' : ''}${customRowClass ? ` ${customRowClass}` : ''}`}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {selectable && (
                        <td onClick={(e) => { e.stopPropagation(); toggleRow(key); }}>
                          <input
                            type="checkbox"
                            className="dt-checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(key)}
                            aria-label={`Chọn hàng ${key}`}
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col.key} style={{ textAlign: col.align || 'left' }} className={col.stickyRight ? 'dt-sticky-right' : ''}>
                          {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageSize > 0 && sorted.length > 0 && (
        <div className="dt-pagination">
          <span className="dt-pagination__info">
            {selectable && selected.length > 0 && (
              <span className="dt-selected-count">{selected.length} đã chọn ·&nbsp;</span>
            )}
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)}&nbsp;/&nbsp;{sorted.length} bản ghi
          </span>
          <div className="dt-pagination__controls">
            <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setPage(1)} disabled={safePage === 1} aria-label="Trang đầu"><ChevronsLeft size={15} /></button>
            <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} aria-label="Trang trước"><ChevronLeft size={15} /></button>
            <span className="dt-pagination__pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && arr[idx - 1] !== p - 1) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, i) =>
                  item === '…'
                    ? <span key={`ellipsis-${i}`} className="dt-pagination__ellipsis">…</span>
                    : <button
                        key={item}
                        className={`btn btn-sm${safePage === item ? ' btn-primary' : ' btn-ghost'}`}
                        style={{ minWidth: 34 }}
                        onClick={() => setPage(item)}
                      >{item}</button>
                )}
            </span>
            <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} aria-label="Trang sau"><ChevronRight size={15} /></button>
            <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setPage(totalPages)} disabled={safePage === totalPages} aria-label="Trang cuối"><ChevronsRight size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
