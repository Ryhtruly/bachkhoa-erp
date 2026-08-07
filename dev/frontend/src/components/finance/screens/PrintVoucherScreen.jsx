import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { FormRow, FormGrid } from '../../ui';
import { fmt, fmtShort, docSoTiengViet, CATEGORY_AUTO_MAPPING } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip } from '../SharedFinanceUI';
import { API } from '../financeConstants';
import { Printer, PlusCircle, RefreshCw, AlertTriangle, ArrowLeft } from 'lucide-react';
function VoucherTemplate({
  title, voucherId, date, personName, labelPerson, description, amount, amountWords,
  category, paymentMethod, department, contractId, projectId, createdBy, accounting, approvedBy
}) {
  const isThu = title.includes('THU');
  const accent = isThu ? '#10b981' : '#ef4444';
  return (
    <table className="excel-grid-table" style={{ width: '100%' }}>
      <tbody>
        <tr>
          <td colSpan={2} style={{ width: '40%', textAlign: 'center', padding: '15px 10px', verticalAlign: 'middle', fontWeight: 'bold' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <img src="/src/assets/logo.png" alt="LOGO" style={{ height: 42, objectFit: 'contain' }} />
              <span style={{ fontSize: '0.75rem', letterSpacing: 0.5, opacity: 0.8 }}>BÁCH KHOA ERP</span>
            </div>
          </td>
          <td colSpan={2} style={{ width: '60%', textAlign: 'center', padding: '15px 10px' }}>
            <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: 1, color: accent }}>{title}</h2>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, fontSize: '0.82rem', color: '#444' }}>
              <span>Ngày: {date}</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style={{ fontWeight: 'bold', width: '15%' }}>Số CT</td>
          <td style={{ width: '35%', fontWeight: 'bold', fontFamily: 'monospace' }}>{voucherId}</td>
          <td style={{ fontWeight: 'bold', width: '15%' }}>Hình thức</td>
          <td style={{ width: '35%' }}>{paymentMethod}</td>
        </tr>
        <tr>
          <td style={{ fontWeight: 'bold' }}>{labelPerson || 'Đối tác'}</td>
          <td>{personName || '—'}</td>
          <td style={{ fontWeight: 'bold' }}>Hạng mục</td>
          <td>{category || '—'}</td>
        </tr>
        <tr>
          <td style={{ fontWeight: 'bold' }}>Diễn giải</td>
          <td colSpan={3}>{description || '—'}</td>
        </tr>
        <tr>
          <td style={{ fontWeight: 'bold' }}>Số tiền</td>
          <td colSpan={3} style={{ fontWeight: 'bold', color: accent, fontSize: '1.2rem' }}>
            {amount ? `${Number(amount).toLocaleString('vi-VN')} VNĐ` : '0 VNĐ'}
          </td>
        </tr>
        <tr>
          <td colSpan={4} style={{ padding: 10 }}>
            <span style={{ fontWeight: 'bold' }}>Bằng chữ: </span>
            <i>{amountWords || 'Không đồng'}</i>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

const CATEGORY_OPTIONS = [
  { value: 'Văn phòng phẩm', label: '📝 Văn phòng phẩm' },
  { value: 'In ấn - Photocopy', label: '🖨️ In ấn - Photocopy' },
  { value: 'Chi quầy tiếp nhận', label: '☕ Chi quầy tiếp nhận' },
  { value: 'Ăn uống', label: '🍱 Ăn uống' },
  { value: 'Đi lại - Xăng xe - Gửi xe', label: '🚗 Đi lại - Xăng xe - Gửi xe' },
  { value: 'Công tác phí', label: '✈️ Công tác phí' },
  { value: 'Chuyển phát - Bưu chính-Grap', label: '📦 Chuyển phát - Bưu chính-Grap' },
  { value: 'Điện - Nước - Internet', label: '💡 Điện - Nước - Internet' },
  { value: 'Sửa chữa nhỏ', label: '🔧 Sửa chữa nhỏ' },
  { value: 'Bảo trì thiết bị', label: '⚙️ Bảo trì thiết bị' },
  { value: 'Vệ sinh - Rác thải', label: '🧹 Vệ sinh - Rác thải' },
  { value: 'Hỗ trợ sự kiện - Marketing', label: '📢 Hỗ trợ sự kiện - Marketing' },
  { value: 'Chi thụ lý bản vẽ', label: '📐 Chi thụ lý bản vẽ' },
  { value: 'Chi bảo vệ', label: '🛡️ Chi bảo vệ' },
  { value: 'Công chứng hồ sơ', label: '📜 Công chứng hồ sơ' },
  { value: 'Thu chênh lệch kiểm kê quỹ', label: '➕ Thu chênh lệch kiểm kê quỹ' },
  { value: 'Chi chênh lệch kiểm kê quỹ', label: '➖ Chi chênh lệch kiểm kê quỹ' },
  { value: 'Lương khoán', label: '👷 Lương khoán tổ thợ' },
  { value: 'Khác', label: '🌀 Khác' },
];

const METHOD_OPTIONS = [
  { value: 'Chuyển khoản', label: '🏦 Chuyển khoản' },
  { value: 'Tiền mặt', label: '💵 Tiền mặt' },
  { value: 'Tạm ứng', label: '⏳ Tạm ứng' },
];

const CATEGORIES_REQUIRE_LINK = [
  'Chi thụ lý bản vẽ',
  'Lương khoán',
  'Công chứng hồ sơ'
];

const TX_TYPE_META = {
  'Thu': { title: 'PHIẾU THU', action: 'Nộp tiền vào quỹ', color: '#10b981', bg: 'rgba(16,185,129,0.08)', prefix: 'PT', labelPerson: 'Người nộp tiền' },
  'Chi': { title: 'PHIẾU CHI', action: 'Xuất quỹ chi trả', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', prefix: 'PC', labelPerson: 'Người nhận tiền' },
  'Tạm ứng': { title: 'PHIẾU CHI TẠM ỨNG', action: 'Tạm ứng kinh phí công tác / dự án', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', prefix: 'PC', labelPerson: 'Người nhận tạm ứng' },
  'Hoàn ứng': { title: 'PHIẾU QUYẾT TOÁN HOÀN ỨNG', action: 'Quyết toán chứng từ tạm ứng', color: '#6366f1', bg: 'rgba(99,102,241,0.08)', prefix: 'PT/PC', labelPerson: 'Người quyết toán' }
};

const defaultCreatedBy = 'Lê Văn Dựng';
const defaultAccounting = 'Nguyễn Thị A';
const defaultApprovedBy = 'Lê Văn Dựng';

const emptyForm = {
  id: '',
  transaction_date: new Date().toLocaleDateString('vi-VN'),
  description: '',
  category: 'Sinh hoạt gia đình',
  payer_payee: '',
  payment_method: 'Chuyển khoản',
  department_code: '',
  amount: '',
  status: 'Hoàn thành',
  created_by: defaultCreatedBy,
  accounting: defaultAccounting,
  approved_by: defaultApprovedBy,
  contract_id: '',
  project_id: ''
};

export default function PrintVoucherScreen({ month }) {
  const [mode, setMode] = useState('create');
  const [txType, setTxType] = useState('Chi');
  const [transactions, setTransactions] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [printSearch, setPrintSearch] = useState('');
  const [activeAdvances, setActiveAdvances] = useState([]);
  const [selectedAdvanceId, setSelectedAdvanceId] = useState('');

  const [form, setForm] = useState(emptyForm);

  const [contracts, setContracts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { addToast } = useToast();

  const fetchTransactions = async () => {
    try {
      const res = await fetch(`${API}/api/finance/cashflow`);
      if (res.ok) setTransactions(await res.json());
      else addToast('Không tải được danh sách phiếu', 'error');
    } catch (e) {
      addToast('Lỗi kết nối khi tải danh sách phiếu', 'error');
    }
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

  const fetchDepartments = async () => {
    try {
      const res = await fetch(`${API}/api/finance/departments`);
      if (res.ok) {
        const data = await res.json();
        setDepartments(Array.isArray(data) ? data : []);
      }
    } catch (e) { }
  };

  useEffect(() => {
    fetchTransactions();
    fetchActiveAdvances();
    fetchContractsAndProjects();
    fetchDepartments();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchTransactions(),
      fetchActiveAdvances(),
      fetchContractsAndProjects(),
      fetchDepartments(),
    ]);
    setRefreshing(false);
    addToast('Đã làm mới danh sách chứng từ', 'info');
  };

  useEffect(() => {
    if (mode === 'create') {
      const fetchNextId = async () => {
        try {
          const res = await fetch(`${API}/api/finance/next-voucher-id?type=${txType}`);
          if (res.ok) {
            const d = await res.json();
            setForm(prev => ({
              ...emptyForm,
              id: d.next_id,
              category: txType === 'Tạm ứng' ? 'Tạm ứng kinh phí' : (txType === 'Hoàn ứng' ? 'Quyết toán tạm ứng' : 'Khác'),
              payment_method: txType === 'Tạm ứng' ? 'Tạm ứng' : 'Chuyển khoản'
            }));
          }
        } catch (e) { }
      };
      fetchNextId();
    }
  }, [mode, txType]);

  useEffect(() => {
    if (mode === 'print' && selectedId) {
      const tx = transactions.find(t => t.id === selectedId);
      if (tx) {
        const rawDate = tx.date || tx.transaction_date;
        let txDate = rawDate;
        if (rawDate && rawDate.includes('-')) {
          const [y, m, d] = rawDate.split('-');
          txDate = `${d}/${m}/${y}`;
        }
        setForm({
          id: tx.id,
          transaction_date: txDate || new Date().toLocaleDateString('vi-VN'),
          description: tx.description || '',
          category: tx.category || 'Khác',
          payer_payee: tx.partner || tx.payer_payee || '',
          payment_method: tx.payment_method || 'Chuyển khoản',
          department_code: tx.department_code || '',
          amount: String(tx.amount || ''),
          status: tx.status || 'Hoàn thành',
          created_by: tx.created_by || defaultCreatedBy,
          accounting: defaultAccounting,
          approved_by: tx.approved_by || defaultApprovedBy,
          contract_id: tx.contract_id || '',
          project_id: tx.project_id || ''
        });
      }
    }
  }, [selectedId, mode, transactions]);

  const printList = useMemo(() => {
    const q = printSearch.trim().toLowerCase();
    return [...transactions]
      .filter(t => {
        if (month) {
          const tMonth = t.date ? t.date.slice(0, 7) : (t.created_at ? t.created_at.slice(0, 7) : null);
          if (tMonth && tMonth !== month) return false;
        }
        if (!q) return true;
        return (
          (t.id || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          (t.partner || t.payer_payee || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  }, [transactions, printSearch, month]);

  const departmentOptions = useMemo(() => {
    const names = [
      ...departments.map(department => department.name),
      ...transactions.map(t => t.department_code),
      ...Object.values(CATEGORY_AUTO_MAPPING).map(mapping => mapping.department_code),
      form.department_code,
    ];

    return [...new Set(names.map(name => String(name || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'vi'))
      .map(name => ({ value: name, label: name }));
  }, [departments, transactions, form.department_code]);

  const filteredAdvances = useMemo(() => {
    if (!month) return activeAdvances;
    return activeAdvances.filter(a => {
      const aMonth = a.date ? a.date.slice(0, 7) : (a.created_at ? a.created_at.slice(0, 7) : null);
      return !aMonth || aMonth === month;
    });
  }, [activeAdvances, month]);

  const selectedAdvance = useMemo(
    () => activeAdvances.find(a => a.id === selectedAdvanceId) || null,
    [activeAdvances, selectedAdvanceId]
  );

  const amountInWords = useMemo(() => {
    const n = Number(form.amount);
    if (!n || n <= 0) return '';
    try {
      const words = docSoTiengViet(n);
      return typeof words === 'string' ? words : '';
    } catch (e) {
      return '';
    }
  }, [form.amount]);

  const needsLinkWarning =
    mode === 'create' &&
    CATEGORIES_REQUIRE_LINK.includes(form.category) &&
    !form.contract_id &&
    !form.project_id;

  const handlePrint = () => {
    window.print();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) {
      addToast('Nhập số tiền hợp lệ', 'warning');
      return;
    }
    if (!form.payer_payee) {
      addToast('Nhập người nhận/nộp', 'warning');
      return;
    }
    if (CATEGORIES_REQUIRE_LINK.includes(form.category) && !form.contract_id && !form.project_id) {
      addToast(`Hạng mục "${form.category}" bắt buộc phải liên kết Hợp đồng hoặc Hồ sơ/Dự án!`, 'warning');
      return;
    }
    if (txType === 'Hoàn ứng' && !selectedAdvanceId) {
      addToast('Vui lòng chọn chứng từ tạm ứng cần quyết toán', 'warning');
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
            payer_payee: form.payer_payee,
            note: form.description,
            payment_method: form.payment_method
          })
        });
      } else if (txType === 'Hoàn ứng') {
        res = await fetch(`${API}/api/finance/advance/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            advance_id: selectedAdvanceId,
            actual_amount: Number(form.amount),
            note: form.description
          })
        });
      } else {
        res = await fetch(`${API}/api/finance/cashflow/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: txType,
            amount: Number(form.amount),
            category: form.category,
            payer_payee: form.payer_payee,
            payment_method: form.payment_method,
            contract_id: form.contract_id || null,
            project_id: form.project_id || null,
            created_by: form.created_by,
            approved_by: form.approved_by,
            status: form.status,
            description: form.description,
            department_code: form.department_code
          })
        });
      }

      if (res.ok) {
        const saved = await res.json();
        addToast('Lưu phiếu thành công!', 'success');
        await fetchTransactions();
        await fetchActiveAdvances();
        setMode('print');
        setSelectedId(saved.id || (saved.auto_vouchers && saved.auto_vouchers[0] ? saved.auto_vouchers[0].id : ''));
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
      const meta = TX_TYPE_META[txType];
      return {
        title: meta.title,
        id: form.id || 'PT-XXXXXX',
        labelPerson: meta.labelPerson
      };
    }
    const isThu = form.category.includes('Thu') || form.category.includes('nộp');
    return {
      title: isThu ? 'PHIẾU THU' : 'PHIẾU CHI',
      id: form.id,
      labelPerson: isThu ? 'Người nộp tiền' : 'Người nhận tiền'
    };
  };

  const voucherInfo = getVoucherInfo();

  return (
    <div className="print-screen-container" style={{ padding: '16px 0' }}>
      {/* Top Bar Navigation */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '16px 20px',
        border: '1px solid #e2e8f0',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setMode(mode === 'create' ? 'print' : 'create')}
            className={`btn ${mode === 'create' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40 }}
          >
            {mode === 'create' ? <PlusCircle size={18} /> : <Printer size={18} />}
            {mode === 'create' ? 'Soạn phiếu mới' : 'Chuyển sang In phiếu'}
          </button>

          {mode === 'create' && (
            <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
              {Object.keys(TX_TYPE_META).map(t => (
                <button
                  key={t}
                  onClick={() => setTxType(t)}
                  style={{
                    border: 'none',
                    background: txType === t ? '#fff' : 'transparent',
                    color: txType === t ? TX_TYPE_META[t].color : '#64748b',
                    fontWeight: txType === t ? 700 : 500,
                    padding: '6px 14px',
                    borderRadius: 6,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    boxShadow: txType === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40 }}
            title="Tải lại danh sách hợp đồng, phòng ban & phiếu mới nhất"
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            Làm mới dữ liệu
          </button>
          <button
            onClick={handlePrint}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, background: '#0f172a' }}
          >
            <Printer size={18} /> In chứng từ (Print/PDF)
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mode === 'print' ? '320px 1fr' : '1fr', gap: 24 }}>

        {/* Sidebar Chọn Phiếu Để In */}
        {mode === 'print' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16, display: 'flex', flexDirection: 'column', height: 'fit-content', maxHeight: 'calc(100vh - 200px)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 12px 0', color: '#0f172a' }}>
              📜 Chọn phiếu cần in ({printList.length})
            </h3>
            <input
              type="text"
              placeholder="Tìm mã phiếu, người nhận/nộp..."
              value={printSearch}
              onChange={e => setPrintSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                marginBottom: 12,
                outline: 'none'
              }}
            />
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {printList.map(t => (
                <div
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${selectedId === t.id ? '#3b82f6' : '#e2e8f0'}`,
                    background: selectedId === t.id ? '#eff6ff' : '#f8fafc',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1e293b' }}>
                    <span>{t.id}</span>
                    <span style={{ color: t.type === 'Thu' ? '#10b981' : '#ef4444' }}>
                      {t.type === 'Thu' ? '+' : '-'}{fmtShort(t.amount)}
                    </span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.partner || t.payer_payee || '—'} · {t.category || 'Khác'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Form Nhập Dữ Liệu Khi Ở Mode Create */}
          {mode === 'create' && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px 0', color: TX_TYPE_META[txType].color, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>✏️ CHẾ ĐỘ SOẠN THẢO: {TX_TYPE_META[txType].title}</span>
              </h3>

              {txType === 'Hoàn ứng' && (
                <div style={{ marginBottom: 20, padding: 16, background: '#eef2ff', borderRadius: 8, border: '1px solid #c7d2fe' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#3730a3', marginBottom: 8 }}>
                    📌 Chọn phiếu Tạm ứng cần quyết toán:
                  </label>
                  <select
                    value={selectedAdvanceId}
                    onChange={(e) => {
                      const advId = e.target.value;
                      setSelectedAdvanceId(advId);
                      const adv = activeAdvances.find(a => a.id === advId);
                      if (adv) {
                        setForm(prev => ({
                          ...prev,
                          amount: String(adv.amount || ''),
                          payer_payee: adv.partner || adv.payer_payee || '',
                          department_code: adv.department_code || '',
                          project_id: adv.project_id || '',
                          contract_id: adv.contract_id || '',
                          description: `Quyết toán cho phiếu tạm ứng ${adv.id}`
                        }));
                      }
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #a5b4fc', fontSize: '0.9rem', fontWeight: 600 }}
                  >
                    <option value="">-- Chọn chứng từ tạm ứng --</option>
                    {filteredAdvances.map(a => (
                      <option key={a.id} value={a.id}>{a.id} ({a.partner || a.payer_payee} - {Number(a.amount || 0).toLocaleString('vi-VN')}₫)</option>
                    ))}
                  </select>
                </div>
              )}

              <form onSubmit={handleSave}>
                <FormGrid cols={3}>
                  <FormRow label="Mã số phiếu (ID)" required>
                    <input type="text" value={form.id} readOnly style={{ background: '#f8fafc', fontWeight: 700, fontFamily: 'monospace' }} />
                  </FormRow>

                  <FormRow label="Ngày lập chứng từ" required>
                    <input type="date" value={form.transaction_date} onChange={e => setForm({ ...form, transaction_date: e.target.value })} required />
                  </FormRow>

                  <FormRow label={voucherInfo.labelPerson} required>
                    <input type="text" value={form.payer_payee} onChange={e => setForm({ ...form, payer_payee: e.target.value })} placeholder="Họ tên người giao dịch..." required />
                  </FormRow>

                  <FormRow label="Hạng mục thu chi" required>
                    <select
                      value={form.category}
                      onChange={e => {
                        const v = e.target.value;
                        const mapping = CATEGORY_AUTO_MAPPING[v];
                        if (mapping) {
                          setForm(prev => ({
                            ...prev,
                            category: v,
                            payer_payee: mapping.payer_payee,
                            department_code: mapping.department_code,
                            created_by: mapping.created_by,
                            approved_by: mapping.approved_by
                          }));
                        } else {
                          setForm(prev => ({ ...prev, category: v }));
                        }
                      }}
                      required
                    >
                      {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </FormRow>

                  <FormRow label="Hình thức thanh toán" required>
                    <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} required>
                      {METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </FormRow>

                  <FormRow label="Số tiền phát sinh (VNĐ)" required>
                    <input
                      type="number"
                      value={form.amount}
                      onChange={e => setForm({ ...form, amount: e.target.value })}
                      placeholder="Nhập số tiền..."
                      style={{ fontWeight: 700, fontSize: '1.05rem', color: TX_TYPE_META[txType].color }}
                      required
                    />
                  </FormRow>

                  <FormRow label="Liên kết Mã Hợp Đồng">
                    <select value={form.contract_id} onChange={e => setForm({ ...form, contract_id: e.target.value })}>
                      <option value="">-- Không chọn HĐ --</option>
                      {contracts.map(c => <option key={c.id} value={c.id}>{c.id} - {c.customer_name || 'Khách'}</option>)}
                    </select>
                  </FormRow>

                  <FormRow label="Liên kết Mã Hồ Sơ / Dự Án">
                    <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}>
                      <option value="">-- Không chọn Hồ sơ --</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.id} - {p.task_name || p.service_type}</option>)}
                    </select>
                  </FormRow>

                  <FormRow label="Phòng ban thụ hưởng">
                    <select value={form.department_code} onChange={e => setForm({ ...form, department_code: e.target.value })}>
                      <option value="">-- Chọn phòng ban --</option>
                      {departmentOptions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </FormRow>

                  <FormRow label="Diễn giải chi tiết" cols={3} required>
                    <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Nội dung diễn giải chi tiết cho chứng từ..." required />
                  </FormRow>
                </FormGrid>

                {needsLinkWarning && (
                  <div style={{ marginTop: 16, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#ef4444', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={16} />
                    <span>Hạng mục "{form.category}" bắt buộc phải chọn Mã Hợp Đồng hoặc Mã Hồ Sơ!</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                  <button type="submit" className="btn btn-primary" disabled={loading} style={{ padding: '0 24px', height: 42 }}>
                    {loading ? '⏳ Đang lưu...' : '💾 Lưu phiếu & Hiển thị bản in'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Visual Voucher Display Component (Render Trực Tiếp Mẫu In) */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 32, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <VoucherTemplate
              title={voucherInfo.title}
              voucherId={form.id}
              date={form.transaction_date}
              personName={form.payer_payee}
              labelPerson={voucherInfo.labelPerson}
              description={form.description}
              amount={form.amount}
              amountWords={amountInWords}
              category={form.category}
              paymentMethod={form.payment_method}
              department={form.department_code}
              contractId={form.contract_id}
              projectId={form.project_id}
              createdBy={form.created_by}
              accounting={form.accounting}
              approvedBy={form.approved_by}
            />
          </div>

        </div>

      </div>
    </div>
  );
}
