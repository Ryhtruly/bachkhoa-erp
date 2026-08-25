import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Lock, CheckCircle2, Printer } from 'lucide-react';
import { Badge, DataTable, DatePicker, SensitiveActionModal } from '../../ui';
import { fmt } from '../utils';
import { API } from '../financeConstants';
import { useToast } from '../../../contexts/ToastContext';
import { apiFetch } from '../../../lib/api';
import FinancePrintReport from '../print/FinancePrintReport';
import { printElement } from '../print/printDocument';
import financeReportPrintStyles from '../print/financeReport.print.css?inline';

export default function PayrollOfficeScreen({ isDirector = false, user }) {
  const printDocumentRef = useRef(null);
  const [data, setData] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [sensitiveModal, setSensitiveModal] = useState(null); // null | 'lock' | 'pay'
  const [submitting, setSubmitting] = useState(false);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (month) p.set('month', month);
      const [resData, resPeriods] = await Promise.all([
        apiFetch(`${API}/api/finance/payroll?${p}`).catch(() => []),
        apiFetch(`${API}/api/finance/payroll/periods`).catch(() => [])
      ]);
      setData(Array.isArray(resData) ? resData : []);
      setPeriods(Array.isArray(resPeriods) ? resPeriods : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const currentPeriod = periods.find(p => p.period_month?.startsWith(month));
  const isLocked = (currentPeriod?.status || '').toLowerCase() === 'locked';
  const isPaid = (currentPeriod?.status || '').toLowerCase() === 'paid';

  const handleLockPayroll = async () => {
    setSubmitting(true);
    try {
      const targetId = currentPeriod?.id || month;
      await apiFetch(`${API}/api/finance/payroll/periods/${targetId}/lock`, { method: 'POST' });
      addToast(`Giám đốc đã chốt bảng lương tháng ${month}!`, 'success');
      setSensitiveModal(null);
      await load();
    } catch (err) {
      addToast(err.message || 'Lỗi chốt bảng lương', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayPayroll = async () => {
    const targetId = currentPeriod?.id || month;
    setSubmitting(true);
    try {
      await apiFetch(`${API}/api/finance/payroll/periods/${targetId}/mark-paid`, { method: 'POST' });
      addToast(`Đã đánh dấu chi trả bảng lương tháng ${month}!`, 'success');
      setSensitiveModal(null);
      await load();
    } catch (err) {
      addToast(err.message || 'Lỗi cập nhật chi trả', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const totalBaseSalary = data.reduce((s, r) => s + (Number(r.base_salary) || 0), 0);
  const totalBonus = data.reduce((s, r) => s + (Number(r.bonus) || 0), 0);
  const totalSalesCommission = data.reduce((s, r) => s + (Number(r.sales_commission) || 0), 0);
  const totalPayroll = data.reduce((s, r) => s + (Number(r.total_salary) || 0), 0);

  const [periodYear, periodMonth] = (month || '').split('-');
  const payrollMonthLabel = periodYear && periodMonth
    ? `Tháng ${Number(periodMonth)}/${periodYear}`
    : month;
  const payrollStatusLabel = isPaid ? 'Đã chi trả' : isLocked ? 'Đã chốt' : 'Đang mở';

  const printColumns = [
    { key: 'index', label: 'STT', width: '38px', align: 'center', nowrap: true, render: (_, __, index) => index + 1 },
    { key: 'full_name', label: 'Họ và tên nhân sự', width: '160px', align: 'left', render: value => value || 'Chưa cập nhật' },
    { key: 'department', label: 'Phòng ban', width: '120px', align: 'left', render: value => value || 'Công ty' },
    { key: 'job_title', label: 'Chức danh / Vị trí', width: '130px', align: 'left', render: value => value || 'Nhân viên' },
    { key: 'base_salary', label: 'Lương CB (VNĐ)', width: '105px', align: 'right', nowrap: true, render: value => fmt(value || 0) },
    { key: 'bonus', label: 'KPI & Thưởng (VNĐ)', width: '110px', align: 'right', nowrap: true, render: value => fmt(value || 0) },
    { key: 'sales_commission', label: 'Hoa hồng BĐS (VNĐ)', width: '110px', align: 'right', nowrap: true, render: value => fmt(value || 0) },
    { key: 'total_salary', label: 'Thực nhận (VNĐ)', width: '115px', align: 'right', nowrap: true, render: value => <strong>{fmt(value || 0)}</strong> },
  ];

  const printFooterRow = {
    index: '',
    full_name: 'Tổng cộng',
    department: '',
    job_title: '',
    base_salary: fmt(totalBaseSalary),
    bonus: fmt(totalBonus),
    sales_commission: fmt(totalSalesCommission),
    total_salary: fmt(totalPayroll),
  };

  const handlePrintPayroll = () => {
    printElement({
      element: printDocumentRef.current,
      title: `Bảng lương văn phòng - ${payrollMonthLabel}`,
      styles: financeReportPrintStyles,
      onError: message => addToast(message, 'error'),
    });
  };

  const cols = [
    { key: 'full_name', label: 'Nhân sự', width: 180, render: (v, row) => (
      <div>
        <strong style={{ display: 'block', color: 'var(--text-primary)' }}>{v}</strong>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{row.job_title || row.department || 'Nhân viên'}</span>
      </div>
    )},
    { key: 'department', label: 'Phòng ban', width: 140, render: v => <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{v || 'Công ty'}</span> },
    { key: 'base_salary', label: 'Lương cơ bản', width: 130, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(v || 0)}</span> },
    { key: 'bonus', label: 'KPI & thưởng', width: 130, align: 'right', render: (v) => <span style={{ fontFamily: 'var(--font-mono)', color: v > 0 ? '#10b981' : 'inherit' }}>{v > 0 ? `+${fmt(v)}` : '0₫'}</span> },
    { key: 'sales_commission', label: 'Hoa hồng BĐS', width: 140, align: 'right', render: (v) => <span style={{ fontFamily: 'var(--font-mono)', color: v > 0 ? '#3b82f6' : 'inherit' }}>{v > 0 ? `+${fmt(v)}` : '0₫'}</span> },
    { key: 'total_salary', label: 'Tổng nhận', width: 150, align: 'right', render: (v) => <strong style={{ fontFamily: 'var(--font-mono)', color: '#ef4444', fontSize: '0.95rem' }}>{fmt(v || 0)}</strong> },
  ];

  return (
    <div className="card card--workspace payroll-ledger">
      <div className="payroll-ledger__header">
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <Users size={20} color="var(--orange-500)" /> Lương VP & hoa hồng Sales
          </h3>
          <div className="sub" style={{ marginTop: 4 }}>
            Lương cơ bản + KPI + Hoa hồng BĐS theo tháng.
          </div>
        </div>

        <div className="payroll-ledger__actions">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <DatePicker
              selectionMode="month"
              value={month}
              onChange={setMonth}
              placeholder="Chọn tháng"
              dialogLabel="Chọn tháng bảng lương văn phòng"
              clearable={false}
            />
          </div>

          <Badge variant={isPaid ? 'success' : isLocked ? 'warning' : 'neutral'} dot>
            Kỳ lương: {isPaid ? 'Đã chi trả' : isLocked ? 'Đã chốt sổ' : 'Đang mở · Chưa chốt'}
          </Badge>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handlePrintPayroll}
            disabled={loading || data.length === 0}
          >
            <Printer size={15} /> In bảng lương
          </button>

          {isDirector && isLocked && !isPaid && (
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={() => setSensitiveModal('pay')}
            >
              <CheckCircle2 size={15} /> Xác nhận đã chi trả
            </button>
          )}

          {isDirector && !isLocked && !isPaid && (
            <button
              type="button"
              className="btn btn-warning btn-sm"
              onClick={() => setSensitiveModal('lock')}
            >
              <Lock size={15} /> Chốt sổ lương (Giám đốc)
            </button>
          )}
        </div>
      </div>

      {!isPaid && (
        <div style={{
          fontSize: '0.8rem',
          color: isLocked ? 'var(--green-600, #16a34a)' : 'var(--amber-600, #d97706)',
          background: isLocked ? 'rgba(22, 163, 74, 0.08)' : 'rgba(245, 158, 11, 0.08)',
          border: `1px solid ${isLocked ? 'rgba(22, 163, 74, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
          borderRadius: 8,
          padding: '8px 14px',
          margin: '0 0 14px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span style={{ fontSize: '1rem' }}>{isLocked ? '🔒' : '💡'}</span>
          <span>
            {isLocked ? (
              <><strong>Bảng lương đã chốt sổ:</strong> Số liệu thu nhập đã được đóng băng cố định. Giám đốc bấm <em>"Xác nhận đã chi trả"</em> khi hoàn tất chuyển khoản lương cho nhân sự.</>
            ) : (
              <><strong>Kỳ lương đang mở (Tạm tính):</strong> Bảng lương hiển thị số liệu ước tính. Giám đốc bấm <em>"Chốt sổ lương"</em> để khóa số liệu trước khi giải ngân.</>
            )}
          </span>
        </div>
      )}

      <div className="payroll-summary-grid">
        <div className="payroll-summary-card payroll-summary-card--primary">
          <span>Tổng thực chi lương</span>
          <strong>{fmt(totalPayroll)}</strong>
          <small>{data.length} nhân sự phát sinh trong kỳ</small>
        </div>
        <div className="payroll-summary-card payroll-summary-card--neutral">
          <span>Tổng lương cơ bản</span>
          <strong>{fmt(totalBaseSalary)}</strong>
          <small>Lương hợp đồng cố định</small>
        </div>
        <div className="payroll-summary-card payroll-summary-card--success">
          <span>KPI & Thưởng</span>
          <strong>{fmt(totalBonus)}</strong>
          <small>Thưởng hiệu suất làm việc</small>
        </div>
        <div className="payroll-summary-card payroll-summary-card--warning">
          <span>Hoa hồng BĐS</span>
          <strong>{fmt(totalSalesCommission)}</strong>
          <small>Hoa hồng kinh doanh dự án</small>
        </div>
      </div>

      <div className="responsive-table-shell payroll-office__table">
        <p className="responsive-table-hint" role="note">
          Vuốt ngang để xem đầy đủ các khoản lương trên màn hình hẹp.
        </p>
        <DataTable
          columns={cols}
          data={data}
          loading={loading}
          rowKey="id"
          emptyText={`Chưa có dữ liệu nhân sự cho tháng ${month}.`}
          pageSize={10}
          compact
        />
      </div>

      <div aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        <FinancePrintReport
          documentRef={printDocumentRef}
          title={(
            <span className="payroll-print-title">
              <span className="payroll-print-title__main">Bảng lương văn phòng</span>
              <span className="payroll-print-title__secondary">Và hoa hồng Sales</span>
            </span>
          )}
          subtitle={`Kỳ trả lương: ${payrollMonthLabel} · Trạng thái: ${payrollStatusLabel}`}
          summary={[
            { label: 'Số nhân sự', value: `${data.length} người` },
            { label: 'Tổng lương CB', value: fmt(totalBaseSalary) },
            { label: 'Tổng thưởng KPI', value: fmt(totalBonus) },
            { label: 'Tổng chi trả', value: fmt(totalPayroll) },
          ]}
          columns={printColumns}
          rows={data}
          footerRow={printFooterRow}
          signers={[
            { role: 'Người lập biểu', name: user?.full_name || user?.username || '', note: '(Ký, họ tên)' },
            { role: 'Kế toán trưởng', note: '(Ký, họ tên)' },
            { role: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' },
          ]}
          emptyText="Không có nhân sự phát sinh lương trong kỳ"
        />
      </div>

      <SensitiveActionModal
        open={!!sensitiveModal}
        onClose={() => setSensitiveModal(null)}
        onConfirm={sensitiveModal === 'lock' ? handleLockPayroll : handlePayPayroll}
        title={sensitiveModal === 'lock' ? `Xác nhận chốt bảng lương tháng ${month}` : `Xác nhận đã chi trả lương tháng ${month}`}
        description={sensitiveModal === 'lock' ? 'Sau khi chốt sổ, các chính sách lương và hoa hồng trong tháng sẽ được khóa cố định để kế toán thực hiện chi trả.' : 'Hành động này xác nhận doanh nghiệp đã hoàn tất chuyển tiền/thanh toán lương cho toàn bộ CBNV trong tháng.'}
        requireReason={false}
        actionLabel={sensitiveModal === 'lock' ? 'Chốt sổ lương' : 'Đánh dấu đã trả'}
        isLoading={submitting}
      />
    </div>
  );
}
