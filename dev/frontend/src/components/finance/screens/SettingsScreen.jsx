import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DataTable, Badge, Modal, FormRow, FormGrid, FilterBar, SubTabs, Dropdown } from '../../ui';
import { fmt, fmtShort, fmtAmt, parseAmt, docSoTiengViet, CATEGORY_AUTO_MAPPING, getLocalISOTime } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip, ExcelGridTable } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { Check, AlertCircle, Settings, Link, RefreshCw, PlusCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import CashflowModal from '../modals/CashflowModal';
import CashflowDetailModal from '../modals/CashflowDetailModal';


export default function SettingsScreen() {
  const [ngayChot, setNgayChot] = useState(getLocalISOTime());
  const [soDuHeThongTM, setSoDuHeThongTM] = useState(0);
  const [soDuThucTeTM, setSoDuThucTeTM] = useState('');
  const [ghiChuTM, setGhiChuTM] = useState('');

  const [soDuHeThongCK, setSoDuHeThongCK] = useState(0);
  const [soDuThucTeCK, setSoDuThucTeCK] = useState('');
  const [ghiChuCK, setGhiChuCK] = useState('');

  const [nguoiChot, setNguoiChot] = useState('Lê Văn Dựng');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterMonth, setFilterMonth] = useState('');
  const { addToast } = useToast();

  const filteredHistory = useMemo(() => {
    if (!filterMonth) return history;
    const [filterYr, filterMo] = filterMonth.split('-');
    return history.filter(row => {
      if (!row.ngay_ap_dung) return false;
      const parts = row.ngay_ap_dung.split(' ')[0].split('/');
      if (parts.length < 3) return false;
      const [d, m, y] = parts;
      return y === filterYr && m === filterMo;
    });
  }, [history, filterMonth]);

  const fetchSystemBalance = useCallback(async () => {
    setLoading(true);
    try {
      const isoString = new Date(ngayChot).toISOString();
      const [resTM, resCK] = await Promise.all([
        fetch(`${API}/api/finance/fund-balances/calculate?hinh_thuc=${encodeURIComponent('Tiền mặt')}&ngay_chot=${encodeURIComponent(isoString)}`),
        fetch(`${API}/api/finance/fund-balances/calculate?hinh_thuc=${encodeURIComponent('Chuyển khoản')}&ngay_chot=${encodeURIComponent(isoString)}`)
      ]);
      if (resTM.ok && resCK.ok) {
        const dTM = await resTM.json();
        const dCK = await resCK.json();
        setSoDuHeThongTM(dTM.so_du_he_thong || 0);
        setSoDuHeThongCK(dCK.so_du_he_thong || 0);
      } else {
        addToast('❌ Không thể tính toán số dư từ hệ thống', 'error');
      }
    } catch {
      console.log("Lỗi kết nối API");
    } finally {
      setLoading(false);
    }
  }, [ngayChot, addToast]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API}/api/finance/fund-balances/history`);
      if (res.ok) {
        const d = await res.json();
        setHistory(d);
      }
    } catch (e) {
      console.error("Lỗi lấy lịch sử chốt quỹ", e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchSystemBalance();
    fetchHistory();
  }, [fetchSystemBalance, fetchHistory]);

  const valThucTeTM = soDuThucTeTM === '' ? 0 : Number(soDuThucTeTM);
  const chenhLechTM = soDuThucTeTM === '' ? 0 : valThucTeTM - soDuHeThongTM;

  const valThucTeCK = soDuThucTeCK === '' ? 0 : Number(soDuThucTeCK);
  const chenhLechCK = soDuThucTeCK === '' ? 0 : valThucTeCK - soDuHeThongCK;

  const formatInputDisplay = (val) => {
    if (val === '') return '';
    return Number(val).toLocaleString('vi-VN');
  };

  const getChenhLechMeta = (cl, hasInput) => {
    if (!hasInput) return { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', msg: 'Chưa nhập số thực tế' };
    if (cl === 0) return { color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0', msg: 'Khớp quỹ hoàn toàn' };
    if (cl < 0) return { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', msg: 'Thiếu (Tự sinh PC)' };
    return { color: '#ef4444', bg: '#eff6ff', border: '#bfdbfe', msg: 'Thừa (Tự sinh PT)' };
  };

  const clMetaTM = getChenhLechMeta(chenhLechTM, soDuThucTeTM !== '');
  const clMetaCK = getChenhLechMeta(chenhLechCK, soDuThucTeCK !== '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (soDuThucTeTM === '' && soDuThucTeCK === '') {
      addToast('⚠️ Vui lòng nhập ít nhất một số dư thực tế để chốt quỹ!', 'warning');
      return;
    }
    if (soDuThucTeTM !== '' && chenhLechTM !== 0 && !ghiChuTM.trim()) {
      addToast('⚠️ Bắt buộc phải nhập giải trình lý do chênh lệch cho Quỹ Tiền Mặt!', 'warning');
      return;
    }
    if (soDuThucTeCK !== '' && chenhLechCK !== 0 && !ghiChuCK.trim()) {
      addToast('⚠️ Bắt buộc phải nhập giải trình lý do chênh lệch cho Quỹ Chuyển Khoản!', 'warning');
      return;
    }

    setSaving(true);
    try {
      const promises = [];
      const isoString = new Date(ngayChot).toISOString();

      if (soDuThucTeTM !== '') {
        promises.push(
          fetch(`${API}/api/finance/fund-balances/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hinh_thuc: 'Tiền mặt',
              so_tien_thuc_te: valThucTeTM,
              ngay_chot: isoString,
              ghi_chu: ghiChuTM,
              nguoi_chot: nguoiChot
            })
          })
        );
      }

      if (soDuThucTeCK !== '') {
        promises.push(
          fetch(`${API}/api/finance/fund-balances/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hinh_thuc: 'Chuyển khoản',
              so_tien_thuc_te: valThucTeCK,
              ngay_chot: isoString,
              ghi_chu: ghiChuCK,
              nguoi_chot: nguoiChot
            })
          })
        );
      }

      const results = await Promise.all(promises);
      const allOk = results.every(res => res.ok);

      if (allOk) {
        addToast('✅ Xác nhận chốt quỹ và thiết lập đầu kỳ mới thành công!', 'success');
        setSoDuThucTeTM('');
        setGhiChuTM('');
        setSoDuThucTeCK('');
        setGhiChuCK('');
        fetchSystemBalance();
        fetchHistory();
      } else {
        addToast(' Lỗi hệ thống khi chốt quỹ', 'error');
      }
    } catch {
      addToast(' Lỗi kết nối máy chủ', 'error');
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
              <input
                type="datetime-local"
                style={{ width: '100%', height: 42, padding: '0 14px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: '0.95rem', outline: 'none', background: '#ffffff', boxSizing: 'border-box' }}
                value={ngayChot}
                onChange={(e) => { 
                  setNgayChot(e.target.value); 
                  setSoDuThucTeTM(''); 
                  setSoDuThucTeCK(''); 
                  setTimeout(() => fetchSystemBalance(), 0);
                }}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Người thực hiện chốt</label>
              <input
                type="text"
                style={{ width: '100%', height: 42, padding: '0 14px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: '0.95rem', outline: 'none', background: '#ffffff', boxSizing: 'border-box' }}
                value={nguoiChot}
                onChange={(e) => setNguoiChot(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Khối 2: Hai Cột Quỹ song song */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

            {/* Quỹ Tiền Mặt */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, padding: 24, background: '#ffffff', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
              <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                💵 QUỸ TIỀN MẶT (KÉT SẮT)
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>SỐ DƯ HỆ THỐNG</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', marginTop: 4 }}>
                    {loading ? '⏳...' : `${soDuHeThongTM.toLocaleString('vi-VN')}₫`}
                  </div>
                </div>

                <div style={{ border: '2px solid #ef4444', borderRadius: 12, padding: 16 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ef4444', letterSpacing: '0.05em' }}>SỐ DƯ THỰC TẾ *</span>
                  <div style={{ position: 'relative', width: '100%', marginTop: 8, display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      style={{ width: '100%', fontWeight: 800, fontSize: '1.3rem', border: 'none', borderBottom: '2px solid #e2e8f0', textAlign: 'right', paddingRight: 24, outline: 'none', paddingBottom: 4 }}
                      value={formatInputDisplay(soDuThucTeTM)}
                      onChange={(e) => setSoDuThucTeTM(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="0"
                    />
                    <span style={{ position: 'absolute', right: 2, fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>₫</span>
                  </div>
                </div>

                <div style={{ background: clMetaTM.bg, border: `1px solid ${clMetaTM.border}`, borderRadius: 12, padding: 16 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>CHÊNH LỆCH</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace', color: clMetaTM.color, margin: '6px 0' }}>
                    {soDuThucTeTM === '' ? '—' : (chenhLechTM === 0 ? '±0₫' : (chenhLechTM > 0 ? `+${chenhLechTM.toLocaleString('vi-VN')}₫` : `-${Math.abs(chenhLechTM).toLocaleString('vi-VN')}₫`))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: clMetaTM.color, fontSize: '0.75rem', fontWeight: 700 }}>
                    {soDuThucTeTM !== '' && (chenhLechTM === 0 ? <Check size={14} /> : <AlertCircle size={14} />)}
                    <span>{clMetaTM.msg}</span>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                    Giải trình chênh lệch {soDuThucTeTM !== '' && chenhLechTM !== 0 && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <textarea
                    style={{ width: '100%', height: 60, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem', outline: 'none', resize: 'none', lineHeight: 1.4, boxSizing: 'border-box' }}
                    value={ghiChuTM}
                    onChange={(e) => setGhiChuTM(e.target.value)}
                    placeholder={soDuThucTeTM !== '' && chenhLechTM !== 0 ? "Bắt buộc nhập lý do chênh lệch tiền mặt..." : "Ghi chú kiểm kê két sắt..."}
                    required={soDuThucTeTM !== '' && chenhLechTM !== 0}
                  />
                </div>
              </div>
            </div>

            {/* Quỹ Chuyển Khoản */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, padding: 24, background: '#ffffff', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
              <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                🏦 QUỸ CHUYỂN KHOẢN (NGÂN HÀNG)
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>SỐ DƯ HỆ THỐNG</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', marginTop: 4 }}>
                    {loading ? '⏳...' : `${soDuHeThongCK.toLocaleString('vi-VN')}₫`}
                  </div>
                </div>

                <div style={{ border: '2px solid #ef4444', borderRadius: 12, padding: 16 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ef4444', letterSpacing: '0.05em' }}>SỐ DƯ THỰC TẾ *</span>
                  <div style={{ position: 'relative', width: '100%', marginTop: 8, display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      style={{ width: '100%', fontWeight: 800, fontSize: '1.3rem', border: 'none', borderBottom: '2px solid #e2e8f0', textAlign: 'right', paddingRight: 24, outline: 'none', paddingBottom: 4 }}
                      value={formatInputDisplay(soDuThucTeCK)}
                      onChange={(e) => setSoDuThucTeCK(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="0"
                    />
                    <span style={{ position: 'absolute', right: 2, fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>₫</span>
                  </div>
                </div>

                <div style={{ background: clMetaCK.bg, border: `1px solid ${clMetaCK.border}`, borderRadius: 12, padding: 16 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>CHÊNH LỆCH</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace', color: clMetaCK.color, margin: '6px 0' }}>
                    {soDuThucTeCK === '' ? '—' : (chenhLechCK === 0 ? '±0₫' : (chenhLechCK > 0 ? `+${chenhLechCK.toLocaleString('vi-VN')}₫` : `-${Math.abs(chenhLechCK).toLocaleString('vi-VN')}₫`))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: clMetaCK.color, fontSize: '0.75rem', fontWeight: 700 }}>
                    {soDuThucTeCK !== '' && (chenhLechCK === 0 ? <Check size={14} /> : <AlertCircle size={14} />)}
                    <span>{clMetaCK.msg}</span>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                    Giải trình chênh lệch {soDuThucTeCK !== '' && chenhLechCK !== 0 && <span style={{ color: '#ef4444' }}>*</span>}
                  </label>
                  <textarea
                    style={{ width: '100%', height: 60, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem', outline: 'none', resize: 'none', lineHeight: 1.4, boxSizing: 'border-box' }}
                    value={ghiChuCK}
                    onChange={(e) => setGhiChuCK(e.target.value)}
                    placeholder={soDuThucTeCK !== '' && chenhLechCK !== 0 ? "Bắt buộc nhập lý do chênh lệch chuyển khoản..." : "Ghi chú kiểm kê app bank..."}
                    required={soDuThucTeCK !== '' && chenhLechCK !== 0}
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
              📋 LỊCH SỬ CHỐT QUỸ TRƯỚC ĐÓ
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>Chọn tháng:</span>
                <input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  style={{
                    height: 32,
                    padding: '0 8px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    outline: 'none',
                    color: '#1e293b',
                    background: '#ffffff'
                  }}
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
                      <td style={{ padding: '12px 8px', fontWeight: 500, color: '#334155' }}>{row.ngay_ap_dung}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: row.hinh_thuc === 'Tiền mặt' ? '#eff6ff' : '#f0fdf4',
                          color: row.hinh_thuc === 'Tiền mặt' ? '#1d4ed8' : '#15803d',
                          border: `1px solid ${row.hinh_thuc === 'Tiền mặt' ? '#bfdbfe' : '#bbf7d0'}`
                        }}>
                          {row.hinh_thuc === 'Tiền mặt' ? 'Tiền mặt' : 'Ckhoản'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                        {fmt(row.so_tien_dau_ky)}
                      </td>
                      <td style={{ padding: '12px 8px', color: '#475569' }}>{row.nguoi_chot || '—'}</td>
                      <td style={{ padding: '12px 8px', color: '#64748b', fontSize: '0.85rem' }}>{row.ghi_chu || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
