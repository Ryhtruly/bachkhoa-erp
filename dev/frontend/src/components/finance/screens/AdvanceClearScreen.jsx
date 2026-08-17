import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DataTable, Badge, Modal, FormRow, FormGrid, FilterBar, SubTabs, Dropdown } from '../../ui';
import { fmt, fmtShort, fmtAmt, parseAmt, spellVietnameseCurrency, CATEGORY_AUTO_MAPPING } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip, ExcelGridTable } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { PlusCircle, RefreshCw, AlertCircle, Link, RotateCcw } from 'lucide-react';
import { apiFetch } from '../../../lib/api';

export default function AdvanceClearScreen({ month: propMonth, setMonth: propSetMonth, isDirector: propIsDirector, user: propUser }) {
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [actualDisplay, setActualDisplay] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState(propUser || null);
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
      const r = await fetch(`${API}/api/finance/advance`);
      if (r.ok) {
        setAdvances(await r.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    load(); 
    if (propIsDirector === undefined && !propUser) {
      apiFetch('/api/auth/me').then(u => setCurrentUser(u)).catch(() => {});
    }
  }, []);

  const isDirector = propIsDirector !== undefined
    ? propIsDirector
    : Boolean(
        currentUser?.is_director ||
        currentUser?.username === 'admin' ||
        currentUser?.role_name === 'admin'
      );

  const sortedFiltered = useMemo(() => {
    if (!advances || !Array.isArray(advances)) return [];

    return advances
      .filter(item => {
        // 1. Bộ lọc ô tìm kiếm (Mã phiếu, đối tác, diễn giải)
        const matchSearch = search.trim() === '' ||
          item.id?.toLowerCase().includes(search.toLowerCase()) ||
          item.payer_payee?.toLowerCase().includes(search.toLowerCase()) ||
          item.partner?.toLowerCase().includes(search.toLowerCase()) ||
          (item.description || '')?.toLowerCase().includes(search.toLowerCase());

        // 2. Bộ lọc hình thức thanh toán
        const matchMethod = filters.payment_method === 'All' || item.payment_method === filters.payment_method;

        // 3. Bộ lọc trạng thái phiếu
        const itemStatus = item.status || '';
        const matchStatus = filters.status === 'All' || itemStatus === filters.status;

        // 4. Bộ lọc tháng
        const itemMonth = item.date ? item.date.slice(0, 7) : item.created_at?.slice(0, 7);
        const matchMonth = !month || itemMonth === month;

        return matchSearch && matchMethod && matchStatus && matchMonth;
      })
      .sort((a, b) => {
        const dA = a.date || a.created_at || '';
        const dB = b.date || b.created_at || '';
        return sort === 'desc' ? dB.localeCompare(dA) : dA.localeCompare(dB);
      });
  }, [advances, search, filters, month, sort]);

  const openClear = (adv) => {
    setSelected(adv);
    setActualDisplay(fmtAmt(String(adv.amount || '')));
    setNote(''); 
    setError(''); 
    setResult(null); 
    setModal(true);
  };

  const handleClear = async (e) => {
    e.preventDefault();
    const actual = parseAmt(actualDisplay);
    if (!actual) { setError('Nhập số tiền chi thực tế hợp lệ'); return; }

    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/api/finance/advance/clear`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advance_id: selected.id, actual_amount: actual, note })
      });
      if (res.ok) {
        const d = await res.json();
        setResult(d);
        addToast('Đã quyết toán thành công!', 'success');
        load();
      } else {
        const err = await res.json();
        setError(err.detail || 'Lỗi server');
      }
    } catch { setError('Lỗi kết nối'); }
    finally { setSubmitting(false); }
  };

  const cols = [
    ...CF_COLS.slice(0, 5),
    { 
      key: 'amount', label: 'Tạm ứng', width: 130, align: 'right', 
      render: (v, row) => <span style={{ fontFamily: 'var(--font-mono)', color: '#ef4444', fontWeight: 700 }}>−{fmt(v || row.amount)}</span> 
    },
    { 
      key: '_action', label: 'Xử lý', width: 130, align: 'center', 
      render: (_, row) => {
        if (row.status === 'Từ chối') {
          return (
            <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, background: '#fee2e2', color: '#b91c1c', fontWeight: 700, border: '1px solid #fecaca', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>
              Từ chối
            </span>
          );
        }
        if (row.status === 'Đã hủy') {
          return (
            <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#64748b', fontWeight: 700, border: '1px solid #e2e8f0', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>
              Đã hủy
            </span>
          );
        }
        if (row.status === 'Chờ duyệt' || row.status === 'pending') {
          return (
            <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#b45309', fontWeight: 700, border: '1px solid #fde68a', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>
              Chờ duyệt
            </span>
          );
        }
        if (row.status === 'Đã duyệt' || row.status === 'approved') {
          return (
            <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.15)', color: '#065f46', fontWeight: 700, border: '1px solid rgba(16, 185, 129, 0.25)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>
              Đã duyệt
            </span>
          );
        }
        return (
          <button 
            type="button"
            className="btn btn-secondary" 
            style={{ height: 30, fontSize: '0.78rem', padding: '0 12px', fontWeight: 600 }} 
            onClick={() => openClear(row)}
            title="Kế toán đối soát hóa đơn thực tế và quyết toán hoàn ứng"
          >
            Quyết toán
          </button>
        );
      } 
    }
  ];

  return (
    <div>
      <FinanceScreenHeader 
        title="Quyết Toán Hoàn Ứng" 
        subtitle="Đối chiếu hóa đơn thực tế vs tạm ứng — Hệ thống tự tạo phiếu bù"
        onRefresh={load}
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm số phiếu, đối tác, dự án..."
        filters={[
          { key: 'payment_method', label: 'Hình thức', type: 'select', width: 175, options: [{ value: 'All', label: 'Tất cả hình thức' }, { value: 'Tiền mặt', label: 'Tiền mặt' }, { value: 'Chuyển khoản', label: 'Chuyển khoản' }] },
          { key: 'status', label: 'Trạng thái', type: 'select', width: 180, options: [
            { value: 'All', label: 'Tất cả trạng thái' },
            { value: 'Hoàn thành', label: 'Hoàn thành' },
            { value: 'Chờ duyệt', label: 'Chờ duyệt' },
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

      <DataTable columns={cols} data={sortedFiltered} loading={loading} rowKey="id" emptyText="Chưa có phiếu tạm ứng cần quyết toán" pageSize={15} />

      <Modal open={modal} onClose={() => setModal(false)} size="sm" title="Quyết Toán Tạm Ứng">
        {result ? (
          <div style={{ padding: '16px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: 12, display: 'flex', justifyContent: 'center' }}><CheckCircle2 size={36} color="#10b981" /></div>
            <div style={{ background: 'var(--bg-deep)', borderRadius: 10, padding: 16, fontFamily: 'var(--font-mono)', fontSize: '0.88rem' }}>
              <div>Tạm ứng ban đầu: <strong>{fmt(result.advance_amount)}</strong></div>
              <div>Thực chi: <strong>{fmt(result.actual_amount)}</strong></div>
              <div style={{ marginTop: 8, borderTop: '1px solid var(--border-default)', paddingTop: 8 }}>
                {result.difference > 0
                  ? <span style={{ color: '#10b981' }}>→ Hoàn lại: <strong>+{fmt(result.difference)}</strong> (phiếu Thu đã tự tạo)</span>
                  : result.difference < 0
                    ? <span style={{ color: '#ef4444' }}>→ Chi bù: <strong>−{fmt(Math.abs(result.difference))}</strong> (phiếu Chi đã tự tạo)</span>
                    : <span style={{ color: '#10b981' }}>→ Vừa đủ! Không cần phiếu bù.</span>
                }
              </div>
            </div>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={() => setModal(false)}>Đóng</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleClear} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {selected && (
              <div style={{
                background: 'var(--bg-secondary, #f8fafc)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: 10,
                padding: '12px 14px',
                fontSize: '0.88rem',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Mã phiếu:</span>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{selected.id}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Người nhận:</span>
                  <strong>{selected.partner || selected.payer_payee}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Số tiền đã ứng:</span>
                  <strong style={{ color: '#ef4444', fontFamily: 'var(--font-mono)' }}>{fmt(selected.amount)}</strong>
                </div>
              </div>
            )}

            <FormRow
              label="Chi thực tế theo hóa đơn"
              required
              error={error}
              hint={actualDisplay ? spellVietnameseCurrency(parseAmt(actualDisplay)) : ''}
            >
              <input
                className="form-control"
                value={actualDisplay}
                onChange={e => setActualDisplay(fmtAmt(e.target.value))}
                placeholder="Nhập số tiền thực tế..."
                autoFocus
              />
            </FormRow>

            <FormRow label="Ghi chú đối soát">
              <input
                className="form-control"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="VD: Hóa đơn xăng xe, phí công chứng..."
              />
            </FormRow>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Hủy</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Đang xử lý...' : 'Xác Nhận Quyết Toán'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
