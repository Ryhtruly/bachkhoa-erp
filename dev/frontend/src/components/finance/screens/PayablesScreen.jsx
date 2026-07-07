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


export default function PayablesScreen() {
  const [data, setData] = useState({ total_payable: 0, transactions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/finance/payables`).then(r => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <FinanceScreenHeader 
        title="Công Nợ Phải Trả" 
        subtitle="Chi chuyển khoản không gắn hợp đồng — Nhà cung cấp / Nhà thầu phụ" 
      >
        <BalanceCard 
          label="Tổng phải trả" 
          amount={data.total_payable} 
          amountClass="negative" 
          containerStyle={{ padding: '12px 20px', minWidth: 200, margin: 0, boxShadow: 'none', border: '1px solid var(--border-default)' }} 
        />
      </FinanceScreenHeader>
      <DataTable columns={CF_COLS} data={data.transactions} loading={loading} rowKey="id"
        emptyText="Không có công nợ phải trả" pageSize={15} />
    </div>
  );
}
