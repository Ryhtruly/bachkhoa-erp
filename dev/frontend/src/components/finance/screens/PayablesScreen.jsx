import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DataTable, FilterBar } from '../../ui';
import { fmt } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import CashflowDetailModal from '../modals/CashflowDetailModal';
import { apiFetch } from '../../../lib/api';

export default function PayablesScreen({ user, isDirector }) {
  const [data, setData] = useState({ total_payable: 0, transactions: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('All');
  const [month, setMonth] = useState('');
  const [sort, setSort] = useState('desc');
  const [detailId, setDetailId] = useState(null);
  const { addToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API}/api/finance/payables`);
      setData(res || { total_payable: 0, transactions: [] });
    } catch (err) {
      console.error(err);
      addToast('Không thể tải dữ liệu công nợ phải trả', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredTransactions = useMemo(() => {
    if (!data.transactions || !Array.isArray(data.transactions)) return [];
    return data.transactions
      .filter(t => {
        const q = search.trim().toLowerCase();
        const matchSearch = !q ||
          (t.id || '').toLowerCase().includes(q) ||
          (t.partner || t.payer_payee || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          (t.category || '').toLowerCase().includes(q);

        if (!matchSearch) return false;

        if (methodFilter !== 'All' && t.payment_method !== methodFilter) return false;

        if (month) {
          const tDate = t.date || t.created_at || '';
          if (!tDate.startsWith(month)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dA = a.date || a.created_at || '';
        const dB = b.date || b.created_at || '';
        if (dA !== dB) {
          return sort === 'desc' ? dB.localeCompare(dA) : dA.localeCompare(dB);
        }
        return sort === 'desc' ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
      });
  }, [data.transactions, search, methodFilter, month, sort]);

  const totalFilteredAmount = useMemo(() => {
    return filteredTransactions.reduce((s, t) => s + (t.amount || 0), 0);
  }, [filteredTransactions]);

  return (
    <div>
      <FinanceScreenHeader 
        title="Công Nợ Phải Trả" 
        subtitle="Chi chuyển khoản không gắn hợp đồng — Nhà cung cấp / Nhà thầu phụ" 
        onRefresh={load}
      >
        <BalanceCard 
          label="Tổng phải trả" 
          amount={data.total_payable} 
          amountClass="negative" 
          containerStyle={{ padding: '12px 20px', minWidth: 200, margin: 0, boxShadow: 'none', border: '1px solid var(--border-default)' }} 
        />
      </FinanceScreenHeader>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm số phiếu, đối tác, diễn giải..."
        filters={[
          {
            key: 'payment_method',
            label: 'Hình thức',
            type: 'select',
            width: 175,
            options: [
              { value: 'All', label: 'Tất cả hình thức' },
              { value: 'Chuyển khoản', label: 'Chuyển khoản' },
              { value: 'Tiền mặt', label: 'Tiền mặt' }
            ]
          }
        ]}
        values={{ payment_method: methodFilter }}
        onFilterChange={(_, v) => setMethodFilter(v)}
        onReset={() => { setSearch(''); setMethodFilter('All'); setMonth(''); setSort('desc'); }}
        month={month}
        onMonthChange={setMonth}
        sort={sort}
        onSortChange={setSort}
      />

      {filteredTransactions.length > 0 && (
        <SummaryStrip 
          countText={`${filteredTransactions.length} khoản phải trả`}
          items={[
            { label: 'Tổng số tiền', value: totalFilteredAmount, color: '#ef4444', prefix: '−' }
          ]}
        />
      )}

      <DataTable 
        columns={CF_COLS} 
        data={filteredTransactions} 
        loading={loading} 
        rowKey="id"
        emptyText="Không có công nợ phải trả" 
        pageSize={15}
        onRowClick={row => setDetailId(row.id)}
      />

      <CashflowDetailModal 
        open={!!detailId} 
        transactionId={detailId} 
        isDirector={isDirector} 
        user={user} 
        onClose={() => setDetailId(null)} 
        onSuccess={load} 
      />
    </div>
  );
}
