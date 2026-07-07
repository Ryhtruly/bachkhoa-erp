import React, { useState, useEffect } from 'react';
import { Filter, Plus, UserPlus, Phone, Search, Clock, Target, CheckCircle, Percent } from 'lucide-react';

export default function CRM() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total_leads: 0, won_leads: 0, in_progress: 0, win_rate: 0 });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [closingLead, setClosingLead] = useState(null);
  const [closingData, setClosingData] = useState({ price: '', tax_id: '', area: '' });
  const [searchTerm, setSearchTerm] = useState('');
  
  // Advanced filters state
  const [showFilters, setShowFilters] = useState(false);
  const [filterSource, setFilterSource] = useState('All');
  const [formData, setFormData] = useState({ name: '', phone: '', source: 'Facebook', notes: '' });

  const columns = ['Tiếp cận', 'Báo giá', 'Đàm phán', 'Chốt'];

  const fetchData = async () => {
    try {
      const [leadsRes, statsRes] = await Promise.all([
<<<<<<< Updated upstream
        fetch('http://127.0.0.1:8000/api/crm/leads'),
        fetch('http://127.0.0.1:8000/api/crm/stats')
=======
        fetch('/api/crm/leads'),
        fetch('/api/crm/stats')
>>>>>>> Stashed changes
      ]);
      
      if (leadsRes.ok) {
        const data = await leadsRes.json();
        setLeads(data.data || []);
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

  const handleStatusChange = async (lead, newStatus) => {
    if (newStatus === 'Chốt' && lead.status !== 'Chốt') {
      setClosingLead(lead);
      setClosingData({ price: '', tax_id: '', area: '' });
      return;
    }
    await submitStatusChange(lead.id, newStatus, {});
  };

  const submitStatusChange = async (leadId, newStatus, extraData = {}) => {
    try {
<<<<<<< Updated upstream
      await fetch(`http://127.0.0.1:8000/api/crm/leads/${leadId}/status`, {
=======
      await fetch(`/api/crm/leads/${leadId}/status`, {
>>>>>>> Stashed changes
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_status: newStatus, ...extraData })
      });
      fetchData();
      setClosingLead(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmClose = (e) => {
    e.preventDefault();
    submitStatusChange(closingLead.id, 'Chốt', closingData);
  };

  const handleCreateLead = async (e) => {
    e.preventDefault();
    try {
<<<<<<< Updated upstream
      const res = await fetch('http://127.0.0.1:8000/api/crm/leads', {
=======
      const res = await fetch('/api/crm/leads', {
>>>>>>> Stashed changes
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: formData.name,
          phone: formData.phone,
          source: formData.source,
          requirements: formData.notes
        })
      });
      if (res.ok) {
        setIsModalOpen(false);
        setFormData({ name: '', phone: '', source: 'Facebook', notes: '' });
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredLeads = leads.filter(l => {
    const matchSearch = (l.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (l.phone || '').includes(searchTerm);
                        
    const matchSource = filterSource === 'All' || l.source === filterSource;
    
    return matchSearch && matchSource;
  });

  return (
    <section className="tab-pane active" id="tab-crm">
      {/* Stats Header */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card card glass-card">
          <div className="stat-icon purple"><Target size={24} /></div>
          <div className="stat-info">
            <p className="stat-label">Tổng Lead</p>
            <h4 className="stat-value">{stats.total_leads || 0}</h4>
          </div>
        </div>
        <div className="stat-card card glass-card">
          <div className="stat-icon orange"><Clock size={24} /></div>
          <div className="stat-info">
            <p className="stat-label">Đang Tư Vấn</p>
            <h4 className="stat-value">{stats.in_progress || 0}</h4>
          </div>
        </div>
        <div className="stat-card card glass-card">
          <div className="stat-icon green"><CheckCircle size={24} /></div>
          <div className="stat-info">
            <p className="stat-label">Chốt Thành Công</p>
            <h4 className="stat-value">{stats.won_leads || 0}</h4>
          </div>
        </div>
        <div className="stat-card card glass-card">
          <div className="stat-icon red"><Percent size={24} /></div>
          <div className="stat-info">
            <p className="stat-label">Tỉ Lệ Chốt</p>
            <h4 className="stat-value">{stats.win_rate || 0}%</h4>
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
              placeholder="Tìm khách hàng, SĐT..." 
              style={{ paddingLeft: '36px', width: '300px', height: '38px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'}`} style={{ height: '38px' }} onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} /> Lọc nâng cao
          </button>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)} style={{ height: '38px' }}>
          <Plus size={16} /> Tạo Lead Mới
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="card glass-card" style={{ padding: '16px 24px', marginBottom: '24px', display: 'flex', gap: '20px', alignItems: 'flex-end', background: 'var(--bg-deep)' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Lọc theo Nguồn khách hàng</label>
            <select className="form-control" value={filterSource} onChange={(e) => setFilterSource(e.target.value)} style={{ width: '250px' }}>
              <option value="All">Tất cả các nguồn</option>
              <option value="Facebook">Facebook</option>
              <option value="Zalo cá nhân">Zalo cá nhân</option>
              <option value="Hotline">Hotline công ty</option>
              <option value="Giới thiệu">Khách giới thiệu</option>
              <option value="Khác">Khác</option>
            </select>
          </div>
          {filterSource !== 'All' && (
            <button className="btn btn-secondary" style={{ height: '38px', color: 'var(--orange-500)' }} onClick={() => setFilterSource('All')}>
              Xóa lọc
            </button>
          )}
        </div>
      )}

      {/* Kanban Board */}
      <div className="crm-grid" id="crm-kanban-board" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        {columns.map(col => {
          const colLeads = filteredLeads.filter(l => l.status === col);
          return (
            <div className="crm-col" key={col} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '16px', border: '1px solid var(--border-default)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
              <div className="crm-col-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid var(--orange-500)' }}>
                <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{col.toUpperCase()}</h4>
                <span className="badge" style={{ background: 'var(--bg-deep)', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>{colLeads.length}</span>
              </div>
              
              <div className="crm-col-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '300px' }}>
                {loading ? (
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', textAlign: 'center', marginTop: '20px' }}>Đang tải...</p>
                ) : colLeads.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem', background: 'var(--bg-deep)', borderRadius: '8px', border: '1px dashed var(--border-hover)' }}>Trống</div>
                ) : (
                  colLeads.map(lead => (
                    <div className="crm-card" key={lead.id} style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-default)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'grab' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'var(--orange-glow)', color: 'var(--orange-600)' }}>{lead.source}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{lead.created_at?.split(' ')[0]}</span>
                      </div>
                      <div className="crm-card-title" style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '4px' }}>{lead.customer_name}</div>
                      <div className="crm-card-sub" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                        <Phone size={12} /> {lead.phone || 'N/A'}
                      </div>
                      
                      {lead.requirements && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', padding: '8px', background: 'var(--bg-deep)', borderRadius: '6px', marginBottom: '12px', fontStyle: 'italic' }}>
                          "{lead.requirements}"
                        </div>
                      )}

                      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginTop: 'auto' }}>
                        <select
                          className="form-control"
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead, e.target.value)}
                          style={{ width: '100%', fontSize: '0.8rem', padding: '6px 12px', height: 'auto', background: 'var(--bg-deep)' }}
                        >
                          {columns.map(opt => (
                            <option key={opt} value={opt}>Chuyển: {opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="modal-overlay open" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="modal card glass-card" style={{ maxWidth: '500px', width: '100%' }}>
            <div className="modal-header" style={{ padding: '24px', borderBottom: '1px solid var(--border-default)' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', fontWeight: 700 }}>
                <UserPlus size={20} color="var(--orange-500)" /> Tạo Khách Hàng (Lead) Mới
              </h2>
            </div>
            <form onSubmit={handleCreateLead} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Tên Khách Hàng *</label>
                  <input required className="form-control" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} type="text" placeholder="Ví dụ: Anh Minh..." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Số Điện Thoại *</label>
                  <input required className="form-control" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} type="text" placeholder="090..." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Nguồn Khách Hàng</label>
                  <select required className="form-control" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})}>
                    <option value="Facebook">Facebook</option>
                    <option value="Zalo cá nhân">Zalo cá nhân</option>
                    <option value="Hotline">Hotline công ty</option>
                    <option value="Giới thiệu">Khách giới thiệu</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Nhu cầu / Ghi chú</label>
                  <textarea className="form-control" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Khách cần tư vấn hoàn công nhà ở..." style={{ minHeight: '80px', resize: 'vertical' }}></textarea>
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', background: 'var(--bg-deep)', borderTop: '1px solid var(--border-default)', borderRadius: '0 0 var(--radius-md) var(--radius-md)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Hủy bỏ</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '0 24px' }}>Tạo Mới & Đưa vào Pipeline</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Closing Deal Modal */}
      {closingLead && (
        <div className="modal-overlay open" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="modal card glass-card" style={{ maxWidth: '500px', width: '100%' }}>
            <div className="modal-header" style={{ padding: '24px', borderBottom: '1px solid var(--border-default)' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', fontWeight: 700 }}>
                <CheckCircle size={20} color="var(--green-500)" /> Xác nhận Chốt Deal
              </h2>
            </div>
            <form onSubmit={handleConfirmClose} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Bạn đang chốt deal với khách hàng <strong>{closingLead.customer_name}</strong>. Vui lòng nhập thông tin để hệ thống sinh Hợp Đồng tự động.
                </p>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Giá trị Hợp Đồng (VNĐ) *</label>
                  <input required className="form-control" value={closingData.price} onChange={e => setClosingData({...closingData, price: e.target.value})} type="number" placeholder="Ví dụ: 15000000" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Mã số thuế (Tùy chọn)</label>
                  <input className="form-control" value={closingData.tax_id} onChange={e => setClosingData({...closingData, tax_id: e.target.value})} type="text" placeholder="Nhập mã số thuế..." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Diện tích / Quy mô (Tùy chọn)</label>
                  <input className="form-control" value={closingData.area} onChange={e => setClosingData({...closingData, area: e.target.value})} type="text" placeholder="Ví dụ: 150m2..." />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', background: 'var(--bg-deep)', borderTop: '1px solid var(--border-default)', borderRadius: '0 0 var(--radius-md) var(--radius-md)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setClosingLead(null)}>Hủy bỏ</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '0 24px', background: 'var(--green-500)', borderColor: 'var(--green-500)' }}>Chốt Deal & Sinh Hợp Đồng</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
