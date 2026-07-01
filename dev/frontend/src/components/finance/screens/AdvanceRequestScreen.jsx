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


export default function AdvanceRequestScreen({ month: propMonth, setMonth: propSetMonth }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({
    project_id: '',
    contract_id: '',
    amount: '',
    payer_payee: '',
    note: '',
    payment_method: 'Tiền mặt',
    du_an_phong_ban: '',
    nguoi_lap: 'Lê Văn Dựng',
    ke_toan: 'Nguyễn Thị A',
    nguoi_duyet: 'Lê Văn Dựng',
    trang_thai: 'Hoàn thành'
  });
  const [amtDisplay, setAmtDisplay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useToast();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ payment_method: 'All', trang_thai: 'All' });
  const [localMonth, setLocalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const month = propMonth !== undefined ? propMonth : localMonth;
  const setMonth = propSetMonth !== undefined ? propSetMonth : setLocalMonth;
  const [sort, setSort] = useState('desc');

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/finance/advance`);
    setData(await r.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetch(`${API}/api/finance/projects`).then(r => r.json()).then(setProjects).catch(() => { });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseAmt(amtDisplay);
    if (!amount) { setError('Nhập số tiền'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/api/finance/advance/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: form.project_id || null,
          contract_id: form.contract_id || null,
          amount,
          payer_payee: form.payer_payee,
          note: form.note,
          payment_method: form.payment_method,
          nguoi_lap: form.nguoi_lap,
          nguoi_duyet: form.nguoi_duyet,
          trang_thai: form.trang_thai,
          du_an_phong_ban: form.du_an_phong_ban || null
        })
      });
      if (res.ok) {
        addToast(' Đã tạo phiếu tạm ứng', 'success');
        setModal(false); load();
      } else {
        const err = await res.json();
        setError(err.detail || 'Lỗi server');
      }
    } catch { setError('Lỗi kết nối'); }
    finally { setSubmitting(false); }
  };

  const filtered = data.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      const matchSearch =
        (t.id || '').toLowerCase().includes(q) ||
        (t['Đối tác'] || t.nguoi_nhan_nop || '').toLowerCase().includes(q) ||
        (t.dien_giai || '').toLowerCase().includes(q) ||
        (t.hang_muc || '').toLowerCase().includes(q);
      if (!matchSearch) return false;
    }
    if (filters.payment_method !== 'All') {
      if (t['Hình thức'] !== filters.payment_method && t.hinh_thuc !== filters.payment_method) return false;
    }
    if (filters.trang_thai !== 'All') {
      if (t.trang_thai !== filters.trang_thai) return false;
    }
    if (month) {
      const tDate = t.ngay || (t.created_at ? t.created_at.slice(0, 10) : '');
      if (!tDate.startsWith(month)) return false;
    }
    return true;
  });

  const sortedFiltered = [...filtered].sort((a, b) => {
    const dateA = a.ngay || a.created_at || '';
    const dateB = b.ngay || b.created_at || '';
    if (dateA !== dateB) {
      return sort === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
    }
    return sort === 'desc' ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
  });

  return (
    <div>
      <FinanceScreenHeader 
        title=" Đề Xuất Tạm Ứng" 
        subtitle="Ứng tiền mặt cho kỹ sư/chỉ huy trưởng trước khi ra công trường" 
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm số phiếu, đối tác, dự án..."
        filters={[
          { key: 'payment_method', label: 'Hình thức', type: 'select', width: 160, options: [{ value: 'Tiền mặt', label: 'Tiền mặt' }, { value: 'Chuyển khoản', label: 'Chuyển khoản' }] },
          { key: 'trang_thai', label: 'Trạng thái', type: 'select', width: 140, options: [{ value: 'Hoàn thành', label: 'Hoàn thành' }, { value: 'Chờ duyệt', label: 'Chờ duyệt' }] }
        ]}
        values={filters}
        onFilterChange={(k, v) => setFilters(p => ({ ...p, [k]: v }))}
        onReset={() => { setSearch(''); setFilters({ payment_method: 'All', trang_thai: 'All' }); setMonth(() => new Date().toISOString().slice(0, 7)); setSort('desc'); }}
        month={month}
        onMonthChange={setMonth}
        sort={sort}
        onSortChange={setSort}
      />

      {sortedFiltered.length > 0 && (
        <SummaryStrip 
          countText={`${sortedFiltered.length} đề xuất`} 
          totalText="Tổng tạm ứng" 
          totalAmount={sortedFiltered.reduce((s, t) => s + (t.amount || t.so_tien || 0), 0)} 
        />
      )}

      <DataTable columns={CF_COLS} data={sortedFiltered} loading={loading} rowKey="id" emptyText="Chưa có phiếu tạm ứng" pageSize={15} />

      <Modal open={modal} onClose={() => setModal(false)} size="lg" title=" Đề Xuất Tạm Ứng">
        <form onSubmit={handleSubmit}>
          <ExcelGridTable
            title="PHIẾU TẠM ỨNG"
            accentColor="#f59e0b"
            formId=""
            date={form.ngay || new Date().toLocaleDateString('vi-VN')}
            onDateChange={(v) => setForm({ ...form, ngay: v })}
            note={form.note}
            onNoteChange={(v) => setForm({ ...form, note: v })}
            category="Chi phí tạm ứng"
            categoryOptions={undefined}
            personLabel="Người nhận"
            personName={form.payer_payee}
            onPersonNameChange={(v) => setForm({ ...form, payer_payee: v })}
            method={form.payment_method}
            onMethodChange={(v) => setForm({ ...form, payment_method: v })}
            department={form.du_an_phong_ban}
            onDepartmentChange={(v) => setForm({ ...form, du_an_phong_ban: v })}
            amountDisplay={amtDisplay}
            onAmountChange={(v) => setAmtDisplay(fmtAmt(v))}
            status={form.trang_thai}
            onStatusChange={(v) => setForm({ ...form, trang_thai: v })}
            projectId={form.project_id || ''}
            onProjectIdChange={(v) => setForm({ ...form, project_id: v })}
            contractId={form.contract_id || ''}
            onContractIdChange={(v) => setForm({ ...form, contract_id: v })}
            creator={form.nguoi_lap}
            onCreatorChange={(v) => setForm({ ...form, nguoi_lap: v })}
            accountant={form.ke_toan}
            onAccountantChange={(v) => setForm({ ...form, ke_toan: v })}
            approver={form.nguoi_duyet}
            onApproverChange={(v) => setForm({ ...form, nguoi_duyet: v })}
            receiver={form.payer_payee}
            receiverLabel="Người nhận"
            isReadOnly={false}
          />

          {error && <div style={{ marginTop: 12, color: '#ef4444', fontSize: '0.88rem' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? '⏳...' : 'Tạo Phiếu Tạm Ứng'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
