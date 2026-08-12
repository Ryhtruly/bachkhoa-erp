import React, { useState, useEffect, useCallback } from 'react';
import { Banknote, Pencil, Plus, Trash2 } from 'lucide-react';
import { DataTable, FormGrid, FormRow, Modal } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { fmt } from '../utils';
import { API } from '../financeConstants';

export default function BangGiaKhoanScreen() {
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
      const response = await fetch(`${API}/api/piece-rates/rates`);
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
      const response = await fetch(`${API}/api/piece-rates/rates`, {
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
      const response = await fetch(`${API}/api/piece-rates/rates/${rateId}`, { method: 'DELETE' });
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
