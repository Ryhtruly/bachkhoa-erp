import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Banknote, Pencil, Search, History, CheckCircle2, Clock } from 'lucide-react';
import { ConfirmationModal, DataTable, FormGrid, FormRow, Modal } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { fmt } from '../utils';
import { API } from '../financeConstants';
import { apiFetch } from '../../../lib/api';

// Role labels for display: main / assistant / submitter
const ROLE_LABELS = { MAIN: 'Đơn giá chính', ASSISTANT: 'Phụ đo / hỗ trợ', SUBMITTER: 'Người đi nộp' };

export default function PieceRatePricingScreen({ isDirector = false }) {
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [history, setHistory] = useState(null);
  const [publishTarget, setPublishTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiFetch(`${API}/api/piece-rates/rates`);
      setRows(payload.data || []);
    } catch (error) {
      addToast(error.message || 'Lỗi tải bảng giá khoán', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.code || '').toLowerCase().includes(q) ||
      (r.department_name || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const getItemRoles = (item) => {
    const roles = new Set([...Object.keys(item.rates || {}), ...Object.keys(item.pending || {})]);
    return ['MAIN', 'ASSISTANT', 'SUBMITTER'].filter(r => roles.has(r));
  };

  const openEdit = (item) => {
    setEditing(item);
    const initialForm = {};
    getItemRoles(item).forEach(role => {
      initialForm[role] = String(item.pending?.[role]?.amount ?? item.rates?.[role]?.amount ?? '');
    });
    setForm(initialForm);
  };

  const submitDraft = async (event) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      let changeCount = 0;
      for (const role of getItemRoles(editing)) {
        const newAmount = form[role];
        if (newAmount === '' || newAmount == null) continue;
        const currentAmount = editing.rates?.[role]?.amount ?? null;
        if (currentAmount != null && Number(newAmount) === Number(currentAmount)) continue;
        await apiFetch(`${API}/api/piece-rates/rates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ work_item_id: editing.work_item_id, role_code: role, amount: Number(newAmount) }),
        });
        changeCount += 1;
      }
      addToast(changeCount ? `Đã tạo ${changeCount} đề xuất giá — chờ giám đốc duyệt` : 'Không có thay đổi nào', changeCount ? 'success' : 'info');
      setEditing(null);
      await load();
    } catch (error) {
      addToast(error.message || 'Lỗi lưu đề xuất', 'error');
    } finally {
      setSaving(false);
    }
  };

  const publishAll = async () => {
    if (!publishTarget) return;
    setSaving(true);
    try {
      for (const role of Object.keys(publishTarget.pending || {})) {
        await apiFetch(`${API}/api/piece-rates/rates/${publishTarget.pending[role].rate_id}/publish`, { method: 'POST' });
      }
      addToast('Đã duyệt và áp dụng đơn giá mới', 'success');
      setPublishTarget(null);
      await load();
    } catch (error) {
      addToast(error.message || 'Lỗi duyệt giá', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (item) => {
    try {
      const payload = await apiFetch(`${API}/api/piece-rates/rates/history/${item.work_item_id}`);
      setHistory({ item, data: payload.data || [] });
    } catch (error) {
      addToast(error.message || 'Lỗi tải lịch sử', 'error');
    }
  };

  const giaCell = (role) => (_, row) => {
    const pub = row.rates?.[role]?.amount;
    const pend = row.pending?.[role]?.amount;
    if (pub == null && pend == null) return <span style={{ color: '#cbd5e1' }}>—</span>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <strong style={{ color: role === 'MAIN' ? '#10b981' : '#3b82f6', fontSize: '0.95rem' }}>
          {fmt(pub || 0)}
        </strong>
        {pend != null && (
          <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700 }}>
            → {fmt(pend)} chờ duyệt
          </span>
        )}
      </div>
    );
  };

  const columns = [
    {
      key: 'name', label: 'HẠNG MỤC KHOÁN', width: 260,
      render: (v, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <strong style={{ color: '#0f172a', fontSize: '0.92rem' }}>{v}</strong>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>{row.code}</span>
        </div>
      ),
    },
    { key: 'department_name', label: 'PHÒNG BAN', width: 130,
      render: (v) => <span style={{ fontSize: '0.82rem', color: v ? '#475569' : '#cbd5e1' }}>{v || 'Chưa gán'}</span> },
    { key: 'main', label: 'ĐƠN GIÁ CHÍNH', width: 150, align: 'right', render: giaCell('MAIN') },
    { key: 'assistant', label: 'PHỤ ĐO', width: 150, align: 'right', render: giaCell('ASSISTANT') },
    { key: 'submitter', label: 'NGƯỜI NỘP', width: 130, align: 'right', render: giaCell('SUBMITTER') },
    {
      key: 'actions', label: 'THAO TÁC', width: 150, align: 'center',
      render: (_, row) => {
        const coPending = Object.keys(row.pending || {}).length > 0;
        return (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
            <button type="button" className="btn btn-sm btn-ghost" title="Sửa đơn giá"
              onClick={() => openEdit(row)} style={{ padding: '4px 8px' }}>
              <Pencil size={15} color="#2563eb" />
            </button>
            <button type="button" className="btn btn-sm btn-ghost" title="Lịch sử giá"
              onClick={() => openHistory(row)} style={{ padding: '4px 8px' }}>
              <History size={15} color="#64748b" />
            </button>
            {coPending && isDirector && (
              <button type="button" className="btn btn-sm" title="Duyệt giá mới"
                onClick={() => setPublishTarget(row)}
                style={{ padding: '4px 8px', color: '#10b981', border: '1px solid #10b98144' }}>
                <CheckCircle2 size={15} />
              </button>
            )}
            {coPending && !isDirector && (
              <span title="Chờ giám đốc duyệt" style={{ color: '#f59e0b' }}><Clock size={15} /></span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="card piece-rate-pricing" data-testid="piece-rate-pricing" style={{ padding: 24, borderRadius: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
            <Banknote size={22} color="#10b981" /> Bảng Đơn Giá Khoán Công Việc
          </h3>
          <div className="sub" style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: 4 }}>
            Đơn giá thật hệ thống dùng để trả khoán. Sửa giá tạo đề xuất; giám đốc duyệt mới áp dụng, bản cũ giữ lại để đối chiếu.
          </div>
        </div>
        <div style={{ position: 'relative', width: 260 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-tertiary)' }} />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm hạng mục, mã, phòng ban..."
            style={{ width: '100%', height: 38, padding: '0 12px 0 32px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      <DataTable columns={columns} data={filtered} loading={loading} rowKey="work_item_id"
        emptyText="Không tìm thấy hạng mục khoán" pageSize={25} />

      {/* Modal sửa đơn giá — tạo đề xuất (draft) */}
      <Modal open={Boolean(editing)} onClose={() => !saving && setEditing(null)} size="md" closeOnOverlay={!saving}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Pencil size={18} color="#2563eb" />Sửa đơn giá: {editing?.name}</span>}>
        {editing && (
          <form onSubmit={submitDraft}>
            <FormGrid cols={1}>
              {getItemRoles(editing).map(role => (
                <FormRow key={role} label={`${ROLE_LABELS[role]} (VNĐ)`}>
                  <input className="form-control" type="number" min="0" step="1000"
                    value={form[role] ?? ''} onChange={(e) => setForm({ ...form, [role]: e.target.value })}
                    style={{ height: 42, fontWeight: 700, fontSize: '1.05rem' }} />
                  {editing.rates?.[role]?.amount != null && (
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Đang áp dụng: {fmt(editing.rates[role].amount)}</span>
                  )}
                </FormRow>
              ))}
            </FormGrid>
            <p style={{ margin: '14px 0 0', fontSize: '0.8rem', color: '#f59e0b' }}>
              Lưu sẽ tạo đề xuất giá mới; chỉ có hiệu lực sau khi giám đốc duyệt. Hồ sơ đã ký vẫn tính theo giá cũ.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border-default)' }}>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setEditing(null)}>Hủy bỏ</button>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '0 24px', height: 40, fontWeight: 700 }}>
                {saving ? 'Đang lưu...' : 'Tạo đề xuất giá'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal lịch sử giá */}
      <Modal open={Boolean(history)} onClose={() => setHistory(null)} size="lg"
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><History size={18} color="#64748b" />Lịch sử giá: {history?.item?.name}</span>}>
        {history && (
          <div className="piece-rate-pricing__history-scroll" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table className="piece-rate-pricing__history-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748b', borderBottom: '1.5px solid #e2e8f0' }}>
                  <th style={{ padding: '8px 6px' }}>Vai trò</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Đơn giá</th>
                  <th style={{ padding: '8px 6px' }}>Hiệu lực</th>
                  <th style={{ padding: '8px 6px' }}>Trạng thái</th>
                  <th style={{ padding: '8px 6px' }}>Người duyệt</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 6px' }}>{ROLE_LABELS[r.role_code] || r.role_code}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{fmt(r.amount)}</td>
                    <td style={{ padding: '8px 6px' }}>{r.effective_from} → {r.effective_to || 'nay'}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{ color: r.status === 'published' ? '#10b981' : r.status === 'draft' ? '#f59e0b' : '#94a3b8', fontWeight: 700 }}>
                        {r.status === 'published' ? 'Đang/đã áp dụng' : r.status === 'draft' ? 'Chờ duyệt' : 'Lưu trữ'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px', color: '#64748b' }}>{r.approved_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <ConfirmationModal open={Boolean(publishTarget)} onClose={() => setPublishTarget(null)} onConfirm={publishAll}
        title="Duyệt đơn giá mới"
        description={<>Áp dụng giá mới cho <strong>{publishTarget?.name}</strong>. Bản giá cũ được đóng kỳ và giữ lại để đối chiếu hồ sơ đã ký. Tiếp tục?</>}
        confirmLabel="Duyệt & áp dụng" variant="primary" isLoading={saving} />
    </div>
  );
}
