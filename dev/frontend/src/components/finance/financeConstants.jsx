import React from 'react';
import { Link } from 'lucide-react';
import { fmt, METHOD_MAP, TYPE_MAP } from './utils';

export const API = '';

export const CF_COLS = [
  { key: 'contract_id', label: '', width: 32, align: 'center', render: v => v ? <Link size={14} color="#eb4a23" title="Đã gắn hồ sơ" style={{ marginTop: 4 }} /> : null },
  { 
    key: 'transaction_date', label: 'Ngày', width: 95, 
    render: (v, row) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem' }}>{v || row.Ngày}</span> 
  },
  { key: 'id', label: 'Mã phiếu', width: 160, render: v => <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{v}</strong> },
  {
    key: 'category_code', label: 'Hạng mục', width: 200,
    render: (v, row) => {
      const cat = v || row['Hạng mục'] || '';
      const isSensitive = cat === 'Chi thụ lý bản vẽ' || (cat && cat.startsWith('Chi thụ lý bản vẽ:'));
      return (
        <span style={{
          fontWeight: isSensitive ? 'bold' : 'normal',
          color: isSensitive ? '#dc2626' : 'inherit'
        }}>
          {cat}
        </span>
      );
    }
  },
  { key: 'description', label: 'Diễn giải', render: (v, row) => v || row['Diễn giải'] || '' },
  { key: 'payer_payee_name', label: 'Đối tác', width: 200, render: (v, row) => v || row['Đối tác'] || '' },
  {
    key: 'payment_method', label: 'Hình thức', width: 120, align: 'center',
    render: (v, row) => {
      const pmKey = v || row['Hình thức'] || 'CASH';
      const m = METHOD_MAP[pmKey] || METHOD_MAP.CASH;
      return (
        <span style={{
          fontSize: '0.78rem', padding: '3px 8px', borderRadius: 4, fontWeight: 600,
          background: m.bg,
          color: m.color
        }}>
          {m.shortLabel}
        </span>
      );
    }
  },
  {
    key: 'amount', label: 'Số tiền', width: 145, align: 'right',
    render: (v, row) => {
      const typeKey = row.transaction_type || row.type || 'INCOME';
      const t = TYPE_MAP[typeKey] || TYPE_MAP.INCOME;
      return (
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.93rem', color: t.color }}>
          {t.symbol}{fmt(v)}
        </span>
      );
    }
  }
];
