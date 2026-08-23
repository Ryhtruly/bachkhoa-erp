import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle, Banknote, CheckCircle2, FileSpreadsheet,
  Printer, Loader2, Users
} from 'lucide-react';
import { Badge, ConfirmationModal, DataTable, DatePicker, FormRow, Modal, Select } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { fmt, formatDate } from '../utils';
import { API } from '../financeConstants';
import { apiFetch, downloadFile } from '../../../lib/api';
import { printElement } from '../print/printDocument';
import FinancePrintReport from '../print/FinancePrintReport';

const payrollPeriodLabels = {
  Open: 'Đang mở',
  Locked: 'Đã khóa',
  Paid: 'Đã thanh toán',
};
const adjustmentLabels = {
  bonus: 'Thưởng',
  BONUS: 'Thưởng (Ưu tiên / KPI)',
  penalty: 'Phạt / Khấu trừ',
  DEDUCTION: 'Khấu trừ / Phạt',
  allowance: 'Phụ cấp',
  ALLOWANCE: 'Phụ cấp',
  REIMBURSEMENT: 'Hoàn chi / Phụ cấp',
  referral_commission: 'Hoa hồng giới thiệu',
  holiday_bonus: 'Thưởng lễ/Tết',
};

export default function PieceRatePayrollScreen({ isDirector = false }) {
  const { addToast } = useToast();
  const [options, setOptions] = useState({
    departments: [],
    years: [new Date().getFullYear()],
  });
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [ledger, setLedger] = useState(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [closePayrollOpen, setClosePayrollOpen] = useState(false);

  // State Xuất Excel & In A4
  const [exportingPersonal, setExportingPersonal] = useState(false);
  const [exportingDept, setExportingDept] = useState(false);
  const [previewMode, setPreviewMode] = useState(null); // 'personal' | 'department' | null
  const printDocumentRef = useRef(null);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        setOptionsLoading(true);
        const payload = await apiFetch(`${API}/api/payroll/options`);
        const data = payload.data || {};
        const departments = data.departments || [];
        const preferredDepartment = (
          departments.find((department) => (
            department.code === 'SURVEY' && department.employees?.length
          ))
          || departments.find((department) => department.employees?.length)
        );
        setOptions({
          departments,
          years: data.years?.length ? data.years : [new Date().getFullYear()],
        });
        setYear(data.default_year || new Date().getFullYear());
        setMonth(data.default_month || new Date().getMonth() + 1);
        setDepartmentId(preferredDepartment?.id || '');
        setEmployeeId(preferredDepartment?.employees?.[0]?.id || '');
      } catch (error) {
        addToast(error.message || 'Không tải được bộ lọc lương', 'error');
      } finally {
        setOptionsLoading(false);
      }
    };
    loadOptions();
  }, [addToast]);

  const loadLedger = useCallback(async () => {
    if (!employeeId) {
      setLedger(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const params = new URLSearchParams({
        employee_id: employeeId,
        year: String(year),
        month: String(month),
      });
      const payload = await apiFetch(`${API}/api/payroll/employee-ledger?${params}`);
      setLedger(payload.data);
    } catch (error) {
      setLedger(null);
      addToast(error.message || 'Không tải được sổ lương nhân viên', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, employeeId, month, year]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const currentDepartment = options.departments.find((item) => item.id === departmentId);
  const employees = currentDepartment?.employees || [];

  const handleDepartmentChange = (nextDepartmentId) => {
    setDepartmentId(nextDepartmentId);
    const department = options.departments.find((item) => item.id === nextDepartmentId);
    setEmployeeId(department?.employees?.[0]?.id || '');
  };

  const summary = ledger?.summary || {};
  const summaryCards = [
    {
      label: 'Tổng thu nhập (Net)',
      value: summary.net_salary ?? 0,
      note: 'Sau khi tính phụ cấp, thưởng và phạt',
      tone: 'primary',
    },
    {
      label: 'Lương đã duyệt',
      value: summary.approved_salary ?? summary.recorded_total ?? 0,
      note: `${summary.approved_count ?? 0} nhiệm vụ đã ghi nhận`,
      tone: 'success',
    },
    {
      label: 'Chờ ghi nhận',
      value: summary.pending_record_total ?? 0,
      note: `${summary.pending_record_count ?? 0} nhiệm vụ hoàn thành chờ chốt`,
      tone: 'warning',
    },
    {
      label: 'Tạm tính (chưa xong)',
      value: summary.provisional_total ?? summary.estimated_total ?? 0,
      note: `${summary.provisional_count ?? 0} nhiệm vụ đang thực hiện`,
      tone: 'neutral',
    },
  ];

  const handleExportPersonalExcel = async () => {
    if (!employeeId) {
      addToast('Vui lòng chọn nhân viên trước khi xuất phiếu lương', 'warning');
      return;
    }
    setExportingPersonal(true);
    try {
      const filename = await downloadFile(
        `${API}/api/payroll/export/employee-ledger-excel?employee_id=${employeeId}&year=${year}&month=${month}`,
        `Phieu_Luong_${ledger?.employee?.full_name || 'NhanVien'}_${month}_${year}.xlsx`
      );
      if (filename) {
        addToast(`Đã xuất ${filename} thành công`, 'success');
      }
    } catch (err) {
      addToast(err.message || 'Xuất phiếu lương thất bại', 'error');
    } finally {
      setExportingPersonal(false);
    }
  };

  const handleExportDeptExcel = async () => {
    const deptId = departmentId || 'dept_general';
    setExportingDept(true);
    try {
      const filename = await downloadFile(
        `${API}/api/payroll/export/department-summary-excel?department_id=${deptId}&year=${year}&month=${month}`,
        `Bang_Luong_Tong_Hop_${currentDepartment?.name || 'PhongBan'}_${month}_${year}.xlsx`
      );
      if (filename) {
        addToast(`Đã xuất ${filename} thành công`, 'success');
      }
    } catch (err) {
      addToast(err.message || 'Xuất bảng lương tổng hợp thất bại', 'error');
    } finally {
      setExportingDept(false);
    }
  };

  const handlePrint = () => {
    if (!printDocumentRef.current) return;
    const title = previewMode === 'personal'
      ? `Phiếu Lương ${ledger?.employee?.full_name || ''} - Kỳ ${month}/${year}`
      : `Bảng Lương Tổng Hợp ${currentDepartment?.name || ''} - Kỳ ${month}/${year}`;
    printElement({
      element: printDocumentRef.current,
      title,
      onError: (msg) => addToast(msg, 'error')
    });
  };

  const handleClosePayroll = () => {
    if (Number(summary.pending_record_count || 0) <= 0) {
      addToast('Không có dòng lương nào cần chốt trong kỳ này.', 'info');
      return;
    }
    setClosePayrollOpen(true);
  };

  const handleConfirmClosePayroll = async () => {
    try {
      setClosing(true);
      const payload = await apiFetch(`${API}/api/payroll/close-employee-period`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          year,
          month,
        }),
      });
      const created = payload?.data?.approved_count || payload?.data?.created_count || 0;
      addToast(
        created > 0
          ? `Đã chốt ${created} dòng lương.`
          : 'Đã chốt sổ lương thành công!',
        'success'
      );
      setClosePayrollOpen(false);
      await loadLedger();
    } catch (error) {
      addToast(error.message || 'Không chốt được lương.', 'error');
    } finally {
      setClosing(false);
    }
  };

  const detailColumns = [
    {
      key: 'task_id',
      label: 'HỒ SƠ / HỢP ĐỒNG',
      width: 190,
      render: (value, row) => (
        <div className="payroll-task">
          <strong>{value}</strong>
          <span>HĐ: {row.contract_id || 'Chưa có'}</span>
          <span>{row.customer_name || 'Chưa có khách hàng'}</span>
        </div>
      ),
    },
    {
      key: 'task_name',
      label: 'CÔNG VIỆC',
      width: 170,
      render: (value) => <strong>{value || 'Chưa xác định'}</strong>,
    },
    {
      key: 'role',
      label: 'VAI TRÒ',
      width: 100,
      align: 'center',
      render: (value) => (
        <Badge variant={value === 'main' ? 'primary' : 'info'} dot>
          {value === 'main' ? 'Chính' : 'Phụ đo'}
        </Badge>
      ),
    },
    {
      key: 'event_date',
      label: 'NGÀY GHI NHẬN',
      width: 130,
      render: formatDate,
    },
    {
      key: 'base_rate',
      label: 'TIỀN KHOÁN',
      width: 130,
      align: 'right',
      render: (value) => <strong className="payroll-money">{fmt(value)}</strong>,
    },
    {
      key: 'allowance',
      label: 'PHỤ CẤP',
      width: 130,
      align: 'right',
      render: (_, row) => fmt(
        Number(row.stake_allowance || 0)
        + Number(row.cancellation_allowance || 0),
      ),
    },
    {
      key: 'priority_bonus',
      label: 'THƯỞNG',
      width: 115,
      align: 'right',
      render: (value) => (
        <span className={Number(value) > 0 ? 'text-success' : ''}>{fmt(value)}</span>
      ),
    },
    {
      key: 'penalty',
      label: 'PHẠT',
      width: 115,
      align: 'right',
      render: (value) => (
        <span className={Number(value) > 0 ? 'text-danger' : ''}>
          {Number(value) > 0 ? `-${fmt(value)}` : fmt(0)}
        </span>
      ),
    },
    {
      key: 'net_amount',
      label: 'TỔNG NHẬN',
      width: 140,
      align: 'right',
      render: (value) => <strong className="payroll-money payroll-money--accent">{fmt(value)}</strong>,
    },
    {
      key: 'status',
      label: 'TRẠNG THÁI',
      width: 135,
      align: 'center',
      render: (value, row) => {
        const st = value || row?.payment_status || row?.status;
        if (st === 'approved' || st === 'Đã duyệt' || st === 'Đã ghi nhận') {
          return <Badge variant="success" dot>Đã duyệt</Badge>;
        }
        if (st === 'paid' || st === 'Đã thanh toán') {
          return <Badge variant="success" dot>Đã thanh toán</Badge>;
        }
        if (st === 'pending_record' || st === 'Chờ ghi nhận' || row?.is_closable) {
          return <Badge variant="warning" dot>Chờ ghi nhận</Badge>;
        }
        return <Badge variant="neutral" dot>Tạm tính</Badge>;
      },
    },
  ];

  const adjustmentColumns = [
    {
      key: 'event_date',
      label: 'NGÀY',
      width: 120,
      render: (v, row) => formatDate(v || row.event_date || row.effective_date),
    },
    {
      key: 'type',
      label: 'LOẠI ĐIỀU CHỈNH',
      width: 180,
      render: (value) => adjustmentLabels[value] || value || 'Khác',
    },
    {
      key: 'reason',
      label: 'LÝ DO / GHI CHÚ',
      render: (value) => value || '—',
    },
    {
      key: 'amount',
      label: 'SỐ TIỀN',
      width: 140,
      align: 'right',
      render: (value, row) => {
        const isNegative = (row.type || '').toUpperCase() === 'DEDUCTION' || row.type === 'penalty';
        return (
          <strong className={isNegative ? 'text-danger' : 'text-success'}>
            {isNegative ? '-' : '+'}{fmt(value)}
          </strong>
        );
      },
    },
  ];

  // Dữ liệu in A4: Phiếu Lương Cá Nhân
  const personalPrintColumns = [
    { key: 'task_name', label: 'Công việc / Nhiệm vụ', align: 'left' },
    { key: 'role_label', label: 'Vai trò', align: 'center', width: '75px' },
    { key: 'event_date', label: 'Ngày ghi nhận', align: 'center', width: '105px', format: formatDate },
    { key: 'base_rate', label: 'Tiền khoán', align: 'right', width: '110px', format: (val) => fmt(val || 0) },
    { key: 'allowance', label: 'Phụ cấp', align: 'right', width: '90px', format: (val) => fmt(val || 0) },
    { key: 'adj', label: 'Thưởng/Phạt', align: 'right', width: '110px', format: (val) => fmt(val || 0) },
    { key: 'net_amount', label: 'Tổng nhận', align: 'right', width: '115px', format: (val) => fmt(val || 0) },
    { key: 'status_label', label: 'Trạng thái', align: 'center', width: '125px' },
  ];

  const taskRows = (ledger?.details || []).map((t) => ({
    id: t.id,
    task_name: t.task_name || t.node_name || 'Nhiệm vụ',
    role_label: t.role === 'main' ? 'Chính' : 'Phụ',
    event_date: t.event_date || t.recorded_at,
    base_rate: t.base_rate || 0,
    allowance: (t.stake_allowance || 0) + (t.cancellation_allowance || 0),
    adj: (t.priority_bonus || 0) - (t.penalty || 0),
    net_amount: t.net_amount || 0,
    status_label: t.payment_status || t.status || 'Đang xử lý',
  }));

  const adjustmentRows = (ledger?.adjustments || []).map((a) => {
    const isDeduction = (a.type || '').toUpperCase() === 'DEDUCTION' || a.type === 'penalty';
    const isAllowance = (a.type || '').toUpperCase() === 'ALLOWANCE' || (a.type || '').toUpperCase() === 'REIMBURSEMENT';
    const amt = Number(a.amount || 0);
    return {
      id: a.id,
      task_name: `[${adjustmentLabels[a.type] || a.type || 'Điều chỉnh'}] ${a.reason || ''}`,
      role_label: '—',
      event_date: a.effective_date || a.event_date,
      base_rate: 0,
      allowance: isAllowance ? amt : 0,
      adj: isAllowance ? 0 : (isDeduction ? -amt : amt),
      net_amount: isDeduction ? -amt : amt,
      status_label: a.status === 'approved' ? 'Đã duyệt' : (a.status || 'Đang xử lý'),
    };
  });

  const personalPrintRows = [...taskRows, ...adjustmentRows];

  const personalPrintFooter = (
    <tr className="finance-print-footer-row">
      <td colSpan={3} style={{ fontWeight: 700 }}>TỔNG CỘNG THỰC LĨNH</td>
      <td className="is-right" style={{ fontWeight: 700 }}>{fmt(summary.approved_salary ?? summary.recorded_total ?? 0)}</td>
      <td className="is-right" style={{ fontWeight: 700 }}>{fmt(summary.allowance ?? 0)}</td>
      <td className="is-right" style={{ fontWeight: 700 }}>{fmt((summary.bonus ?? 0) - (summary.penalty ?? 0))}</td>
      <td className="is-right" style={{ fontWeight: 700, color: 'var(--orange-500)' }}>{fmt(summary.net_salary ?? 0)}</td>
      <td className="is-center" style={{ fontWeight: 700 }}>{payrollPeriodLabels[ledger?.period_status] || 'Đang mở'}</td>
    </tr>
  );

  return (
    <div className="card payroll-ledger">
      <div className="payroll-ledger__header">
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Banknote size={20} color="var(--orange-500)" /> Lương khoán nhiệm vụ</h3>
          <div className="sub">
            Theo dõi nhiệm vụ chính, phụ đo, phụ cấp, thưởng và phạt theo tháng.
          </div>
        </div>

        <div className="payroll-ledger__actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Badge variant={ledger?.period_status === 'Paid' ? 'success' : 'warning'} dot>
            Kỳ lương: {payrollPeriodLabels[ledger?.period_status] || 'Đang mở'}
          </Badge>

          {/* Export Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportPersonalExcel}
              disabled={exportingPersonal || !ledger?.employee}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600 }}
              title="Xuất phiếu lương Excel của nhân viên đang chọn"
            >
              {exportingPersonal ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} color="#10b981" />}
              <span>Xuất Phiếu Lương</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportDeptExcel}
              disabled={exportingDept}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600 }}
              title="Xuất bảng lương Excel tổng hợp phòng ban"
            >
              {exportingDept ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} color="#0284c7" />}
              <span>Xuất Bảng Tổng Hợp</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setPreviewMode('personal')}
              disabled={!ledger?.employee}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600 }}
              title="Xem trước mẫu in phiếu lương A4"
            >
              <Printer size={14} color="var(--orange-500)" />
              <span>In Phiếu Lương</span>
            </button>

            {isDirector && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={closing || loading || optionsLoading || Number(summary.pending_record_count || 0) <= 0}
                onClick={handleClosePayroll}
              >
                <CheckCircle2 size={15} />
                {closing ? 'Đang chốt...' : `Chốt lương (${summary.pending_record_count || 0}) (Giám đốc)`}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="payroll-filter-grid">
        <FormRow label="Phòng ban">
          <Select
            value={departmentId}
            options={options.departments.map((department) => ({
              value: department.id,
              label: `${department.name} (${department.employees.length})`,
            }))}
            disabled={optionsLoading}
            onChange={handleDepartmentChange}
            placeholder="— Chọn phòng ban —"
            className="ui-select--field"
          />
        </FormRow>
        <FormRow label="Nhân viên">
          <Select
            value={employeeId}
            options={employees.length === 0
              ? [{ value: '', label: 'Chưa có nhân viên' }]
              : employees.map((employee) => ({
                value: employee.id,
                label: `${employee.full_name} · ${employee.job_title || 'Nhân viên'}`,
              }))}
            disabled={optionsLoading || employees.length === 0}
            onChange={setEmployeeId}
            placeholder="— Chọn nhân viên —"
            className="ui-select--field"
          />
        </FormRow>
        <FormRow label="Kỳ lương">
          <DatePicker
            selectionMode="month"
            value={`${year}-${String(month).padStart(2, '0')}`}
            onChange={(value) => {
              if (!value) return;
              setYear(Number(value.slice(0, 4)));
              setMonth(Number(value.slice(5, 7)));
            }}
            placeholder="Chọn kỳ lương"
            dialogLabel="Chọn kỳ lương khoán nhiệm vụ"
            clearable={false}
            className="date-picker--fill"
          />
        </FormRow>
      </div>

      {ledger?.employee && (
        <div className="payroll-employee-strip">
          <div>
            <strong>{ledger.employee.full_name}</strong>
            <span>{ledger.employee.job_title || 'Nhân viên'} · {ledger.employee.department}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="payroll-employee-strip__period">
              Kỳ {String(month).padStart(2, '0')}/{year}
            </span>
            {ledger.period_range?.label && (
              <span className="payroll-employee-strip__range">
                ({ledger.period_range.label})
              </span>
            )}
          </div>
        </div>
      )}

      <div className="payroll-summary-grid">
        {summaryCards.map((card) => (
          <div key={card.label} className={`payroll-summary-card payroll-summary-card--${card.tone}`}>
            <span>{card.label}</span>
            <strong>{fmt(card.value)}</strong>
            <small>{card.note}</small>
          </div>
        ))}
      </div>

      {ledger?.warnings?.length > 0 && (
        <div className="payroll-warning">
          <AlertTriangle size={17} />
          <div>
            <strong>Cần bổ sung định mức</strong>
            {ledger.warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        </div>
      )}

      <div className="payroll-ledger__note">
        “Chờ ghi nhận” là task đã hoàn thành và có thể chốt. “Tạm tính” là task chưa hoàn thành, chưa ghi vào sổ trả lương.
      </div>

      <div className="responsive-table-shell payroll-task-table">
        <p className="responsive-table-hint" role="note">
          Vuốt ngang để xem đầy đủ chi tiết nhiệm vụ trên màn hình hẹp.
        </p>
        <DataTable
          columns={detailColumns}
          data={ledger?.details || []}
          loading={loading || optionsLoading}
          rowKey="id"
          emptyText="Không có nhiệm vụ phát sinh lương trong kỳ này"
          pageSize={15}
          compact
        />
      </div>

      {ledger?.adjustments?.length > 0 && (
        <div className="payroll-adjustments">
          <h4>Điều chỉnh thưởng, phạt và phụ cấp</h4>
          <DataTable
            columns={adjustmentColumns}
            data={ledger.adjustments}
            loading={loading || optionsLoading}
            rowKey="id"
            emptyText="Không có điều chỉnh"
            pageSize={10}
            compact
          />
        </div>
      )}

      {/* Modal Xem Trước & In A4 Phiếu Lương */}
      <Modal
        open={previewMode === 'personal'}
        onClose={() => setPreviewMode(null)}
        title={`Xem Trước Bản In Phiếu Lương - ${ledger?.employee?.full_name || 'Nhân viên'} (Khổ A4)`}
        size="2xl"
        overlayClassName="payroll-preview-modal"
        className="payroll-preview-modal"
        footer={(
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPreviewMode(null)}
            >
              Đóng
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePrint}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Printer size={16} />
              <span>In / Lưu PDF</span>
            </button>
          </div>
        )}
      >
        <div className="payroll-preview-modal__document">
          <FinancePrintReport
            documentRef={printDocumentRef}
            title="PHIẾU THANH TOÁN LƯƠNG KHOÁN NHIỆM VỤ"
            subtitle={`Nhân viên: ${ledger?.employee?.full_name || ''} · ${ledger?.employee?.job_title || ''} (${ledger?.employee?.department || ''}) · Kỳ ${String(month).padStart(2, '0')}/${year} ${ledger?.period_range?.label ? `(${ledger.period_range.label})` : ''}`}
            summary={[
              { label: 'Lương đã duyệt', value: fmt(summary.approved_salary ?? summary.recorded_total ?? 0) },
              { label: 'Chờ ghi nhận', value: fmt(summary.pending_record_total ?? 0) },
              { label: 'Phụ cấp', value: fmt(summary.allowance ?? 0) },
              { label: 'Thưởng / Phạt', value: fmt((summary.bonus ?? 0) - (summary.penalty ?? 0)) },
              { label: 'Tổng thực lĩnh (Net)', value: fmt(summary.net_salary ?? 0) },
            ]}
            columns={personalPrintColumns}
            rows={personalPrintRows}
            footerRow={personalPrintFooter}
            signers={[
              { role: 'Người nhận lương', name: ledger?.employee?.full_name || '', note: '(Ký, ghi rõ họ tên)' },
              { role: 'Kế toán tiền lương', note: '(Ký, họ tên)' },
              { role: 'Giám đốc duyệt', note: '(Ký, họ tên, đóng dấu)' },
            ]}
            emptyText="Không có nhiệm vụ phát sinh lương trong kỳ"
          />
        </div>
      </Modal>

      <ConfirmationModal
        open={closePayrollOpen}
        title="Xác nhận chốt lương"
        description={(
          <span>
            Bạn có chắc chắn muốn chốt <strong>{summary.pending_record_count || 0}</strong> dòng lương
            với tổng số tiền <strong>{fmt(summary.pending_record_total || 0)}</strong> cho nhân sự{' '}
            <strong>{ledger?.employee?.full_name || 'đang chọn'}</strong>?
          </span>
        )}
        confirmLabel="Chốt lương"
        cancelLabel="Để sau"
        onConfirm={handleConfirmClosePayroll}
        onClose={() => setClosePayrollOpen(false)}
        isLoading={closing}
      />
    </div>
  );
}
