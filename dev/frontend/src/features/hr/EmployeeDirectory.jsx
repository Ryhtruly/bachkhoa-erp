import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRightLeft, Camera, Lock, Mail, Pencil, Printer, Save, Search,
  Trash2, Unlock, UserCog, UserPlus, Users, X,
} from 'lucide-react';
import { Badge, CustomSelect, DatePicker, Divider, FormGrid, FormRow, Modal } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';
import { initialsOf } from '../../lib/avatar';
import AvatarImage from '../../components/AvatarImage';
import { printElement } from '../../components/finance/print/printDocument';
import EmployeePrintProfile from './EmployeePrintProfile';
import EmployeeHandoverModal from './EmployeeHandoverModal';
import employeeProfilePrintStyles from './employeeProfile.print.css?inline';
import {
  ACCOUNT_ROLE_OPTIONS,
  defaultAccountRoleForDepartment,
  getAccountRoleLabel,
  isRoleMismatchedWithDepartment,
} from './accountRoles';
import { normalizeVietnamese } from '../../lib/vietnamese';
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
  citizen_id: '',
  citizen_id_date: '',
  citizen_id_place: '',
  hometown: '',
  ethnicity: 'Kinh',
  marital_status: 'Độc thân',
  personal_email: '',
  permanent_address: '',
  current_address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  bank_account_no: '',
  bank_name: '',
  bank_branch: '',
  tax_code: '',
  social_insurance_no: '',
});
const contractStatusLabels = { Probation: 'Thử việc', Official: 'Chính thức', Terminated: 'Đã nghỉ' };
const contractStatusVariants = { Probation: 'warning', Official: 'success', Terminated: 'neutral' };
const genderLabels = { male: 'Nam', female: 'Nữ', other: 'Khác' };

const CONTRACT_STATUS_OPTIONS = [
  { value: 'Probation', label: 'Thử việc' },
  { value: 'Official', label: 'Chính thức' },
  { value: 'Terminated', label: 'Đã nghỉ' },
];

const WORKING_STATUS_OPTIONS = [
  { value: 'true', label: 'Đang làm việc' },
  { value: 'false', label: 'Ngừng hoạt động' },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
];

const MARITAL_STATUS_OPTIONS = [
  { value: 'Độc thân', label: 'Độc thân' },
  { value: 'Đã kết hôn', label: 'Đã kết hôn' },
  { value: 'Ly hôn', label: 'Ly hôn' },
  { value: 'Góa', label: 'Góa' },
  { value: 'Khác', label: 'Khác' },
];

const ETHNICITY_OPTIONS = [
  'Kinh', 'Tày', 'Thái', 'Mường', "H'Mông", 'Dao', 'Khơ Me', 'Nùng', 'Hoa',
  'Gia Rai', 'Ê Đê', 'Ba Na', 'Xơ Đăng', 'Sán Chay', 'Cơ Ho', 'Chăm',
  'Sán Dìu', 'Hrê', 'Ra Glai', "M'Nông", "X'Tiêng", 'Khác',
].map((e) => ({ value: e, label: e }));

const VIETNAM_PROVINCES = [
  'An Giang', 'Bà Rịa - Vũng Tàu', 'Bắc Giang', 'Bắc Kạn', 'Bạc Liêu', 'Bắc Ninh',
  'Bến Tre', 'Bình Định', 'Bình Dương', 'Bình Phước', 'Bình Thuận', 'Cà Mau',
  'Cần Thơ', 'Cao Bằng', 'Đà Nẵng', 'Đắk Lắk', 'Đắk Nông', 'Điện Biên',
  'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Giang', 'Hà Nam', 'Hà Nội',
  'Hà Tĩnh', 'Hải Dương', 'Hải Phòng', 'Hậu Giang', 'Hòa Bình', 'Hưng Yên',
  'Khánh Hòa', 'Kiên Giang', 'Kon Tum', 'Lai Châu', 'Lâm Đồng', 'Lạng Sơn',
  'Lào Cai', 'Long An', 'Nam Định', 'Nghệ An', 'Ninh Bình', 'Ninh Thuận',
  'Phú Thọ', 'Phú Yên', 'Quảng Bình', 'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh',
  'Quảng Trị', 'Sóc Trăng', 'Sơn La', 'Tây Ninh', 'Thái Bình', 'Thái Nguyên',
  'Thanh Hóa', 'Thừa Thiên Huế', 'Tiền Giang', 'TP Hồ Chí Minh', 'Trà Vinh', 'Tuyên Quang',
  'Vĩnh Long', 'Vĩnh Phúc', 'Yên Bái',
];

const PROVINCE_OPTIONS = VIETNAM_PROVINCES.map((p) => ({ value: p, label: p }));

const VIETNAM_BANKS = [
  { value: 'Vietcombank', label: 'Vietcombank (Ngoại thương)' },
  { value: 'VietinBank', label: 'VietinBank (Công thương)' },
  { value: 'BIDV', label: 'BIDV (Đầu tư & Phát triển)' },
  { value: 'Agribank', label: 'Agribank (Nông nghiệp)' },
  { value: 'Techcombank', label: 'Techcombank (Kỹ thương)' },
  { value: 'MB Bank', label: 'MB Bank (Quân đội)' },
  { value: 'ACB', label: 'ACB (Á Châu)' },
  { value: 'VPBank', label: 'VPBank (Việt Nam Thịnh Vượng)' },
  { value: 'TPBank', label: 'TPBank (Tiên Phong)' },
  { value: 'Sacombank', label: 'Sacombank (Sài Gòn Thương Tín)' },
  { value: 'VIB', label: 'VIB (Quốc tế)' },
  { value: 'SHB', label: 'SHB (Sài Gòn - Hà Nội)' },
  { value: 'HDBank', label: 'HDBank (Phát triển TP.HCM)' },
  { value: 'MSB', label: 'MSB (Hàng Hải)' },
  { value: 'OCB', label: 'OCB (Phương Đông)' },
  { value: 'SeABank', label: 'SeABank (Đông Nam Á)' },
  { value: 'LPBank', label: 'LPBank (Lộc Phát Việt Nam)' },
  { value: 'PVcomBank', label: 'PVcomBank (Đại Chúng)' },
  { value: 'Bac A Bank', label: 'Bac A Bank (Bắc Á)' },
  { value: 'Nam A Bank', label: 'Nam A Bank (Nam Á)' },
  { value: 'BaoViet Bank', label: 'BaoViet Bank (Bảo Việt)' },
  { value: 'Saigonbank', label: 'Saigonbank (Sài Gòn Công Thương)' },
  { value: 'Kienlongbank', label: 'Kienlongbank (Kiên Long)' },
  { value: 'BVBank', label: 'BVBank (Bản Việt)' },
  { value: 'Shinhan Bank', label: 'Shinhan Bank Việt Nam' },
  { value: 'Woori Bank', label: 'Woori Bank Việt Nam' },
  { value: 'Standard Chartered', label: 'Standard Chartered' },
  { value: 'HSBC', label: 'HSBC Việt Nam' },
  { value: 'Khác', label: 'Ngân hàng khác' },
];

const isDirector = (emp, departments = []) => {
  if (!emp) return false;
  if (emp.id === 'emp_director') return true;
  const deptName = departments?.find((d) => d.id === emp.department_id)?.name || emp.department || '';
  if (deptName.toLowerCase().includes('giám đốc') || deptName.toLowerCase().includes('giam doc')) return true;
  const title = (emp.job_title || '').toLowerCase();
  if (title.includes('giám đốc') || title.includes('giam doc')) return true;
  return false;
};
const formatDate = (value) => value
  ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${value}T00:00:00`))
  : null;
const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + '₫';

function Avatar({ name, avatarUrl, size = 40 }) {
  return <AvatarImage className="hr-avatar" src={avatarUrl} name={name} loading="lazy" style={{ width: size, height: size, objectFit: 'cover', fontSize: size * 0.4 }} />;
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

function CreateAccountModal({ employee, departments = [], onClose, onCreated }) {
  const { addToast } = useToast();
  const departmentName =
    departments?.find((d) => d.id === employee?.department_id)?.name ||
    employee?.department ||
    'phòng ban hiện tại';
  const defaultRole = defaultAccountRoleForDepartment(employee?.department_id, departmentName);
  const [form, setForm] = useState({
    username: '',
    email: employee?.email || '',
    role_name: defaultRole,
  });
  const [saving, setSaving] = useState(false);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);

  const isMismatched = isRoleMismatchedWithDepartment(form.role_name, employee?.department_id, departmentName);
  const selectedRoleLabel = getAccountRoleLabel(form.role_name);
  const defaultRoleLabel = getAccountRoleLabel(defaultRole);

  const canSubmit = !saving && (!isMismatched || overrideConfirmed);

  const submit = async (event) => {
    event.preventDefault();
    if (isMismatched && !overrideConfirmed) {
      addToast('Vui lòng xác nhận cấp quyền ngoại lệ khác phòng ban trước khi tạo tài khoản', 'warning');
      return;
    }
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
          <FormRow
            label="Vai trò hệ thống"
            required
            hint="Mặc định chọn theo phòng ban; nếu đổi vai trò khác cần xác nhận ngoại lệ"
            align="left"
          >
            <CustomSelect
              value={form.role_name}
              onChange={(val) => {
                setForm({ ...form, role_name: val });
                setOverrideConfirmed(false);
              }}
              placeholder="Chọn vai trò"
              options={ACCOUNT_ROLE_OPTIONS}
            />
          </FormRow>
        </FormGrid>

        {isMismatched && (
          <div
            style={{
              marginTop: 16,
              padding: '14px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <AlertTriangle size={20} style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, lineHeight: 1.5, color: '#92400e' }}>
                <strong>Cảnh báo phân quyền:</strong> Nhân sự này thuộc{' '}
                <strong>{departmentName}</strong> (vai trò chuẩn:{' '}
                <em>{defaultRoleLabel || 'chưa gán'}</em>), nhưng đang được chỉ định vai trò{' '}
                <strong>{selectedRoleLabel}</strong>. Việc này sẽ cấp quyền truy cập vào các chức năng và dữ liệu ngoài phạm vi chuyên môn của phòng ban.
              </div>
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: '#78350f',
                cursor: 'pointer',
                paddingTop: 8,
                borderTop: '1px dashed rgba(245, 158, 11, 0.4)',
              }}
            >
              <input
                type="checkbox"
                checked={overrideConfirmed}
                onChange={(e) => setOverrideConfirmed(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#d97706' }}
              />
              Tôi xác nhận cấp quyền ngoại lệ khác phòng ban cho nhân sự này
            </label>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-default)' }}>
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>
            Hủy bỏ
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canSubmit}
            title={isMismatched && !overrideConfirmed ? 'Vui lòng tích xác nhận phân quyền ngoại lệ trước khi tạo tài khoản' : undefined}
          >
            {saving ? 'Đang tạo...' : 'Tạo tài khoản'}
          </button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}

export default function EmployeeDirectory({
  initialDepartmentFilter = 'All',
  onDepartmentFilterChange,
}) {
  const { addToast } = useToast();
  const printDocumentRef = useRef(null);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState(initialDepartmentFilter || 'All');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'inactive' | 'all'

  useEffect(() => {
    if (initialDepartmentFilter) {
      setDepartmentFilter(initialDepartmentFilter);
    }
  }, [initialDepartmentFilter]);
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'create'
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [accountTarget, setAccountTarget] = useState(null);
  const [accountStatusTarget, setAccountStatusTarget] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [form, setForm] = useState(emptyEmployeeForm);
  const [handoverTarget, setHandoverTarget] = useState(null);

  const openHandoverFor = async (employee, { defaultDeactivate = false, onSuccess } = {}) => {
    if (!employee) return;
    setSaving(true);
    try {
      const workload = await apiFetch(`/api/finance/employees/${employee.id}/workload`);
      setHandoverTarget({ employee, workload, defaultDeactivate, onSuccess });
    } catch (err) {
      addToast(err.message || 'Không thể kiểm tra công việc tồn đọng', 'error');
    } finally {
      setSaving(false);
    }
  };

  const loadDepartments = useCallback(async () => {
    try {
      const departmentData = await apiFetch('/api/finance/employees/departments');
      setDepartments(Array.isArray(departmentData) ? departmentData : []);
    } catch {
      // Fail-safe if departments cannot be loaded
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const employeeData = await apiFetch('/api/finance/employees');
      setEmployees(Array.isArray(employeeData) ? employeeData : []);
    } catch (error) {
      addToast(error.message || 'Không thể tải dữ liệu nhân sự', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadDepartments();
    loadEmployees();
  }, [loadDepartments, loadEmployees]);

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
      citizen_id: employee.citizen_id || '',
      citizen_id_date: employee.citizen_id_date || '',
      citizen_id_place: employee.citizen_id_place || '',
      hometown: employee.hometown || '',
      ethnicity: employee.ethnicity || 'Kinh',
      marital_status: employee.marital_status || 'Độc thân',
      personal_email: employee.personal_email || '',
      permanent_address: employee.permanent_address || '',
      current_address: employee.current_address || '',
      emergency_contact_name: employee.emergency_contact_name || '',
      emergency_contact_phone: employee.emergency_contact_phone || '',
      bank_account_no: employee.bank_account_no || '',
      bank_name: employee.bank_name || '',
      bank_branch: employee.bank_branch || '',
      tax_code: employee.tax_code || '',
      social_insurance_no: employee.social_insurance_no || '',
    });
    setMode('edit');
  };

  const cancelForm = () => {
    setMode('view');
  };

  const submitEmployee = async (event) => {
    event.preventDefault();
    setSaving(true);
    const isDir = isDirector(form, departments);
    const payload = {
      full_name: form.full_name,
      department_id: form.department_id || null,
      job_title: form.job_title || null,
      contract_status: isDir ? 'Official' : form.contract_status,
      join_date: form.join_date || null,
      probation_end_date: isDir ? null : (form.probation_end_date || null),
      base_salary: Number(form.base_salary || 0),
      is_active: Boolean(form.is_active),
      email: form.email || null,
      phone: form.phone || null,
      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,
      place_of_birth: form.place_of_birth || null,
      citizen_id: form.citizen_id || null,
      citizen_id_date: form.citizen_id_date || null,
      citizen_id_place: form.citizen_id_place || null,
      hometown: form.hometown || null,
      ethnicity: form.ethnicity || null,
      marital_status: form.marital_status || null,
      personal_email: form.personal_email || null,
      permanent_address: form.permanent_address || null,
      current_address: form.current_address || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      bank_account_no: form.bank_account_no || null,
      bank_name: form.bank_name || null,
      bank_branch: form.bank_branch || null,
      tax_code: form.tax_code || null,
      social_insurance_no: form.social_insurance_no || null,
    };

    if (mode === 'edit' && selectedId) {
      const wasActive = selectedEmployee?.is_active !== false;
      const willBeInactive = !form.is_active || form.contract_status === 'Terminated';
      if (wasActive && willBeInactive) {
        try {
          const workload = await apiFetch(`/api/finance/employees/${selectedId}/workload`);
          if (workload?.has_active_work) {
            setSaving(false);
            setHandoverTarget({
              employee: selectedEmployee,
              workload,
              defaultDeactivate: true,
              onSuccess: async () => {
                await apiFetch(`/api/finance/employees/${selectedId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...payload, is_active: false }),
                });
                setMode('view');
                await loadEmployees();
              },
            });
            return;
          }
        } catch (e) {
          // Continue normal save if workload check fails
        }
      }
    }

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
    const action = accountStatusTarget.account_is_active ? 'deactivate' : 'activate';
    if (action === 'deactivate') {
      try {
        setSaving(true);
        const workload = await apiFetch(`/api/finance/employees/${accountStatusTarget.id}/workload`);
        if (workload?.has_active_work) {
          const target = accountStatusTarget;
          setAccountStatusTarget(null);
          setHandoverTarget({
            employee: target,
            workload,
            defaultDeactivate: true,
            onSuccess: async () => {
              addToast('Đã chuyển giao công việc và khoá tài khoản', 'success');
              await loadEmployees();
            },
          });
          return;
        }
      } catch (e) {
        // Fall back to normal toggle if workload check fails
      } finally {
        setSaving(false);
      }
    }

    setSaving(true);
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

  const statusCounts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const emp of employees) {
      if (departmentFilter === 'All' || emp.department_id === departmentFilter) {
        if (emp.is_active !== false) {
          active += 1;
        } else {
          inactive += 1;
        }
      }
    }
    return { active, inactive, all: active + inactive };
  }, [employees, departmentFilter]);

  const filteredEmployees = useMemo(() => {
    const keyword = normalizeVietnamese(search);
    return employees.filter((employee) => {
      const matchesDepartment = departmentFilter === 'All' || employee.department_id === departmentFilter;
      if (!matchesDepartment) return false;

      const isActive = employee.is_active !== false;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && isActive) ||
        (statusFilter === 'inactive' && !isActive);
      if (!matchesStatus) return false;

      if (!keyword) return true;
      const searchable = normalizeVietnamese(
        [employee.id, employee.full_name, employee.department, employee.job_title, employee.email, employee.phone]
          .filter(Boolean)
          .join(' ')
      );
      return searchable.includes(keyword);
    });
  }, [employees, search, departmentFilter, statusFilter]);

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
          <CustomSelect
            value={departmentFilter}
            onChange={(val) => {
              setDepartmentFilter(val);
              onDepartmentFilterChange?.(val);
            }}
            options={[
              { value: 'All', label: 'Tất cả phòng ban' },
              ...departments.map((department) => ({
                value: department.id,
                label: `${department.name}${department.is_active === false ? ' (Tạm ngừng)' : ''}`,
              })),
            ]}
            placeholder="Tất cả phòng ban"
          />
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
          <div className="hr-list__status-filters" role="tablist" aria-label="Lọc theo trạng thái làm việc">
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'active'}
              className={`hr-list__status-btn${statusFilter === 'active' ? ' is-active' : ''}`}
              onClick={() => setStatusFilter('active')}
            >
              Đang làm <span className="hr-list__status-count">{statusCounts.active}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'inactive'}
              className={`hr-list__status-btn${statusFilter === 'inactive' ? ' is-active' : ''}`}
              onClick={() => setStatusFilter('inactive')}
            >
              Đã nghỉ <span className="hr-list__status-count">{statusCounts.inactive}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === 'all'}
              className={`hr-list__status-btn${statusFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              Tất cả <span className="hr-list__status-count">{statusCounts.all}</span>
            </button>
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
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openHandoverFor(selectedEmployee, { defaultDeactivate: false })}
                    title="Chuyển giao công việc đang phụ trách"
                  >
                    <ArrowRightLeft size={14} /> Chuyển giao việc
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
              {/* ── Section 1: Thông Tin Chung & Công Việc ── */}
              <Divider label="Thông Tin Chung & Công Việc" style={{ marginTop: 0 }} />
              {mode === 'view' ? (
                <FormGrid cols={2}>
                  <Field label="Họ và tên" value={selectedEmployee.full_name} />
                  <Field label="Mã nhân sự" value={selectedEmployee.id} />
                  <Field label="Phòng ban" value={selectedEmployee.department} />
                  <Field label="Chức danh" value={selectedEmployee.job_title} />
                  <Field label="Loại hợp đồng" value={contractStatusLabels[selectedEmployee.contract_status] || selectedEmployee.contract_status} />
                  <Field label="Trạng thái làm việc" value={selectedEmployee.is_active ? 'Đang làm việc' : 'Ngừng hoạt động'} />
                  <Field label="Ngày vào làm" value={formatDate(selectedEmployee.join_date)} />
                  {!isDirector(selectedEmployee, departments) && (
                    <Field label="Ngày hết hạn thử việc" value={formatDate(selectedEmployee.probation_end_date)} />
                  )}
                  <Field label="Lương cơ bản" value={fmt(selectedEmployee.base_salary)} />
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
                    <CustomSelect
                      value={form.department_id}
                      onChange={(val) => setForm({ ...form, department_id: val })}
                      options={[
                        { value: '', label: '— Chưa phân phòng —' },
                        ...departments.map((department) => ({
                          value: department.id,
                          label: `${department.name}${department.is_active === false ? ' (Tạm ngừng)' : ''}`,
                          disabled: mode === 'create' && department.is_active === false,
                        })),
                      ]}
                      placeholder="— Chưa phân phòng —"
                    />
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
                  <FormRow
                    label="Loại hợp đồng"
                    required
                    hint={isDirector(form, departments) ? 'Giám đốc không áp dụng thử việc' : undefined}
                  >
                    {isDirector(form, departments) ? (
                      <input className="form-control" value="Chính thức (Giám đốc)" disabled readOnly />
                    ) : (
                      <CustomSelect
                        value={form.contract_status}
                        onChange={(val) => {
                          setForm({
                            ...form,
                            contract_status: val,
                            is_active: val === 'Terminated' ? false : form.is_active,
                          });
                        }}
                        options={CONTRACT_STATUS_OPTIONS}
                        placeholder="Chọn loại hợp đồng"
                      />
                    )}
                  </FormRow>
                  <FormRow label="Trạng thái làm việc" required>
                    <CustomSelect
                      value={form.is_active ? 'true' : 'false'}
                      onChange={(val) => setForm({ ...form, is_active: val === 'true' })}
                      options={WORKING_STATUS_OPTIONS}
                      placeholder="Chọn trạng thái"
                    />
                  </FormRow>
                  <FormRow label="Ngày vào làm">
                    <DatePicker
                      className="date-picker--fill"
                      value={form.join_date}
                      onChange={(val) => setForm({ ...form, join_date: val })}
                      placeholder="Chọn ngày vào làm"
                    />
                  </FormRow>
                  {!isDirector(form, departments) && (
                    <FormRow
                      label="Ngày hết hạn thử việc"
                      hint={form.contract_status === 'Probation' ? 'Thời gian thử việc thông thường 30-60 ngày' : undefined}
                    >
                      <DatePicker
                        className="date-picker--fill"
                        value={form.probation_end_date}
                        onChange={(val) => setForm({ ...form, probation_end_date: val })}
                        placeholder="Chọn hạn thử việc"
                        disabled={form.contract_status !== 'Probation'}
                      />
                    </FormRow>
                  )}
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

              {/* ── Section 2: Thông Tin Định Danh & Cá Nhân ── */}
              <Divider label="Thông Tin Định Danh & Cá Nhân" />
              {mode === 'view' ? (
                <FormGrid cols={2}>
                  <Field label="Số CCCD / CMND" value={selectedEmployee.citizen_id} />
                  <Field label="Ngày cấp CCCD" value={formatDate(selectedEmployee.citizen_id_date)} />
                  <Field label="Nơi cấp CCCD" value={selectedEmployee.citizen_id_place} />
                  <Field label="Quê quán (Nguyên quán)" value={selectedEmployee.hometown} />
                  <Field label="Giới tính" value={genderLabels[selectedEmployee.gender] || selectedEmployee.gender} />
                  <Field label="Ngày sinh" value={formatDate(selectedEmployee.date_of_birth)} />
                  <Field label="Nơi sinh" value={selectedEmployee.place_of_birth} />
                  <Field label="Dân tộc" value={selectedEmployee.ethnicity} />
                  <Field label="Tình trạng hôn nhân" value={selectedEmployee.marital_status} />
                </FormGrid>
              ) : (
                <FormGrid cols={2}>
                  <FormRow label="Số CCCD / CMND" align="left">
                    <input
                      className="form-control"
                      maxLength={20}
                      value={form.citizen_id}
                      onChange={(event) => setForm({ ...form, citizen_id: event.target.value })}
                      placeholder="001xxxxxxxx"
                    />
                  </FormRow>
                  <FormRow label="Ngày cấp CCCD">
                    <DatePicker
                      className="date-picker--fill"
                      value={form.citizen_id_date}
                      onChange={(val) => setForm({ ...form, citizen_id_date: val })}
                      placeholder="Chọn ngày cấp"
                    />
                  </FormRow>
                  <FormRow label="Nơi cấp CCCD" align="left">
                    <input
                      className="form-control"
                      maxLength={255}
                      value={form.citizen_id_place}
                      onChange={(event) => setForm({ ...form, citizen_id_place: event.target.value })}
                      placeholder="Cục Cảnh sát QLHC về TTXH"
                    />
                  </FormRow>
                  <FormRow label="Quê quán (Nguyên quán)" align="left">
                    <input
                      className="form-control"
                      maxLength={255}
                      value={form.hometown}
                      onChange={(event) => setForm({ ...form, hometown: event.target.value })}
                      placeholder="Xã/Phường, Quận/Huyện, Tỉnh/Thành"
                    />
                  </FormRow>
                  <FormRow label="Giới tính">
                    <CustomSelect
                      value={form.gender}
                      onChange={(val) => setForm({ ...form, gender: val })}
                      options={[
                        { value: '', label: '— Chưa chọn —' },
                        ...GENDER_OPTIONS,
                      ]}
                      placeholder="Chọn giới tính"
                    />
                  </FormRow>
                  <FormRow label="Ngày sinh">
                    <DatePicker
                      className="date-picker--fill"
                      value={form.date_of_birth}
                      onChange={(val) => setForm({ ...form, date_of_birth: val })}
                      placeholder="Chọn ngày sinh"
                      placement="top"
                    />
                  </FormRow>
                  <FormRow label="Nơi sinh" align="left">
                    <CustomSelect
                      value={form.place_of_birth || ''}
                      onChange={(val) => setForm({ ...form, place_of_birth: val })}
                      options={[
                        { value: '', label: '— Chọn tỉnh / thành phố —' },
                        ...(form.place_of_birth && !VIETNAM_PROVINCES.includes(form.place_of_birth)
                          ? [{ value: form.place_of_birth, label: form.place_of_birth }]
                          : []),
                        ...PROVINCE_OPTIONS,
                      ]}
                      searchable
                      placeholder="— Chọn tỉnh / thành phố —"
                    />
                  </FormRow>
                  <FormRow label="Dân tộc">
                    <CustomSelect
                      value={form.ethnicity}
                      onChange={(val) => setForm({ ...form, ethnicity: val })}
                      options={ETHNICITY_OPTIONS}
                      searchable
                      placeholder="Chọn dân tộc"
                    />
                  </FormRow>
                  <FormRow label="Tình trạng hôn nhân">
                    <CustomSelect
                      value={form.marital_status}
                      onChange={(val) => setForm({ ...form, marital_status: val })}
                      options={MARITAL_STATUS_OPTIONS}
                      placeholder="Chọn tình trạng hôn nhân"
                    />
                  </FormRow>
                </FormGrid>
              )}

              {/* ── Section 3: Cư Trú & Thông Tin Liên Hệ ── */}
              <Divider label="Cư Trú & Thông Tin Liên Hệ" />
              {mode === 'view' ? (
                <FormGrid cols={2}>
                  <Field label="Số điện thoại" value={selectedEmployee.phone} />
                  <Field label="Email công ty" value={selectedEmployee.email} />
                  <Field label="Email cá nhân" value={selectedEmployee.personal_email} />
                  <Field label="Người liên hệ khẩn cấp" value={selectedEmployee.emergency_contact_name} />
                  <Field label="SĐT người liên hệ khẩn cấp" value={selectedEmployee.emergency_contact_phone} />
                  <div style={{ gridColumn: 'span 2' }}>
                    <Field label="Địa chỉ thường trú (HKTT)" value={selectedEmployee.permanent_address} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <Field label="Chỗ ở hiện tại (Tạm trú)" value={selectedEmployee.current_address} />
                  </div>
                </FormGrid>
              ) : (
                <FormGrid cols={2}>
                  <FormRow label="Số điện thoại" align="left">
                    <input
                      className="form-control"
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      placeholder="09xxxxxxxx"
                    />
                  </FormRow>
                  <FormRow label="Email công ty" align="left">
                    <input
                      className="form-control"
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      placeholder="ten.nv@bachkhoa.local"
                    />
                  </FormRow>
                  <FormRow label="Email cá nhân" align="left">
                    <input
                      className="form-control"
                      type="email"
                      value={form.personal_email}
                      onChange={(event) => setForm({ ...form, personal_email: event.target.value })}
                      placeholder="email.canhan@gmail.com"
                    />
                  </FormRow>
                  <FormRow label="Người liên hệ khẩn cấp" align="left" hint="Họ tên người thân trong trường hợp khẩn cấp">
                    <input
                      className="form-control"
                      maxLength={255}
                      value={form.emergency_contact_name}
                      onChange={(event) => setForm({ ...form, emergency_contact_name: event.target.value })}
                      placeholder="Ví dụ: Nguyễn Văn B (Bố / Vợ)"
                    />
                  </FormRow>
                  <FormRow label="SĐT khẩn cấp" align="left">
                    <input
                      className="form-control"
                      value={form.emergency_contact_phone}
                      onChange={(event) => setForm({ ...form, emergency_contact_phone: event.target.value })}
                      placeholder="09xxxxxxxx"
                    />
                  </FormRow>
                  <FormRow label="Địa chỉ thường trú (HKTT)" cols={2} align="left">
                    <input
                      className="form-control"
                      value={form.permanent_address}
                      onChange={(event) => setForm({ ...form, permanent_address: event.target.value })}
                      placeholder="Số nhà, đường/thôn, phường/xã, quận/huyện, tỉnh/thành phố theo sổ hộ khẩu"
                    />
                  </FormRow>
                  <FormRow label="Chỗ ở hiện tại (Tạm trú)" cols={2} align="left">
                    <input
                      className="form-control"
                      value={form.current_address}
                      onChange={(event) => setForm({ ...form, current_address: event.target.value })}
                      placeholder="Địa chỉ nơi đang sinh sống thực tế hiện tại"
                    />
                  </FormRow>
                </FormGrid>
              )}

              {/* ── Section 4: Tài Khoản Ngân Hàng, Thuế & BHXH ── */}
              <Divider label="Tài Khoản Ngân Hàng, Thuế & BHXH" />
              {mode === 'view' ? (
                <FormGrid cols={2}>
                  <Field label="Số tài khoản ngân hàng" value={selectedEmployee.bank_account_no} />
                  <Field label="Ngân hàng thụ hưởng" value={selectedEmployee.bank_name} />
                  <Field label="Chi nhánh ngân hàng" value={selectedEmployee.bank_branch} />
                  <Field label="Mã số thuế cá nhân" value={selectedEmployee.tax_code} />
                  <Field label="Mã số BHXH" value={selectedEmployee.social_insurance_no} />
                </FormGrid>
              ) : (
                <FormGrid cols={2}>
                  <FormRow label="Số tài khoản ngân hàng" align="left">
                    <input
                      className="form-control"
                      value={form.bank_account_no}
                      onChange={(event) => setForm({ ...form, bank_account_no: event.target.value })}
                      placeholder="Số tài khoản"
                    />
                  </FormRow>
                  <FormRow label="Ngân hàng thụ hưởng">
                    <CustomSelect
                      value={form.bank_name}
                      onChange={(val) => setForm({ ...form, bank_name: val })}
                      options={[
                        { value: '', label: '— Chọn ngân hàng —' },
                        ...(form.bank_name && !VIETNAM_BANKS.some((b) => b.value === form.bank_name)
                          ? [{ value: form.bank_name, label: form.bank_name }]
                          : []),
                        ...VIETNAM_BANKS,
                      ]}
                      searchable
                      placeholder="Chọn ngân hàng"
                    />
                  </FormRow>
                  <FormRow label="Chi nhánh ngân hàng" align="left">
                    <input
                      className="form-control"
                      maxLength={255}
                      value={form.bank_branch}
                      onChange={(event) => setForm({ ...form, bank_branch: event.target.value })}
                      placeholder="Ví dụ: Chi nhánh TP.HCM"
                    />
                  </FormRow>
                  <FormRow label="Mã số thuế cá nhân" align="left">
                    <input
                      className="form-control"
                      maxLength={50}
                      value={form.tax_code}
                      onChange={(event) => setForm({ ...form, tax_code: event.target.value })}
                      placeholder="Mã số thuế (10 chữ số)"
                    />
                  </FormRow>
                  <FormRow label="Mã số BHXH" align="left">
                    <input
                      className="form-control"
                      maxLength={50}
                      value={form.social_insurance_no}
                      onChange={(event) => setForm({ ...form, social_insurance_no: event.target.value })}
                      placeholder="Mã số BHXH (10 chữ số)"
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
          departments={departments}
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
      {handoverTarget && (
        <EmployeeHandoverModal
          isOpen={Boolean(handoverTarget)}
          onClose={() => setHandoverTarget(null)}
          employee={handoverTarget.employee}
          workload={handoverTarget.workload}
          employees={employees}
          defaultDeactivate={handoverTarget.defaultDeactivate}
          onSuccess={async (result) => {
            if (handoverTarget.onSuccess) {
              await handoverTarget.onSuccess(result);
            } else {
              await loadEmployees();
            }
            setHandoverTarget(null);
          }}
        />
      )}
    </div>
  );
}
