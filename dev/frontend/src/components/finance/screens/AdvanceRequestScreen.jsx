import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DataTable, Modal, FormRow, FormGrid, FilterBar, Dropdown } from '../../ui';
import { fmtShort, fmtAmt, parseAmt, spellVietnameseCurrency, VOUCHER_SIGNERS } from '../utils';
import { FinanceScreenHeader, SummaryStrip } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { PlusCircle, HandCoins } from 'lucide-react';
import CashflowDetailModal from '../modals/CashflowDetailModal';
import { apiFetch } from '../../../lib/api';

const getTodayIso = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  return new Date(today.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const DEPARTMENT_OPTIONS = [
  { value: 'Phòng Đo vẽ', label: 'Phòng Đo vẽ' },
  { value: 'Phòng Pháp lý', label: 'Phòng Pháp lý' },
  { value: 'Phòng Kế toán', label: 'Phòng Kế toán' },
  { value: 'Phòng Sale / CSKH', label: 'Phòng Sale / CSKH' },
  { value: 'Ban Giám đốc', label: 'Ban Giám đốc' },
];

const ADVANCE_CATEGORIES = [
  { value: 'Chi phí tạm ứng công tác / đo vẽ hiện trường', label: 'Chi phí tạm ứng công tác / đo vẽ hiện trường' },
  { value: 'Chi phí xăng xe, di chuyển phục vụ dự án', label: 'Chi phí xăng xe, di chuyển phục vụ dự án' },
  { value: 'Chi phí cắm mốc ranh giới, vật tư mốc đo', label: 'Chi phí cắm mốc ranh giới, vật tư mốc đo' },
  { value: 'Chi phí nộp lệ phí trích lục bản đồ, hồ sơ địa chính', label: 'Chi phí nộp lệ phí trích lục bản đồ, hồ sơ địa chính' },
  { value: 'Chi phí công chứng, thẩm định hồ sơ đất đai', label: 'Chi phí công chứng, thẩm định hồ sơ đất đai' },
  { value: 'Khác', label: 'Khác (Tự nhập chi tiết vào diễn giải)' }
];

export default function AdvanceRequestScreen({ month: propMonth, setMonth: propSetMonth, isDirector: propIsDirector, user: propUser }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [contracts, setContracts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [currentUser, setCurrentUser] = useState(propUser || null);

  const [form, setForm] = useState({
    contract_id: '',
    payer_payee: '',
    department_code: 'Phòng Đo vẽ',
    category: 'Chi phí tạm ứng công tác / đo vẽ hiện trường',
    note: '',
    payment_method: 'Chuyển khoản',
    transaction_date: getTodayIso(),
    created_by: VOUCHER_SIGNERS.creator,
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
    apiFetch(`${API}/api/finance/contracts`)
      .then(d => setContracts(Array.isArray(d) ? d : d.data || []))
      .catch(() => { });
    apiFetch(`${API}/api/finance/employees`)
      .then(d => setEmployees(Array.isArray(d) ? d : d.data || []))
      .catch(() => { });
    if (propIsDirector === undefined && !propUser) {
      apiFetch('/api/auth/me').then(u => setCurrentUser(u)).catch(() => { });
    }
  }, []);

  const isDirector = propIsDirector !== undefined
    ? propIsDirector
    : Boolean(
      currentUser?.is_director ||
      currentUser?.username === 'admin' ||
      currentUser?.role_name === 'admin'
    );

  const employeeOptions = useMemo(() => {
    return employees.map(emp => {
      const deptName = emp.department || emp.department_name || emp.department_code || '';
      return {
        value: emp.full_name,
        label: `${emp.full_name} (${emp.job_title || deptName || 'Nhân viên'})`,
        dept: deptName
      };
    });
  }, [employees]);

  const contractOptions = useMemo(() => {
    return contracts.map(c => {
      const cid = c.id || c.contract_id || c.code || '';
      const cname = c.customer_name || c.customer || c.partner || 'Khách hàng';
      return {
        value: cid,
        label: cid ? `${cid} — ${cname}` : cname
      };
    }).filter(opt => Boolean(opt.value));
  }, [contracts]);

  const handleEmployeeSelect = (fullName) => {
    const selected = employeeOptions.find(e => e.value === fullName);
    let matchedDept = selected?.dept || '';
    if (matchedDept && !matchedDept.startsWith('Phòng') && !matchedDept.startsWith('Ban')) {
      if (matchedDept.includes('Đo') || matchedDept.includes('Trắc địa')) matchedDept = 'Phòng Đo vẽ';
      else if (matchedDept.includes('Pháp lý')) matchedDept = 'Phòng Pháp lý';
      else if (matchedDept.includes('Kế toán')) matchedDept = 'Phòng Kế toán';
      else if (matchedDept.includes('Sale') || matchedDept.includes('CSKH')) matchedDept = 'Phòng Sale / CSKH';
    }
    setForm(prev => ({
      ...prev,
      payer_payee: fullName,
      department_code: matchedDept || prev.department_code
    }));
  };

  const handleOpenModal = () => {
    setAmtDisplay('');
    setError('');
    const firstEmp = employeeOptions[0];
    let initialDept = firstEmp?.dept || 'Phòng Đo vẽ';
    if (initialDept && !initialDept.startsWith('Phòng') && !initialDept.startsWith('Ban')) {
      if (initialDept.includes('Đo') || initialDept.includes('Trắc địa')) initialDept = 'Phòng Đo vẽ';
      else if (initialDept.includes('Pháp lý')) initialDept = 'Phòng Pháp lý';
      else if (initialDept.includes('Kế toán')) initialDept = 'Phòng Kế toán';
      else if (initialDept.includes('Sale') || initialDept.includes('CSKH')) initialDept = 'Phòng Sale / CSKH';
    }

    setForm({
      contract_id: '',
      payer_payee: firstEmp ? firstEmp.value : '',
      department_code: initialDept,
      category: 'Chi phí tạm ứng công tác / đo vẽ hiện trường',
      note: '',
      payment_method: 'Chuyển khoản',
      transaction_date: getTodayIso(),
      created_by: VOUCHER_SIGNERS.creator,
      status: 'Chờ duyệt'
    });
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseAmt(amtDisplay);
    if (!amount || amount <= 0) {
      setError('Vui lòng nhập số tiền tạm ứng hợp lệ (> 0đ)');
      return;
    }
    if (!form.payer_payee) {
      setError('Vui lòng chọn người nhận tiền tạm ứng');
      return;
    }
    if (!form.note.trim()) {
      setError('Vui lòng nhập chi tiết diễn giải lý do xin tạm ứng');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const finalNote = form.category && form.category !== 'Khác'
        ? `[${form.category}] ${form.note.trim()}`
        : form.note.trim();

      await apiFetch(`${API}/api/finance/advance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: form.contract_id || null,
          amount,
          payer_payee: form.payer_payee,
          note: finalNote,
          payment_method: form.payment_method,
          created_by: form.created_by,
          status: 'Chờ duyệt',
          department_code: form.department_code || null
        })
      });
      addToast('Đã lập đề xuất tạm ứng thành công (Chờ Giám đốc duyệt)', 'success');
      setModal(false);
      load();
    } catch (err) {
      setError(err.message || 'Lỗi lưu dữ liệu từ máy chủ');
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
              onClick={handleOpenModal}
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
          {
            key: 'payment_method', label: 'Hình thức', type: 'select', width: 175, options: [
              { value: 'All', label: 'Tất cả hình thức' },
              { value: 'Tiền mặt', label: 'Tiền mặt' },
              { value: 'Chuyển khoản', label: 'Chuyển khoản' }
            ]
          },
          {
            key: 'status', label: 'Trạng thái', type: 'select', width: 180, options: [
              { value: 'All', label: 'Tất cả trạng thái' },
              { value: 'Chờ duyệt', label: 'Chờ duyệt' },
              { value: 'Hoàn thành', label: 'Hoàn thành' },
              { value: 'Từ chối', label: 'Từ chối' },
              { value: 'Đã hủy', label: 'Đã hủy' }
            ]
          }
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

      <DataTable
        columns={CF_COLS}
        data={sortedFiltered}
        loading={loading}
        rowKey="id"
        emptyText="Chưa có phiếu tạm ứng"
        pageSize={15}
        onRowClick={row => setDetailId(row.id)}
      />

      <Modal open={modal} onClose={() => setModal(false)} size="md" title="Lập Đề Xuất Tạm Ứng">
        <form onSubmit={handleSubmit}>
          {/* Header notice */}
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            padding: '12px 16px',
            borderRadius: '10px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <HandCoins size={22} color="#d97706" />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.94rem', color: '#b45309' }}>Phiếu Đề Xuất Tạm Ứng Kinh Phí</div>
                <div style={{ fontSize: '0.78rem', color: '#92400e' }}>Phiếu sẽ được gửi lên Ban Giám Đốc phê duyệt trước khi xuất quỹ</div>
              </div>
            </div>
            <span style={{
              background: '#fef3c7',
              color: '#b45309',
              fontSize: '0.76rem',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #fde68a',
              whiteSpace: 'nowrap'
            }}>
              Chờ duyệt
            </span>
          </div>

          {/* Amount input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Số tiền xin tạm ứng <span className="form-required">*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                autoFocus
                required
                className="form-control"
                value={amtDisplay}
                onChange={e => setAmtDisplay(fmtAmt(e.target.value))}
                type="text"
                inputMode="numeric"
                placeholder="0"
                style={{
                  fontSize: '1.6rem',
                  fontWeight: 800,
                  textAlign: 'right',
                  padding: '12px 48px 12px 12px',
                  color: '#d97706',
                  borderColor: 'rgba(245, 158, 11, 0.4)',
                  background: 'rgba(245, 158, 11, 0.04)',
                  fontFamily: 'var(--font-mono)'
                }}
              />
              <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#d97706', fontWeight: 800, fontSize: '1.2rem' }}>₫</span>
            </div>
            <div style={{ marginTop: 6, fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
              Bằng chữ: <strong style={{ color: '#0f172a' }}>{amtDisplay ? spellVietnameseCurrency(amtDisplay.replace(/[^\d]/g, '')) : 'Không đồng'}</strong>
            </div>
          </div>

          <FormGrid cols={2}>
            <FormRow label="Người nhận tạm ứng" required>
              <Dropdown
                options={employeeOptions.length > 0 ? employeeOptions : [
                  { value: 'Nguyễn Văn A', label: 'Nguyễn Văn A (Nhân viên đo vẽ)', dept: 'Phòng Đo vẽ' },
                  { value: 'Hồ Thị Mỹ Hằng', label: 'Hồ Thị Mỹ Hằng (Phòng Pháp lý)', dept: 'Phòng Pháp lý' },
                  { value: 'Trần Thụy Tường Vy', label: 'Trần Thụy Tường Vy (Phòng Pháp lý)', dept: 'Phòng Pháp lý' }
                ]}
                value={form.payer_payee}
                onChange={handleEmployeeSelect}
                placeholder="— Chọn nhân sự nhận tiền —"
                required
              />
            </FormRow>

            <FormRow label="Phòng ban" required>
              <Dropdown
                options={DEPARTMENT_OPTIONS}
                value={form.department_code}
                onChange={(val) => setForm(prev => ({ ...prev, department_code: val }))}
                placeholder="— Chọn phòng ban —"
                required
              />
            </FormRow>

            <FormRow label="Hợp đồng / Dự án liên kết">
              <Dropdown
                options={contractOptions.length > 0 ? contractOptions : [
                  { value: '377/BK-2026', label: '377/BK-2026 — Lê hữu trí' },
                  { value: '2001/BK-2026', label: '2001/BK-2026 — Trần Thụy Tường Vy' },
                  { value: 'HD-0P-cc2d5f', label: 'HD-0P-cc2d5f — Công Ty Nộp Thừa Test' }
                ]}
                value={form.contract_id}
                onChange={(val) => setForm(prev => ({ ...prev, contract_id: val }))}
                placeholder="— Chọn HĐ liên kết (nếu có) —"
              />
            </FormRow>

            <FormRow label="Hình thức nhận tiền" required>
              <Dropdown
                options={[
                  { value: 'Chuyển khoản', label: 'Chuyển khoản (Ngân hàng)' },
                  { value: 'Tiền mặt', label: 'Tiền mặt (Thủ quỹ)' }
                ]}
                value={form.payment_method}
                onChange={(val) => setForm(prev => ({ ...prev, payment_method: val }))}
                required
              />
            </FormRow>

            <FormRow label="Hạng mục tạm ứng" required cols={2}>
              <Dropdown
                options={ADVANCE_CATEGORIES}
                value={form.category}
                onChange={(val) => setForm(prev => ({ ...prev, category: val }))}
                required
              />
            </FormRow>

            <FormRow label="Lý do & Diễn giải công việc" required cols={2}>
              <textarea
                required
                className="form-control"
                rows={3}
                value={form.note}
                onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
                placeholder="Nhập chi tiết nhiệm vụ hiện trường, cung đường, mục đích chi phí..."
              />
            </FormRow>
          </FormGrid>

          {error && (
            <div style={{ marginTop: 14, padding: '8px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)} disabled={submitting}>
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ background: '#f59e0b', borderColor: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              <PlusCircle size={16} /> {submitting ? 'Đang tạo đề xuất...' : 'Tạo Phiếu Tạm Ứng'}
            </button>
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
