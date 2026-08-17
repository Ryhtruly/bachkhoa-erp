import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Banknote, CheckCircle2 } from 'lucide-react';
import { Badge, ConfirmationModal, DataTable, DatePicker, FormRow } from '../../ui';
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

export default function PieceRatePayrollScreen({ user, isDirector = false }) {
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
      value: summary.net_salary ?? summary.gross_total ?? 0,
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
      value: summary.pending_record_total || 0,
      note: `${summary.pending_record_count || 0} nhiệm vụ hoàn thành chờ chốt`,
      tone: 'warning',
    },
    {
      label: 'Tạm tính (chưa xong)',
      value: summary.provisional_total || 0,
      note: `${summary.provisional_count || 0} nhiệm vụ đang thực hiện`,
      tone: 'neutral',
    },
  ];

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
      render: (value) => {
        if (value === 'approved') return <Badge variant="success" dot>Đã duyệt</Badge>;
        if (value === 'pending_record') return <Badge variant="warning" dot>Chờ ghi nhận</Badge>;
        return <Badge variant="neutral" dot>Tạm tính</Badge>;
      },
    },
  ];

  const adjustmentColumns = [
    {
      key: 'event_date',
      label: 'NGÀY',
      width: 120,
      render: formatDate,
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
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Banknote size={20} color="var(--orange-500)" /> Lương khoán nhiệm vụ</h3>
          <div className="sub">
            Theo dõi nhiệm vụ chính, phụ đo, phụ cấp, thưởng và phạt theo tháng.
          </div>
        </div>
        <div className="payroll-ledger__actions">
          <Badge variant={ledger?.period_status === 'Paid' ? 'success' : 'warning'} dot>
            Kỳ lương: {payrollPeriodLabels[ledger?.period_status] || 'Đang mở'}
          </Badge>
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
            loading={loading || optionsLoading}
            rowKey="id"
            emptyText="Không có điều chỉnh"
            pageSize={10}
            compact
          />
        </div>
      )}

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
