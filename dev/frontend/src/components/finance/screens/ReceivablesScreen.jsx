import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DataTable, Badge, Modal, FormRow, FormGrid, FilterBar, SubTabs, Dropdown } from '../../ui';
import { fmt, fmtShort, fmtAmt, parseAmt, docSoTiengViet, CATEGORY_AUTO_MAPPING } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip, ExcelGridTable } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { PlusCircle, RefreshCw, AlertCircle, Link } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import CashflowModal from '../modals/CashflowModal';
import CashflowDetailModal from '../modals/CashflowDetailModal';


export default function ReceivablesScreen() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/finance/receivables`).then(r => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const overdueCount = data.filter(r => r.overdue).length;
  const totalRemaining = data.reduce((s, r) => s + r.remaining_amount, 0);

  const cols = [
    { key: 'contract_id', label: 'Mã HĐ', width: 130, render: v => <strong style={{ fontFamily: 'var(--font-mono)' }}>{v}</strong> },
    { key: 'paid_amount', label: 'Đã thu', width: 130, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600 }}>+{fmt(v)}</span> },
    { key: 'remaining_amount', label: 'Còn nợ', width: 130, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: v > 0 ? '#ef4444' : 'var(--text-tertiary)', fontWeight: 700 }}>{v > 0 ? fmt(v) : '✓ Xong'}</span> },
    { key: 'due_date', label: 'Hạn thu', width: 110, render: v => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem' }}>{v || '—'}</span> },
    { key: 'overdue', label: 'Trạng thái', width: 120, align: 'center', render: (v, row) => v ? <span className="overdue-badge">⚠️ Quá hạn</span> : row.remaining_amount <= 0 ? <Badge variant="success">Đã thu đủ</Badge> : <Badge variant="info">Chờ thu</Badge> },
  ];

  return (
    <div>
      <FinanceScreenHeader 
        title="📊 Công Nợ Phải Thu" 
        subtitle={
          <>
            {overdueCount > 0 && <span style={{ color: '#f59e0b', fontWeight: 600 }}>⚠️ {overdueCount} khoản quá hạn — </span>}
            Tổng còn nợ: <strong style={{ color: '#ef4444' }}>{fmt(totalRemaining)}</strong>
          </>
        } 
      />
      <DataTable columns={cols} data={data} loading={loading} rowKey="id"
        emptyText="Chưa có công nợ phải thu" pageSize={15}
        rowClassName={row => row.overdue ? 'row-overdue' : ''}
      />
    </div>
  );
}
