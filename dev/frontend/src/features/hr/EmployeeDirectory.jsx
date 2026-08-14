import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowLeft, Camera, Lock, Mail, Pencil, Printer, Save, Search,
  Trash2, Unlock, UserCog, UserPlus, Users, X,
} from 'lucide-react';
import { Badge, Divider, FormGrid, FormRow, Modal } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';
import { initialsOf } from '../../lib/avatar';
import AvatarImage from '../../components/AvatarImage';
import { printElement } from '../../components/finance/print/printDocument';
import EmployeePrintProfile from './EmployeePrintProfile';
import employeeProfilePrintStyles from './employeeProfile.print.css?inline';
import './humanResources.css';

const today = () => new Date().toISOString().slice(0, 10);
const emptyEmployeeForm = () => ({
  full_name: '',
  department_id: '',
  job_title: '',
  contract_status: 'Probation',
  join_date: today(),
  probation_end_date: '',
  base_salary: '',
  is_active: true,
  email: '',
  phone: '',
  gender: '',
  date_of_birth: '',
  place_of_birth: '',
});
const contractStatusLabels = { Probation: 'Thử việc', Official: 'Chính thức', Terminated: 'Đã nghỉ' };
const contractStatusVariants = { Probation: 'warning', Official: 'success', Terminated: 'neutral' };
const genderLabels = { male: 'Nam', female: 'Nữ', other: 'Khác' };
const formatDate = (value) => value
  ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${value}T00:00:00`))
  : null;
const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + '₫';

function Avatar({ name, avatarUrl, size = 40 }) {
  return <AvatarImage className="hr-avatar" src={avatarUrl} name={name} style={{ width: size, height: size, objectFit: 'cover', fontSize: size * 0.4 }} />;
}

function Field({ label, value }) {
  return (
    <div>
      <div className="hr-detail__field-label">{label}</div>
      <div className={`hr-detail__field-value${value ? '' : ' hr-detail__field-value--muted'}`}>
        {value || 'Chưa có dữ liệu'}
      </div>
    </div>
  );
}

function CreateAccountModal({ employee, onClose, onCreated }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ username: '', email: employee?.email || '' });
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await apiFetch(`/api/user-admin/employees/${employee.id}/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      addToast(
        result?.invite_email_sent === false
          ? 'Đã tạo tài khoản nhưng gửi email thất bại — dùng nút "Gửi lại email mời" trong bảng.'
          : 'Đã tạo tài khoản và gửi email mời đặt mật khẩu',
        result?.invite_email_sent === false ? 'warning' : 'success',
      );
      onCreated();
    } catch (error) {
      addToast(error.message || 'Không thể tạo tài khoản', 'error');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <Modal
      open={Boolean(employee)}
      onClose={() => !saving && onClose()}
      size="md"
      closeOnOverlay={!saving}
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserCog size={20} /> Mời nhân viên tạo tài khoản
        </span>
      }
    >
      <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)' }}>
        Cấp tên đăng nhập cho <strong>{employee?.full_name}</strong>. Hệ thống sẽ gửi email chứa liên kết để nhân viên
        tự đặt mật khẩu và kích hoạt tài khoản — bạn sẽ không biết mật khẩu của nhân viên.
      </p>
      <form onSubmit={submit}>
        <FormGrid cols={1}>
          <FormRow label="Tên đăng nhập" required align="left">
            <input
              className="form-control"
              required
              minLength={3}
              maxLength={50}
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              placeholder="ten.dangnhap"
              autoFocus
            />
          </FormRow>
          <FormRow label="Email" required hint="Liên kết đặt mật khẩu sẽ được gửi tới đây" align="left">
            <input
              className="form-control"
              type="email"
              required
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="ten.nv@bachkhoa.local"
            />
          </FormRow>
        </FormGrid>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-default)' }}>
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>
            Hủy bỏ
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Đang tạo...' : 'Tạo tài khoản'}
          </button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}

export default function EmployeeDirectory() {
  const { addToast } = useToast();
  const printDocumentRef = useRef(null);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'create'
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [accountTarget, setAccountTarget] = useState(null);
  const [accountStatusTarget, setAccountStatusTarget] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [form, setForm] = useState(emptyEmployeeForm);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const [employeeData, departmentData] = await Promise.all([
        apiFetch('/api/finance/employees'),
        apiFetch('/api/finance/employees/departments'),
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

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedId) || null,
    [employees, selectedId],
  );

  const handlePrintEmployee = () => {
    printElement({
      element: printDocumentRef.current,
      title: `Hồ sơ nhân sự - ${selectedEmployee?.full_name || ''}`,
      styles: employeeProfilePrintStyles,
      onError: message => addToast(message, 'error'),
    });
  };

  const startCreate = () => {
    setSelectedId(null);
    setForm(emptyEmployeeForm());
    setMode('create');
  };

  const startEdit = (employee) => {
    setForm({
      full_name: employee.full_name || '',
      department_id: employee.department_id || '',
      job_title: employee.job_title || '',
      contract_status: employee.contract_status || 'Probation',
      join_date: employee.join_date || today(),
      probation_end_date: employee.probation_end_date || '',
      base_salary: employee.base_salary ?? '',
      is_active: Boolean(employee.is_active),
      email: employee.email || '',
      phone: employee.phone || '',
      gender: employee.gender || '',
      date_of_birth: employee.date_of_birth || '',
      place_of_birth: employee.place_of_birth || '',
    });
    setMode('edit');
  };

  const cancelForm = () => {
    setMode('view');
  };

  const submitEmployee = async (event) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      full_name: form.full_name,
      department_id: form.department_id || null,
      job_title: form.job_title || null,
      contract_status: form.contract_status,
      join_date: form.join_date || null,
      probation_end_date: form.probation_end_date || null,
      base_salary: Number(form.base_salary || 0),
      is_active: Boolean(form.is_active),
      email: form.email || null,
      phone: form.phone || null,
      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,
      place_of_birth: form.place_of_birth || null,
    };

    try {
      const result = await apiFetch(
        mode === 'edit' && selectedId
          ? `/api/finance/employees/${selectedId}`
          : '/api/finance/employees',
        {
          method: mode === 'edit' && selectedId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      addToast(mode === 'edit' ? 'Đã cập nhật nhân sự' : 'Đã thêm nhân sự mới', 'success');
      setMode('view');
      setSelectedId(result?.id || selectedId);
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
      await apiFetch(`/api/finance/employees/${deleteTarget.id}`, { method: 'DELETE' });
      addToast('Đã xóa nhân sự', 'success');
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
        setMode('view');
      }
      setDeleteTarget(null);
      await loadEmployees();
    } catch (error) {
      addToast(error.message || 'Không thể xóa nhân sự', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleAccountStatus = async () => {
    if (!accountStatusTarget) return;
    setSaving(true);
    const action = accountStatusTarget.account_is_active ? 'deactivate' : 'activate';
    try {
      await apiFetch(`/api/user-admin/users/${accountStatusTarget.user_id}/${action}`, { method: 'POST' });
      addToast(action === 'activate' ? 'Đã kích hoạt tài khoản' : 'Đã khoá tài khoản', 'success');
      setAccountStatusTarget(null);
      await loadEmployees();
    } catch (error) {
      addToast(error.message || 'Không thể đổi trạng thái tài khoản', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resendInvite = async (employeeId) => {
    setSaving(true);
    try {
      await apiFetch(`/api/user-admin/employees/${employeeId}/resend-invite`, { method: 'POST' });
      addToast('Đã gửi lại email mời', 'success');
      await loadEmployees();
    } catch (error) {
      addToast(error.message || 'Không thể gửi lại email mời', 'error');
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (employeeId, file) => {
    if (!file) return;
    setAvatarUploading(true);
    const body = new FormData();
    body.append('file', file);
    try {
      await apiFetch(`/api/finance/employees/${employeeId}/avatar`, { method: 'POST', body });
      addToast('Đã cập nhật ảnh đại diện', 'success');
      await loadEmployees();
    } catch (error) {
      addToast(error.message || 'Không thể tải ảnh lên', 'error');
    } finally {
      setAvatarUploading(false);
    }
  };

  const filteredEmployees = employees.filter((employee) => {
    const keyword = search.trim().toLocaleLowerCase('vi');
    const searchable = [employee.id, employee.full_name, employee.department, employee.job_title]
      .filter(Boolean).join(' ').toLocaleLowerCase('vi');
    const matchesSearch = !keyword || searchable.includes(keyword);
    const matchesDepartment = departmentFilter === 'All' || employee.department_id === departmentFilter;
    return matchesSearch && matchesDepartment;
  });

  const hasSelection = mode === 'create' || Boolean(selectedEmployee);

  return (
    <div className={`hr-workspace${hasSelection ? ' has-selection' : ''}`}>
      {/* ── List (left) ── */}
      <aside className="hr-list">
        <div className="hr-list__header">
          <div className="hr-list__title-row">
            <h3><Users size={18} /> Nhân sự</h3>
            <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
              <UserPlus size={14} /> Thêm
            </button>
          </div>
          <select
            className="form-control"
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          >
            <option value="All">Tất cả phòng ban</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
          <div className="hr-list__search">
            <Search size={16} />
            <input
              className="form-control"
              style={{ textAlign: 'left' }}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm kiếm..."
            />
          </div>
        </div>

        <div className="hr-list__items">
          {loading && <div className="hr-list__empty">Đang tải...</div>}
          {!loading && filteredEmployees.length === 0 && (
            <div className="hr-list__empty">Chưa có nhân sự</div>
          )}
          {!loading && filteredEmployees.map((employee) => (
            <button
              type="button"
              key={employee.id}
              className={`hr-list__item${employee.id === selectedId && mode !== 'create' ? ' active' : ''}`}
              onClick={() => { setSelectedId(employee.id); setMode('view'); }}
            >
              <Avatar name={employee.full_name} avatarUrl={employee.avatar_url} size={40} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="hr-list__item-name">{employee.full_name}</div>
                <div className="hr-list__item-sub">{employee.job_title || employee.department || '—'}</div>
              </div>
              {!employee.is_active && <Badge variant="neutral" size="sm">Nghỉ</Badge>}
            </button>
          ))}
        </div>
      </aside>

      {/* ── Detail (right) ── */}
      <section className="hr-detail">
        {mode !== 'create' && !selectedEmployee && (
          <div className="hr-detail__empty">Chọn một nhân viên để xem chi tiết</div>
        )}

        {(mode === 'create' || selectedEmployee) && (
          <form onSubmit={submitEmployee}>
            <button
              type="button"
              className="btn btn-icon btn-sm btn-ghost hr-detail__back"
              onClick={() => { setSelectedId(null); setMode('view'); }}
              aria-label="Quay lại danh sách"
            >
              <ArrowLeft size={18} />
            </button>

            <div className="hr-detail__hero">
              <div className="hr-detail__hero-avatar-wrap">
                {mode !== 'create' ? (
                  <AvatarImage
                    className="hr-detail__hero-avatar hr-detail__hero-avatar--img"
                    fallbackClassName="hr-detail__hero-avatar"
                    src={selectedEmployee.avatar_url}
                    name={selectedEmployee.full_name}
                    fallbackStyle={{ background: 'linear-gradient(135deg, var(--orange-400), var(--orange-600))' }}
                  />
                ) : (
                  <div
                    className="hr-detail__hero-avatar"
                    style={{ background: `linear-gradient(135deg, var(--orange-400), var(--orange-600))` }}
                  >
                    {mode === 'create' ? <UserPlus size={48} /> : initialsOf(selectedEmployee.full_name)}
                  </div>
                )}
                {mode !== 'create' && (
                  <label className="hr-detail__hero-avatar-upload" title="Đổi ảnh đại diện" aria-label="Đổi ảnh đại diện">
                    {avatarUploading ? '…' : <Camera size={16} />}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      hidden
                      disabled={avatarUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        uploadAvatar(selectedEmployee.id, file);
                      }}
                    />
                  </label>
                )}
              </div>
              <h2 className="hr-detail__hero-name">
                {mode === 'create' ? 'Thêm nhân sự mới' : selectedEmployee.full_name}
              </h2>
              {mode !== 'create' && (
                <div className="hr-detail__hero-badges">
                  <Badge variant={selectedEmployee.is_active ? 'success' : 'neutral'} dot>
                    {selectedEmployee.is_active ? 'Đang làm' : 'Nghỉ'}
                  </Badge>
                  <Badge variant={contractStatusVariants[selectedEmployee.contract_status] || 'neutral'}>
                    {contractStatusLabels[selectedEmployee.contract_status] || selectedEmployee.contract_status}
                  </Badge>
                </div>
              )}
            </div>

            <div className="hr-detail__actions">
              {mode === 'view' && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(selectedEmployee)}>
                    <Pencil size={14} /> Sửa
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handlePrintEmployee}>
                    <Printer size={14} /> In
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ color: 'var(--red-500)' }}
                    onClick={() => setDeleteTarget(selectedEmployee)}
                  >
                    <Trash2 size={14} /> Xoá
                  </button>
                </>
              )}
              {(mode === 'edit' || mode === 'create') && (
                <>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                    <Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={cancelForm}>
                    <X size={14} /> Huỷ
                  </button>
                </>
              )}
            </div>

            <div className="hr-detail__body">
              <Divider label="Thông Tin Chung" style={{ marginTop: 0 }} />
              {mode === 'view' ? (
                <FormGrid cols={2}>
                  <Field label="Họ và tên" value={selectedEmployee.full_name} />
                  <Field label="Mã nhân sự" value={selectedEmployee.id} />
                  <Field label="Phòng ban" value={selectedEmployee.department} />
                  <Field label="Chức danh" value={selectedEmployee.job_title} />
                  <Field label="Email" value={selectedEmployee.email} />
                  <Field label="Số điện thoại" value={selectedEmployee.phone} />
                </FormGrid>
              ) : (
                <FormGrid cols={2}>
                  <FormRow label="Họ và tên" required cols={2} align="left">
                    <input
                      className="form-control"
                      required
                      maxLength={200}
                      value={form.full_name}
                      onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                      placeholder="Nguyễn Văn A"
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
                  <FormRow label="Chức danh" align="left">
                    <input
                      className="form-control"
                      maxLength={100}
                      value={form.job_title}
                      onChange={(event) => setForm({ ...form, job_title: event.target.value })}
                      placeholder="Kỹ thuật viên đo đạc"
                    />
                  </FormRow>
                  <FormRow label="Email" align="left">
                    <input
                      className="form-control"
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      placeholder="ten.nv@bachkhoa.local"
                    />
                  </FormRow>
                  <FormRow label="Số điện thoại" align="left">
                    <input
                      className="form-control"
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      placeholder="09xxxxxxxx"
                    />
                  </FormRow>
                </FormGrid>
              )}

              <Divider label="Hợp Đồng" />
              {mode === 'view' ? (
                <FormGrid cols={2}>
                  <Field label="Loại hợp đồng" value={contractStatusLabels[selectedEmployee.contract_status]} />
                  <Field label="Trạng thái làm việc" value={selectedEmployee.is_active ? 'Đang làm việc' : 'Ngừng hoạt động'} />
                  <Field label="Ngày vào làm" value={formatDate(selectedEmployee.join_date)} />
                  <Field label="Lương cơ bản" value={fmt(selectedEmployee.base_salary)} />
                </FormGrid>
              ) : (
                <FormGrid cols={2}>
                  <FormRow label="Loại hợp đồng" required>
                    <select
                      className="form-control"
                      required
                      value={form.contract_status}
                      onChange={(event) => {
                        const value = event.target.value;
                        setForm({ ...form, contract_status: value, is_active: value === 'Terminated' ? false : form.is_active });
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
                  <FormRow label="Lương cơ bản (VNĐ)">
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
              )}

              <Divider label="Cá Nhân" />
              {mode === 'view' ? (
                <FormGrid cols={2}>
                  <Field label="Giới tính" value={genderLabels[selectedEmployee.gender]} />
                  <Field label="Ngày sinh" value={formatDate(selectedEmployee.date_of_birth)} />
                  <Field label="Nơi sinh" value={selectedEmployee.place_of_birth} />
                </FormGrid>
              ) : (
                <FormGrid cols={2}>
                  <FormRow label="Giới tính">
                    <select
                      className="form-control"
                      value={form.gender}
                      onChange={(event) => setForm({ ...form, gender: event.target.value })}
                    >
                      <option value="">— Chưa chọn —</option>
                      {Object.entries(genderLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </FormRow>
                  <FormRow label="Ngày sinh">
                    <input
                      className="form-control"
                      type="date"
                      value={form.date_of_birth}
                      onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })}
                    />
                  </FormRow>
                  <FormRow label="Nơi sinh" align="left">
                    <input
                      className="form-control"
                      maxLength={200}
                      value={form.place_of_birth}
                      onChange={(event) => setForm({ ...form, place_of_birth: event.target.value })}
                      placeholder="Hà Nội"
                    />
                  </FormRow>
                </FormGrid>
              )}

              {mode !== 'create' && (
                <>
                  <Divider label="Tài Khoản Đăng Nhập" />
                  <div className="hr-detail__account-row">
                    {selectedEmployee.account_username && !selectedEmployee.account_email_verified ? (
                      <>
                        <Badge variant="warning" dot>
                          {selectedEmployee.account_username} — Chờ xác thực
                        </Badge>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={saving}
                          onClick={() => resendInvite(selectedEmployee.id)}
                        >
                          <Mail size={14} /> Gửi lại email mời
                        </button>
                      </>
                    ) : selectedEmployee.account_username ? (
                      <>
                        <Badge variant={selectedEmployee.account_is_active ? 'success' : 'danger'} dot>
                          {selectedEmployee.account_username}
                        </Badge>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setAccountStatusTarget(selectedEmployee)}
                          style={{ color: selectedEmployee.account_is_active ? 'var(--red-500)' : 'var(--green-500)' }}
                        >
                          {selectedEmployee.account_is_active ? <Lock size={14} /> : <Unlock size={14} />}
                          {selectedEmployee.account_is_active ? 'Khoá tài khoản' : 'Kích hoạt'}
                        </button>
                      </>
                    ) : (
                      <>
                        <Badge variant="neutral">Chưa có tài khoản</Badge>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAccountTarget(selectedEmployee)}>
                          <UserCog size={14} /> Tạo tài khoản
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </form>
        )}
      </section>

      {selectedEmployee && mode === 'view' && (
        <div aria-hidden="true" style={{ position: 'fixed', left: '-100000px', top: 0, width: '182mm', pointerEvents: 'none' }}>
          <EmployeePrintProfile employee={selectedEmployee} documentRef={printDocumentRef} />
        </div>
      )}

      {accountTarget && (
        <CreateAccountModal
          employee={accountTarget}
          onClose={() => setAccountTarget(null)}
          onCreated={() => { setAccountTarget(null); loadEmployees(); }}
        />
      )}

      {createPortal(
        <Modal
          open={Boolean(accountStatusTarget)}
          onClose={() => !saving && setAccountStatusTarget(null)}
          size="sm"
          closeOnOverlay={!saving}
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserCog size={20} />
              {accountStatusTarget?.account_is_active ? 'Khoá tài khoản' : 'Kích hoạt tài khoản'}
            </span>
          }
        >
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {accountStatusTarget?.account_is_active
              ? <>Khoá tài khoản <strong>{accountStatusTarget?.account_username}</strong>? Nhân viên sẽ không đăng nhập được cho tới khi được kích hoạt lại.</>
              : <>Kích hoạt lại tài khoản <strong>{accountStatusTarget?.account_username}</strong>?</>}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setAccountStatusTarget(null)}>
              Hủy bỏ
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={toggleAccountStatus}
              style={accountStatusTarget?.account_is_active ? { background: 'var(--red-500)', borderColor: 'var(--red-500)' } : undefined}
            >
              {saving ? 'Đang xử lý...' : accountStatusTarget?.account_is_active ? 'Khoá tài khoản' : 'Kích hoạt'}
            </button>
          </div>
        </Modal>,
        document.body,
      )}

      {createPortal(
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
        </Modal>,
        document.body,
      )}
    </div>
  );
}
