import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DataTable, Badge, StatusBadge, SensitiveActionModal, FilterBar } from '../../ui';
import { fmt } from '../utils';
import { FinanceScreenHeader, SummaryStrip } from '../SharedFinanceUI';
import { API } from '../financeConstants';
import { DollarSign, ArrowRightLeft, Printer, AlertTriangle, AlertCircle, FileText, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import FinancePrintReport from '../print/FinancePrintReport';
import { printElement } from '../print/printDocument';
import financeReportPrintStyles from '../print/financeReport.print.css?inline';

export default function ReceivablesScreen() {
  const printDocumentRef = useRef(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refundModal, setRefundModal] = useState(null); // row to refund
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    status: 'All',
    aging: 'All',
    amount_range: 'All'
  });
  const [month, setMonth] = useState('');
  const [sort, setSort] = useState('due_asc');
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`${API}/api/finance/receivables`);
      setData(Array.isArray(d) ? d : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const calculateAging = (dueDateStr, remaining) => {
    if (remaining <= 0) return 'settled';
    if (!dueDateStr) return 'in_term';
    const due = new Date(dueDateStr);
    const now = new Date();
    due.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'in_term';
    if (diffDays <= 30) return 'overdue_30';
    if (diffDays <= 60) return 'overdue_60';
    if (diffDays <= 90) return 'overdue_90';
    return 'overdue_plus';
  };

  const filteredData = useMemo(() => {
    return data.filter(r => {
      // 1. Tìm kiếm theo Mã HĐ hoặc Tên khách hàng
      const q = search.trim().toLowerCase();
      const matchSearch = !q ||
        (r.contract_id || '').toLowerCase().includes(q) ||
        (r.customer_name || r.customer || '').toLowerCase().includes(q);
      if (!matchSearch) return false;

      // 2. Lọc theo trạng thái công nợ
      if (filters.status !== 'All') {
        const itemStatus = r.is_overpaid ? 'Nộp thừa' :
          r.status === 'written_off' ? 'Đã miễn giảm/xóa' :
          r.status === 'refunded' ? 'Đã hoàn tiền' :
          r.status === 'settled' ? 'Đã thanh toán' :
          r.overdue ? 'Quá hạn' :
          r.paid_amount > 0 ? 'Thu một phần' : 'Chưa thu';
        if (itemStatus !== filters.status) return false;
      }

      // 3. Lọc theo nhóm tuổi nợ (Aging)
      if (filters.aging !== 'All') {
        const agingGroup = calculateAging(r.due_date, r.remaining_amount || 0);
        if (agingGroup !== filters.aging) return false;
      }

      // 4. Lọc theo hạn mức còn phải thu
      if (filters.amount_range !== 'All') {
        const rem = r.remaining_amount || 0;
        if (filters.amount_range === 'under_10m' && rem >= 10000000) return false;
        if (filters.amount_range === '10m_50m' && (rem < 10000000 || rem > 50000000)) return false;
        if (filters.amount_range === '50m_100m' && (rem < 50000000 || rem > 100000000)) return false;
        if (filters.amount_range === 'over_100m' && rem <= 100000000) return false;
      }

      // 5. Lọc theo tháng đến hạn
      if (month) {
        const dStr = r.due_date || '';
        if (!dStr.startsWith(month)) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sort === 'due_asc') {
        return (a.due_date || '9999').localeCompare(b.due_date || '9999');
      }
      if (sort === 'due_desc') {
        return (b.due_date || '').localeCompare(a.due_date || '');
      }
      if (sort === 'debt_desc') {
        return (b.remaining_amount || 0) - (a.remaining_amount || 0);
      }
      if (sort === 'debt_asc') {
        return (a.remaining_amount || 0) - (b.remaining_amount || 0);
      }
      if (sort === 'value_desc') {
        return (b.total_value || 0) - (a.total_value || 0);
      }
      if (sort === 'contract_asc') {
        return (a.contract_id || '').localeCompare(b.contract_id || '');
      }
      return 0;
    });
  }, [data, search, filters, month, sort]);

  const handleRefundExcess = async (reason) => {
    if (!refundModal?.contract_id) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`${API}/api/finance/contracts/${encodeURIComponent(refundModal.contract_id)}/refund-excess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: refundModal.excess_amount,
          reason: reason || `Chi hoàn trả tiền nộp thừa cho HĐ ${refundModal.contract_id}`
        })
      });
      addToast(res.message || `Đã tạo phiếu chi hoàn tiền thừa ${fmt(refundModal.excess_amount)} (Chờ Giám đốc duyệt)`, 'success');
      setRefundModal(null);
      await load();
    } catch (err) {
      addToast(err.message || 'Lỗi lập phiếu hoàn tiền', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const overdueCount = data.filter(r => r.overdue).length;
  const overpaidCount = data.filter(r => r.is_overpaid || r.status === 'overpaid').length;
  const totalRemaining = data.reduce((s, r) => s + (r.remaining_amount || 0), 0);
  const totalExcess = data.reduce((s, r) => s + (r.excess_amount || 0), 0);
  const totalValueSum = data.reduce((s, r) => s + (r.total_value || 0), 0);
  const totalPaidSum = data.reduce((s, r) => s + (r.paid_amount || 0), 0);

  const printColumns = [
    { key: 'index', label: 'STT', width: '38px', align: 'center', nowrap: true, render: (_, __, index) => index + 1 },
    { key: 'contract_id', label: 'Mã hợp đồng', width: '120px', align: 'center', nowrap: true, render: v => <strong>{v}</strong> },
    { key: 'customer_name', label: 'Khách hàng / Đối tác', align: 'left', render: (value, row) => value || row.customer || '—' },
    { key: 'total_value', label: 'Giá trị HĐ (VNĐ)', width: '115px', align: 'right', nowrap: true, render: value => fmt(value) },
    { key: 'paid_amount', label: 'Đã thu (VNĐ)', width: '115px', align: 'right', nowrap: true, render: value => fmt(value) },
    { key: 'remaining_amount', label: 'Còn phải thu (VNĐ)', width: '120px', align: 'right', nowrap: true, render: (value, row) => row.is_overpaid ? '0₫' : fmt(value) },
    { key: 'excess_amount', label: 'Nộp thừa (VNĐ)', width: '110px', align: 'right', nowrap: true, render: value => value > 0 ? fmt(value) : '—' },
    { key: 'due_date', label: 'Hạn thu', width: '85px', align: 'center', nowrap: true },
    { key: 'status', label: 'Trạng thái', width: '105px', align: 'center', nowrap: true, render: (_, row) => (
      row.is_overpaid ? 'Nộp thừa' :
      row.status === 'written_off' ? 'Đã miễn giảm/xóa' :
      row.status === 'refunded' ? 'Đã hoàn tiền' :
      row.status === 'settled' ? 'Đã thanh toán' :
      row.overdue ? 'Quá hạn' :
      row.paid_amount > 0 ? 'Thu một phần' : 'Chưa thu'
    ) },
  ];

  const footerRow = {
    index: '',
    contract_id: '',
    customer_name: 'TỔNG CỘNG',
    total_value: fmt(totalValueSum),
    paid_amount: fmt(totalPaidSum),
    remaining_amount: fmt(totalRemaining),
    excess_amount: totalExcess > 0 ? fmt(totalExcess) : '—',
    due_date: '',
    status: ''
  };

  const handlePrintReport = () => {
    printElement({
      element: printDocumentRef.current,
      title: 'Sổ Công Nợ Phải Thu',
      styles: financeReportPrintStyles,
      onError: message => addToast(message, 'error'),
    });
  };

  const cols = [
    { key: 'contract_id', label: 'Mã HĐ', width: 130, render: v => <strong style={{ fontFamily: 'var(--font-mono)' }}>{v}</strong> },
    { key: 'customer_name', label: 'Khách hàng', width: 160, render: (v, row) => <span>{v || row.customer || '—'}</span> },
    { key: 'total_value', label: 'Giá trị HĐ', width: 130, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(v)}</span> },
    { key: 'paid_amount', label: 'Đã thu', width: 130, align: 'right', render: (v, row) => (
      <div>
        <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600 }}>+{fmt(v)}</span>
        {row.excess_amount > 0 && (
          <div style={{ fontSize: '0.72rem', color: '#9333ea', fontWeight: 700 }}>Thừa +{fmt(row.excess_amount)}</div>
        )}
      </div>
    )},
    { key: 'remaining_amount', label: 'Còn nợ', width: 130, align: 'right', render: (v, row) => (
      <span style={{ fontFamily: 'var(--font-mono)', color: row.is_overpaid ? '#9333ea' : v > 0 ? '#ef4444' : 'var(--text-tertiary)', fontWeight: 700 }}>
        {row.is_overpaid ? `Nộp thừa` : (v > 0 ? fmt(v) : '✓ Xong')}
      </span>
    )},
    { key: 'due_date', label: 'Hạn thu & Tuổi nợ', width: 145, render: (v, row) => {
      const aging = calculateAging(v, row.remaining_amount || 0);
      const agingLabels = {
        settled: { label: 'Đã tất toán', bg: '#f1f5f9', color: '#64748b' },
        in_term: { label: 'Trong hạn', bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
        overdue_30: { label: 'Quá hạn ≤ 30 ngày', bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
        overdue_60: { label: 'Quá hạn 31-60 ngày', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
        overdue_90: { label: 'Quá hạn 61-90 ngày', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
        overdue_plus: { label: 'Nợ xấu > 90 ngày', bg: '#fdf2f8', color: '#be123c', border: '#fbcfe8' }
      };
      const badgeInfo = agingLabels[aging] || agingLabels.in_term;
      const formattedDate = v ? (v.includes('-') ? v.split('-').reverse().join('/') : v) : '—';

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', fontWeight: 600 }}>{formattedDate}</span>
          {row.remaining_amount > 0 && !row.is_overpaid && (
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 4,
              width: 'fit-content',
              background: badgeInfo.bg,
              color: badgeInfo.color,
              border: `1px solid ${badgeInfo.border || 'transparent'}`
            }}>
              {badgeInfo.label}
            </span>
          )}
        </div>
      );
    }},
    { key: 'status', label: 'Trạng thái', width: 140, align: 'center', render: (v, row) => (
      <StatusBadge
        status={
          row.is_overpaid ? 'Nộp thừa' :
          row.status === 'written_off' ? 'Đã miễn giảm/xóa' :
          row.status === 'refunded' ? 'Đã hoàn tiền' :
          row.status === 'settled' ? 'Đã thanh toán' :
          row.overdue ? 'Quá hạn' :
          row.paid_amount > 0 ? 'Thu một phần' : 'Chưa thu'
        }
        domain="debt"
      />
    )},
    { key: 'actions', label: 'Xử lý', width: 140, align: 'center', render: (_, row) => {
      if (row.has_pending_refund) {
        return (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600,
              background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a'
            }}
            title={`Đã lập phiếu chi ${row.pending_refund_id} - Đang chờ Giám đốc duyệt`}
          >
            Chờ duyệt hoàn
          </span>
        );
      }
      if (row.is_overpaid || row.excess_amount > 0) {
        return (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ color: '#9333ea', borderColor: '#9333ea44', fontSize: '0.78rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => setRefundModal(row)}
            title="Lập phiếu chi hoàn lại tiền nộp thừa cho khách hàng"
          >
            <DollarSign size={13} /> Hoàn tiền
          </button>
        );
      }
      return null;
    }}
  ];

  return (
    <div>
      <FinanceScreenHeader 
        title="Công Nợ Phải Thu & Dư Nợ Khách Hàng"
        onRefresh={load}
        actions={
          <button className="btn btn-secondary no-print" onClick={handlePrintReport} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Printer size={15} /> In Sổ Công Nợ
          </button>
        }
        subtitle="Quản lý chi tiết dư nợ theo từng hợp đồng, theo dõi tuổi nợ và xử lý khoản nộp thừa"
      />

      {/* 4 Thẻ KPI Công nợ nhanh */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <div style={{ background: '#ffffff', borderRadius: 14, padding: '16px 18px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(79, 70, 229, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={20} color="#4f46e5" />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tổng Giá Trị HĐ</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', marginTop: 2 }}>{fmt(totalValueSum)}</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: 14, padding: '16px 18px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(16, 185, 129, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckCircle2 size={20} color="#10b981" />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Đã Thu Hồi</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', fontFamily: 'monospace', marginTop: 2 }}>{fmt(totalPaidSum)}</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: 14, padding: '16px 18px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(239, 68, 68, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={20} color="#ef4444" />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Còn Phải Thu {overdueCount > 0 && <span style={{ color: '#ef4444', fontWeight: 800 }}>({overdueCount} quá hạn)</span>}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444', fontFamily: 'monospace', marginTop: 2 }}>{fmt(totalRemaining)}</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: 14, padding: '16px 18px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(147, 51, 234, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <RotateCcw size={20} color="#9333ea" />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Nộp Thừa / Hoàn {overpaidCount > 0 && <span style={{ color: '#9333ea', fontWeight: 800 }}>({overpaidCount} HĐ)</span>}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#9333ea', fontFamily: 'monospace', marginTop: 2 }}>{fmt(totalExcess)}</div>
          </div>
        </div>
      </div>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm mã hợp đồng, khách hàng..."
        filters={[
          {
            key: 'status',
            label: 'Trạng thái',
            type: 'select',
            width: 180,
            options: [
              { value: 'All', label: 'Tất cả trạng thái' },
              { value: 'Quá hạn', label: 'Quá hạn' },
              { value: 'Thu một phần', label: 'Thu một phần' },
              { value: 'Chưa thu', label: 'Chưa thu' },
              { value: 'Đã thanh toán', label: 'Đã thanh toán' },
              { value: 'Nộp thừa', label: 'Nộp thừa' },
              { value: 'Đã miễn giảm/xóa', label: 'Đã miễn giảm/xóa' },
              { value: 'Đã hoàn tiền', label: 'Đã hoàn tiền' }
            ]
          },
          {
            key: 'aging',
            label: 'Tuổi nợ',
            type: 'select',
            width: 185,
            options: [
              { value: 'All', label: 'Tất cả tuổi nợ' },
              { value: 'in_term', label: 'Trong hạn' },
              { value: 'overdue_30', label: 'Quá hạn < 30 ngày' },
              { value: 'overdue_60', label: 'Quá hạn 30 - 60 ngày' },
              { value: 'overdue_90', label: 'Quá hạn 60 - 90 ngày' },
              { value: 'overdue_plus', label: 'Quá hạn > 90 ngày' }
            ]
          },
          {
            key: 'amount_range',
            label: 'Hạn mức nợ',
            type: 'select',
            width: 180,
            options: [
              { value: 'All', label: 'Tất cả hạn mức' },
              { value: 'under_10m', label: 'Dưới 10 triệu' },
              { value: '10m_50m', label: 'Từ 10 - 50 triệu' },
              { value: '50m_100m', label: 'Từ 50 - 100 triệu' },
              { value: 'over_100m', label: 'Trên 100 triệu' }
            ]
          }
        ]}
        values={filters}
        onFilterChange={(k, v) => setFilters(prev => ({ ...prev, [k]: v }))}
        onReset={() => {
          setSearch('');
          setFilters({ status: 'All', aging: 'All', amount_range: 'All' });
          setMonth('');
          setSort('due_asc');
        }}
        month={month}
        onMonthChange={setMonth}
        sort={sort}
        onSortChange={setSort}
        sortOptions={[
          { value: 'due_asc', label: 'Hạn thu gần nhất' },
          { value: 'due_desc', label: 'Hạn thu xa nhất' },
          { value: 'debt_desc', label: 'Còn nợ nhiều nhất' },
          { value: 'debt_asc', label: 'Còn nợ ít nhất' },
          { value: 'value_desc', label: 'Giá trị HĐ cao nhất' },
          { value: 'contract_asc', label: 'Mã HĐ A → Z' },
        ]}
      />

      {filteredData.length > 0 && (
        <SummaryStrip
          countText={`${filteredData.length} hợp đồng`}
          totalText="Tổng còn phải thu"
          totalAmount={filteredData.reduce((s, r) => s + (r.is_overpaid ? 0 : (r.remaining_amount || 0)), 0)}
        />
      )}

      <DataTable columns={cols} data={filteredData} loading={loading} rowKey="id"
        emptyText="Không tìm thấy công nợ phù hợp bộ lọc" pageSize={15}
        rowClassName={row => row.overdue ? 'row-overdue' : ''}
      />

      <div aria-hidden="true" style={{ position: 'fixed', left: '-100000px', top: 0, width: '277mm', pointerEvents: 'none' }}>
        <FinancePrintReport
          documentRef={printDocumentRef}
          title="Sổ Công Nợ Phải Thu"
          subtitle="Tổng hợp công nợ theo hợp đồng khách hàng"
          summary={[
            { label: 'Số hợp đồng', value: data.length.toLocaleString('vi-VN') },
            { label: 'Còn phải thu', value: fmt(totalRemaining) },
            { label: 'Nợ quá hạn', value: overdueCount.toLocaleString('vi-VN') },
            { label: 'Khách nộp thừa', value: fmt(totalExcess) },
          ]}
          columns={printColumns}
          rows={data}
          footerRow={footerRow}
          emptyText="Chưa có công nợ phải thu"
        />
      </div>

      {/* Modal Lập Phiếu Chi Hoàn Tiền Thừa */}
      <SensitiveActionModal
        isOpen={Boolean(refundModal)}
        onClose={() => setRefundModal(null)}
        onConfirm={handleRefundExcess}
        title={`Lập phiếu hoàn tiền thừa cho HĐ ${refundModal?.contract_id}`}
        description={
          <div>
            Khách hàng đã nộp thừa <strong style={{ color: '#9333ea' }}>{fmt(refundModal?.excess_amount)}</strong> so với giá trị hợp đồng ({fmt(refundModal?.total_value)}).
            Hệ thống sẽ tạo <strong>Phiếu Chi (PC)</strong> ở trạng thái <em>Chờ duyệt</em> để trình Giám đốc phê duyệt xuất quỹ.
          </div>
        }
        actionLabel="Lập Phiếu Chi Hoàn Tiền"
        actionVariant="purple"
        requireReason={true}
        placeholderReason="Nhập ghi chú / số tài khoản nhận tiền hoàn của khách..."
        isLoading={submitting}
      />
    </div>
  );
}
