import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DataTable, Badge, Modal, FormRow, FormGrid, FilterBar, SubTabs, Dropdown } from '../../ui';
import { fmt, fmtShort, fmtAmt, parseAmt, docSoTiengViet, CATEGORY_AUTO_MAPPING } from '../utils';
import { FinanceScreenHeader, BalanceCard, SummaryStrip, ExcelGridTable } from '../SharedFinanceUI';
import { API, CF_COLS } from '../financeConstants';
import { PlusCircle, RefreshCw, AlertCircle, Link, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import CashflowModal from '../modals/CashflowModal';
import CashflowDetailModal from '../modals/CashflowDetailModal';


export default function AnalyticsScreen({ mode = 'dashboard' }) {
  const [summary, setSummary] = useState({ tien_mat: 0, ngan_hang: 0, tam_ung_net: 0, monthly: [], profit_by_contract: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/finance/summary`).then(r => r.json()).then(setSummary).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Đang tải dữ liệu...</div>;

  if (mode === 'dashboard') return (
    <div>
      <FinanceScreenHeader 
        title="📊 Tổng Quan Tài Chính"
        subtitle="Biểu đồ xu hướng dòng tiền theo tháng"
      />

      {/* 3 Balance Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <BalanceCard title="Quỹ Tiền Mặt" amount={summary.tien_mat} icon="💵" subtitle="Thu TM − Chi TM" />
        <BalanceCard title="Số Dư Ngân Hàng" amount={summary.ngan_hang} icon="🏦" subtitle="Thu CK − Chi CK" />
        <BalanceCard title="Tạm Ứng Chưa Hoàn" amount={summary.tam_ung_net} icon="⏳" subtitle="Tạm ứng − Hoàn ứng" />
      </div>

      {/* Bar Chart */}
      <div className="card glass-card" style={{ padding: 24, marginBottom: 0 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4 }}>📈 Thu Chi Theo Tháng</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 20 }}>* Tổng dòng tiền Thu (xanh) và Chi (đỏ) theo từng tháng</p>
        {summary.monthly.length === 0 ? (
          <div className="finance-empty"><span className="finance-empty__icon">📉</span><span>Chưa có dữ liệu tháng</span></div>
        ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={summary.monthly} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} tickFormatter={v => fmtShort(v)} width={60} />
                <Tooltip formatter={v => fmt(v)} cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-card)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar name="Tổng Thu" dataKey="thu" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={40} />
                <Bar name="Tổng Chi" dataKey="chi" fill="#ef4444" radius={[5, 5, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );

  // mode === 'profit'
  return (
    <div>
      <FinanceScreenHeader 
        title="💰 Lợi Nhuận Theo Dự Án"
        subtitle="Lợi nhuận = Σ Thu − Σ Chi − Lương khoán tổ thợ (theo từng hợp đồng)"
      />
      <div className="card glass-card" style={{ padding: 24 }}>
        <div className="table-wrap">
          <table style={{ minWidth: 750 }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Mã Hợp Đồng</th>
                <th style={{ textAlign: 'right', color: '#10b981' }}>Tổng Thu</th>
                <th style={{ textAlign: 'right', color: '#ef4444' }}>Tổng Chi</th>
                <th style={{ textAlign: 'right', color: '#f59e0b' }}>Lương Khoán</th>
                <th style={{ textAlign: 'right' }}>Lợi Nhuận</th>
                <th style={{ textAlign: 'center', width: 130 }}>Biên lợi nhuận</th>
              </tr>
            </thead>
            <tbody>
              {summary.profit_by_contract.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>Chưa có dữ liệu lợi nhuận</td></tr>
              ) : summary.profit_by_contract.map((row, i) => {
                const margin = row.thu > 0 ? Math.round((row.profit / row.thu) * 100) : 0;
                const isPos = row.profit >= 0;
                return (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>{i + 1}</td>
                    <td><strong style={{ fontFamily: 'var(--font-mono)' }}>{row.contract_id}</strong></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600 }}>+{fmt(row.thu)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#ef4444' }}>−{fmt(row.chi)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>−{fmt(row.luong_khoan)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 800, color: isPos ? '#10b981' : '#ef4444' }}>
                      {isPos ? '+' : ''}{fmt(row.profit)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <div style={{ height: 6, width: 70, background: 'var(--bg-deep)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, margin))}%`, background: isPos ? '#10b981' : '#ef4444', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', width: 34 }}>{margin}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

