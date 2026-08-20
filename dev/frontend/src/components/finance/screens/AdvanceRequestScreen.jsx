import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DataTable, Badge, Modal, FormRow, FormGrid, FilterBar, SubTabs, Dropdown } from '../../ui';
import { fmt, fmtShort, fmtAmt, parseAmt, docSoTiengViet, CATEGORY_AUTO_MAPPING, VOUCHER_SIGNERS } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip, ExcelGridTable } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { PlusCircle, RefreshCw, AlertCircle, Link } from 'lucide-react';
import CashflowDetailModal from '../modals/CashflowDetailModal';
import { apiFetch } from '../../../lib/api';

const getTodayIso = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  return new Date(today.getTime() - offset * 60000).toISOString().slice(0, 10);
};

export default function AdvanceRequestScreen({ month: propMonth, setMonth: propSetMonth, isDirector: propIsDirector, user: propUser }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [projects, setProjects] = useState([]);
  const [currentUser, setCurrentUser] = useState(propUser || null);
  const [form, setForm] = useState({
    project_id: '',
    contract_id: '',
    amount: '',
    payer_payee: '',
    note: '',
    payment_method: 'Tiền mặt',
    department_code: '',
    transaction_date: getTodayIso(),
    created_by: VOUCHER_SIGNERS.creator,
    accounting: 'Nguyễn Thị A',
    status: 'Chờ duyệt'
  });
  const [amtDisplay, setAmtDisplay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [error, setError] = useState('');
  const { addToast } = useToast();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ payment_method: 'All', status: 'All' });
  const [localMonth, setLocalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const month = propMonth !== undefined ? propMonth : localMonth;
  const setMonth = propSetMonth !== undefined ? propSetMonth : setLocalMonth;
  const [sort, setSort] = useState('desc');

  const load = async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`${API}/api/finance/advance`);
      setData(Array.isArray(d) ? d : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    apiFetch(`${API}/api/finance/projects`).then(setProjects).catch(() => { });
    if (propIsDirector === undefined && !propUser) {
      apiFetch('/api/auth/me').then(u => setCurrentUser(u)).catch(() => {});
    }
  }, [propIsDirector, propUser]);

  const isDirector = propIsDirector !== undefined
    ? propIsDirector
    : Boolean(
        currentUser?.is_director ||
        currentUser?.username === 'admin' ||
        currentUser?.role_name === 'admin'
      );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.transaction_date) { setError('Vui lòng chọn ngày lập phiếu'); return; }
    const amount = parseAmt(amtDisplay);
    if (!amount) { setError('Nhập số tiền'); return; }
    setSubmitting(true); setError('');
    try {
      await apiFetch(`${API}/api/finance/advance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: form.project_id || null,
          contract_id: form.contract_id || null,
          amount,
          payer_payee: form.payer_payee,
          note: form.note,
          payment_method: form.payment_method,
          created_by: form.created_by,
          approved_by: form.approved_by,
          status: form.status,
          department_code: form.department_code || null
        })
      });
      if (res.ok) {
        addToast('Đã tạo phiếu tạm ứng', 'success');
        setModal(false); 
        load();
      } else {
        const err = await res.json();
        setError(err.detail || 'Lỗi server');
      }
    } catch { 
      setError('Lỗi kết nối'); 
    } finally { 
      setSubmitting(false); 
    }
  };

  const filtered = data.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      const matchSearch =
        (t.id || '').toLowerCase().includes(q) ||
        (t.partner || t.payer_payee || '').toLowerCase().includes(q) ||
        (t.note || t.description || '').toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q);
      if (!matchSearch) return false;
    }
    if (filters.payment_method !== 'All') {
      if (t.payment_method !== filters.payment_method) return false;
    }
    if (filters.status !== 'All') {
      if (t.status !== filters.status) return false;
    }
    if (month) {
      const tDate = t.date || t.transaction_date || (t.created_at ? t.created_at.slice(0, 10) : '');
      if (!tDate.startsWith(month)) return false;
    }
    return true;
  });

  const sortedFiltered = [...filtered].sort((a, b) => {
    const dateA = a.date || a.transaction_date || a.created_at || '';
    const dateB = b.date || b.transaction_date || b.created_at || '';
    if (dateA !== dateB) {
      return sort === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
    }
    return sort === 'desc' ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
  });

  return (
    <div>
      <FinanceScreenHeader 
        title="Đề Xuất Tạm Ứng" 
        subtitle="Ứng tiền cho kỹ sư/chỉ huy trưởng/pháp lý trước khi đi công trường hoặc thực hiện nhiệm vụ" 
        onRefresh={load}
        actions={
          !isDirector ? (
            <button 
              type="button"
              className="btn btn-primary" 
              onClick={() => setModal(true)} 
              style={{ background: '#f59e0b', borderColor: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
              title="Nhân viên / Kế toán lập đề xuất xin tạm ứng kinh phí"
            >
              <PlusCircle size={16} /> Lập Đề Xuất Tạm Ứng
            </button>
          ) : null
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm số phiếu, đối tác, dự án..."
        filters={[
          { key: 'payment_method', label: 'Hình thức', type: 'select', width: 175, options: [{ value: 'All', label: 'Tất cả hình thức' }, { value: 'Tiền mặt', label: 'Tiền mặt' }, { value: 'Chuyển khoản', label: 'Chuyển khoản' }] },
          { key: 'status', label: 'Trạng thái', type: 'select', width: 180, options: [
            { value: 'All', label: 'Tất cả trạng thái' },
            { value: 'Chờ duyệt', label: 'Chờ duyệt' },
            { value: 'Hoàn thành', label: 'Hoàn thành' },
            { value: 'Từ chối', label: 'Từ chối' },
            { value: 'Đã hủy', label: 'Đã hủy' }
          ] }
        ]}
        values={filters}
        onFilterChange={(k, v) => setFilters(p => ({ ...p, [k]: v }))}
        onReset={() => { setSearch(''); setFilters({ payment_method: 'All', status: 'All' }); setMonth(() => new Date().toISOString().slice(0, 7)); setSort('desc'); }}
        month={month}
        onMonthChange={setMonth}
        sort={sort}
        onSortChange={setSort}
      />

      {sortedFiltered.length > 0 && (
        <SummaryStrip 
          countText={`${sortedFiltered.length} đề xuất`} 
          totalText="Tổng tạm ứng" 
          totalAmount={sortedFiltered.reduce((s, t) => s + (t.amount || 0), 0)} 
        />
      )}

      <DataTable columns={CF_COLS} data={sortedFiltered} loading={loading} rowKey="id" emptyText="Chưa có phiếu tạm ứng" pageSize={15} onRowClick={row => setDetailId(row.id)} />

      <Modal open={modal} onClose={() => setModal(false)} size="lg" title="Lập Đề Xuất Tạm Ứng">
        <form onSubmit={handleSubmit}>
          <ExcelGridTable
            title="PHIẾU TẠM ỨNG"
            accentColor="#f59e0b"
            formId=""
            date={form.transaction_date}
            onDateChange={(v) => setForm(prev => ({ ...prev, transaction_date: v }))}
            onProjectIdChange={(v) => setForm({ ...form, project_id: v })}
            contractId={form.contract_id || ''}
            onContractIdChange={(v) => setForm({ ...form, contract_id: v })}
            creator={form.created_by}
            onCreatorChange={(v) => setForm({ ...form, created_by: v })}
            accountant={form.accounting}
            onAccountantChange={(v) => setForm({ ...form, accounting: v })}
            approver={form.approved_by}
            onApproverChange={(v) => setForm({ ...form, approved_by: v })}
            receiver={form.payer_payee}
            receiverLabel="Người nhận"
            isReadOnly={false}
          />

          {error && <div style={{ marginTop: 12, color: '#ef4444', fontSize: '0.88rem' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Đang tạo...' : 'Tạo Phiếu Tạm Ứng'}</button>
          </div>
        </form>
      </Modal>

      <CashflowDetailModal
        open={!!detailId}
        transactionId={detailId}
        isDirector={isDirector}
        user={propUser || currentUser}
        onClose={() => setDetailId(null)}
        onSuccess={load}
      />
    </div>
  );
}
