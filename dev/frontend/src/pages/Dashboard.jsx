import React, { useState, useEffect } from 'react';
import { Files, Loader, AlertTriangle, DollarSign, Clock } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

export default function Dashboard() {
  const [stats, setStats] = useState({
    total_hoso: 0,
    in_progress: 0,
    overdue: 0,
    revenue: 0,
    contract_val: 0,
    paid_val: 0,
    debt_val: 0
  });

  const [recentHoso, setRecentHoso] = useState([]);
  const [chartData, setChartData] = useState({
    lineData: [],
    barData: [],
    pieStatusData: [],
    pieExpenseData: [],
    topDebtors: []
  });
  const [barSort, setBarSort] = useState('value');
  const [statusSort, setStatusSort] = useState('value');
  const [expenseSort, setExpenseSort] = useState('value');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const [resSummary, resCharts] = await Promise.all([
          fetch('http://127.0.0.1:8000/api/dashboard/summary'),
          fetch('http://127.0.0.1:8000/api/dashboard/charts')
        ]);
        if (resSummary.ok) {
          const data = await resSummary.json();
          setStats(data.stats);
          setRecentHoso(data.recent_hoso);
        }
        if (resCharts.ok) {
          const data = await resCharts.json();
          setChartData(data);
        }
      } catch (err) {
        console.error('Error fetching dashboard:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const formatVND = (amount) => {
    return new Intl.NumberFormat('vi-VN').format(amount || 0) + '₫';
  };

  const formatCompactVND = (value) => {
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
    return value;
  };

  const sortedBarData = [...chartData.barData].sort((a, b) => 
    barSort === 'value' ? b.revenue - a.revenue : a.service.localeCompare(b.service)
  );

  const sortedStatusData = [...chartData.pieStatusData].sort((a, b) => 
    statusSort === 'value' ? b.value - a.value : a.name.localeCompare(b.name)
  );

  const sortedExpenseData = [...chartData.pieExpenseData].sort((a, b) => 
    expenseSort === 'value' ? b.value - a.value : a.name.localeCompare(b.name)
  );

  return (
    <section className="tab-pane active" id="tab-dashboard">
      
      {/* Welcome Banner */}
      <div className="card glass-card" style={{ marginBottom: '24px', padding: '28px', background: 'linear-gradient(135deg, rgba(235, 74, 35, 0.05), rgba(249, 115, 22, 0.15))', border: '1px solid rgba(235, 74, 35, 0.2)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--orange-600)', marginBottom: '6px' }}>Chào buổi {new Date().getHours() < 12 ? 'sáng' : 'chiều'}, Lê Văn Dựng! 👋</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500 }}>Dưới đây là bức tranh tài chính và tiến độ công việc tổng quan của công ty. Mọi thứ đang trong tầm kiểm soát!</p>
        </div>
        <div style={{ position: 'absolute', right: '-5%', top: '-50%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(235,74,35,0.15) 0%, transparent 70%)', borderRadius: '50%' }}></div>
      </div>

      <div className="stats-grid" id="dashboard-stats" style={{ marginBottom: '24px' }}>
        <div className="stat-card card">
          <div className="stat-icon purple"><Files /></div>
          <div className="stat-info">
            <h3>{loading ? '—' : stats.total_hoso}</h3>
            <p>Tổng hồ sơ</p>
          </div>
        </div>
        <div className="stat-card card">
          <div className="stat-icon amber"><Loader /></div>
          <div className="stat-info">
            <h3>{loading ? '—' : stats.in_progress}</h3>
            <p>Đang xử lý</p>
          </div>
        </div>
        <div className="stat-card card">
          <div className="stat-icon red"><AlertTriangle /></div>
          <div className="stat-info">
            <h3>{loading ? '—' : stats.overdue}</h3>
            <p>Hồ sơ quá hạn</p>
          </div>
        </div>
        <div className="stat-card card">
          <div className="stat-icon green"><DollarSign /></div>
          <div className="stat-info">
            <h3>{loading ? '—' : formatVND(stats.revenue)}</h3>
            <p>Thực thu</p>
          </div>
        </div>
      </div>

      <div className="balance-strip card" style={{ marginBottom: '24px' }}>
        <div className="balance-item">
          <span>Giá trị HĐ</span>
          <h4>{loading ? '—' : formatVND(stats.contract_val)}</h4>
        </div>
        <div className="balance-item">
          <span>Đã thu</span>
          <h4 className="text-success">{loading ? '—' : formatVND(stats.paid_val)}</h4>
        </div>
        <div className="balance-item">
          <span>Công nợ</span>
          <h4 className="text-danger">{loading ? '—' : formatVND(stats.debt_val)}</h4>
        </div>
      </div>

      {/* CHARTS SECTION */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        
        {/* Line Chart */}
        <div className="card glass-card" style={{ padding: '20px', gridColumn: '1 / -1' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '8px', fontWeight: 600 }}>Doanh thu & Công nợ theo tháng</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '16px', fontStyle: 'italic' }}>* So sánh chênh lệch giữa tổng giá trị hợp đồng (Doanh thu) và số tiền chưa thu được (Công nợ)</p>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <LineChart data={chartData.lineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} tickFormatter={formatCompactVND} width={60} />
                <Tooltip formatter={(value) => formatVND(value)} cursor={{fill: '#f1f5f9'}} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" name="Doanh thu" dataKey="revenue" stroke="#f97316" strokeWidth={3} activeDot={{ r: 6 }} dot={{r: 3}} />
                <Line type="monotone" name="Công nợ" dataKey="debt" stroke="#ef4444" strokeWidth={3} activeDot={{ r: 6 }} dot={{r: 3}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="card glass-card" style={{ padding: '20px' }}>
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Doanh thu theo dịch vụ</h3>
            <select className="form-control" style={{ width: 'auto', padding: '2px 8px', fontSize: '0.8rem', height: '28px' }} value={barSort} onChange={e => setBarSort(e.target.value)}>
              <option value="value">Sắp xếp: Giá trị</option>
              <option value="name">Sắp xếp: Danh mục</option>
            </select>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '16px', fontStyle: 'italic' }}>* Biểu đồ thể hiện tổng doanh thu mang lại từ từng mảng dịch vụ</p>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={sortedBarData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.8}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
                <XAxis dataKey="service" axisLine={false} tickLine={false} tick={{fontSize: 11}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} tickFormatter={formatCompactVND} width={60} />
                <Tooltip formatter={(value) => formatVND(value)} cursor={{fill: 'var(--border-subtle)'}} />
                <Bar name="Doanh thu" dataKey="revenue" fill="url(#colorBar)" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart 1 */}
        <div className="card glass-card" style={{ padding: '20px' }}>
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Tỉ lệ trạng thái Hồ sơ</h3>
            <select className="form-control" style={{ width: 'auto', padding: '2px 8px', fontSize: '0.8rem', height: '28px' }} value={statusSort} onChange={e => setStatusSort(e.target.value)}>
              <option value="value">Sắp xếp: Giá trị</option>
              <option value="name">Sắp xếp: Danh mục</option>
            </select>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '16px', fontStyle: 'italic' }}>* Phân bố các hồ sơ theo tiến độ làm việc hiện tại</p>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie 
                  data={sortedStatusData} 
                  cx="50%" cy="50%" 
                  innerRadius={70} outerRadius={100} 
                  paddingAngle={2} dataKey="value" 
                  label={({name, percent}) => percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''} 
                  labelLine={false}
                >
                  {sortedStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.1))' }} />
                  ))}
                </Pie>
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart 2 */}
        <div className="card glass-card" style={{ padding: '20px' }}>
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Cơ cấu chi phí hoạt động</h3>
            <select className="form-control" style={{ width: 'auto', padding: '2px 8px', fontSize: '0.8rem', height: '28px' }} value={expenseSort} onChange={e => setExpenseSort(e.target.value)}>
              <option value="value">Sắp xếp: Giá trị</option>
              <option value="name">Sắp xếp: Danh mục</option>
            </select>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '16px', fontStyle: 'italic' }}>* Các mảng tiêu hao nhiều dòng tiền nhất (Chi phí)</p>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie 
                  data={sortedExpenseData} 
                  cx="50%" cy="50%" 
                  innerRadius={0} outerRadius={100} 
                  dataKey="value" 
                  label={({name, percent}) => percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''} 
                  labelLine={false}
                >
                  {sortedExpenseData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.1))' }} />
                  ))}
                </Pie>
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Tooltip formatter={(value) => formatVND(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 5 Khách Nợ Nhiều Nhất */}
        <div className="card glass-card" style={{ padding: '20px' }}>
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Top 5 Khách nợ nhiều nhất</h3>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '16px', fontStyle: 'italic' }}>* Những khách hàng có tổng dư nợ cao nhất hiện tại</p>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={chartData.topDebtors} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorDebt" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#f87171" stopOpacity={0.8}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-default)" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 11}} tickFormatter={formatCompactVND} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 11}} width={90} />
                <Tooltip formatter={(value) => formatVND(value)} cursor={{fill: 'var(--border-subtle)'}} />
                <Bar name="Đang nợ" dataKey="debt" fill="url(#colorDebt)" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* RECENT HOSO TABLE */}
      <div className="card glass-card" style={{ padding: '24px' }}>
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} color="var(--purple-400)" />
            Hồ sơ mới tiếp nhận
          </h3>
          <button className="btn btn-ghost btn-sm">Xem tất cả</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã hồ sơ</th>
                <th>Khách hàng</th>
                <th>Dịch vụ</th>
                <th>Khu vực</th>
                <th>Phụ trách</th>
                <th>Hạn trả</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>Đang tải dữ liệu...</td>
                </tr>
              ) : recentHoso.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Chưa có dữ liệu</td>
                </tr>
              ) : (
                recentHoso.map((hs, i) => (
                  <tr key={i}>
                    <td><strong>{hs.id}</strong></td>
                    <td>{hs.customer_name}</td>
                    <td>{hs.service_type}</td>
                    <td>{hs.area}</td>
                    <td>{hs.pic_main}</td>
                    <td>{hs.deadline}</td>
                    <td><span className="badge badge-primary">{hs.status}</span></td>
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
