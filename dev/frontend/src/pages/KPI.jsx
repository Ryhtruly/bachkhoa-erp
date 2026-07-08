import React, { useState, useEffect } from 'react';
import { Target } from 'lucide-react';

export default function KPI() {
  const [kpiList, setKpiList] = useState([]);
  const [month, setMonth] = useState('2026-03');
  const [loading, setLoading] = useState(true);

  const fetchKpi = async (m) => {
    setLoading(true);
    setMonth(m);
    try {
      const res = await fetch(`/api/kpi/scores?month=${m}`);
      if (res.ok) {
        const data = await res.json();
        setKpiList(data.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKpi(month);
  }, []);

  return (
    <section className="tab-pane active" id="tab-kpi">
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target color="var(--orange-500)" size={20} /> Bảng Điểm KPI Nhân Sự
            </h3>
            <p className="sub">Thuật toán tự động chấm điểm hiệu suất (Đúng hạn / Trễ hạn).</p>
          </div>
          <div className="flex-center" style={{ gap: '8px' }}>
            <label style={{ margin: 0, whiteSpace: 'nowrap' }}>Kỳ Đánh Giá</label>
            <input 
              type="month" 
              value={month} 
              onChange={e => fetchKpi(e.target.value)} 
              style={{ width: '160px', height: '38px' }} 
            />
          </div>
        </div>
        
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nhân sự</th>
                <th style={{ textAlign: 'center' }}>Số hồ sơ HT (Target &gt; 10)</th>
                <th style={{ textAlign: 'center' }}>Tỷ lệ đúng hạn</th>
                <th style={{ textAlign: 'center' }}>Lỗi nộp lại</th>
                <th style={{ textAlign: 'center' }}>TG xử lý TB (Ngày)</th>
                <th style={{ textAlign: 'center' }}>Điểm KPI</th>
                <th style={{ textAlign: 'center' }}>Đánh giá</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>Đang tải...</td></tr>
              ) : kpiList.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Chưa có dữ liệu KPI tháng này</td></tr>
              ) : (
                kpiList.map((kpi, i) => (
                  <tr key={i}>
                    <td><strong>{kpi.employee}</strong></td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: kpi.total_completed > 10 ? 'var(--green-600)' : 'inherit' }}>
                      {kpi.total_completed}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${kpi.on_time_rate >= 90 ? 'badge-success' : 'badge-danger'}`}>
                        {kpi.on_time_rate}%
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', color: kpi.rejections > 0 ? 'var(--red-500)' : 'inherit' }}>
                      {kpi.rejections}
                    </td>
                    <td style={{ textAlign: 'center' }}>{kpi.avg_time}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-primary" style={{ fontSize: '1rem' }}>{kpi.final_score}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${kpi.performance === 'Xuất sắc' ? 'badge-success' : kpi.performance === 'Tốt' ? 'badge-primary' : kpi.performance === 'Khá' ? 'badge-warning' : 'badge-danger'}`}>
                        {kpi.performance}
                      </span>
                    </td>
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
