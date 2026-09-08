import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { DatePicker, Modal } from '../../ui';
import { fmt } from '../utils';
import { API } from '../financeConstants';
import { apiFetch, downloadFile } from '../../../lib/api';
import { printElement } from '../print/printDocument';
import FinancePrintReport from '../print/FinancePrintReport';
import {
  BarChart2, TrendingUp, TrendingDown, Scale, FolderKanban,
  BarChart3, Building2, FileSpreadsheet, Printer, Info, Loader2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function MonthlyDashboardScreen({ month: propMonth, setMonth: propSetMonth, user }) {
  const [localMonth, setLocalMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const month = propMonth !== undefined ? propMonth : localMonth;
  const setMonth = propSetMonth !== undefined ? propSetMonth : setLocalMonth;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const printDocumentRef = useRef(null);
  const { addToast } = useToast();

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`${API}/api/finance/monthly-dashboard?month=${month}`);
      setData(d);
    } catch (e) {
      console.error(e);
      addToast(e.message || 'Không thể tải dữ liệu báo cáo tháng', 'error');
    } finally {
      setLoading(false);
    }
  }, [month, addToast]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const filename = await downloadFile(
        `${API}/api/finance/export/monthly-dashboard-excel?month=${month}`,
        `Bao_Cao_Thu_Chi_${month}.xlsx`
      );
      if (filename) {
        addToast(`Đã xuất file ${filename} thành công`, 'success');
      }
    } catch (err) {
      addToast(err.message || 'Xuất file Excel thất bại', 'error');
    } finally {
      setExportingExcel(false);
    }
  };

  const handlePrint = () => {
    if (!printDocumentRef.current) return;
    printElement({
      element: printDocumentRef.current,
      title: `Báo Cáo Thu Chi Tháng ${month}`,
      onError: (msg) => addToast(msg, 'error')
    });
  };

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
    income: c.income ?? 0,
    expense: c.expenditure ?? c.expense ?? 0
  })).filter(c => c.income > 0 || c.expense > 0);

  const chartDepartmentsData = (d.departments || []).map(dept => ({
    name: dept.name,
    income: dept.income ?? 0,
    expense: dept.expenditure ?? dept.expense ?? 0
  })).filter(dept => dept.income > 0 || dept.expense > 0);

  // Cấu hình bảng in A4
  const printColumns = [
    { key: 'name', label: 'Hạng mục / Phòng ban', align: 'left' },
    { key: 'income', label: 'Tổng thu', align: 'right', format: (val) => val > 0 ? fmt(val) : '0' },
    { key: 'expenditure', label: 'Tổng chi', align: 'right', format: (val) => val > 0 ? fmt(val) : '0' },
    { key: 'net', label: 'Chênh lệch', align: 'right', format: (_, row) => fmt((row.income || 0) - (row.expenditure || row.expense || 0)) },
  ];

  const printRows = (d.categories || []).map((cat) => ({
    name: cat.name,
    income: cat.income || 0,
    expenditure: cat.expenditure || cat.expense || 0
  })).filter(row => row.income > 0 || row.expenditure > 0);

  const printFooterRow = (
    <tr className="finance-print-footer-row">
      <td style={{ fontWeight: 700 }}>Tổng cộng</td>
      <td className="is-right" style={{ fontWeight: 700, color: '#059669' }}>{fmt(totalIncome)}</td>
      <td className="is-right" style={{ fontWeight: 700, color: '#dc2626' }}>{fmt(totalExpenditure)}</td>
      <td className="is-right" style={{ fontWeight: 700, color: netDifference >= 0 ? '#059669' : '#dc2626' }}>{fmt(netDifference)}</td>
    </tr>
  );

  return (
    <div className="finance-monthly-dashboard" data-testid="finance-monthly-dashboard" style={{ padding: 0, fontFamily: 'system-ui, sans-serif' }}>
      {/* Selector Header */}
      <div className="finance-monthly-dashboard__header" style={{
        background: 'var(--bg-card)',
        borderRadius: 14,
        padding: '16px 20px',
        border: '1px solid var(--border-default)',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14
      }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={22} color="var(--orange-500)" /> Báo cáo thu - chi theo tháng
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', margin: '4px 0 0 0' }}>
            Báo cáo tổng hợp doanh số thu chi phân bổ theo Hạng mục chi phí và Phòng ban
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Chọn tháng:</span>
            <DatePicker
              selectionMode="month"
              value={month}
              onChange={setMonth}
              placeholder="Chọn tháng báo cáo"
              dialogLabel="Chọn tháng báo cáo thu chi"
              clearable={false}
            />
          </div>

          {/* Export Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportExcel}
              disabled={exportingExcel}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600 }}
              title="Tải bảng tính Excel (.xlsx)"
            >
              {exportingExcel ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} color="#10b981" />}
              <span>Xuất Excel</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPrintPreviewOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600 }}
              title="Xem trước mẫu in khổ A4 và in/lưu PDF"
            >
              <Printer size={16} color="var(--orange-500)" />
              <span>Xem trước &amp; in A4</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: '8px 14px',
        margin: '0 0 12px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <Info size={16} color="var(--orange-500)" style={{ flexShrink: 0 }} />
        <span>
          Số liệu báo cáo được tổng hợp tự động từ các <strong>Phiếu Thu / Phiếu Chi đã hoàn thành</strong> trong tháng {month.split('-')[1]}/{month.split('-')[0]}.
        </span>
      </div>

      {/* 3 Summary Cards */}
      <div className="finance-monthly-dashboard__summary-grid" data-testid="finance-monthly-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={22} color="#10b981" />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tổng Thu</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', fontFamily: 'monospace', marginTop: 4 }}>
              {fmt(totalIncome)}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingDown size={22} color="#ef4444" />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tổng Chi</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444', fontFamily: 'monospace', marginTop: 4 }}>
              {fmt(totalExpenditure)}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: netDifference >= 0 ? 'rgba(59,130,246,0.12)' : 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Scale size={22} color={netDifference >= 0 ? '#3b82f6' : '#ef4444'} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chênh Lệch Thu - Chi</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: netDifference >= 0 ? 'var(--text-primary)' : '#ef4444', fontFamily: 'monospace', marginTop: 4 }}>
              {fmt(netDifference)}
            </div>
          </div>
        </div>
      </div>

      {/* Grid: 2 Hàng (Hạng mục & Phòng ban) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        
        {/* PHẦN 1: THEO HẠNG MỤC THU / CHI */}
        <div
          className="finance-monthly-dashboard__split"
          data-testid="finance-monthly-split"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 20 }}
        >
          
          {/* Bảng 1: Hạng mục */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-default)', padding: 20 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FolderKanban size={18} color="var(--orange-500)" /> Cơ Cấu Theo Danh Mục Thu & Chi
            </h3>
            <div style={{ overflowX: 'auto', maxHeight: 320 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border-default)', textAlign: 'left', color: 'var(--text-tertiary)' }}>
                    <th style={{ padding: '8px 12px', fontWeight: 700 }}>Hạng mục</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Thu (VNĐ)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Chi (VNĐ)</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.categories || []).length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        Chưa có dữ liệu danh mục trong tháng này
                      </td>
                    </tr>
                  ) : (
                    (d.categories || []).map((cat, idx) => {
                      const inc = cat.income ?? 0;
                      const exp = cat.expenditure ?? cat.expense ?? 0;
                      return (
                        <tr key={idx} style={{ 
                          borderBottom: '1px solid var(--border-subtle)',
                          background: (inc > 0 || exp > 0) ? 'color-mix(in srgb, var(--orange-500) 4%, var(--bg-card))' : 'transparent',
                          fontWeight: (inc > 0 || exp > 0) ? 600 : 400
                        }}>
                          <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>{cat.name}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: inc > 0 ? '#10b981' : 'var(--text-tertiary)' }}>
                            {inc > 0 ? fmt(inc) : '0'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: exp > 0 ? '#ef4444' : 'var(--text-tertiary)' }}>
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

          {/* Chart 1: Hạng mục */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-default)', padding: 20, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={18} color="var(--orange-500)" /> Biểu Đồ Thu Chi Theo Danh Mục
            </h3>
            {chartCategoriesData.length === 0 ? (
              <div style={{ flex: 1, minHeight: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                Không có dữ liệu phát sinh theo danh mục
              </div>
            ) : (
              <div style={{ flex: 1, width: '100%', minHeight: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartCategoriesData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} stroke="var(--border-default)" />
                    <YAxis tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} stroke="var(--border-default)" />
                    <Tooltip
                      formatter={(value) => [fmt(value), '']}
                      contentStyle={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'var(--border-default)',
                        color: 'var(--text-primary)',
                        borderRadius: 8,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
                    <Bar dataKey="income" name="Thu" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Chi" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

        </div>

        {/* PHẦN 2: THEO PHÒNG BAN */}
        <div
          className="finance-monthly-dashboard__split"
          data-testid="finance-monthly-split"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 20 }}
        >
          
          {/* Bảng 2: Phòng ban */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-default)', padding: 20 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={18} color="var(--orange-500)" /> Phân Bổ Theo Phòng Ban
            </h3>
            <div style={{ overflowX: 'auto', maxHeight: 320 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border-default)', textAlign: 'left', color: 'var(--text-tertiary)' }}>
                    <th style={{ padding: '8px 12px', fontWeight: 700 }}>Phòng ban</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Doanh thu (VNĐ)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Chi phí (VNĐ)</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.departments || []).length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        Chưa có dữ liệu phòng ban trong tháng này
                      </td>
                    </tr>
                  ) : (
                    (d.departments || []).map((dept, idx) => {
                      const inc = dept.income ?? 0;
                      const exp = dept.expenditure ?? 0;
                      return (
                        <tr key={idx} style={{ 
                          borderBottom: '1px solid var(--border-subtle)',
                          background: (inc > 0 || exp > 0) ? 'color-mix(in srgb, var(--green-500) 8%, var(--bg-card))' : 'transparent',
                          fontWeight: (inc > 0 || exp > 0) ? 600 : 400
                        }}>
                          <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>{dept.name}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: inc > 0 ? '#10b981' : 'var(--text-tertiary)' }}>
                            {inc > 0 ? fmt(inc) : '0'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: exp > 0 ? '#ef4444' : 'var(--text-tertiary)' }}>
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
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-default)', padding: 20, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={18} color="var(--orange-500)" /> Phân Bổ Doanh Thu & Chi Phí Theo Phòng Ban
            </h3>
            {chartDepartmentsData.length === 0 ? (
              <div style={{ flex: 1, minHeight: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                Không có dữ liệu phát sinh theo phòng ban
              </div>
            ) : (
              <div style={{ flex: 1, width: '100%', minHeight: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDepartmentsData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} stroke="var(--border-default)" />
                    <YAxis tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} stroke="var(--border-default)" />
                    <Tooltip
                      formatter={(value) => [fmt(value), '']}
                      contentStyle={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'var(--border-default)',
                        color: 'var(--text-primary)',
                        borderRadius: 8,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
                    <Bar dataKey="income" name="Thu" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Chi" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Modal Xem Trước & In A4 Báo Cáo Tháng */}
      <Modal
        open={printPreviewOpen}
        onClose={() => setPrintPreviewOpen(false)}
        title="Xem Trước Bản In Báo Cáo Dòng Tiền & Thu Chi (Khổ A4)"
        size="2xl"
        overlayClassName="payroll-preview-modal"
        className="payroll-preview-modal"
        footer={(
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPrintPreviewOpen(false)}
            >
              Đóng
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePrint}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Printer size={16} />
              <span>In / Lưu PDF</span>
            </button>
          </div>
        )}
      >
        <div className="payroll-preview-modal__document">
          <FinancePrintReport
            documentRef={printDocumentRef}
            title="BÁO CÁO DÒNG TIỀN VÀ KẾT QUẢ THU CHI"
            subtitle={`Thời gian: Tháng ${month.split('-')[1]}/${month.split('-')[0]} · Sổ quỹ toàn hệ thống`}
            summary={[
              { label: 'Tổng thu thực tế', value: fmt(totalIncome) },
              { label: 'Tổng chi phí', value: fmt(totalExpenditure) },
              { label: 'Chênh lệch thuần (Net)', value: fmt(netDifference) },
            ]}
            columns={printColumns}
            rows={printRows}
            footerRow={printFooterRow}
            signers={[
              { role: 'Người lập biểu', name: user?.full_name || user?.username || '', note: '(Ký, họ tên)' },
              { role: 'Kế toán trưởng', note: '(Ký, họ tên)' },
              { role: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' },
            ]}
            emptyText="Không có dữ liệu thu chi trong tháng"
          />
        </div>
      </Modal>
    </div>
  );
}
