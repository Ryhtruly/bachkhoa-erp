import React from 'react';
import { Link } from 'lucide-react';
import { fmt } from './utils';

export const API = '';

export const TRANSACTION_TYPES = Object.freeze({
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  ADVANCE: 'ADVANCE',
  REIMBURSEMENT: 'REIMBURSEMENT',
});

export const TRANSACTION_STATUSES = Object.freeze({
  COMPLETED: 'COMPLETED',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
});

export const PAYMENT_METHODS = Object.freeze({
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
});

export const TRANSACTION_SCOPES = Object.freeze({
  COMPANY: 'COMPANY',
  INTERNAL: 'INTERNAL',
});

export const TX_TYPE_LABELS = {
  INCOME: 'Thu',
  EXPENSE: 'Chi',
  ADVANCE: 'Tạm ứng',
  REIMBURSEMENT: 'Hoàn ứng',
  Thu: 'Thu',
  Chi: 'Chi',
  'Tạm ứng': 'Tạm ứng',
  'Hoàn ứng': 'Hoàn ứng',
};

export const STATUS_LABELS = {
  COMPLETED: 'Hoàn thành',
  PENDING: 'Chờ duyệt',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
  'Hoàn thành': 'Hoàn thành',
  'Đã duyệt': 'Hoàn thành',
  'Chờ duyệt': 'Chờ duyệt',
  'Từ chối': 'Từ chối',
  'Đã hủy': 'Đã hủy',
};

export const PAYMENT_METHOD_LABELS = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
  'Tiền mặt': 'Tiền mặt',
  'Chuyển khoản': 'Chuyển khoản',
};

export const SCOPE_LABELS = {
  COMPANY: 'Công ty',
  INTERNAL: 'Nội bộ',
  'Công ty': 'Công ty',
  'Nội bộ': 'Nội bộ',
};

export const CF_COLS = [
  { key: 'contract_id', label: '', width: 32, align: 'center', render: v => v ? <Link size={14} color="#eb4a23" title="Đã gắn hồ sơ" style={{ marginTop: 4 }} /> : null },
  { key: 'Ngày', label: 'Ngày', width: 95, render: v => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem' }}>{v}</span> },
  { 
    key: 'id', label: 'Mã phiếu', width: 215, 
    render: (v, row) => {
      const isPending = row.status === 'PENDING' || row.status === 'Chờ duyệt' || row.status === 'pending';
      const isRejected = row.status === 'REJECTED' || row.status === 'Từ chối' || row.status === 'rejected';
      const isCancelled = row.status === 'CANCELLED' || row.status === 'Đã hủy' || row.status === 'cancelled';
      return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap' }}>
          <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem', whiteSpace: 'nowrap' }}>{v}</strong>
          {isPending && (
            <span className="badge badge--warning badge--sm">
              Chờ duyệt
            </span>
          )}
          {isRejected && (
            <span className="badge badge--danger badge--sm">
              Từ chối
            </span>
          )}
          {isCancelled && (
            <span className="badge badge--neutral badge--sm">
              Đã hủy
            </span>
          )}
        </div>
      );
    } 
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
    key: 'payment_method', label: 'Hình thức', width: 120, align: 'center',
    render: (v, row) => {
      const pm = row.payment_method || row['Hình thức'] || v;
      const isCash = pm === 'CASH' || pm === 'Tiền mặt';
      return (
        <span style={{
          fontSize: '0.78rem', padding: '3px 8px', borderRadius: 4, fontWeight: 600,
          background: isCash ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)',
          color: isCash ? '#f59e0b' : '#6366f1'
        }}>
          {isCash ? 'Tiền mặt' : 'Ckhoản'}
        </span>
      );
    }
  },
  {
    key: 'amount', label: 'Số tiền', width: 145, align: 'right',
    render: (v, row) => {
      const isCounted = row.status === 'COMPLETED' || row.status === 'Hoàn thành' || row.status === 'Đã duyệt' || row.status === 'approved' || !row.status;
      const isCancelledOrRejected = row.status === 'CANCELLED' || row.status === 'REJECTED' || row.status === 'Đã hủy' || row.status === 'Từ chối' || row.status === 'cancelled' || row.status === 'rejected';
      const isIncome = row.type === 'INCOME' || row.type === 'Thu' || row.transaction_type === 'INCOME' || row.transaction_type === 'Thu';
      return (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: '0.93rem',
          color: isCancelledOrRejected ? '#94a3b8' : !isCounted ? '#d97706' : isIncome ? '#10b981' : '#ef4444',
          textDecoration: isCancelledOrRejected ? 'line-through' : 'none',
          opacity: isCancelledOrRejected ? 0.7 : 1
        }}>
          {isIncome ? '+' : '−'}{fmt(v)}
        </span>
      );
    }
  }
];
