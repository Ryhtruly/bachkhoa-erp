import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Banknote, Hammer, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { SubTabs, DataTable, Badge, FilterBar, Modal, FormGrid, FormRow } from '../components/ui';
import { useToast } from '../contexts/ToastContext';

const API = 'http://127.0.0.1:8080';
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
const formatDate = (value) => value
  ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${value}T00:00:00`))
  : '—';

// ════════════════════════════════════════════════════════════════════════════
// Screen 1: Lương Khoán 3P
// ════════════════════════════════════════════════════════════════════════════
function LuongKhoan3P() {
  const [payroll, setPayroll] = useState({ month: new Date().toISOString().slice(0, 7), total_count: 0, total_amount: 0, details: [] });
  const [loading, setLoading] = useState(true);

  const fetchPayroll = async (month) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/luong/khoan?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : data.details || [];
        setPayroll({
          month,
          total_count: arr.length,
          total_amount: arr.reduce((sum, item) => sum + (Number(item['Tổng nhận']) || 0), 0),
          details: arr
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayroll(payroll.month);
  }, []);

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h3><Banknote size={20} /> Lương khoán 3P</h3>
          <div className="sub">Tự động tính dựa trên cơ chế khoán cho hồ sơ hoàn thành.</div>
        </div>
        <div className="flex-center" style={{ gap: '8px' }}>
          <label style={{ margin: 0, whiteSpace: 'nowrap' }}>Tháng</label>
          <input 
            type="month" 
            className="custom-select"
            value={payroll.month} 
            onChange={e => fetchPayroll(e.target.value)} 
            style={{ width: '150px', padding: '8px 12px' }} 
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
        <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '8px', flex: 1 }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--purple-600)' }}>{payroll.total_count}</span>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Hồ sơ hoàn thành trong tháng</p>
        </div>
        <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '8px', flex: 1 }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 700 }} className="text-success">{fmt(payroll.total_amount)}</span>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Tổng quỹ lương khoán</p>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nhân sự</th>
              <th>Mã HS</th>
              <th>Công đoạn</th>
              <th>Tiền khoán</th>
              <th>Phụ cấp</th>
              <th>Thưởng/phạt</th>
              <th>Tổng nhận</th>
              <th>Ngày chốt</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>Đang tải...</td></tr>
            ) : payroll.details.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Chưa có dữ liệu lương</td></tr>
            ) : (
              payroll.details.map((p, i) => (
                <tr key={i}>
                  <td><strong>{p['Nhân sự']}</strong></td>
                  <td>{p['Mã hồ sơ']}</td>
                  <td>{p['Công đoạn khoán']}</td>
                  <td>{fmt(p['Số tiền khoán'])}</td>
                  <td>{fmt(p['Phụ cấp'])}</td>
                  <td>{fmt(p['Thưởng/Phạt'])}</td>
                  <td className="text-success" style={{ fontWeight: 600 }}>{fmt(p['Tổng nhận'])}</td>
                  <td>{p['Ngày chốt']}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
// Screen 3: Danh sách nhân sự
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
          { id: 'payroll-worker', label: 'Lương Khoán 3P', icon: <Hammer size={16}/> },
          { id: 'payroll-office', label: 'Lương VP & Hoa Hồng', icon: <Users size={16}/> },
          { id: 'employees', label: 'Danh sách nhân sự', icon: <Users size={16}/> }
        ]} 
      />
      <div style={{ padding: '16px 24px', flex: 1, overflowY: 'auto' }}>
        {activeTab === 'payroll-worker' && <LuongKhoan3P />}
        {activeTab === 'payroll-office' && <PayrollScreen />}
        {activeTab === 'employees' && <EmployeeDirectory />}
      </div>
    </section>
  );
}
