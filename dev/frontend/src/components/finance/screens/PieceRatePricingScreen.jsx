import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Archive, Banknote, CheckCircle2, Clock, History, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import { ConfirmationModal, DataTable, FormGrid, FormRow, Modal } from '../../ui';
import { useToast } from '../../../contexts/ToastContext';
import { fmt } from '../utils';
import { API } from '../financeConstants';
import { apiFetch } from '../../../lib/api';
import './PieceRatePricingScreen.css';

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
  const [showInactive, setShowInactive] = useState(false);
  const [itemEditor, setItemEditor] = useState(null);
  const [itemForm, setItemForm] = useState({
    code: '', name: '', default_unit: '', output_definition: '',
    initial_rates: { MAIN: '', ASSISTANT: '', SUBMITTER: '' },
  });
  const [deactivateTarget, setDeactivateTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = isDirector && showInactive ? '?include_inactive=true' : '';
      const payload = await apiFetch(`${API}/api/piece-rates/rates${query}`);
      setRows(payload.data || []);
    } catch (error) {
      addToast(error.message || 'Lỗi tải bảng giá khoán', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, isDirector, showInactive]);

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
    return ['MAIN', 'ASSISTANT', 'SUBMITTER'].filter(r => roles.has(r) || roles.size === 0);
  };

  const openEdit = (item) => {
    setEditing(item);
    const initialForm = {};
    getItemRoles(item).forEach(role => {
      initialForm[role] = String(item.pending?.[role]?.amount ?? item.rates?.[role]?.amount ?? '');
    });
    setForm(initialForm);
  };

  const openCreateItem = () => {
    setItemForm({
      code: '', name: '', default_unit: '', output_definition: '',
      initial_rates: { MAIN: '', ASSISTANT: '', SUBMITTER: '' },
    });
    setItemEditor({ mode: 'create', item: null });
  };

  const openMetadataEditor = (item) => {
    setItemForm({
      code: item.code || '',
      name: item.name || '',
      default_unit: item.unit || 'job',
      output_definition: item.output_definition || '',
      initial_rates: { MAIN: '', ASSISTANT: '', SUBMITTER: '' },
    });
    setItemEditor({ mode: 'edit', item });
  };

  const submitItem = async (event) => {
    event.preventDefault();
    if (!itemEditor) return;
    setSaving(true);
    try {
      let body;
      let endpoint;
      let method;
      if (itemEditor.mode === 'create') {
        const initial_rates = Object.entries(itemForm.initial_rates)
          .filter(([, amount]) => amount !== '' && amount != null)
          .map(([role_code, amount]) => ({ role_code, amount: Number(amount) }));
        body = {
          code: itemForm.code,
          name: itemForm.name,
          default_unit: itemForm.default_unit,
          output_definition: itemForm.output_definition || null,
          initial_rates,
        };
        endpoint = `${API}/api/piece-rates/items`;
        method = 'POST';
      } else {
        const original = itemEditor.item;
        body = {};
        if (itemForm.name !== (original.name || '')) body.name = itemForm.name;
        if (itemForm.output_definition !== (original.output_definition || '')) {
          body.output_definition = itemForm.output_definition || null;
        }
        if (!Object.keys(body).length) {
          addToast('Không có thông tin nào thay đổi', 'info');
          setItemEditor(null);
          return;
        }
        endpoint = `${API}/api/piece-rates/items/${original.work_item_id}`;
        method = 'PATCH';
      }
      await apiFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      addToast(itemEditor.mode === 'create' ? 'Đã thêm hạng mục khoán' : 'Đã cập nhật thông tin hạng mục', 'success');
      setItemEditor(null);
      await load();
    } catch (error) {
      addToast(error.message || 'Lỗi lưu thông tin hạng mục', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setSaving(true);
    try {
      await apiFetch(`${API}/api/piece-rates/items/${deactivateTarget.work_item_id}`, { method: 'DELETE' });
      addToast('Đã ngừng sử dụng hạng mục; lịch sử giá được giữ nguyên', 'success');
      setDeactivateTarget(null);
      await load();
    } catch (error) {
      addToast(error.message || 'Lỗi ngừng sử dụng hạng mục', 'error');
    } finally {
      setSaving(false);
    }
  };

  const restoreItem = async (item) => {
    setSaving(true);
    try {
      await apiFetch(`${API}/api/piece-rates/items/${item.work_item_id}/restore`, { method: 'POST' });
      addToast('Đã khôi phục hạng mục khoán', 'success');
      await load();
    } catch (error) {
      addToast(error.message || 'Lỗi khôi phục hạng mục', 'error');
    } finally {
      setSaving(false);
    }
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
        await apiFetch(isDirector ? `${API}/api/piece-rates/rates/direct` : `${API}/api/piece-rates/rates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ work_item_id: editing.work_item_id, role_code: role, amount: Number(newAmount) }),
        });
        changeCount += 1;
      }
      addToast(
        changeCount
          ? (isDirector ? `Đã cập nhật và áp dụng ${changeCount} đơn giá` : `Đã tạo ${changeCount} đề xuất giá — chờ giám đốc duyệt`)
          : 'Không có thay đổi nào',
        changeCount ? 'success' : 'info',
      );
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
      key: 'name', label: 'Hạng mục khoán', width: 260,
      render: (v, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <strong style={{ color: 'var(--text-primary)', fontSize: '0.92rem' }}>{v}</strong>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.74rem' }}>
            {row.code || '—'}
            {row.is_active === false && (
              <span style={{ marginLeft: 7, color: '#b45309', fontWeight: 700 }}>Ngừng sử dụng</span>
            )}
          </span>
        </div>
      ),
    },
    { key: 'department_name', label: 'Phòng ban', width: 130,
      render: (v) => <span style={{ fontSize: '0.82rem', color: v ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>{v || 'Chưa gán'}</span> },
    { key: 'main', label: 'Đơn giá chính', width: 150, align: 'right', render: giaCell('MAIN') },
    { key: 'assistant', label: 'Phụ đo', width: 150, align: 'right', render: giaCell('ASSISTANT') },
    { key: 'submitter', label: 'Người nộp', width: 130, align: 'right', render: giaCell('SUBMITTER') },
    {
      key: 'actions', label: 'Thao tác', width: isDirector ? 260 : 150, align: 'left',
      render: (_, row) => {
        const coPending = Object.keys(row.pending || {}).length > 0;
        return (
          <div
            className="piece-rate-pricing__actions"
            data-testid={`piece-rate-actions-${row.work_item_id}`}
            style={{ display: 'flex', gap: 6, justifyContent: 'flex-start', alignItems: 'center' }}
          >
            {row.is_active !== false && (
              <button type="button" className="btn btn-sm btn-ghost" title="Sửa đơn giá"
                onClick={() => openEdit(row)} style={{ padding: '4px 8px' }}>
                <Pencil size={15} color="#2563eb" />
              </button>
            )}
            <button type="button" className="btn btn-sm btn-ghost" title="Lịch sử giá"
              onClick={() => openHistory(row)} style={{ padding: '4px 8px' }}>
              <History size={15} color="#64748b" />
            </button>
            {isDirector && (
              <>
                <button type="button" className="btn btn-sm btn-ghost" title="Sửa thông tin"
                  data-testid={`piece-rate-edit-metadata-${row.work_item_id}`}
                  onClick={() => openMetadataEditor(row)} style={{ padding: '4px 8px' }}>
                  <Pencil size={15} color="#7c3aed" />
                </button>
                {row.is_active === false ? (
                  <button type="button" className="btn btn-sm btn-ghost" title="Khôi phục"
                    data-testid={`piece-rate-restore-${row.work_item_id}`}
                    onClick={() => restoreItem(row)} style={{ padding: '4px 8px' }} disabled={saving}>
                    <RotateCcw size={15} color="#059669" />
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm btn-ghost" title="Ngừng sử dụng"
                    data-testid={`piece-rate-deactivate-${row.work_item_id}`}
                    onClick={() => setDeactivateTarget(row)} style={{ padding: '4px 8px' }}>
                    <Archive size={15} color="#dc2626" />
                  </button>
                )}
              </>
            )}
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
    <div className="card card--workspace piece-rate-pricing" data-testid="piece-rate-pricing" style={{ padding: 24, borderRadius: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
            <Banknote size={22} color="#10b981" /> Bảng đơn giá khoán công việc
          </h3>
          <div className="sub" style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: 4 }}>
            Đơn giá thật hệ thống dùng để trả khoán. {isDirector ? 'Giám đốc có thể quản lý trực tiếp; mọi phiên bản cũ vẫn được giữ lại để đối chiếu.' : 'Sửa giá tạo đề xuất để giám đốc duyệt; phiên bản cũ vẫn được giữ lại để đối chiếu.'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isDirector && (
            <>
              <button type="button" className="btn btn-primary" data-testid="piece-rate-add-item"
                onClick={openCreateItem} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} /> Thêm hạng mục
              </button>
              <button type="button" className="btn btn-secondary" aria-pressed={showInactive}
                onClick={() => setShowInactive(value => !value)}>
                {showInactive ? 'Ẩn hạng mục ngừng dùng' : 'Hiện hạng mục ngừng dùng'}
              </button>
            </>
          )}
          <div style={{ position: 'relative', width: 260 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-tertiary)' }} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm hạng mục, mã, phòng ban..."
              style={{ width: '100%', height: 38, padding: '0 12px 0 32px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.86rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      <DataTable columns={columns} data={filtered} loading={loading} rowKey="work_item_id"
        emptyText="Không tìm thấy hạng mục khoán" pageSize={10} />

      {/* Modal tạo/sửa metadata hạng mục — chỉ Giám đốc được mở từ UI; backend vẫn kiểm tra quyền. */}
      <Modal open={Boolean(itemEditor)} onClose={() => !saving && setItemEditor(null)} size="lg"
        className="piece-rate-item-modal" closeOnOverlay={!saving}
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Banknote size={18} color="#10b981" />
          {itemEditor?.mode === 'create' ? 'Thêm hạng mục khoán' : 'Sửa thông tin hạng mục'}
        </span>}>
        {itemEditor && (
          <form onSubmit={submitItem} className="piece-rate-item-form" data-testid="piece-rate-item-form">
            <div className="piece-rate-item-form__grid" data-testid="piece-rate-item-form-metadata">
              <FormRow label="Mã hạng mục" align="left">
                <input className="form-control" aria-label="Mã hạng mục" value={itemForm.code}
                  onChange={(e) => setItemForm({ ...itemForm, code: e.target.value })}
                  placeholder="Ví dụ: SURVEY_STAKEOUT"
                  readOnly={itemEditor.mode === 'edit'} spellCheck={false} required />
              </FormRow>
              <FormRow label="Tên hạng mục" align="left">
                <input className="form-control" aria-label="Tên hạng mục" value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="Ví dụ: Cắm mốc" required />
              </FormRow>
              <div className="piece-rate-item-form__wide" data-testid="piece-rate-item-form-unit">
                <FormRow label="Đơn vị tính" align="left">
                  <input className="form-control" aria-label="Đơn vị tính" value={itemForm.default_unit}
                    onChange={(e) => setItemForm({ ...itemForm, default_unit: e.target.value })}
                    placeholder="Ví dụ: hồ sơ, lần, bộ, sản phẩm..." spellCheck={false}
                    readOnly={itemEditor.mode === 'edit'} aria-readonly={itemEditor.mode === 'edit'} required />
                </FormRow>
              </div>
            </div>
            <div className="piece-rate-item-form__wide" data-testid="piece-rate-item-form-description">
              <FormRow label="Mô tả đầu ra" align="left">
                <textarea className="form-control" aria-label="Mô tả đầu ra" rows={3} value={itemForm.output_definition}
                  onChange={(e) => setItemForm({ ...itemForm, output_definition: e.target.value })}
                  placeholder="Mô tả kết quả cần đạt của hạng mục..." />
              </FormRow>
            </div>
            {itemEditor.mode === 'create' && (
              <>
                <div className="piece-rate-item-form__note">
                  <strong>Đơn giá khởi tạo không bắt buộc.</strong>
                  <span>Nếu nhập, giá sẽ được ghi nhận là phiên bản đã duyệt của Giám đốc.</span>
                </div>
                <div className="piece-rate-item-form__rates" data-testid="piece-rate-item-form-rates">
                  {Object.keys(ROLE_LABELS).map(role => (
                    <FormRow key={role} label={`${ROLE_LABELS[role]} (VNĐ)`} align="left">
                      <input className="form-control" type="number" min="0" step="1000"
                        aria-label={`Đơn giá khởi tạo ${role}`} value={itemForm.initial_rates[role]}
                        placeholder={role === 'MAIN' ? 'Ví dụ: 500000' : role === 'ASSISTANT' ? 'Ví dụ: 200000' : 'Ví dụ: 100000'}
                        onChange={(e) => setItemForm({
                          ...itemForm,
                          initial_rates: { ...itemForm.initial_rates, [role]: e.target.value },
                        })} />
                    </FormRow>
                  ))}
                </div>
              </>
            )}
            <div className="piece-rate-item-form__footer">
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setItemEditor(null)}>Hủy bỏ</button>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '0 24px', height: 40, fontWeight: 700 }}>
                {saving ? 'Đang lưu...' : itemEditor.mode === 'create' ? 'Tạo hạng mục' : 'Lưu thông tin'}
              </button>
            </div>
          </form>
        )}
      </Modal>

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
              {isDirector ? 'Lưu sẽ áp dụng một phiên bản giá mới; hồ sơ đã được phân công vẫn tính theo giá đã khóa.' : 'Lưu sẽ tạo đề xuất giá mới; chỉ có hiệu lực sau khi giám đốc duyệt. Hồ sơ đã được phân công vẫn tính theo giá đã khóa.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border-default)' }}>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setEditing(null)}>Hủy bỏ</button>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '0 24px', height: 40, fontWeight: 700 }}>
                {saving ? 'Đang lưu...' : isDirector ? 'Cập nhật & áp dụng' : 'Tạo đề xuất giá'}
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
                <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', borderBottom: '1.5px solid var(--border-default)' }}>
                  <th style={{ padding: '8px 6px' }}>Vai trò</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Đơn giá</th>
                  <th style={{ padding: '8px 6px' }}>Hiệu lực</th>
                  <th style={{ padding: '8px 6px' }}>Trạng thái</th>
                  <th style={{ padding: '8px 6px' }}>Người duyệt</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '8px 6px', color: 'var(--text-primary)' }}>{ROLE_LABELS[r.role_code] || r.role_code}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(r.amount)}</td>
                    <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{r.effective_from} → {r.effective_to || 'nay'}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{ color: r.status === 'published' ? '#10b981' : r.status === 'draft' ? '#f59e0b' : '#94a3b8', fontWeight: 700 }}>
                        {r.status === 'published' ? 'Đang/đã áp dụng' : r.status === 'draft' ? 'Chờ duyệt' : 'Lưu trữ'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px', color: 'var(--text-tertiary)' }}>{r.approved_by || '—'}</td>
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

      <ConfirmationModal open={Boolean(deactivateTarget)} onClose={() => setDeactivateTarget(null)} onConfirm={confirmDeactivate}
        title="Ngừng sử dụng hạng mục"
        description={<>Hạng mục <strong>{deactivateTarget?.name}</strong> sẽ không còn được chọn cho công việc mới. Các giá, phân công và khoản lương lịch sử vẫn được giữ nguyên. Tiếp tục?</>}
        confirmLabel="Ngừng sử dụng" variant="danger" isLoading={saving} />
    </div>
  );
}
