import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DataTable, Badge, Modal, FormRow, FormGrid, FilterBar, SubTabs, Dropdown } from '../../ui';
import { fmt, fmtShort, fmtAmt, parseAmt, spellVietnameseCurrency, CATEGORY_AUTO_MAPPING } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip, ExcelGridTable } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { RefreshCw, DollarSign, Link, PlusCircle, MinusCircle, AlertCircle, Printer, Wallet, Building2, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import CashflowModal from '../modals/CashflowModal';
import CashflowDetailModal from '../modals/CashflowDetailModal';
import FinancePrintReport from '../print/FinancePrintReport';
import { printElement } from '../print/printDocument';
import financeReportPrintStyles from '../print/financeReport.print.css?inline';
import { apiFetch } from '../../../lib/api';

export default function CashflowScreen({ mode = 'all', month: propMonth, setMonth: propSetMonth, isDirector: propIsDirector, user: propUser, focusVoucher = null }) {
  const printDocumentRef = useRef(null);
  const { addToast } = useToast();
  const [data, setData] = useState([]);
  const [balance, setBalance] = useState({ cash_balance: 0, bank_balance: 0, balance: 0, total_income: 0, total_expenditure: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ type: 'All', payment_method: 'All' });
  const [localMonth, setLocalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const month = propMonth !== undefined ? propMonth : localMonth;
  const setMonth = propSetMonth !== undefined ? propSetMonth : setLocalMonth;
  const [sort, setSort] = useState('desc');
  const [modal, setModal] = useState(null); // null | 'Thu' | 'Chi'
  const [detailId, setDetailId] = useState(null);
  const [currentUser, setCurrentUser] = useState(propUser || null);

  // ── Đối chiếu theo Mã Hợp Đồng / Mã Hồ Sơ ──────────────────────
  const [reconcileMode, setReconcileMode] = useState('contract'); // 'contract' | 'project'
  const [reconcileId, setReconcileId] = useState('');
  const [contracts, setContracts] = useState([]);
  const [projects, setProjects] = useState([]);

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

  useEffect(() => {
    if (mode === 'all') {
      apiFetch(`${API}/api/finance/contracts`)
        .then(d => setContracts(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
      apiFetch(`${API}/api/finance/projects`)
        .then(d => setProjects(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
    }
  }, [mode]);

  const load = useCallback(async () => {
    setLoading(true);
    setBalance({ cash_balance: 0, bank_balance: 0, balance: 0, total_income: 0, total_expenditure: 0 });
    setData([]);
    try {
      const p = new URLSearchParams();
      if (month) p.set('month', month);
      if (filters.type !== 'All') p.set('type', filters.type);
      if (filters.payment_method !== 'All') p.set('payment_method', filters.payment_method);
      if (reconcileId) p.set(reconcileMode === 'contract' ? 'contract_id' : 'project_id', reconcileId);

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
      // ignore
    } finally {
      setLoading(false);
    }
  }, [mode, month, filters, reconcileMode, reconcileId]);

  useEffect(() => { load(); }, [load]);

  const sortedFiltered = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];

    return data
      .filter(item => {
        const matchSearch = search.trim() === '' ||
          item.id?.toLowerCase().includes(search.toLowerCase()) ||
          item.payer_payee?.toLowerCase().includes(search.toLowerCase()) ||
          item.partner?.toLowerCase().includes(search.toLowerCase()) ||
          item.category?.toLowerCase().includes(search.toLowerCase()) ||
          (item.description || '')?.toLowerCase().includes(search.toLowerCase());

        return matchSearch;
      })
      .sort((a, b) => {
        const dA = a.date || a.created_at || '';
        const dB = b.date || b.created_at || '';
        if (dA !== dB) {
          return sort === 'desc' ? dB.localeCompare(dA) : dA.localeCompare(dB);
        }
        return sort === 'desc' ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
      });
  }, [data, search, sort]);

  const totalIncome = sortedFiltered.filter(t => t.type === 'Thu').reduce((s, t) => s + t.amount, 0);
  const totalExpense = sortedFiltered.filter(t => t.type === 'Chi').reduce((s, t) => s + t.amount, 0);

  const reportTitle = mode === 'all' ? 'Sổ Nhật Ký Thu Chi' : mode === 'cash' ? 'Sổ Quỹ Tiền Mặt' : 'Sổ Quỹ Ngân Hàng';
  const reportColumns = [
    { key: 'index', label: 'STT', width: '38px', align: 'center', nowrap: true, render: (_, __, index) => index + 1 },
    { key: 'Ngày', label: 'Ngày', width: '80px', align: 'center', nowrap: true },
    { key: 'id', label: 'Số chứng từ', width: '120px', align: 'center', nowrap: true, render: v => <strong>{v}</strong> },
    { key: 'type', label: 'Loại', width: '55px', align: 'center', nowrap: true, render: v => v === 'Thu' ? 'Thu' : 'Chi' },
    { key: 'Hạng mục', label: 'Hạng mục thu/chi', width: '145px', align: 'left' },
    { key: 'Diễn giải', label: 'Nội dung diễn giải', align: 'left' },
    { key: 'Đối tác', label: 'Đối tác / Người giao dịch', width: '135px', align: 'left' },
    { key: 'Hình thức', label: 'Hình thức', width: '85px', align: 'center', nowrap: true },
    { key: 'income', label: 'Thu (VNĐ)', width: '110px', align: 'right', nowrap: true, render: (_, row) => row.type === 'Thu' ? fmt(row.amount) : '—' },
    { key: 'expense', label: 'Chi (VNĐ)', width: '110px', align: 'right', nowrap: true, render: (_, row) => row.type === 'Chi' ? fmt(row.amount) : '—' },
  ];

  const footerRow = {
    index: '',
    'Ngày': '',
    id: '',
    type: '',
    'Hạng mục': '',
    'Diễn giải': 'TỔNG CỘNG',
    'Đối tác': '',
    'Hình thức': '',
    income: fmt(totalIncome),
    expense: fmt(totalExpense)
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
    <div>
      <FinanceScreenHeader
        title={mode === 'all' ? 'Nhật Ký Thu Chi' : mode === 'cash' ? 'Quỹ Tiền Mặt' : 'Tài Khoản Ngân Hàng'}
        subtitle={mode === 'all' ? 'Quản lý dòng tiền, theo dõi các khoản thu chi thực tế' : mode === 'cash' ? 'Theo dõi số dư và biến động thu chi quỹ tiền mặt thực tế' : 'Theo dõi số dư và biến động thu chi tài khoản ngân hàng'}
        onRefresh={load}
        actions={
          <>
            <button className="btn btn-secondary no-print" onClick={handlePrintReport} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={15} /> In Sổ Quỹ
            </button>
            {!isDirector && (
              <>
                <button className="btn btn-primary" onClick={() => setModal('Thu')} style={{ background: '#10b981', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PlusCircle size={15} /> Thu Tiền
                </button>
                <button className="btn btn-primary" onClick={() => setModal('Chi')} style={{ background: '#ef4444', borderColor: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MinusCircle size={15} /> Chi Tiền
                </button>
              </>
            )}
          </>
        }
      />

      {/* 3 Thẻ KPI tổng hợp cho từng chế độ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {mode === 'all' ? (
          <>
            <BalanceCard
              title="Tổng Thu (Toàn Hệ Thống)"
              amount={totalIncome}
              icon={<TrendingUp size={20} color="#10b981" />}
              forcePositive
            />
            <BalanceCard
              title="Tổng Chi (Toàn Hệ Thống)"
              amount={totalExpense}
              icon={<TrendingDown size={20} color="#ef4444" />}
              forceNegative
            />
            <BalanceCard
              title="Dòng Tiền Ròng (Thu - Chi)"
              amount={totalIncome - totalExpense}
              icon={<Scale size={20} color={totalIncome >= totalExpense ? "#10b981" : "#ef4444"} />}
            />
          </>
        ) : (
          <>
            <BalanceCard
              title="Số Dư Hiện Tại"
              amount={balance.balance}
              icon={mode === 'cash' ? <Wallet size={20} color="#10b981" /> : <Building2 size={20} color="#3b82f6" />}
            />
            <BalanceCard
              title="Tổng Thu"
              amount={balance.total_income}
              icon={<TrendingUp size={20} color="#10b981" />}
              forcePositive
            />
            <BalanceCard
              title="Tổng Chi"
              amount={balance.total_expenditure}
              icon={<TrendingDown size={20} color="#ef4444" />}
              forceNegative
            />
          </>
        )}
      </div>

      {/* Filter row */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={mode === 'all' ? "Tìm số phiếu, đối tác, danh mục..." : "Tìm số phiếu, đối tác..."}
        filters={[
          { key: 'type', label: 'Loại', type: 'select', width: 150, options: [{ value: 'All', label: 'Tất cả loại' }, { value: 'Thu', label: 'Thu' }, { value: 'Chi', label: 'Chi' }] },
          ...(mode === 'all' ? [{ key: 'payment_method', label: 'Hình thức', type: 'select', width: 175, options: [{ value: 'All', label: 'Tất cả hình thức' }, { value: 'Tiền mặt', label: 'Tiền mặt' }, { value: 'Chuyển khoản', label: 'Chuyển khoản' }] }] : [])
        ]}
        values={filters}
        onFilterChange={(k, v) => setFilters(p => ({ ...p, [k]: v }))}
        onReset={() => { setSearch(''); setFilters({ type: 'All', payment_method: 'All' }); setMonth(() => new Date().toISOString().slice(0, 7)); setReconcileId(''); setSort('desc'); }}
        month={month}
        onMonthChange={setMonth}
        sort={sort}
        onSortChange={setSort}
      />

      <DataTable columns={CF_COLS} data={sortedFiltered} loading={loading} rowKey="id"
        emptyText="Chưa có giao dịch nào" pageSize={15} onRowClick={row => setDetailId(row.id)} />

      <div aria-hidden="true" style={{ position: 'fixed', left: '-100000px', top: 0, width: '277mm', pointerEvents: 'none' }}>
        <FinancePrintReport
          documentRef={printDocumentRef}
          title={reportTitle}
          subtitle={`Kỳ báo cáo: ${month ? `Tháng ${month.split('-')[1]}/${month.split('-')[0]}` : 'Toàn bộ'} · Phân loại: ${filters.type === 'All' ? 'Tất cả' : filters.type} · Hình thức: ${filters.payment_method === 'All' ? 'Tất cả' : filters.payment_method}`}
          summary={[
            { label: 'Số giao dịch', value: sortedFiltered.length.toLocaleString('vi-VN') },
            { label: 'Tổng thu', value: fmt(totalIncome) },
            { label: 'Tổng chi', value: fmt(totalExpense) },
            { label: 'Chênh lệch', value: fmt(totalIncome - totalExpense) },
          ]}
          columns={reportColumns}
          rows={sortedFiltered}
          footerRow={footerRow}
          emptyText="Không có giao dịch phù hợp bộ lọc"
        />
      </div>

      <CashflowModal open={!!modal} onClose={() => setModal(null)} defaultType={modal || 'Thu'} onSuccess={load} />
      <CashflowDetailModal open={!!detailId} transactionId={detailId} isDirector={isDirector} user={propUser || currentUser} onClose={() => setDetailId(null)} onSuccess={load} />
    </div>
  );
}
