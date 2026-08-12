import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Banknote, CheckCircle2 } from 'lucide-react';
import { Badge, DataTable, FormRow } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { fmt, formatDate } from '../utils';
import { API } from '../financeConstants';

const payrollPeriodLabels = {
  Open: 'Đang mở',
  Locked: 'Đã khóa',
  Paid: 'Đã thanh toán',
};
const adjustmentLabels = {
  bonus: 'Thưởng',
  penalty: 'Phạt',
  allowance: 'Phụ cấp',
  referral_commission: 'Hoa hồng giới thiệu',
  holiday_bonus: 'Thưởng lễ/Tết',
};

export default function LuongKhoan3PScreen() {
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

  useEffect(() => {
    const loadOptions = async () => {
      try {
        setOptionsLoading(true);
        const response = await fetch(`${API}/api/payroll/options`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.detail || 'Không tải được danh sách nhân viên');
        }
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
      const response = await fetch(`${API}/api/payroll/employee-ledger?${params}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || 'Không tải được sổ lương nhân viên');
      }
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

  const selectedDepartment = options.departments.find(
    (department) => department.id === departmentId,
  );
  const employees = selectedDepartment?.employees || [];
  const summary = ledger?.summary || {
    base_salary: 0,
    main_task_count: 0,
    support_task_count: 0,
    piece_rate_main: 0,
    piece_rate_support: 0,
    allowance: 0,
    bonus: 0,
    penalty: 0,
    gross_total: 0,
    recorded_total: 0,
    estimated_total: 0,
    paid_total: 0,
    unpaid_total: 0,
    pending_record_count: 0,
    pending_record_total: 0,
    provisional_count: 0,
    provisional_total: 0,
  };

  const handleDepartmentChange = (value) => {
    const department = options.departments.find((item) => item.id === value);
    setDepartmentId(value);
    setEmployeeId(department?.employees?.[0]?.id || '');
  };

  const handleClosePayroll = async () => {
    const pendingCount = Number(summary.pending_record_count || 0);
    if (!employeeId || pendingCount <= 0) {
      addToast('Không có dòng lương hoàn thành nào cần chốt trong kỳ này.', 'info');
      return;
    }
    const ok = window.confirm(
      `Chốt ${pendingCount} dòng lương cho ${ledger?.employee?.full_name || 'nhân viên'} kỳ ${String(month).padStart(2, '0')}/${year}?`,
    );
    if (!ok) return;

    try {
      setClosing(true);
      const response = await fetch(`${API}/api/payroll/close-employee-period`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          year,
          month,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || 'Không chốt được lương.');
      }
      const created = payload.data?.created_count || 0;
      addToast(
        created > 0
          ? `Đã chốt ${created} dòng lương.`
          : 'Không có dòng lương mới cần chốt.',
        created > 0 ? 'success' : 'info',
      );
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
      render: (value) => <strong className="text-success">{fmt(value)}</strong>,
    },
    {
      key: 'payment_status',
      label: 'GHI NHẬN',
      width: 185,
      render: (value, row) => (
        <div className="payroll-task">
          <Badge
            variant={row.is_recorded ? (
              value === 'Đã thanh toán' ? 'success' : 'warning'
            ) : (row.is_closable ? 'warning' : 'neutral')}
            dot
          >
            {value}
          </Badge>
          <span>{row.source}</span>
        </div>
      ),
    },
  ];

  const summaryCards = [
    {
      label: 'Lương cơ bản',
      value: summary.base_salary,
      note: `${ledger?.employee?.job_title || 'Nhân viên'}`,
      tone: 'success',
    },
    {
      label: 'Khoán chính',
      value: summary.piece_rate_main,
      note: `${summary.main_task_count} nhiệm vụ`,
      tone: 'primary',
    },
    {
      label: 'Khoán phụ đo',
      value: summary.piece_rate_support,
      note: `${summary.support_task_count} nhiệm vụ`,
      tone: 'info',
    },
    { label: 'Phụ cấp', value: summary.allowance, note: 'Cắm mốc / hủy / khác', tone: 'warning' },
    { label: 'Thưởng', value: summary.bonus, note: 'Ưu tiên và điều chỉnh', tone: 'success' },
    { label: 'Phạt', value: summary.penalty, note: 'Khấu trừ trong tháng', tone: 'danger' },
    { label: 'Chờ ghi nhận', value: summary.pending_record_total, note: `${summary.pending_record_count} dòng hoàn thành`, tone: 'warning' },
    { label: 'Tạm tính', value: summary.provisional_total, note: `${summary.provisional_count} dòng chưa hoàn thành`, tone: 'info' },
    { label: 'Đã thanh toán', value: summary.paid_total, note: `${fmt(summary.recorded_total)} đã ghi nhận`, tone: 'success' },
    { label: 'Còn chờ', value: summary.unpaid_total, note: 'Gồm khoản dự tính', tone: 'warning' },
  ];
  const adjustmentColumns = [
    {
      key: 'type',
      label: 'LOẠI ĐIỀU CHỈNH',
      width: 180,
      render: (value) => adjustmentLabels[value] || value,
    },
    { key: 'reason', label: 'LÝ DO' },
    {
      key: 'task_id',
      label: 'HỒ SƠ',
      width: 140,
      render: (value) => value || 'Không gắn hồ sơ',
    },
    {
      key: 'amount',
      label: 'SỐ TIỀN',
      width: 150,
      align: 'right',
      render: (value, row) => (
        <strong className={row.type === 'penalty' ? 'text-danger' : 'text-success'}>
          {row.type === 'penalty' ? '-' : '+'}{fmt(value)}
        </strong>
      ),
    },
  ];

  return (
    <div className="card payroll-ledger">
      <div className="payroll-ledger__header">
        <div>
          <h3><Banknote size={20} /> Lương khoán nhiệm vụ</h3>
          <div className="sub">
            Theo dõi nhiệm vụ chính, phụ đo, phụ cấp, thưởng và phạt theo tháng.
          </div>
        </div>
        <div className="payroll-ledger__actions">
          <Badge variant={ledger?.period_status === 'Paid' ? 'success' : 'warning'} dot>
            Kỳ lương: {payrollPeriodLabels[ledger?.period_status] || 'Đang mở'}
          </Badge>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={closing || loading || optionsLoading || Number(summary.pending_record_count || 0) <= 0}
            onClick={handleClosePayroll}
          >
            <CheckCircle2 size={15} />
            {closing ? 'Đang chốt...' : `Chốt lương (${summary.pending_record_count || 0})`}
          </button>
        </div>
      </div>

      <div className="payroll-filter-grid">
        <FormRow label="Phòng ban">
          <select
            className="form-control"
            value={departmentId}
            disabled={optionsLoading}
            onChange={(event) => handleDepartmentChange(event.target.value)}
          >
            {options.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name} ({department.employees.length})
              </option>
            ))}
          </select>
        </FormRow>
        <FormRow label="Nhân viên">
          <select
            className="form-control"
            value={employeeId}
            disabled={optionsLoading || employees.length === 0}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            {employees.length === 0 && <option value="">Chưa có nhân viên</option>}
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name} · {employee.job_title || 'Nhân viên'}
              </option>
            ))}
          </select>
        </FormRow>
        <FormRow label="Năm">
          <select
            className="form-control"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {options.years.map((optionYear) => (
              <option key={optionYear} value={optionYear}>{optionYear}</option>
            ))}
          </select>
        </FormRow>
        <FormRow label="Tháng">
          <select
            className="form-control"
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>Tháng {value}</option>
            ))}
          </select>
        </FormRow>
      </div>

      {ledger?.employee && (
        <div className="payroll-employee-strip">
          <div>
            <strong>{ledger.employee.full_name}</strong>
            <span>{ledger.employee.job_title || 'Nhân viên'} · {ledger.employee.department}</span>
          </div>
          <span>
            Kỳ {String(month).padStart(2, '0')}/{year}
          </span>
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

      <DataTable
        columns={detailColumns}
        data={ledger?.details || []}
        loading={loading || optionsLoading}
        rowKey="id"
        emptyText="Không có nhiệm vụ phát sinh lương trong kỳ này"
        pageSize={15}
        compact
      />

      {ledger?.adjustments?.length > 0 && (
        <div className="payroll-adjustments">
          <h4>Điều chỉnh thưởng, phạt và phụ cấp</h4>
          <DataTable
            columns={adjustmentColumns}
            data={ledger.adjustments}
            rowKey="id"
            pageSize={0}
            compact
          />
        </div>
      )}
    </div>
  );
}
