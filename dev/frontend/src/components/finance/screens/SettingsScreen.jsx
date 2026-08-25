import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DatePicker, Select } from '../../ui';
import { fmt, parseAmt, getLocalISOTime } from '../utils';
import { API } from '../financeConstants';
import { apiFetch } from '../../../lib/api';
import {
  CheckCircle2, AlertTriangle, PlusCircle, SlidersHorizontal,
  Wallet, Building2, History, ShieldCheck, RefreshCw,
  ReceiptText, HandCoins, Save, Clock, UserCheck, Lock,
  CalendarDays, CalendarCheck2, Banknote, Check
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

  const [activeTab, setActiveTab] = useState('reconcile'); // 'reconcile' | 'signers' | 'thresholds' | 'payroll' | 'history'

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
        msg: 'Khớp sổ sách 100% (Không chênh lệch)',
        icon: 'check'
      };
    }
    if (diff < 0) {
      return {
        variant: 'deficit',
        msg: 'Thiếu hụt (Tự động tạo Phiếu Chi bù quỹ)',
        icon: 'alert'
      };
    }
    return {
      variant: 'surplus',
      msg: 'Dư thừa (Tự động tạo Phiếu Thu nạp quỹ)',
      icon: 'plus'
    };
  };

  const discrepancyMetaCash = getDiscrepancyMeta(diffCash, actualCashBalance !== '');
  const discrepancyMetaBank = getDiscrepancyMeta(diffBank, actualBankBalance !== '');

  const handleMatchSystemCash = () => {
    setActualCashBalance(String(systemCashBalance));
    setCashNote('');
  };

  const handleMatchSystemBank = () => {
    setActualBankBalance(String(systemBankBalance));
    setBankNote('');
  };

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
    <div className="card card--workspace fin-settings-card">
      {/* Header chính của màn hình */}
      <div className="fin-settings__header-main">
        <div>
          <h3 className="fin-settings__header-title">
            <SlidersHorizontal size={20} color="var(--orange-500, #eb4a23)" />
            Thiết Lập &amp; Chốt Quỹ Tài Chính
          </h3>
          <div className="fin-settings__header-subtitle">
            Quản trị chốt quỹ định kỳ, phân quyền người ký mẫu in chứng từ và cấu hình hạn mức phê duyệt.
          </div>
        </div>
        <div className="fin-settings__header-badges">
          <span className="fin-director-badge">
            <Lock size={12} /> Dành Cho Ban Giám Đốc
          </span>
        </div>
      </div>

      {/* Tabs điều hướng nhanh liền mạch */}
      <div className="fin-settings__tab-nav" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'reconcile'}
          className={`fin-settings__tab-btn ${activeTab === 'reconcile' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('reconcile')}
        >
          <ShieldCheck size={16} /> Biên bản chốt quỹ
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'signers'}
          className={`fin-settings__tab-btn ${activeTab === 'signers' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('signers')}
        >
          <UserCheck size={16} /> Người ký chứng từ
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'thresholds'}
          className={`fin-settings__tab-btn ${activeTab === 'thresholds' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('thresholds')}
        >
          <ReceiptText size={16} /> Ngưỡng phê duyệt
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'payroll'}
          className={`fin-settings__tab-btn ${activeTab === 'payroll' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('payroll')}
        >
          <CalendarDays size={16} /> Chu kỳ tính lương
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          className={`fin-settings__tab-btn ${activeTab === 'history' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={16} /> Lịch sử chốt quỹ
          {history.length > 0 && <span className="fin-settings__tab-badge">{history.length}</span>}
        </button>
      </div>

      {/* Nội dung tab chảy liền mạch bên dưới */}
      <div className="fin-settings__body">
        {/* ── TAB 1: BIÊN BẢN CHỐT QUỸ ───────────────────────────────────────── */}
        {activeTab === 'reconcile' && (
          <form onSubmit={handleSubmit} className="fin-tab-content">
            <div className="fin-tab-content__head">
              <h4 className="fin-tab-content__title">
                <ShieldCheck size={17} color="var(--orange-500, #eb4a23)" /> Đối Chiếu Số Dư &amp; Thiết Lập Đầu Kỳ Mới
              </h4>
              <span className="fin-tab-content__sub">
                Nhập số dư thực tế kiểm đếm để hệ thống tự động tính chênh lệch và cập nhật số dư đầu kỳ mới.
              </span>
            </div>

            {/* Mốc thời gian & Người chốt */}
            <div className="fin-form-grid fin-form-grid--2col">
              <div className="fin-field">
                <label className="fin-field__label">
                  <span>Mốc thời gian chốt</span>
                  {loading && <span className="fin-field__hint">Đang tính lại số dư...</span>}
                </label>
                <div className="fin-time-group">
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
                    className="fin-input fin-input--time"
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

              <div className="fin-field">
                <label className="fin-field__label">
                  <span>Người thực hiện chốt</span>
                </label>
                <input
                  type="text"
                  className="fin-input"
                  value={reconciledBy}
                  onChange={(e) => setReconciledBy(e.target.value)}
                  placeholder="Nhập họ tên người chốt..."
                  required
                />
              </div>
            </div>

            {/* 2 Cột Quỹ Tiền Mặt & Ngân Hàng */}
            <div className="fin-funds-compare-grid">
              {/* Quỹ Tiền Mặt */}
              <div className="fin-fund-box fin-fund-box--cash">
                <div className="fin-fund-box__head">
                  <div className="fin-fund-box__title">
                    <Wallet size={18} color="#10b981" /> Quỹ Tiền Mặt (Két Sắt)
                  </div>
                  <button
                    type="button"
                    className="fin-quick-match-btn"
                    onClick={handleMatchSystemCash}
                    title="Điền nhanh số thực tế bằng số sổ sách"
                  >
                    <Check size={13} /> Khớp sổ sách
                  </button>
                </div>

                <div className="fin-sys-balance-row">
                  <span>Số dư sổ sách ghi nhận:</span>
                  <strong>{loading ? 'Đang tải...' : `${systemCashBalance.toLocaleString('vi-VN')} ₫`}</strong>
                </div>

                <div className="fin-field">
                  <label className="fin-field__label">
                    <span>Số thực tế kiểm đếm két sắt</span>
                    <span className="fin-req">*</span>
                  </label>
                  <div className="fin-amount-input-wrap">
                    <input
                      type="text"
                      className="fin-input fin-input--amount"
                      value={formatInputDisplay(actualCashBalance)}
                      onChange={(e) => setActualCashBalance(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="0"
                    />
                    <span className="fin-currency-unit">₫</span>
                  </div>
                </div>

                {/* Chênh lệch */}
                <div className={`fin-diff-strip fin-diff-strip--${discrepancyMetaCash.variant}`}>
                  <div>
                    <span className="fin-diff-strip__label">Chênh lệch đối chiếu:</span>
                    <strong className="fin-diff-strip__val">
                      {actualCashBalance === ''
                        ? '—'
                        : (diffCash === 0
                          ? '±0 ₫'
                          : (diffCash > 0
                            ? `+${diffCash.toLocaleString('vi-VN')} ₫`
                            : `-${Math.abs(diffCash).toLocaleString('vi-VN')} ₫`))}
                    </strong>
                  </div>
                  <div className="fin-diff-strip__msg">
                    {discrepancyMetaCash.icon === 'check' && <CheckCircle2 size={15} />}
                    {discrepancyMetaCash.icon === 'alert' && <AlertTriangle size={15} />}
                    {discrepancyMetaCash.icon === 'plus' && <PlusCircle size={15} />}
                    <span>{discrepancyMetaCash.msg}</span>
                  </div>
                </div>

                {/* Giải trình */}
                <div className="fin-field">
                  <label className="fin-field__label">
                    <span>Giải trình chênh lệch</span>
                    {actualCashBalance !== '' && diffCash !== 0 && (
                      <span className="fin-req-tag">Bắt buộc khi có lệch</span>
                    )}
                  </label>
                  <textarea
                    className="fin-textarea"
                    rows={2}
                    value={cashNote}
                    onChange={(e) => setCashNote(e.target.value)}
                    placeholder={
                      actualCashBalance !== '' && diffCash !== 0
                        ? 'Bắt buộc nhập nguyên nhân chênh lệch két sắt...'
                        : 'Ghi chú kiểm kê (nếu có)...'
                    }
                    required={actualCashBalance !== '' && diffCash !== 0}
                  />
                </div>
              </div>

              {/* Quỹ Ngân Hàng */}
              <div className="fin-fund-box fin-fund-box--bank">
                <div className="fin-fund-box__head">
                  <div className="fin-fund-box__title">
                    <Building2 size={18} color="#3b82f6" /> Quỹ Chuyển Khoản (Ngân Hàng)
                  </div>
                  <button
                    type="button"
                    className="fin-quick-match-btn"
                    onClick={handleMatchSystemBank}
                    title="Điền nhanh số thực tế bằng số sổ sách"
                  >
                    <Check size={13} /> Khớp sổ sách
                  </button>
                </div>

                <div className="fin-sys-balance-row">
                  <span>Số dư sổ sách ghi nhận:</span>
                  <strong>{loading ? 'Đang tải...' : `${systemBankBalance.toLocaleString('vi-VN')} ₫`}</strong>
                </div>

                <div className="fin-field">
                  <label className="fin-field__label">
                    <span>Số thực tế trên App Ngân hàng</span>
                    <span className="fin-req">*</span>
                  </label>
                  <div className="fin-amount-input-wrap">
                    <input
                      type="text"
                      className="fin-input fin-input--amount"
                      value={formatInputDisplay(actualBankBalance)}
                      onChange={(e) => setActualBankBalance(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="0"
                    />
                    <span className="fin-currency-unit">₫</span>
                  </div>
                </div>

                {/* Chênh lệch */}
                <div className={`fin-diff-strip fin-diff-strip--${discrepancyMetaBank.variant}`}>
                  <div>
                    <span className="fin-diff-strip__label">Chênh lệch đối chiếu:</span>
                    <strong className="fin-diff-strip__val">
                      {actualBankBalance === ''
                        ? '—'
                        : (diffBank === 0
                          ? '±0 ₫'
                          : (diffBank > 0
                            ? `+${diffBank.toLocaleString('vi-VN')} ₫`
                            : `-${Math.abs(diffBank).toLocaleString('vi-VN')} ₫`))}
                    </strong>
                  </div>
                  <div className="fin-diff-strip__msg">
                    {discrepancyMetaBank.icon === 'check' && <CheckCircle2 size={15} />}
                    {discrepancyMetaBank.icon === 'alert' && <AlertTriangle size={15} />}
                    {discrepancyMetaBank.icon === 'plus' && <PlusCircle size={15} />}
                    <span>{discrepancyMetaBank.msg}</span>
                  </div>
                </div>

                {/* Giải trình */}
                <div className="fin-field">
                  <label className="fin-field__label">
                    <span>Giải trình chênh lệch</span>
                    {actualBankBalance !== '' && diffBank !== 0 && (
                      <span className="fin-req-tag">Bắt buộc khi có lệch</span>
                    )}
                  </label>
                  <textarea
                    className="fin-textarea"
                    rows={2}
                    value={bankNote}
                    onChange={(e) => setBankNote(e.target.value)}
                    placeholder={
                      actualBankBalance !== '' && diffBank !== 0
                        ? 'Bắt buộc nhập nguyên nhân chênh lệch sao kê bank...'
                        : 'Ghi chú kiểm kê (nếu có)...'
                    }
                    required={actualBankBalance !== '' && diffBank !== 0}
                  />
                </div>
              </div>
            </div>

            {/* Action button */}
            <div className="fin-tab-content__footer">
              <button
                type="submit"
                disabled={saving || loading}
                className="btn btn-primary fin-btn-submit"
              >
                {saving ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Đang chốt quỹ...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} /> Xác nhận chốt quỹ đầu kỳ
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ── TAB 2: NGƯỜI KÝ CHỨNG TỪ ───────────────────────────────────────── */}
        {activeTab === 'signers' && (
          <div className="fin-tab-content">
            <div className="fin-tab-content__head fin-tab-content__head--flex">
              <div>
                <h4 className="fin-tab-content__title">
                  <UserCheck size={17} color="#0284c7" /> Cấu Hình Người Ký Chứng Từ Mẫu In
                </h4>
                <span className="fin-tab-content__sub">
                  Tên và chức danh tự động điền tại chân trang Phiếu Thu, Phiếu Chi, Sổ Quỹ và Bảng Lương.
                </span>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveDocumentSigners}
                disabled={savingDocumentSigners}
                aria-label="Lưu người ký chứng từ"
              >
                {savingDocumentSigners ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                <span>{savingDocumentSigners ? 'Đang lưu...' : 'Lưu người ký'}</span>
              </button>
            </div>

            <div className="fin-form-grid fin-form-grid--2col">
              {/* Giám đốc */}
              <div className="fin-field">
                <label className="fin-field__label">
                  <span>Giám đốc / Người đại diện</span>
                </label>
                <input
                  type="text"
                  className="fin-input"
                  value={documentSigners.director_name}
                  onChange={e => setDocumentSigners(prev => ({ ...prev, director_name: e.target.value }))}
                  placeholder="Lê Văn Sáu"
                  maxLength={120}
                />
                <span className="fin-field__hint">In tại ô Giám đốc / Người đại diện</span>
              </div>

              {/* Kế toán */}
              <div className="fin-field">
                <label className="fin-field__label">
                  <span>Kế toán</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 8 }}>
                  <input
                    type="text"
                    className="fin-input"
                    value={documentSigners.accountant_name}
                    onChange={e => setDocumentSigners(prev => ({ ...prev, accountant_name: e.target.value }))}
                    placeholder="Để trống nếu chưa xác định"
                    maxLength={120}
                  />
                  <Select
                    value={documentSigners.accountant_role}
                    onChange={value => setDocumentSigners(prev => ({ ...prev, accountant_role: value }))}
                    options={[
                      { value: 'Kế toán trưởng', label: 'Kế toán trưởng' },
                      { value: 'Kế toán phụ trách', label: 'Kế toán phụ trách' },
                    ]}
                    placeholder="Chọn chức danh"
                  />
                </div>
              </div>

              {/* Thủ quỹ */}
              <div className="fin-field">
                <label className="fin-field__label">
                  <span>Thủ quỹ</span>
                </label>
                <input
                  type="text"
                  className="fin-input"
                  value={documentSigners.cashier_name}
                  onChange={e => setDocumentSigners(prev => ({ ...prev, cashier_name: e.target.value }))}
                  placeholder="Tùy chọn nhập tên thủ quỹ"
                  maxLength={120}
                />
              </div>

              {/* Kế toán tiền lương */}
              <div className="fin-field">
                <label className="fin-field__label">
                  <span>Kế toán tiền lương</span>
                </label>
                <input
                  type="text"
                  className="fin-input"
                  value={documentSigners.payroll_accountant_name}
                  onChange={e => setDocumentSigners(prev => ({ ...prev, payroll_accountant_name: e.target.value }))}
                  placeholder="Tùy chọn nhập người lập bảng lương"
                  maxLength={120}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: NGƯỠNG PHÊ DUYỆT TÀI CHÍNH ─────────────────────────────── */}
        {activeTab === 'thresholds' && (
          <div className="fin-tab-content">
            <div className="fin-tab-content__head fin-tab-content__head--flex">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h4 className="fin-tab-content__title">
                    <ShieldCheck size={17} color="var(--orange-500, #eb4a23)" /> Cấu Hình Ngưỡng Phê Duyệt Tài Chính
                  </h4>
                  <span className="fin-tag-director"><Lock size={12} /> Quyền Giám Đốc</span>
                </div>
                <span className="fin-tab-content__sub">
                  Thiết lập hạn mức chi tiêu và tạm ứng vượt ngưỡng bắt buộc phải có Giám đốc phê duyệt trực tiếp.
                </span>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveThresholds}
                disabled={savingThresholds}
                aria-label="Lưu ngưỡng phê duyệt tài chính"
              >
                {savingThresholds ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                <span>{savingThresholds ? 'Đang lưu...' : 'Lưu cấu hình ngưỡng'}</span>
              </button>
            </div>

            <div className="fin-form-grid fin-form-grid--2col">
              {/* Chi tiêu */}
              <div className="fin-config-card">
                <div className="fin-config-card__header">
                  <ReceiptText size={18} color="#e11d48" />
                  <strong>Hạn mức chi tiêu tự động</strong>
                </div>

                <div className="fin-amount-input-wrap">
                  <input
                    type="text"
                    className="fin-input fin-input--amount"
                    value={Number(thresholds.expense_approval_threshold || 0).toLocaleString('vi-VN')}
                    onChange={(e) =>
                      setThresholds((prev) => ({
                        ...prev,
                        expense_approval_threshold: Number(e.target.value.replace(/[^\d]/g, ''))
                      }))
                    }
                  />
                  <span className="fin-currency-unit">₫</span>
                </div>

                {/* Presets */}
                <div className="fin-presets-row">
                  <span className="fin-presets-label">Chọn nhanh:</span>
                  {EXPENSE_PRESETS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`fin-preset-btn ${thresholds.expense_approval_threshold === val ? 'is-active' : ''}`}
                      onClick={() => setThresholds((prev) => ({ ...prev, expense_approval_threshold: val }))}
                    >
                      {val >= 1_000_000 ? `${val / 1_000_000}tr` : val.toLocaleString('vi-VN')}
                    </button>
                  ))}
                </div>

                <div className="fin-rule-box">
                  <div>✓ Chi tiêu <strong>≤ {fmt(thresholds.expense_approval_threshold || 0)}</strong>: Kế toán duyệt tự động</div>
                  <div style={{ color: '#ef4444', marginTop: 4 }}>⚠ Chi tiêu <strong>&gt; {fmt(thresholds.expense_approval_threshold || 0)}</strong>: Bắt buộc Giám đốc duyệt</div>
                </div>
              </div>

              {/* Tạm ứng */}
              <div className="fin-config-card">
                <div className="fin-config-card__header">
                  <HandCoins size={18} color="#0284c7" />
                  <strong>Hạn mức tạm ứng nội bộ</strong>
                </div>

                <div className="fin-amount-input-wrap">
                  <input
                    type="text"
                    className="fin-input fin-input--amount"
                    value={Number(thresholds.advance_admin_threshold || 0).toLocaleString('vi-VN')}
                    onChange={(e) =>
                      setThresholds((prev) => ({
                        ...prev,
                        advance_admin_threshold: Number(e.target.value.replace(/[^\d]/g, ''))
                      }))
                    }
                  />
                  <span className="fin-currency-unit">₫</span>
                </div>

                {/* Presets */}
                <div className="fin-presets-row">
                  <span className="fin-presets-label">Chọn nhanh:</span>
                  {ADVANCE_PRESETS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`fin-preset-btn ${thresholds.advance_admin_threshold === val ? 'is-active' : ''}`}
                      onClick={() => setThresholds((prev) => ({ ...prev, advance_admin_threshold: val }))}
                    >
                      {val >= 1_000_000 ? `${val / 1_000_000}tr` : val.toLocaleString('vi-VN')}
                    </button>
                  ))}
                </div>

                <div className="fin-rule-box">
                  <div>✓ Tạm ứng <strong>≤ {fmt(thresholds.advance_admin_threshold || 0)}</strong>: Duyệt cấp phòng ban &amp; Kế toán</div>
                  <div style={{ color: '#ef4444', marginTop: 4 }}>⚠ Tạm ứng <strong>&gt; {fmt(thresholds.advance_admin_threshold || 0)}</strong>: Yêu cầu Giám đốc thẩm định</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: CHU KỲ TÍNH LƯƠNG ───────────────────────────────────────── */}
        {activeTab === 'payroll' && (
          <div className="fin-tab-content">
            <div className="fin-tab-content__head fin-tab-content__head--flex">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h4 className="fin-tab-content__title">
                    <Banknote size={17} color="#8b5cf6" /> Cấu Hình Chu Kỳ Tính Lương &amp; Ngày Chốt Công
                  </h4>
                  <span className="fin-tag-director"><Lock size={12} /> Quyền Giám Đốc</span>
                </div>
                <span className="fin-tab-content__sub">
                  Quy định mốc thời gian bắt đầu – kết thúc kỳ tính lương và ngày chi trả lương dự kiến.
                </span>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSavePayrollPolicy}
                disabled={savingPayrollPolicy}
                aria-label="Lưu chính sách chu kỳ lương"
              >
                {savingPayrollPolicy ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                <span>{savingPayrollPolicy ? 'Đang lưu...' : 'Lưu chính sách'}</span>
              </button>
            </div>

            <div className="fin-form-grid fin-form-grid--2col">
              {/* Phương thức xác định */}
              <div className="fin-config-card">
                <div className="fin-config-card__header">
                  <CalendarDays size={18} color="#8b5cf6" />
                  <strong>Phương thức xác định kỳ lương</strong>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  <label className="fin-radio-option">
                    <input
                      type="radio"
                      name="payroll_cycle_type"
                      checked={payrollPolicy.payroll_cycle_type === 'CALENDAR_MONTH'}
                      onChange={() => setPayrollPolicy(p => ({ ...p, payroll_cycle_type: 'CALENDAR_MONTH' }))}
                    />
                    <div>
                      <strong>Theo tháng dương lịch chuẩn</strong>
                      <span>Tính trọn vẹn từ ngày 01 đến ngày cuối cùng của tháng (01/MM – hết tháng).</span>
                    </div>
                  </label>

                  <label className="fin-radio-option">
                    <input
                      type="radio"
                      name="payroll_cycle_type"
                      checked={payrollPolicy.payroll_cycle_type === 'CUSTOM_CUTOFF'}
                      onChange={() => setPayrollPolicy(p => ({ ...p, payroll_cycle_type: 'CUSTOM_CUTOFF' }))}
                    />
                    <div>
                      <strong>Theo ngày chốt công định kỳ (Cut-off)</strong>
                      <span>Chốt vào một ngày cố định hàng tháng (ví dụ: ngày 20, 25) để kịp tổng hợp bảng lương.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Thiết lập ngày */}
              <div className="fin-config-card">
                <div className="fin-config-card__header">
                  <CalendarCheck2 size={18} color="#0284c7" />
                  <strong>Thiết lập ngày chốt &amp; ngày chi trả</strong>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
                  {payrollPolicy.payroll_cycle_type === 'CUSTOM_CUTOFF' && (
                    <div className="fin-field">
                      <label className="fin-field__label">
                        <span>Ngày kết thúc kỳ lương hàng tháng (Cut-off Day):</span>
                      </label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          max="28"
                          className="fin-input"
                          style={{ width: 120 }}
                          value={payrollPolicy.payroll_cutoff_day}
                          onChange={(e) => setPayrollPolicy(p => ({ ...p, payroll_cutoff_day: Math.min(28, Math.max(1, Number(e.target.value) || 1)) }))}
                        />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Hàng tháng</span>
                      </div>
                      <div className="fin-presets-row" style={{ marginTop: 6 }}>
                        <span className="fin-presets-label">Gợi ý:</span>
                        {[15, 20, 25].map(day => (
                          <button
                            key={day}
                            type="button"
                            className={`fin-preset-btn ${payrollPolicy.payroll_cutoff_day === day ? 'is-active' : ''}`}
                            onClick={() => setPayrollPolicy(p => ({ ...p, payroll_cutoff_day: day }))}
                          >
                            Ngày {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="fin-field">
                    <label className="fin-field__label">
                      <span>Ngày chi trả lương dự kiến (Payment Day):</span>
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        className="fin-input"
                        style={{ width: 120 }}
                        value={payrollPolicy.payroll_payment_day}
                        onChange={(e) => setPayrollPolicy(p => ({ ...p, payroll_payment_day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) }))}
                      />
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tháng kế tiếp</span>
                    </div>
                    <div className="fin-presets-row" style={{ marginTop: 6 }}>
                      <span className="fin-presets-label">Gợi ý:</span>
                      {[5, 10, 15].map(day => (
                        <button
                          key={day}
                          type="button"
                          className={`fin-preset-btn ${payrollPolicy.payroll_payment_day === day ? 'is-active' : ''}`}
                          onClick={() => setPayrollPolicy(p => ({ ...p, payroll_payment_day: day }))}
                        >
                          Ngày {day}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 5: LỊCH SỬ CHỐT QUỸ ────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="fin-tab-content">
            <div className="fin-tab-content__head fin-tab-content__head--flex">
              <div>
                <h4 className="fin-tab-content__title">
                  <History size={17} color="var(--orange-500, #eb4a23)" /> Lịch Sử Chốt Quỹ Trước Đó
                </h4>
                <span className="fin-tab-content__sub">
                  Tổng cộng {filteredHistory.length} đợt ghi nhận số dư đầu kỳ mới.
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Chọn tháng:</span>
                <DatePicker
                  selectionMode="month"
                  value={filterMonth}
                  onChange={setFilterMonth}
                  placeholder="Tất cả các tháng"
                  dialogLabel="Chọn tháng lọc lịch sử"
                />
                {filterMonth && (
                  <button
                    type="button"
                    onClick={() => setFilterMonth('')}
                    className="btn btn-secondary"
                    style={{ height: 36, padding: '0 10px', fontSize: '0.8rem' }}
                  >
                    Xóa lọc
                  </button>
                )}
              </div>
            </div>

            <div className="fin-table-wrap">
              {loadingHistory ? (
                <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                  <span>Đang tải lịch sử chốt quỹ...</span>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  <History size={32} style={{ margin: '0 auto 8px', opacity: 0.5, display: 'block' }} />
                  <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--text-primary)' }}>Chưa có lịch sử chốt quỹ phù hợp</p>
                  <p style={{ margin: 0, fontSize: '0.82rem' }}>
                    {filterMonth
                      ? `Không tìm thấy đợt chốt quỹ nào trong tháng ${filterMonth.split('-')[1]}/${filterMonth.split('-')[0]}.`
                      : 'Dữ liệu chốt quỹ sau khi xác nhận sẽ được lưu vết tự động tại đây.'}
                  </p>
                </div>
              ) : (
                <table className="fin-table">
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
                        <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Clock size={13} color="var(--text-tertiary)" /> {row.effective_date}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`fin-tag-method ${
                              (row.payment_method === 'CASH' || row.payment_method === 'Tiền mặt')
                                ? 'fin-tag-method--cash'
                                : 'fin-tag-method--bank'
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
                        <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
                          {fmt(row.opening_balance)}
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}>
                            <UserCheck size={13} color="var(--orange-500)" /> {row.closing_user || '—'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>{row.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
