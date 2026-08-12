import React, { useState, useEffect, useCallback } from 'react';
import { Users } from 'lucide-react';
import { Badge, DataTable } from '../../ui';
import { fmt } from '../utils';
import { API } from '../financeConstants';

export default function PayrollOfficeScreen() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (month) p.set('month', month);
    const r = await fetch(`${API}/api/finance/payroll?${p}`);
    setData(await r.json());
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const cols = [
    { key: 'full_name', label: 'Họ & Tên', render: v => <strong>{v || 'Chưa cập nhật'}</strong> },
    { key: 'department', label: 'Phòng ban' },
    { key: 'base_salary', label: 'Lương cơ bản', width: 130, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(v)}</span> },
    { key: 'kpi_score', label: 'Điểm KPI', width: 90, align: 'center', render: v => <Badge variant={v >= 8 ? 'success' : v >= 5 ? 'warning' : 'danger'}>{v}</Badge> },
    { key: 'bonus', label: 'Hoa hồng / Thưởng', width: 145, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 600 }}>+{fmt(v)}</span> },
    { key: 'total_salary', label: 'Tổng lương thực nhận', width: 160, align: 'right', render: v => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--orange-500)' }}>{fmt(v)}</span> },
    { key: 'month', label: 'Tháng', width: 90, render: v => <span style={{ fontFamily: 'var(--font-mono)' }}>{v || '—'}</span> },
  ];

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h3><Users size={20} /> Lương VP & Hoa Hồng Sales</h3>
          <div className="sub">Lương cơ bản + KPI + Hoa hồng BĐS theo tháng</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Tháng:</span>
          <input type="month" className="custom-select" style={{ width: 150, padding: '8px 12px' }} value={month} onChange={e => setMonth(e.target.value)} />
        </div>
      </div>
      {data.length === 0 && !loading ? (
        <div className="finance-empty"><span className="finance-empty__icon">👥</span><span>Chưa có dữ liệu nhân sự. Cần thêm nhân viên vào bảng <code>employees</code>.</span></div>
      ) : (
        <DataTable columns={cols} data={data} loading={loading} rowKey="id" emptyText="Chưa có nhân sự" pageSize={15} />
      )}
    </div>
  );
}
