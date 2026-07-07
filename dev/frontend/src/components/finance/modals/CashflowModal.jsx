import React, { useState, useEffect } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { Modal, FormRow, FormGrid, Dropdown } from '../../ui';
import { fmt, parseAmt, CATEGORY_AUTO_MAPPING, fmtAmt } from '../utils';
import { ExcelGridTable } from '../SharedFinanceUI';
import { API } from '../financeConstants';
import { AlertCircle, PlusCircle, MinusCircle, Check } from 'lucide-react';

export default function CashflowModal({ open, onClose, defaultType = 'Thu', onSuccess }) {
  const [type, setType] = useState(defaultType);
  const [amtDisplay, setAmtDisplay] = useState('');
  const [form, setForm] = useState({ category: '', payer_payee: '', payment_method: 'Chuyển khoản', contract_id: '', project_id: '', du_an_phong_ban: '', nguoi_lap: '', nguoi_duyet: '' });
  const [hangMuc, setHangMuc] = useState('Sinh hoạt gia đình');
  const [customHangMuc, setCustomHangMuc] = useState('');
  const [dienGiai, setDienGiai] = useState('');
  const [projects, setProjects] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    if (open) {
      setType(defaultType);
      setAmtDisplay('');
      setForm({ category: '', payer_payee: '', payment_method: 'Chuyển khoản', contract_id: '', project_id: '', du_an_phong_ban: '', nguoi_lap: '', nguoi_duyet: '' });
      setHangMuc('Sinh hoạt gia đình');
      setCustomHangMuc('');
      setDienGiai('');
      setError('');
      fetch(`${API}/api/finance/projects`)
        .then(r => r.json())
        .then(d => setProjects(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
      fetch(`${API}/api/finance/contracts`)
        .then(r => r.json())
        .then(d => setContracts(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
    }
  }, [open, defaultType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseAmt(amtDisplay);
    if (!amount) { setError('Nhập số tiền hợp lệ'); return; }

    const finalCategory = (hangMuc === 'Khác' ? (customHangMuc.trim() || 'Khác') : hangMuc) + ': ' + dienGiai.trim();

    // Validation constraint for "Chi thụ lý bản vẽ"
    if (hangMuc === 'Chi thụ lý bản vẽ' && !form.contract_id && !form.project_id) {
      setError("Hạng mục 'Chi thụ lý bản vẽ' bắt buộc phải liên kết Hợp đồng hoặc Hồ sơ/Dự án!");
      return;
    }

    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/api/finance/cashflow/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          amount,
          ...form,
          category: finalCategory,
          contract_id: form.contract_id || null,
          project_id: form.project_id || null,
          du_an_phong_ban: form.du_an_phong_ban || null,
          nguoi_lap: form.nguoi_lap || null,
          nguoi_duyet: form.nguoi_duyet || null
        })
      });
      if (res.ok) {
        const d = await res.json();
        addToast(`✅ ${d.id} ghi nhận thành công`, 'success');
        onSuccess?.();
        onClose();
      } else {
        const err = await res.json();
        setError(err.detail || 'Lỗi server');
      }
    } catch { setError('Lỗi kết nối'); }
    finally { setSubmitting(false); }
  };

  const isThu = type === 'Thu';
  const accent = isThu ? '#10b981' : '#ef4444';

  return (
    <Modal open={open} onClose={onClose} size="md"
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isThu ? <PlusCircle size={18} color={accent} /> : <MinusCircle size={18} color={accent} />}
          <span style={{ color: accent }}>Lập {isThu ? 'Phiếu Thu' : 'Phiếu Chi'}</span>
        </span>
      }
    >
      <form onSubmit={handleSubmit}>
        {/* Type toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['Thu', 'Chi'].map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              style={{
                flex: 1, height: 40, borderRadius: 8, border: '2px solid',
                borderColor: type === t ? (t === 'Thu' ? '#10b981' : '#ef4444') : 'var(--border-default)',
                background: type === t ? (t === 'Thu' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)') : 'transparent',
                color: type === t ? (t === 'Thu' ? '#10b981' : '#ef4444') : 'var(--text-tertiary)',
                fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
              }}>
              {t === 'Thu' ? '↑ Phiếu Thu' : '↓ Phiếu Chi'}
            </button>
          ))}
        </div>
        {/* Amount */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Số tiền *</label>
          <div style={{ position: 'relative' }}>
            <input autoFocus required className="form-control"
              value={amtDisplay} onChange={e => setAmtDisplay(fmtAmt(e.target.value))}
              type="text" inputMode="numeric" placeholder="0"
              style={{ fontSize: '1.5rem', fontWeight: 800, textAlign: 'right', padding: '12px 48px 12px 12px', color: accent, borderColor: `${accent}55`, background: `${accent}06` }}
            />
            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: accent, fontWeight: 700, opacity: 0.7 }}>₫</span>
          </div>
        </div>
        <FormGrid cols={2}>
          <FormRow label="Hình thức" required>
            <Dropdown
              value={form.payment_method}
              onChange={(val) => setForm({ ...form, payment_method: val })}
              options={[
                { value: "Chuyển khoản", label: "🏦 Chuyển khoản" },
                { value: "Tiền mặt", label: "💵 Tiền mặt" }
              ]}
              required
            />
          </FormRow>
          <FormRow label="Người nhận / nộp" required>
            <input required className="form-control" value={form.payer_payee}
              onChange={e => setForm({ ...form, payer_payee: e.target.value })}
              placeholder={isThu ? 'Người nộp tiền...' : 'Người nhận tiền...'} />
          </FormRow>
          <FormRow label="Hạng mục" required>
            <Dropdown
              value={hangMuc}
              onChange={(val) => {
                setHangMuc(val);
                const mapping = CATEGORY_AUTO_MAPPING[val];
                if (mapping) {
                  setForm(prev => ({
                    ...prev,
                    payer_payee: mapping.doi_tac,
                    du_an_phong_ban: mapping.phong_ban,
                    nguoi_lap: mapping.nguoi_lap,
                    nguoi_duyet: mapping.nguoi_duyet
                  }));
                }
              }}
              options={[
                { value: "Sinh hoạt gia đình", label: "🏠 Sinh hoạt gia đình" },
                { value: "Chi bảo vệ", label: "🛡️ Chi bảo vệ" },
                { value: "Chi thụ lý bản vẽ", label: "📐 Chi thụ lý bản vẽ (Yêu cầu HS/DA)" },
                { value: "Viết hồ sơ", label: "✍️ Viết hồ sơ" },
                { value: "Bản vẽ cấp giấy", label: "📄 Bản vẽ cấp giấy" },
                { value: "Văn phòng phẩm", label: "✏️ Văn phòng phẩm" },
                { value: "In ấn - Photocopy", label: "🖨️ In ấn - Photocopy" },
                { value: "Chi quầy tiếp nhận", label: "🛎️ Chi quầy tiếp nhận" },
                { value: "Ăn uống", label: "🍲 Ăn uống" },
                { value: "Đi lại - Xăng xe - Gửi xe", label: "🚗 Đi lại - Xăng xe - Gửi xe" },
                { value: "Công tác phí", label: "✈️ Công tác phí" },
                { value: "Chuyển phát - Bưu chính-Grab", label: "📦 Chuyển phát - Bưu chính-Grab" },
                { value: "Trang thiết bị", label: "💻 Trang thiết bị" },
                { value: "Tiếp khách", label: "🤝 Tiếp khách" },
                { value: "Điện - Nước - Internet", label: "⚡ Điện - Nước - Internet" },
                { value: "Sửa chữa nhỏ", label: "🔧 Sửa chữa nhỏ" },
                { value: "Bảo trì thiết bị", label: "🖥️ Bảo trì thiết bị" },
                { value: "Vệ sinh - Rác thải", label: "🧹 Vệ sinh - Rác thải" },
                { value: "Lấy sổ", label: "📘 Lấy sổ" },
                { value: "Lấy bản vẽ", label: "📐 Lấy bản vẽ" },
                { value: "Lấy trích lục", label: "📜 Lấy trích lục" },
                { value: "Công chứng hồ sơ", label: "✒️ Công chứng hồ sơ" },
                { value: "Quầy nước- cà phê", label: "☕ Quầy nước- cà phê" },
                { value: "Bổ sung quỹ", label: "💰 Bổ sung quỹ" },
                { value: "Đóng thuế", label: "🏦 Đóng thuế" },
                { value: "Hỗ trợ sự kiện - Marketing", label: "📣 Hỗ trợ sự kiện - Marketing" },

                { value: "Khác", label: "✨ Khác (Tự nhập)" }
              ]}
            />
          </FormRow>
          {hangMuc === 'Khác' && (
            <FormRow label="Hạng mục tự nhập" required>
              <input required className="form-control" value={customHangMuc}
                onChange={e => setCustomHangMuc(e.target.value)}
                placeholder="Nhập tên hạng mục khác..." />
            </FormRow>
          )}
          <FormRow label="Diễn giải chi tiết" required cols={hangMuc === 'Khác' ? 2 : 1}>
            <input required className="form-control" value={dienGiai}
              onChange={e => setDienGiai(e.target.value)}
              placeholder="Nhập chi tiết diễn giải giao dịch..." />
          </FormRow>
          <FormRow label="Hợp đồng liên kết" required={hangMuc === 'Chi thụ lý bản vẽ' && !form.project_id}>
            <input type="text" className="form-control" placeholder="Nhập ID hợp đồng..." value={form.contract_id || ''} onChange={e => setForm({ ...form, contract_id: e.target.value })} />
          </FormRow>
          <FormRow label="Hồ sơ / Dự án" required={hangMuc === 'Chi thụ lý bản vẽ' && !form.contract_id}>
            <input type="text" className="form-control" placeholder="Nhập ID hồ sơ..." value={form.project_id || ''} onChange={e => setForm({ ...form, project_id: e.target.value })} />
          </FormRow>
        </FormGrid>
        {!isThu && form.payment_method === 'Tiền mặt' && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: '0.82rem', color: '#f59e0b' }}>
            ⚠️ Hệ thống tự kiểm tra số dư quỹ tiền mặt trước khi ghi nhận.
          </div>
        )}
        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: '0.88rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border-default)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
          <button type="submit" className="btn" disabled={submitting}
            style={{ background: accent, color: '#fff', padding: '0 24px', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? '⏳ Đang xử lý...' : `Ghi nhận ${isThu ? 'Phiếu Thu' : 'Phiếu Chi'}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

