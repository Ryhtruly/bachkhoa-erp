import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DataTable, Badge, Modal, FormRow, FormGrid, FilterBar, SubTabs, Dropdown } from '../../ui';
import { fmt, fmtShort, fmtAmt, parseAmt, docSoTiengViet, CATEGORY_AUTO_MAPPING } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip, ExcelGridTable } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { PlusCircle, RefreshCw, AlertCircle, Link } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import CashflowModal from '../modals/CashflowModal';
import CashflowDetailModal from '../modals/CashflowDetailModal';


export default function MonthlyDashboardScreen({ month: propMonth, setMonth: propSetMonth }) {
  const [localMonth, setLocalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const month = propMonth !== undefined ? propMonth : localMonth;
  const setMonth = propSetMonth !== undefined ? propSetMonth : setLocalMonth;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeChartTab, setActiveChartTab] = useState('category'); // 'category' | 'dept'
  const { addToast } = useToast();

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/finance/monthly-dashboard?month=${month}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
      } else {
        addToast('❌ Không thể tải dữ liệu báo cáo tháng', 'error');
      }
    } catch (e) {
      console.error(e);
      addToast('❌ Lỗi kết nối máy chủ', 'error');
    } finally {
      setLoading(false);
    }
  }, [month, addToast]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading && !data) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Đang tải báo cáo...</div>;
  }

  const d = data || {
    month: 7,
    year: 2026,
    tong_thu: 0,
    tong_chi: 0,
    chenh_lech: 0,
    categories: [],
    departments: []
  };

  const chartCategoriesData = d.categories.filter(c => c.thu > 0 || c.chi > 0);
  const chartDepartmentsData = d.departments.filter(dept => dept.thu > 0 || dept.chi > 0);

  return (
    <div style={{ padding: '16px 0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Selector Header */}
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '20px 24px',
        border: '1px solid #e2e8f0',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            📊 BẢNG ĐIỀU KHIỂN THU - CHI (THEO THÁNG)
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0 0' }}>
            Báo cáo tổng hợp doanh số thu chi theo Hạng mục và Phòng ban
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Chọn tháng:</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{
                height: 38,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
                fontWeight: 600,
                outline: 'none',
                color: '#1e293b'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, background: '#f1f5f9', padding: '6px 12px', borderRadius: 8, fontSize: '0.85rem' }}>
            <div><span style={{ color: '#64748b' }}>Tháng:</span> <strong style={{ color: '#0f172a' }}>{d.month}</strong></div>
            <div style={{ width: 1, background: '#cbd5e1' }}></div>
            <div><span style={{ color: '#64748b' }}>Năm:</span> <strong style={{ color: '#0f172a' }}>{d.year}</strong></div>
          </div>
        </div>
      </div>

      {/* 3 Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#ffffff', borderRadius: 16, padding: '20px 24px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
            💰
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tổng Thu</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', fontFamily: 'monospace', marginTop: 4 }}>
              {fmt(d.tong_thu)}
            </div>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: 16, padding: '20px 24px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
            💸
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tổng Chi</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444', fontFamily: 'monospace', marginTop: 4 }}>
              {fmt(d.tong_chi)}
            </div>
          </div>
        </div>

        <div style={{ background: d.chenh_lech >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 16, padding: '20px 24px', border: `1px solid ${d.chenh_lech >= 0 ? '#bbf7d0' : '#fecaca'}`, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: d.chenh_lech >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
            ⚖️
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chênh Lệch</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: d.chenh_lech >= 0 ? '#10b981' : '#ef4444', fontFamily: 'monospace', marginTop: 4 }}>
              {d.chenh_lech >= 0 ? '+' : ''}{fmt(d.chenh_lech)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout: Row-based Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* Row 1: Hạng Mục */}
        <div style={{ display: 'grid', gridTemplateColumns: '450px 1fr', gap: 24, alignItems: 'stretch' }}>
          
          {/* Table 1: Theo Hạng Mục */}
          <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              📁 Theo Hạng Mục
            </h3>
            <div style={{ flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left', fontWeight: 700 }}>
                    <th style={{ padding: '8px 12px', borderRadius: '6px 0 0 6px' }}>Hạng mục</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Thu</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', borderRadius: '0 6px 6px 0' }}>Chi</th>
                  </tr>
                </thead>
                <tbody>
                  {d.categories.map((cat, idx) => (
                    <tr key={idx} style={{ 
                      borderBottom: '1px solid #f1f5f9',
                      background: (cat.thu > 0 || cat.chi > 0) ? '#f0fdf4' : 'transparent',
                      fontWeight: (cat.thu > 0 || cat.chi > 0) ? 600 : 400
                    }}>
                      <td style={{ padding: '10px 12px', color: '#1e293b' }}>{cat.name}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: cat.thu > 0 ? '#10b981' : '#94a3b8' }}>
                        {cat.thu > 0 ? fmt(cat.thu) : '0'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: cat.chi > 0 ? '#ef4444' : '#94a3b8' }}>
                        {cat.chi > 0 ? fmt(cat.chi) : '0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chart 1: Hạng mục */}
          <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0' }}>
              📊 Thu / Chi theo Hạng mục phát sinh
            </h3>
            {chartCategoriesData.length === 0 ? (
              <div style={{ flex: 1, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
                Không có dữ liệu phát sinh trong tháng để hiển thị biểu đồ
              </div>
            ) : (
              <div style={{ flex: 1, width: '100%', minHeight: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartCategoriesData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                    <YAxis tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip formatter={(value) => [fmt(value), '']} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="thu" name="Thu" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="chi" name="Chi" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

        </div>

        {/* Row 2: Phòng Ban */}
        <div style={{ display: 'grid', gridTemplateColumns: '450px 1fr', gap: 24, alignItems: 'stretch' }}>
          
          {/* Table 2: Theo Phòng Ban */}
          <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              🏢 Theo Phòng Ban / Dự Án
            </h3>
            <div style={{ flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left', fontWeight: 700 }}>
                    <th style={{ padding: '8px 12px', borderRadius: '6px 0 0 6px' }}>Phòng ban / Dự án</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Thu</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', borderRadius: '0 6px 6px 0' }}>Chi</th>
                  </tr>
                </thead>
                <tbody>
                  {d.departments.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontStyle: 'italic' }}>
                        Không có phát sinh phòng ban
                      </td>
                    </tr>
                  ) : (
                    d.departments.map((dept, idx) => (
                      <tr key={idx} style={{ 
                        borderBottom: '1px solid #f1f5f9',
                        background: (dept.thu > 0 || dept.chi > 0) ? '#f0fdf4' : 'transparent',
                        fontWeight: (dept.thu > 0 || dept.chi > 0) ? 600 : 400
                      }}>
                        <td style={{ padding: '10px 12px', color: '#1e293b' }}>{dept.name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: dept.thu > 0 ? '#10b981' : '#94a3b8' }}>
                          {dept.thu > 0 ? fmt(dept.thu) : '0'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: dept.chi > 0 ? '#ef4444' : '#94a3b8' }}>
                          {dept.chi > 0 ? fmt(dept.chi) : '0'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chart 2: Phòng ban */}
          <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0' }}>
              📊 Phân bổ Thu / Chi theo Phòng ban
            </h3>
            {chartDepartmentsData.length === 0 ? (
              <div style={{ flex: 1, minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
                Không có dữ liệu phát sinh theo phòng ban
              </div>
            ) : (
              <div style={{ flex: 1, width: '100%', minHeight: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDepartmentsData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                    <YAxis tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip formatter={(value) => [fmt(value), '']} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="thu" name="Thu" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="chi" name="Chi" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
