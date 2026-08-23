import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DatePicker, Select } from '../../ui';
import { fmt, parseAmt, getLocalISOTime } from '../utils';
import { API } from '../financeConstants';
import { apiFetch } from '../../../lib/api';
import {
  CheckCircle2, AlertTriangle, PlusCircle, SlidersHorizontal,
  Wallet, Building2, History, ShieldCheck, RefreshCw,
  ReceiptText, HandCoins, Save, Clock, UserCheck, Lock, ShieldAlert,
  CalendarDays, CalendarCheck2, Banknote
} from 'lucide-react';
import './SettingsScreen.css';
import { DEFAULT_DOCUMENT_SIGNERS, normalizeDocumentSigners } from '../print/documentSigners';

const EXPENSE_PRESETS = [1_000_000, 2_000_000, 5_000_000, 10_000_000];
const ADVANCE_PRESETS = [2_000_000, 5_000_000, 10_000_000, 20_000_000];

export default function SettingsScreen({ user = null, isDirector: _isDirector = false }) {
  const [reconcileMoment, setReconcileMoment] = useState(getLocalISOTime());
  const [systemCashBalance, setSystemCashBalance] = useState(0);
  const [actualCashBalance, setActualCashBalance] = useState('');
  const [cashNote, setCashNote] = useState('');

  const [systemBankBalance, setSystemBankBalance] = useState(0);
  const [actualBankBalance, setActualBankBalance] = useState('');
  const [bankNote, setBankNote] = useState('');

  const [reconciledBy, setReconciledBy] = useState(
    user?.full_name || user?.name || ''
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterMonth, setFilterMonth] = useState('');
  const [thresholds, setThresholds] = useState({
    expense_approval_threshold: 2000000,
    advance_admin_threshold: 5000000
  });
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [payrollPolicy, setPayrollPolicy] = useState({
    payroll_cycle_type: 'CALENDAR_MONTH',
    payroll_cutoff_day: 20,
    payroll_payment_day: 5
  });
  const [savingPayrollPolicy, setSavingPayrollPolicy] = useState(false);
  const [documentSigners, setDocumentSigners] = useState(DEFAULT_DOCUMENT_SIGNERS);
  const [savingDocumentSigners, setSavingDocumentSigners] = useState(false);
  const { addToast } = useToast();

  const filteredHistory = useMemo(() => {
    if (!filterMonth) return history;
    const [filterYear, filterMonthNum] = filterMonth.split('-');
    return history.filter((row) => {
      const dateVal = row.effective_date;
      if (!dateVal) return false;
      const parts = dateVal.split(' ')[0].split('/');
      if (parts.length < 3) return false;
      const [, m, y] = parts;
      return y === filterYear && m === filterMonthNum;
    });
  }, [history, filterMonth]);

  const fetchSettings = useCallback(async () => {
    try {
      const d = await apiFetch(`${API}/api/finance/settings`);
      setThresholds({
        expense_approval_threshold: d.expense_approval_threshold ?? 2000000,
        advance_admin_threshold: d.advance_admin_threshold ?? 5000000
      });
      setPayrollPolicy({
        payroll_cycle_type: d.payroll_cycle_type || 'CALENDAR_MONTH',
        payroll_cutoff_day: d.payroll_cutoff_day ?? 20,
        payroll_payment_day: d.payroll_payment_day ?? 5
      });
    } catch (e) {
      console.error('Lỗi lấy cấu hình tài chính', e);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const fetchDocumentSigners = useCallback(async () => {
    try {
      const data = await apiFetch(`${API}/api/finance/document-signers`);
      setDocumentSigners(normalizeDocumentSigners(data));
    } catch (e) {
      console.error('Lỗi lấy cấu hình người ký chứng từ', e);
    }
  }, []);

  useEffect(() => {
    fetchDocumentSigners();
  }, [fetchDocumentSigners]);

  const handleSaveThresholds = async () => {
    setSavingThresholds(true);
    try {
      await apiFetch(`${API}/api/finance/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expense_approval_threshold: thresholds.expense_approval_threshold,
          advance_admin_threshold: thresholds.advance_admin_threshold
        })
      });
      addToast('Giám đốc đã lưu cấu hình ngưỡng tài chính thành công!', 'success');
    } catch {
      addToast('Lỗi kết nối máy chủ khi lưu ngưỡng tài chính', 'error');
    } finally {
      setSavingThresholds(false);
    }
  };

  const handleSavePayrollPolicy = async () => {
    setSavingPayrollPolicy(true);
    try {
      await apiFetch(`${API}/api/finance/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payroll_cycle_type: payrollPolicy.payroll_cycle_type,
          payroll_cutoff_day: Number(payrollPolicy.payroll_cutoff_day || 20),
          payroll_payment_day: Number(payrollPolicy.payroll_payment_day || 5)
        })
      });
      addToast('Giám đốc đã lưu cấu hình chu kỳ tính lương thành công!', 'success');
    } catch {
      addToast('Lỗi kết nối máy chủ khi lưu cấu hình chu kỳ tính lương', 'error');
    } finally {
      setSavingPayrollPolicy(false);
    }
  };

  const handleSaveDocumentSigners = async () => {
    setSavingDocumentSigners(true);
    try {
      const saved = await apiFetch(`${API}/api/finance/document-signers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizeDocumentSigners(documentSigners))
      });
      setDocumentSigners(normalizeDocumentSigners(saved));
      addToast('Đã lưu cấu hình người ký chứng từ!', 'success');
    } catch (e) {
      addToast(e.message || 'Lỗi lưu cấu hình người ký chứng từ', 'error');
    } finally {
      setSavingDocumentSigners(false);
    }
  };

  const fetchSystemBalance = useCallback(async (closingMoment = reconcileMoment) => {
    setLoading(true);
    try {
      const isoString = new Date(closingMoment).toISOString();
      const res = await apiFetch(`${API}/api/finance/fund-balances/calculate?closing_date=${encodeURIComponent(isoString)}`);
      setSystemCashBalance(res?.cash_balance ?? res?.system_balance ?? 0);
      setSystemBankBalance(res?.bank_balance ?? 0);
    } catch {
      console.error('Lỗi kết nối API tính số dư');
    } finally {
      setLoading(false);
    }
  }, [reconcileMoment]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const d = await apiFetch(`${API}/api/finance/fund-balances/history`);
      setHistory(Array.isArray(d) ? d : []);
    } catch (e) {
      console.error('Lỗi lấy lịch sử chốt quỹ', e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Tải song song toàn bộ dữ liệu khi khởi tạo để tối ưu tốc độ
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setLoadingHistory(true);
    try {
      const isoString = new Date(reconcileMoment).toISOString();
      const [balRes, histRes, settingsRes] = await Promise.allSettled([
        apiFetch(`${API}/api/finance/fund-balances/calculate?closing_date=${encodeURIComponent(isoString)}`),
        apiFetch(`${API}/api/finance/fund-balances/history`),
        apiFetch(`${API}/api/finance/settings`)
      ]);

      if (balRes.status === 'fulfilled' && balRes.value) {
        setSystemCashBalance(balRes.value.cash_balance ?? balRes.value.system_balance ?? 0);
        setSystemBankBalance(balRes.value.bank_balance ?? 0);
      }
      if (histRes.status === 'fulfilled' && Array.isArray(histRes.value)) {
        setHistory(histRes.value);
      }
      if (settingsRes.status === 'fulfilled' && settingsRes.value) {
        setThresholds({
          expense_approval_threshold: settingsRes.value.expense_approval_threshold ?? 2000000,
          advance_admin_threshold: settingsRes.value.advance_admin_threshold ?? 5000000
        });
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu tài chính', err);
    } finally {
      setLoading(false);
      setLoadingHistory(false);
    }
  }, [reconcileMoment]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const numActualCash = actualCashBalance === '' ? 0 : parseAmt(actualCashBalance);
  const diffCash = actualCashBalance === '' ? 0 : numActualCash - systemCashBalance;

  const numActualBank = actualBankBalance === '' ? 0 : parseAmt(actualBankBalance);
  const diffBank = actualBankBalance === '' ? 0 : numActualBank - systemBankBalance;

  const formatInputDisplay = (val) => {
    if (val === '') return '';
    return Number(val).toLocaleString('vi-VN');
  };

  const getDiscrepancyMeta = (diff, hasInput) => {
    if (!hasInput) {
      return {
        variant: 'empty',
        msg: 'Chưa nhập số thực tế',
        icon: null
      };
    }
    if (diff === 0) {
      return {
        variant: 'match',
        msg: 'Khớp quỹ hoàn toàn (Không lệch)',
        icon: 'check'
      };
    }
    if (diff < 0) {
      return {
        variant: 'deficit',
        msg: 'Thiếu hụt (Tự động sinh Phiếu Chi bù quỹ)',
        icon: 'alert'
      };
    }
    return {
      variant: 'surplus',
      msg: 'Dư thừa (Tự động sinh Phiếu Thu nạp quỹ)',
      icon: 'plus'
    };
  };

  const discrepancyMetaCash = getDiscrepancyMeta(diffCash, actualCashBalance !== '');
  const discrepancyMetaBank = getDiscrepancyMeta(diffBank, actualBankBalance !== '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (actualCashBalance === '' && actualBankBalance === '') {
      addToast('Vui lòng nhập ít nhất một số dư thực tế để chốt quỹ!', 'warning');
      return;
    }
    if (actualCashBalance !== '' && diffCash !== 0 && !cashNote.trim()) {
      addToast('Bắt buộc phải nhập giải trình lý do chênh lệch cho Quỹ Tiền Mặt!', 'warning');
      return;
    }
    if (actualBankBalance !== '' && diffBank !== 0 && !bankNote.trim()) {
      addToast('Bắt buộc phải nhập giải trình lý do chênh lệch cho Quỹ Chuyển Khoản!', 'warning');
      return;
    }

    setSaving(true);
    try {
      const promises = [];
      const isoString = new Date(reconcileMoment).toISOString();

      if (actualCashBalance !== '') {
        promises.push(
          apiFetch(`${API}/api/finance/fund-balances/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payment_method: 'CASH',
              actual_amount: numActualCash,
              closing_date: isoString,
              notes: cashNote,
              closing_user: reconciledBy
            })
          })
        );
      }

      if (actualBankBalance !== '') {
        promises.push(
          apiFetch(`${API}/api/finance/fund-balances/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payment_method: 'BANK_TRANSFER',
              actual_amount: numActualBank,
              closing_date: isoString,
              notes: bankNote,
              closing_user: reconciledBy
            })
          })
        );
      }

      await Promise.all(promises);
      addToast('Xác nhận chốt quỹ và thiết lập đầu kỳ mới thành công!', 'success');
      setActualCashBalance('');
      setCashNote('');
      setActualBankBalance('');
      setBankNote('');
      fetchSystemBalance();
      fetchHistory();
    } catch {
      addToast('Lỗi kết nối máy chủ khi chốt quỹ', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fin-settings">
      <div className="fin-settings__card">
        {/* Header */}
        <div className="fin-settings__header">
          <div className="fin-settings__header-badge">
            <SlidersHorizontal size={14} /> Quản Trị Tài Chính Doanh Nghiệp
          </div>
          <h3 className="fin-settings__title">
            BIÊN BẢN CHỐT QUỸ & ĐỐI CHIẾU TÀI CHÍNH
          </h3>
          <p className="fin-settings__subtitle">
            Kiểm kê và đối chiếu số dư thực tế đếm tay hoặc ứng dụng ngân hàng với sổ sách hệ thống để thiết lập mốc số dư đầu kỳ mới cho từng quỹ riêng biệt.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Khối 1: Cấu hình Thiết Lập */}
          <div className="fin-settings__top-bar">
            <div>
              <label className="fin-settings__field-label">
                <span>Mốc thời gian chốt</span>
                {loading && <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'none' }}>Đang tính lại số dư...</span>}
              </label>
              <div className="fin-settings__time-row">
                <DatePicker
                  value={reconcileMoment.slice(0, 10)}
                  onChange={(value) => {
                    if (!value) return;
                    const nextClosingMoment = `${value}T${reconcileMoment.slice(11, 16) || '00:00'}`;
                    setReconcileMoment(nextClosingMoment);
                    setActualCashBalance('');
                    setActualBankBalance('');
                    fetchSystemBalance(nextClosingMoment);
                  }}
                  placeholder="Chọn ngày chốt"
                  dialogLabel="Chọn ngày chốt quỹ"
                  clearable={false}
                  className="date-picker--fill"
                  placement="bottom"
                />
                <input
                  type="time"
                  aria-label="Giờ chốt quỹ"
                  className="fin-settings__time-input"
                  value={reconcileMoment.slice(11, 16)}
                  onChange={(e) => {
                    const nextClosingMoment = `${reconcileMoment.slice(0, 10)}T${e.target.value}`;
                    setReconcileMoment(nextClosingMoment);
                    setActualCashBalance('');
                    setActualBankBalance('');
                    fetchSystemBalance(nextClosingMoment);
                  }}
                  required
                />
              </div>
            </div>
            <div>
              <label className="fin-settings__field-label">
                <span>Người thực hiện chốt</span>
              </label>
              <input
                type="text"
                className="fin-settings__text-input"
                value={reconciledBy}
                onChange={(e) => setReconciledBy(e.target.value)}
                placeholder="Nhập họ tên người chốt..."
                required
              />
            </div>
          </div>

          {/* Khối 2: Hai Cột Quỹ song song */}
          <div className="fin-settings__funds-grid">
            {/* Quỹ Tiền Mặt */}
            <div className="fin-fund-card fin-fund-card--cash">
              <div className="fin-fund-card__head">
                <h4 className="fin-fund-card__title">
                  <Wallet size={20} color="#10b981" /> Quỹ Tiền Mặt (Két Sắt)
                </h4>
                <span className="fin-fund-card__tag fin-fund-card__tag--cash">
                  <Wallet size={12} /> Tiền mặt
                </span>
              </div>

              {/* Số dư hệ thống */}
              <div className="fin-fund-card__sys-box">
                <span className="fin-fund-card__sys-label">Số dư hệ thống ghi nhận</span>
                <div className="fin-fund-card__sys-val">
                  {loading ? 'Đang tải...' : `${systemCashBalance.toLocaleString('vi-VN')}₫`}
                </div>
              </div>

              {/* Số dư thực tế kiểm kê */}
              <div className="fin-fund-card__input-box">
                <div className="fin-fund-card__input-label">
                  <span>Số dư thực tế kiểm đếm</span>
                  <span className="req">*</span>
                </div>
                <div className="fin-fund-card__input-wrap">
                  <input
                    type="text"
                    className="fin-fund-card__amount-input"
                    value={formatInputDisplay(actualCashBalance)}
                    onChange={(e) => setActualCashBalance(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="0"
                  />
                  <span className="fin-fund-card__currency">₫</span>
                </div>
              </div>

              {/* Chênh lệch */}
              <div className={`fin-fund-card__diff-box fin-fund-card__diff-box--${discrepancyMetaCash.variant}`}>
                <span className="fin-fund-card__diff-label">Chênh lệch đối chiếu</span>
                <div className="fin-fund-card__diff-val">
                  {actualCashBalance === ''
                    ? '—'
                    : (diffCash === 0
                      ? '±0₫'
                      : (diffCash > 0
                        ? `+${diffCash.toLocaleString('vi-VN')}₫`
                        : `-${Math.abs(diffCash).toLocaleString('vi-VN')}₫`))}
                </div>
                <div className="fin-fund-card__diff-status">
                  {discrepancyMetaCash.icon === 'check' && <CheckCircle2 size={15} />}
                  {discrepancyMetaCash.icon === 'alert' && <AlertTriangle size={15} />}
                  {discrepancyMetaCash.icon === 'plus' && <PlusCircle size={15} />}
                  <span>{discrepancyMetaCash.msg}</span>
                </div>
              </div>

              {/* Giải trình */}
              <div className="fin-fund-card__note-wrap">
                <label className="fin-fund-card__note-label">
                  <span>Giải trình chênh lệch</span>
                  {actualCashBalance !== '' && diffCash !== 0 && (
                    <span className="req-tag">Bắt buộc khi có lệch</span>
                  )}
                </label>
                <textarea
                  className="fin-fund-card__textarea"
                  value={cashNote}
                  onChange={(e) => setCashNote(e.target.value)}
                  placeholder={
                    actualCashBalance !== '' && diffCash !== 0
                      ? 'Bắt buộc nhập nguyên nhân chênh lệch két sắt...'
                      : 'Ghi chú kiểm kê két sắt (nếu có)...'
                  }
                  required={actualCashBalance !== '' && diffCash !== 0}
                />
              </div>
            </div>

            {/* Quỹ Chuyển Khoản */}
            <div className="fin-fund-card fin-fund-card--bank">
              <div className="fin-fund-card__head">
                <h4 className="fin-fund-card__title">
                  <Building2 size={20} color="#3b82f6" /> Quỹ Chuyển Khoản (Ngân Hàng)
                </h4>
                <span className="fin-fund-card__tag fin-fund-card__tag--bank">
                  <Building2 size={12} /> Ngân hàng
                </span>
              </div>

              {/* Số dư hệ thống */}
              <div className="fin-fund-card__sys-box">
                <span className="fin-fund-card__sys-label">Số dư hệ thống ghi nhận</span>
                <div className="fin-fund-card__sys-val">
                  {loading ? 'Đang tải...' : `${systemBankBalance.toLocaleString('vi-VN')}₫`}
                </div>
              </div>

              {/* Số dư thực tế kiểm tra App */}
              <div className="fin-fund-card__input-box">
                <div className="fin-fund-card__input-label">
                  <span>Số dư thực tế trên App Bank</span>
                  <span className="req">*</span>
                </div>
                <div className="fin-fund-card__input-wrap">
                  <input
                    type="text"
                    className="fin-fund-card__amount-input"
                    value={formatInputDisplay(actualBankBalance)}
                    onChange={(e) => setActualBankBalance(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="0"
                  />
                  <span className="fin-fund-card__currency">₫</span>
                </div>
              </div>

              {/* Chênh lệch */}
              <div className={`fin-fund-card__diff-box fin-fund-card__diff-box--${discrepancyMetaBank.variant}`}>
                <span className="fin-fund-card__diff-label">Chênh lệch đối chiếu</span>
                <div className="fin-fund-card__diff-val">
                  {actualBankBalance === ''
                    ? '—'
                    : (diffBank === 0
                      ? '±0₫'
                      : (diffBank > 0
                        ? `+${diffBank.toLocaleString('vi-VN')}₫`
                        : `-${Math.abs(diffBank).toLocaleString('vi-VN')}₫`))}
                </div>
                <div className="fin-fund-card__diff-status">
                  {discrepancyMetaBank.icon === 'check' && <CheckCircle2 size={15} />}
                  {discrepancyMetaBank.icon === 'alert' && <AlertTriangle size={15} />}
                  {discrepancyMetaBank.icon === 'plus' && <PlusCircle size={15} />}
                  <span>{discrepancyMetaBank.msg}</span>
                </div>
              </div>

              {/* Giải trình */}
              <div className="fin-fund-card__note-wrap">
                <label className="fin-fund-card__note-label">
                  <span>Giải trình chênh lệch</span>
                  {actualBankBalance !== '' && diffBank !== 0 && (
                    <span className="req-tag">Bắt buộc khi có lệch</span>
                  )}
                </label>
                <textarea
                  className="fin-fund-card__textarea"
                  value={bankNote}
                  onChange={(e) => setBankNote(e.target.value)}
                  placeholder={
                    actualBankBalance !== '' && diffBank !== 0
                      ? 'Bắt buộc nhập nguyên nhân chênh lệch sao kê bank...'
                      : 'Ghi chú kiểm kê app bank (nếu có)...'
                  }
                  required={actualBankBalance !== '' && diffBank !== 0}
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={saving || loading}
            className="fin-settings__submit-btn"
          >
            {saving ? (
              <>
                <RefreshCw size={18} className="animate-spin" /> Đang lưu mốc chốt...
              </>
            ) : (
              <>
                <ShieldCheck size={18} /> Xác Nhận Chốt Quỹ & Thiết Lập Đầu Kỳ Mới
              </>
            )}
          </button>
        </form>

        {/* Khối 3: Lịch sử chốt quỹ */}
        <div className="fin-settings__history-section">
          <div className="fin-settings__history-head">
            <div className="fin-settings__history-title-wrap">
              <h4 className="fin-settings__history-title">
                <History size={20} color="var(--orange-500, #eb4a23)" /> Lịch Sử Chốt Quỹ Trước Đó
              </h4>
              <span className="fin-history-count-badge">
                {filteredHistory.length} đợt ghi nhận
              </span>
            </div>

            <div className="fin-settings__history-controls">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-tertiary, #64748b)' }}>Chọn tháng:</span>
                <DatePicker
                  selectionMode="month"
                  value={filterMonth}
                  onChange={setFilterMonth}
                  placeholder="Chọn tháng"
                  dialogLabel="Chọn tháng lịch sử chốt quỹ"
                />
              </div>
              {filterMonth && (
                <button
                  type="button"
                  onClick={() => setFilterMonth('')}
                  className="fin-settings__clear-filter-btn"
                >
                  Xóa lọc
                </button>
              )}
            </div>
          </div>

          <div className="fin-settings__table-wrap">
            {loadingHistory ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: '#64748b' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                <span>Đang tải lịch sử chốt quỹ...</span>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="fin-history-empty">
                <div className="fin-history-empty__icon">
                  <History size={26} />
                </div>
                <p className="fin-history-empty__title">Chưa có lịch sử chốt quỹ phù hợp</p>
                <p className="fin-history-empty__desc">
                  {filterMonth
                    ? `Không tìm thấy mốc chốt quỹ nào trong tháng ${filterMonth.split('-')[1]}/${filterMonth.split('-')[0]}. Thử chọn tháng khác hoặc bấm "Xóa lọc".`
                    : 'Dữ liệu chốt quỹ và số dư đầu kỳ mới sau khi xác nhận sẽ được lưu vết tự động và thống kê tại đây.'}
                </p>
              </div>
            ) : (
              <table className="fin-settings__table">
                <thead>
                  <tr>
                    <th>Mốc Thời Gian Chốt</th>
                    <th>Hình Thức Quỹ</th>
                    <th style={{ textAlign: 'right' }}>Số Dư Đầu Kỳ Mới</th>
                    <th>Người Thực Hiện</th>
                    <th>Ghi Chú / Giải Trình</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <Clock size={13} color="#64748b" /> {row.effective_date}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`fin-fund-card__tag ${
                            (row.payment_method === 'CASH' || row.payment_method === 'Tiền mặt')
                              ? 'fin-fund-card__tag--cash'
                              : 'fin-fund-card__tag--bank'
                          }`}
                        >
                          {(row.payment_method === 'CASH' || row.payment_method === 'Tiền mặt') ? (
                            <>
                              <Wallet size={12} /> Tiền mặt
                            </>
                          ) : (
                            <>
                              <Building2 size={12} /> Chuyển khoản
                            </>
                          )}
                        </span>
                      </td>
                      <td className="mono-amount">
                        {fmt(row.opening_balance)}
                      </td>
                      <td>
                        <span className="fin-user-tag">
                          <UserCheck size={13} color="#4f46e5" /> {row.closing_user || '—'}
                        </span>
                      </td>
                      <td style={{ color: '#64748b', fontSize: '0.84rem' }}>{row.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Khối 4: Cấu hình người ký chứng từ */}
        <section className="fin-settings__thresholds-section" aria-labelledby="document-signers-title">
          <div className="fin-settings__thresholds-head">
            <div className="fin-settings__thresholds-title-wrap">
              <h4 id="document-signers-title" className="fin-settings__thresholds-title">
                <UserCheck size={18} color="#0ea5e9" /> Người ký chứng từ
              </h4>
              <p className="fin-settings__thresholds-desc">
                Dùng cho phiếu Thu/Chi, sổ quỹ, công nợ và bảng lương. Kế toán có thể để trống khi chưa xác định.
              </p>
            </div>
            <button
              type="button"
              className="fin-settings__save-threshold-btn"
              onClick={handleSaveDocumentSigners}
              disabled={savingDocumentSigners}
            >
              {savingDocumentSigners ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {savingDocumentSigners ? 'Đang lưu...' : 'Lưu người ký'}
            </button>
          </div>

          <div className="fin-settings__thresholds-grid">
            <div className="fin-settings__threshold-box">
              <div className="fin-settings__threshold-head">
                <span className="fin-settings__threshold-title">Giám đốc / Người đại diện</span>
              </div>
              <input
                type="text"
                className="fin-settings__threshold-input"
                value={documentSigners.director_name}
                onChange={e => setDocumentSigners(prev => ({ ...prev, director_name: e.target.value }))}
                placeholder="Lê Văn Sáu"
                maxLength={120}
              />
              <div className="fin-settings__rule-box">
                <div className="fin-settings__rule-item">
                  Tên này được dùng cho ô Giám đốc trên các mẫu in.
                </div>
              </div>
            </div>

            <div className="fin-settings__threshold-box">
              <div className="fin-settings__threshold-head">
                <span className="fin-settings__threshold-title">Kế toán</span>
              </div>
              <input
                type="text"
                className="fin-settings__threshold-input"
                value={documentSigners.accountant_name}
                onChange={e => setDocumentSigners(prev => ({ ...prev, accountant_name: e.target.value }))}
                placeholder="Để trống nếu chưa xác định"
                maxLength={120}
              />
              <div style={{ marginTop: 10 }}>
                <Select
                  value={documentSigners.accountant_role}
                  onChange={value => setDocumentSigners(prev => ({ ...prev, accountant_role: value }))}
                  options={[
                    { value: 'Kế toán trưởng', label: 'Kế toán trưởng' },
                    { value: 'Kế toán phụ trách', label: 'Kế toán phụ trách' },
                  ]}
                  placeholder="Chọn chức danh kế toán"
                />
              </div>
              <div className="fin-settings__rule-box">
                <div className="fin-settings__rule-item">
                  Không tự động điền tên nếu chưa cấu hình.
                </div>
              </div>
            </div>

            <div className="fin-settings__threshold-box">
              <div className="fin-settings__threshold-head">
                <span className="fin-settings__threshold-title">Thủ quỹ</span>
              </div>
              <input
                type="text"
                className="fin-settings__threshold-input"
                value={documentSigners.cashier_name}
                onChange={e => setDocumentSigners(prev => ({ ...prev, cashier_name: e.target.value }))}
                placeholder="Tùy chọn"
                maxLength={120}
              />
            </div>

            <div className="fin-settings__threshold-box">
              <div className="fin-settings__threshold-head">
                <span className="fin-settings__threshold-title">Kế toán tiền lương</span>
              </div>
              <input
                type="text"
                className="fin-settings__threshold-input"
                value={documentSigners.payroll_accountant_name}
                onChange={e => setDocumentSigners(prev => ({ ...prev, payroll_accountant_name: e.target.value }))}
                placeholder="Tùy chọn"
                maxLength={120}
              />
            </div>
          </div>

          <p className="fin-settings__thresholds-desc" style={{ marginTop: 14 }}>
            Không sửa dữ liệu chứng từ đã lưu; bản in dùng cấu hình hiện tại. Không tự xác nhận chữ ký điện tử và không thay thế chữ ký tay.
          </p>
        </section>

        {/* Khối 5: Cấu hình Ngưỡng Tài Chính (Dành cho Giám Đốc) */}
        <div className="fin-settings__thresholds-section">
          <div className="fin-settings__thresholds-head">
            <div>
              <div className="fin-settings__thresholds-title-wrap">
                <h4 className="fin-settings__thresholds-title">
                  <ShieldCheck size={20} color="var(--orange-500, #eb4a23)" /> CẤU HÌNH NGƯỠNG PHÊ DUYỆT TÀI CHÍNH
                </h4>
                <span className="fin-director-pill">
                  <Lock size={11} /> Quyền Giám Đốc
                </span>
              </div>
              <p className="fin-settings__thresholds-desc">
                Thiết lập hạn mức chi tiêu và tạm ứng vượt ngưỡng bắt buộc phải có Giám đốc phê duyệt trực tiếp.
              </p>
            </div>
            <button
              type="button"
              className="fin-settings__save-threshold-btn"
              onClick={handleSaveThresholds}
              disabled={savingThresholds}
            >
              {savingThresholds ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Đang lưu...
                </>
              ) : (
                <>
                  <Save size={15} /> Lưu Cấu Hình Ngưỡng
                </>
              )}
            </button>
          </div>

          <div className="fin-settings__thresholds-grid">
            {/* Card 1: Duyệt chi */}
            <div className="fin-settings__threshold-box">
              <div className="fin-settings__threshold-head">
                <span className="fin-settings__threshold-title">
                  <ReceiptText size={17} color="#e11d48" /> Hạn mức chi tiêu tự động
                </span>
              </div>

              <div className="fin-settings__threshold-input-wrap">
                <input
                  type="text"
                  className="fin-settings__threshold-input"
                  value={Number(thresholds.expense_approval_threshold || 0).toLocaleString('vi-VN')}
                  onChange={(e) =>
                    setThresholds((prev) => ({
                      ...prev,
                      expense_approval_threshold: Number(e.target.value.replace(/[^\d]/g, ''))
                    }))
                  }
                />
                <span className="fin-settings__threshold-currency">₫</span>
              </div>

              {/* Quick presets */}
              <div className="fin-settings__preset-chips">
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Chọn nhanh:</span>
                {EXPENSE_PRESETS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`fin-settings__preset-chip ${thresholds.expense_approval_threshold === val ? 'is-active' : ''}`}
                    onClick={() => setThresholds((prev) => ({ ...prev, expense_approval_threshold: val }))}
                  >
                    {val >= 1_000_000 ? `${val / 1_000_000}tr` : val.toLocaleString('vi-VN')}
                  </button>
                ))}
              </div>

              {/* Rule box */}
              <div className="fin-settings__rule-box">
                <div className="fin-settings__rule-item">
                  <CheckCircle2 size={13} color="#10b981" />
                  <span>
                    Chi tiêu <strong>≤ {fmt(thresholds.expense_approval_threshold || 0)}</strong>: Kế toán duyệt tự động
                  </span>
                </div>
                <div className="fin-settings__rule-item">
                  <ShieldAlert size={13} color="#ef4444" />
                  <span>
                    Chi tiêu <strong>&gt; {fmt(thresholds.expense_approval_threshold || 0)}</strong>: Bắt buộc Giám đốc duyệt
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Tạm ứng */}
            <div className="fin-settings__threshold-box">
              <div className="fin-settings__threshold-head">
                <span className="fin-settings__threshold-title">
                  <HandCoins size={17} color="#0284c7" /> Hạn mức tạm ứng nội bộ
                </span>
              </div>

              <div className="fin-settings__threshold-input-wrap">
                <input
                  type="text"
                  className="fin-settings__threshold-input"
                  value={Number(thresholds.advance_admin_threshold || 0).toLocaleString('vi-VN')}
                  onChange={(e) =>
                    setThresholds((prev) => ({
                      ...prev,
                      advance_admin_threshold: Number(e.target.value.replace(/[^\d]/g, ''))
                    }))
                  }
                />
                <span className="fin-settings__threshold-currency">₫</span>
              </div>

              {/* Quick presets */}
              <div className="fin-settings__preset-chips">
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Chọn nhanh:</span>
                {ADVANCE_PRESETS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`fin-settings__preset-chip ${thresholds.advance_admin_threshold === val ? 'is-active' : ''}`}
                    onClick={() => setThresholds((prev) => ({ ...prev, advance_admin_threshold: val }))}
                  >
                    {val >= 1_000_000 ? `${val / 1_000_000}tr` : val.toLocaleString('vi-VN')}
                  </button>
                ))}
              </div>

              {/* Rule box */}
              <div className="fin-settings__rule-box">
                <div className="fin-settings__rule-item">
                  <CheckCircle2 size={13} color="#10b981" />
                  <span>
                    Tạm ứng <strong>≤ {fmt(thresholds.advance_admin_threshold || 0)}</strong>: Duyệt cấp phòng ban &amp; Kế toán
                  </span>
                </div>
                <div className="fin-settings__rule-item">
                  <ShieldAlert size={13} color="#ef4444" />
                  <span>
                    Tạm ứng <strong>&gt; {fmt(thresholds.advance_admin_threshold || 0)}</strong>: Yêu cầu Giám đốc thẩm định
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Khối 5: Cấu hình Chu kỳ Tính Lương & Ngày Chốt Công (Dành cho Giám Đốc) */}
        <div className="fin-settings__thresholds-section" style={{ marginTop: 24 }}>
          <div className="fin-settings__thresholds-head">
            <div>
              <div className="fin-settings__thresholds-title-wrap">
                <h4 className="fin-settings__thresholds-title">
                  <Banknote size={20} color="#8b5cf6" /> CẤU HÌNH CHU KỲ TÍNH LƯƠNG &amp; NGÀY CHỐT CÔNG
                </h4>
                <span className="fin-director-pill" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', borderColor: 'rgba(139, 92, 246, 0.3)' }}>
                  <Lock size={11} /> Quyền Giám Đốc
                </span>
              </div>
              <p className="fin-settings__thresholds-desc">
                Quy định mốc thời gian bắt đầu – kết thúc kỳ tính lương và ngày chi trả lương dự kiến áp dụng cho toàn công ty.
              </p>
            </div>
            <button
              type="button"
              className="fin-settings__save-threshold-btn"
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' }}
              onClick={handleSavePayrollPolicy}
              disabled={savingPayrollPolicy}
            >
              {savingPayrollPolicy ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Đang lưu...
                </>
              ) : (
                <>
                  <Save size={15} /> Lưu Chính Sách Kỳ Lương
                </>
              )}
            </button>
          </div>

          <div className="fin-settings__thresholds-grid">
            {/* Card 1: Chọn Chế độ Chu Kỳ */}
            <div className="fin-settings__threshold-box">
              <div className="fin-settings__threshold-head">
                <span className="fin-settings__threshold-title">
                  <CalendarDays size={17} color="#8b5cf6" /> Phương thức xác định kỳ lương
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: payrollPolicy.payroll_cycle_type === 'CALENDAR_MONTH' ? '2px solid #8b5cf6' : '1px solid var(--border-subtle, #e2e8f0)',
                  background: payrollPolicy.payroll_cycle_type === 'CALENDAR_MONTH' ? 'rgba(139, 92, 246, 0.06)' : 'transparent',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="payroll_cycle_type"
                    checked={payrollPolicy.payroll_cycle_type === 'CALENDAR_MONTH'}
                    onChange={() => setPayrollPolicy(p => ({ ...p, payroll_cycle_type: 'CALENDAR_MONTH' }))}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Theo tháng dương lịch chuẩn</strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary, #64748b)' }}>
                      Tính trọn vẹn từ ngày 01 đến ngày cuối cùng của tháng (01/MM – hết tháng).
                    </span>
                  </div>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: payrollPolicy.payroll_cycle_type === 'CUSTOM_CUTOFF' ? '2px solid #8b5cf6' : '1px solid var(--border-subtle, #e2e8f0)',
                  background: payrollPolicy.payroll_cycle_type === 'CUSTOM_CUTOFF' ? 'rgba(139, 92, 246, 0.06)' : 'transparent',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="payroll_cycle_type"
                    checked={payrollPolicy.payroll_cycle_type === 'CUSTOM_CUTOFF'}
                    onChange={() => setPayrollPolicy(p => ({ ...p, payroll_cycle_type: 'CUSTOM_CUTOFF' }))}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Theo ngày chốt công định kỳ (Cut-off Cycle)</strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary, #64748b)' }}>
                      Chốt vào một ngày cố định hàng tháng (ví dụ: ngày 20, 25) để kịp tổng hợp và trả lương.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Card 2: Ngày Chốt & Ngày Trả Lương */}
            <div className="fin-settings__threshold-box">
              <div className="fin-settings__threshold-head">
                <span className="fin-settings__threshold-title">
                  <CalendarCheck2 size={17} color="#0284c7" /> Thiết lập ngày chốt &amp; ngày chi trả
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                {payrollPolicy.payroll_cycle_type === 'CUSTOM_CUTOFF' && (
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>
                      Ngày kết thúc kỳ lương hàng tháng (Cut-off Day):
                    </label>
                    <div className="fin-settings__threshold-input-wrap">
                      <input
                        type="number"
                        min="1"
                        max="28"
                        className="fin-settings__threshold-input"
                        value={payrollPolicy.payroll_cutoff_day}
                        onChange={(e) => setPayrollPolicy(p => ({ ...p, payroll_cutoff_day: Math.min(28, Math.max(1, Number(e.target.value) || 1)) }))}
                      />
                      <span className="fin-settings__threshold-currency">Hàng tháng</span>
                    </div>
                    {/* Presets */}
                    <div className="fin-settings__preset-chips" style={{ marginTop: 6 }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Gợi ý:</span>
                      {[15, 20, 25].map(day => (
                        <button
                          key={day}
                          type="button"
                          className={`fin-settings__preset-chip ${payrollPolicy.payroll_cutoff_day === day ? 'is-active' : ''}`}
                          onClick={() => setPayrollPolicy(p => ({ ...p, payroll_cutoff_day: day }))}
                        >
                          Ngày {day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, display: 'block', marginBottom: 6, color: 'var(--text-secondary)' }}>
                    Ngày chi trả lương dự kiến (Payment Day):
                  </label>
                  <div className="fin-settings__threshold-input-wrap">
                    <input
                      type="number"
                      min="1"
                      max="31"
                      className="fin-settings__threshold-input"
                      value={payrollPolicy.payroll_payment_day}
                      onChange={(e) => setPayrollPolicy(p => ({ ...p, payroll_payment_day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) }))}
                    />
                    <span className="fin-settings__threshold-currency">Tháng sau</span>
                  </div>
                  {/* Presets */}
                  <div className="fin-settings__preset-chips" style={{ marginTop: 6 }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Gợi ý:</span>
                    {[5, 10, 15].map(day => (
                      <button
                        key={day}
                        type="button"
                        className={`fin-settings__preset-chip ${payrollPolicy.payroll_payment_day === day ? 'is-active' : ''}`}
                        onClick={() => setPayrollPolicy(p => ({ ...p, payroll_payment_day: day }))}
                      >
                        Ngày {day}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="fin-settings__rule-box" style={{ marginTop: 14, background: 'rgba(139, 92, 246, 0.05)', borderColor: 'rgba(139, 92, 246, 0.2)' }}>
                <div className="fin-settings__rule-item" style={{ alignItems: 'flex-start' }}>
                  <CheckCircle2 size={15} color="#8b5cf6" style={{ marginTop: 2 }} />
                  <span style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                    {payrollPolicy.payroll_cycle_type === 'CUSTOM_CUTOFF' ? (
                      <>
                        <strong>Minh họa Kỳ 07/2026:</strong> Tính từ ngày <strong>{Number(payrollPolicy.payroll_cutoff_day || 20) + 1}/06/2026</strong> đến hết ngày <strong>{payrollPolicy.payroll_cutoff_day || 20}/07/2026</strong>. Chi trả vào ngày <strong>{payrollPolicy.payroll_payment_day || 5}/08/2026</strong>.
                      </>
                    ) : (
                      <>
                        <strong>Minh họa Kỳ 07/2026:</strong> Tính từ ngày <strong>01/07/2026</strong> đến hết ngày <strong>31/07/2026</strong>. Chi trả vào ngày <strong>{payrollPolicy.payroll_payment_day || 5}/08/2026</strong>.
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
