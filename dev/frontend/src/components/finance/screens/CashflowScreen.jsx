import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DataTable, FilterBar } from '../../ui';
import { fmt } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { PlusCircle, MinusCircle, Printer, Wallet, Building2, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import CashflowModal from '../modals/CashflowModal';
import CashflowDetailModal from '../modals/CashflowDetailModal';
import FinancePrintReport from '../print/FinancePrintReport';
import { printElement } from '../print/printDocument';
import financeReportPrintStyles from '../print/financeReport.print.css?inline';
import { apiFetch } from '../../../lib/api';
import { getPrintableTransactions, isCountedTransaction } from './cashflowPrintUtils';

const STATUS_OPTIONS = [
  { value: 'All', label: 'Tất cả trạng thái' },
  { value: 'Hoàn thành', label: 'Hoàn thành' },
  { value: 'Chờ duyệt', label: 'Chờ duyệt' },
  { value: 'Đã quyết toán', label: 'Đã quyết toán' },
  { value: 'Từ chối', label: 'Từ chối' },
  { value: 'Đã hủy', label: 'Đã hủy' }
];

export default function CashflowScreen({ mode = 'all', month: propMonth, setMonth: propSetMonth, isDirector: propIsDirector, user: propUser, focusVoucher = null }) {
  const printDocumentRef = useRef(null);
  const { addToast } = useToast();
  const [data, setData] = useState([]);
  const [balance, setBalance] = useState({ cash_balance: 0, bank_balance: 0, balance: 0, total_income: 0, total_expenditure: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ type: 'All', payment_method: 'All', status: 'All', category: 'All' });
  const [localMonth, setLocalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const month = propMonth !== undefined ? propMonth : localMonth;
  const setMonth = propSetMonth !== undefined ? propSetMonth : setLocalMonth;
  const [sort, setSort] = useState('desc');
  const [modal, setModal] = useState(null); // null | 'Thu' | 'Chi'
  const [detailId, setDetailId] = useState(null);
  const [currentUser, setCurrentUser] = useState(propUser || null);

  useEffect(() => {
    if (propIsDirector === undefined && !propUser) {
      apiFetch('/api/auth/me').then(u => setCurrentUser(u)).catch(() => {});
    }
  }, [propIsDirector, propUser]);

  // Bấm thông báo "phiếu chờ duyệt" thì mở thẳng phiếu đó. Modal tự tải theo mã
  // phiếu nên không phụ thuộc bộ lọc tháng / hình thức thanh toán đang chọn.
  useEffect(() => {
    if (focusVoucher?.id) setDetailId(focusVoucher.id);
  }, [focusVoucher?.id, focusVoucher?.nonce]);

  const isDirector = propIsDirector !== undefined
    ? propIsDirector
    : Boolean(
        currentUser?.is_director ||
        currentUser?.username === 'admin' ||
        currentUser?.role_name === 'admin'
      );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBalance({ cash_balance: 0, bank_balance: 0, balance: 0, total_income: 0, total_expenditure: 0 });
    setData([]);
    try {
      const p = new URLSearchParams();
      if (month) p.set('month', month);

      if (mode === 'cash') {
        const json = await apiFetch(`${API}/api/finance/cashflow/cash?${p}`);
        setData(Array.isArray(json) ? json : (json.transactions || []));
        setBalance({
          balance: json.balance || 0,
          total_income: json.total_income || 0,
          total_expenditure: json.total_expenditure || 0
        });
      } else if (mode === 'bank') {
        const json = await apiFetch(`${API}/api/finance/cashflow/bank?${p}`);
        setData(Array.isArray(json) ? json : (json.transactions || []));
        setBalance({
          balance: json.balance || 0,
          total_income: json.total_income || 0,
          total_expenditure: json.total_expenditure || 0
        });
      } else {
        const json = await apiFetch(`${API}/api/finance/cashflow?${p}`);
        setData(Array.isArray(json) ? json : (json.transactions || []));
      }
    } catch {
      setError('Không thể tải dữ liệu sổ quỹ');
    } finally {
      setLoading(false);
    }
  }, [mode, month]);

  useEffect(() => { load(); }, [load]);

  const categoryOptions = useMemo(() => {
    if (!data || !Array.isArray(data)) return [{ value: 'All', label: 'Tất cả danh mục' }];
    const set = new Set();
    data.forEach(item => {
      if (item.category && item.category.trim()) {
        set.add(item.category.trim());
      }
    });
    const list = Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
    return [
      { value: 'All', label: 'Tất cả danh mục' },
      ...list.map(c => ({ value: c, label: c }))
    ];
  }, [data]);

  const sortedFiltered = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];

    return data
      .filter(item => {
        if (filters.status && filters.status !== 'All') {
          const itemSt = item.status || 'COMPLETED';
          const matchSt = itemSt === filters.status || item.status_label === filters.status;
          if (!matchSt) return false;
        }
        if (filters.category && filters.category !== 'All') {
          if (item.category !== filters.category) return false;
        }
        if (filters.type && filters.type !== 'All') {
          const matchType = item.type === filters.type || item.type_label === filters.type || item.transaction_type === filters.type;
          if (!matchType) return false;
        }
        if (filters.payment_method && filters.payment_method !== 'All') {
          const matchPm = item.payment_method === filters.payment_method || item.payment_method_label === filters.payment_method || item['Hình thức'] === filters.payment_method;
          if (!matchPm) return false;
        }

        const matchSearch = search.trim() === '' ||
          item.id?.toLowerCase().includes(search.toLowerCase()) ||
          item.payer_payee?.toLowerCase().includes(search.toLowerCase()) ||
          item.partner?.toLowerCase().includes(search.toLowerCase()) ||
          item.category?.toLowerCase().includes(search.toLowerCase()) ||
          (item.description || '')?.toLowerCase().includes(search.toLowerCase());

        return matchSearch;
      })
      .sort((a, b) => {
        const tA = a.created_at || a.date || a.transaction_date || '';
        const tB = b.created_at || b.date || b.transaction_date || '';
        if (tA && tB && tA !== tB) {
          return sort === 'desc' ? tB.localeCompare(tA) : tA.localeCompare(tB);
        }
        const dA = a.date || a.transaction_date || '';
        const dB = b.date || b.transaction_date || '';
        if (dA !== dB) {
          return sort === 'desc' ? dB.localeCompare(dA) : dA.localeCompare(dB);
        }
        const numA = parseInt((a.id || '').split('-').pop() || '0', 10);
        const numB = parseInt((b.id || '').split('-').pop() || '0', 10);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
          return sort === 'desc' ? numB - numA : numA - numB;
        }
        return sort === 'desc' ? (b.id || '').localeCompare(a.id || '') : (a.id || '').localeCompare(b.id || '');
      });
  }, [data, search, sort, filters]);

  const isIncome = t => t.type === 'INCOME' || t.type === 'Thu' || t.transaction_type === 'INCOME' || t.transaction_type === 'Thu';
  const isExpense = t => t.type === 'EXPENSE' || t.type === 'Chi' || t.type === 'ADVANCE' || t.type === 'Tạm ứng' || t.transaction_type === 'EXPENSE' || t.transaction_type === 'Chi';

  // 1. Số liệu tổng quan kỳ / quỹ (CỐ ĐỊNH theo tháng, không bị nhảy về 0đ khi lọc bảng con)

  const periodIncome = useMemo(() => data.filter(t => isIncome(t) && isCountedTransaction(t)).reduce((s, t) => s + t.amount, 0), [data]);
  const periodExpense = useMemo(() => data.filter(t => isExpense(t) && isCountedTransaction(t)).reduce((s, t) => s + t.amount, 0), [data]);
  const periodNet = periodIncome - periodExpense;

  const filteredIncome = useMemo(() => sortedFiltered.filter(t => isIncome(t) && isCountedTransaction(t)).reduce((s, t) => s + t.amount, 0), [sortedFiltered]);
  const filteredExpense = useMemo(() => sortedFiltered.filter(t => isExpense(t) && isCountedTransaction(t)).reduce((s, t) => s + t.amount, 0), [sortedFiltered]);
  const filteredNet = filteredIncome - filteredExpense;

  const printRows = useMemo(() => getPrintableTransactions(sortedFiltered), [sortedFiltered]);
  const printIncome = useMemo(() => printRows.filter(t => isIncome(t)).reduce((s, t) => s + t.amount, 0), [printRows]);
  const printExpense = useMemo(() => printRows.filter(t => isExpense(t)).reduce((s, t) => s + t.amount, 0), [printRows]);
  const printNet = printIncome - printExpense;

  const reportTitle = mode === 'all' ? 'Sổ Nhật Ký Thu Chi' : mode === 'cash' ? 'Sổ Quỹ Tiền Mặt' : 'Sổ Quỹ Ngân Hàng';
  const reportColumns = [
    { key: 'index', label: 'STT', width: '38px', align: 'center', nowrap: true, render: (_, __, index) => index + 1 },
    { key: 'Ngày', label: 'Ngày', width: '80px', align: 'center', nowrap: true },
    { key: 'id', label: 'Số chứng từ', width: '120px', align: 'center', nowrap: true, render: v => <strong>{v}</strong> },
    { key: 'type', label: 'Loại', width: '55px', align: 'center', nowrap: true, render: (_, row) => isIncome(row) ? 'Thu' : 'Chi' },
    { key: 'Hạng mục', label: 'Hạng mục thu/chi', width: '145px', align: 'left' },
    { key: 'Diễn giải', label: 'Nội dung diễn giải', align: 'left' },
    { key: 'Đối tác', label: 'Đối tác / Người giao dịch', width: '135px', align: 'left' },
    { key: 'Hình thức', label: 'Hình thức', width: '85px', align: 'center', nowrap: true, render: (_, row) => row.payment_method_label || row['Hình thức'] || (row.payment_method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản') },
    { key: 'income', label: 'Thu (VNĐ)', width: '110px', align: 'right', nowrap: true, render: (_, row) => isIncome(row) ? fmt(row.amount) : '—' },
    { key: 'expense', label: 'Chi (VNĐ)', width: '110px', align: 'right', nowrap: true, render: (_, row) => isExpense(row) ? fmt(row.amount) : '—' },
  ];

  const footerRow = {
    index: '',
    'Ngày': '',
    id: '',
    type: '',
    'Hạng mục': '',
    'Diễn giải': 'Tổng cộng',
    'Đối tác': '',
    'Hình thức': '',
    income: fmt(printIncome),
    expense: fmt(printExpense)
  };

  const handlePrintReport = () => {
    printElement({
      element: printDocumentRef.current,
      title: reportTitle,
      styles: financeReportPrintStyles,
      onError: message => addToast(message, 'error'),
    });
  };

  return (
    <div className="card card--workspace cashflow-workspace" style={{ padding: '16px 20px', borderRadius: 14 }}>
      <FinanceScreenHeader
        title={mode === 'all' ? 'Nhật ký thu chi' : mode === 'cash' ? 'Quỹ tiền mặt' : 'Tài khoản ngân hàng'}
        subtitle={mode === 'all' ? 'Quản lý dòng tiền, theo dõi các khoản thu chi thực tế' : mode === 'cash' ? 'Theo dõi số dư và biến động thu chi quỹ tiền mặt thực tế' : 'Theo dõi số dư và biến động thu chi tài khoản ngân hàng'}
        onRefresh={load}
        actions={
          <>
            <button className="btn btn-secondary no-print" onClick={handlePrintReport} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={15} /> In sổ quỹ
            </button>
            {!isDirector && (
              <>
                <button className="btn btn-primary" onClick={() => setModal('Thu')} style={{ background: '#10b981', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PlusCircle size={15} /> Lập phiếu thu
                </button>
                <button className="btn btn-primary" onClick={() => setModal('Chi')} style={{ background: '#ef4444', borderColor: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MinusCircle size={15} /> Lập phiếu chi
                </button>
              </>
            )}
          </>
        }
      />

      {error && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#991b1b' }}>
          <span>{error}</span>
          <button type="button" onClick={() => load()} className="btn btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: '0.82rem' }}>Thử lại</button>
        </div>
      )}

      <div className="cashflow-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        {mode === 'all' ? (
          <>
            <div onClick={() => setFilters(p => ({ ...p, type: p.type === 'Thu' ? 'All' : 'Thu' }))} style={{ cursor: 'pointer' }} title="Bấm để lọc phiếu Thu">
              <BalanceCard
                title={`Tổng thu (toàn hệ thống)${filters.type === 'Thu' ? ' • Đang lọc' : ''}`}
                amount={periodIncome}
                icon={<TrendingUp size={20} color="#10b981" />}
                forcePositive
                containerStyle={filters.type === 'Thu' ? { outline: '2px solid #10b981', background: 'rgba(16,185,129,0.04)' } : {}}
              />
            </div>
            <div onClick={() => setFilters(p => ({ ...p, type: p.type === 'Chi' ? 'All' : 'Chi' }))} style={{ cursor: 'pointer' }} title="Bấm để lọc phiếu Chi">
              <BalanceCard
                title={`Tổng chi (toàn hệ thống)${filters.type === 'Chi' ? ' • Đang lọc' : ''}`}
                amount={periodExpense}
                icon={<TrendingDown size={20} color="#ef4444" />}
                forceNegative
                containerStyle={filters.type === 'Chi' ? { outline: '2px solid #ef4444', background: 'rgba(239,68,68,0.04)' } : {}}
              />
            </div>
            <div onClick={() => setFilters(p => ({ ...p, type: 'All' }))} style={{ cursor: 'pointer' }} title="Bấm để xem tất cả Thu & Chi">
              <BalanceCard
                title="Dòng tiền ròng (Thu - Chi)"
                amount={periodNet}
                icon={<Scale size={20} color={periodNet >= 0 ? "#10b981" : "#ef4444"} />}
              />
            </div>
          </>
        ) : (
          <>
            <div onClick={() => setFilters(p => ({ ...p, type: 'All' }))} style={{ cursor: 'pointer' }} title="Bấm để xem tất cả">
              <BalanceCard
                title="Số dư hiện tại"
                amount={balance.balance}
                icon={mode === 'cash' ? <Wallet size={20} color="#10b981" /> : <Building2 size={20} color="#3b82f6" />}
              />
            </div>
            <div onClick={() => setFilters(p => ({ ...p, type: p.type === 'Thu' ? 'All' : 'Thu' }))} style={{ cursor: 'pointer' }} title="Bấm để lọc phiếu Thu">
              <BalanceCard
                title={`Tổng thu${filters.type === 'Thu' ? ' • Đang lọc' : ''}`}
                amount={balance.total_income}
                icon={<TrendingUp size={20} color="#10b981" />}
                forcePositive
                containerStyle={filters.type === 'Thu' ? { outline: '2px solid #10b981', background: 'rgba(16,185,129,0.04)' } : {}}
              />
            </div>
            <div onClick={() => setFilters(p => ({ ...p, type: p.type === 'Chi' ? 'All' : 'Chi' }))} style={{ cursor: 'pointer' }} title="Bấm để lọc phiếu Chi">
              <BalanceCard
                title={`Tổng chi${filters.type === 'Chi' ? ' • Đang lọc' : ''}`}
                amount={balance.total_expenditure}
                icon={<TrendingDown size={20} color="#ef4444" />}
                forceNegative
                containerStyle={filters.type === 'Chi' ? { outline: '2px solid #ef4444', background: 'rgba(239,68,68,0.04)' } : {}}
              />
            </div>
          </>
        )}
      </div>

      {/* Filter row */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={mode === 'all' ? "Tìm số phiếu, đối tác, danh mục..." : "Tìm số phiếu, đối tác..."}
        filters={[
          { key: 'type', label: 'Loại', type: 'select', width: 140, options: [{ value: 'All', label: 'Tất cả loại' }, { value: 'Thu', label: 'Thu' }, { value: 'Chi', label: 'Chi' }] },
          ...(mode === 'all' ? [{ key: 'payment_method', label: 'Hình thức', type: 'select', width: 165, options: [{ value: 'All', label: 'Tất cả hình thức' }, { value: 'Tiền mặt', label: 'Tiền mặt' }, { value: 'Chuyển khoản', label: 'Chuyển khoản' }] }] : []),
          { key: 'status', label: 'Trạng thái', type: 'select', width: 170, options: STATUS_OPTIONS },
          ...(categoryOptions.length > 2 ? [{ key: 'category', label: 'Hạng mục', type: 'select', width: 220, options: categoryOptions }] : [])
        ]}
        values={filters}
        onFilterChange={(k, v) => setFilters(p => ({ ...p, [k]: v }))}
        onReset={() => { setSearch(''); setFilters({ type: 'All', payment_method: 'All', status: 'All', category: 'All' }); setMonth(() => new Date().toISOString().slice(0, 7)); setSort('desc'); }}
        month={month}
        onMonthChange={setMonth}
        sort={sort}
        onSortChange={setSort}
      />

      {sortedFiltered.length > 0 && (
        <SummaryStrip
          countText={`${sortedFiltered.length} giao dịch`}
          items={[
            { label: 'Tổng thu lọc', value: filteredIncome, color: '#10b981', prefix: '+' },
            { label: 'Tổng chi lọc', value: filteredExpense, color: '#ef4444', prefix: '−' },
            { label: 'Chênh lệch', value: filteredNet, color: filteredNet >= 0 ? '#10b981' : '#ef4444', prefix: filteredNet >= 0 ? '+' : '−' }
          ]}
        />
      )}

      <DataTable columns={CF_COLS} data={sortedFiltered} loading={loading} rowKey="id"
        emptyText="Chưa có giao dịch nào" pageSize={10} onRowClick={row => setDetailId(row.id)} />

      <div aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        <FinancePrintReport
          documentRef={printDocumentRef}
          title={reportTitle}
          subtitle={`Kỳ báo cáo: ${month ? `Tháng ${month.split('-')[1]}/${month.split('-')[0]}` : 'Toàn bộ'} · Phân loại: ${filters.type === 'All' ? 'Tất cả' : filters.type} · Hình thức: ${filters.payment_method === 'All' ? 'Tất cả' : filters.payment_method}`}
          summary={[
            { label: 'Số giao dịch', value: printRows.length.toLocaleString('vi-VN') },
            { label: 'Tổng thu', value: fmt(printIncome) },
            { label: 'Tổng chi', value: fmt(printExpense) },
            { label: 'Chênh lệch', value: fmt(printNet) },
          ]}
          columns={reportColumns}
          rows={printRows}
          footerRow={footerRow}
          signers={[
            { role: 'Người lập biểu', name: (propUser || currentUser)?.full_name || (propUser || currentUser)?.username || '', note: '(Ký, họ tên)' },
            { role: 'Kế toán trưởng', note: '(Ký, họ tên)' },
            { role: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' },
          ]}
          emptyText="Không có giao dịch phù hợp bộ lọc"
        />
      </div>

      <CashflowModal open={!!modal} onClose={() => setModal(null)} defaultType={modal || 'Thu'} onSuccess={load} user={propUser || currentUser} />
      <CashflowDetailModal open={!!detailId} transactionId={detailId} isDirector={isDirector} user={propUser || currentUser} onClose={() => setDetailId(null)} onSuccess={load} />
    </div>
  );
}
