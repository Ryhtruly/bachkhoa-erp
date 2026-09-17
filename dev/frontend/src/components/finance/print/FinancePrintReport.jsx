import React from 'react';
import { COMPANY_IDENTITY } from '../../../lib/companyIdentity';
import { formatPrintTimestamp } from './printDocument';
import { resolveSignerEntries, useDocumentSigners } from './documentSigners';
import './financeReport.print.css';

export default function FinancePrintReport({
  documentRef,
  title,
  subtitle,
  summary = [],
  columns = [],
  rows = [],
  footerRow = null,
  additionalSections = [],
  signers = [],
  emptyText = 'Không có dữ liệu',
}) {
  const documentSigners = useDocumentSigners();
  const defaultSigners = [
    { role: 'Người lập biểu', note: '(Ký, họ tên)' },
    { role: 'Kế toán trưởng', note: '(Ký, họ tên)' },
    { role: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' },
  ];
  const signatureEntries = resolveSignerEntries(
    signers.length > 0 ? signers : defaultSigners,
    documentSigners,
  );

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
          <div>In lúc: <span data-print-timestamp>{formatPrintTimestamp()}</span></div>
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
              <span>{item.label}:&nbsp;</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </section>
      )}

      <PrintTable columns={columns} rows={rows} footerRow={footerRow} emptyText={emptyText} />

      {additionalSections.map((section, index) => (
        <section className="finance-print-additional-section" key={section.title || index}>
          {section.title && <h2>{section.title}</h2>}
          <PrintTable
            columns={section.columns || []}
            rows={section.rows || []}
            footerRow={section.footerRow || null}
            emptyText={section.emptyText || emptyText}
          />
        </section>
      ))}

      <footer className="finance-print-signatures">
        {signatureEntries.map((signer, index) => (
          <div key={`${signer.role || 'signer'}-${index}`}>
            <strong>{signer.role || 'Người ký'}</strong>
            <span>{signer.note || (signer.role === 'Giám đốc' ? '(Ký, họ tên, đóng dấu)' : '(Ký, họ tên)')}</span>
            {signer.name && <em className="finance-print-signature-name">{signer.name}</em>}
          </div>
        ))}
      </footer>
    </div>
  );
}

function PrintTable({ columns, rows, footerRow, emptyText }) {
  return (
    <table className="finance-print-table">
      <colgroup>
        {columns.map((column, idx) => (
          <col
            key={column.key || idx}
            style={column.width ? { width: column.width } : undefined}
          />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map(column => {
            const isNowrap = Boolean(column.headerNowrap || (column.nowrap && column.headerNowrap !== false));
            return (
              <th
                key={column.key}
                className={[
                  column.align ? `is-${column.align}` : '',
                  isNowrap ? 'is-nowrap' : '',
                  column.headerClassName || '',
                ].filter(Boolean).join(' ')}
                style={{
                  width: column.width || 'auto',
                  textAlign: column.headerAlign || column.align || 'center',
                  whiteSpace: isNowrap ? 'nowrap' : 'normal',
                  wordBreak: 'keep-all',
                  overflowWrap: column.overflowWrap || 'break-word',
                  lineHeight: 1.25,
                  ...column.headerStyle,
                }}
              >
                {column.label}
              </th>
            );
          })}
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
              {columns.map(column => {
                const isNowrap = Boolean(column.nowrap);
                return (
                  <td
                    key={column.key}
                    className={[
                      column.align ? `is-${column.align}` : '',
                      isNowrap ? 'is-nowrap' : '',
                      column.className || '',
                    ].filter(Boolean).join(' ')}
                    style={{
                      width: column.width || 'auto',
                      textAlign: column.align || 'left',
                      whiteSpace: isNowrap ? 'nowrap' : 'normal',
                      ...column.cellStyle,
                    }}
                  >
                    {column.render
                      ? column.render(row[column.key], row, index)
                      : (column.format
                          ? column.format(row[column.key], row, index)
                          : (row[column.key] ?? '—'))}
                  </td>
                );
              })}
            </tr>
          ))
        )}
      </tbody>
      {footerRow && rows.length > 0 && (
        <tfoot>
          {React.isValidElement(footerRow) ? (
            footerRow
          ) : (
            <tr className="finance-print-footer-row">
              {columns.map((column, idx) => {
                const cellVal = footerRow[column.key];
                return (
                  <td
                    key={column.key || idx}
                    className={[
                      column.align ? `is-${column.align}` : '',
                      column.nowrap ? 'is-nowrap' : '',
                    ].filter(Boolean).join(' ')}
                    style={{
                      textAlign: column.align || 'left',
                      fontWeight: 700,
                      whiteSpace: column.nowrap ? 'nowrap' : 'normal',
                    }}
                  >
                    {cellVal !== undefined ? cellVal : ''}
                  </td>
                );
              })}
            </tr>
          )}
        </tfoot>
      )}
    </table>
  );
}
