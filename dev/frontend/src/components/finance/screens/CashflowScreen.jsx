import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DataTable, Badge, Modal, FormRow, FormGrid, FilterBar, SubTabs, Dropdown } from '../../ui';
import { fmt, fmtShort, fmtAmt, parseAmt, docSoTiengViet, CATEGORY_AUTO_MAPPING } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip, ExcelGridTable } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { RefreshCw, DollarSign, Link, PlusCircle, MinusCircle, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import CashflowModal from '../modals/CashflowModal';
import CashflowDetailModal from '../modals/CashflowDetailModal';


export default function CashflowScreen({ mode = 'all', month: propMonth, setMonth: propSetMonth }) {
  const [data, setData] = useState([]);
  const [balance, setBalance] = useState({ tien_mat: 0, ngan_hang: 0, balance: 0, tong_thu: 0, tong_chi: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ type: 'All', payment_method: 'All' });
  const [localMonth, setLocalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const month = propMonth !== undefined ? propMonth : localMonth;
  const setMonth = propSetMonth !== undefined ? propSetMonth : setLocalMonth;
  const [sort, setSort] = useState('desc');
  const [modal, setModal] = useState(null); // null | 'Thu' | 'Chi'
  const [detailId, setDetailId] = useState(null);

  // ── Đối chiếu theo Mã Hợp Đồng / Mã Hồ Sơ (Task 15) ──────────────────────
  const [reconcileMode, setReconcileMode] = useState('contract'); // 'contract' | 'project'
  const [reconcileId, setReconcileId] = useState('');
  const [contracts, setContracts] = useState([]);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    if (mode === 'all') {
      fetch(`${API}/api/finance/contracts`)
        .then(r => r.json())
        .then(d => setContracts(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
      fetch(`${API}/api/finance/projects`)
        .then(r => r.json())
        .then(d => setProjects(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
    }
  }, [mode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (month) p.set('month', month);
      if (filters.type !== 'All') p.set('type', filters.type);
      if (filters.payment_method !== 'All') p.set('payment_method', filters.payment_method);
      if (reconcileId) p.set(reconcileMode === 'contract' ? 'contract_id' : 'project_id', reconcileId);

      // Mốc thời gian thực để tính số dư hiện tại
      const bayGio = new Date().toISOString();

      if (mode === 'cash') {
        // 🔥 Gọi song song: 1 cái lấy danh sách trans theo bộ lọc, 1 cái bốc số dư realtime từ DB
        const [resData, resBal] = await Promise.all([
          fetch(`${API}/api/finance/cashflow/cash?${p}`),
          fetch(`${API}/api/finance/fund-balances/calculate?hinh_thuc=${encodeURIComponent('Tiền mặt')}&ngay_chot=${encodeURIComponent(bayGio)}`)
        ]);

        const d = await resData.json();
        const b = await resBal.json();

        // Cập nhật: Danh sách trans giữ nguyên, nhưng số dư lấy từ hàm calculate chuẩn
        setBalance({
          ...d,
          balance: b.so_du_he_thong || 0,
          tien_mat: b.so_du_he_thong || 0
        });
        setData(d.transactions || []);

      } else if (mode === 'bank') {
        const [resData, resBal] = await Promise.all([
          fetch(`${API}/api/finance/cashflow/bank?${p}`),
          fetch(`${API}/api/finance/fund-balances/calculate?hinh_thuc=${encodeURIComponent('Chuyển khoản')}&ngay_chot=${encodeURIComponent(bayGio)}`)
        ]);

        const d = await resData.json();
        const b = await resBal.json();

        setBalance({
          ...d,
          balance: b.so_du_he_thong || 0,
          ngan_hang: b.so_du_he_thong || 0
        });
        setData(d.transactions || []);

      } else {
        // Màn hình 'all' (Tổng cả 2 quỹ)
        const [resData, resBalTM, resBalCK] = await Promise.all([
          fetch(`${API}/api/finance/cashflow?${p}`),
          fetch(`${API}/api/finance/fund-balances/calculate?hinh_thuc=${encodeURIComponent('Tiền mặt')}&ngay_chot=${encodeURIComponent(bayGio)}`),
          fetch(`${API}/api/finance/fund-balances/calculate?hinh_thuc=${encodeURIComponent('Chuyển khoản')}&ngay_chot=${encodeURIComponent(bayGio)}`)
        ]);

        const transactionsList = await resData.json();
        const bTM = await resBalTM.json();
        const bCK = await resBalCK.json();

        const tm = bTM.so_du_he_thong || 0;
        const ck = bCK.so_du_he_thong || 0;

        // 🔥 SỬA TẠI ĐÂY: Tính trực tiếp từ dữ liệu vừa nhận về để tránh crash render
        const inlineThu = transactionsList.filter(t => t.type === 'Thu').reduce((s, t) => s + t.amount, 0);
        const inlineChi = transactionsList.filter(t => t.type === 'Chi').reduce((s, t) => s + t.amount, 0);

        setBalance({
          tien_mat: tm,
          ngan_hang: ck,
          balance: tm + ck,
          tong_thu: inlineThu,
          tong_chi: inlineChi
        });
        setData(transactionsList);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [mode, filters, month, reconcileMode, reconcileId]);

  useEffect(() => { load(); }, [load]);

  const filtered = data.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (t['Danh mục'] || '').toLowerCase().includes(q) ||
      (t['Đối tác'] || '').toLowerCase().includes(q) ||
      (t.id || '').toLowerCase().includes(q);
  });
  const sortedFiltered = sort === 'asc' ? [...filtered].reverse() : filtered;

  const totalThu = filtered.filter(t => t.type === 'Thu').reduce((s, t) => s + t.amount, 0);
  const totalChi = filtered.filter(t => t.type === 'Chi').reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      <FinanceScreenHeader
        title={mode === 'all' ? 'Nhật Ký Thu Chi' : mode === 'cash' ? 'Quỹ Tiền Mặt' : 'Tài Khoản Ngân Hàng'}
        subtitle="Quản lý dòng tiền, ghi nhận các khoản thu chi thực tế"
        onRefresh={load}
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setModal('Thu')} style={{ background: '#10b981', borderColor: '#10b981' }}>
              <PlusCircle size={15} /> Thu Tiền
            </button>
            <button className="btn btn-primary" onClick={() => setModal('Chi')} style={{ background: '#ef4444', borderColor: '#ef4444' }}>
              <MinusCircle size={15} /> Chi Tiền
            </button>
          </>
        }
      />

      {/* Balance card for cash/bank modes */}
      {mode !== 'all' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
          <BalanceCard
            title="Số Dư Hiện Tại"
            amount={balance.balance}
            icon={mode === 'cash' ? '💵' : '🏦'}
          />
          <BalanceCard
            title="Tổng Thu"
            amount={balance.tong_thu}
            icon="↑"
            forcePositive
          />
          <BalanceCard
            title="Tổng Chi"
            amount={balance.tong_chi}
            icon="↓"
            forceNegative
          />
        </div>
      )}

      {/* Filter row */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={mode === 'all' ? "Tìm số phiếu, đối tác, danh mục..." : "Tìm số phiếu, đối tác..."}
        filters={[
          { key: 'type', label: 'Loại', type: 'select', width: 140, options: [{ value: 'Thu', label: '🟢 Thu' }, { value: 'Chi', label: '🔴 Chi' }] },
          { key: 'payment_method', label: 'Hình thức', type: 'select', width: 160, options: [{ value: 'Tiền mặt', label: 'Tiền mặt' }, { value: 'Chuyển khoản', label: 'Chuyển khoản' }] }
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

      <CashflowModal open={!!modal} onClose={() => setModal(null)} defaultType={modal || 'Thu'} onSuccess={load} />
      <CashflowDetailModal open={!!detailId} transactionId={detailId} onClose={() => setDetailId(null)} onSuccess={load} />
    </div>
  );
}

