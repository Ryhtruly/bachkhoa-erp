import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AlertTriangle, ArrowRight, Building2, Check, CheckCircle2, ListOrdered, Pencil, Power, Search, Tag, Users, XCircle,
} from 'lucide-react';
import { Badge, Modal } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';
import { apiFetch } from '../../lib/api';
import { normalizeVietnamese } from '../../lib/vietnamese';
import './DepartmentManagement.css';

const sanitizeCode = (val) =>
  (val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .slice(0, 30);

export default function DepartmentManagement({ isDirector = false, onNavigateToEmployees }) {
  const toast = useToast();
  const addToastRef = useRef(toast?.addToast);
  addToastRef.current = toast?.addToast;
  const addToast = useCallback((msg, type) => addToastRef.current?.(msg, type), []);

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingDept, setEditingDept] = useState(null);
  const [editForm, setEditForm] = useState({
    code: '',
    name: '',
    display_order: 100,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const totalDepts = Math.max(1, departments.length);

  const loadDepartments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/finance/departments/manage');
      setDepartments(Array.isArray(data) ? data : []);
    } catch (error) {
      addToastRef.current?.(error.message || 'Không thể tải danh sách phòng ban', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  const filteredDepartments = useMemo(() => {
    const q = normalizeVietnamese(search);
    if (!q) return departments;
    return departments.filter(
      d => (d.name && normalizeVietnamese(d.name).includes(q)) ||
           (d.code && normalizeVietnamese(d.code).includes(q))
    );
  }, [departments, search]);

  const activeCount = useMemo(
    () => departments.filter(d => d.is_active).length,
    [departments]
  );

  const openEditModal = (dept) => {
    setEditingDept(dept);
    setEditForm({
      code: dept.code || '',
      name: dept.name || '',
      display_order: dept.display_order != null ? dept.display_order : 100,
      is_active: dept.is_active != null ? Boolean(dept.is_active) : true,
    });
  };

  const handleSaveEdit = async (e) => {
    e?.preventDefault?.();
    if (!editingDept) return;
    const cleanCode = sanitizeCode(editForm.code);
    if (!cleanCode) {
      addToast('Mã phòng ban không được để trống', 'error');
      return;
    }
    if (!/^[A-Z0-9_]{2,30}$/.test(cleanCode)) {
      addToast('Mã phòng ban chỉ gồm chữ in hoa, chữ số và gạch dưới (2-30 ký tự)', 'error');
      return;
    }
    const cleanName = editForm.name.trim();
    if (!cleanName) {
      addToast('Tên phòng ban không được để trống', 'error');
      return;
    }

    const rawOrder = Number(editForm.display_order) || 1;
    const cleanOrder = (rawOrder === editingDept?.display_order)
      ? rawOrder
      : Math.min(Math.max(1, rawOrder), totalDepts);

    setSaving(true);
    try {
      const res = await apiFetch(`/api/finance/departments/manage/${editingDept.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          name: cleanName,
          display_order: cleanOrder,
          is_active: editForm.is_active,
        }),
      });

      const updated = res.data;
      setDepartments(prev => prev.map(d => (d.id === updated.id ? updated : d)));
      addToast('Đã cập nhật phòng ban thành công', 'success');
      setEditingDept(null);
    } catch (error) {
      addToast(error.message || 'Lỗi cập nhật phòng ban', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (dept) => {
    if (!isDirector || togglingId) return;
    const nextStatus = !dept.is_active;
    setTogglingId(dept.id);
    try {
      const res = await apiFetch(`/api/finance/departments/manage/${dept.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextStatus }),
      });

      const updated = res.data;
      setDepartments(prev => prev.map(d => (d.id === updated.id ? updated : d)));
      addToast(
        `Đã ${nextStatus ? 'kích hoạt' : 'tắt hoạt động'} phòng ban "${dept.name}"`,
        'success'
      );
    } catch (error) {
      addToast(error.message || 'Lỗi thay đổi trạng thái phòng ban', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="dept-mgmt" data-testid="department-management">
      <header className="dept-mgmt__header">
        <div className="dept-mgmt__title-area">
          <h2 className="dept-mgmt__title">
            <Building2 size={22} color="var(--primary-color, #2563eb)" />
            Quản lý phòng ban
          </h2>
          <p className="dept-mgmt__subtitle">
            Danh sách các phòng ban trong công ty. {isDirector ? 'Giám đốc có quyền sửa mã, sửa tên và bật/tắt hoạt động.' : 'Chế độ xem thông tin.'}
          </p>
        </div>

        <div className="dept-mgmt__stats">
          <span className="dept-mgmt__stat-chip">
            Tổng số: <strong>{departments.length}</strong>
          </span>
          <span className="dept-mgmt__stat-chip dept-mgmt__stat-chip--active">
            <CheckCircle2 size={13} />
            Đang hoạt động: <strong>{activeCount}</strong>
          </span>
          {departments.length - activeCount > 0 && (
            <span className="dept-mgmt__stat-chip dept-mgmt__stat-chip--inactive">
              <XCircle size={13} />
              Tạm ngừng: <strong>{departments.length - activeCount}</strong>
            </span>
          )}
        </div>
      </header>

      <div className="dept-mgmt__toolbar">
        <div className="dept-mgmt__search">
          <Search size={16} className="dept-mgmt__search-icon" />
          <input
            type="text"
            className="dept-mgmt__search-input"
            placeholder="Tìm theo tên hoặc mã phòng ban..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm kiếm phòng ban"
          />
        </div>
      </div>

      <div className="dept-mgmt__table-card">
        {loading ? (
          <div className="dept-mgmt__empty">Đang tải danh sách phòng ban...</div>
        ) : filteredDepartments.length === 0 ? (
          <div className="dept-mgmt__empty">Không tìm thấy phòng ban nào phù hợp.</div>
        ) : (
          <table className="dept-mgmt__table">
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>STT</th>
                <th style={{ width: '150px' }}>Mã phòng ban</th>
                <th>Tên phòng ban</th>
                <th style={{ width: '130px', textAlign: 'center' }}>Số nhân sự</th>
                <th style={{ width: '160px', textAlign: 'center' }}>Trạng thái</th>
                {isDirector && <th style={{ width: '180px', textAlign: 'center' }}>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {filteredDepartments.map((dept, index) => {
                const isToggling = togglingId === dept.id;
                return (
                  <tr key={dept.id} data-testid={`dept-row-${dept.id}`}>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{index + 1}</td>
                    <td>
                      <span className="dept-mgmt__code-badge">{dept.code || '—'}</span>
                    </td>
                    <td>
                      <strong style={{ fontSize: '0.92rem' }}>{dept.name}</strong>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {onNavigateToEmployees ? (
                        <button
                          type="button"
                          className="dept-mgmt__emp-link-btn"
                          onClick={() => onNavigateToEmployees(dept.id)}
                          title={`Xem ${dept.employee_count || 0} nhân sự thuộc ${dept.name}`}
                          aria-label={`Xem danh sách ${dept.employee_count || 0} nhân sự phòng ban ${dept.name}`}
                        >
                          <Users size={14} className="dept-mgmt__emp-link-icon" />
                          <span className="dept-mgmt__emp-count-num">{dept.employee_count || 0}</span>
                          <ArrowRight size={12} className="dept-mgmt__emp-link-arrow" />
                        </button>
                      ) : (
                        <span className="dept-mgmt__emp-count">
                          <Users size={14} color="#64748b" />
                          {dept.employee_count || 0}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Badge variant={dept.is_active ? 'success' : 'neutral'}>
                        {dept.is_active ? 'Hoạt động' : 'Tạm ngừng'}
                      </Badge>
                    </td>
                    {isDirector && (
                      <td style={{ textAlign: 'center' }}>
                        <div className="dept-mgmt__actions" style={{ justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="dept-mgmt__btn dept-mgmt__btn--edit"
                            onClick={() => openEditModal(dept)}
                            title="Sửa phòng ban"
                            aria-label={`Sửa phòng ban ${dept.name}`}
                          >
                            <Pencil size={13} />
                            Sửa
                          </button>
                          <button
                            type="button"
                            className={`dept-mgmt__btn ${dept.is_active ? 'dept-mgmt__btn--toggle-off' : 'dept-mgmt__btn--toggle-on'}`}
                            onClick={() => handleToggleStatus(dept)}
                            disabled={isToggling}
                            title={dept.is_active ? 'Tắt hoạt động' : 'Kích hoạt'}
                            aria-label={`${dept.is_active ? 'Tắt' : 'Kích hoạt'} phòng ban ${dept.name}`}
                          >
                            <Power size={13} />
                            {isToggling ? '...' : (dept.is_active ? 'Tạm ngừng' : 'Kích hoạt')}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editingDept && (
        <Modal
          open={Boolean(editingDept)}
          onClose={() => !saving && setEditingDept(null)}
          title={
            <div className="dept-form__header">
              <div className="dept-form__icon-box">
                <Building2 size={22} />
              </div>
              <div className="dept-form__title-wrap">
                <span className="dept-form__title">Chỉnh sửa phòng ban</span>
                <span className="dept-form__subtitle">
                  Điều chỉnh mã định danh, tên gọi và trạng thái hoạt động
                </span>
              </div>
            </div>
          }
          size="md"
        >
          <form className="dept-form" onSubmit={handleSaveEdit}>
            <div className="dept-form__emp-card">
              <div className="dept-form__emp-info">
                <Users size={16} className="dept-form__emp-icon" />
                <span>
                  Nhân sự trực thuộc: <strong>{editingDept.employee_count || 0} người</strong>
                </span>
              </div>
              {onNavigateToEmployees && (editingDept.employee_count > 0) && (
                <button
                  type="button"
                  className="dept-form__emp-nav-btn"
                  data-testid="modal-nav-employees-btn"
                  aria-label="Xem danh sách nhân sự trực thuộc"
                  onClick={() => {
                    setEditingDept(null);
                    onNavigateToEmployees(editingDept.id);
                  }}
                  title="Chuyển sang tab Nhân sự và lọc theo phòng ban này"
                >
                  Xem danh sách <ArrowRight size={13} />
                </button>
              )}
            </div>

            <div className="dept-form__grid-2">
              <div className="dept-form__field">
                <label className="dept-form__label" htmlFor="dept-code-input">
                  <span>Mã phòng ban <strong style={{ color: '#ef4444' }}>*</strong></span>
                  <span className="dept-form__label-hint">In hoa, không dấu</span>
                </label>
                <div className="dept-form__input-wrapper">
                  <Tag size={15} className="dept-form__input-icon" />
                  <input
                    id="dept-code-input"
                    className="dept-form__input dept-form__input--with-icon dept-form__input--code"
                    value={editForm.code}
                    onChange={(e) => setEditForm(prev => ({ ...prev, code: sanitizeCode(e.target.value) }))}
                    placeholder="VD: TECH, LEGAL..."
                    required
                    aria-label="Mã phòng ban"
                  />
                </div>
              </div>

              <div className="dept-form__field">
                <label className="dept-form__label" htmlFor="dept-order-input">
                  <span>Thứ tự hiển thị</span>
                  <span className="dept-form__label-hint">Từ 1 đến {totalDepts}</span>
                </label>
                <div className="dept-form__input-wrapper">
                  <ListOrdered size={15} className="dept-form__input-icon" />
                  <input
                    id="dept-order-input"
                    type="number"
                    className="dept-form__input dept-form__input--with-icon"
                    value={editForm.display_order}
                    onChange={(e) => setEditForm(prev => ({ ...prev, display_order: e.target.value }))}
                    min={1}
                    max={Math.max(totalDepts, Number(editingDept?.display_order) || 1)}
                    aria-label="Thứ tự hiển thị"
                  />
                </div>
                <span className="dept-form__order-hint">
                  Vị trí: <strong>#{editForm.display_order || 1}</strong> trên tổng {totalDepts} phòng ban
                </span>
              </div>
            </div>

            <div className="dept-form__field">
              <label className="dept-form__label" htmlFor="dept-name-input">
                <span>Tên phòng ban <strong style={{ color: '#ef4444' }}>*</strong></span>
              </label>
              <div className="dept-form__input-wrapper">
                <Building2 size={15} className="dept-form__input-icon" />
                <input
                  id="dept-name-input"
                  className="dept-form__input dept-form__input--with-icon"
                  value={editForm.name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ví dụ: Phòng Kỹ thuật, Phòng Pháp lý..."
                  required
                  autoFocus
                  aria-label="Tên phòng ban"
                />
              </div>
            </div>

            <div className={`dept-form__status-card ${editForm.is_active ? 'dept-form__status-card--active' : ''}`}>
              <div className="dept-form__status-info">
                <div className="dept-form__status-icon">
                  {editForm.is_active ? <CheckCircle2 size={18} /> : <Power size={18} />}
                </div>
                <div className="dept-form__status-text">
                  <span className="dept-form__status-label">
                    {editForm.is_active ? 'Đang hoạt động' : 'Tạm ngừng hoạt động'}
                  </span>
                  <span className="dept-form__status-desc">
                    {editForm.is_active
                      ? 'Phòng ban hiển thị và sẵn sàng phân bổ nhân sự, hạng mục'
                      : 'Tạm ngừng sử dụng phòng ban này trong các nghiệp vụ mới'}
                  </span>
                </div>
              </div>
              <label className="dept-switch" aria-label="Bật tắt trạng thái hoạt động">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm(prev => ({ ...prev, is_active: e.target.checked }))}
                />
                <span className="dept-switch__slider" />
              </label>
            </div>

            {!editForm.is_active && (editingDept.employee_count > 0) && (
              <div className="dept-form__deactivate-warning">
                <AlertTriangle size={16} className="dept-form__warning-icon" />
                <span>
                  Phòng ban đang có <strong>{editingDept.employee_count}</strong> nhân sự trực thuộc. Khi tạm ngừng hoạt động, hãy kiểm tra và điều chuyển nhân sự sang phòng ban phù hợp.
                </span>
              </div>
            )}

            <div className="dept-form__footer">
              <button
                type="button"
                className="dept-form__btn-cancel"
                onClick={() => setEditingDept(null)}
                disabled={saving}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="dept-form__btn-save"
                disabled={saving || !editForm.name.trim() || !editForm.code.trim()}
              >
                <Check size={16} />
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
