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


export default function ContractsScreen() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${API}/api/finance/contracts`).then(r => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = data.filter(c => !search ||
    (c.id || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.customer_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const cols = [
    { key: 'id', label: 'Mã HĐ', width: 130, render: v => <strong style={{ fontFamily: 'var(--font-mono)' }}>{v}</strong> },
    { key: 'customer_name', label: 'Khách hàng' },
    { key: 'phone', label: 'SĐT', width: 115 },
    { key: 'service_type', label: 'Loại dịch vụ' },
    { key: 'date_signed', label: 'Ngày ký', width: 100, render: v => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem' }}>{v}</span> },
    { key: 'total_value', label: 'Giá trị HĐ', width: 130, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(v)}</span> },
    { key: 'paid_amount', label: 'Đã thu', width: 120, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600 }}>+{fmt(v)}</span> },
    { key: 'remaining', label: 'Còn lại', width: 120, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: v > 0 ? '#f59e0b' : 'var(--text-tertiary)', fontWeight: 600 }}>{v > 0 ? fmt(v) : '✓ Đủ'}</span> },
  ];

  return (
    <div>
      <FinanceScreenHeader 
        title=" Hợp Đồng & Hóa Đơn" 
        subtitle={`Danh sách ${data.length} hợp đồng — Xây dựng & Bất động sản`} 
      />
      <input className="form-control" style={{ height: 38, maxWidth: 340, marginBottom: 14 }}
        placeholder="Tìm mã HĐ hoặc tên khách hàng..."
        value={search} onChange={e => setSearch(e.target.value)} />
      <DataTable columns={cols} data={filtered} loading={loading} rowKey="id" emptyText="Chưa có hợp đồng" pageSize={15} />
    </div>
  );
}
