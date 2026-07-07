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
        setKpiList(data.scores || []);
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
                <th>Tổng Task</th>
                <th>Điểm KPI</th>
                <th>Đánh giá</th>
                <th>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>Đang tải...</td></tr>
              ) : kpiList.length === 0 ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Chưa có dữ liệu KPI tháng này</td></tr>
              ) : (
                kpiList.map((kpi, i) => (
                  <tr key={i}>
                    <td><strong>{kpi.employee}</strong></td>
                    <td>{kpi.total_tasks}</td>
                    <td><span className="badge badge-primary">{kpi.final_score}</span></td>
                    <td><span className={`badge ${kpi.performance === 'Tốt' ? 'badge-success' : 'badge-danger'}`}>{kpi.performance}</span></td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Đúng hạn: {kpi.on_time} / Trễ: {kpi.late}
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
