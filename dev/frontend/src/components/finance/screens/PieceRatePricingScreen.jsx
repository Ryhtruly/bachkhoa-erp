import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Banknote, Pencil, Plus, Trash2, Search, Sparkles } from 'lucide-react';
import { ConfirmationModal, DataTable, FormGrid, FormRow, Modal, Badge } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { fmt } from '../utils';
import { API } from '../financeConstants';

export default function PieceRatePricingScreen({ isDirector = false }) {
  const { addToast } = useToast();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    task_type_id: '',
    task_type_name: '',
    main_rate: '',
    support_rate: ''
  });

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

  const filteredRates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rates;
    return rates.filter(r =>
      (r.task_type_name || r.task_name || '').toLowerCase().includes(q) ||
      (r.package_name || '').toLowerCase().includes(q) ||
      (r.task_type_id || '').toLowerCase().includes(q)
    );
  }, [rates, search]);

  const openAddModal = () => {
    setEditingItem(null);
    const first = rates[0] || {};
    setForm({
      task_type_id: first.task_type_id || '',
      task_type_name: first.task_type_name || first.task_name || '',
      main_rate: '',
      support_rate: ''
    });
    setModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setForm({
      task_type_id: item.task_type_id,
      task_type_name: item.task_type_name || item.task_name || '',
      main_rate: String(item.main_rate || ''),
      support_rate: String(item.support_rate || '')
    });
    setModalOpen(true);
  };

  const submitRate = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      // Lưu đơn giá chính
      if (form.main_rate !== '') {
        const resMain = await fetch(`${API}/api/piece-rates/rates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_type_id: form.task_type_id,
            role: 'main',
            rate: Number(form.main_rate)
          }),
        });
        if (!resMain.ok) throw new Error('Không lưu được đơn giá chính');
      }

      // Lưu đơn giá phụ đo
      if (form.support_rate !== '') {
        const resSupp = await fetch(`${API}/api/piece-rates/rates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_type_id: form.task_type_id,
            role: 'support',
            rate: Number(form.support_rate)
          }),
        });
        if (!resSupp.ok) throw new Error('Không lưu được đơn giá phụ đo');
      }

      addToast('Đã cập nhật đơn giá khoán thành công!', 'success');
      setModalOpen(false);
      await loadRates();
    } catch (error) {
      addToast(error.message || 'Lỗi lưu đơn giá', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteRate = async () => {
    if (!resetTarget?.id) return;
    try {
      setSaving(true);
      const response = await fetch(`${API}/api/piece-rates/rates/${resetTarget.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Không xóa được');
      addToast('Đã đặt lại đơn giá mặc định', 'success');
      setResetTarget(null);
      await loadRates();
    } catch (error) {
      addToast(error.message || 'Lỗi đặt lại đơn giá', 'error');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: 'task_type_name',
      label: 'LOẠI HỒ SƠ / CÔNG VIỆC',
      width: 280,
      render: (v, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <strong style={{ color: '#0f172a', fontSize: '0.92rem' }}>
            {v || row.task_name || row.task_type_id}
          </strong>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
            Mã: {row.task_type_id}
          </span>
        </div>
      )
    },
    {
      key: 'package_name',
      label: 'GÓI DỊCH VỤ',
      width: 160,
      render: (v) => {
        let color = '#3b82f6';
        let bg = 'rgba(59, 130, 246, 0.1)';
        if (v && v.includes('Pháp Lý')) {
          color = '#8b5cf6';
          bg = 'rgba(139, 92, 246, 0.1)';
        } else if (v && v.includes('Xây Dựng')) {
          color = '#f59e0b';
          bg = 'rgba(245, 158, 11, 0.1)';
        }
        return (
          <span style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            color,
            background: bg,
            padding: '3px 8px',
            borderRadius: 6,
            display: 'inline-block'
          }}>
            {v || 'Đo Đạc'}
          </span>
        );
      }
    },
    {
      key: 'main_rate',
      label: 'ĐƠN GIÁ CHÍNH',
      width: 170,
      align: 'right',
      render: (v) => (
        <strong style={{ color: '#10b981', fontSize: '0.95rem' }}>
          {fmt(v || 0)}
        </strong>
      )
    },
    {
      key: 'support_rate',
      label: 'ĐƠN GIÁ PHỤ ĐO',
      width: 170,
      align: 'right',
      render: (v) => (
        <strong style={{ color: '#3b82f6', fontSize: '0.95rem' }}>
          {fmt(v || 0)}
        </strong>
      )
    },
    ...(isDirector ? [{
      key: 'actions',
      label: 'THAO TÁC',
      width: 100,
      align: 'center',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => openEditModal(row)}
            title="Chỉnh sửa đơn giá"
            style={{ padding: '4px 8px' }}
          >
            <Pencil size={15} color="#2563eb" />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setResetTarget({
              id: row.id || row.task_type_id,
              name: row.task_type_name || row.task_name || row.task_type_id,
            })}
            title="Đặt lại mặc định"
            style={{ padding: '4px 8px' }}
          >
            <Trash2 size={15} color="#ef4444" />
          </button>
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="card" style={{ padding: 24, borderRadius: 14 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
            <Banknote size={22} color="#10b981" /> Bảng Đơn Giá Khoán Công Việc
          </h3>
          <div className="sub" style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 4 }}>
            Đơn giá chi trả khoán cho người đo chính và phụ đo theo từng loại hồ sơ đo đạc / pháp lý
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Ô tìm kiếm nhanh loại hồ sơ */}
          <div style={{ position: 'relative', width: 260 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 12, color: '#94a3b8' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm loại hồ sơ..."
              style={{
                width: '100%',
                height: 38,
                padding: '0 12px 0 32px',
                borderRadius: 8,
                border: '1.5px solid #cbd5e1',
                background: '#ffffff',
                fontSize: '0.86rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {isDirector && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={openAddModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 38,
                padding: '0 16px',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: '0.88rem'
              }}
            >
              <Plus size={16} /> Cập nhật đơn giá
            </button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredRates}
        loading={loading}
        rowKey="task_type_id"
        emptyText="Không tìm thấy đơn giá phù hợp"
        pageSize={25}
      />

      {/* Modal Cập Nhật Đơn Giá Khoán */}
      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        size="md"
        closeOnOverlay={!saving}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pencil size={18} color="#2563eb" />
            {editingItem ? `Cập nhật đơn giá: ${form.task_type_name}` : 'Thiết lập đơn giá khoán mới'}
          </span>
        }
      >
        <form onSubmit={submitRate}>
          <FormGrid cols={1}>
            <FormRow label="Loại hồ sơ công việc" required>
              <select
                className="form-control"
                required
                value={form.task_type_id}
                onChange={(e) => {
                  const selId = e.target.value;
                  const item = rates.find(r => r.task_type_id === selId);
                  setForm({
                    ...form,
                    task_type_id: selId,
                    task_type_name: item ? (item.task_type_name || item.task_name) : ''
                  });
                }}
                disabled={!!editingItem}
                style={{ height: 42, fontSize: '0.92rem', fontWeight: 600 }}
              >
                {rates.map((r) => (
                  <option key={r.task_type_id} value={r.task_type_id}>
                    {r.task_type_name || r.task_name} ({r.package_name || 'Đo đạc'})
                  </option>
                ))}
              </select>
            </FormRow>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormRow label="Đơn giá người đo chính (VNĐ)" required>
                <input
                  className="form-control"
                  type="number"
                  required
                  min="0"
                  step="1000"
                  value={form.main_rate}
                  onChange={(e) => setForm({ ...form, main_rate: e.target.value })}
                  placeholder="350000"
                  style={{ height: 42, fontWeight: 700, fontSize: '1.05rem', color: '#10b981' }}
                />
              </FormRow>

              <FormRow label="Đơn giá phụ đo / hỗ trợ (VNĐ)" required>
                <input
                  className="form-control"
                  type="number"
                  required
                  min="0"
                  step="1000"
                  value={form.support_rate}
                  onChange={(e) => setForm({ ...form, support_rate: e.target.value })}
                  placeholder="150000"
                  style={{ height: 42, fontWeight: 700, fontSize: '1.05rem', color: '#3b82f6' }}
                />
              </FormRow>
            </div>
          </FormGrid>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border-default)' }}>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setModalOpen(false)}>
              Hủy bỏ
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '0 24px', height: 40, fontWeight: 700 }}>
              {saving ? 'Đang lưu...' : 'Lưu đơn giá khoán'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmationModal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        onConfirm={deleteRate}
        title="Đặt lại đơn giá khoán"
        description={(
          <>
            Đơn giá của <strong>{resetTarget?.name}</strong> sẽ được đưa về cấu hình mặc định.
            Thao tác này không xóa loại hồ sơ hoặc dữ liệu lương đã ghi nhận.
          </>
        )}
        confirmLabel="Đặt lại mặc định"
        variant="danger"
        isLoading={saving}
      />
    </div>
  );
}
