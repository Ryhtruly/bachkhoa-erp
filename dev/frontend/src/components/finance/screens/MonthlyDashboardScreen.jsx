import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DatePicker } from '../../ui';
import { fmt } from '../utils';
import { API } from '../financeConstants';
import { BarChart2, TrendingUp, TrendingDown, Scale, FolderKanban, BarChart3, Building2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function MonthlyDashboardScreen({ month: propMonth, setMonth: propSetMonth }) {
  const [localMonth, setLocalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const month = propMonth !== undefined ? propMonth : localMonth;
  const setMonth = propSetMonth !== undefined ? propSetMonth : setLocalMonth;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/finance/monthly-dashboard?month=${month}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
      } else {
        addToast('Không thể tải dữ liệu báo cáo tháng', 'error');
      }
    } catch (e) {
      console.error(e);
      addToast('Lỗi kết nối máy chủ', 'error');
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
    month: Number(month.split('-')[1] || 8),
    year: Number(month.split('-')[0] || 2026),
    total_income: 0,
    total_expenditure: 0,
    net_difference: 0,
    categories: [],
    departments: []
  };

  const totalIncome = d.total_income || 0;
  const totalExpenditure = d.total_expenditure || 0;
  const netDifference = d.net_difference || 0;

  const chartCategoriesData = (d.categories || []).map(c => ({
    name: c.name,
    income: c.income ?? c.thu ?? 0,
    expense: c.expenditure ?? c.expense ?? c.chi ?? 0
  })).filter(c => c.income > 0 || c.expense > 0);

  const chartDepartmentsData = (d.departments || []).map(dept => ({
    name: dept.name,
    income: dept.income ?? dept.thu ?? 0,
    expense: dept.expenditure ?? dept.expense ?? dept.chi ?? 0
  })).filter(dept => dept.income > 0 || dept.expense > 0);

  return (
    <div style={{ padding: '8px 0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Selector Header */}
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '20px 24px',
        border: '1px solid #e2e8f0',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={22} color="var(--orange-500)" /> BẢNG ĐIỀU KHIỂN THU - CHI (THEO THÁNG)
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0 0' }}>
            Báo cáo tổng hợp doanh số thu chi phân bổ theo Hạng mục chi phí và Phòng ban
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Chọn tháng:</span>
            <DatePicker
              selectionMode="month"
              value={month}
              onChange={setMonth}
              placeholder="Chọn tháng báo cáo"
              dialogLabel="Chọn tháng báo cáo thu chi"
              clearable={false}
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
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={22} color="#10b981" />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tổng Thu</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', fontFamily: 'monospace', marginTop: 4 }}>
              {fmt(totalIncome)}
            </div>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: 16, padding: '20px 24px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingDown size={22} color="#ef4444" />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tổng Chi</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444', fontFamily: 'monospace', marginTop: 4 }}>
              {fmt(totalExpenditure)}
            </div>
          </div>
        </div>

        <div style={{ background: netDifference >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 16, padding: '20px 24px', border: `1px solid ${netDifference >= 0 ? '#bbf7d0' : '#fecaca'}`, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: netDifference >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Scale size={22} color={netDifference >= 0 ? '#10b981' : '#ef4444'} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chênh Lệch</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: netDifference >= 0 ? '#10b981' : '#ef4444', fontFamily: 'monospace', marginTop: 4 }}>
              {netDifference >= 0 ? '+' : ''}{fmt(netDifference)}
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
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FolderKanban size={18} color="var(--orange-500)" /> Theo Hạng Mục Chi Phí
            </h3>
            <div style={{ flex: 1, maxHeight: 380, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left', fontWeight: 700 }}>
                    <th style={{ padding: '8px 12px', borderRadius: '6px 0 0 6px' }}>Hạng mục</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Thu</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', borderRadius: '0 6px 6px 0' }}>Chi</th>
                  </tr>
                </thead>
                <tbody>
                  {d.categories.map((cat, idx) => {
                    const inc = cat.income ?? cat.thu ?? 0;
                    const exp = cat.expenditure ?? cat.expense ?? cat.chi ?? 0;
                    return (
                      <tr key={idx} style={{ 
                        borderBottom: '1px solid #f1f5f9',
                        background: (inc > 0 || exp > 0) ? '#f0fdf4' : 'transparent',
                        fontWeight: (inc > 0 || exp > 0) ? 600 : 400
                      }}>
                        <td style={{ padding: '10px 12px', color: '#1e293b' }}>{cat.name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: inc > 0 ? '#10b981' : '#94a3b8' }}>
                          {inc > 0 ? fmt(inc) : '0'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: exp > 0 ? '#ef4444' : '#94a3b8' }}>
                          {exp > 0 ? fmt(exp) : '0'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chart 1: Hạng mục */}
          <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={18} color="var(--orange-500)" /> Biểu Đồ Thu / Chi Theo Hạng Mục
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
                    <Bar dataKey="income" name="Thu" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Chi" fill="#ef4444" radius={[4, 4, 0, 0]} />
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
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={18} color="var(--orange-500)" /> Theo Phòng Ban Chức Năng
            </h3>
            <div style={{ flex: 1, maxHeight: 380, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'left', fontWeight: 700 }}>
                    <th style={{ padding: '8px 12px', borderRadius: '6px 0 0 6px' }}>Phòng ban</th>
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
                    d.departments.map((dept, idx) => {
                      const inc = dept.income ?? dept.thu ?? 0;
                      const exp = dept.expenditure ?? dept.expense ?? dept.chi ?? 0;
                      return (
                        <tr key={idx} style={{ 
                          borderBottom: '1px solid #f1f5f9',
                          background: (inc > 0 || exp > 0) ? '#f0fdf4' : 'transparent',
                          fontWeight: (inc > 0 || exp > 0) ? 600 : 400
                        }}>
                          <td style={{ padding: '10px 12px', color: '#1e293b' }}>{dept.name}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: inc > 0 ? '#10b981' : '#94a3b8' }}>
                            {inc > 0 ? fmt(inc) : '0'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: exp > 0 ? '#ef4444' : '#94a3b8' }}>
                            {exp > 0 ? fmt(exp) : '0'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chart 2: Phòng ban */}
          <div style={{ background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={18} color="var(--orange-500)" /> Phân Bổ Doanh Thu & Chi Phí Theo Phòng Ban
            </h3>
            {chartDepartmentsData.length === 0 ? (
              <div style={{ flex: 1, minHeight: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
                Không có dữ liệu phát sinh theo phòng ban
              </div>
            ) : (
              <div style={{ flex: 1, width: '100%', minHeight: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDepartmentsData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" />
                    <YAxis tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip formatter={(value) => [fmt(value), '']} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="income" name="Thu" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Chi" fill="#6366f1" radius={[4, 4, 0, 0]} />
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
