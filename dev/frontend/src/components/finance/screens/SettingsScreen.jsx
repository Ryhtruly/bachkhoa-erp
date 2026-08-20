import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DatePicker } from '../../ui';
import { fmt, parseAmt, getLocalISOTime, VOUCHER_SIGNERS } from '../utils';
import { API } from '../financeConstants';
import { apiFetch } from '../../../lib/api';
import {
  CheckCircle2, AlertTriangle, PlusCircle, SlidersHorizontal,
  Wallet, Building2, History, ShieldCheck, RefreshCw,
  ReceiptText, HandCoins, Save, Clock, UserCheck, Lock, ShieldAlert
} from 'lucide-react';
import './SettingsScreen.css';

const EXPENSE_PRESETS = [1_000_000, 2_000_000, 5_000_000, 10_000_000];
const ADVANCE_PRESETS = [2_000_000, 5_000_000, 10_000_000, 20_000_000];

export default function SettingsScreen({ user = null, isDirector = false }) {
  const [reconcileMoment, setReconcileMoment] = useState(getLocalISOTime());
  const [systemCashBalance, setSystemCashBalance] = useState(0);
  const [actualCashBalance, setActualCashBalance] = useState('');
  const [cashNote, setCashNote] = useState('');

  const [systemBankBalance, setSystemBankBalance] = useState(0);
  const [actualBankBalance, setActualBankBalance] = useState('');
  const [bankNote, setBankNote] = useState('');

  const [reconciledBy, setReconciledBy] = useState(
    user?.full_name || user?.name || VOUCHER_SIGNERS.director
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
  const { addToast } = useToast();

  const filteredHistory = useMemo(() => {
    if (!filterMonth) return history;
    const [filterYear, filterMonthNum] = filterMonth.split('-');
    return history.filter((row) => {
      const dateVal = row.effective_date;
      if (!dateVal) return false;
      const parts = dateVal.split(' ')[0].split('/');
      if (parts.length < 3) return false;
      const [d, m, y] = parts;
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
    } catch (e) {
      console.error('Lỗi lấy cấu hình tài chính', e);
    }
  }, []);

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
      addToast('✅ Giám đốc đã lưu cấu hình ngưỡng tài chính thành công!', 'success');
    } catch {
      addToast('Lỗi kết nối máy chủ khi lưu ngưỡng tài chính', 'error');
    } finally {
      setSavingThresholds(false);
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
  }, []); // Run once on mount

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
        color: '#64748b',
        bg: '#f8fafc',
        border: '#e2e8f0',
        msg: 'Chưa nhập số thực tế',
        icon: null
      };
    }
    if (diff === 0) {
      return {
        color: '#15803d',
        bg: '#f0fdf4',
        border: '#bbf7d0',
        msg: 'Khớp quỹ hoàn toàn (Không lệch)',
        icon: 'check'
      };
    }
    if (diff < 0) {
      return {
        color: '#b91c1c',
        bg: '#fef2f2',
        border: '#fecaca',
        msg: 'Thiếu hụt (Tự động sinh Phiếu Chi bù quỹ)',
        icon: 'alert'
      };
    }
    return {
      color: '#1d4ed8',
      bg: '#eff6ff',
      border: '#bfdbfe',
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
              payment_method: 'Tiền mặt',
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
              payment_method: 'Chuyển khoản',
              actual_amount: numActualBank,
              closing_date: isoString,
              notes: bankNote,
              closing_user: reconciledBy
            })
          })
        );
      }

      await Promise.all(promises);
      addToast('✅ Xác nhận chốt quỹ và thiết lập đầu kỳ mới thành công!', 'success');
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
              <div
                className="fin-fund-card__diff-box"
                style={{
                  background: discrepancyMetaCash.bg,
                  borderColor: discrepancyMetaCash.border
                }}
              >
                <span className="fin-fund-card__diff-label">Chênh lệch đối chiếu</span>
                <div
                  className="fin-fund-card__diff-val"
                  style={{ color: discrepancyMetaCash.color }}
                >
                  {actualCashBalance === ''
                    ? '—'
                    : (diffCash === 0
                      ? '±0₫'
                      : (diffCash > 0
                        ? `+${diffCash.toLocaleString('vi-VN')}₫`
                        : `-${Math.abs(diffCash).toLocaleString('vi-VN')}₫`))}
                </div>
                <div
                  className="fin-fund-card__diff-status"
                  style={{ color: discrepancyMetaCash.color }}
                >
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
              <div
                className="fin-fund-card__diff-box"
                style={{
                  background: discrepancyMetaBank.bg,
                  borderColor: discrepancyMetaBank.border
                }}
              >
                <span className="fin-fund-card__diff-label">Chênh lệch đối chiếu</span>
                <div
                  className="fin-fund-card__diff-val"
                  style={{ color: discrepancyMetaBank.color }}
                >
                  {actualBankBalance === ''
                    ? '—'
                    : (diffBank === 0
                      ? '±0₫'
                      : (diffBank > 0
                        ? `+${diffBank.toLocaleString('vi-VN')}₫`
                        : `-${Math.abs(diffBank).toLocaleString('vi-VN')}₫`))}
                </div>
                <div
                  className="fin-fund-card__diff-status"
                  style={{ color: discrepancyMetaBank.color }}
                >
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
                            row.payment_method === 'Tiền mặt'
                              ? 'fin-fund-card__tag--cash'
                              : 'fin-fund-card__tag--bank'
                          }`}
                        >
                          {row.payment_method === 'Tiền mặt' ? (
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

        {/* Khối 4: Cấu hình Ngưỡng Tài Chính (Dành cho Giám Đốc) */}
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
      </div>
    </div>
  );
}
