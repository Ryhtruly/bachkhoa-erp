import React, { useState, useEffect, useCallback } from 'react';
import { Banknote, Users, Hammer } from 'lucide-react';
import { SubTabs, DataTable, Badge } from '../components/ui';

const API = 'http://127.0.0.1:8080';
const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + '₫';

// ════════════════════════════════════════════════════════════════════════════
// Screen 1: Lương Khoán 3P
// ════════════════════════════════════════════════════════════════════════════
function LuongKhoan3P() {
  const [payroll, setPayroll] = useState({ month: new Date().toISOString().slice(0, 7), total_count: 0, total_amount: 0, details: [] });
  const [loading, setLoading] = useState(true);

  const fetchPayroll = async (month) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/luong/khoan?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : data.details || [];
        setPayroll({
          month,
          total_count: arr.length,
          total_amount: arr.reduce((sum, item) => sum + (Number(item['Tổng nhận']) || 0), 0),
          details: arr
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayroll(payroll.month);
  }, []);

  return (
    <div className="card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h3><Banknote size={20} /> Lương khoán 3P</h3>
          <div className="sub">Tự động tính dựa trên cơ chế khoán cho hồ sơ hoàn thành.</div>
        </div>
        <div className="flex-center" style={{ gap: '8px' }}>
          <label style={{ margin: 0, whiteSpace: 'nowrap' }}>Tháng</label>
          <input 
            type="month" 
            className="custom-select"
            value={payroll.month} 
            onChange={e => fetchPayroll(e.target.value)} 
            style={{ width: '150px', padding: '8px 12px' }} 
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
        <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '8px', flex: 1 }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--purple-600)' }}>{payroll.total_count}</span>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Hồ sơ hoàn thành trong tháng</p>
        </div>
        <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '8px', flex: 1 }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 700 }} className="text-success">{fmt(payroll.total_amount)}</span>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Tổng quỹ lương khoán</p>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nhân sự</th>
              <th>Mã HS</th>
              <th>Công đoạn</th>
              <th>Tiền khoán</th>
              <th>Phụ cấp</th>
              <th>Thưởng/phạt</th>
              <th>Tổng nhận</th>
              <th>Ngày chốt</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>Đang tải...</td></tr>
            ) : payroll.details.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Chưa có dữ liệu lương</td></tr>
            ) : (
              payroll.details.map((p, i) => (
                <tr key={i}>
                  <td><strong>{p['Nhân sự']}</strong></td>
                  <td>{p['Mã hồ sơ']}</td>
                  <td>{p['Công đoạn khoán']}</td>
                  <td>{fmt(p['Số tiền khoán'])}</td>
                  <td>{fmt(p['Phụ cấp'])}</td>
                  <td>{fmt(p['Thưởng/Phạt'])}</td>
                  <td className="text-success" style={{ fontWeight: 600 }}>{fmt(p['Tổng nhận'])}</td>
                  <td>{p['Ngày chốt']}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Screen 2: Lương văn phòng & hoa hồng
// ════════════════════════════════════════════════════════════════════════════
function PayrollScreen() {
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

// ════════════════════════════════════════════════════════════════════════════
// Main Component
// ════════════════════════════════════════════════════════════════════════════
export default function Luong() {
  const [activeTab, setActiveTab] = useState('payroll-worker');

  return (
    <section className="tab-pane active" id="tab-luong" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SubTabs 
        active={activeTab} 
        onChange={setActiveTab}
        tabs={[
          { id: 'payroll-worker', label: 'Lương Khoán 3P', icon: <Hammer size={16}/> },
          { id: 'payroll-office', label: 'Lương VP & Hoa Hồng', icon: <Users size={16}/> }
        ]} 
      />
      <div style={{ padding: '16px 24px', flex: 1, overflowY: 'auto' }}>
        {activeTab === 'payroll-worker' && <LuongKhoan3P />}
        {activeTab === 'payroll-office' && <PayrollScreen />}
      </div>
    </section>
  );
}
