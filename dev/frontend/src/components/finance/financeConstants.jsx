import React from 'react';
import { Link } from 'lucide-react';
import { fmt } from './utils';

export const API = 'http://127.0.0.1:8080';

export const CF_COLS = [
  { key: 'contract_id', label: '', width: 32, align: 'center', render: v => v ? <Link size={14} color="#eb4a23" title="Đã gắn hồ sơ" style={{ marginTop: 4 }} /> : null },
  { key: 'Ngày', label: 'Ngày', width: 95, render: v => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem' }}>{v}</span> },
  { key: 'id', label: 'Mã phiếu', width: 160, render: v => <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{v}</strong> },
  {
    key: 'Hạng mục', label: 'Hạng mục', width: 300,
    render: (v) => {
      const isSensitive = v === 'Chi thụ lý bản vẽ' || (v && v.startsWith('Chi thụ lý bản vẽ:'));
      return (
        <span style={{
          fontWeight: isSensitive ? 'bold' : 'normal',
          color: isSensitive ? '#dc2626' : 'inherit'
        }}>
          {v}
        </span>
      );
    }
  },
  { key: 'Diễn giải', label: 'Diễn giải' },
  { key: 'Đối tác', label: 'Đối tác', width: 200 },
  {
    key: 'Hình thức', label: 'Hình thức', width: 120, align: 'center',
    render: v => (
      <span style={{
        fontSize: '0.78rem', padding: '3px 8px', borderRadius: 4, fontWeight: 600,
        background: v === 'Tiền mặt' ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)',
        color: v === 'Tiền mặt' ? '#f59e0b' : '#6366f1'
      }}>
        {v === 'Tiền mặt' ? 'Tiền mặt' : 'Chuyển khoản'}
      </span>
    )
  },
  {
    key: 'amount', label: 'Số tiền', width: 145, align: 'right',
    render: (v, row) => (
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.93rem', color: row.type === 'Thu' ? '#10b981' : '#ef4444' }}>
        {row.type === 'Thu' ? '+' : '−'}{fmt(v)}
      </span>
    )
  }
];
