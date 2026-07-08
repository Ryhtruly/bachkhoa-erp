import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Dropdown } from '../ui';
import { fmt, fmtShort, docSoTiengViet } from './utils';

export function FinanceScreenHeader({ title, subtitle, onRefresh, children }) {
  return (
    <div className="finance-screen-header">
      <div>
        <div className="finance-screen-title">{title}</div>
        <div className="finance-screen-sub">{subtitle}</div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {children}
        {onRefresh && (
          <button className="btn btn-ghost" onClick={onRefresh} style={{ height: 36, width: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

export function BalanceCard({ icon, label, title, amount, hint, subtitle, amountClass, containerStyle, forcePositive, forceNegative }) {
  const displayLabel = label || title;
  const displayHint = hint || subtitle;
  
  let isPositive = amount >= 0;
  if (forcePositive) isPositive = true;
  if (forceNegative) isPositive = false;
  
  const displaySign = isPositive ? '+' : '−';
  const displayClass = amountClass || (isPositive ? 'positive' : 'negative');

  return (
    <div className="balance-card" style={containerStyle || {}}>
      {icon && (
        <div className="balance-card__icon" style={{ background: !isPositive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)' }}>
          {icon}
        </div>
      )}
      <div>
        <div className="balance-card__label">{displayLabel}</div>
        <div className={`balance-card__amount ${displayClass}`}>
          {displaySign}{fmtShort(Math.abs(amount))}
        </div>
        {displayHint && <div className="balance-card__sub">{displayHint}</div>}
      </div>
    </div>
  );
}

export function SummaryStrip({ countText, items = [] }) {
  // items: [{ label: 'Tổng thu', value: 1000, color: '#10b981', prefix: '+' }, ...]
  return (
    <div className="summary-strip">
      <span style={{ color: 'var(--text-tertiary)' }}>{countText}</span>
      {items.map((item, idx) => (
        <span key={idx} style={{ color: item.color, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
          {item.label && `${item.label}: `}
          {item.prefix}{fmt(Math.abs(item.value))}
        </span>
      ))}
    </div>
  );
}

export function ExcelGridTable({
  title, subtitle, accentColor,
  formId, date, onDateChange,
  note, onNoteChange,
  category, onCategoryChange, categoryOptions,
  personLabel, personName, onPersonNameChange, personReadOnly,
  method, onMethodChange, methodOptions, methodReadOnly,
  department, onDepartmentChange, departmentOptions,
  amountDisplay, onAmountChange, amountReadOnly,
  status, onStatusChange, statusReadOnly,
  contractId, onContractIdChange,
  projectId, onProjectIdChange,
  isReadOnly,
  creator, onCreatorChange,
  accountant, onAccountantChange,
  approver, onApproverChange,
  receiver, receiverLabel,
  dateType = "text"
}) {
  const showSignature = creator !== undefined;
  return (
    <table className="excel-grid-table">
      <tbody>
        <tr>
          <td colSpan={2} style={{ width: '40%', textAlign: 'center', padding: '15px 10px', verticalAlign: 'middle', fontWeight: 'bold' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <img src="/src/assets/logo.png" alt="LOGO" style={{ height: 42, objectFit: 'contain' }} />
              <span style={{ fontSize: '0.75rem', letterSpacing: 0.5, opacity: 0.8 }}>BÁCH KHOA ERP</span>
            </div>
          </td>
          <td colSpan={2} style={{ width: '60%', textAlign: 'center', padding: '15px 10px' }}>
            <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: 1, color: accentColor || '#10b981' }}>
              {title}
            </h2>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, fontSize: '0.82rem', color: '#444' }}>
              {subtitle ? (
                <span>{subtitle}</span>
              ) : (
                <>
                  <span>Ngày in: {new Date().toLocaleDateString('vi-VN')}</span>
                  {dateType !== 'text' && <span>Giờ: {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>}
                </>
              )}
            </div>
          </td>
        </tr>

        <tr>
          <td style={{ fontWeight: 'bold', width: '15%' }}>Số CT</td>
          <td style={{ width: '35%' }}>
            <input type="text" readOnly value={formId || ''} placeholder={!formId ? "Hệ thống tự tạo..." : ""} style={{ fontWeight: 'bold', fontFamily: 'monospace' }} />
          </td>
          <td style={{ fontWeight: 'bold', width: '15%' }}>Ngày</td>
          <td style={{ width: '35%' }}>
            <input type={dateType} disabled={isReadOnly} value={date} onChange={e => onDateChange?.(e.target.value)} style={{ fontFamily: 'monospace' }} required />
          </td>
        </tr>

        <tr>
          <td style={{ fontWeight: 'bold' }}>Diễn giải</td>
          <td>
            <input type="text" disabled={isReadOnly} value={note} onChange={e => onNoteChange?.(e.target.value)} placeholder="Nhập diễn giải chi tiết..." required />
          </td>
          <td style={{ fontWeight: 'bold' }}>Hạng mục</td>
          <td>
            {categoryOptions && !isReadOnly ? (
              <select value={category} onChange={e => onCategoryChange?.(e.target.value)} required>
                {categoryOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            ) : (
              <input type="text" disabled={isReadOnly || (categoryOptions === undefined && onCategoryChange === undefined)} value={category} onChange={e => onCategoryChange?.(e.target.value)} required />
            )}
          </td>
        </tr>

        <tr>
          <td style={{ fontWeight: 'bold' }}>{personLabel || 'Người nhận / nộp'}</td>
          <td>
            <input type="text" disabled={isReadOnly || personReadOnly} value={personName} onChange={e => onPersonNameChange?.(e.target.value)} placeholder={`Họ tên ${personLabel ? personLabel.toLowerCase() : 'người nhận/nộp'}...`} required />
          </td>
          <td style={{ fontWeight: 'bold' }}>Hình thức</td>
          <td>
            {methodReadOnly || isReadOnly ? (
              <input type="text" disabled={isReadOnly} readOnly value={method} />
            ) : methodOptions ? (
              <select disabled={isReadOnly} value={method} onChange={e => onMethodChange?.(e.target.value)}>
                {methodOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            ) : (
              <select disabled={isReadOnly} value={method} onChange={e => onMethodChange?.(e.target.value)}>
                <option value="Chuyển khoản">🏦 Chuyển khoản</option>
                <option value="Tiền mặt">💵 Tiền mặt</option>
              </select>
            )}
          </td>
        </tr>

        <tr>
          <td style={{ fontWeight: 'bold' }}>Phòng ban</td>
          <td>
            {departmentOptions && !isReadOnly ? (
              <Dropdown
                options={departmentOptions}
                value={department}
                onChange={onDepartmentChange}
                placeholder="— Chọn phòng ban —"
              />
            ) : (
              <input
                type="text"
                disabled={isReadOnly}
                value={department}
                onChange={e => onDepartmentChange?.(e.target.value)}
                placeholder="Kế toán, Kỹ thuật, Công trường..."
              />
            )}
          </td>
          <td style={{ fontWeight: 'bold' }}>Số tiền</td>
          <td>
            <input
              type="text"
              disabled={isReadOnly || amountReadOnly}
              value={amountDisplay}
              onChange={e => onAmountChange?.(e.target.value)}
              placeholder="0"
              style={{ fontWeight: 'bold', textAlign: 'right', color: accentColor || '#10b981', fontSize: '1.1rem' }}
              required
            />
          </td>
        </tr>

        <tr>
          <td style={{ fontWeight: 'bold' }}>Trạng thái</td>
          <td>
            <input type="text" disabled={isReadOnly || statusReadOnly} value={status} onChange={e => onStatusChange?.(e.target.value)} placeholder="Hoàn thành, Chờ duyệt..." />
          </td>
          <td style={{ fontWeight: 'bold' }}>{(contractId !== undefined || projectId !== undefined) ? (projectId !== undefined ? 'Mã dự án / HĐ' : 'Liên kết') : 'Liên kết'}</td>
          <td style={{ padding: '6px 10px' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {projectId !== undefined && (
                <input type="text" disabled={isReadOnly && onProjectIdChange === undefined} placeholder="Dự án..." value={projectId || ''} onChange={e => onProjectIdChange?.(e.target.value)} style={{ fontSize: '0.82rem', width: contractId !== undefined ? '50%' : '100%', padding: '4px' }} />
              )}
              {contractId !== undefined && (
                <input type="text" disabled={isReadOnly && onContractIdChange === undefined && !onProjectIdChange} placeholder="HĐ..." value={contractId || ''} onChange={e => onContractIdChange?.(e.target.value)} style={{ fontSize: '0.82rem', width: projectId !== undefined ? '50%' : '100%', padding: '4px' }} />
              )}
            </div>
          </td>
        </tr>

        <tr>
          <td colSpan={4} style={{ padding: '12px 10px', fontSize: '0.98rem', borderBottom: showSignature ? '2px solid #000' : 'none' }}>
            <span style={{ fontWeight: 'bold' }}>Số tiền (bằng chữ): </span>
            <span style={{ fontStyle: 'italic', textDecoration: 'underline', color: 'var(--text-secondary)' }}>
              {amountDisplay ? docSoTiengViet(amountDisplay.toString().replace(/[^\d]/g, '')) : 'Không đồng'}
            </span>
          </td>
        </tr>

        {showSignature && (
          <tr>
            <td style={{ height: 130, padding: '10px 5px' }}>
              <div className="signature-title">Người lập</div>
              <div className="signature-sub">(Ký, ghi rõ họ tên)</div>
              <div className="signature-input">
                <input type="text" value={creator} onChange={e => onCreatorChange?.(e.target.value)} style={{ fontSize: '0.85rem' }} />
              </div>
            </td>
            <td style={{ height: 130, padding: '10px 5px' }}>
              <div className="signature-title">Kế toán</div>
              <div className="signature-sub">(Ký, ghi rõ họ tên)</div>
              <div className="signature-input">
                <input type="text" value={accountant} onChange={e => onAccountantChange?.(e.target.value)} style={{ fontSize: '0.85rem' }} />
              </div>
            </td>
            <td style={{ height: 130, padding: '10px 5px' }}>
              <div className="signature-title">Người duyệt</div>
              <div className="signature-sub">(Ký, ghi rõ họ tên)</div>
              <div className="signature-input">
                <input type="text" value={approver} onChange={e => onApproverChange?.(e.target.value)} style={{ fontSize: '0.85rem' }} />
              </div>
            </td>
            <td style={{ height: 130, padding: '10px 5px' }}>
              <div className="signature-title">{receiverLabel || 'Người nhận / nộp'}</div>
              <div className="signature-sub">(Ký, ghi rõ họ tên)</div>
              <div className="signature-input">
                <input type="text" readOnly value={receiver || personName} style={{ fontSize: '0.85rem', color: '#555' }} />
              </div>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
