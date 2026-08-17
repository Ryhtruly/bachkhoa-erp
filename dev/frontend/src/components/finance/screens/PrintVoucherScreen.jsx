import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DatePicker } from '../../ui';
import { fmtShort, spellVietnameseCurrency, CATEGORY_AUTO_MAPPING, VOUCHER_SIGNERS } from '../utils';
import { API } from '../financeConstants';
import { COMPANY_IDENTITY } from '../../../lib/companyIdentity';
import voucherPrintStyles from './PrintVoucherScreen.print.css?inline';
import {
  Printer,
  PlusCircle,
  RefreshCw,
  AlertTriangle,
  FileText,
  DollarSign,
  User,
  Calendar,
  CreditCard,
  Building2,
  FolderOpen,
  Briefcase,
  Sparkles,
  Save,
  CheckCircle2
} from 'lucide-react';

const getTodayIso = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (d) => {
  if (!d) return '';
  if (d.includes('-')) {
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return d;
};

export function VoucherTemplate({
  title, voucherId, date, personName, labelPerson, description, amount, amountWords,
  category, paymentMethod, department, contractId, projectId, accounting, documentRef
}) {
  const isReceiptVoucher = title.includes('THU');
  const isAdvancePayment = title.includes('TẠM ỨNG');
  const isAdvanceReimbursement = title.includes('HOÀN ỨNG');

  const formCode = isReceiptVoucher ? '01 - TT' : (isAdvancePayment ? '02 - TT/TỨ' : (isAdvanceReimbursement ? '03 - TT/HỨ' : '02 - TT'));
  const debitAccount = isReceiptVoucher ? (paymentMethod === 'Chuyển khoản' ? '1121' : '1111') : (isAdvancePayment ? '141' : (isAdvanceReimbursement ? '642 / 154' : (category && category.includes('Lương') ? '334' : '642')));
  const creditAccount = isReceiptVoucher ? (category && category.includes('Thu') ? '131 / 511' : '131') : (paymentMethod === 'Chuyển khoản' ? '1121' : '1111');

  return (
    <div ref={documentRef} className="voucher-print-document" style={{
      background: '#ffffff',
      color: '#000000',
      fontFamily: '"Times New Roman", Times, serif',
      lineHeight: 1.45,
      padding: '24px 32px'
    }}>
      {/* Header Công Ty & Mẫu Số Bộ Tài Chính */}
      <div className="voucher-print-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ fontSize: '0.92rem', lineHeight: 1.4 }}>
          <div style={{ fontWeight: 800, fontSize: '0.98rem', textTransform: 'uppercase' }}>
            {COMPANY_IDENTITY.legalName}
          </div>
          <div>Địa chỉ: {COMPANY_IDENTITY.address}</div>
          <div>Mã số thuế: {COMPANY_IDENTITY.taxCode} | ĐT: {COMPANY_IDENTITY.phone}</div>
        </div>

        <div style={{ textAlign: 'center', fontSize: '0.88rem', minWidth: 260 }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Mẫu số {formCode}</div>
          <div style={{ fontStyle: 'italic', fontSize: '0.82rem', color: '#444' }}>
            (Ban hành theo Thông tư số 99/2025/TT-BTC<br />của Bộ Tài chính)
          </div>
        </div>
      </div>

      {/* Tiêu Đề Chứng Từ & Ngày Tháng */}
      <div className="voucher-print-title" style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{
          margin: '0 0 6px 0',
          fontSize: '1.75rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          color: '#000000'
        }}>
          {title}
        </h1>
        <div style={{ fontStyle: 'italic', fontSize: '0.95rem', marginBottom: 8 }}>
          Ngày {date ? formatDisplayDate(date).split('/')[0] : '...'} tháng {date ? formatDisplayDate(date).split('/')[1] : '...'} năm {date ? formatDisplayDate(date).split('/')[2] : '2026'}
        </div>
        <div className="voucher-print-ledger" style={{ display: 'flex', justifyContent: 'center', gap: 32, fontSize: '0.9rem', fontWeight: 600 }}>
          <span>Số: <strong style={{ fontFamily: 'monospace' }}>{voucherId || '........'}</strong></span>
          <span>Quyển số: <strong>01</strong></span>
          <span>Nợ: <strong>{debitAccount}</strong></span>
          <span>Có: <strong>{creditAccount}</strong></span>
        </div>
      </div>

      {/* Nội Dung Chi Tiết Chứng Từ */}
      <div className="voucher-print-details" style={{ fontSize: '1rem', lineHeight: 1.9, marginBottom: 24 }}>
        <div className="voucher-print-row" style={{ display: 'flex' }}>
          <span className="voucher-print-label" style={{ minWidth: 250 }}>- Họ và tên {isReceiptVoucher ? 'người nộp tiền' : 'người nhận tiền'}:</span>
          <strong className="voucher-print-value" style={{ flex: 1, borderBottom: '1px dotted #666', paddingBottom: 2 }}>{personName || ''}</strong>
        </div>
        <div className="voucher-print-row" style={{ display: 'flex' }}>
          <span className="voucher-print-label" style={{ minWidth: 250 }}>- Địa chỉ / Bộ phận:</span>
          <span className="voucher-print-value" style={{ flex: 1, borderBottom: '1px dotted #666', paddingBottom: 2 }}>{department || COMPANY_IDENTITY.legalName}</span>
        </div>
        <div className="voucher-print-row" style={{ display: 'flex' }}>
          <span className="voucher-print-label" style={{ minWidth: 250 }}>- Lý do {isReceiptVoucher ? 'nộp' : 'chi'}:</span>
          <span className="voucher-print-value" style={{ flex: 1, borderBottom: '1px dotted #666', paddingBottom: 2 }}>
            {description || category || ''}
          </span>
        </div>
        <div className="voucher-print-row" style={{ display: 'flex' }}>
          <span className="voucher-print-label" style={{ minWidth: 250 }}>- Số tiền:</span>
          <strong className="voucher-print-value" style={{ flex: 1, borderBottom: '1px dotted #666', paddingBottom: 2, fontSize: '1.1rem' }}>
            {amount ? `${Number(amount).toLocaleString('vi-VN')} VNĐ` : '................................................... VNĐ'}
          </strong>
        </div>
        <div className="voucher-print-row" style={{ display: 'flex' }}>
          <span className="voucher-print-label" style={{ minWidth: 250 }}>- Viết bằng chữ:</span>
          <em className="voucher-print-value" style={{ flex: 1, borderBottom: '1px dotted #666', paddingBottom: 2, fontWeight: 600 }}>
            {amountWords || '........................................................................................................................................'}
          </em>
        </div>
        <div className="voucher-print-row" style={{ display: 'flex' }}>
          <span className="voucher-print-label" style={{ minWidth: 250 }}>- Hình thức thanh toán:</span>
          <span className="voucher-print-value" style={{ flex: 1, borderBottom: '1px dotted #666', paddingBottom: 2 }}>
            {paymentMethod || 'Tiền mặt'} (Hạng mục: {category || 'Khác'})
          </span>
        </div>
        {(contractId || projectId) && (
          <div className="voucher-print-row" style={{ display: 'flex' }}>
            <span className="voucher-print-label" style={{ minWidth: 250 }}>- Hợp đồng / Hồ sơ liên quan:</span>
            <span className="voucher-print-value" style={{ flex: 1, borderBottom: '1px dotted #666', paddingBottom: 2, fontWeight: 700 }}>
              {[contractId && `HĐ: ${contractId}`, projectId && `Hồ sơ: ${projectId}`].filter(Boolean).join(' | ')}
            </span>
          </div>
        )}
        <div className="voucher-print-row" style={{ display: 'flex' }}>
          <span className="voucher-print-label" style={{ minWidth: 250 }}>- Kèm theo:</span>
          <span className="voucher-print-value" style={{ flex: 1, borderBottom: '1px dotted #666', paddingBottom: 2 }}>
            01 chứng từ gốc
          </span>
        </div>
      </div>

      {/* Ngày Ký */}
      <div className="voucher-print-date" style={{ textAlign: 'right', fontStyle: 'italic', fontSize: '0.95rem', marginBottom: 12 }}>
        Ngày {date ? formatDisplayDate(date).split('/')[0] : '...'} tháng {date ? formatDisplayDate(date).split('/')[1] : '...'} năm {date ? formatDisplayDate(date).split('/')[2] : '2026'}
      </div>

      {/* 5 Cột Chữ Ký Chuẩn Bộ Tài Chính */}
      <div className="voucher-print-signatures" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        textAlign: 'center',
        gap: 8,
        marginBottom: 36
      }}>
        <div className="voucher-print-signature">
          <div className="voucher-print-signature-title" style={{ fontWeight: 800, fontSize: '0.88rem', textTransform: 'uppercase' }}>Giám đốc</div>
          <div className="voucher-print-signature-note" style={{ fontSize: '0.78rem', fontStyle: 'italic', color: '#555' }}>(Ký, họ tên, đóng dấu)</div>
          <div className="voucher-print-signature-space" style={{ height: 50 }} />
          <div className="voucher-print-signature-name" style={{ fontWeight: 700, fontSize: '0.88rem' }}>{VOUCHER_SIGNERS.director}</div>
        </div>

        <div className="voucher-print-signature">
          <div className="voucher-print-signature-title" style={{ fontWeight: 800, fontSize: '0.88rem', textTransform: 'uppercase' }}>Kế toán trưởng</div>
          <div className="voucher-print-signature-note" style={{ fontSize: '0.78rem', fontStyle: 'italic', color: '#555' }}>(Ký, họ tên)</div>
          <div className="voucher-print-signature-space" style={{ height: 50 }} />
          <div className="voucher-print-signature-name" style={{ fontWeight: 700, fontSize: '0.88rem' }}>{accounting || 'Nguyễn Thị A'}</div>
        </div>

        <div className="voucher-print-signature">
          <div className="voucher-print-signature-title" style={{ fontWeight: 800, fontSize: '0.88rem', textTransform: 'uppercase' }}>Thủ quỹ</div>
          <div className="voucher-print-signature-note" style={{ fontSize: '0.78rem', fontStyle: 'italic', color: '#555' }}>(Ký, họ tên)</div>
          <div className="voucher-print-signature-space" style={{ height: 50 }} />
          <div className="voucher-print-signature-name" style={{ fontWeight: 700, fontSize: '0.88rem' }}>&nbsp;</div>
        </div>

        <div className="voucher-print-signature">
          <div className="voucher-print-signature-title" style={{ fontWeight: 800, fontSize: '0.88rem', textTransform: 'uppercase' }}>Người lập phiếu</div>
          <div className="voucher-print-signature-note" style={{ fontSize: '0.78rem', fontStyle: 'italic', color: '#555' }}>(Ký, họ tên)</div>
          <div className="voucher-print-signature-space" style={{ height: 50 }} />
          <div className="voucher-print-signature-name" style={{ fontWeight: 700, fontSize: '0.88rem' }}>{VOUCHER_SIGNERS.creator}</div>
        </div>

        <div className="voucher-print-signature">
          <div className="voucher-print-signature-title" style={{ fontWeight: 800, fontSize: '0.88rem', textTransform: 'uppercase' }}>{labelPerson || (isReceiptVoucher ? 'Người nộp tiền' : 'Người nhận tiền')}</div>
          <div className="voucher-print-signature-note" style={{ fontSize: '0.78rem', fontStyle: 'italic', color: '#555' }}>(Ký, họ tên)</div>
          <div className="voucher-print-signature-space" style={{ height: 50 }} />
          <div className="voucher-print-signature-name" style={{ fontWeight: 700, fontSize: '0.88rem' }}>{personName || ''}</div>
        </div>
      </div>

      {/* Dòng Xác Nhận Đã Nhận Đủ Tiền Ở Dưới Cùng */}
      <div className="voucher-print-confirmation" style={{ borderTop: '1px dashed #999', paddingTop: 10, fontSize: '0.88rem', fontStyle: 'italic' }}>
        + Đã nhận đủ số tiền (viết bằng chữ): {amountWords || '................................................................................................................................'}
      </div>
    </div>
  );
}

const CATEGORY_OPTIONS = [
  { value: 'Chi ngoại giao & Xử lý hồ sơ', label: 'Chi ngoại giao & Xử lý hồ sơ' },
  { value: 'Bồi dưỡng thẩm định & Hiện trường', label: 'Bồi dưỡng thẩm định & Hiện trường' },
  { value: 'Chi thụ lý bản vẽ & Trích lục', label: 'Chi thụ lý bản vẽ & Trích lục' },
  { value: 'Công chứng, Lệ phí & Nghĩa vụ thuế', label: 'Công chứng, Lệ phí & Nghĩa vụ thuế' },
  { value: 'Chi tiếp khách & Giao tế', label: 'Chi tiếp khách & Giao tế' },
  { value: 'Lương khoán & Hoa hồng 3P', label: 'Lương khoán & Hoa hồng 3P' },
  { value: 'Công tác phí & Di chuyển hiện trường', label: 'Công tác phí & Di chuyển hiện trường' },
  { value: 'Văn phòng phẩm & In ấn kỹ thuật', label: 'Văn phòng phẩm & In ấn kỹ thuật' },
  { value: 'Sửa chữa, Kiểm định máy đo & Thiết bị', label: 'Sửa chữa, Kiểm định máy đo & Thiết bị' },
  { value: 'Điện - Nước - Internet', label: 'Điện - Nước - Internet' },
  { value: 'Chi hoàn trả khách hàng', label: 'Chi hoàn trả khách hàng' },
  { value: 'Chi quầy tiếp nhận & Vệ sinh', label: 'Chi quầy tiếp nhận & Vệ sinh' },
  { value: 'Chi bảo vệ', label: 'Chi bảo vệ' },
  { value: 'Thu chênh lệch kiểm kê quỹ', label: 'Thu chênh lệch kiểm kê quỹ' },
  { value: 'Chi chênh lệch kiểm kê quỹ', label: 'Chi chênh lệch kiểm kê quỹ' },
  { value: 'Khác', label: 'Khác' },
];

const METHOD_OPTIONS = [
  { value: 'Chuyển khoản', label: 'Chuyển khoản' },
  { value: 'Tiền mặt', label: 'Tiền mặt' },
  { value: 'Tạm ứng', label: 'Tạm ứng' },
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

const defaultCreatedBy = VOUCHER_SIGNERS.creator;
const defaultAccounting = 'Nguyễn Thị A';
const defaultApprovedBy = VOUCHER_SIGNERS.director;

const emptyForm = {
  id: '',
  transaction_date: getTodayIso(),
  description: '',
  category: 'Chi tiếp khách & Giao tế',
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
  const voucherDocumentRef = useRef(null);
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
              transaction_date: getTodayIso(),
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
        let rawDate = tx.date || tx.transaction_date || tx.created_at || '';
        let isoDate = getTodayIso();
        if (rawDate) {
          const cleanDate = rawDate.split('T')[0].split(' ')[0];
          if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
            isoDate = cleanDate;
          } else if (cleanDate.includes('/')) {
            const parts = cleanDate.split('/');
            if (parts.length === 3) {
              isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
        }
        setForm({
          id: tx.id,
          transaction_date: isoDate,
          description: tx.description || '',
          category: tx.category || 'Khác',
          payer_payee: tx.partner || tx.payer_payee || '',
          payment_method: tx.payment_method || 'Chuyển khoản',
          department_code: tx.department_code || '',
          amount: String(tx.amount || ''),
          status: tx.status || 'Hoàn thành',
          created_by: defaultCreatedBy,
          accounting: defaultAccounting,
          approved_by: defaultApprovedBy,
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

  const amountInWords = useMemo(() => {
    const n = Number(form.amount);
    if (!n || n <= 0) return '';
    try {
      const words = spellVietnameseCurrency(n);
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
    const sourceDocument = voucherDocumentRef.current;
    if (!sourceDocument) {
      addToast('Không tìm thấy nội dung chứng từ để in', 'error');
      return;
    }

    const printFrame = document.createElement('iframe');
    printFrame.setAttribute('title', 'Bản in chứng từ thu chi');
    printFrame.setAttribute('aria-hidden', 'true');
    Object.assign(printFrame.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '210mm',
      height: '297mm',
      border: '0',
      opacity: '0',
      pointerEvents: 'none',
    });

    let cleanupTimer;
    const cleanup = () => {
      window.clearTimeout(cleanupTimer);
      printFrame.remove();
    };

    printFrame.onload = () => {
      const printWindow = printFrame.contentWindow;
      if (!printWindow) {
        cleanup();
        addToast('Trình duyệt không thể mở bản in', 'error');
        return;
      }

      printWindow.addEventListener('afterprint', cleanup, { once: true });
      cleanupTimer = window.setTimeout(cleanup, 120000);
      printWindow.focus();
      printWindow.print();
    };

    printFrame.srcdoc = `<!doctype html>
      <html lang="vi">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Chứng từ thu chi</title>
          <style>${voucherPrintStyles}</style>
        </head>
        <body>${sourceDocument.outerHTML}</body>
      </html>`;
    document.body.appendChild(printFrame);
  };

  const handleQuickAddAmount = (addValue) => {
    const current = Number(form.amount) || 0;
    const nextVal = current + addValue;
    setForm(prev => ({ ...prev, amount: String(nextVal) }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.transaction_date) {
      addToast('Vui lòng chọn ngày lập chứng từ', 'warning');
      return;
    }
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) {
      addToast('Nhập số tiền phát sinh hợp lệ (> 0 VNĐ)', 'warning');
      return;
    }
    if (!form.payer_payee || !form.payer_payee.trim()) {
      addToast('Vui lòng nhập họ tên người giao dịch', 'warning');
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
        addToast('Lưu chứng từ thành công!', 'success');
        await fetchTransactions();
        await fetchActiveAdvances();
        setMode('print');
        setSelectedId(saved.id || (saved.auto_vouchers && saved.auto_vouchers[0] ? saved.auto_vouchers[0].id : ''));
      } else {
        const err = await res.json();
        addToast(`Lỗi: ${err.detail || 'Không thể lưu chứng từ'}`, 'error');
      }
    } catch (e) {
      addToast('Lỗi kết nối máy chủ khi lưu chứng từ', 'error');
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
    const isReceipt = form.category.includes('Thu') || form.category.includes('nộp');
    return {
      title: isReceipt ? 'PHIẾU THU' : 'PHIẾU CHI',
      id: form.id,
      labelPerson: isReceipt ? 'Người nộp tiền' : 'Người nhận tiền'
    };
  };

  const voucherInfo = getVoucherInfo();

  return (
    <div className="print-screen-container" style={{ padding: '8px 0 32px 0' }}>
      {/* Top Bar Navigation */}
      <div style={{
        background: '#ffffff',
        borderRadius: 14,
        padding: '14px 20px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px -2px rgba(0,0,0,0.04)',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: 4, borderRadius: 10 }}>
            <button
              onClick={() => setMode('create')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: mode === 'create' ? '#2563eb' : 'transparent',
                color: mode === 'create' ? '#ffffff' : '#475569',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: mode === 'create' ? '0 2px 6px rgba(37,99,235,0.3)' : 'none'
              }}
            >
              <PlusCircle size={17} /> Soạn chứng từ mới
            </button>
            <button
              onClick={() => setMode('print')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: mode === 'print' ? '#2563eb' : 'transparent',
                color: mode === 'print' ? '#ffffff' : '#475569',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: mode === 'print' ? '0 2px 6px rgba(37,99,235,0.3)' : 'none'
              }}
            >
              <Printer size={17} /> Xem & In chứng từ
            </button>
          </div>

          {mode === 'create' && (
            <div style={{ display: 'inline-flex', background: '#f8fafc', padding: 4, borderRadius: 10, border: '1px solid #e2e8f0' }}>
              {Object.keys(TX_TYPE_META).map(t => {
                const meta = TX_TYPE_META[t];
                const active = txType === t;
                return (
                  <button
                    key={t}
                    onClick={() => setTxType(t)}
                    style={{
                      border: 'none',
                      background: active ? meta.color : 'transparent',
                      color: active ? '#ffffff' : '#475569',
                      fontWeight: active ? 700 : 600,
                      padding: '6px 14px',
                      borderRadius: 7,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      boxShadow: active ? `0 2px 8px ${meta.color}40` : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 38,
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Tải lại danh sách"
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            Làm mới
          </button>
          <button
            onClick={handlePrint}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 38,
              padding: '0 18px',
              borderRadius: 8,
              border: 'none',
              background: '#0f172a',
              color: '#ffffff',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(15,23,42,0.25)'
            }}
          >
            <Printer size={16} /> In chứng từ (Print/PDF)
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mode === 'print' ? '320px 1fr' : '1fr', gap: 24 }}>

        {/* Sidebar Chọn Phiếu Để In */}
        {mode === 'print' && (
          <div style={{
            background: '#ffffff',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            height: 'fit-content',
            maxHeight: 'calc(100vh - 180px)',
            boxShadow: '0 4px 12px -2px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 800, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Danh sách chứng từ</span>
              </h3>
              <span style={{ fontSize: '0.78rem', background: '#eff6ff', color: '#2563eb', fontWeight: 700, padding: '2px 8px', borderRadius: 12 }}>
                {printList.length}
              </span>
            </div>
            <input
              type="text"
              placeholder="Tìm mã phiếu, người nhận/nộp..."
              value={printSearch}
              onChange={e => setPrintSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1.5px solid #cbd5e1',
                fontSize: '0.84rem',
                marginBottom: 12,
                outline: 'none',
                background: '#f8fafc',
                boxSizing: 'border-box'
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
                    border: `1.5px solid ${selectedId === t.id ? '#3b82f6' : '#e2e8f0'}`,
                    background: selectedId === t.id ? '#eff6ff' : '#ffffff',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1e293b' }}>
                    <span style={{ fontFamily: 'monospace' }}>{t.id}</span>
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
            <div style={{
              background: '#ffffff',
              borderRadius: 16,
              border: '1px solid #e2e8f0',
              padding: '24px 28px',
              boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)'
            }}>
              {/* Header của Form Soạn Thảo */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 16,
                marginBottom: 20,
                borderBottom: '1.5px solid #f1f5f9'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: TX_TYPE_META[txType].bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: TX_TYPE_META[txType].color
                  }}>
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                      SOẠN THẢO {TX_TYPE_META[txType].title}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>
                      {TX_TYPE_META[txType].action}
                    </p>
                  </div>
                </div>

                <div style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  background: TX_TYPE_META[txType].bg,
                  color: TX_TYPE_META[txType].color,
                  fontWeight: 700,
                  fontSize: '0.84rem'
                }}>
                  Tiền tố: {TX_TYPE_META[txType].prefix}
                </div>
              </div>

              {/* Quyết toán Hoàn ứng Banner */}
              {txType === 'Hoàn ứng' && (
                <div style={{
                  marginBottom: 24,
                  padding: '16px 20px',
                  background: '#f5f3ff',
                  borderRadius: 12,
                  border: '1.5px solid #ddd6fe',
                  boxShadow: '0 2px 6px rgba(124,58,237,0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#6d28d9', fontWeight: 800, fontSize: '0.9rem' }}>
                    <Sparkles size={18} />
                    <span>CHỌN CHỨNG TỪ TẠM ỨNG CẦN QUYẾT TOÁN:</span>
                  </div>
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
                    style={{
                      width: '100%',
                      height: 48,
                      minHeight: 48,
                      padding: '0 42px 0 14px',
                      lineHeight: '45px',
                      boxSizing: 'border-box',
                      borderRadius: 8,
                      border: '1.5px solid #c4b5fd',
                      backgroundColor: '#ffffff',
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      color: '#4c1d95',
                      textAlign: 'left',
                      textAlignLast: 'left',
                      display: 'block',
                      cursor: 'pointer',
                      outline: 'none',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                  >
                    <option value="">-- Nhấp để chọn phiếu tạm ứng --</option>
                    {filteredAdvances.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.id} — {a.partner || a.payer_payee} ({Number(a.amount || 0).toLocaleString('vi-VN')}₫) — {a.note || a.description || 'Không có ghi chú'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <form onSubmit={handleSave}>
                {/* 3-Cột Grid Gọn Gàng, Đồng Bộ */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '20px 24px',
                  marginBottom: 20
                }}>
                  {/* Cột 1: Mã số phiếu */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                      <FileText size={14} style={{ color: '#64748b' }} /> Mã số phiếu (ID) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={form.id}
                      readOnly
                      style={{
                        width: '100%',
                        height: 42,
                        padding: '0 14px',
                        borderRadius: 8,
                        border: '1.5px solid #e2e8f0',
                        background: '#f8fafc',
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        fontSize: '0.95rem',
                        color: '#1e293b',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Cột 2: Ngày lập */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                      <Calendar size={14} style={{ color: '#64748b' }} /> Ngày lập chứng từ <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <DatePicker
                      value={form.transaction_date}
                      onChange={value => setForm(prev => ({ ...prev, transaction_date: value }))}
                      placeholder="Chọn ngày lập chứng từ"
                      className="date-picker--fill"
                    />
                  </div>

                  {/* Cột 3: Người giao dịch */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                      <User size={14} style={{ color: '#64748b' }} /> {voucherInfo.labelPerson} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={form.payer_payee}
                      onChange={e => setForm({ ...form, payer_payee: e.target.value })}
                      placeholder="Nhập họ tên đối tác / nhân viên..."
                      required
                      style={{
                        width: '100%',
                        height: 42,
                        padding: '0 14px',
                        borderRadius: 8,
                        border: '1.5px solid #cbd5e1',
                        background: '#ffffff',
                        fontSize: '0.92rem',
                        fontWeight: 500,
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Hàng 2 - Cột 1: Hạng mục thu chi */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                      <Briefcase size={14} style={{ color: '#64748b' }} /> Hạng mục thu chi <span style={{ color: '#ef4444' }}>*</span>
                    </label>
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
                      style={{
                        width: '100%',
                        height: 42,
                        padding: '0 12px',
                        borderRadius: 8,
                        border: '1.5px solid #cbd5e1',
                        background: '#ffffff',
                        fontSize: '0.92rem',
                        fontWeight: 600,
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* Hàng 2 - Cột 2: Hình thức thanh toán */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                      <CreditCard size={14} style={{ color: '#64748b' }} /> Hình thức thanh toán <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      value={form.payment_method}
                      onChange={e => setForm({ ...form, payment_method: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        height: 42,
                        padding: '0 12px',
                        borderRadius: 8,
                        border: '1.5px solid #cbd5e1',
                        background: '#ffffff',
                        fontSize: '0.92rem',
                        fontWeight: 600,
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      {METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* Hàng 2 - Cột 3: Số tiền phát sinh */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                      <DollarSign size={14} style={{ color: TX_TYPE_META[txType].color }} /> Số tiền phát sinh (VNĐ) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="number"
                      value={form.amount}
                      onChange={e => setForm({ ...form, amount: e.target.value })}
                      placeholder="0"
                      min="1"
                      required
                      style={{
                        width: '100%',
                        height: 42,
                        padding: '0 14px',
                        borderRadius: 8,
                        border: `1.5px solid ${TX_TYPE_META[txType].color}60`,
                        background: '#ffffff',
                        fontWeight: 800,
                        fontSize: '1.1rem',
                        color: TX_TYPE_META[txType].color,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    {/* Nút cộng tiền nhanh */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {[1000000, 2000000, 5000000, 10000000].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleQuickAddAmount(val)}
                          style={{
                            border: '1px solid #e2e8f0',
                            background: '#f8fafc',
                            color: '#475569',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          +{val >= 1000000 ? `${val / 1000000}tr` : val}
                        </button>
                      ))}
                      {form.amount && (
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, amount: '' }))}
                          style={{
                            border: '1px solid #fee2e2',
                            background: '#fef2f2',
                            color: '#ef4444',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: 4,
                            cursor: 'pointer'
                          }}
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Hàng 3 - Cột 1: Mã Hợp Đồng */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                      <FolderOpen size={14} style={{ color: '#64748b' }} /> Liên kết Mã Hợp Đồng
                    </label>
                    <select
                      value={form.contract_id}
                      onChange={e => setForm({ ...form, contract_id: e.target.value })}
                      style={{
                        width: '100%',
                        height: 42,
                        padding: '0 12px',
                        borderRadius: 8,
                        border: '1.5px solid #cbd5e1',
                        background: '#ffffff',
                        fontSize: '0.88rem',
                        fontWeight: 500,
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="">-- Không liên kết HĐ --</option>
                      {contracts.map(c => (
                        <option key={c.id || c.contract_id} value={c.id || c.contract_id}>
                          {c.id || c.contract_id} — {c.customer_name || 'Khách hàng'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Hàng 3 - Cột 2: Mã Hồ Sơ / Dự Án */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                      <Briefcase size={14} style={{ color: '#64748b' }} /> Liên kết Mã Hồ Sơ / Dự Án
                    </label>
                    <select
                      value={form.project_id}
                      onChange={e => setForm({ ...form, project_id: e.target.value })}
                      style={{
                        width: '100%',
                        height: 42,
                        padding: '0 12px',
                        borderRadius: 8,
                        border: '1.5px solid #cbd5e1',
                        background: '#ffffff',
                        fontSize: '0.88rem',
                        fontWeight: 500,
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="">-- Không liên kết Hồ sơ --</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.label || 'Hồ sơ kỹ thuật chưa có mã'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Hàng 3 - Cột 3: Phòng ban thụ hưởng */}
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                      <Building2 size={14} style={{ color: '#64748b' }} /> Phòng ban thụ hưởng
                    </label>
                    <select
                      value={form.department_code}
                      onChange={e => setForm({ ...form, department_code: e.target.value })}
                      style={{
                        width: '100%',
                        height: 42,
                        padding: '0 12px',
                        borderRadius: 8,
                        border: '1.5px solid #cbd5e1',
                        background: '#ffffff',
                        fontSize: '0.88rem',
                        fontWeight: 500,
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="">-- Chọn phòng ban --</option>
                      {departmentOptions.map(d => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Tiền bằng chữ realtime badge */}
                {amountInWords && (
                  <div style={{
                    marginBottom: 16,
                    padding: '8px 14px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 8,
                    color: '#15803d',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <CheckCircle2 size={16} />
                    <span>Số tiền bằng chữ: <strong>{amountInWords}</strong></span>
                  </div>
                )}

                {/* Diễn giải chi tiết (chiếm toàn bộ chiều rộng) */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6, textTransform: 'uppercase' }}>
                    <FileText size={14} style={{ color: '#64748b' }} /> Diễn giải chi tiết <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Nội dung diễn giải chi tiết cho chứng từ..."
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1.5px solid #cbd5e1',
                      background: '#ffffff',
                      fontSize: '0.92rem',
                      fontWeight: 500,
                      color: '#0f172a',
                      outline: 'none',
                      boxSizing: 'border-box',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {needsLinkWarning && (
                  <div style={{
                    marginBottom: 18,
                    padding: '12px 16px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 10,
                    color: '#b91c1c',
                    fontSize: '0.86rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontWeight: 600
                  }}>
                    <AlertTriangle size={18} />
                    <span>Hạng mục "{form.category}" bắt buộc phải liên kết Mã Hợp Đồng hoặc Mã Hồ Sơ/Dự Án!</span>
                  </div>
                )}

                {/* Nút hành động Lưu */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '0 28px',
                      height: 44,
                      borderRadius: 10,
                      border: 'none',
                      background: loading ? '#94a3b8' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Save size={18} />
                    {loading ? 'Đang ghi nhận...' : 'Lưu chứng từ & Hiển thị bản in'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Visual Voucher Display Component (Render Mẫu In Trực Quan) */}
          <div className="voucher-print-area-wrapper" style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            padding: '32px 36px',
            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05)'
          }}>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                BẢN XEM TRƯỚC MẪU IN (A4)
              </span>
              <button
                type="button"
                onClick={handlePrint}
                className="no-print"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#334155',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Printer size={15} /> In nhanh
              </button>
            </div>

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
              projectId={projects.find(project => project.id === form.project_id)?.label || (form.project_id ? 'Hồ sơ đã liên kết' : '')}
              accounting={form.accounting}
              documentRef={voucherDocumentRef}
            />
          </div>

        </div>

      </div>
    </div>
  );
}
