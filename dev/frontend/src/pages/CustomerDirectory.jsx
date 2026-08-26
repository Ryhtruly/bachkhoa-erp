import React, { useCallback, useEffect, useState } from 'react';
import {
  Search, Building2, User, Users, Pencil, Save, X, FileText,
  Phone, Mail, MapPin, MessageCircle, Landmark, Fingerprint, Briefcase, Calendar, Layers,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { apiFetch } from '../lib/api';
import { DatePicker } from '../components/ui';
import './customerDirectory.css';

const formatCurrency = (n) => (Number(n) || 0).toLocaleString('vi-VN') + '₫';

// Một field trong lưới chi tiết: icon trong ô bo tròn + nhãn nhỏ + giá trị.
function Field({ icon: Ico, label, value, wide = false }) {
  return (
    <div className={`cust-f${wide ? ' is-wide' : ''}`}>
      <span className="cust-f__ico"><Ico size={16} /></span>
      <span className="cust-f__txt">
        <small>{label}</small>
        <strong title={value || '—'}>{value || '—'}</strong>
      </span>
    </div>
  );
}

function Chip({ tone, children }) {
  return <span className={`cust-chip ${tone}`}><span className="cust-chip__dot" />{children}</span>;
}

// Hai trạng thái độc lập của mỗi hợp đồng: THU TIỀN và BÀN GIAO.
// Xong cả hai thì gộp thành một chip "Tất toán" cho gọn.
function ContractStatus({ ct }) {
  if (/hu[ỷy]|cancel/i.test(ct.status || '')) return <Chip tone="is-idle">Đã huỷ</Chip>;
  const settled = ct.is_settled;
  const delivered = ct.da_ban_giao;
  if (settled && delivered) return <Chip tone="is-done">Tất toán</Chip>;
  return (
    <div className="cust-stt">
      {settled
        ? <Chip tone="is-done">Đã thu đủ</Chip>
        : <Chip tone="is-owe">{ct.paid > 0 ? `Còn nợ ${formatCurrency(ct.remaining)}` : 'Chưa thu tiền'}</Chip>}
      {delivered
        ? <Chip tone="is-done">Đã bàn giao</Chip>
        : <Chip tone="is-idle">Chưa bàn giao</Chip>}
    </div>
  );
}

export default function CustomerDirectory({ isDirector = false }) {
  const { addToast } = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isLookingUpTax, setIsLookingUpTax] = useState(false);

  const handleLookupTax = async () => {
    const code = (form?.tax_id || '').replace(/\D/g, '');
    if (code.length < 10) return;
    setIsLookingUpTax(true);
    try {
      const res = await apiFetch(`/api/customers/lookup-tax/${code}`);
      const data = res?.data;
      if (data?.found) {
        setForm((cur) => ({ ...cur, full_name: data.name || cur.full_name, address: data.address || cur.address }));
        addToast(`Đã lấy: ${data.name}`, 'success');
      } else {
        addToast(data?.reason || 'Không tìm thấy MST', 'error');
      }
    } catch { addToast('Không tra cứu được', 'error'); }
    finally { setIsLookingUpTax(false); }
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (filterType !== 'all') params.set('customer_type', filterType);
      const res = await apiFetch(`/api/customers?${params}`);
      setList(res?.data || []);
    } catch (e) {
      addToast(e.message || 'Lỗi tải danh sách khách', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, filterType, addToast]);

  useEffect(() => { const t = setTimeout(loadList, 250); return () => clearTimeout(t); }, [loadList]);

  const loadDetail = useCallback(async (id) => {
    setSelectedId(id);
    setEditing(false);
    try {
      const res = await apiFetch(`/api/customers/${id}`);
      setDetail(res?.data || null);
    } catch (e) {
      addToast(e.message || 'Lỗi tải chi tiết', 'error');
    }
  }, [addToast]);

  const handleStartEdit = () => {
    setForm({
      customer_type: detail.customer_type || 'individual',
      full_name: detail.full_name || '', phone: detail.phone || '', address: detail.address || '',
      tax_id: detail.tax_id || '', id_card_number: detail.id_card_number || '',
      id_card_date: detail.id_card_date || '', id_card_place: detail.id_card_place || '',
      email: detail.email || '', zalo_phone: detail.zalo_phone || '',
      representative_name: detail.representative_name || '', representative_role: detail.representative_role || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/customers/${selectedId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      addToast('Đã lưu hồ sơ khách', 'success');
      setEditing(false);
      await loadDetail(selectedId);
      await loadList();
    } catch (e) {
      addToast(e.message || 'Lỗi lưu', 'error');
    } finally {
      setSaving(false);
    }
  };

  const isBusinessCustomer = detail?.customer_type === 'business';
  const totalContractValue = (detail?.contracts || []).reduce((sum, c) => sum + (Number(c.total_value) || 0), 0);
  const totalRemainingDebt = (detail?.contracts || []).reduce((sum, c) => sum + (Number(c.remaining) || 0), 0);

  // Lưới field theo loại khách — icon nói rõ từng dòng là gì.
  const fields = detail ? (isBusinessCustomer ? [
    { icon: Landmark, label: 'Mã số thuế', value: detail.tax_id },
    { icon: User, label: 'Người đại diện', value: detail.representative_name },
    { icon: Briefcase, label: 'Chức vụ', value: detail.representative_role },
    { icon: Phone, label: 'Điện thoại', value: detail.phone },
    { icon: Mail, label: 'Email', value: detail.email },
    { icon: MessageCircle, label: 'Zalo', value: detail.zalo_phone },
    { icon: MapPin, label: 'Địa chỉ', value: detail.address, wide: true },
  ] : [
    { icon: Fingerprint, label: 'Số CCCD', value: detail.id_card_number },
    { icon: Calendar, label: 'Ngày cấp', value: detail.id_card_date },
    { icon: MapPin, label: 'Nơi cấp', value: detail.id_card_place },
    { icon: Phone, label: 'Điện thoại', value: detail.phone },
    { icon: Mail, label: 'Email', value: detail.email },
    { icon: MessageCircle, label: 'Zalo', value: detail.zalo_phone },
    { icon: MapPin, label: 'Địa chỉ', value: detail.address, wide: true },
  ]) : [];

  return (
    <div className="cust-dir">
      <aside className="cust-list">
        <div className="cust-list__head">
          <div className="cust-search">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên, SĐT, CCCD, MST..." />
            {search && (
              <button type="button" className="cust-search__clear" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>
          <div className="cust-filter">
            {[['all', 'Tất cả'], ['individual', 'Cá nhân'], ['business', 'Doanh nghiệp']].map(([v, l]) => (
              <button key={v} type="button" className={filterType === v ? 'is-on' : ''} onClick={() => setFilterType(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="cust-list__body">
          {loading ? <p className="cust-msg">Đang tải…</p>
            : list.length === 0 ? <p className="cust-msg">Không có khách nào</p>
            : list.map((c) => (
              <button key={c.id} type="button" className={`cust-item${selectedId === c.id ? ' is-active' : ''}`} onClick={() => loadDetail(c.id)}>
                <span className="cust-item__body">
                  <strong>{c.full_name}</strong>
                  <small>{c.customer_type === 'business' ? `MST ${c.tax_id || '—'}` : `CCCD ${c.id_card_number || '—'}`}</small>
                </span>
                <span className="cust-item__count" title={`${c.so_hop_dong} hợp đồng`}><Layers size={13} /> {c.so_hop_dong}</span>
              </button>
            ))}
        </div>
        <div className="cust-list__foot">
          <Users size={13} />
          <span>Tổng cộng <strong>{list.length}</strong> khách hàng</span>
        </div>
      </aside>

      <section className="cust-detail">
        {!detail ? (
          <div className="cust-empty">
            <div className="cust-empty__icon"><Users size={36} /></div>
            <strong>Chọn một khách hàng để xem chi tiết</strong>
            <p>Hồ sơ thông tin định danh, liên hệ và lịch sử hợp đồng sẽ hiển thị ở đây.</p>
          </div>
        ) : (
          <>
            <header className="cust-hero-band">
              <span className="cust-hero-band__ring" aria-hidden="true" />
              <div className="cust-hero-id">
                <div className="cust-hero-id__top">
                  <h2>{detail.full_name}</h2>
                  <span className="cust-hero-chip">
                    {isBusinessCustomer ? <><Building2 size={12} /> Doanh nghiệp</> : <><User size={12} /> Cá nhân</>}
                  </span>
                </div>
                <p>{isBusinessCustomer ? `MST ${detail.tax_id || '—'}` : `CCCD ${detail.id_card_number || '—'}`}</p>
              </div>

              {/* Tóm tắt chỉ số nhanh */}
              <div className="cust-hero-stats">
                <div className="cust-hero-stat">
                  <small>Hợp đồng</small>
                  <strong>{detail.contracts.length}</strong>
                </div>
                <div className="cust-hero-stat">
                  <small>Doanh số</small>
                  <strong>{formatCurrency(totalContractValue)}</strong>
                </div>
                {totalRemainingDebt > 0 && (
                  <div className="cust-hero-stat is-owe">
                    <small>Còn nợ</small>
                    <strong>{formatCurrency(totalRemainingDebt)}</strong>
                  </div>
                )}
              </div>

              {isDirector && !editing && (
                <button type="button" className="cust-hero-edit" onClick={handleStartEdit}><Pencil size={13} /> Sửa</button>
              )}
            </header>

            {editing ? (
              <div className="cust-card cust-card--edit">
                <div className="cust-loai">
                  {[['individual', 'Cá nhân'], ['business', 'Doanh nghiệp']].map(([v, l]) => (
                    <button key={v} type="button" className={form.customer_type === v ? 'is-on' : ''}
                      onClick={() => setForm({ ...form, customer_type: v })}>{l}</button>
                  ))}
                </div>
                <div className="cust-grid">
                  <label>{form.customer_type === 'business' ? 'Tên công ty' : 'Họ tên'}
                    <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
                  <label>Số điện thoại
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                  {form.customer_type === 'business' ? (
                    <>
                      <label>Mã số thuế
                        <div className="cust-mst-row">
                          <input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
                          <button type="button" className="cust-tracuu" disabled={isLookingUpTax || (form.tax_id || '').replace(/\D/g, '').length < 10} onClick={handleLookupTax}>
                            {isLookingUpTax ? '...' : 'Tra cứu'}
                          </button>
                        </div>
                      </label>
                      <label>Người đại diện<input value={form.representative_name} onChange={(e) => setForm({ ...form, representative_name: e.target.value })} /></label>
                      <label>Chức vụ<input value={form.representative_role} onChange={(e) => setForm({ ...form, representative_role: e.target.value })} /></label>
                    </>
                  ) : (
                    <>
                      <label>Số CCCD<input value={form.id_card_number} onChange={(e) => setForm({ ...form, id_card_number: e.target.value })} /></label>
                      <label>
                        Ngày cấp
                        <DatePicker
                          className="date-picker--fill"
                          value={form.id_card_date || ''}
                          onChange={(val) => setForm({ ...form, id_card_date: val })}
                          placeholder="Chọn ngày cấp"
                        />
                      </label>
                      <label>Nơi cấp<input value={form.id_card_place} onChange={(e) => setForm({ ...form, id_card_place: e.target.value })} /></label>
                    </>
                  )}
                  <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                  <label>Zalo<input value={form.zalo_phone} onChange={(e) => setForm({ ...form, zalo_phone: e.target.value })} /></label>
                  <label className="cust-grid__full">Địa chỉ<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
                </div>
                <div className="cust-form__actions">
                  <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setEditing(false)}><X size={15} /> Huỷ</button>
                  <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}><Save size={15} /> {saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
                </div>
              </div>
            ) : (
              <div className="cust-body-cards">
                <div className="cust-card cust-card--info">
                  <div className="cust-fgrid">
                    {fields.map((f) => <Field key={f.label} {...f} />)}
                  </div>
                </div>

                <div className="cust-card cust-card--contracts">
                  <div className="cust-card__hd-row">
                    <h3 className="cust-card__hd"><FileText size={16} /> Hợp đồng liên quan ({detail.contracts.length})</h3>
                    {detail.contracts.length > 0 && (
                      <span className="cust-card__hd-sub">
                        Tổng giá trị: <strong>{formatCurrency(totalContractValue)}</strong>
                      </span>
                    )}
                  </div>
                  {detail.contracts.length === 0 ? (
                    <div className="cust-contracts-empty">
                      <p>Khách hàng này chưa có hợp đồng nào trong hệ thống.</p>
                    </div>
                  ) : (
                    <div className="cust-table-wrap">
                      <table className="cust-hd-table">
                        <thead><tr><th>Mã HĐ</th><th>Dịch vụ</th><th style={{ textAlign: 'right' }}>Giá trị</th><th>Ngày ký</th><th>Tình trạng</th></tr></thead>
                        <tbody>
                          {detail.contracts.map((ct) => (
                            <tr key={ct.id}>
                              <td><strong className="cust-hd-id">{ct.id}</strong></td><td>{ct.service_type || '—'}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(ct.total_value)}</td><td>{ct.date_signed || '—'}</td>
                              <td className="cust-hd-table__stt"><ContractStatus ct={ct} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
