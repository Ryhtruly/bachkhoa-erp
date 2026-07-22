import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Banknote, CheckCircle2, Hammer, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { SubTabs, DataTable, Badge, FilterBar, Modal, FormGrid, FormRow } from '../components/ui';
import { useToast } from '../contexts/ToastContext';

const API = '';
const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + '₫';
const today = () => new Date().toISOString().slice(0, 10);
const emptyEmployeeForm = () => ({
  user_id: '',
  full_name: '',
  department_id: '',
  job_title: '',
  contract_status: 'Probation',
  join_date: today(),
  probation_end_date: '',
  base_salary: '',
  is_active: true,
});
const contractStatusLabels = {
  Probation: 'Thử việc',
  Official: 'Chính thức',
  Terminated: 'Đã nghỉ',
};
const contractStatusVariants = {
  Probation: 'warning',
  Official: 'success',
  Terminated: 'neutral',
};
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
const formatDate = (value) => value
  ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${value}T00:00:00`))
  : '—';

// ════════════════════════════════════════════════════════════════════════════
// Screen 1: Lương Khoán 3P
// ════════════════════════════════════════════════════════════════════════════
function LuongKhoan3P() {
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

// ════════════════════════════════════════════════════════════════════════════
// Screen 2: Lương văn phòng & hoa hồng
// ════════════════════════════════════════════════════════════════════════════
function PayrollScreen() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (month) p.set('month', month);
    const r = await fetch(`${API}/api/finance/payroll?${p}`);
    setData(await r.json());
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const cols = [
    { key: 'full_name', label: 'Họ & Tên', render: v => <strong>{v || 'Chưa cập nhật'}</strong> },
    { key: 'department', label: 'Phòng ban' },
    { key: 'base_salary', label: 'Lương cơ bản', width: 130, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(v)}</span> },
    { key: 'kpi_score', label: 'Điểm KPI', width: 90, align: 'center', render: v => <Badge variant={v >= 8 ? 'success' : v >= 5 ? 'warning' : 'danger'}>{v}</Badge> },
    { key: 'bonus', label: 'Hoa hồng / Thưởng', width: 145, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600 }}>+{fmt(v)}</span> },
    { key: 'total_salary', label: 'Tổng lương thực nhận', width: 160, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--orange-500)' }}>{fmt(v)}</span> },
    { key: 'month', label: 'Tháng', width: 90, render: v => <span style={{ fontFamily: 'var(--font-mono)' }}>{v || '—'}</span> },
  ];

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h3><Users size={20} /> Lương VP & Hoa Hồng Sales</h3>
          <div className="sub">Lương cơ bản + KPI + Hoa hồng BĐS theo tháng</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Tháng:</span>
          <input type="month" className="custom-select" style={{ width: 150, padding: '8px 12px' }} value={month} onChange={e => setMonth(e.target.value)} />
        </div>
      </div>
      {data.length === 0 && !loading ? (
        <div className="finance-empty"><span className="finance-empty__icon">👥</span><span>Chưa có dữ liệu nhân sự. Cần thêm nhân viên vào bảng <code>employees</code>.</span></div>
      ) : (
        <DataTable columns={cols} data={data} loading={loading} rowKey="id" emptyText="Chưa có nhân sự" pageSize={15} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Screen 3: Bảng Giá Khoán
// ════════════════════════════════════════════════════════════════════════════
function BangGiaKhoan() {
  const { addToast } = useToast();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ task_type_id: '', role: 'main', rate: '' });

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/luong/rates`);
      if (!response.ok) throw new Error('Không tải được bảng giá');
      const payload = await response.json();
      setRates(payload.data || []);
    } catch (error) {
      addToast(error.message || 'Lỗi tải bảng giá', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadRates(); }, [loadRates]);

  const openAddModal = () => {
    setEditingItem(null);
    setForm({ task_type_id: rates[0]?.task_type_id || '', role: 'main', rate: '' });
    setModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setForm({
      task_type_id: item.task_type_id,
      role: 'main',
      rate: item.main_rate || '',
    });
    setModalOpen(true);
  };

  const submitRate = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`${API}/api/luong/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_type_id: form.task_type_id,
          role: form.role,
          rate: Number(form.rate),
          effective_from: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!response.ok) throw new Error('Không lưu được đơn giá');
      addToast('Đã lưu đơn giá', 'success');
      setModalOpen(false);
      await loadRates();
    } catch (error) {
      addToast(error.message || 'Lỗi lưu đơn giá', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteRate = async (rateId) => {
    if (!window.confirm('Xóa dòng đơn giá này?')) return;
    try {
      const response = await fetch(`${API}/api/luong/rates/${rateId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Không xóa được');
      addToast('Đã xóa đơn giá', 'success');
      await loadRates();
    } catch (error) {
      addToast(error.message || 'Lỗi xóa', 'error');
    }
  };

  const columns = [
    { key: 'task_type_name', label: 'LOẠI HỒ SƠ', width: 250, render: (v) => <strong>{v}</strong> },
    { key: 'main_rate', label: 'ĐƠN GIÁ CHÍNH', width: 160, align: 'right', render: (v) => <strong className="payroll-money">{fmt(v)}</strong> },
    { key: 'support_rate', label: 'ĐƠN GIÁ PHỤ ĐO', width: 160, align: 'right', render: (v) => <strong className="payroll-money">{fmt(v)}</strong> },
    {
      key: 'actions',
      label: '',
      width: 100,
      align: 'center',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => openEditModal(row)}>
            <Pencil size={14} />
          </button>
          {row.main_rate_id && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => deleteRate(row.main_rate_id)}>
              <Trash2 size={14} color="var(--red-500)" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h3><Banknote size={20} /> Bảng Giá Khoán</h3>
          <div className="sub">Đơn giá khoán chính và phụ đo theo loại hồ sơ</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAddModal}>
          <Plus size={15} /> Thêm đơn giá
        </button>
      </div>

      <DataTable
        columns={columns}
        data={rates}
        loading={loading}
        rowKey="task_type_id"
        emptyText="Chưa có đơn giá khoán"
        pageSize={20}
      />

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        size="sm"
        closeOnOverlay={!saving}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {editingItem ? <Pencil size={18} /> : <Plus size={18} />}
            {editingItem ? 'Cập nhật đơn giá' : 'Thêm đơn giá mới'}
          </span>
        }
      >
        <form onSubmit={submitRate}>
          <FormGrid cols={1}>
            <FormRow label="Loại hồ sơ" required>
              <select
                className="form-control"
                required
                value={form.task_type_id}
                onChange={(e) => setForm({ ...form, task_type_id: e.target.value })}
                disabled={!!editingItem}
              >
                {rates.map((r) => (
                  <option key={r.task_type_id} value={r.task_type_id}>{r.task_type_name}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Vai trò" required>
              <select
                className="form-control"
                required
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="main">Chính</option>
                <option value="support">Phụ đo</option>
              </select>
            </FormRow>
            <FormRow label="Đơn giá (VNĐ)" required>
              <input
                className="form-control"
                type="number"
                required
                min="0"
                step="1000"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                placeholder="0"
              />
            </FormRow>
          </FormGrid>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-default)' }}>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setModalOpen(false)}>Hủy bỏ</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu đơn giá'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Screen 4: Danh sách nhân sự
// ════════════════════════════════════════════════════════════════════════════
function EmployeeDirectory() {
  const { addToast } = useToast();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    department_id: 'All',
    contract_status: 'All',
    active_status: 'All',
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(emptyEmployeeForm);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const [employeeResponse, departmentResponse] = await Promise.all([
        fetch(`${API}/api/finance/employees`),
        fetch(`${API}/api/finance/employees/departments`),
      ]);
      if (!employeeResponse.ok || !departmentResponse.ok) {
        throw new Error('Không thể tải dữ liệu nhân sự');
      }
      const [employeeData, departmentData] = await Promise.all([
        employeeResponse.json(),
        departmentResponse.json(),
      ]);
      setEmployees(Array.isArray(employeeData) ? employeeData : []);
      setDepartments(Array.isArray(departmentData) ? departmentData : []);
    } catch (error) {
      addToast(error.message || 'Không thể tải dữ liệu nhân sự', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const openCreateModal = () => {
    setEditingEmployee(null);
    setForm(emptyEmployeeForm());
    setModalOpen(true);
  };

  const openEditModal = (employee) => {
    setEditingEmployee(employee);
    setForm({
      user_id: employee.user_id || '',
      full_name: employee.full_name || '',
      department_id: employee.department_id || '',
      job_title: employee.job_title || '',
      contract_status: employee.contract_status || 'Probation',
      join_date: employee.join_date || today(),
      probation_end_date: employee.probation_end_date || '',
      base_salary: employee.base_salary ?? '',
      is_active: Boolean(employee.is_active),
    });
    setModalOpen(true);
  };

  const parseError = async (response, fallback) => {
    try {
      const body = await response.json();
      return typeof body.detail === 'string' ? body.detail : fallback;
    } catch {
      return fallback;
    }
  };

  const submitEmployee = async (event) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      user_id: form.user_id || null,
      full_name: form.full_name,
      department_id: form.department_id || null,
      job_title: form.job_title || null,
      contract_status: form.contract_status,
      join_date: form.join_date || null,
      probation_end_date: form.probation_end_date || null,
      base_salary: Number(form.base_salary || 0),
      is_active: Boolean(form.is_active),
    };

    try {
      const response = await fetch(
        editingEmployee
          ? `${API}/api/finance/employees/${editingEmployee.id}`
          : `${API}/api/finance/employees`,
        {
          method: editingEmployee ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        throw new Error(await parseError(response, 'Không thể lưu nhân sự'));
      }
      addToast(
        editingEmployee ? 'Đã cập nhật nhân sự' : 'Đã thêm nhân sự mới',
        'success',
      );
      setModalOpen(false);
      await loadEmployees();
    } catch (error) {
      addToast(error.message || 'Không thể lưu nhân sự', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteEmployee = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const response = await fetch(
        `${API}/api/finance/employees/${deleteTarget.id}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        throw new Error(await parseError(response, 'Không thể xóa nhân sự'));
      }
      addToast('Đã xóa nhân sự', 'success');
      setDeleteTarget(null);
      await loadEmployees();
    } catch (error) {
      addToast(error.message || 'Không thể xóa nhân sự', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = employees.filter((employee) => {
    const keyword = search.trim().toLocaleLowerCase('vi');
    const searchable = [
      employee.id,
      employee.full_name,
      employee.department,
      employee.job_title,
      employee.user_id,
    ].filter(Boolean).join(' ').toLocaleLowerCase('vi');
    const matchesSearch = !keyword || searchable.includes(keyword);
    const matchesDepartment = filters.department_id === 'All'
      || employee.department_id === filters.department_id;
    const matchesContract = filters.contract_status === 'All'
      || employee.contract_status === filters.contract_status;
    const matchesActive = filters.active_status === 'All'
      || (filters.active_status === 'active' && employee.is_active)
      || (filters.active_status === 'inactive' && !employee.is_active);
    return matchesSearch && matchesDepartment && matchesContract && matchesActive;
  });

  const columns = [
    {
      key: 'id',
      label: 'Mã nhân sự',
      width: 160,
      sortable: true,
      render: (value) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{value}</span>,
    },
    {
      key: 'full_name',
      label: 'Họ và tên',
      sortable: true,
      render: (value) => <strong>{value}</strong>,
    },
    { key: 'department', label: 'Phòng ban', sortable: true },
    { key: 'job_title', label: 'Chức danh', sortable: true },
    {
      key: 'contract_status',
      label: 'Hợp đồng',
      align: 'center',
      render: (value) => (
        <Badge variant={contractStatusVariants[value] || 'neutral'} dot>
          {contractStatusLabels[value] || value}
        </Badge>
      ),
    },
    {
      key: 'join_date',
      label: 'Ngày vào làm',
      width: 120,
      sortable: true,
      render: formatDate,
    },
    {
      key: 'base_salary',
      label: 'Lương cơ bản',
      width: 140,
      align: 'right',
      sortable: true,
      render: (value) => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(value)}</span>,
    },
    {
      key: 'is_active',
      label: 'Hoạt động',
      width: 110,
      align: 'center',
      render: (value) => (
        <Badge variant={value ? 'success' : 'neutral'} dot>
          {value ? 'Đang làm' : 'Ngừng'}
        </Badge>
      ),
    },
    {
      key: '_actions',
      label: 'Thao tác',
      width: 110,
      align: 'center',
      render: (_, employee) => (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
          <button
            type="button"
            className="btn btn-icon btn-sm btn-ghost"
            onClick={() => openEditModal(employee)}
            title="Sửa nhân sự"
            aria-label={`Sửa ${employee.full_name}`}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-sm btn-ghost"
            onClick={() => setDeleteTarget(employee)}
            title="Xóa nhân sự"
            aria-label={`Xóa ${employee.full_name}`}
            style={{ color: 'var(--red-500)' }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ marginBottom: 20 }}>
        <h3><Users size={20} /> Danh sách nhân sự</h3>
        <div className="sub">Quản lý hồ sơ nhân viên, phòng ban và trạng thái làm việc.</div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm tên, mã nhân sự, chức danh..."
        filters={[
          {
            key: 'department_id',
            label: 'Phòng ban',
            type: 'select',
            width: 220,
            options: departments.map((department) => ({
              value: department.id,
              label: department.name,
            })),
          },
          {
            key: 'contract_status',
            label: 'Tình trạng hợp đồng',
            type: 'select',
            width: 190,
            options: Object.entries(contractStatusLabels).map(([value, label]) => ({
              value,
              label,
            })),
          },
          {
            key: 'active_status',
            label: 'Trạng thái làm việc',
            type: 'select',
            width: 180,
            options: [
              { value: 'active', label: 'Đang làm việc' },
              { value: 'inactive', label: 'Ngừng hoạt động' },
            ],
          },
        ]}
        values={filters}
        onFilterChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
        onReset={() => {
          setSearch('');
          setFilters({ department_id: 'All', contract_status: 'All', active_status: 'All' });
        }}
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreateModal}>
            <UserPlus size={16} /> Thêm nhân sự
          </button>
        }
      />

      <DataTable
        columns={columns}
        data={filteredEmployees}
        loading={loading}
        rowKey="id"
        emptyText="Chưa có nhân sự"
        pageSize={15}
      />

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        size="lg"
        closeOnOverlay={!saving}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {editingEmployee ? <Pencil size={20} /> : <UserPlus size={20} />}
            {editingEmployee ? 'Cập nhật nhân sự' : 'Thêm nhân sự mới'}
          </span>
        }
      >
        <form onSubmit={submitEmployee}>
          <FormGrid cols={2}>
            <FormRow label="Họ và tên" required>
              <input
                className="form-control"
                required
                maxLength={200}
                value={form.full_name}
                onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                placeholder="Nguyễn Văn A"
              />
            </FormRow>
            <FormRow label="Tài khoản liên kết" hint="ID trong bảng public.users, có thể để trống">
              <input
                className="form-control"
                value={form.user_id}
                onChange={(event) => setForm({ ...form, user_id: event.target.value })}
                placeholder="UUID tài khoản"
              />
            </FormRow>
            <FormRow label="Phòng ban">
              <select
                className="form-control"
                value={form.department_id}
                onChange={(event) => setForm({ ...form, department_id: event.target.value })}
              >
                <option value="">— Chưa phân phòng —</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Chức danh">
              <input
                className="form-control"
                maxLength={100}
                value={form.job_title}
                onChange={(event) => setForm({ ...form, job_title: event.target.value })}
                placeholder="Kỹ thuật viên đo đạc"
              />
            </FormRow>
            <FormRow label="Tình trạng hợp đồng" required>
              <select
                className="form-control"
                required
                value={form.contract_status}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm({
                    ...form,
                    contract_status: value,
                    is_active: value === 'Terminated' ? false : form.is_active,
                  });
                }}
              >
                {Object.entries(contractStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Trạng thái làm việc" required>
              <select
                className="form-control"
                value={form.is_active ? 'true' : 'false'}
                onChange={(event) => setForm({ ...form, is_active: event.target.value === 'true' })}
              >
                <option value="true">Đang làm việc</option>
                <option value="false">Ngừng hoạt động</option>
              </select>
            </FormRow>
            <FormRow label="Ngày vào làm">
              <input
                className="form-control"
                type="date"
                value={form.join_date}
                onChange={(event) => setForm({ ...form, join_date: event.target.value })}
              />
            </FormRow>
            <FormRow label="Kết thúc thử việc">
              <input
                className="form-control"
                type="date"
                min={form.join_date || undefined}
                value={form.probation_end_date}
                onChange={(event) => setForm({ ...form, probation_end_date: event.target.value })}
              />
            </FormRow>
            <FormRow label="Lương cơ bản (VNĐ)" cols={2}>
              <input
                className="form-control"
                type="number"
                min="0"
                step="1000"
                value={form.base_salary}
                onChange={(event) => setForm({ ...form, base_salary: event.target.value })}
                placeholder="0"
              />
            </FormRow>
          </FormGrid>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-default)' }}>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setModalOpen(false)}>
              Hủy bỏ
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Đang lưu...' : editingEmployee ? 'Lưu thay đổi' : 'Thêm nhân sự'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !saving && setDeleteTarget(null)}
        size="sm"
        closeOnOverlay={!saving}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={20} color="var(--red-500)" /> Xác nhận xóa
          </span>
        }
      >
        <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Bạn có chắc muốn xóa nhân sự <strong>{deleteTarget?.full_name}</strong>? Thao tác này không thể hoàn tác.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setDeleteTarget(null)}>
            Hủy bỏ
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={deleteEmployee}
            style={{ background: 'var(--red-500)', borderColor: 'var(--red-500)' }}
          >
            <Trash2 size={16} /> {saving ? 'Đang xóa...' : 'Xóa nhân sự'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Main Component
// ════════════════════════════════════════════════════════════════════════════
export default function Luong() {
  const [activeTab, setActiveTab] = useState('payroll-worker');

  return (
    <section className="tab-pane active" id="tab-luong" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SubTabs 
        active={activeTab} 
        onChange={setActiveTab}
        tabs={[
          { id: 'payroll-worker', label: 'Lương Khoán Nhiệm Vụ', icon: <Hammer size={16}/> },
          { id: 'bang-gia', label: 'Bảng Giá Khoán', icon: <Banknote size={16}/> },
          { id: 'payroll-office', label: 'Lương VP & Hoa Hồng', icon: <Users size={16}/> },
          { id: 'employees', label: 'Danh sách nhân sự', icon: <Users size={16}/> }
        ]} 
      />
      <div style={{ padding: '16px 24px', flex: 1, overflowY: 'auto' }}>
        {activeTab === 'payroll-worker' && <LuongKhoan3P />}
        {activeTab === 'bang-gia' && <BangGiaKhoan />}
        {activeTab === 'payroll-office' && <PayrollScreen />}
        {activeTab === 'employees' && <EmployeeDirectory />}
      </div>
    </section>
  );
}
