import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet, ChevronRight, Receipt, Banknote, Building2,
  FileText, AlertCircle, ArrowDownLeft, ArrowUpRight,
  Clock, RotateCcw, Users, Hammer, BarChart2, TrendingUp,
  PlusCircle, MinusCircle, RefreshCw, DollarSign, X, Link, Settings
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useToast } from '../contexts/ToastContext';
import { DataTable, Badge, Modal, FormRow, FormGrid, FilterBar, SubTabs, Dropdown } from '../components/ui';

const API = 'http://127.0.0.1:8080';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + '₫';
const fmtShort = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B₫`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(0)}M₫`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K₫`;
  return fmt(n);
};
const fmtAmt = (v) => v ? Number(v.replace(/[^\d]/g, '')).toLocaleString('vi-VN') : '';
const parseAmt = (v) => parseFloat(String(v).replace(/[^\d]/g, '')) || 0;

// ── Menu Config ───────────────────────────────────────────────────────────────
const MENU = [
  {
    id: 'cashflow', label: 'Quản Lý Dòng Tiền', icon: Wallet,
    children: [
      { id: 'cashflow-all', label: 'Nhật Ký Thu Chi', icon: Receipt },
      { id: 'cashflow-cash', label: 'Quỹ Tiền Mặt', icon: Banknote },
      { id: 'cashflow-bank', label: 'Tài Khoản Ngân Hàng', icon: Building2 },
      { id: 'cashflow-print', label: 'Chứng từ Thu / Chi', icon: FileText },
    ]
  },
  {
    id: 'invoices', label: 'Chứng Từ & Công Nợ', icon: FileText,
    children: [
      { id: 'contracts', label: 'Hợp Đồng & Hóa Đơn', icon: FileText },
      { id: 'receivables', label: 'Công Nợ Phải Thu', icon: ArrowUpRight },
      { id: 'payables', label: 'Công Nợ Phải Trả', icon: ArrowDownLeft }
    ]
  },
  {
    id: 'advance', label: 'Chi Phí Tạm Ứng', icon: Clock,
    children: [
      { id: 'advance-request', label: 'Đề Xuất Tạm Ứng', icon: PlusCircle },
      { id: 'advance-clear', label: 'Quyết Toán Hoàn Ứng', icon: RotateCcw }
    ]
  },
  {
    id: 'payroll', label: 'Nhân Sự & Tiền Lương', icon: Users,
    children: [
      { id: 'payroll-office', label: 'Lương VP & Hoa Hồng', icon: Users },
      { id: 'payroll-worker', label: 'Lương Khoán Tổ Thợ', icon: Hammer }
    ]
  },
  {
    id: 'analytics', label: 'Báo Cáo & Lợi Nhuận', icon: BarChart2,
    children: [
      { id: 'analytics-dashboard', label: 'Biểu Đồ Xu Hướng', icon: TrendingUp },
      { id: 'analytics-profit', label: 'Lợi Nhuận Dự Án', icon: DollarSign }
    ]
  }
];

// ════════════════════════════════════════════════════════════════════════════
// FinanceSidebar
// ════════════════════════════════════════════════════════════════════════════
function FinanceSidebar({ active, onSelect }) {
  const [open, setOpen] = useState({ cashflow: true, invoices: true, advance: false, payroll: false, analytics: false });

  const toggle = (id) => setOpen(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside className="finance-subnav">
      {MENU.map(group => {
        const GroupIcon = group.icon;
        const isOpen = open[group.id];
        return (
          <div key={group.id} className="finance-subnav-section">
            <div
              className={`finance-subnav-group ${isOpen ? 'open' : ''}`}
              onClick={() => toggle(group.id)}
            >
              <GroupIcon size={14} />
              <span>{group.label}</span>
              <ChevronRight size={13} className="finance-subnav-chevron" />
            </div>
            <div className={`finance-subnav-children ${isOpen ? 'open' : ''}`}>
              {group.children.map(item => {
                const ItemIcon = item.icon;
                return (
                  <div
                    key={item.id}
                    className={`finance-subnav-item ${active === item.id ? 'active' : ''}`}
                    onClick={() => onSelect(item.id)}
                  >
                    <ItemIcon size={13} />
                    {item.label}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </aside>
  );
}

// ════════════════════════════════════════════════════════════════════════════

const docSoTiengViet = (number) => {
  const num = Number(number) || 0;
  if (num === 0) return 'Không đồng';
  const dv = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const chuc = ['', 'mười', 'hai mươi', 'ba mươi', 'bốn mươi', 'năm mươi', 'sáu mươi', 'bảy mươi', 'tám mươi', 'chín mươi'];
  const tram = ['không trăm', 'một trăm', 'hai trăm', 'ba trăm', 'bốn trăm', 'năm trăm', 'sáu trăm', 'bảy trăm', 'tám trăm', 'chín trăm'];

  function doc3So(n, showZeroTram) {
    let tr = Math.floor(n / 100);
    let ch = Math.floor((n % 100) / 10);
    let dv_val = n % 10;
    let res = '';
    if (tr > 0 || showZeroTram) {
      res += tram[tr] + ' ';
    }
    if (ch > 0) {
      if (ch === 1) res += 'mười ';
      else res += chuc[ch] + ' ';
    } else if (tr > 0 && dv_val > 0) {
      res += 'lẻ ';
    }
    if (dv_val > 0) {
      if (dv_val === 1 && ch > 1) res += 'mốt ';
      else if (dv_val === 5 && ch > 0) res += 'lăm ';
      else res += dv[dv_val] + ' ';
    }
    return res;
  }

  let str = '';
  let ty = Math.floor(num / 1e9);
  let tr_t = Math.floor((num % 1e9) / 1e6);
  let ng = Math.floor((num % 1e6) / 1e3);
  let d = Math.floor(num % 1e3);

  if (ty > 0) {
    str += doc3So(ty, false) + 'tỷ ';
  }
  if (tr_t > 0) {
    str += doc3So(tr_t, ty > 0) + 'triệu ';
  }
  if (ng > 0) {
    str += doc3So(ng, ty > 0 || tr_t > 0) + 'nghìn ';
  }
  if (d > 0) {
    str += doc3So(d, ty > 0 || tr_t > 0 || ng > 0) + '';
  }

  let res = str.trim();
  if (res.length > 0) {
    res = res.charAt(0).toUpperCase() + res.slice(1) + ' đồng chẵn';
  }
  return res;
};

// Shared: CashflowModal (dùng cho phiếu Thu/Chi)
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
const CATEGORY_AUTO_MAPPING = {
  "Văn phòng phẩm": {
    phong_ban: "Phòng Kỹ Thuật",
    doi_tac: "Hằng",
    nguoi_lap: "Hằng",
    nguoi_duyet: "Giám đốc"
  },
  "In ấn - Photocopy": {
    phong_ban: "Phòng Pháp Lý",
    doi_tac: "Nguyễn Thị A",
    nguoi_lap: "Nguyễn Thị A",
    nguoi_duyet: "Giám đốc"
  },
  "Chi quầy tiếp nhận": {
    phong_ban: "Phòng Marketing",
    doi_tac: "Nhân viên Marketing",
    nguoi_lap: "Nhân viên Marketing",
    nguoi_duyet: "Giám đốc"
  },
  "Chi thụ lý bản vẽ": {
    phong_ban: "Phòng Kỹ Thuật",
    doi_tac: "Lê Văn Dựng",
    nguoi_lap: "Lê Văn Dựng",
    nguoi_duyet: "Giám đốc"
  }
};

function CashflowModal({ open, onClose, defaultType = 'Thu', onSuccess }) {
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

// ════════════════════════════════════════════════════════════════════════════
// CashflowDetailModal - Xem / Sửa và gắn Hợp đồng
// ════════════════════════════════════════════════════════════════════════════
function CashflowDetailModal({ open, transactionId, onClose, onSuccess }) {
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({
    hang_muc: '',
    nguoi_nhan_nop: '',
    hinh_thuc: 'Tiền mặt',
    so_tien: '',
    ngay: '',
    dien_giai: '',
    contract_id: ''
  });
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [autofillNotice, setAutofillNotice] = useState('');
  const { addToast } = useToast();

  const isReadOnly = detail?.trang_thai === 'Hoàn thành' || detail?.trang_thai === 'Đã duyệt';

  useEffect(() => {
    if (open && transactionId) {
      setLoading(true);
      setError('');
      setDirty(false);
      setAutofillNotice('');

      // Load transaction details
      fetch(`${API}/api/finance/cashflow/${transactionId}`)
        .then(r => r.json())
        .then(d => {
          setDetail(d);
          let parsedDate = d.ngay;
          if (parsedDate && parsedDate.includes('/')) {
            const [dd, mm, yy] = parsedDate.split('/');
            parsedDate = `20${yy}-${mm}-${dd}`;
          }
          setForm({
            hang_muc: d['Hạng mục'] || '',
            nguoi_nhan_nop: d['Đối tác'] || '',
            hinh_thuc: d['Hình thức'] || 'Tiền mặt',
            so_tien: String(d.amount || ''),
            ngay: parsedDate || '',
            dien_giai: d['Diễn giải'] || '',
            contract_id: d.contract_id || ''
          });
          setLoading(false);
        })
        .catch(() => {
          setError('Không thể tải dữ liệu phiếu');
          setLoading(false);
        });

      // Load contracts
      fetch(`${API}/api/finance/contracts`)
        .then(r => r.json())
        .then(d => setContracts(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
    }
  }, [open, transactionId]);

  const handleContractChange = (cid) => {
    setDirty(true);

    let newPayer = form.nguoi_nhan_nop;
    let notice = '';

    if (cid) {
      const c = contracts.find(x => x.id === cid);
      if (c && c.customer_name) {
        if (!form.nguoi_nhan_nop) {
          newPayer = c.customer_name;
        } else if (form.nguoi_nhan_nop !== c.customer_name) {
          newPayer = c.customer_name;
          notice = 'Đã tự điền theo hồ sơ — bạn có thể chỉnh lại';
        }
      }
    }

    setAutofillNotice(notice);
    setForm(prev => ({ ...prev, contract_id: cid, nguoi_nhan_nop: newPayer }));
  };

  const handleChange = (field, val) => {
    setDirty(true);
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const handleClose = () => {
    if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Thoát mà không lưu?')) {
      return;
    }
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseAmt(form.so_tien);
    if (!isReadOnly && !amount) { setError('Nhập số tiền hợp lệ'); return; }

    setSubmitting(true); setError('');
    try {
      const payload = {
        hang_muc: form.hang_muc,
        nguoi_nhan_nop: form.nguoi_nhan_nop,
        hinh_thuc: form.hinh_thuc,
        so_tien: amount,
        ngay: form.ngay,
        dien_giai: form.dien_giai,
        contract_id: form.contract_id || null
      };

      const res = await fetch(`${API}/api/finance/cashflow/${transactionId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        addToast(`✅ Đã lưu thay đổi phiếu ${transactionId}`, 'success');
        setDirty(false);
        onSuccess?.();
        onClose();
      } else {
        const err = await res.json();
        setError(err.detail || 'Lỗi server');
      }
    } catch { setError('Lỗi kết nối'); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;

  const isThu = detail?.type === 'Thu';
  const accent = isThu ? '#10b981' : '#ef4444';
  const brandAccent = '#eb4a23';
  const selectedContract = form.contract_id ? contracts.find(c => c.id === form.contract_id) || detail?.contract_info : null;

  return (
    <Modal open={open} onClose={handleClose} size="lg" hideClose={true} closeOnOverlay={!dirty}>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Đang tải...</div>
      ) : (
        <form onSubmit={handleSubmit}>
          <table className="excel-grid-table">
            <tbody>
              <tr>
                <td colSpan={2} style={{ width: '40%', textAlign: 'center', padding: '15px 10px', verticalAlign: 'middle', fontWeight: 'bold' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <img src="/src/assets/logo.png" alt="LOGO" style={{ height: 42, objectFit: 'contain' }} />
                    <span style={{ fontSize: '0.75rem', letterSpacing: 0.5, opacity: 0.8 }}>BÁCH KHOA ERP</span>
                  </div>
                </td>
                <td colSpan={2} style={{ width: '60%', textAlign: 'center', padding: '15px 10px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: 1, color: accent }}>
                    {isThu ? 'PHIẾU THU' : 'PHIẾU CHI'}
                  </h2>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, fontSize: '0.82rem', color: '#444' }}>
                    <span>Ngày in: {new Date().toLocaleDateString('vi-VN')}</span>
                    <span>Giờ: {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold', width: '15%' }}>Số CT</td>
                <td style={{ width: '35%' }}>
                  <input type="text" readOnly value={transactionId || ''} style={{ fontWeight: 'bold', fontFamily: 'monospace' }} />
                </td>
                <td style={{ fontWeight: 'bold', width: '15%' }}>Ngày</td>
                <td style={{ width: '35%' }}>
                  <input type="date" disabled={isReadOnly} value={form.ngay} onChange={e => handleChange('ngay', e.target.value)} style={{ fontFamily: 'monospace' }} required />
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold' }}>Diễn giải</td>
                <td>
                  <input type="text" disabled={isReadOnly} value={form.dien_giai} onChange={e => handleChange('dien_giai', e.target.value)} placeholder="Nhập diễn giải chi tiết..." required />
                </td>
                <td style={{ fontWeight: 'bold' }}>Hạng mục</td>
                <td>
                  <input type="text" disabled={isReadOnly} value={form.hang_muc} onChange={e => handleChange('hang_muc', e.target.value)} required />
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold' }}>{isThu ? 'Người nộp' : 'Người nhận'}</td>
                <td>
                  <input type="text" disabled={isReadOnly} value={form.nguoi_nhan_nop} onChange={e => handleChange('nguoi_nhan_nop', e.target.value)} placeholder={isThu ? 'Họ tên người nộp tiền...' : 'Họ tên người nhận tiền...'} required />
                </td>
                <td style={{ fontWeight: 'bold' }}>Hình thức</td>
                <td>
                  <select disabled={isReadOnly} value={form.hinh_thuc} onChange={e => handleChange('hinh_thuc', e.target.value)}>
                    <option value="Chuyển khoản">🏦 Chuyển khoản</option>
                    <option value="Tiền mặt">💵 Tiền mặt</option>
                  </select>
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold' }}>Phòng ban</td>
                <td>
                  <input type="text" disabled value={detail?.du_an_phong_ban || 'Kế toán'} placeholder="Kế toán, Kỹ thuật, Công trường..." />
                </td>
                <td style={{ fontWeight: 'bold' }}>Số tiền</td>
                <td>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={form.so_tien ? Number(form.so_tien).toLocaleString('vi-VN') : ''}
                    onChange={e => handleChange('so_tien', e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="0"
                    style={{ fontWeight: 'bold', textAlign: 'right', color: accent, fontSize: '1.1rem' }}
                    required
                  />
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold' }}>Trạng thái</td>
                <td>
                  <input type="text" disabled value={detail?.status || 'Hoàn thành'} />
                </td>
                <td style={{ fontWeight: 'bold' }}>Liên kết</td>
                <td style={{ padding: '6px 10px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" placeholder="Nhập ID hợp đồng..." value={form.contract_id || ''} onChange={(e) => handleContractChange(e.target.value)} style={{ fontSize: '0.75rem', width: '100%', padding: '4px' }} />
                  </div>
                </td>
              </tr>

              <tr>
                <td colSpan={4} style={{ padding: '10px' }}>
                  <span style={{ fontWeight: 'bold' }}>Số tiền (bằng chữ): </span>
                  <i style={{ color: 'var(--text-secondary)' }}>
                    {form.so_tien ? docSoTiengViet(form.so_tien) : 'Không đồng'}
                  </i>
                </td>
              </tr>
            </tbody>
          </table>

          {isReadOnly && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: '0.82rem', color: '#f59e0b' }}>
              ⚠️ Phiếu đã duyệt/hoàn thành. Chỉ cho phép chỉnh sửa liên kết hồ sơ.
            </div>
          )}

          {error && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: '0.88rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={handleClose}>Hủy bỏ</button>
            <button type="submit" className="btn" disabled={submitting || (!dirty && !isReadOnly)}
              style={{ background: brandAccent, color: '#fff', padding: '0 24px', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? '⏳ Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Shared: CashflowTable  
// ════════════════════════════════════════════════════════════════════════════
const CF_COLS = [
  { key: 'contract_id', label: '', width: 32, align: 'center', render: v => v ? <Link size={14} color="#eb4a23" title="Đã gắn hồ sơ" style={{ marginTop: 4 }} /> : null },
  { key: 'Ngày', label: 'Ngày', width: 95, render: v => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem' }}>{v}</span> },
  { key: 'id', label: 'Mã phiếu', width: 160, render: v => <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{v}</strong> },
  {
    key: 'Hạng mục', label: 'Hạng mục', width: 300,
    render: (v) => {
      const isSensitive = v === 'Chi thụ lý bản vẽ' || (v && v.startsWith('Chi thụ lý bản vẽ:'));
      return (
        <span style={{
          fontWeight: isSensitive ? 'bold' : 'normal',
          color: isSensitive ? '#dc2626' : 'inherit'
        }}>
          {v}
        </span>
      );
    }
  },
  { key: 'Diễn giải', label: 'Diễn giải' },
  { key: 'Đối tác', label: 'Đối tác', width: 200 },
  {
    key: 'Hình thức', label: 'Hình thức', width: 120, align: 'center',
    render: v => (
      <span style={{
        fontSize: '0.78rem', padding: '3px 8px', borderRadius: 4, fontWeight: 600,
        background: v === 'Tiền mặt' ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)',
        color: v === 'Tiền mặt' ? '#f59e0b' : '#6366f1'
      }}>
        {v === 'Tiền mặt' ? 'Tiền mặt' : 'Chuyển khoản'}
      </span>
    )
  },

  {
    key: 'amount', label: 'Số tiền', width: 145, align: 'right',
    render: (v, row) => (
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.93rem', color: row.type === 'Thu' ? '#10b981' : '#ef4444' }}>
        {row.type === 'Thu' ? '+' : '−'}{fmt(v)}
      </span>
    )
  }
];

// ════════════════════════════════════════════════════════════════════════════
// Screen 1-3: Cashflow screens
// ════════════════════════════════════════════════════════════════════════════
function CashflowScreen({ mode = 'all' }) {
  const [data, setData] = useState([]);
  const [balance, setBalance] = useState({ tien_mat: 0, ngan_hang: 0, balance: 0, tong_thu: 0, tong_chi: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ type: 'All', payment_method: 'All' });
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [sort, setSort] = useState('desc');
  const [modal, setModal] = useState(null); // null | 'Thu' | 'Chi'
  const [detailId, setDetailId] = useState(null);

  // ── Đối chiếu theo Mã Hợp Đồng / Mã Hồ Sơ (Task 15) ──────────────────────
  const [reconcileMode, setReconcileMode] = useState('contract'); // 'contract' | 'project'
  const [reconcileId, setReconcileId] = useState('');
  const [contracts, setContracts] = useState([]);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    if (mode === 'all') {
      fetch(`${API}/api/finance/contracts`)
        .then(r => r.json())
        .then(d => setContracts(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
      fetch(`${API}/api/finance/projects`)
        .then(r => r.json())
        .then(d => setProjects(Array.isArray(d) ? d : d.data || []))
        .catch(() => { });
    }
  }, [mode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (month) p.set('month', month);
      if (filters.type !== 'All') p.set('type', filters.type);
      if (filters.payment_method !== 'All') p.set('payment_method', filters.payment_method);
      if (reconcileId) p.set(reconcileMode === 'contract' ? 'contract_id' : 'project_id', reconcileId);

      if (mode === 'cash') {
        const r = await fetch(`${API}/api/finance/cashflow/cash?${p}`);
        const d = await r.json();
        setBalance(d);
        setData(d.transactions || []);
      } else if (mode === 'bank') {
        const r = await fetch(`${API}/api/finance/cashflow/bank?${p}`);
        const d = await r.json();
        setBalance(d);
        setData(d.transactions || []);
      } else {
        const r = await fetch(`${API}/api/finance/cashflow?${p}`);
        setData(await r.json());
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [mode, filters, month, reconcileMode, reconcileId]);

  useEffect(() => { load(); }, [load]);

  const filtered = data.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (t['Danh mục'] || '').toLowerCase().includes(q) ||
      (t['Đối tác'] || '').toLowerCase().includes(q) ||
      (t.id || '').toLowerCase().includes(q);
  });
  const sortedFiltered = sort === 'asc' ? [...filtered].reverse() : filtered;

  const totalThu = filtered.filter(t => t.type === 'Thu').reduce((s, t) => s + t.amount, 0);
  const totalChi = filtered.filter(t => t.type === 'Chi').reduce((s, t) => s + t.amount, 0);

  const titles = { all: ' Nhật Ký Thu Chi', cash: 'Quỹ Tiền Mặt', bank: 'Quỹ Tài Khoản Ngân Hàng' };
  const subs = { all: 'Toàn bộ lịch sử dòng tiền', cash: 'Giao dịch tiền mặt', bank: 'Giao dịch chuyển khoản' };

  return (
    <div>
      <div className="finance-screen-header">
        <div>
          <div className="finance-screen-title">{titles[mode]}</div>
          <div className="finance-screen-sub">{subs[mode]}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={load} style={{ height: 36, width: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Balance card for cash/bank modes */}
      {mode !== 'all' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div className="balance-card">
            <div className="balance-card__icon" style={{ background: balance.balance >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
              {mode === 'cash' ? '💵' : '🏦'}
            </div>
            <div>
              <div className="balance-card__label">Số Dư Hiện Tại</div>
              <div className={`balance-card__amount ${balance.balance >= 0 ? 'positive' : 'negative'}`}>
                {balance.balance >= 0 ? '+' : ''}{fmtShort(balance.balance)}
              </div>
            </div>
          </div>
          <div className="balance-card">
            <div className="balance-card__icon" style={{ background: 'rgba(16,185,129,0.1)' }}>↑</div>
            <div>
              <div className="balance-card__label">Tổng Thu</div>
              <div className="balance-card__amount positive">+{fmtShort(balance.tong_thu)}</div>
            </div>
          </div>
          <div className="balance-card">
            <div className="balance-card__icon" style={{ background: 'rgba(239,68,68,0.1)' }}>↓</div>
            <div>
              <div className="balance-card__label">Tổng Chi</div>
              <div className="balance-card__amount negative">−{fmtShort(balance.tong_chi)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filter row */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={mode === 'all' ? "Tìm số phiếu, đối tác, danh mục..." : "Tìm số phiếu, đối tác..."}
        filters={[
          { key: 'type', label: 'Loại', type: 'select', width: 140, options: [{ value: 'Thu', label: '🟢 Thu' }, { value: 'Chi', label: '🔴 Chi' }] },
          { key: 'payment_method', label: 'Hình thức', type: 'select', width: 160, options: [{ value: 'Tiền mặt', label: 'Tiền mặt' }, { value: 'Chuyển khoản', label: 'Chuyển khoản' }] }
        ]}
        values={filters}
        onFilterChange={(k, v) => setFilters(p => ({ ...p, [k]: v }))}
        onReset={() => { setSearch(''); setFilters({ type: 'All', payment_method: 'All' }); setMonth(() => new Date().toISOString().slice(0, 7)); setReconcileId(''); setSort('desc'); }}
        month={month}
        onMonthChange={setMonth}
        sort={sort}
        onSortChange={setSort}
      />



      {/* Summary strip */}
      {filtered.length > 0 && (
        <div className="summary-strip">
          <span style={{ color: 'var(--text-tertiary)' }}>{filtered.length} giao dịch</span>
          <span style={{ color: '#10b981', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>↑ +{fmt(totalThu)}</span>
          <span style={{ color: '#ef4444', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>↓ −{fmt(totalChi)}</span>
          <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: (totalThu - totalChi) >= 0 ? '#10b981' : '#ef4444' }}>
            = {totalThu - totalChi >= 0 ? '+' : ''}{fmt(totalThu - totalChi)}
          </span>
        </div>
      )}

      <DataTable columns={CF_COLS} data={sortedFiltered} loading={loading} rowKey="id"
        emptyText="Chưa có giao dịch nào" pageSize={15} onRowClick={row => setDetailId(row.id)} />

      <CashflowModal open={!!modal} onClose={() => setModal(null)} defaultType={modal || 'Thu'} onSuccess={load} />
      <CashflowDetailModal open={!!detailId} transactionId={detailId} onClose={() => setDetailId(null)} onSuccess={load} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Screen 4: Hợp đồng & Hóa đơn
// ════════════════════════════════════════════════════════════════════════════
function ContractsScreen() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${API}/api/finance/contracts`).then(r => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = data.filter(c => !search ||
    (c.id || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.customer_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const cols = [
    { key: 'id', label: 'Mã HĐ', width: 130, render: v => <strong style={{ fontFamily: 'var(--font-mono)' }}>{v}</strong> },
    { key: 'customer_name', label: 'Khách hàng' },
    { key: 'phone', label: 'SĐT', width: 115 },
    { key: 'service_type', label: 'Loại dịch vụ' },
    { key: 'date_signed', label: 'Ngày ký', width: 100, render: v => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem' }}>{v}</span> },
    { key: 'total_value', label: 'Giá trị HĐ', width: 130, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(v)}</span> },
    { key: 'paid_amount', label: 'Đã thu', width: 120, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600 }}>+{fmt(v)}</span> },
    { key: 'remaining', label: 'Còn lại', width: 120, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: v > 0 ? '#f59e0b' : 'var(--text-tertiary)', fontWeight: 600 }}>{v > 0 ? fmt(v) : '✓ Đủ'}</span> },
  ];

  return (
    <div>
      <div className="finance-screen-header">
        <div>
          <div className="finance-screen-title"> Hợp Đồng & Hóa Đơn</div>
          <div className="finance-screen-sub">Danh sách {data.length} hợp đồng — Xây dựng & Bất động sản</div>
        </div>
      </div>
      <input className="form-control" style={{ height: 38, maxWidth: 340, marginBottom: 14 }}
        placeholder="Tìm mã HĐ hoặc tên khách hàng..."
        value={search} onChange={e => setSearch(e.target.value)} />
      <DataTable columns={cols} data={filtered} loading={loading} rowKey="id" emptyText="Chưa có hợp đồng" pageSize={15} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Screen 5: Công nợ phải thu
// ════════════════════════════════════════════════════════════════════════════
function ReceivablesScreen() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/finance/receivables`).then(r => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const overdueCount = data.filter(r => r.overdue).length;
  const totalRemaining = data.reduce((s, r) => s + r.remaining_amount, 0);

  const cols = [
    { key: 'contract_id', label: 'Mã HĐ', width: 130, render: v => <strong style={{ fontFamily: 'var(--font-mono)' }}>{v}</strong> },
    { key: 'paid_amount', label: 'Đã thu', width: 130, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600 }}>+{fmt(v)}</span> },
    { key: 'remaining_amount', label: 'Còn nợ', width: 130, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: v > 0 ? '#ef4444' : 'var(--text-tertiary)', fontWeight: 700 }}>{v > 0 ? fmt(v) : '✓ Xong'}</span> },
    { key: 'due_date', label: 'Hạn thu', width: 110, render: v => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem' }}>{v || '—'}</span> },
    { key: 'overdue', label: 'Trạng thái', width: 120, align: 'center', render: (v, row) => v ? <span className="overdue-badge">⚠️ Quá hạn</span> : row.remaining_amount <= 0 ? <Badge variant="success">Đã thu đủ</Badge> : <Badge variant="info">Chờ thu</Badge> },
  ];

  return (
    <div>
      <div className="finance-screen-header">
        <div>
          <div className="finance-screen-title">📊 Công Nợ Phải Thu</div>
          <div className="finance-screen-sub">
            {overdueCount > 0 && <span style={{ color: '#f59e0b', fontWeight: 600 }}>⚠️ {overdueCount} khoản quá hạn — </span>}
            Tổng còn nợ: <strong style={{ color: '#ef4444' }}>{fmt(totalRemaining)}</strong>
          </div>
        </div>
      </div>
      <DataTable columns={cols} data={data} loading={loading} rowKey="id"
        emptyText="Chưa có công nợ phải thu" pageSize={15}
        rowClassName={row => row.overdue ? 'row-overdue' : ''}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Screen 6: Công nợ phải trả
// ════════════════════════════════════════════════════════════════════════════
function PayablesScreen() {
  const [data, setData] = useState({ total_payable: 0, transactions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/finance/payables`).then(r => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="finance-screen-header">
        <div>
          <div className="finance-screen-title">Công Nợ Phải Trả</div>
          <div className="finance-screen-sub">Chi chuyển khoản không gắn hợp đồng — Nhà cung cấp / Nhà thầu phụ</div>
        </div>
        <div className="balance-card" style={{ padding: '12px 20px' }}>
          <div className="balance-card__label">Tổng phải trả</div>
          <div className="balance-card__amount negative">{fmtShort(data.total_payable)}</div>
        </div>
      </div>
      <DataTable columns={CF_COLS} data={data.transactions} loading={loading} rowKey="id"
        emptyText="Không có công nợ phải trả" pageSize={15} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Screen 7: Đề xuất tạm ứng
// ════════════════════════════════════════════════════════════════════════════
function AdvanceRequestScreen() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({
    project_id: '',
    contract_id: '',
    amount: '',
    payer_payee: '',
    note: '',
    payment_method: 'Tiền mặt',
    du_an_phong_ban: '',
    nguoi_lap: 'Lê Văn Dựng',
    ke_toan: 'Nguyễn Thị A',
    nguoi_duyet: 'Lê Văn Dựng',
    trang_thai: 'Hoàn thành'
  });
  const [amtDisplay, setAmtDisplay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useToast();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ payment_method: 'All', trang_thai: 'All' });
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [sort, setSort] = useState('desc');

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/finance/advance`);
    setData(await r.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetch(`${API}/api/finance/projects`).then(r => r.json()).then(setProjects).catch(() => { });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseAmt(amtDisplay);
    if (!amount) { setError('Nhập số tiền'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/api/finance/advance/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: form.project_id || null,
          contract_id: form.contract_id || null,
          amount,
          payer_payee: form.payer_payee,
          note: form.note,
          payment_method: form.payment_method,
          nguoi_lap: form.nguoi_lap,
          nguoi_duyet: form.nguoi_duyet,
          trang_thai: form.trang_thai,
          du_an_phong_ban: form.du_an_phong_ban || null
        })
      });
      if (res.ok) {
        addToast(' Đã tạo phiếu tạm ứng', 'success');
        setModal(false); load();
      } else {
        const err = await res.json();
        setError(err.detail || 'Lỗi server');
      }
    } catch { setError('Lỗi kết nối'); }
    finally { setSubmitting(false); }
  };

  const filtered = data.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      const matchSearch =
        (t.id || '').toLowerCase().includes(q) ||
        (t['Đối tác'] || t.nguoi_nhan_nop || '').toLowerCase().includes(q) ||
        (t.dien_giai || '').toLowerCase().includes(q) ||
        (t.hang_muc || '').toLowerCase().includes(q);
      if (!matchSearch) return false;
    }
    if (filters.payment_method !== 'All') {
      if (t['Hình thức'] !== filters.payment_method && t.hinh_thuc !== filters.payment_method) return false;
    }
    if (filters.trang_thai !== 'All') {
      if (t.trang_thai !== filters.trang_thai) return false;
    }
    if (month) {
      const tDate = t.ngay || (t.created_at ? t.created_at.slice(0, 10) : '');
      if (!tDate.startsWith(month)) return false;
    }
    return true;
  });

  const sortedFiltered = [...filtered].sort((a, b) => {
    const dateA = a.ngay || a.created_at || '';
    const dateB = b.ngay || b.created_at || '';
    if (dateA !== dateB) {
      return sort === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
    }
    return sort === 'desc' ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
  });

  return (
    <div>
      <div className="finance-screen-header">
        <div>
          <div className="finance-screen-title"> Đề Xuất Tạm Ứng</div>
          <div className="finance-screen-sub">Ứng tiền mặt cho kỹ sư/chỉ huy trưởng trước khi ra công trường</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setModal(true); setAmtDisplay(''); setForm({ project_id: '', contract_id: '', payer_payee: '', note: '', payment_method: 'Tiền mặt', du_an_phong_ban: '', nguoi_lap: 'Lê Văn Dựng', ke_toan: 'Nguyễn Thị A', nguoi_duyet: 'Lê Văn Dựng', trang_thai: 'Hoàn thành' }); setError(''); }}
          style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6 }}>
          <PlusCircle size={15} /> Đề Xuất Tạm Ứng
        </button>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm số phiếu, đối tác, dự án..."
        filters={[
          { key: 'payment_method', label: 'Hình thức', type: 'select', width: 160, options: [{ value: 'Tiền mặt', label: 'Tiền mặt' }, { value: 'Chuyển khoản', label: 'Chuyển khoản' }] },
          { key: 'trang_thai', label: 'Trạng thái', type: 'select', width: 140, options: [{ value: 'Hoàn thành', label: 'Hoàn thành' }, { value: 'Chờ duyệt', label: 'Chờ duyệt' }] }
        ]}
        values={filters}
        onFilterChange={(k, v) => setFilters(p => ({ ...p, [k]: v }))}
        onReset={() => { setSearch(''); setFilters({ payment_method: 'All', trang_thai: 'All' }); setMonth(() => new Date().toISOString().slice(0, 7)); setSort('desc'); }}
        month={month}
        onMonthChange={setMonth}
        sort={sort}
        onSortChange={setSort}
      />

      {sortedFiltered.length > 0 && (
        <div className="summary-strip">
          <span style={{ color: 'var(--text-tertiary)' }}>{sortedFiltered.length} đề xuất</span>
          <span style={{ color: '#ef4444', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            Tổng tạm ứng: −{fmt(sortedFiltered.reduce((s, t) => s + (t.amount || t.so_tien || 0), 0))}
          </span>
        </div>
      )}

      <DataTable columns={CF_COLS} data={sortedFiltered} loading={loading} rowKey="id" emptyText="Chưa có phiếu tạm ứng" pageSize={15} />

      <Modal open={modal} onClose={() => setModal(false)} size="lg" title="⏳ Đề Xuất Tạm Ứng">
        <form onSubmit={handleSubmit}>
          <table className="excel-grid-table">
            <tbody>
              <tr>
                <td colSpan={2} style={{ width: '40%', textAlign: 'center', padding: '15px 10px', verticalAlign: 'middle', fontWeight: 'bold' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <img src="/src/assets/logo.png" alt="LOGO" style={{ height: 42, objectFit: 'contain' }} />
                    <span style={{ fontSize: '0.75rem', letterSpacing: 0.5, opacity: 0.8 }}>BÁCH KHOA ERP</span>
                  </div>
                </td>
                <td colSpan={2} style={{ width: '60%', textAlign: 'center', padding: '15px 10px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: 1, color: '#f59e0b' }}>
                    PHIẾU TẠM ỨNG
                  </h2>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, fontSize: '0.82rem', color: '#444' }}>
                    <span>Ngày in: {new Date().toLocaleDateString('vi-VN')}</span>
                  </div>
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold', width: '15%' }}>Số CT</td>
                <td style={{ width: '35%' }}>
                  <input type="text" readOnly placeholder="Hệ thống tự tạo..." style={{ fontWeight: 'bold', fontFamily: 'monospace' }} />
                </td>
                <td style={{ fontWeight: 'bold', width: '15%' }}>Ngày</td>
                <td style={{ width: '35%' }}>
                  <input type="text" value={form.ngay || new Date().toLocaleDateString('vi-VN')} onChange={e => setForm({ ...form, ngay: e.target.value })} style={{ fontFamily: 'monospace' }} required />
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold' }}>Diễn giải</td>
                <td>
                  <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="VD: Tạm ứng đi đường, mua vật tư..." required />
                </td>
                <td style={{ fontWeight: 'bold' }}>Hạng mục</td>
                <td>
                  <input type="text" readOnly value="Chi phí tạm ứng" style={{ fontWeight: 'bold' }} />
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold' }}>Người nhận</td>
                <td>
                  <input type="text" value={form.payer_payee} onChange={e => setForm({ ...form, payer_payee: e.target.value })} placeholder="Nhập tên người nhận..." required />
                </td>
                <td style={{ fontWeight: 'bold' }}>Hình thức</td>
                <td>
                  <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                    <option value="Tiền mặt"> Tiền mặt</option>
                    <option value="Chuyển khoản"> Chuyển khoản</option>
                  </select>
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold' }}>Phòng ban</td>
                <td>
                  <input type="text" value={form.du_an_phong_ban} onChange={e => setForm({ ...form, du_an_phong_ban: e.target.value })} placeholder="Phòng Kỹ Thuật, Phòng Công Trường..." />
                </td>
                <td style={{ fontWeight: 'bold' }}>Số tiền</td>
                <td>
                  <input
                    type="text"
                    value={amtDisplay}
                    onChange={e => setAmtDisplay(fmtAmt(e.target.value))}
                    placeholder="0"
                    style={{ fontWeight: 'bold', textAlign: 'right', color: '#f59e0b', fontSize: '1.1rem' }}
                    required
                  />
                </td>
              </tr>

              <tr>
                <td style={{ fontWeight: 'bold' }}>Trạng thái</td>
                <td>
                  <input type="text" value={form.trang_thai} onChange={e => setForm({ ...form, trang_thai: e.target.value })} placeholder="Hoàn thành, Chờ duyệt..." />
                </td>
                <td style={{ fontWeight: 'bold' }}>Mã dự án / HĐ</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" placeholder="Dự án..." value={form.project_id || ''} onChange={e => setForm({ ...form, project_id: e.target.value })} style={{ fontSize: '0.82rem', width: '50%' }} />
                    <input type="text" placeholder="HĐ..." value={form.contract_id || ''} onChange={e => setForm({ ...form, contract_id: e.target.value })} style={{ fontSize: '0.82rem', width: '50%' }} />
                  </div>
                </td>
              </tr>

              <tr>
                <td colSpan={4} style={{ padding: '12px 10px', fontSize: '0.98rem', borderBottom: '2px solid #000' }}>
                  <strong>Số tiền (bằng chữ):</strong> <span style={{ fontStyle: 'italic', textDecoration: 'underline' }}>{docSoTiengViet(parseAmt(amtDisplay))}</span>
                </td>
              </tr>

              <tr>
                <td style={{ height: 130, padding: '10px 5px' }}>
                  <div className="signature-title">Người lập</div>
                  <div className="signature-sub">(Ký, ghi rõ họ tên)</div>
                  <div className="signature-input">
                    <input type="text" value={form.nguoi_lap} onChange={e => setForm({ ...form, nguoi_lap: e.target.value })} style={{ fontSize: '0.85rem' }} />
                  </div>
                </td>
                <td style={{ height: 130, padding: '10px 5px' }}>
                  <div className="signature-title">Kế toán</div>
                  <div className="signature-sub">(Ký, ghi rõ họ tên)</div>
                  <div className="signature-input">
                    <input type="text" value={form.ke_toan} onChange={e => setForm({ ...form, ke_toan: e.target.value })} style={{ fontSize: '0.85rem' }} />
                  </div>
                </td>
                <td style={{ height: 130, padding: '10px 5px' }}>
                  <div className="signature-title">Người duyệt</div>
                  <div className="signature-sub">(Ký, ghi rõ họ tên)</div>
                  <div className="signature-input">
                    <input type="text" value={form.nguoi_duyet} onChange={e => setForm({ ...form, nguoi_duyet: e.target.value })} style={{ fontSize: '0.85rem' }} />
                  </div>
                </td>
                <td style={{ height: 130, padding: '10px 5px' }}>
                  <div className="signature-title">Người nhận</div>
                  <div className="signature-sub">(Ký, ghi rõ họ tên)</div>
                  <div className="signature-input">
                    <input type="text" readOnly value={form.payer_payee} style={{ fontSize: '0.85rem', color: '#555' }} />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {error && <div style={{ marginTop: 12, color: '#ef4444', fontSize: '0.88rem' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? '⏳...' : 'Tạo Phiếu Tạm Ứng'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Screen 8: Quyết toán hoàn ứng
// ════════════════════════════════════════════════════════════════════════════
function AdvanceClearScreen() {
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [actualDisplay, setActualDisplay] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useToast();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ payment_method: 'All' });
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [sort, setSort] = useState('desc');

  const load = async () => {
    setLoading(true);
    const r = await fetch(`${API}/api/finance/advance`);
    setAdvances(await r.json());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openClear = (row) => { setSelected(row); setActualDisplay(''); setNote(''); setResult(null); setError(''); setModal(true); };

  const handleClear = async (e) => {
    e.preventDefault();
    const actual = parseAmt(actualDisplay);
    if (!actual) { setError('Nhập số tiền thực chi'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/api/finance/advance/clear`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advance_id: selected.id, actual_amount: actual, note })
      });
      if (res.ok) {
        const d = await res.json();
        setResult(d);
        addToast(' Quyết toán thành công — phiếu bù đã tạo tự động', 'success');
        load();
      } else {
        const err = await res.json();
        setError(err.detail || 'Lỗi server');
      }
    } catch { setError('Lỗi kết nối'); }
    finally { setSubmitting(false); }
  };

  const cols = [
    ...CF_COLS.slice(0, 5),
    { key: 'amount', label: 'Tạm ứng', width: 130, align: 'right', render: (v) => <span style={{ fontFamily: 'var(--font-mono)', color: '#ef4444', fontWeight: 700 }}>−{fmt(v)}</span> },
    { key: '_action', label: '', width: 120, render: (_, row) => <button className="btn btn-secondary" style={{ height: 30, fontSize: '0.78rem', padding: '0 12px' }} onClick={() => openClear(row)}>Quyết toán</button> }
  ];

  return (
    <div>
      <div className="finance-screen-header">
        <div>
          <div className="finance-screen-title"> Quyết Toán Hoàn Ứng</div>
          <div className="finance-screen-sub">Đối chiếu hóa đơn thực tế vs tạm ứng — Hệ thống tự tạo phiếu bù</div>
        </div>
      </div>
      <DataTable columns={cols} data={advances} loading={loading} rowKey="id" emptyText="Chưa có phiếu tạm ứng cần quyết toán" pageSize={15} />

      <Modal open={modal} onClose={() => setModal(false)} size="sm" title="🔄 Quyết Toán Tạm Ứng">
        {result ? (
          <div style={{ padding: '16px 0' }}>
            <div style={{ textAlign: 'center', fontSize: '2rem', marginBottom: 12 }}>✅</div>
            <div style={{ background: 'var(--bg-deep)', borderRadius: 10, padding: 16, fontFamily: 'var(--font-mono)', fontSize: '0.88rem' }}>
              <div>Tạm ứng ban đầu: <strong>{fmt(result.advance_amount)}</strong></div>
              <div>Thực chi: <strong>{fmt(result.actual_amount)}</strong></div>
              <div style={{ marginTop: 8, borderTop: '1px solid var(--border-default)', paddingTop: 8 }}>
                {result.difference > 0
                  ? <span style={{ color: '#10b981' }}>→ Hoàn lại: <strong>+{fmt(result.difference)}</strong> (phiếu Thu đã tự tạo)</span>
                  : result.difference < 0
                    ? <span style={{ color: '#ef4444' }}>→ Chi bù: <strong>−{fmt(Math.abs(result.difference))}</strong> (phiếu Chi đã tự tạo)</span>
                    : <span style={{ color: '#10b981' }}>→ Vừa đủ! Không cần phiếu bù.</span>
                }
              </div>
            </div>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button className="btn btn-primary" onClick={() => setModal(false)}>Đóng</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleClear}>
            <div style={{ background: 'var(--bg-deep)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem' }}>
              <div style={{ fontWeight: 600 }}>Phiếu: {selected?.id}</div>
              <div>Đối tác: {selected?.['Đối tác']}</div>
              <div>Tạm ứng: <strong style={{ color: '#ef4444' }}>−{fmt(selected?.amount)}</strong></div>
            </div>
            <FormGrid cols={1}>
              <FormRow label="Số tiền thực chi (từ hóa đơn)" required>
                <input required className="form-control" value={actualDisplay} onChange={e => setActualDisplay(fmtAmt(e.target.value))}
                  type="text" inputMode="numeric" placeholder="0₫"
                  style={{ fontWeight: 700, fontSize: '1.1rem', textAlign: 'right' }} />
              </FormRow>
              <FormRow label="Ghi chú quyết toán">
                <input className="form-control" value={note} onChange={e => setNote(e.target.value)} placeholder="VD: 23 bao xi măng + 5 thanh sắt..." />
              </FormRow>
            </FormGrid>
            {error && <div style={{ marginTop: 10, color: '#ef4444', fontSize: '0.88rem' }}>⚠️ {error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Hủy</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? '⏳...' : 'Xác nhận Quyết Toán'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Screen 9: Lương văn phòng & hoa hồng
// ════════════════════════════════════════════════════════════════════════════
function PayrollScreen() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (month) p.set('month', month);
    const r = await fetch(`${API}/api/finance/payroll?${p}`);
    setData(await r.json());
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const cols = [
    { key: 'full_name', label: 'Họ & Tên', render: v => <strong>{v || 'Chưa cập nhật'}</strong> },
    { key: 'department', label: 'Phòng ban' },
    { key: 'base_salary', label: 'Lương cơ bản', width: 130, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(v)}</span> },
    { key: 'kpi_score', label: 'Điểm KPI', width: 90, align: 'center', render: v => <Badge variant={v >= 8 ? 'success' : v >= 5 ? 'warning' : 'danger'}>{v}</Badge> },
    { key: 'bonus', label: 'Hoa hồng / Thưởng', width: 145, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600 }}>+{fmt(v)}</span> },
    { key: 'total_salary', label: 'Tổng lương thực nhận', width: 160, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--orange-500)' }}>{fmt(v)}</span> },
    { key: 'month', label: 'Tháng', width: 90, render: v => <span style={{ fontFamily: 'var(--font-mono)' }}>{v || '—'}</span> },
  ];

  return (
    <div>
      <div className="finance-screen-header">
        <div>
          <div className="finance-screen-title">👔 Lương VP & Hoa Hồng Sales</div>
          <div className="finance-screen-sub">Lương cơ bản + KPI + Hoa hồng BĐS theo tháng</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Tháng:</span>
          <input type="month" className="form-control" style={{ height: 36, width: 150 }} value={month} onChange={e => setMonth(e.target.value)} />
        </div>
      </div>
      {data.length === 0 && !loading ? (
        <div className="finance-empty"><span className="finance-empty__icon">👥</span><span>Chưa có dữ liệu nhân sự. Cần thêm nhân viên vào bảng <code>employees</code>.</span></div>
      ) : (
        <DataTable columns={cols} data={data} loading={loading} rowKey="id" emptyText="Chưa có nhân sự" pageSize={15} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Screen 10: Lương khoán tổ thợ
// Gồm 2 phần:
//  (a) Bảng hồ sơ khoán theo công đoạn/tháng — tính từ khối lượng nghiệm thu × đơn giá khoán
//  (b) Bảng phiếu chi lương khoán thực tế (dòng tiền) + nút tạo phiếu chi mới
// ════════════════════════════════════════════════════════════════════════════
function WageScreen() {
  // (a) Hồ sơ khoán theo tháng
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState([]);
  const [recLoading, setRecLoading] = useState(true);

  // (b) Phiếu chi lương khoán (dòng tiền)
  const [data, setData] = useState({ total_wages: 0, transactions: [] });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({ project_id: '', payer_payee: '', note: '', payment_method: 'Tiền mặt' });
  const [amtDisplay, setAmtDisplay] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { addToast } = useToast();

  const loadRecords = async (m) => {
    setRecLoading(true);
    try {
      const r = await fetch(`${API}/api/finance/payroll/workers/records?month=${m}`);
      if (r.ok) {
        const d = await r.json();
        setRecords(Array.isArray(d) ? d : d.details || []);
      }
    } catch (e) { console.error(e); }
    finally { setRecLoading(false); }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/finance/payroll/workers`);
      setData(await r.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    loadTransactions();
    fetch(`${API}/api/finance/projects`).then(r => r.json()).then(setProjects).catch(() => { });
  }, []);

  useEffect(() => { loadRecords(month); }, [month]);

  const recTotal = records.reduce((sum, item) => sum + (Number(item['Tổng nhận']) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseAmt(amtDisplay);
    if (!amount) { setError('Nhập số tiền'); return; }
    if (!form.project_id) { setError('Chọn công trình'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/api/finance/payroll/workers/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount })
      });
      if (res.ok) {
        addToast('✅ Đã ghi nhận lương khoán', 'success');
        setModal(false);
        loadTransactions();
        loadRecords(month);
      } else {
        const err = await res.json();
        setError(err.detail || 'Lỗi server');
      }
    } catch { setError('Lỗi kết nối'); }
    finally { setSubmitting(false); }
  };

  return (
    <div>
      <div className="finance-screen-header">
        <div>
          <div className="finance-screen-title">🏗️ Lương Khoán Tổ Thợ</div>
          <div className="finance-screen-sub">Lương khoán = Khối lượng nghiệm thu thực tế × Đơn giá khoán</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>TỔNG CHI LƯƠNG (DÒNG TIỀN)</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>{fmtShort(data.total_wages)}</div>
          </div>
          <button className="btn btn-primary" onClick={() => { setModal(true); setAmtDisplay(''); setForm({ project_id: '', payer_payee: '', note: '', payment_method: 'Tiền mặt' }); setError(''); }}
            style={{ height: 36, display: 'flex', alignItems: 'center', gap: 6 }}>
            <PlusCircle size={15} /> Chi Lương Khoán
          </button>
        </div>
      </div>

      {/* ── (a) Hồ sơ khoán theo công đoạn, lọc theo tháng ───────────────── */}
      <div className="card glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Hammer size={16} /> Hồ Sơ Khoán Theo Công Đoạn
            </h3>
            <div className="finance-screen-sub" style={{ marginTop: 4 }}>Tự động tính dựa trên cơ chế khoán cho hồ sơ hoàn thành</div>
          </div>
          <div className="flex-center" style={{ gap: 8 }}>
            <label style={{ margin: 0, whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Tháng</label>
            <input type="month" className="form-control" style={{ width: 160, height: 38 }}
              value={month} onChange={e => setMonth(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ background: 'var(--bg-deep)', padding: '14px 18px', borderRadius: 8, flex: 1 }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>{records.length}</span>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', margin: '2px 0 0' }}>Hồ sơ hoàn thành trong tháng</p>
          </div>
          <div style={{ background: 'var(--bg-deep)', padding: '14px 18px', borderRadius: 8, flex: 1 }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981' }}>{fmt(recTotal)}</span>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', margin: '2px 0 0' }}>Tổng quỹ lương khoán</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nhân sự</th>
                <th>Mã HS</th>
                <th>Công đoạn</th>
                <th style={{ textAlign: 'right' }}>Tiền khoán</th>
                <th style={{ textAlign: 'right' }}>Phụ cấp</th>
                <th style={{ textAlign: 'right' }}>Thưởng/phạt</th>
                <th style={{ textAlign: 'right' }}>Tổng nhận</th>
                <th>Ngày chốt</th>
              </tr>
            </thead>
            <tbody>
              {recLoading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20 }}>Đang tải...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)' }}>Chưa có dữ liệu lương khoán tháng này</td></tr>
              ) : (
                records.map((p, i) => (
                  <tr key={i}>
                    <td><strong>{p['Nhân sự']}</strong></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem' }}>{p['Mã hồ sơ']}</td>
                    <td>{p['Công đoạn khoán']}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(p['Số tiền khoán'])}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(p['Phụ cấp'])}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(p['Thưởng/Phạt'])}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#10b981' }}>{fmt(p['Tổng nhận'])}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem' }}>{p['Ngày chốt']}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── (b) Phiếu chi lương khoán thực tế (dòng tiền) ────────────────── */}
      <div className="finance-screen-header" style={{ marginBottom: 14 }}>
        <div>
          <div className="finance-screen-title" style={{ fontSize: '0.95rem' }}>💵 Phiếu Chi Lương Khoán</div>
          <div className="finance-screen-sub">Các phiếu chi thực tế — đồng bộ với Nhật Ký Thu Chi</div>
        </div>
      </div>
      <DataTable columns={CF_COLS} data={data.transactions} loading={loading} rowKey="id" emptyText="Chưa có phiếu lương khoán" pageSize={15} />

      <Modal open={modal} onClose={() => setModal(false)} size="sm" title="🏗️ Chi Lương Khoán Tổ Thợ">
        <form onSubmit={handleSubmit}>
          <FormGrid cols={1}>
            <FormRow label="Công trình / Hồ sơ" required>
              <select required className="form-control" value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}>
                <option value="">— Chọn công trình —</option>
                {projects.map((p, i) => <option key={i} value={p.id}>{p.label}</option>)}
              </select>
            </FormRow>
            <FormRow label="Số tiền khoán" required>
              <input required className="form-control" value={amtDisplay} onChange={e => setAmtDisplay(fmtAmt(e.target.value))}
                type="text" inputMode="numeric" placeholder="0₫"
                style={{ fontWeight: 700, fontSize: '1.1rem', textAlign: 'right', color: '#ef4444' }} />
            </FormRow>
            <FormRow label="Tổ trưởng / Nhà thầu phụ" required>
              <input required className="form-control" value={form.payer_payee} onChange={e => setForm({ ...form, payer_payee: e.target.value })} placeholder="Tên tổ trưởng..." />
            </FormRow>
            <FormRow label="Nội dung khoán">
              <input className="form-control" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="VD: Khoán đổ sàn tầng 2..." />
            </FormRow>
            <FormRow label="Hình thức"><select className="form-control" value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}><option>Tiền mặt</option><option>Chuyển khoản</option></select></FormRow>
          </FormGrid>
          {error && <div style={{ marginTop: 10, color: '#ef4444', fontSize: '0.88rem' }}>⚠️ {error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? '⏳...' : 'Ghi Nhận Lương'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Screen 11-12: Analytics Dashboard & Profit
// ════════════════════════════════════════════════════════════════════════════
function AnalyticsScreen({ mode = 'dashboard' }) {
  const [summary, setSummary] = useState({ tien_mat: 0, ngan_hang: 0, tam_ung_net: 0, monthly: [], profit_by_contract: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/finance/summary`).then(r => r.json()).then(setSummary).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Đang tải dữ liệu...</div>;

  if (mode === 'dashboard') return (
    <div>
      <div className="finance-screen-header">
        <div>
          <div className="finance-screen-title">📊 Tổng Quan Tài Chính</div>
          <div className="finance-screen-sub">Biểu đồ xu hướng dòng tiền theo tháng</div>
        </div>
      </div>

      {/* 3 Balance Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Quỹ Tiền Mặt', icon: '💵', value: summary.tien_mat, hint: 'Thu TM − Chi TM' },
          { label: 'Số Dư Ngân Hàng', icon: '🏦', value: summary.ngan_hang, hint: 'Thu CK − Chi CK' },
          { label: 'Tạm Ứng Chưa Hoàn', icon: '⏳', value: summary.tam_ung_net, hint: 'Tạm ứng − Hoàn ứng', alwaysWarn: true },
        ].map(card => (
          <div key={card.label} className="balance-card">
            <div className="balance-card__icon" style={{ background: card.value < 0 || card.alwaysWarn ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)' }}>
              {card.icon}
            </div>
            <div>
              <div className="balance-card__label">{card.label}</div>
              <div className={`balance-card__amount ${card.value >= 0 && !card.alwaysWarn ? 'positive' : 'negative'}`}>
                {card.value >= 0 ? '+' : ''}{fmtShort(card.value)}
              </div>
              <div className="balance-card__sub">{card.hint}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Bar Chart */}
      <div className="card glass-card" style={{ padding: 24, marginBottom: 0 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4 }}>📈 Thu Chi Theo Tháng</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 20 }}>* Tổng dòng tiền Thu (xanh) và Chi (đỏ) theo từng tháng</p>
        {summary.monthly.length === 0 ? (
          <div className="finance-empty"><span className="finance-empty__icon">📉</span><span>Chưa có dữ liệu tháng</span></div>
        ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={summary.monthly} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} tickFormatter={v => fmtShort(v)} width={60} />
                <Tooltip formatter={v => fmt(v)} cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-card)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar name="Tổng Thu" dataKey="thu" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={40} />
                <Bar name="Tổng Chi" dataKey="chi" fill="#ef4444" radius={[5, 5, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );

  // mode === 'profit'
  return (
    <div>
      <div className="finance-screen-header">
        <div>
          <div className="finance-screen-title">💰 Lợi Nhuận Theo Dự Án</div>
          <div className="finance-screen-sub">Lợi nhuận = Σ Thu − Σ Chi − Lương khoán tổ thợ (theo từng hợp đồng)</div>
        </div>
      </div>
      <div className="card glass-card" style={{ padding: 24 }}>
        <div className="table-wrap">
          <table style={{ minWidth: 750 }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Mã Hợp Đồng</th>
                <th style={{ textAlign: 'right', color: '#10b981' }}>Tổng Thu</th>
                <th style={{ textAlign: 'right', color: '#ef4444' }}>Tổng Chi</th>
                <th style={{ textAlign: 'right', color: '#f59e0b' }}>Lương Khoán</th>
                <th style={{ textAlign: 'right' }}>Lợi Nhuận</th>
                <th style={{ textAlign: 'center', width: 130 }}>Biên lợi nhuận</th>
              </tr>
            </thead>
            <tbody>
              {summary.profit_by_contract.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>Chưa có dữ liệu lợi nhuận</td></tr>
              ) : summary.profit_by_contract.map((row, i) => {
                const margin = row.thu > 0 ? Math.round((row.profit / row.thu) * 100) : 0;
                const isPos = row.profit >= 0;
                return (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>{i + 1}</td>
                    <td><strong style={{ fontFamily: 'var(--font-mono)' }}>{row.contract_id}</strong></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600 }}>+{fmt(row.thu)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#ef4444' }}>−{fmt(row.chi)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>−{fmt(row.luong_khoan)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 800, color: isPos ? '#10b981' : '#ef4444' }}>
                      {isPos ? '+' : ''}{fmt(row.profit)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <div style={{ height: 6, width: 70, background: 'var(--bg-deep)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, margin))}%`, background: isPos ? '#10b981' : '#ef4444', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', width: 34 }}>{margin}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Screen 13: Chứng từ kế toán (Phiếu Thu / Phiếu Chi)
// ════════════════════════════════════════════════════════════════════════════
function PrintVoucherScreen() {
  const [mode, setMode] = useState('print'); // 'print' | 'create'
  const [txType, setTxType] = useState('Chi'); // 'Thu' | 'Chi' | 'Tạm ứng' | 'Hoàn ứng'
  const [transactions, setTransactions] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [activeAdvances, setActiveAdvances] = useState([]);
  const [selectedAdvanceId, setSelectedAdvanceId] = useState('');

  const defaultNguoiLap = 'Lê Văn Dựng';
  const defaultKeToan = 'Nguyễn Thị A';
  const defaultNguoiDuyet = 'Lê Văn Dựng';

  const [form, setForm] = useState({
    id: '',
    ngay: new Date().toLocaleDateString('vi-VN'),
    dien_giai: '',
    hang_muc: 'Sinh hoạt gia đình',
    nguoi_nhan_nop: '',
    hinh_thuc: 'Chuyển khoản',
    du_an_phong_ban: '',
    amount: '',
    trang_thai: 'Hoàn thành',
    nguoi_lap: defaultNguoiLap,
    ke_toan: defaultKeToan,
    nguoi_duyet: defaultNguoiDuyet,
    contract_id: '',
    project_id: ''
  });

  const [contracts, setContracts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();


  const fetchTransactions = async () => {
    try {
      const res = await fetch(`${API}/api/finance/cashflow`);
      if (res.ok) setTransactions(await res.json());
    } catch (e) { }
  };

  const fetchActiveAdvances = async () => {
    try {
      const res = await fetch(`${API}/api/finance/advance`);
      if (res.ok) setActiveAdvances(await res.json());
    } catch (e) { }
  };

  const fetchContractsAndProjects = async () => {
    try {
      const rC = await fetch(`${API}/api/finance/contracts`);
      if (rC.ok) setContracts(await rC.json());
      const rP = await fetch(`${API}/api/finance/projects`);
      if (rP.ok) setProjects(await rP.json());
    } catch (e) { }
  };

  useEffect(() => {
    fetchTransactions();
    fetchContractsAndProjects();
    fetchActiveAdvances();
  }, []);

  const fetchNextVoucherId = async (type) => {
    try {
      const res = await fetch(`${API}/api/finance/next-voucher-id?type=${type}`);
      if (res.ok) {
        const data = await res.json();
        setForm(prev => ({
          ...prev,
          id: data.next_id,
          ngay: new Date().toLocaleDateString('vi-VN'),
          type: type
        }));
      }
    } catch (e) { }
  };

  useEffect(() => {
    if (mode === 'create') {
      if (txType === 'Thu' || txType === 'Chi') {
        fetchNextVoucherId(txType);
      } else {
        // Tạm ứng is Chi, Hoàn ứng is Thu/Chi but we don't display ID since it's auto-generated at endpoints
        setForm(prev => ({
          ...prev,
          id: '',
          ngay: new Date().toLocaleDateString('vi-VN')
        }));
      }

      setForm(prev => ({
        ...prev,
        hang_muc: txType === 'Tạm ứng' ? 'Chi phí tạm ứng' : (txType === 'Hoàn ứng' ? 'Quyết toán hoàn ứng' : 'Sinh hoạt gia đình'),
        hinh_thuc: txType === 'Hoàn ứng' ? 'Tạm ứng' : (txType === 'Tạm ứng' ? 'Tiền mặt' : 'Chuyển khoản'),
        dien_giai: '',
        nguoi_nhan_nop: '',
        amount: '',
        project_id: '',
        contract_id: ''
      }));
      setSelectedAdvanceId('');
    }
  }, [mode, txType]);

  useEffect(() => {
    if (mode === 'print' && selectedId) {
      const tx = transactions.find(t => t.id === selectedId);
      if (tx) {
        let txDate = tx['Ngày'];
        if (!txDate && tx.created_at) {
          txDate = new Date(tx.created_at).toLocaleDateString('vi-VN');
        }
        setForm({
          id: tx.id,
          ngay: txDate || new Date().toLocaleDateString('vi-VN'),
          dien_giai: tx['Diễn giải'] || '',
          hang_muc: tx['Hạng mục'] || 'Khác',
          nguoi_nhan_nop: tx['Đối tác'] || '',
          hinh_thuc: tx['Hình thức'] || 'Chuyển khoản',
          du_an_phong_ban: tx.du_an_phong_ban || tx['Dự án'] || '',
          amount: String(tx.amount || ''),
          trang_thai: tx.trang_thai || 'Hoàn thành',
          nguoi_lap: tx.nguoi_lap || defaultNguoiLap,
          ke_toan: tx.ke_toan || defaultKeToan,
          nguoi_duyet: tx.nguoi_duyet || defaultNguoiDuyet,
          contract_id: tx.contract_id || '',
          project_id: tx.project_id || ''
        });
      }
    }
  }, [selectedId, mode, transactions]);

  const handlePrint = () => {
    window.print();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) {
      addToast('Nhập số tiền hợp lệ', 'warning');
      return;
    }
    if (!form.nguoi_nhan_nop) {
      addToast('Nhập người nhận/nộp', 'warning');
      return;
    }

    // Validation check for sensitive category: "Chi thụ lý bản vẽ"
    if (form.hang_muc === 'Chi thụ lý bản vẽ' && !form.contract_id && !form.project_id) {
      addToast("Hạng mục 'Chi thụ lý bản vẽ' bắt buộc phải liên kết Hợp đồng hoặc Hồ sơ/Dự án!", 'warning');
      return;
    }

    setLoading(true);
    try {
      let res;
      if (txType === 'Tạm ứng') {
        res = await fetch(`${API}/api/finance/advance/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: form.project_id || null,
            amount: Number(form.amount),
            payer_payee: form.nguoi_nhan_nop,
            note: form.dien_giai,
            payment_method: form.hinh_thuc
          })
        });
      } else if (txType === 'Hoàn ứng') {
        if (!selectedAdvanceId) {
          addToast('Vui lòng chọn chứng từ tạm ứng cần quyết toán', 'warning');
          setLoading(false);
          return;
        }
        res = await fetch(`${API}/api/finance/advance/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            advance_id: selectedAdvanceId,
            actual_amount: Number(form.amount),
            note: form.dien_giai
          })
        });
      } else {
        res = await fetch(`${API}/api/finance/cashflow/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: txType,
            amount: Number(form.amount),
            category: form.hang_muc,
            payer_payee: form.nguoi_nhan_nop,
            payment_method: form.hinh_thuc,
            contract_id: form.contract_id || null,
            project_id: form.project_id || null,
            nguoi_lap: form.nguoi_lap,
            nguoi_duyet: form.nguoi_duyet,
            trang_thai: form.trang_thai,
            dien_giai: form.dien_giai,
            du_an_phong_ban: form.du_an_phong_ban
          })
        });
      }

      if (res.ok) {
        const saved = await res.json();
        addToast('Lưu phiếu thành công!', 'success');
        await fetchTransactions();
        await fetchActiveAdvances();
        setSelectedId(saved.id || (saved.auto_vouchers && saved.auto_vouchers[0] ? saved.auto_vouchers[0].id : ''));
        setMode('print');
      } else {
        const err = await res.json();
        addToast(`Lỗi: ${err.detail || 'Không thể lưu'}`, 'error');
      }
    } catch (e) {
      addToast('Lỗi kết nối máy chủ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getVoucherInfo = () => {
    if (mode === 'create') {
      if (txType === 'Thu') {
        return { isThu: true, isTamUng: false, isHoanUng: false, title: 'PHIẾU THU', labelPerson: 'Người nộp', labelSignPerson: 'Người nộp', color: '#10b981' };
      } else if (txType === 'Chi') {
        return { isThu: false, isTamUng: false, isHoanUng: false, title: 'PHIẾU CHI', labelPerson: 'Người nhận', labelSignPerson: 'Người nhận', color: '#ef4444' };
      } else if (txType === 'Tạm ứng') {
        return { isThu: false, isTamUng: true, isHoanUng: false, title: 'PHIẾU TẠM ỨNG', labelPerson: 'Người nhận', labelSignPerson: 'Người nhận', color: '#f59e0b' };
      } else {
        return { isThu: false, isTamUng: false, isHoanUng: true, title: 'PHIẾU HOÀN ỨNG', labelPerson: 'Người nộp', labelSignPerson: 'Người nộp', color: '#6366f1' };
      }
    }

    const isThu = form.id.startsWith('PT');
    const hangMucLower = (form.hang_muc || '').toLowerCase();
    const dienGiaiLower = (form.dien_giai || '').toLowerCase();

    // Check if it is a Hoàn ứng sheet
    if (hangMucLower.includes('hoàn ứng') || hangMucLower.includes('chi thực tế từ tạm ứng') || dienGiaiLower.includes('hoàn ứng') || dienGiaiLower.includes('chi thực tế từ tạm ứng')) {
      return { isThu, isTamUng: false, isHoanUng: true, title: 'PHIẾU HOÀN ỨNG', labelPerson: 'Người nộp', labelSignPerson: 'Người nộp', color: '#6366f1' };
    }

    // Check if it is a Tạm ứng sheet
    if (hangMucLower.includes('tạm ứng') || dienGiaiLower.includes('tạm ứng')) {
      return { isThu: false, isTamUng: true, isHoanUng: false, title: 'PHIẾU TẠM ỨNG', labelPerson: 'Người nhận', labelSignPerson: 'Người nhận', color: '#f59e0b' };
    }

    // Default Phiếu Thu / Phiếu Chi
    if (isThu) {
      return { isThu: true, isTamUng: false, isHoanUng: false, title: 'PHIẾU THU', labelPerson: 'Người nộp', labelSignPerson: 'Người nộp', color: '#10b981' };
    } else {
      return { isThu: false, isTamUng: false, isHoanUng: false, title: 'PHIẾU CHI', labelPerson: 'Người nhận', labelSignPerson: 'Người nhận', color: '#ef4444' };
    }
  };

  const voucherInfo = getVoucherInfo();
  const accentColor = voucherInfo.color;

  return (
    <div style={{ padding: 24 }} className="voucher-print-screen">
      <style>{`
        .excel-grid-table {
          width: 100%;
          border-collapse: collapse;
          border: 2px solid #000;
          background: #fff;
          color: #000;
          font-family: 'Times New Roman', serif;
        }
        .excel-grid-table th, .excel-grid-table td {
          border: 1px solid #000;
          padding: 10px;
          vertical-align: middle;
          font-size: 0.95rem;
        }
        .excel-grid-table input, .excel-grid-table select {
          width: 100%;
          border: none;
          background: transparent;
          font-family: inherit;
          font-size: inherit;
          font-weight: inherit;
          color: inherit;
          outline: none;
          padding: 2px 0;
        }
        .excel-grid-table input:focus, .excel-grid-table select:focus {
          background: rgba(99, 102, 241, 0.05);
        }
        .signature-title {
          text-align: center;
          font-weight: bold;
        }
        .signature-sub {
          text-align: center;
          font-size: 0.8rem;
          font-style: italic;
          color: #333;
          margin-top: 4px;
        }
        .signature-input {
          text-align: center;
          font-weight: bold;
          margin-top: 60px;
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-card, .printable-card * {
            visibility: visible;
          }
          .printable-card {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .excel-grid-table input, .excel-grid-table select {
            border: none !important;
            background: transparent !important;
            pointer-events: none;
          }
        }
      `}</style>

      <div className="flex no-print" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>🖨️ Chứng từ Kế toán</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>Xem, in hoặc lập phiếu Thu, Chi, Tạm ứng, Hoàn ứng theo biểu mẫu</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className={`btn ${mode === 'print' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('print')}>
            Xem & In Phiếu
          </button>
          <button className={`btn ${mode === 'create' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('create')}>
            Lập Phiếu Mới
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mode === 'print' ? '280px 1fr' : '1fr', gap: 20 }}>
        {mode === 'print' && (
          <div className="card no-print" style={{ padding: 16, height: 'fit-content' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 8 }}>Chọn số chứng từ</label>
            <select className="form-control" value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ marginBottom: 16 }}>
              <option value="">— Chọn chứng từ —</option>
              {transactions.map(t => (
                <option key={t.id} value={t.id}>{t.id} ({t.type === 'Thu' ? 'Thu' : 'Chi'} - {t['Hạng mục'] || 'Khác'} - {t.amount.toLocaleString('vi-VN')}₫)</option>
              ))}
            </select>

            <button className="btn btn-primary" onClick={handlePrint} disabled={!selectedId} style={{ width: '100%', gap: 8 }}>
              🖨️ In Phiếu này (Ctrl+P)
            </button>
          </div>
        )}

        <div className="card printable-card" style={{ padding: '30px 40px', background: '#fff', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: accentColor }}>
              {voucherInfo.isTamUng ? '● CHẾ ĐỘ PHIẾU TẠM ỨNG' : (voucherInfo.isHoanUng ? '● CHẾ ĐỘ PHIẾU HOÀN ỨNG' : (voucherInfo.isThu ? '● CHẾ ĐỘ PHIẾU THU (CÓ TIỀN VÀO)' : '● CHẾ ĐỘ PHIẾU CHI (XUẤT TIỀN RA)'))}
            </span>
            {mode === 'create' && (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Chọn Loại:</span>
                  <select className="form-control" value={txType} onChange={e => setTxType(e.target.value)} style={{ width: 140, height: 32, padding: '0 8px' }}>
                    <option value="Chi">Phiếu Chi</option>
                    <option value="Thu">Phiếu Thu</option>
                    <option value="Tạm ứng">Phiếu Tạm Ứng</option>
                    <option value="Hoàn ứng">Phiếu Hoàn Ứng</option>
                  </select>
                </div>
                {txType === 'Hoàn ứng' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Chọn Phiếu Tạm Ứng:</span>
                    <select className="form-control" value={selectedAdvanceId} onChange={e => {
                      setSelectedAdvanceId(e.target.value);
                      const adv = activeAdvances.find(a => a.id === e.target.value);
                      if (adv) {
                        setForm(prev => ({
                          ...prev,
                          nguoi_nhan_nop: adv['Đối tác'] || '',
                          du_an_phong_ban: adv['Dự án'] || '',
                          project_id: adv.project_id || '',
                          contract_id: adv.contract_id || '',
                          dien_giai: `Quyết toán cho phiếu tạm ứng ${adv.id}`,
                          amount: ''
                        }));
                      }
                    }} style={{ width: 240, height: 32, padding: '0 8px' }}>
                      <option value="">— Chọn phiếu tạm ứng —</option>
                      {activeAdvances.map(a => (
                        <option key={a.id} value={a.id}>{a.id} ({a['Đối tác']} - {a.amount.toLocaleString('vi-VN')}₫)</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleSave}>
            <table className="excel-grid-table">
              <tbody>
                <tr>
                  <td colSpan={2} style={{ width: '40%', textAlign: 'center', padding: '15px 10px', verticalAlign: 'middle', fontWeight: 'bold' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <img src="/src/assets/logo.png" alt="LOGO" style={{ height: 42, objectFit: 'contain' }} />
                      <span style={{ fontSize: '0.75rem', letterSpacing: 0.5, opacity: 0.8 }}>BÁCH KHOA ERP</span>
                    </div>
                  </td>
                  <td colSpan={2} style={{ width: '60%', textAlign: 'center', padding: '15px 10px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: 1, color: accentColor }}>
                      {voucherInfo.title}
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 8, fontSize: '0.82rem', color: '#444' }}>
                      <div>Ngày in: {new Date().toLocaleDateString('vi-VN')}</div>
                      {mode === 'print' && (
                        <div className="flex items-center gap-1 no-print" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <span>Chọn Số chứng từ:</span>
                          <select className="form-control" value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ width: 200, height: 28, padding: '0 4px', fontSize: '0.78rem' }}>
                            <option value="">— Chọn chứng từ —</option>
                            {transactions.map(t => (
                              <option key={t.id} value={t.id}>{t.id} ({t.type === 'Thu' ? 'Thu' : 'Chi'} - {t.amount.toLocaleString('vi-VN')}₫)</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 'bold', width: '15%' }}>Số CT</td>
                  <td style={{ width: '35%' }}>
                    <input type="text" readOnly value={form.id} placeholder="Hệ thống tự tạo..." style={{ fontWeight: 'bold', fontFamily: 'monospace' }} />
                  </td>
                  <td style={{ fontWeight: 'bold', width: '15%' }}>Ngày</td>
                  <td style={{ width: '35%' }}>
                    <input type="text" value={form.ngay} onChange={e => setForm({ ...form, ngay: e.target.value })} style={{ fontFamily: 'monospace' }} required />
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 'bold' }}>Diễn giải</td>
                  <td>
                    <input type="text" value={form.dien_giai} onChange={e => setForm({ ...form, dien_giai: e.target.value })} placeholder="Nhập diễn giải chi tiết..." required />
                  </td>
                  <td style={{ fontWeight: 'bold' }}>Hạng mục</td>
                  <td>
                    <select value={form.hang_muc} onChange={e => {
                      const val = e.target.value;
                      const mapping = CATEGORY_AUTO_MAPPING[val];
                      if (mapping) {
                        setForm(prev => ({
                          ...prev,
                          hang_muc: val,
                          nguoi_nhan_nop: mapping.doi_tac,
                          du_an_phong_ban: mapping.phong_ban,
                          nguoi_lap: mapping.nguoi_lap,
                          nguoi_duyet: mapping.nguoi_duyet
                        }));
                      } else {
                        setForm(prev => ({ ...prev, hang_muc: val }));
                      }
                    }} required>
                      <option value="Sinh hoạt gia đình"> Sinh hoạt gia đình</option>
                      <option value="Chi bảo vệ"> Chi bảo vệ</option>
                      <option value="Chi thụ lý bản vẽ"> Chi thụ lý bản vẽ</option>
                      <option value="Viết hồ sơ"> Viết hồ sơ</option>
                      <option value="Bản vẽ cấp giấy"> Bản vẽ cấp giấy</option>
                      <option value="Văn phòng phẩm"> Văn phòng phẩm</option>
                      <option value="In ấn - Photocopy"> In ấn - Photocopy</option>
                      <option value="Chi quầy tiếp nhận"> Chi quầy tiếp nhận</option>
                      <option value="Ăn uống"> Ăn uống</option>
                      <option value="Đi lại - Xăng xe - Gửi xe"> Đi lại - Xăng xe - Gửi xe</option>
                      <option value="Công tác phí"> Công tác phí</option>
                      <option value="Chuyển phát - Bưu chính-Grab"> Chuyển phát - Bưu chính-Grab</option>
                      <option value="Điện - Nước - Internet"> Điện - Nước - Internet</option>
                      <option value="Sửa chữa nhỏ"> Sửa chữa nhỏ</option>
                      <option value="Bảo trì thiết bị"> Bảo trì thiết bị</option>
                      <option value="Vệ sinh - Rác thải"> Vệ sinh - Rác thải</option>
                      <option value="Lấy sổ"> Lấy sổ</option>
                      <option value="Lấy bản vẽ"> Lấy bản vẽ</option>
                      <option value="Lấy trích lục"> Lấy trích lục</option>
                      <option value="Công chứng hồ sơ"> Công chứng hồ sơ</option>
                      <option value="Quầy nước- cà phê"> Quầy nước- cà phê</option>
                      <option value="Bổ sung quỹ"> Bổ sung quỹ</option>
                      <option value="Đóng thuế"> Đóng thuế</option>
                      <option value="Hỗ trợ sự kiện - Marketing"> Hỗ trợ sự kiện - Marketing</option>
                      <option value="Chi phí tạm ứng"> Chi phí tạm ứng</option>
                      <option value="Chi thực tế từ tạm ứng"> Chi thực tế từ tạm ứng</option>
                      <option value="Quyết toán hoàn ứng"> Quyết toán hoàn ứng</option>
                      <option value="Khác"> Khác</option>
                    </select>
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 'bold' }}>{voucherInfo.labelPerson}</td>
                  <td>
                    <input type="text" value={form.nguoi_nhan_nop} onChange={e => setForm({ ...form, nguoi_nhan_nop: e.target.value })} placeholder={`Họ tên ${voucherInfo.labelPerson.toLowerCase()}...`} required />
                  </td>
                  <td style={{ fontWeight: 'bold' }}>Hình thức</td>
                  <td>
                    <select value={form.hinh_thuc} onChange={e => setForm({ ...form, hinh_thuc: e.target.value })}>
                      <option value="Chuyển khoản"> Chuyển khoản</option>
                      <option value="Tiền mặt"> Tiền mặt</option>
                      <option value="Tạm ứng"> Tạm ứng</option>
                    </select>
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 'bold' }}>Phòng ban</td>
                  <td>
                    <input type="text" value={form.du_an_phong_ban} onChange={e => setForm({ ...form, du_an_phong_ban: e.target.value })} placeholder="Kế toán, Kỹ thuật, Công trường..." />
                  </td>
                  <td style={{ fontWeight: 'bold' }}>Số tiền</td>
                  <td>
                    <input
                      type="text"
                      value={form.amount ? Number(form.amount).toLocaleString('vi-VN') : ''}
                      onChange={e => setForm({ ...form, amount: e.target.value.replace(/[^\d]/g, '') })}
                      placeholder="0"
                      style={{ fontWeight: 'bold', textAlign: 'right', color: accentColor, fontSize: '1.1rem' }}
                      required
                    />
                  </td>
                </tr>

                <tr>
                  <td style={{ fontWeight: 'bold' }}>Trạng thái</td>
                  <td>
                    <input type="text" value={form.trang_thai} onChange={e => setForm({ ...form, trang_thai: e.target.value })} placeholder="Hoàn thành, Chờ duyệt..." />
                  </td>
                  <td style={{ fontWeight: 'bold' }}>Liên kết</td>
                  <td style={{ padding: '6px 10px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="text" placeholder="Nhập ID hợp đồng..." value={form.contract_id || ''} onChange={e => setForm({ ...form, contract_id: e.target.value })} style={{ fontSize: '0.75rem', width: '50%', padding: '4px' }} />
                      <input type="text" placeholder="Nhập ID hồ sơ..." value={form.project_id || ''} onChange={e => setForm({ ...form, project_id: e.target.value })} style={{ fontSize: '0.75rem', width: '50%', padding: '4px' }} />
                    </div>
                  </td>
                </tr>

                <tr>
                  <td colSpan={4} style={{ padding: '12px 10px', fontSize: '0.98rem', borderBottom: '2px solid #000' }}>
                    <strong>Số tiền (bằng chữ):</strong> <span style={{ fontStyle: 'italic', textDecoration: 'underline' }}>{docSoTiengViet(form.amount)}</span>
                  </td>
                </tr>

                <tr>
                  <td style={{ height: 130, padding: '10px 5px' }}>
                    <div className="signature-title">Người lập</div>
                    <div className="signature-sub">(Ký, ghi rõ họ tên)</div>
                    <div className="signature-input">
                      <input type="text" value={form.nguoi_lap} onChange={e => setForm({ ...form, nguoi_lap: e.target.value })} style={{ fontSize: '0.85rem' }} />
                    </div>
                  </td>
                  <td style={{ height: 130, padding: '10px 5px' }}>
                    <div className="signature-title">Kế toán</div>
                    <div className="signature-sub">(Ký, ghi rõ họ tên)</div>
                    <div className="signature-input">
                      <input type="text" value={form.ke_toan} onChange={e => setForm({ ...form, ke_toan: e.target.value })} style={{ fontSize: '0.85rem' }} />
                    </div>
                  </td>
                  <td style={{ height: 130, padding: '10px 5px' }}>
                    <div className="signature-title">Người duyệt</div>
                    <div className="signature-sub">(Ký, ghi rõ họ tên)</div>
                    <div className="signature-input">
                      <input type="text" value={form.nguoi_duyet} onChange={e => setForm({ ...form, nguoi_duyet: e.target.value })} style={{ fontSize: '0.85rem' }} />
                    </div>
                  </td>
                  <td style={{ height: 130, padding: '10px 5px' }}>
                    <div className="signature-title">{voucherInfo.labelSignPerson}</div>
                    <div className="signature-sub">(Ký, ghi rõ họ tên)</div>
                    <div className="signature-input">
                      <input type="text" readOnly value={form.nguoi_nhan_nop} style={{ fontSize: '0.85rem', color: '#555' }} />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {mode === 'create' && (
              <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ padding: '10px 24px', fontSize: '0.95rem' }}>
                  {loading ? '⏳ Đang lưu...' : '💾 Ghi sổ & Tạo phiếu'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SettingsScreen - Cấu hình số dư & thu chi lũy kế đầu kỳ
// ════════════════════════════════════════════════════════════════════════════
const getLocalISOTime = (d = new Date()) => {
  const tzoffset = d.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(d.getTime() - tzoffset)).toISOString().slice(0, 16);
  return localISOTime;
};

function SettingsScreen() {
  const [hinhThuc, setHinhThuc] = useState('Tiền mặt');
  const [ngayChot, setNgayChot] = useState(getLocalISOTime());
  const [soDuHeThong, setSoDuHeThong] = useState(0);
  const [soDuThucTe, setSoDuThucTe] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [nguoiChot, setNguoiChot] = useState('Lê Văn Dựng');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const fetchSystemBalance = useCallback(async () => {
    setLoading(true);
    try {
      const isoString = new Date(ngayChot).toISOString();
      const res = await fetch(`${API}/api/finance/fund-balances/calculate?hinh_thuc=${encodeURIComponent(hinhThuc)}&ngay_chot=${encodeURIComponent(isoString)}`);
      if (res.ok) {
        const d = await res.json();
        setSoDuHeThong(d.so_du_he_thong || 0);
      } else {
        addToast('❌ Không thể tính toán số dư hệ thống', 'error');
      }
    } catch {
      addToast('❌ Lỗi kết nối máy chủ', 'error');
    } finally {
      setLoading(false);
    }
  }, [hinhThuc, ngayChot, addToast]);

  useEffect(() => {
    fetchSystemBalance();
  }, [fetchSystemBalance]);

  const valThucTe = Number(soDuThucTe) || 0;
  const chenhLech = valThucTe - soDuHeThong;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (soDuThucTe === '') {
      addToast('⚠️ Vui lòng nhập số dư thực tế đếm tay!', 'warning');
      return;
    }
    if (chenhLech !== 0 && !ghiChu.trim()) {
      addToast('⚠️ Bắt buộc phải nhập giải trình lý do chênh lệch!', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        hinh_thuc: hinhThuc,
        so_tien_thuc_te: valThucTe,
        ngay_chot: new Date(ngayChot).toISOString(),
        ghi_chu: ghiChu,
        nguoi_chot: nguoiChot
      };

      const res = await fetch(`${API}/api/finance/fund-balances/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        addToast('✅ Xác nhận chốt quỹ và tạo điểm số dư mới thành công!', 'success');
        setSoDuThucTe('');
        setGhiChu('');
        fetchSystemBalance();
      } else {
        const err = await res.json();
        addToast(err.detail || '❌ Lỗi chốt quỹ', 'error');
      }
    } catch {
      addToast('❌ Lỗi kết nối máy chủ', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 0' }}>
      <div className="card glass-card" style={{ padding: 32, borderRadius: 16 }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--primary)' }}>
          <Settings size={22} color="var(--primary)" /> BIÊN BẢN CHỐT QUỸ & ĐỐI CHIẾU TÀI CHÍNH
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
          Kiểm kê và đối chiếu số dư thực tế đếm tay/app ngân hàng với số dư sổ sách hệ thống để làm mốc số dư đầu kỳ mới.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 1. Khối Thiết Lập (Filter Bar) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: 'rgba(99,102,241,0.03)', padding: 16, borderRadius: 12, border: '1px solid var(--border-default)' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Hình thức quỹ
              </label>
              <Dropdown
                value={hinhThuc}
                onChange={(val) => {
                  setHinhThuc(val);
                  setSoDuThucTe('');
                }}
                options={[
                  { value: 'Tiền mặt', label: '💵 Tiền mặt (Két sắt)' },
                  { value: 'Chuyển khoản', label: '🏦 Chuyển khoản (Ngân hàng)' }
                ]}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Mốc thời gian chốt
              </label>
              <input
                type="datetime-local"
                className="form-control"
                value={ngayChot}
                onChange={(e) => {
                  setNgayChot(e.target.value);
                  setSoDuThucTe('');
                }}
                required
              />
            </div>
          </div>

          {/* 2. Khối Số Liệu Đối Chiếu (Comparison Grid) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {/* Thẻ Số dư hệ thống */}
            <div style={{ padding: 18, background: 'var(--bg-default)', borderRadius: 12, border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>SỐ DƯ HỆ THỐNG</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {loading ? '⏳ Đang tính...' : `${soDuHeThong.toLocaleString('vi-VN')}₫`}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Tính từ mốc chốt gần nhất</span>
            </div>

            {/* Ô nhập Số dư thực tế */}
            <div style={{ padding: 18, background: 'var(--bg-default)', borderRadius: 12, border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 700 }}>SỐ DƯ THỰC TẾ *</span>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ fontWeight: 800, fontSize: '1.1rem', paddingRight: 24, height: 32, border: '1px solid var(--primary)', textAlign: 'right' }}
                  value={soDuThucTe}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/[^\d]/g, '');
                    setSoDuThucTe(clean);
                  }}
                  placeholder="Nhập số tiền..."
                  required
                />
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-tertiary)' }}>₫</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Đếm két hoặc app ngân hàng</span>
            </div>

            {/* Thẻ Chênh lệch */}
            <div style={{
              padding: 18,
              background: 'var(--bg-default)',
              borderRadius: 12,
              border: '1px solid var(--border-default)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>CHÊNH LỆCH</span>
              <span style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                fontFamily: 'monospace',
                color: chenhLech === 0 ? '#10b981' : (chenhLech < 0 ? '#ef4444' : '#3b82f6')
              }}>
                {chenhLech === 0 ? '±0₫' : (chenhLech > 0 ? `+${chenhLech.toLocaleString('vi-VN')}₫` : `-${Math.abs(chenhLech).toLocaleString('vi-VN')}₫`)}
              </span>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: chenhLech === 0 ? '#10b981' : (chenhLech < 0 ? '#ef4444' : '#3b82f6')
              }}>
                {chenhLech === 0 ? 'Khớp quỹ hoàn toàn' : (chenhLech < 0 ? 'Thiếu tiền (Tự sinh PC)' : 'Thừa tiền (Tự sinh PT)')}
              </span>
            </div>
          </div>

          {/* 3. Khối Hoàn Tất (Action Bar) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Người chốt quỹ
              </label>
              <input
                type="text"
                className="form-control"
                value={nguoiChot}
                onChange={(e) => setNguoiChot(e.target.value)}
                placeholder="Nhập tên người thực hiện chốt..."
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Lý do chênh lệch / Ghi chú {chenhLech !== 0 && '*'}
              </label>
              <textarea
                className="form-control"
                style={{ height: 75, resize: 'none', fontSize: '0.85rem' }}
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                placeholder={chenhLech !== 0 ? "Bắt buộc giải trình lý do thừa/thiếu tiền..." : "Nhập ghi chú kiểm kê (nếu có)..."}
                required={chenhLech !== 0}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || loading}
            style={{
              width: '100%',
              height: 44,
              fontWeight: 800,
              background: 'var(--primary)',
              color: '#fff',
              fontSize: '0.95rem',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.2s',
              opacity: (saving || loading) ? 0.6 : 1
            }}
          >
            {saving ? ' Đang ghi nhận điểm chốt quỹ...' : ' Xác Nhận Chốt Quỹ & Tạo Điểm Số Dư Mới'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Main Finance Component
// ════════════════════════════════════════════════════════════════════════════
const THUCHI_TABS = [
  { id: 'cashflow-all', label: 'Nhật Ký Thu Chi', icon: <Receipt size={16} /> },
  { id: 'cashflow-cash', label: 'Quỹ Tiền Mặt', icon: <Banknote size={16} /> },
  { id: 'cashflow-bank', label: 'Quỹ Chuyển Khoản', icon: <Building2 size={16} /> },
  { id: 'cashflow-print', label: 'Chứng Từ Thu/Chi', icon: <FileText size={16} /> },
  { id: 'advance-request', label: 'Đề Xuất Tạm Ứng', icon: <PlusCircle size={16} /> },
  { id: 'advance-clear', label: 'Quyết Toán Hoàn Ứng', icon: <RotateCcw size={16} /> },
  { id: 'cashflow-settings', label: 'Thiết Lập Số Dư', icon: <Settings size={16} /> }
];

export default function Finance() {
  const [activeMenu, setActiveMenu] = useState('cashflow-all');

  const renderContent = () => {
    switch (activeMenu) {
      case 'cashflow-all': return <CashflowScreen mode="all" />;
      case 'cashflow-cash': return <CashflowScreen mode="cash" />;
      case 'cashflow-bank': return <CashflowScreen mode="bank" />;
      case 'cashflow-print': return <PrintVoucherScreen />;
      case 'advance-request': return <AdvanceRequestScreen />;
      case 'advance-clear': return <AdvanceClearScreen />;
      case 'cashflow-settings': return <SettingsScreen />;
      default: return <CashflowScreen mode="all" />;
    }
  };

  return (
    <section className="tab-pane active" id="tab-thuchi" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      <SubTabs
        active={activeMenu}
        onChange={setActiveMenu}
        tabs={THUCHI_TABS}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px 24px' }}>
        {renderContent()}
      </div>
    </section>
  );
}