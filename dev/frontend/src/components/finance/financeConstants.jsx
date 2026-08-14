import React from 'react';
import { Link } from 'lucide-react';
import { fmt } from './utils';

export const API = '';

export const CF_COLS = [
  { key: 'contract_id', label: '', width: 32, align: 'center', render: v => v ? <Link size={14} color="#eb4a23" title="Đã gắn hồ sơ" style={{ marginTop: 4 }} /> : null },
  { key: 'Ngày', label: 'Ngày', width: 95, render: v => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem' }}>{v}</span> },
  { 
    key: 'id', label: 'Mã phiếu', width: 215, 
    render: (v, row) => (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
        <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem', whiteSpace: 'nowrap' }}>{v}</strong>
        {(row.status === 'Chờ duyệt' || row.status === 'pending') && (
          <span style={{
            fontSize: '0.7rem',
            padding: '2px 7px',
            borderRadius: 6,
            background: '#fef3c7',
            color: '#b45309',
            fontWeight: 700,
            border: '1px solid #fde68a',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            lineHeight: 1.2,
          }}>
            Chờ duyệt
          </span>
        )}
        {(row.status === 'Từ chối' || row.status === 'rejected') && (
          <span style={{
            fontSize: '0.7rem',
            padding: '2px 7px',
            borderRadius: 6,
            background: '#fee2e2',
            color: '#b91c1c',
            fontWeight: 700,
            border: '1px solid #fecaca',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            lineHeight: 1.2,
          }}>
            Từ chối
          </span>
        )}
        {(row.status === 'Đã hủy' || row.status === 'cancelled') && (
          <span style={{
            fontSize: '0.7rem',
            padding: '2px 7px',
            borderRadius: 6,
            background: '#f1f5f9',
            color: '#64748b',
            fontWeight: 700,
            border: '1px solid #e2e8f0',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            lineHeight: 1.2,
          }}>
            Đã hủy
          </span>
        )}
      </div>
    ) 
  },
  {
    key: 'Hạng mục', label: 'Hạng mục', width: 200,
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
        {v === 'Tiền mặt' ? 'Tiền mặt' : 'Ckhoản'}
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
