import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DatePicker, DataTable, Badge, Modal, FormRow, FormGrid, FilterBar, SubTabs, Dropdown } from '../../ui';
import { fmt, fmtShort, fmtAmt, parseAmt, spellVietnameseCurrency, CATEGORY_AUTO_MAPPING, getLocalISOTime, VOUCHER_SIGNERS } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip, ExcelGridTable } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { apiFetch } from '../../../lib/api';
import { Check, AlertCircle, Settings, Link, RefreshCw, PlusCircle, Wallet, Building2, History, ShieldCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import CashflowModal from '../modals/CashflowModal';
import CashflowDetailModal from '../modals/CashflowDetailModal';


export default function SettingsScreen() {
  const [reconcileMoment, setReconcileMoment] = useState(getLocalISOTime());
  const [systemCashBalance, setSystemCashBalance] = useState(0);
  const [actualCashBalance, setActualCashBalance] = useState('');
  const [cashNote, setCashNote] = useState('');

  const [systemBankBalance, setSystemBankBalance] = useState(0);
  const [actualBankBalance, setActualBankBalance] = useState('');
  const [bankNote, setBankNote] = useState('');

  const [reconciledBy, setReconciledBy] = useState(VOUCHER_SIGNERS.director);
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
    return history.filter(row => {
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
      console.error("Lỗi lấy cấu hình tài chính", e);
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
      addToast('Giám đốc đã lưu cấu hình ngưỡng tài chính!', 'success');
    } catch {
      addToast('Lỗi kết nối máy chủ', 'error');
    } finally {
      setSavingThresholds(false);
    }
  };

  const fetchSystemBalance = useCallback(async (closingMoment = reconcileMoment) => {
    setLoading(true);
    try {
      const isoString = new Date(closingMoment).toISOString();
      const [dTM, dCK] = await Promise.all([
        apiFetch(`${API}/api/finance/fund-balances/calculate?payment_method=${encodeURIComponent('Tiền mặt')}&closing_date=${encodeURIComponent(isoString)}`),
        apiFetch(`${API}/api/finance/fund-balances/calculate?payment_method=${encodeURIComponent('Chuyển khoản')}&closing_date=${encodeURIComponent(isoString)}`)
      ]);
      setSystemCashBalance(dTM?.system_balance || 0);
      setSystemBankBalance(dCK?.system_balance || 0);
    } catch {
      console.log("Lỗi kết nối API");
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
      console.error("Lỗi lấy lịch sử chốt quỹ", e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchSystemBalance();
    fetchHistory();
    fetchSettings();
  }, [fetchSystemBalance, fetchHistory, fetchSettings]);

  const numActualCash = actualCashBalance === '' ? 0 : parseAmt(actualCashBalance);
  const diffCash = actualCashBalance === '' ? 0 : numActualCash - systemCashBalance;

  const numActualBank = actualBankBalance === '' ? 0 : parseAmt(actualBankBalance);
  const diffBank = actualBankBalance === '' ? 0 : numActualBank - systemBankBalance;

  const formatInputDisplay = (val) => {
    if (val === '') return '';
    return Number(val).toLocaleString('vi-VN');
  };

  const getDiscrepancyMeta = (diff, hasInput) => {
    if (!hasInput) return { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', msg: 'Chưa nhập số thực tế' };
    if (diff === 0) return { color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0', msg: 'Khớp quỹ hoàn toàn' };
    if (diff < 0) return { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', msg: 'Thiếu (Tự sinh PC)' };
    return { color: '#ef4444', bg: '#eff6ff', border: '#bfdbfe', msg: 'Thừa (Tự sinh PT)' };
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
      addToast('Xác nhận chốt quỹ và thiết lập đầu kỳ mới thành công!', 'success');
      setActualCashBalance('');
      setCashNote('');
      setActualBankBalance('');
      setBankNote('');
      fetchSystemBalance();
      fetchHistory();
    } catch {
      addToast('Lỗi kết nối máy chủ', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 24,
        padding: '32px',
        boxShadow: '0 4px 40px rgba(0, 0, 0, 0.03)',
        border: '1px solid #f1f5f9'
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, letterSpacing: '-0.02em' }}>
            <Settings size={26} color="#ef4444" /> BIÊN BẢN CHỐT QUỸ & ĐỐI CHIẾU TÀI CHÍNH
          </h3>
          <p style={{ fontSize: '0.9rem', color: '#64748b', maxWidth: 620, margin: '0 auto', lineHeight: 1.6 }}>
            Kiểm kê và đối chiếu số dư thực tế đếm tay hoặc ứng dụng ngân hàng với sổ sách hệ thống để thiết lập mốc số dư đầu kỳ mới cho từng quỹ riêng biệt.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Khối 1: Cấu hình Thiết Lập */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, background: '#f8fafc', padding: 20, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mốc thời gian chốt</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 112px', gap: 8 }}>
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
                  style={{ width: '100%', height: 42, padding: '0 10px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: '0.95rem', outline: 'none', background: '#ffffff', boxSizing: 'border-box' }}
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
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Người thực hiện chốt</label>
              <input
                type="text"
                style={{ width: '100%', height: 42, padding: '0 14px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: '0.95rem', outline: 'none', background: '#ffffff', boxSizing: 'border-box' }}
                value={reconciledBy}
                onChange={(e) => setReconciledBy(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Khối 2: Hai Cột Quỹ song song */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

            {/* Quỹ Tiền Mặt */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, padding: 24, background: '#ffffff', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
              <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wallet size={20} color="#10b981" /> QUỸ TIỀN MẶT (KÉT SẮT)
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>SỐ DƯ HỆ THỐNG</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', marginTop: 4 }}>
                    {loading ? 'Đang tải...' : `${systemCashBalance.toLocaleString('vi-VN')}₫`}
                  </div>
                </div>

                <div style={{ border: '2px solid #ef4444', borderRadius: 12, padding: 16 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ef4444', letterSpacing: '0.05em' }}>SỐ DƯ THỰC TẾ *</span>
                  <div style={{ position: 'relative', width: '100%', marginTop: 8, display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      style={{ width: '100%', fontWeight: 800, fontSize: '1.3rem', border: 'none', borderBottom: '2px solid #e2e8f0', textAlign: 'right', paddingRight: 24, outline: 'none', paddingBottom: 4 }}
                      value={formatInputDisplay(actualCashBalance)}
                      onChange={(e) => setActualCashBalance(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="0"
                    />
                    <span style={{ position: 'absolute', right: 2, fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>₫</span>
                  </div>
                </div>

                <div style={{ background: discrepancyMetaCash.bg, border: `1px solid ${discrepancyMetaCash.border}`, borderRadius: 12, padding: 16 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>CHÊNH LỆCH</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace', color: discrepancyMetaCash.color, margin: '6px 0' }}>
                    {actualCashBalance === '' ? '—' : (diffCash === 0 ? '±0₫' : (diffCash > 0 ? `+${diffCash.toLocaleString('vi-VN')}₫` : `-${Math.abs(diffCash).toLocaleString('vi-VN')}₫`))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: discrepancyMetaCash.color, fontSize: '0.75rem', fontWeight: 700 }}>
                    {actualCashBalance !== '' && (diffCash === 0 ? <Check size={14} /> : <AlertCircle size={14} />)}
                    <span>{discrepancyMetaCash.msg}</span>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                    Giải trình chênh lệch {actualCashBalance !== '' && diffCash !== 0 && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <textarea
                    style={{ width: '100%', height: 60, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem', outline: 'none', resize: 'none', lineHeight: 1.4, boxSizing: 'border-box' }}
                    value={cashNote}
                    onChange={(e) => setCashNote(e.target.value)}
                    placeholder={actualCashBalance !== '' && diffCash !== 0 ? "Bắt buộc nhập lý do chênh lệch tiền mặt..." : "Ghi chú kiểm kê két sắt..."}
                    required={actualCashBalance !== '' && diffCash !== 0}
                  />
                </div>
              </div>
            </div>

            {/* Quỹ Chuyển Khoản */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, padding: 24, background: '#ffffff', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
              <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={20} color="#3b82f6" /> QUỸ CHUYỂN KHOẢN (NGÂN HÀNG)
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>SỐ DƯ HỆ THỐNG</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', marginTop: 4 }}>
                    {loading ? 'Đang tải...' : `${systemBankBalance.toLocaleString('vi-VN')}₫`}
                  </div>
                </div>

                <div style={{ border: '2px solid #ef4444', borderRadius: 12, padding: 16 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ef4444', letterSpacing: '0.05em' }}>SỐ DƯ THỰC TẾ *</span>
                  <div style={{ position: 'relative', width: '100%', marginTop: 8, display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      style={{ width: '100%', fontWeight: 800, fontSize: '1.3rem', border: 'none', borderBottom: '2px solid #e2e8f0', textAlign: 'right', paddingRight: 24, outline: 'none', paddingBottom: 4 }}
                      value={formatInputDisplay(actualBankBalance)}
                      onChange={(e) => setActualBankBalance(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="0"
                    />
                    <span style={{ position: 'absolute', right: 2, fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>₫</span>
                  </div>
                </div>

                <div style={{ background: discrepancyMetaBank.bg, border: `1px solid ${discrepancyMetaBank.border}`, borderRadius: 12, padding: 16 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>CHÊNH LỆCH</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace', color: discrepancyMetaBank.color, margin: '6px 0' }}>
                    {actualBankBalance === '' ? '—' : (diffBank === 0 ? '±0₫' : (diffBank > 0 ? `+${diffBank.toLocaleString('vi-VN')}₫` : `-${Math.abs(diffBank).toLocaleString('vi-VN')}₫`))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: discrepancyMetaBank.color, fontSize: '0.75rem', fontWeight: 700 }}>
                    {actualBankBalance !== '' && (diffBank === 0 ? <Check size={14} /> : <AlertCircle size={14} />)}
                    <span>{discrepancyMetaBank.msg}</span>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                    Giải trình chênh lệch {actualBankBalance !== '' && diffBank !== 0 && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <textarea
                    style={{ width: '100%', height: 60, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem', outline: 'none', resize: 'none', lineHeight: 1.4, boxSizing: 'border-box' }}
                    value={bankNote}
                    onChange={(e) => setBankNote(e.target.value)}
                    placeholder={actualBankBalance !== '' && diffBank !== 0 ? "Bắt buộc nhập lý do chênh lệch chuyển khoản..." : "Ghi chú kiểm kê app bank..."}
                    required={actualBankBalance !== '' && diffBank !== 0}
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={saving || loading}
            style={{
              width: '100%',
              height: 48,
              fontWeight: 700,
              background: (saving || loading) ? '#94a3b8' : '#ef4444',
              color: '#ffffff',
              fontSize: '1rem',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.2)',
              cursor: (saving || loading) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              marginTop: 8
            }}
          >
            {saving ? ' Đang lưu mốc chốt...' : 'Xác Nhận Chốt Quỹ & Thiết Lập Đầu Kỳ Mới'}
          </button>

        </form>

        {/* Khối 2: Lịch sử chốt quỹ */}
        <div style={{ marginTop: 32, borderTop: '1px solid #e2e8f0', paddingTop: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <h4 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 10, letterSpacing: '-0.01em' }}>
              <History size={20} color="var(--orange-500)" /> LỊCH SỬ CHỐT QUỸ TRƯỚC ĐÓ
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>Chọn tháng:</span>
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
                  onClick={() => setFilterMonth('')}
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#ef4444',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Xóa lọc
                </button>
              )}
            </div>
          </div>
          
          <div style={{ overflowX: 'auto', background: '#f8fafc', borderRadius: 16, border: '1px solid #e2e8f0', padding: '8px 16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 8px', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mốc Thời Gian Chốt</th>
                  <th style={{ padding: '12px 8px', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hình Thức</th>
                  <th style={{ padding: '12px 8px', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Số Dư Đầu Kỳ Mới</th>
                  <th style={{ padding: '12px 8px', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Người Thực Hiện</th>
                  <th style={{ padding: '12px 8px', fontWeight: 700, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ghi Chú</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '24px 8px', textAlign: 'center', color: '#64748b' }}>Đang tải lịch sử...</td>
                  </tr>
                ) : filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '24px 8px', textAlign: 'center', color: '#64748b' }}>Chưa có lịch sử chốt quỹ nào phù hợp.</td>
                  </tr>
                ) : (
                  filteredHistory.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 500, color: '#334155' }}>{row.effective_date}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: row.payment_method === 'Tiền mặt' ? '#eff6ff' : '#f0fdf4',
                          color: row.payment_method === 'Tiền mặt' ? '#1d4ed8' : '#15803d',
                          border: `1px solid ${row.payment_method === 'Tiền mặt' ? '#bfdbfe' : '#bbf7d0'}`
                        }}>
                          {row.payment_method === 'Tiền mặt' ? 'Tiền mặt' : 'Ckhoản'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                        {fmt(row.opening_balance)}
                      </td>
                      <td style={{ padding: '12px 8px', color: '#475569' }}>{row.closing_user || '—'}</td>
                      <td style={{ padding: '12px 8px', color: '#64748b', fontSize: '0.85rem' }}>{row.notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Khối Cấu Hình Ngưỡng Tài Chính (Dành cho Giám Đốc) */}
        <div style={{ marginTop: 40, borderTop: '2px dashed #e2e8f0', paddingTop: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={20} color="var(--orange-500)" /> CẤU HÌNH NGƯỠNG PHÊ DUYỆT TÀI CHÍNH (GIÁM ĐỐC)
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                Thiết lập hạn mức chi tiêu và tạm ứng vượt ngưỡng bắt buộc phải có Giám đốc phê duyệt.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveThresholds}
              disabled={savingThresholds}
              style={{ background: '#10b981', borderColor: '#10b981' }}
            >
              {savingThresholds ? 'Đang lưu...' : 'Lưu Cấu Hình Ngưỡng'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, background: '#f8fafc', padding: 24, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ background: '#fff', padding: 18, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
                Ngưỡng duyệt chi tự động / vượt cấp (VNĐ)
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  style={{ width: '100%', fontWeight: 700, fontSize: '1.2rem', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' }}
                  value={Number(thresholds.expense_approval_threshold || 0).toLocaleString('vi-VN')}
                  onChange={(e) => setThresholds(prev => ({ ...prev, expense_approval_threshold: Number(e.target.value.replace(/[^\d]/g, '')) }))}
                />
                <span style={{ position: 'absolute', right: 14, fontWeight: 700, color: '#64748b' }}>₫</span>
              </div>
              <small style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 6, display: 'block' }}>
                Mặc định: 2.000.000₫. Các khoản chi lớn hơn ngưỡng này cần Giám đốc duyệt.
              </small>
            </div>

            <div style={{ background: '#fff', padding: 18, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
                Ngưỡng tạm ứng cấp Giám đốc (VNĐ)
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  style={{ width: '100%', fontWeight: 700, fontSize: '1.2rem', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', outline: 'none' }}
                  value={Number(thresholds.advance_admin_threshold || 0).toLocaleString('vi-VN')}
                  onChange={(e) => setThresholds(prev => ({ ...prev, advance_admin_threshold: Number(e.target.value.replace(/[^\d]/g, '')) }))}
                />
                <span style={{ position: 'absolute', right: 14, fontWeight: 700, color: '#64748b' }}>₫</span>
              </div>
              <small style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 6, display: 'block' }}>
                Mặc định: 5.000.000₫. Các đề xuất tạm ứng vượt ngưỡng này cần thẩm định đặc biệt.
              </small>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
