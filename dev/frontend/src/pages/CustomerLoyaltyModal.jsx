import React, { useCallback, useEffect, useState } from 'react';
import {
  Crown, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Users,
  Award, TrendingUp, Sparkles, Building2, User, Phone, CheckCircle2,
  AlertCircle, ShieldCheck, X, Save, RefreshCw, Search
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { apiFetch } from '../lib/api';

export default function CustomerLoyaltyModal({ open = false, onClose, isDirector = false }) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('tiers'); // 'tiers' | 'qualifying'
  const [tiers, setTiers] = useState([]);
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [qualifyingCustomers, setQualifyingCustomers] = useState([]);
  const [loadingQualifying, setLoadingQualifying] = useState(true);
  const [qualifyingSearch, setQualifyingSearch] = useState('');

  // Sub-modal Thêm / Sửa bậc
  const [showSubModal, setShowSubModal] = useState(false);
  const [editingTier, setEditingTier] = useState(null);
  const [tierForm, setTierForm] = useState({
    tier_name: '',
    min_contracts: '',
    discount_percent: '',
    description: '',
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Keyboard accessibility: Escape to close submodal or modal
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showSubModal) {
          setShowSubModal(false);
        } else if (onClose) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, showSubModal, onClose]);

  const loadTiers = useCallback(async (silent = false) => {
    if (!silent) setLoadingTiers(true);
    try {
      const res = await apiFetch('/api/customers/loyalty-tiers');
      setTiers(res?.data || []);
    } catch (e) {
      addToast(e.message || 'Lỗi tải danh sách bậc ưu đãi', 'error');
    } finally {
      if (!silent) setLoadingTiers(false);
    }
  }, [addToast]);

  const loadQualifying = useCallback(async (silent = false) => {
    if (!silent) setLoadingQualifying(true);
    try {
      const res = await apiFetch('/api/customers/loyalty-qualifying-customers');
      setQualifyingCustomers(res?.data || []);
    } catch (e) {
      addToast(e.message || 'Lỗi tải danh sách khách hàng ưu tiên', 'error');
    } finally {
      if (!silent) setLoadingQualifying(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (open) {
      loadTiers(false);
      loadQualifying(false);
    }
  }, [open, loadTiers, loadQualifying]);

  if (!open) return null;

  const handleOpenAdd = () => {
    setEditingTier(null);
    setTierForm({
      tier_name: '',
      min_contracts: '',
      discount_percent: '',
      description: '',
      is_active: true,
    });
    setShowSubModal(true);
  };

  const handleOpenEdit = (tier) => {
    setEditingTier(tier);
    setTierForm({
      tier_name: tier.tier_name || '',
      min_contracts: tier.min_contracts ?? '',
      discount_percent: tier.discount_percent ?? '',
      description: tier.description || '',
      is_active: tier.is_active ?? true,
    });
    setShowSubModal(true);
  };

  const handleSaveTier = async (e) => {
    e.preventDefault();
    const minCt = parseInt(tierForm.min_contracts, 10);
    const discPct = parseFloat(tierForm.discount_percent);

    if (!tierForm.tier_name.trim()) {
      addToast('Vui lòng nhập tên bậc ưu đãi', 'error');
      return;
    }
    if (isNaN(minCt) || minCt < 1) {
      addToast('Số hợp đồng tối thiểu phải lớn hơn hoặc bằng 1', 'error');
      return;
    }
    if (isNaN(discPct) || discPct < 0 || discPct > 100) {
      addToast('Mức giảm giá phải từ 0% đến 100%', 'error');
      return;
    }

    // Kiểm tra trùng lặp với các bậc khác
    const cleanName = tierForm.tier_name.trim().toLowerCase();
    const dupMin = tiers.find(t => Number(t.min_contracts) === minCt && t.id !== editingTier?.id);
    if (dupMin) {
      addToast(`Đã có bậc '${dupMin.tier_name}' áp dụng cho mốc ${minCt} hợp đồng`, 'error');
      return;
    }
    const dupName = tiers.find(t => (t.tier_name || '').toLowerCase() === cleanName && t.id !== editingTier?.id);
    if (dupName) {
      addToast(`Tên bậc '${tierForm.tier_name.trim()}' đã tồn tại`, 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tier_name: tierForm.tier_name.trim(),
        min_contracts: minCt,
        discount_percent: discPct,
        description: tierForm.description.trim() || null,
        is_active: Boolean(tierForm.is_active),
      };

      if (editingTier) {
        await apiFetch(`/api/customers/loyalty-tiers/${editingTier.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        addToast('Đã cập nhật bậc ưu đãi', 'success');
      } else {
        await apiFetch('/api/customers/loyalty-tiers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        addToast('Đã thêm bậc ưu đãi mới', 'success');
      }

      setShowSubModal(false);
      await loadTiers(true);
      await loadQualifying(true);
    } catch (e) {
      addToast(e.message || 'Lỗi khi lưu bậc ưu đãi', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (e, tier) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const nextActive = !tier.is_active;

    // Optimistic UI: toggle tức thì, không giật màn hình
    setTiers(prev => prev.map(t => t.id === tier.id ? { ...t, is_active: nextActive } : t));

    try {
      await apiFetch(`/api/customers/loyalty-tiers/${tier.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier_name: tier.tier_name,
          min_contracts: tier.min_contracts,
          discount_percent: tier.discount_percent,
          description: tier.description,
          is_active: nextActive,
        }),
      });
      addToast(`Đã ${nextActive ? 'bật' : 'tắt'} bậc ${tier.tier_name}`, 'success');
      loadQualifying(true);
    } catch (err) {
      setTiers(prev => prev.map(t => t.id === tier.id ? { ...t, is_active: tier.is_active } : t));
      addToast(err.message || 'Lỗi thay đổi trạng thái', 'error');
    }
  };

  const handleDeleteTier = async (tierId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bậc ưu đãi này?')) return;
    setDeletingId(tierId);
    const previousTiers = [...tiers];
    setTiers(prev => prev.filter(t => t.id !== tierId));
    try {
      await apiFetch(`/api/customers/loyalty-tiers/${tierId}`, {
        method: 'DELETE',
      });
      addToast('Đã xóa bậc ưu đãi', 'success');
      loadQualifying(true);
    } catch (e) {
      setTiers(previousTiers);
      addToast(e.message || 'Lỗi khi xóa bậc ưu đãi', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="cust-loyalty-overlay" onClick={onClose}>
      <div className="cust-loyalty-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="cust-loyalty-dialog__hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="cust-loyalty-icon-badge">
              <Crown size={20} color="#d97706" />
            </div>
            <div>
              <h3>Thiết lập ưu đãi khách hàng</h3>
              <p>Khách từng làm bao nhiêu hợp đồng thì sẽ tự động được chiết khấu % ở những lần sau.</p>
            </div>
          </div>
          <button type="button" className="cust-loyalty-close" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        {/* Sub tabs in modal */}
        <div className="cust-loyalty-dialog__subtabs">
          <button
            type="button"
            className={`cust-loyalty-subtab ${activeTab === 'tiers' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('tiers')}
          >
            <Crown size={15} /> Bậc ưu đãi ({tiers.length})
          </button>
          <button
            type="button"
            className={`cust-loyalty-subtab ${activeTab === 'qualifying' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('qualifying')}
          >
            <Award size={15} /> Khách đạt chuẩn ({qualifyingCustomers.length})
          </button>
        </div>

        {/* Body content */}
        <div className="cust-loyalty-dialog__body">
          {activeTab === 'tiers' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  Hệ thống tự động áp dụng bậc cao nhất mà khách hàng thoả điều kiện.
                </span>
                {isDirector && (
                  <button type="button" className="btn-add-tier" onClick={handleOpenAdd}>
                    <Plus size={14} /> Thêm bậc ưu đãi
                  </button>
                )}
              </div>

              {loadingTiers ? (
                <div className="loyalty-empty"><RefreshCw className="spin" size={20} /> Đang tải dữ liệu…</div>
              ) : tiers.length === 0 ? (
                <div className="loyalty-empty">
                  <p>Chưa có bậc ưu đãi nào được cấu hình.</p>
                  {isDirector && (
                    <button type="button" className="btn-add-tier" style={{ marginTop: 8 }} onClick={handleOpenAdd}>
                      <Plus size={14} /> Thêm bậc đầu tiên
                    </button>
                  )}
                </div>
              ) : (
                <div className="loyalty-card" style={{ border: '1px solid var(--border-default)' }}>
                  <table className="loyalty-table">
                    <thead>
                      <tr>
                        <th>Tên bậc ưu đãi</th>
                        <th style={{ textAlign: 'center' }}>Số HĐ tối thiểu</th>
                        <th style={{ textAlign: 'center' }}>Mức giảm</th>
                        <th>Mô tả áp dụng</th>
                        <th style={{ textAlign: 'center' }}>Trạng thái</th>
                        {isDirector && <th style={{ textAlign: 'right' }}>Thao tác</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {tiers.map((tier) => (
                        <tr key={tier.id} className={!tier.is_active ? 'is-disabled' : ''}>
                          <td>
                            <span className="loyalty-badge">
                              <Crown size={12} /> {tier.tier_name}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            &ge; {tier.min_contracts} HĐ
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="loyalty-discount-tag">
                              Giảm {tier.discount_percent}%
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                            {tier.description || '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isDirector ? (
                              <button
                                type="button"
                                className="loyalty-toggle"
                                onClick={(e) => handleToggleActive(e, tier)}
                                title={tier.is_active ? 'Bấm để tắt' : 'Bấm để bật'}
                              >
                                {tier.is_active ? (
                                  <ToggleRight className="on" size={26} />
                                ) : (
                                  <ToggleLeft className="off" size={26} />
                                )}
                              </button>
                            ) : (
                              <span className={tier.is_active ? 'chip-active' : 'chip-inactive'}>
                                {tier.is_active ? 'Đang bật' : 'Đã tắt'}
                              </span>
                            )}
                          </td>
                          {isDirector && (
                            <td style={{ textAlign: 'right' }}>
                              <div className="loyalty-actions" style={{ justifyContent: 'flex-end' }}>
                                <button type="button" title="Sửa bậc" onClick={() => handleOpenEdit(tier)}>
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="is-danger"
                                  title="Xóa bậc"
                                  disabled={deletingId === tier.id}
                                  onClick={() => handleDeleteTier(tier.id)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                  <input
                    type="text"
                    placeholder="Tìm theo tên, SĐT, MST, bậc..."
                    value={qualifyingSearch}
                    onChange={(e) => setQualifyingSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 12px 7px 32px',
                      borderRadius: 8,
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-deep)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                    }}
                  />
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadQualifying(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={13} /> Làm mới
                </button>
              </div>

              {loadingQualifying ? (
                <div className="loyalty-empty"><RefreshCw className="spin" size={20} /> Đang kiểm tra…</div>
              ) : qualifyingCustomers.length === 0 ? (
                <div className="loyalty-empty">
                  <p>Chưa có khách hàng nào đạt đủ số lượng hợp đồng theo các bậc đang bật.</p>
                </div>
              ) : qualifyingCustomers.filter(c => {
                  if (!qualifyingSearch.trim()) return true;
                  const q = qualifyingSearch.trim().toLowerCase();
                  return (
                    (c.full_name || '').toLowerCase().includes(q) ||
                    (c.phone || '').toLowerCase().includes(q) ||
                    (c.tax_id || '').toLowerCase().includes(q) ||
                    (c.tier_name || '').toLowerCase().includes(q)
                  );
                }).length === 0 ? (
                <div className="loyalty-empty">
                  <p>Không tìm thấy khách hàng nào khớp với từ khóa "{qualifyingSearch}".</p>
                </div>
              ) : (
                <div className="loyalty-card" style={{ border: '1px solid var(--border-default)', maxHeight: '380px', overflowY: 'auto' }}>
                  <table className="loyalty-table">
                    <thead>
                      <tr>
                        <th>Khách hàng</th>
                        <th>Số điện thoại / Định danh</th>
                        <th>Loại</th>
                        <th style={{ textAlign: 'center' }}>Số HĐ đã làm</th>
                        <th>Bậc ưu đãi</th>
                        <th style={{ textAlign: 'center' }}>Mức giảm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qualifyingCustomers.filter(c => {
                        if (!qualifyingSearch.trim()) return true;
                        const q = qualifyingSearch.trim().toLowerCase();
                        return (
                          (c.full_name || '').toLowerCase().includes(q) ||
                          (c.phone || '').toLowerCase().includes(q) ||
                          (c.tax_id || '').toLowerCase().includes(q) ||
                          (c.tier_name || '').toLowerCase().includes(q)
                        );
                      }).map((cust) => (
                        <tr key={cust.id}>
                          <td>
                            <strong style={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                              {cust.full_name}
                            </strong>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {cust.phone && <span style={{ fontSize: '0.82rem' }}>{cust.phone}</span>}
                              {cust.tax_id && <small style={{ color: 'var(--text-secondary)' }}>MST: {cust.tax_id}</small>}
                              {cust.id_card_number && <small style={{ color: 'var(--text-secondary)' }}>CCCD: {cust.id_card_number}</small>}
                            </div>
                          </td>
                          <td>
                            {cust.customer_type === 'business' ? (
                              <span className="cust-chip is-corp"><Building2 size={11} /> Doanh nghiệp</span>
                            ) : (
                              <span className="cust-chip is-indiv"><User size={11} /> Cá nhân</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            {cust.contract_count} HĐ
                          </td>
                          <td>
                            <span className="loyalty-badge">
                              <Crown size={12} /> {cust.tier_name || 'VIP'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <strong style={{ color: 'var(--green-600, #16a34a)' }}>
                              -{cust.discount_percent}%
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="cust-loyalty-dialog__ft">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>

      {/* Sub-modal Thêm / Sửa */}
      {showSubModal && (
        <div className="cust-loyalty-modal" onClick={() => !saving && setShowSubModal(false)}>
          <div className="cust-loyalty-modal__box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3>
                <Crown size={18} color="#eab308" />
                {editingTier ? 'Chỉnh sửa bậc ưu đãi' : 'Thêm bậc ưu đãi mới'}
              </h3>
              <button
                type="button"
                onClick={() => setShowSubModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-tertiary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveTier}>
              <label>
                Tên bậc ưu đãi <span style={{ color: 'red' }}>*</span>
                <input
                  required
                  placeholder="Ví dụ: Khách Thân Thiết, VIP Vàng, VIP Kim Cương..."
                  value={tierForm.tier_name}
                  onChange={(e) => setTierForm({ ...tierForm, tier_name: e.target.value })}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>
                  Số HĐ tối thiểu <span style={{ color: 'red' }}>*</span>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Ví dụ: 2"
                    value={tierForm.min_contracts}
                    onChange={(e) => setTierForm({ ...tierForm, min_contracts: e.target.value })}
                  />
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 2, display: 'block' }}>
                    Đã làm từ N hợp đồng trở lên
                  </small>
                </label>

                <label>
                  Mức giảm giá (%) <span style={{ color: 'red' }}>*</span>
                  <input
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    placeholder="Ví dụ: 5 hoặc 10"
                    value={tierForm.discount_percent}
                    onChange={(e) => setTierForm({ ...tierForm, discount_percent: e.target.value })}
                  />
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 2, display: 'block' }}>
                    Chiết khấu % vào hợp đồng sau
                  </small>
                </label>
              </div>

              <label style={{ marginTop: 6 }}>
                Mô tả chi tiết
                <textarea
                  placeholder="Nhập ghi chú hoặc mô tả chính sách áp dụng..."
                  value={tierForm.description}
                  onChange={(e) => setTierForm({ ...tierForm, description: e.target.value })}
                />
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 6px' }}>
                <input
                  id="submodal-tier-active-cb"
                  type="checkbox"
                  style={{ width: 16, height: 16 }}
                  checked={tierForm.is_active}
                  onChange={(e) => setTierForm({ ...tierForm, is_active: e.target.checked })}
                />
                <label htmlFor="submodal-tier-active-cb" style={{ margin: 0, cursor: 'pointer', fontSize: '0.85rem' }}>
                  Kích hoạt bậc ưu đãi này ngay lập tức
                </label>
              </div>

              <div className="cust-loyalty-modal__foot">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => setShowSubModal(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Save size={15} /> {saving ? 'Đang lưu…' : 'Lưu bậc ưu đãi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

