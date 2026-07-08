import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { ExcelGridTable } from '../SharedFinanceUI';
import { API } from '../financeConstants';
import { docSoTiengViet, CATEGORY_AUTO_MAPPING } from '../utils';
import { PlusCircle, RefreshCw, AlertCircle, Search } from 'lucide-react';

// Hạng mục nào bắt buộc phải gắn Hợp đồng / Dự án thì khai báo ở đây.
// Tách thành hằng số để dễ mở rộng thay vì so sánh chuỗi cứng trong logic lưu phiếu.
const CATEGORIES_REQUIRE_LINK = ['Chi thụ lý bản vẽ'];

const CATEGORY_OPTIONS = [
  { value: 'Sinh hoạt gia đình', label: 'Sinh hoạt gia đình' },
  { value: 'Chi bảo vệ', label: 'Chi bảo vệ' },
  { value: 'Chi thụ lý bản vẽ', label: 'Chi thụ lý bản vẽ' },
  { value: 'Viết hồ sơ', label: 'Viết hồ sơ' },
  { value: 'Bản vẽ cấp giấy', label: 'Bản vẽ cấp giấy' },
  { value: 'Văn phòng phẩm', label: 'Văn phòng phẩm' },
  { value: 'In ấn - Photocopy', label: 'In ấn - Photocopy' },
  { value: 'Chi quầy tiếp nhận', label: 'Chi quầy tiếp nhận' },
  { value: 'Ăn uống', label: 'Ăn uống' },
  { value: 'Đi lại - Xăng xe - Gửi xe', label: 'Đi lại - Xăng xe - Gửi xe' },
  { value: 'Công tác phí', label: 'Công tác phí' },
  { value: 'Chuyển phát - Bưu chính-Grab', label: 'Chuyển phát - Bưu chính-Grab' },
  { value: 'Điện - Nước - Internet', label: 'Điện - Nước - Internet' },
  { value: 'Sửa chữa nhỏ', label: 'Sửa chữa nhỏ' },
  { value: 'Bảo trì thiết bị', label: 'Bảo trì thiết bị' },
  { value: 'Vệ sinh - Rác thải', label: 'Vệ sinh - Rác thải' },
  { value: 'Lấy sổ', label: 'Lấy sổ' },
  { value: 'Lấy bản vẽ', label: 'Lấy bản vẽ' },
  { value: 'Lấy trích lục', label: 'Lấy trích lục' },
  { value: 'Công chứng hồ sơ', label: 'Công chứng hồ sơ' },
  { value: 'Quầy nước- cà phê', label: 'Quầy nước- cà phê' },
  { value: 'Bổ sung quỹ', label: 'Bổ sung quỹ' },
  { value: 'Đóng thuế', label: 'Đóng thuế' },
  { value: 'Hỗ trợ sự kiện - Marketing', label: 'Hỗ trợ sự kiện - Marketing' },
  { value: 'Chi phí tạm ứng', label: 'Chi phí tạm ứng' },
  { value: 'Chi thực tế từ tạm ứng', label: 'Chi thực tế từ tạm ứng' },
  { value: 'Quyết toán hoàn ứng', label: 'Quyết toán hoàn ứng' },
  { value: 'Khác', label: 'Khác' }
];

const METHOD_OPTIONS = [
  { value: 'Chuyển khoản', label: 'Chuyển khoản' },
  { value: 'Tiền mặt', label: 'Tiền mặt' },
  { value: 'Tạm ứng', label: 'Tạm ứng' }
];

const TX_TYPE_META = {
  'Chi': { title: 'PHIẾU CHI', labelPerson: 'Người nhận', color: '#ef4444', badge: '● CHẾ ĐỘ PHIẾU CHI (XUẤT TIỀN RA)' },
  'Thu': { title: 'PHIẾU THU', labelPerson: 'Người nộp', color: '#10b981', badge: '● CHẾ ĐỘ PHIẾU THU (CÓ TIỀN VÀO)' },
  'Tạm ứng': { title: 'PHIẾU TẠM ỨNG', labelPerson: 'Người nhận', color: '#f59e0b', badge: '● CHẾ ĐỘ PHIẾU TẠM ỨNG' },
  'Hoàn ứng': { title: 'PHIẾU HOÀN ỨNG', labelPerson: 'Người nộp', color: '#6366f1', badge: '● CHẾ ĐỘ PHIẾU HOÀN ỨNG' }
};

const defaultNguoiLap = 'Lê Văn Dựng';
const defaultKeToan = 'Nguyễn Thị A';
const defaultNguoiDuyet = 'Lê Văn Dựng';

const emptyForm = {
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
};

export default function PrintVoucherScreen({ month }) {
  const [mode, setMode] = useState('create'); // 'print' | 'create'
  const [txType, setTxType] = useState('Chi'); // 'Thu' | 'Chi' | 'Tạm ứng' | 'Hoàn ứng'
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
    } catch (e) { /* không chặn UI nếu tính năng tạm ứng chưa dùng tới */ }
  };

  const fetchContractsAndProjects = async () => {
    try {
      const rC = await fetch(`${API}/api/finance/contracts`);
      if (rC.ok) setContracts(await rC.json());
      const rP = await fetch(`${API}/api/finance/projects`);
      if (rP.ok) setProjects(await rP.json());
    } catch (e) { /* không chặn UI, các trường liên kết chỉ là tuỳ chọn */ }
  };

  const fetchDepartments = async () => {
    try {
      const response = await fetch(`${API}/api/finance/employees/departments`);
      if (response.ok) {
        const data = await response.json();
        setDepartments(Array.isArray(data) ? data : []);
      }
    } catch (e) { /* vẫn dùng phòng ban lấy từ chứng từ cũ nếu API chưa sẵn sàng */ }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchTransactions(),
      fetchActiveAdvances(),
      fetchContractsAndProjects(),
      fetchDepartments(),
    ]);
    setRefreshing(false);
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNextVoucherId = async (type) => {
    try {
      const res = await fetch(`${API}/api/finance/next-voucher-id?type=${type}`);
      if (res.ok) {
        const data = await res.json();
        setForm(prev => ({ ...prev, id: data.next_id }));
      }
    } catch (e) {
      addToast('Không thể tạo số phiếu tự động, vui lòng nhập tay', 'warning');
    }
  };

  // Khi đổi chế độ / loại phiếu ở màn "Lập phiếu mới": reset toàn bộ form trong MỘT lần
  // cập nhật state duy nhất (thay vì hai lần setForm rời rạc như trước) rồi mới xin số phiếu tự động
  // cho Thu/Chi. Tạm ứng và Hoàn ứng được sinh số phiếu ở phía server nên để trống ID tại đây.
  useEffect(() => {
    if (mode !== 'create') return;

    const isAutoId = txType === 'Thu' || txType === 'Chi';

    setForm({
      ...emptyForm,
      id: '',
      ngay: new Date().toLocaleDateString('vi-VN'),
      hang_muc: txType === 'Tạm ứng' ? 'Chi phí tạm ứng' : (txType === 'Hoàn ứng' ? 'Quyết toán hoàn ứng' : 'Sinh hoạt gia đình'),
      hinh_thuc: txType === 'Hoàn ứng' ? 'Tạm ứng' : (txType === 'Tạm ứng' ? 'Tiền mặt' : 'Chuyển khoản')
    });
    setSelectedAdvanceId('');

    if (isAutoId) fetchNextVoucherId(txType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, txType]);

  // Khi chuyển sang chế độ "Xem & In", không tự chọn sẵn phiếu nào — người dùng phải chọn
  // rõ ràng từ danh sách bên dưới để tránh in nhầm dữ liệu form mặc định còn sót lại.
  useEffect(() => {
    if (mode === 'print') {
      setForm(emptyForm);
      setSelectedId('');
      setPrintSearch('');
    }
  }, [mode]);

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

  // Danh sách phiếu để chọn khi ở chế độ "Xem & In", có tìm kiếm và sắp xếp mới nhất lên trước.
  const printList = useMemo(() => {
    const q = printSearch.trim().toLowerCase();
    return [...transactions]
      .filter(t => {
        if (month) {
          const tMonth = t.ngay ? t.ngay.slice(0, 7) : (t.created_at ? t.created_at.slice(0, 7) : null);
          if (tMonth && tMonth !== month) return false;
        }
        if (!q) return true;
        return (
          (t.id || '').toLowerCase().includes(q) ||
          (t['Diễn giải'] || '').toLowerCase().includes(q) ||
          (t['Đối tác'] || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  }, [transactions, printSearch, month]);

  const departmentOptions = useMemo(() => {
    const names = [
      ...departments.map(department => department.name),
      ...transactions.map(transaction => transaction.du_an_phong_ban || transaction['Dự án']),
      ...Object.values(CATEGORY_AUTO_MAPPING).map(mapping => mapping.phong_ban),
      form.du_an_phong_ban,
    ];

    return [...new Set(names.map(name => String(name || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'vi'))
      .map(name => ({ value: name, label: name }));
  }, [departments, transactions, form.du_an_phong_ban]);

  const filteredAdvances = useMemo(() => {
    if (!month) return activeAdvances;
    return activeAdvances.filter(a => {
      const aMonth = a.ngay ? a.ngay.slice(0, 7) : (a.created_at ? a.created_at.slice(0, 7) : null);
      return !aMonth || aMonth === month;
    });
  }, [activeAdvances, month]);

  const selectedAdvance = useMemo(
    () => activeAdvances.find(a => a.id === selectedAdvanceId) || null,
    [activeAdvances, selectedAdvanceId]
  );

  // Số tiền viết bằng chữ — bắt buộc trên chứng từ kế toán thực tế, trước đây import sẵn nhưng chưa dùng.
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
    CATEGORIES_REQUIRE_LINK.includes(form.hang_muc) &&
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
    if (!form.nguoi_nhan_nop) {
      addToast('Nhập người nhận/nộp', 'warning');
      return;
    }
    if (CATEGORIES_REQUIRE_LINK.includes(form.hang_muc) && !form.contract_id && !form.project_id) {
      addToast(`Hạng mục "${form.hang_muc}" bắt buộc phải liên kết Hợp đồng hoặc Hồ sơ/Dự án!`, 'warning');
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
            payer_payee: form.nguoi_nhan_nop,
            note: form.dien_giai,
            payment_method: form.hinh_thuc
          })
        });
      } else if (txType === 'Hoàn ứng') {
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
        isThu: txType === 'Thu',
        isTamUng: txType === 'Tạm ứng',
        isHoanUng: txType === 'Hoàn ứng',
        title: meta.title,
        labelPerson: meta.labelPerson,
        labelSignPerson: meta.labelPerson,
        color: meta.color,
        badge: meta.badge
      };
    }

    const isThu = form.id.startsWith('PT');
    const hangMucLower = (form.hang_muc || '').toLowerCase();
    const dienGiaiLower = (form.dien_giai || '').toLowerCase();

    if (hangMucLower.includes('hoàn ứng') || hangMucLower.includes('chi thực tế từ tạm ứng') || dienGiaiLower.includes('hoàn ứng') || dienGiaiLower.includes('chi thực tế từ tạm ứng')) {
      const meta = TX_TYPE_META['Hoàn ứng'];
      return { isThu, isTamUng: false, isHoanUng: true, title: meta.title, labelPerson: meta.labelPerson, labelSignPerson: meta.labelPerson, color: meta.color, badge: meta.badge };
    }
    if (hangMucLower.includes('tạm ứng') || dienGiaiLower.includes('tạm ứng')) {
      const meta = TX_TYPE_META['Tạm ứng'];
      return { isThu: false, isTamUng: true, isHoanUng: false, title: meta.title, labelPerson: meta.labelPerson, labelSignPerson: meta.labelPerson, color: meta.color, badge: meta.badge };
    }
    const meta = TX_TYPE_META[isThu ? 'Thu' : 'Chi'];
    return { isThu, isTamUng: false, isHoanUng: false, title: meta.title, labelPerson: meta.labelPerson, labelSignPerson: meta.labelPerson, color: meta.color, badge: meta.badge };
  };

  const voucherInfo = getVoucherInfo();
  const accentColor = voucherInfo.color;
  const showVoucher = mode === 'create' || (mode === 'print' && !!selectedId);

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
        .voucher-toolbar-select {
          height: 34px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          font-size: 0.82rem;
          background: #fff;
        }
        .spin-icon {
          animation: voucher-spin 0.9s linear infinite;
        }
        @keyframes voucher-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media print {
          @page {
            size: A5 landscape;
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          .printable-card, .printable-card * {
            visibility: visible;
          }
          .printable-card {
            position: absolute;
            left: 15mm;
            top: 15mm;
            width: calc(100% - 30mm);
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

      <div className="flex no-print" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>🖨️ Chứng từ Kế toán</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>Xem, in hoặc lập phiếu Thu, Chi, Tạm ứng, Hoàn ứng theo biểu mẫu</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className={`btn ${mode === 'print' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setMode('print')}>
            Xem & In Phiếu
          </button>
          <button
            className={`btn ${mode === 'create' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setMode('create')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <PlusCircle size={14} /> Lập Phiếu Mới
          </button>
        </div>
      </div>

      <div>
        <div className="card printable-card" style={{ padding: '30px 40px', background: '#fff', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #eee', paddingBottom: 12, flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: accentColor }}>
              {voucherInfo.badge}
            </span>

            {mode === 'create' && (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Chọn loại:</span>
                  <select className="voucher-toolbar-select" value={txType} onChange={e => setTxType(e.target.value)} style={{ width: 150 }}>
                    <option value="Chi">Phiếu Chi</option>
                    <option value="Thu">Phiếu Thu</option>
                    <option value="Tạm ứng">Phiếu Tạm Ứng</option>
                    <option value="Hoàn ứng">Phiếu Hoàn Ứng</option>
                  </select>
                </div>
                {txType === 'Hoàn ứng' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Chọn phiếu tạm ứng:</span>
                    <div style={{ position: 'relative' }}>
                      <input
                        list="advance-list"
                        className="voucher-toolbar-select"
                        placeholder="— Chọn hoặc nhập mã phiếu —"
                        value={selectedAdvanceId}
                        onChange={e => {
                          const val = e.target.value;
                          setSelectedAdvanceId(val);
                          const adv = activeAdvances.find(a => a.id === val);
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
                        }}
                        style={{ width: 240 }}
                      />
                      <datalist id="advance-list">
                        {filteredAdvances.map(a => (
                          <option key={a.id} value={a.id}>{a.id} ({a['Đối tác']} - {Number(a.amount || 0).toLocaleString('vi-VN')}₫)</option>
                        ))}
                      </datalist>
                    </div>
                    {selectedAdvance && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Đã tạm ứng: <strong>{Number(selectedAdvance.amount || 0).toLocaleString('vi-VN')}₫</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {mode === 'print' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder="Tìm số phiếu, đối tác, diễn giải..."
                    value={printSearch}
                    onChange={e => setPrintSearch(e.target.value)}
                    className="voucher-toolbar-select"
                    style={{ width: 220, paddingLeft: 30 }}
                  />
                </div>
                <select
                  className="voucher-toolbar-select"
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  style={{ width: 280 }}
                >
                  <option value="">— Chọn phiếu để xem/in ({printList.length}) —</option>
                  {printList.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.id} · {t['Đối tác'] || 'Chưa rõ'} · {Number(t.amount || 0).toLocaleString('vi-VN')}₫
                    </option>
                  ))}
                </select>
                {selectedId && (
                  <button type="button" className="btn btn-outline" onClick={handlePrint}>
                    🖨️ In phiếu
                  </button>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleSave}>
            {!showVoucher ? (
              <div className="no-print" style={{ padding: '70px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <AlertCircle size={30} style={{ opacity: 0.5, marginBottom: 10 }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Chọn một phiếu ở ô tìm kiếm phía trên để xem hoặc in.</p>
              </div>
            ) : (
              <>
                <ExcelGridTable
                  title={voucherInfo.title}
                  accentColor={accentColor}
                  formId={form.id}
                  date={form.ngay}
                  onDateChange={(v) => setForm({ ...form, ngay: v })}
                  note={form.dien_giai}
                  onNoteChange={(v) => setForm({ ...form, dien_giai: v })}
                  category={form.hang_muc}
                  onCategoryChange={(v) => {
                    const mapping = CATEGORY_AUTO_MAPPING[v];
                    if (mapping) {
                      setForm(prev => ({
                        ...prev,
                        hang_muc: v,
                        nguoi_nhan_nop: mapping.doi_tac,
                        du_an_phong_ban: mapping.phong_ban,
                        nguoi_lap: mapping.nguoi_lap,
                        nguoi_duyet: mapping.nguoi_duyet
                      }));
                    } else {
                      setForm(prev => ({ ...prev, hang_muc: v }));
                    }
                  }}
                  categoryOptions={CATEGORY_OPTIONS}
                  personLabel={voucherInfo.labelPerson}
                  personName={form.nguoi_nhan_nop}
                  onPersonNameChange={(v) => setForm({ ...form, nguoi_nhan_nop: v })}
                  method={form.hinh_thuc}
                  onMethodChange={(v) => setForm({ ...form, hinh_thuc: v })}
                  methodOptions={txType === 'Hoàn ứng' ? [{ value: 'Tạm ứng', label: 'Tạm ứng' }] : METHOD_OPTIONS.filter(o => o.value !== 'Tạm ứng')}
                  department={form.du_an_phong_ban}
                  onDepartmentChange={(v) => setForm({ ...form, du_an_phong_ban: v })}
                  departmentOptions={departmentOptions}
                  amountDisplay={form.amount ? Number(form.amount).toLocaleString('vi-VN') : ''}
                  onAmountChange={(v) => setForm({ ...form, amount: v.replace(/[^\d]/g, '') })}
                  status={form.trang_thai}
                  onStatusChange={(v) => setForm({ ...form, trang_thai: v })}
                  projectId={form.project_id || ''}
                  onProjectIdChange={(v) => setForm({ ...form, project_id: v })}
                  contractId={form.contract_id || ''}
                  onContractIdChange={(v) => setForm({ ...form, contract_id: v })}
                  creator={form.nguoi_lap}
                  onCreatorChange={(v) => setForm({ ...form, nguoi_lap: v })}
                  accountant={form.ke_toan}
                  onAccountantChange={(v) => setForm({ ...form, ke_toan: v })}
                  approver={form.nguoi_duyet}
                  onApproverChange={(v) => setForm({ ...form, nguoi_duyet: v })}
                  receiver={form.nguoi_nhan_nop}
                  receiverLabel={voucherInfo.labelSignPerson}
                  isReadOnly={mode === 'print'}
                />

                {amountInWords && (
                  <div style={{ marginTop: 10, fontSize: '0.88rem', fontStyle: 'italic' }}>
                    Bằng chữ: <strong style={{ textTransform: 'capitalize' }}>{amountInWords}</strong>
                  </div>
                )}

                {needsLinkWarning && (
                  <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '10px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: '0.82rem', color: '#9a3412' }}>
                    <AlertCircle size={16} />
                    Hạng mục "{form.hang_muc}" bắt buộc phải liên kết Hợp đồng hoặc Dự án trước khi lưu phiếu.
                  </div>
                )}
              </>
            )}

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
