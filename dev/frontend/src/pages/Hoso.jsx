import React, { useState, useEffect } from 'react';
import { FolderOpen, Clock, AlertTriangle, CheckCircle, Search, Filter, Plus, User, Calendar, MapPin } from 'lucide-react';

export default function Hoso() {
  const [hosoList, setHosoList] = useState([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, in_progress: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Advanced filters state
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterWarning, setFilterWarning] = useState('All');

  const fetchData = async () => {
    try {
      const [hosoRes, statsRes] = await Promise.all([
        fetch('http://127.0.0.1:8000/api/hoso/'),
        fetch('http://127.0.0.1:8000/api/hoso/stats')
      ]);
      
      if (hosoRes.ok) {
        const data = await hosoRes.json();
        setHosoList(data.data || []);
      }
      if (statsRes.ok) {
        const sData = await statsRes.json();
        setStats(sData.data || {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await fetch('http://127.0.0.1:8000/api/hoso/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'Mã_hồ_sơ': id, 'Trạng_thái': newStatus })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredList = hosoList.filter(h => {
    const matchSearch = (h['Tên khách hàng'] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (h['Mã hồ sơ'] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (h['SĐT'] || '').includes(searchTerm);
    
    const matchStatus = filterStatus === 'All' || h['Trạng thái'] === filterStatus;
    const matchWarning = filterWarning === 'All' || h['Cảnh báo'] === filterWarning;
    
    return matchSearch && matchStatus && matchWarning;
  });

  const getWarningColor = (warning) => {
    if (warning === "Hoàn thành") return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981' };
    if (warning === "Trễ hạn") return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' };
    if (warning === "Sắp đến hạn") return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' };
    return { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }; // Trong hạn
  };

  return (
    <section className="tab-pane active" id="tab-hoso">
      {/* Stats Header */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card card glass-card">
          <div className="stat-icon purple"><FolderOpen size={24} /></div>
          <div className="stat-info">
            <p className="stat-label">Tổng Hồ Sơ</p>
            <h4 className="stat-value">{stats.total || 0}</h4>
          </div>
        </div>
        <div className="stat-card card glass-card">
          <div className="stat-icon orange"><Clock size={24} /></div>
          <div className="stat-info">
            <p className="stat-label">Đang Xử Lý</p>
            <h4 className="stat-value">{stats.in_progress || 0}</h4>
          </div>
        </div>
        <div className="stat-card card glass-card">
          <div className="stat-icon red"><AlertTriangle size={24} /></div>
          <div className="stat-info">
            <p className="stat-label">Trễ Hạn (Cần Xử Lý)</p>
            <h4 className="stat-value" style={{ color: stats.overdue > 0 ? '#ef4444' : 'inherit' }}>{stats.overdue || 0}</h4>
          </div>
        </div>
        <div className="stat-card card glass-card">
          <div className="stat-icon green"><CheckCircle size={24} /></div>
          <div className="stat-info">
            <p className="stat-label">Đã Hoàn Thành</p>
            <h4 className="stat-value">{stats.completed || 0}</h4>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar card glass-card" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} color="var(--text-tertiary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              className="form-control" 
              placeholder="Tìm mã hồ sơ, khách hàng..." 
              style={{ paddingLeft: '36px', width: '300px', height: '38px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'}`} style={{ height: '38px' }} onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} /> Lọc nâng cao
          </button>
        </div>
        <button className="btn btn-primary" style={{ height: '38px' }}>
          <Plus size={16} /> Tạo Hồ Sơ Mới
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="card glass-card" style={{ padding: '16px 24px', marginBottom: '24px', display: 'flex', gap: '20px', alignItems: 'flex-end', background: 'var(--bg-deep)' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Lọc theo Trạng thái</label>
            <select className="form-control" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: '220px' }}>
              <option value="All">Tất cả trạng thái</option>
              <option value="Mới tiếp nhận">Mới tiếp nhận</option>
              <option value="Đang đo đạc">Đang đo đạc</option>
              <option value="Đang xử lý nội nghiệp">Đang xử lý nội nghiệp</option>
              <option value="Nộp thành công - Chờ kết quả">Nộp thành công - Chờ kết quả</option>
              <option value="Hoàn thành">Hoàn thành</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Lọc theo Cảnh báo</label>
            <select className="form-control" value={filterWarning} onChange={(e) => setFilterWarning(e.target.value)} style={{ width: '220px' }}>
              <option value="All">Tất cả cảnh báo</option>
              <option value="Hoàn thành">Hoàn thành</option>
              <option value="Trong hạn">Trong hạn</option>
              <option value="Sắp đến hạn">Sắp đến hạn</option>
              <option value="Trễ hạn">Trễ hạn</option>
            </select>
          </div>
          {(filterStatus !== 'All' || filterWarning !== 'All') && (
            <button className="btn btn-secondary" style={{ height: '38px', color: 'var(--orange-500)' }} onClick={() => { setFilterStatus('All'); setFilterWarning('All'); }}>
              Xóa lọc
            </button>
          )}
        </div>
      )}

      {/* Data Table */}
      <div className="card glass-card table-responsive" style={{ padding: '0', overflow: 'hidden' }}>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'var(--bg-deep)', borderBottom: '1px solid var(--border-default)' }}>
            <tr>
              <th style={{ padding: '16px 24px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>MÃ HS & ƯU TIÊN</th>
              <th style={{ padding: '16px 24px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>KHÁCH HÀNG</th>
              <th style={{ padding: '16px 24px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>DỊCH VỤ & KHU VỰC</th>
              <th style={{ padding: '16px 24px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>PHỤ TRÁCH</th>
              <th style={{ padding: '16px 24px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>DEADLINE & CẢNH BÁO</th>
              <th style={{ padding: '16px 24px', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>TRẠNG THÁI</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>Đang tải dữ liệu...</td></tr>
            ) : filteredList.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>Không có dữ liệu</td></tr>
            ) : (
              filteredList.map((h, idx) => {
                const warnColors = getWarningColor(h['Cảnh báo']);
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{h['Mã hồ sơ']}</div>
                      {h['Ưu tiên'] === 'Cao' ? (
                        <span style={{ fontSize: '0.7rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>Ưu tiên Cao</span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{h['Ưu tiên']}</span>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{h['Tên khách hàng']}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{h['SĐT']}</div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--orange-500)', marginBottom: '4px' }}>{h['Loại dịch vụ']}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={12} /> {h['Khu vực/Phường'] || 'Chưa cập nhật'}
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <User size={14} color="var(--text-secondary)" />
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{h['Phụ trách chính']}</span>
                      </div>
                      {h['Hỗ trợ'] && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', paddingLeft: '22px' }}>
                          + Hỗ trợ: {h['Hỗ trợ']}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        <Calendar size={14} /> {h['Deadline'] || 'N/A'}
                      </div>
                      <span style={{ fontSize: '0.75rem', background: warnColors.bg, color: warnColors.color, padding: '4px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        {h['Cảnh báo']} {h['Số ngày còn lại'] !== null && h['Cảnh báo'] !== 'Hoàn thành' ? `(${h['Số ngày còn lại']} ngày)` : ''}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <select
                        className="form-control"
                        value={h['Trạng thái']}
                        onChange={(e) => handleStatusChange(h['Mã hồ sơ'], e.target.value)}
                        style={{ fontSize: '0.85rem', padding: '6px 12px', height: 'auto', background: 'var(--bg-deep)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}
                      >
                        <option value="Mới tiếp nhận">Mới tiếp nhận</option>
                        <option value="Đang đo đạc">Đang đo đạc</option>
                        <option value="Đang xử lý nội nghiệp">Đang xử lý nội nghiệp</option>
                        <option value="Nộp thành công - Chờ kết quả">Nộp thành công - Chờ kết quả</option>
                        <option value="Hoàn thành">Hoàn thành</option>
                      </select>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
