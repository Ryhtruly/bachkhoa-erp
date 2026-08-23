import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DatePicker, Select } from '../../ui';
import { fmtShort, spellVietnameseCurrency, CATEGORY_AUTO_MAPPING } from '../utils';
import { API } from '../financeConstants';
import { apiFetch } from '../../../lib/api';
import { COMPANY_IDENTITY } from '../../../lib/companyIdentity';
import { printElement } from '../print/printDocument';
import voucherPrintStyles from './PrintVoucherScreen.print.css?inline';
import './PrintVoucherScreen.css';
import { getVoucherSignatureRoles } from './voucherSignatureUtils';
import { useDocumentSigners } from '../print/documentSigners';
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
  category, paymentMethod, department, contractId, projectId, _accounting, creatorName = '', signerSnapshot = null,
  documentRef, paperSize = 'a4'
}) {
  const isReceiptVoucher = title.includes('THU');
  const isAdvancePayment = title.includes('TẠM ỨNG');
  const isAdvanceReimbursement = title.includes('HOÀN ỨNG');
  const documentSigners = useDocumentSigners();
  const effectiveDocumentSigners = signerSnapshot || documentSigners;

  const isBankTransfer = paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'Chuyển khoản';
  const paymentMethodLabel = isBankTransfer ? 'Chuyển khoản' : (paymentMethod === 'CASH' || paymentMethod === 'Tiền mặt' ? 'Tiền mặt' : (paymentMethod || 'Tiền mặt'));

  const formCode = isReceiptVoucher ? '01 - TT' : (isAdvancePayment ? '02 - TT/TỨ' : (isAdvanceReimbursement ? '03 - TT/HỨ' : '02 - TT'));
  const debitAccount = isReceiptVoucher ? (isBankTransfer ? '1121' : '1111') : (isAdvancePayment ? '141' : (isAdvanceReimbursement ? '642 / 154' : (category && category.includes('Lương') ? '334' : '642')));
  const creditAccount = isReceiptVoucher ? (category && category.includes('Thu') ? '131 / 511' : '131') : (isBankTransfer ? '1121' : '1111');
  const signatureRoles = getVoucherSignatureRoles({
    isReceiptVoucher,
    isBankTransfer,
    isAdvanceDocument: isAdvancePayment ? 'advance' : (isAdvanceReimbursement ? 'reimbursement' : null),
    labelPerson,
    personName,
    creatorName,
    signerNames: effectiveDocumentSigners,
  });

  return (
    <div ref={documentRef} className="voucher-print-document" data-paper-size={paperSize} data-signature-count={signatureRoles.length} style={{
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
          <span>Nợ: <strong>{deAccount(debitAccount)}</strong></span>
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
            {paymentMethodLabel} (Hạng mục: {category || 'Khác'})
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

      {/* Vai trò chữ ký thay đổi theo loại chứng từ và hình thức thanh toán. */}
      <div className="voucher-print-signatures" style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${signatureRoles.length}, 1fr)`,
        textAlign: 'center',
        gap: 8,
        marginBottom: 36
      }}>
        {signatureRoles.map(role => (
          <div className="voucher-print-signature" key={role.title}>
            <div className="voucher-print-signature-title" style={{ fontWeight: 800, fontSize: '0.88rem', textTransform: 'uppercase' }}>{role.title}</div>
            <div className="voucher-print-signature-note" style={{ fontSize: '0.78rem', fontStyle: 'italic', color: '#555' }}>{role.note}</div>
            <div className="voucher-print-signature-space" style={{ height: 50 }} />
            <div className="voucher-print-signature-name" style={{ fontWeight: 700, fontSize: '0.88rem' }}>{role.name || '\u00a0'}</div>
          </div>
        ))}
      </div>

      {/* Dòng Xác Nhận Đã Nhận Đủ Tiền Ở Dưới Cùng */}
      <div className="voucher-print-confirmation" style={{ borderTop: '1px dashed #999', paddingTop: 10, fontSize: '0.88rem', fontStyle: 'italic' }}>
        + Đã nhận đủ số tiền (viết bằng chữ): {amountWords || '................................................................................................................................'}
      </div>
    </div>
  );
}

function deAccount(val) {
  return val || '1111';
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
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
  { value: 'CASH', label: 'Tiền mặt' },
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

const defaultCreatedBy = '';
const defaultAccounting = '';
const defaultApprovedBy = '';

const emptyForm = {
  id: '',
  transaction_date: getTodayIso(),
  description: '',
  category: 'Chi tiếp khách & Giao tế',
  payer_payee: '',
  payment_method: 'BANK_TRANSFER',
  department_code: '',
  amount: '',
  status: 'COMPLETED',
  created_by: defaultCreatedBy,
  accounting: defaultAccounting,
  approved_by: defaultApprovedBy,
  contract_id: '',
  project_id: '',
  signer_snapshot: null
};

export default function PrintVoucherScreen({ month, user }) {
  const voucherDocumentRef = useRef(null);
  const [mode, setMode] = useState('create');
  const [txType, setTxType] = useState('Chi');
  const [transactions, setTransactions] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [printSearch, setPrintSearch] = useState('');
  const [activeAdvances, setActiveAdvances] = useState([]);
  const [selectedAdvanceId, setSelectedAdvanceId] = useState('');

  const currentUserName = user?.full_name || user?.name || user?.username || '';
  const [form, setForm] = useState({ ...emptyForm, created_by: currentUserName });

  const [contracts, setContracts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { addToast } = useToast();

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [rTx, rAdv, rC, rP, rDept] = await Promise.allSettled([
        apiFetch(`${API}/api/finance/cashflow`),
        apiFetch(`${API}/api/finance/advance`),
        apiFetch(`${API}/api/finance/contracts`),
        apiFetch(`${API}/api/finance/projects`),
        apiFetch(`${API}/api/finance/departments`)
      ]);
      if (rTx.status === 'fulfilled' && Array.isArray(rTx.value)) setTransactions(rTx.value);
      if (rAdv.status === 'fulfilled' && Array.isArray(rAdv.value)) setActiveAdvances(rAdv.value);
      if (rC.status === 'fulfilled') setContracts(Array.isArray(rC.value) ? rC.value : rC.value?.data || []);
      if (rP.status === 'fulfilled') setProjects(Array.isArray(rP.value) ? rP.value : rP.value?.data || []);
      if (rDept.status === 'fulfilled' && Array.isArray(rDept.value)) setDepartments(rDept.value);
      if (isRefresh) addToast('Đã làm mới danh sách chứng từ', 'info');
    } catch {
      addToast('Lỗi kết nối khi tải dữ liệu chứng từ', 'error');
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRefresh = () => {
    loadAll(true);
  };

  useEffect(() => {
    if (mode === 'create') {
      const fetchNextId = async () => {
        try {
          const d = await apiFetch(`${API}/api/finance/next-voucher-id?type=${txType}`);
          setForm({
            ...emptyForm,
            // Giữ mọi input ở trạng thái controlled kể cả khi API trả payload
            // thiếu next_id (ví dụ mock/instance cũ đang trả { data: [] }).
            id: d.next_id || '',
            created_by: currentUserName,
            transaction_date: getTodayIso(),
            category: txType === 'Tạm ứng' ? 'Tạm ứng kinh phí' : (txType === 'Hoàn ứng' ? 'Quyết toán tạm ứng' : 'Khác'),
            payment_method: txType === 'Tạm ứng' ? 'Tạm ứng' : 'BANK_TRANSFER'
          });
        } catch { }
      };
      fetchNextId();
    }
  }, [currentUserName, mode, txType]);

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
            payment_method: tx.payment_method || 'BANK_TRANSFER',
            department_code: tx.department_code || '',
            amount: String(tx.amount || ''),
            status: tx.status || 'COMPLETED',
            created_by: tx.created_by_name || tx.signer_snapshot?.creator_name || '',
          accounting: defaultAccounting,
          approved_by: defaultApprovedBy,
          contract_id: tx.contract_id || '',
          project_id: tx.project_id || '',
          signer_snapshot: tx.signer_snapshot || null
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

  const availableProjects = useMemo(() => {
    if (!form.contract_id) return projects;
    return projects.filter(p => p.contract_id === form.contract_id);
  }, [projects, form.contract_id]);

  const handleContractChange = (val) => {
    const matched = val ? projects.filter(p => p.contract_id === val) : [];
    let nextProjectId = form.project_id;
    if (val) {
      if (matched.length === 1) {
        nextProjectId = matched[0].id;
      } else if (matched.length > 1) {
        const stillValid = matched.some(p => p.id === form.project_id);
        if (!stillValid) nextProjectId = '';
      } else {
        nextProjectId = '';
      }
    }
    setForm(prev => ({
      ...prev,
      contract_id: val,
      project_id: nextProjectId
    }));
  };

  const handleProjectChange = (val) => {
    const selectedProj = projects.find(p => p.id === val);
    const parentContractId = selectedProj?.contract_id;
    setForm(prev => ({
      ...prev,
      project_id: val,
      contract_id: parentContractId || prev.contract_id
    }));
  };

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
    } catch {
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
    printElement({
      element: sourceDocument,
      title: `Chứng từ ${voucherInfo.title}`,
      styles: voucherPrintStyles,
      onError: message => addToast(message, 'error'),
    });
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
      let saved;
      const canonicalType = txType === 'Thu' ? 'INCOME' : txType === 'Chi' ? 'EXPENSE' : txType === 'Tạm ứng' ? 'ADVANCE' : 'REIMBURSEMENT';
      const canonicalMethod = form.payment_method === 'Tiền mặt' ? 'CASH' : form.payment_method === 'Chuyển khoản' ? 'BANK_TRANSFER' : form.payment_method;
      const canonicalStatus = form.status === 'Hoàn thành' ? 'COMPLETED' : form.status === 'Chờ duyệt' ? 'PENDING' : form.status;

      if (txType === 'Tạm ứng') {
        saved = await apiFetch(`${API}/api/finance/advance/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: form.project_id || null,
            amount: Number(form.amount),
            payer_payee: form.payer_payee,
            note: form.description,
            payment_method: canonicalMethod
          })
        });
      } else if (txType === 'Hoàn ứng') {
        saved = await apiFetch(`${API}/api/finance/advance/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            advance_id: selectedAdvanceId,
            actual_amount: Number(form.amount),
            note: form.description
          })
        });
      } else {
        saved = await apiFetch(`${API}/api/finance/cashflow/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: canonicalType,
            amount: Number(form.amount),
            category: form.category,
            payer_payee: form.payer_payee,
            payment_method: canonicalMethod,
            contract_id: form.contract_id || null,
            project_id: form.project_id || null,
            created_by: form.created_by,
            approved_by: form.approved_by,
            status: canonicalStatus,
            description: form.description,
            department_code: form.department_code
          })
        });
      }

      addToast('Lưu chứng từ thành công!', 'success');
      await loadAll();
      setMode('print');
      setSelectedId(saved?.id || (saved?.auto_vouchers && saved?.auto_vouchers[0] ? saved?.auto_vouchers[0].id : ''));
    } catch (e) {
      addToast(e.message || 'Lỗi kết nối máy chủ khi lưu chứng từ', 'error');
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
    <div className="print-screen-container">
      {/* Top Bar Navigation */}
      <div className="print-screen-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="print-screen-mode-group">
            <button
              onClick={() => setMode('create')}
              className={`print-screen-mode-btn ${mode === 'create' ? 'is-active' : ''}`}
            >
              <PlusCircle size={17} /> Soạn chứng từ mới
            </button>
            <button
              onClick={() => setMode('print')}
              className={`print-screen-mode-btn ${mode === 'print' ? 'is-active' : ''}`}
            >
              <Printer size={17} /> Xem & In chứng từ
            </button>
          </div>

          {mode === 'create' && (
            <div className="print-screen-type-group">
              {Object.keys(TX_TYPE_META).map(t => {
                const meta = TX_TYPE_META[t];
                const active = txType === t;
                return (
                  <button
                    key={t}
                    onClick={() => setTxType(t)}
                    className="print-screen-type-btn"
                    style={{
                      background: active ? meta.color : 'transparent',
                      color: active ? '#ffffff' : undefined,
                      fontWeight: active ? 700 : 600,
                      boxShadow: active ? `0 2px 8px ${meta.color}40` : 'none'
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
            className="print-screen-btn-secondary"
            title="Tải lại danh sách"
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            Làm mới
          </button>
          <button
            onClick={handlePrint}
            className="print-screen-btn-primary"
          >
            <Printer size={16} /> In chứng từ (Print/PDF)
          </button>
        </div>
      </div>

      <div className={`print-screen-grid ${mode === 'print' ? 'print-screen-grid--with-sidebar' : ''}`}>

        {/* Sidebar Chọn Phiếu Để In */}
        {mode === 'print' && (
          <div className="print-screen-sidebar">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 className="print-screen-sidebar-title">
                <span>Danh sách chứng từ</span>
              </h3>
              <span className="print-screen-badge">
                {printList.length}
              </span>
            </div>
            <input
              type="text"
              placeholder="Tìm mã phiếu, người nhận/nộp..."
              value={printSearch}
              onChange={e => setPrintSearch(e.target.value)}
              className="print-screen-search-input"
            />
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {printList.map(t => (
                <div
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`print-screen-list-item ${selectedId === t.id ? 'is-selected' : ''}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span style={{ fontFamily: 'monospace' }}>{t.id}</span>
                    <span style={{ color: (t.type === 'INCOME' || t.type === 'Thu') ? 'var(--green-500, #10b981)' : 'var(--red-500, #ef4444)' }}>
                      {(t.type === 'INCOME' || t.type === 'Thu') ? '+' : '-'}{fmtShort(t.amount)}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-tertiary, #64748b)', fontSize: '0.78rem', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
            <div className="print-screen-form-card">
              {/* Header của Form Soạn Thảo */}
              <div className="print-screen-form-header">
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
                    <h3 className="print-screen-form-title">
                      SOẠN THẢO {TX_TYPE_META[txType].title}
                    </h3>
                    <p className="print-screen-form-subtitle">
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
                  background: 'rgba(124, 58, 237, 0.08)',
                  borderRadius: 12,
                  border: '1.5px solid var(--border-subtle, #ddd6fe)',
                  boxShadow: '0 2px 6px rgba(124,58,237,0.04)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#8b5cf6', fontWeight: 800, fontSize: '0.9rem' }}>
                    <Sparkles size={18} />
                    <span>CHỌN CHỨNG TỪ TẠM ỨNG CẦN QUYẾT TOÁN:</span>
                  </div>
                  <Select
                    value={selectedAdvanceId}
                    onChange={(advId) => {
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
                    options={[
                      { value: '', label: '-- Nhấp để chọn phiếu tạm ứng --' },
                      ...filteredAdvances.map(a => ({
                        value: a.id,
                        label: `${a.id} — ${a.partner || a.payer_payee} (${Number(a.amount || 0).toLocaleString('vi-VN')}₫) — ${a.note || a.description || 'Không có ghi chú'}`
                      }))
                    ]}
                    placeholder="-- Nhấp để chọn phiếu tạm ứng --"
                  />
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
                    <label className="print-screen-label">
                      <FileText size={14} style={{ color: 'var(--text-tertiary, #64748b)' }} /> Mã số phiếu (ID) <span style={{ color: 'var(--red-500, #ef4444)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={form.id}
                      readOnly
                      className="print-screen-input print-screen-input-readonly"
                      style={{
                        fontWeight: 800,
                        fontFamily: 'monospace',
                        fontSize: '0.95rem'
                      }}
                    />
                  </div>

                  {/* Cột 2: Ngày lập */}
                  <div>
                    <label className="print-screen-label">
                      <Calendar size={14} style={{ color: 'var(--text-tertiary, #64748b)' }} /> Ngày lập chứng từ <span style={{ color: 'var(--red-500, #ef4444)' }}>*</span>
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
                    <label className="print-screen-label">
                      <User size={14} style={{ color: 'var(--text-tertiary, #64748b)' }} /> {voucherInfo.labelPerson} <span style={{ color: 'var(--red-500, #ef4444)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={form.payer_payee}
                      onChange={e => setForm({ ...form, payer_payee: e.target.value })}
                      placeholder="Nhập họ tên đối tác / nhân viên..."
                      required
                      className="print-screen-input"
                    />
                  </div>

                  {/* Hàng 2 - Cột 1: Hạng mục thu chi */}
                  <div>
                    <label className="print-screen-label">
                      <Briefcase size={14} style={{ color: 'var(--text-tertiary, #64748b)' }} /> Hạng mục thu chi <span style={{ color: 'var(--red-500, #ef4444)' }}>*</span>
                    </label>
                    <Select
                      value={form.category}
                      onChange={v => {
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
                      options={CATEGORY_OPTIONS}
                      placeholder="Chọn hạng mục thu chi"
                    />
                  </div>

                  {/* Hàng 2 - Cột 2: Hình thức thanh toán */}
                  <div>
                    <label className="print-screen-label">
                      <CreditCard size={14} style={{ color: 'var(--text-tertiary, #64748b)' }} /> Hình thức thanh toán <span style={{ color: 'var(--red-500, #ef4444)' }}>*</span>
                    </label>
                    <Select
                      value={form.payment_method}
                      onChange={val => setForm(prev => ({ ...prev, payment_method: val }))}
                      options={METHOD_OPTIONS}
                      placeholder="Chọn hình thức thanh toán"
                    />
                  </div>

                  {/* Hàng 2 - Cột 3: Số tiền phát sinh */}
                  <div>
                    <label className="print-screen-label">
                      <DollarSign size={14} style={{ color: TX_TYPE_META[txType].color }} /> Số tiền phát sinh (VNĐ) <span style={{ color: 'var(--red-500, #ef4444)' }}>*</span>
                    </label>
                    <input
                      type="number"
                      value={form.amount}
                      onChange={e => setForm({ ...form, amount: e.target.value })}
                      placeholder="0"
                      min="1"
                      required
                      className="print-screen-input"
                      style={{
                        borderColor: `${TX_TYPE_META[txType].color}60`,
                        fontWeight: 800,
                        fontSize: '1.1rem',
                        color: TX_TYPE_META[txType].color
                      }}
                    />
                    {/* Nút cộng tiền nhanh */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {[1000000, 2000000, 5000000, 10000000].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleQuickAddAmount(val)}
                          className="print-screen-btn-secondary"
                          style={{
                            height: 24,
                            padding: '0 8px',
                            fontSize: '0.72rem',
                            borderRadius: 4
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
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: 'var(--red-500, #ef4444)',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '2px 8px',
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
                    <label className="print-screen-label">
                      <FolderOpen size={14} style={{ color: 'var(--text-tertiary, #64748b)' }} /> Liên kết Mã Hợp Đồng
                    </label>
                    <Select
                      value={form.contract_id}
                      onChange={handleContractChange}
                      options={[
                        { value: '', label: '-- Không liên kết HĐ --' },
                        ...contracts.map(c => ({
                          value: c.id || c.contract_id,
                          label: `${c.id || c.contract_id} — ${c.customer_name || 'Khách hàng'}`
                        }))
                      ]}
                      placeholder="-- Không liên kết HĐ --"
                    />
                    {form.contract_id && (
                      <span className={`print-screen-link-hint ${availableProjects.length > 0 ? 'is-linked' : ''}`}>
                        {availableProjects.length > 0
                          ? `✓ Khớp ${availableProjects.length} hồ sơ thuộc HĐ này`
                          : 'ℹ Hợp đồng chưa có hồ sơ kỹ thuật'}
                      </span>
                    )}
                  </div>

                  {/* Hàng 3 - Cột 2: Mã Hồ Sơ / Dự Án */}
                  <div>
                    <label className="print-screen-label">
                      <Briefcase size={14} style={{ color: 'var(--text-tertiary, #64748b)' }} /> Liên kết Mã Hồ Sơ / Dự Án
                    </label>
                    <Select
                      value={form.project_id}
                      onChange={handleProjectChange}
                      options={[
                        { value: '', label: form.contract_id ? '-- Chọn hồ sơ thuộc HĐ đã chọn --' : '-- Không liên kết Hồ sơ --' },
                        ...availableProjects.map(p => ({
                          value: p.id,
                          label: p.label || 'Hồ sơ kỹ thuật chưa có mã'
                        }))
                      ]}
                      placeholder={form.contract_id ? '-- Chọn hồ sơ thuộc HĐ --' : '-- Không liên kết Hồ sơ --'}
                    />
                    {form.project_id && (
                      <span className="print-screen-link-hint is-linked">
                        ✓ Đã liên kết hồ sơ kỹ thuật
                      </span>
                    )}
                  </div>

                  {/* Hàng 3 - Cột 3: Phòng ban thụ hưởng */}
                  <div>
                    <label className="print-screen-label">
                      <Building2 size={14} style={{ color: 'var(--text-tertiary, #64748b)' }} /> Phòng ban thụ hưởng
                    </label>
                    <Select
                      value={form.department_code}
                      onChange={val => setForm(prev => ({ ...prev, department_code: val }))}
                      options={[
                        { value: '', label: '-- Chọn phòng ban --' },
                        ...departmentOptions
                      ]}
                      placeholder="-- Chọn phòng ban --"
                    />
                  </div>
                </div>

                {/* Tiền bằng chữ realtime badge */}
                {amountInWords && (
                  <div style={{
                    marginBottom: 16,
                    padding: '8px 14px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 8,
                    color: 'var(--green-500, #10b981)',
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

                {/* Diễn giải chi tiết */}
                <div style={{ marginBottom: 20 }}>
                  <label className="print-screen-label">
                    <FileText size={14} style={{ color: 'var(--text-tertiary, #64748b)' }} /> Diễn giải chi tiết <span style={{ color: 'var(--red-500, #ef4444)' }}>*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Nội dung diễn giải chi tiết cho chứng từ..."
                    required
                    className="print-screen-textarea"
                  />
                </div>

                {needsLinkWarning && (
                  <div style={{
                    marginBottom: 18,
                    padding: '12px 16px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 10,
                    color: 'var(--red-500, #ef4444)',
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle, #f1f5f9)' }}>
                  <button
                    type="submit"
                    disabled={loading}
                    className="print-screen-btn-primary"
                    style={{
                      padding: '0 28px',
                      height: 44,
                      fontSize: '0.95rem',
                      background: loading ? 'var(--text-tertiary)' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
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
          <div className="print-screen-preview-card">
            <div className="no-print print-screen-preview-head">
              <span className="print-screen-preview-label">
                BẢN XEM TRƯỚC MẪU IN (A4)
              </span>
              <button
                type="button"
                onClick={handlePrint}
                className="no-print print-screen-btn-secondary"
                style={{ height: 32, padding: '0 12px' }}
              >
                <Printer size={15} /> In nhanh
              </button>
            </div>

            <p className="no-print print-screen-preview-hint" role="note">
              Trên màn hình hẹp, vuốt ngang để xem đủ khổ A4.
            </p>
            <div className="print-screen-preview-scroll">
              <VoucherTemplate
                title={voucherInfo.title}
                voucherId={form.id}
                date={form.transaction_date}
                personName={form.payer_payee}
                labelPerson={voucherInfo.labelPerson}
                description={form.description}
                amount={form.amount}
                amountWords={amountInWords}
                creatorName={form.created_by || form.signer_snapshot?.creator_name || currentUserName}
                category={form.category}
                paymentMethod={form.payment_method}
                department={form.department_code}
                contractId={form.contract_id}
                projectId={projects.find(project => project.id === form.project_id)?.label || (form.project_id ? 'Hồ sơ đã liên kết' : '')}
                accounting={form.accounting}
                signerSnapshot={form.signer_snapshot}
                documentRef={voucherDocumentRef}
              />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
