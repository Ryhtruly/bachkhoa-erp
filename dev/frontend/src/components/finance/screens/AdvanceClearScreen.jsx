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


export default function AdvanceClearScreen({ month: propMonth, setMonth: propSetMonth }) {
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [actualDisplay, setActualDisplay] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useToast();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ payment_method: 'All', trang_thai: 'All' }); // Khởi tạo All để bộ lọc chuẩn
  const [localMonth, setLocalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const month = propMonth !== undefined ? propMonth : localMonth;
  const setMonth = propSetMonth !== undefined ? propSetMonth : setLocalMonth;
  const [sort, setSort] = useState('desc');

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/finance/advance`);
    setAdvances(await r.json());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // 🔥 LOGIC SỬA LỖI: Định nghĩa sortedFiltered để lọc dữ liệu thực tế
  const sortedFiltered = useMemo(() => {
    if (!advances || !Array.isArray(advances)) return [];

    return advances
      .filter(item => {
        // 1. Bộ lọc ô tìm kiếm (Mã phiếu, đối tác, diễn giải)
        const matchSearch = search.trim() === '' ||
          item.id?.toLowerCase().includes(search.toLowerCase()) ||
          item.payer_payee?.toLowerCase().includes(search.toLowerCase()) ||
          item['Đối tác']?.toLowerCase().includes(search.toLowerCase()) ||
          item.dien_giai?.toLowerCase().includes(search.toLowerCase());

        // 2. Bộ lọc hình thức thanh toán
        const matchMethod = filters.payment_method === 'All' || item.payment_method === filters.payment_method || item.hinh_thuc === filters.payment_method;

        // 3. Bộ lọc trạng thái phiếu
        const matchStatus = filters.trang_thai === 'All' || item.trang_thai === filters.trang_thai;

        // 4. Bộ lọc tháng (nếu database của bạn có trường ngay/created_at)
        const itemMonth = item.ngay ? item.ngay.slice(0, 7) : item.created_at?.slice(0, 7);
        const matchMonth = !month || itemMonth === month;

        return matchSearch && matchMethod && matchStatus && matchMonth;
      })
      .sort((a, b) => {
        // Sắp xếp theo ngày
        const dateA = new Date(a.ngay || a.created_at || 0);
        const dateB = new Date(b.ngay || b.created_at || 0);
        return sort === 'desc' ? dateB - dateA : dateA - dateB;
      });
  }, [advances, search, filters, month, sort]);

  const openClear = (row) => { setSelected(row); setActualDisplay(''); setNote(''); setResult(null); setError(''); setModal(true); };

  const handleClear = async (e) => {
    e.preventDefault();
    const actual = parseAmt(actualDisplay);
    if (!actual) { setError('Nhập số tiền thực chi'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/api/finance/advance/clear`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advance_id: selected.id, actual_amount: actual, note })
      });
      if (res.ok) {
        const d = await res.json();
        setResult(d);
        addToast(' Quyết toán thành công — phiếu bù đã tạo tự động', 'success');
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
    { key: 'amount', label: 'Tạm ứng', width: 130, align: 'right', render: (v, row) => <span style={{ fontFamily: 'var(--font-mono)', color: '#ef4444', fontWeight: 700 }}>−{fmt(v || row.so_tien)}</span> },
    { key: '_action', label: '', width: 120, render: (_, row) => <button className="btn btn-secondary" style={{ height: 30, fontSize: '0.78rem', padding: '0 12px' }} onClick={() => openClear(row)}>Quyết toán</button> }
  ];

  return (
    <div>
      <FinanceScreenHeader 
        title=" Quyết Toán Hoàn Ứng" 
        subtitle="Đối chiếu hóa đơn thực tế vs tạm ứng — Hệ thống tự tạo phiếu bù"
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm số phiếu, đối tác, dự án..."
        filters={[
          { key: 'payment_method', label: 'Hình thức', type: 'select', width: 160, options: [{ value: 'All', label: 'Tất cả hình thức' }, { value: 'Tiền mặt', label: 'Tiền mặt' }, { value: 'Chuyển khoản', label: 'Chuyển khoản' }] },
          { key: 'trang_thai', label: 'Trạng thái', type: 'select', width: 140, options: [{ value: 'All', label: 'Tất cả trạng thái' }, { value: 'Hoàn thành', label: 'Hoàn thành' }, { value: 'Chờ duyệt', label: 'Chờ duyệt' }] }
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

      {/* 🔥 ĐÃ ĐỔI: Truyền dữ liệu đã lọc sạch (sortedFiltered) vào DataTable thay vì mảng thô (advances) */}
      <DataTable columns={cols} data={sortedFiltered} loading={loading} rowKey="id" emptyText="Chưa có phiếu tạm ứng cần quyết toán" pageSize={15} />

      <Modal open={modal} onClose={() => setModal(false)} size="sm" title="🔄 Quyết Toán Tạm Ứng">
        {result ? (
          <div style={{ padding: '16px 0' }}>
            <div style={{ textAlign: 'center', fontSize: '2rem', marginBottom: 12 }}>✅</div>
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
              <button className="btn btn-primary" onClick={() => setModal(false)}>Đóng</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleClear}>
            <div style={{ background: 'var(--bg-deep)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem' }}>
              <div style={{ fontWeight: 600 }}>Phiếu: {selected?.id}</div>
              <div>Đối tác: {selected?.['Đối tác'] || selected?.payer_payee}</div>
              <div>Tạm ứng: <strong style={{ color: '#ef4444' }}>−{fmt(selected?.amount || selected?.so_tien)}</strong></div>
            </div>
            <FormGrid cols={1}>
              <FormRow label="Số tiền thực chi (từ hóa đơn)" required>
                <input required className="form-control" value={actualDisplay} onChange={e => setActualDisplay(fmtAmt(e.target.value))}
                  type="text" inputMode="numeric" placeholder="0₫"
                  style={{ fontWeight: 700, fontSize: '1.1rem', textAlign: 'right' }} />
              </FormRow>
              <FormRow label="Ghi chú quyết toán">
                <input className="form-control" value={note} onChange={e => setNote(e.target.value)} placeholder="VD: 23 bao xi măng + 5 thanh sắt..." />
              </FormRow>
            </FormGrid>
            {error && <div style={{ marginTop: 10, color: '#ef4444', fontSize: '0.88rem' }}>⚠️ {error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Hủy</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? '⏳...' : 'Xác nhận Quyết Toán'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
