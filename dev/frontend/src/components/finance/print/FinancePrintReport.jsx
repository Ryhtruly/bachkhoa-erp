import React from 'react';
import { COMPANY_IDENTITY } from '../../../lib/companyIdentity';

export default function FinancePrintReport({
  documentRef,
  title,
  subtitle,
  summary = [],
  columns = [],
  rows = [],
  footerRow = null,
  emptyText = 'Không có dữ liệu',
}) {
  return (
    <div ref={documentRef} className="finance-print-document">
      <header className="finance-print-header">
        <div>
          <strong style={{ fontSize: '9.5pt', textTransform: 'uppercase' }}>
            {COMPANY_IDENTITY.legalName}
          </strong>
          <div>{COMPANY_IDENTITY.address}</div>
          <div>Mã số thuế: {COMPANY_IDENTITY.taxCode} | ĐT: {COMPANY_IDENTITY.phone}</div>
        </div>
        <div className="finance-print-header__right">
          <strong>Sổ Kế Toán & Quản Trị</strong>
          <div>In lúc: <span data-print-timestamp>—</span></div>
        </div>
      </header>

      <section className="finance-print-title">
        <h1>{title}</h1>
        {subtitle && <div className="finance-print-subtitle">{subtitle}</div>}
      </section>

      {summary.length > 0 && (
        <section className="finance-print-summary">
          {summary.map(item => (
            <div key={item.label}>
              <span>{item.label}:</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </section>
      )}

      <table className="finance-print-table">
        <thead>
          <tr>
            {columns.map(column => (
              <th
                key={column.key}
                className={column.align ? `is-${column.align}` : ''}
                style={{
                  width: column.width || 'auto',
                  textAlign: column.headerAlign || column.align || 'left',
                  whiteSpace: 'nowrap'
                }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="finance-print-empty">{emptyText}</td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.id || row.contract_id || `${index}`}>
                {columns.map(column => (
                  <td
                    key={column.key}
                    className={column.align ? `is-${column.align}` : ''}
                    style={{
                      textAlign: column.align || 'left',
                      whiteSpace: column.nowrap ? 'nowrap' : 'normal'
                    }}
                  >
                    {column.render ? column.render(row[column.key], row, index) : (row[column.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
          {footerRow && rows.length > 0 && (
            <tr className="finance-print-footer-row">
              {columns.map((column, idx) => {
                const cellVal = footerRow[column.key];
                return (
                  <td
                    key={column.key || idx}
                    className={column.align ? `is-${column.align}` : ''}
                    style={{
                      textAlign: column.align || 'left',
                      fontWeight: 700
                    }}
                  >
                    {cellVal !== undefined ? cellVal : ''}
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>

      <footer className="finance-print-signatures">
        <div><strong>Người lập biểu</strong><span>(Ký, họ tên)</span></div>
        <div><strong>Kế toán trưởng</strong><span>(Ký, họ tên)</span></div>
        <div><strong>Giám đốc</strong><span>(Ký, họ tên, đóng dấu)</span></div>
      </footer>
    </div>
  );
}
