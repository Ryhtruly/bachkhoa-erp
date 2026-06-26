import React, { useState, useEffect } from 'react';
import { Banknote } from 'lucide-react';

export default function Luong() {
  const [payroll, setPayroll] = useState({ month: '2026-03', total_count: 0, total_amount: 0, details: [] });
  const [loading, setLoading] = useState(true);

  const fetchPayroll = async (month) => {
    setLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/luong/khoan?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        // data might be array of records
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

  const formatVND = (amount) => {
    try {
      return new Intl.NumberFormat('vi-VN').format(Number(amount) || 0) + '₫';
    } catch {
      return amount;
    }
  };

  return (
    <section className="tab-pane active" id="tab-luong">
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
              value={payroll.month} 
              onChange={e => fetchPayroll(e.target.value)} 
              style={{ width: '160px' }} 
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
          <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '8px', flex: 1 }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--purple-600)' }}>{payroll.total_count}</span>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Hồ sơ hoàn thành trong tháng</p>
          </div>
          <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '8px', flex: 1 }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 700 }} className="text-success">{formatVND(payroll.total_amount)}</span>
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
                    <td>{formatVND(p['Số tiền khoán'])}</td>
                    <td>{formatVND(p['Phụ cấp'])}</td>
                    <td>{formatVND(p['Thưởng/Phạt'])}</td>
                    <td className="text-success" style={{ fontWeight: 600 }}>{formatVND(p['Tổng nhận'])}</td>
                    <td>{p['Ngày chốt']}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
