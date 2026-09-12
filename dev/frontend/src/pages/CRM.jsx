import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  Phone,
  Clock,
  Target,
  CheckCircle,
  Percent,
  ExternalLink,
  Copy,
  Check,
  RotateCw,
  Compass,
  FileText,
  Building2,
  MapPin,
  Maximize2,
  MessageCircle,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { StatsGrid, StatCard, FilterBar, Modal } from '../components/ui';
import { apiFetch } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import './crm.css';

function QrCodeIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="5" height="5" x="3" y="3" rx="1" />
      <rect width="5" height="5" x="16" y="3" rx="1" />
      <rect width="5" height="5" x="3" y="16" rx="1" />
      <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
      <path d="M21 21v.01" />
      <path d="M12 7v3a2 2 0 0 1-2 2H7" />
      <path d="M3 12h.01" />
      <path d="M12 3h.01" />
      <path d="M12 16v.01" />
      <path d="M16 12h1" />
      <path d="M21 12v.01" />
      <path d="M12 21v-1" />
    </svg>
  );
}

// Hàm bóc tách chuỗi requirements có cấu trúc từ Form hoặc dữ liệu tự do
function parseLeadRequirements(reqStr = '') {
  if (!reqStr) return { serviceType: '', scaleInfo: '', propertyAddress: '', notes: '', packageType: 'general' };

  let serviceType = '';
  let scaleInfo = '';
  let propertyAddress = '';
  let notes = '';

  if (reqStr.includes('|')) {
    const parts = reqStr.split('|').map(s => s.trim());
    parts.forEach(part => {
      const lower = part.toLowerCase();
      if (lower.startsWith('dịch vụ:')) {
        serviceType = part.replace(/^dịch vụ:\s*/i, '');
      } else if (lower.startsWith('quy mô:') || lower.startsWith('diện tích:')) {
        scaleInfo = part.replace(/^(quy mô|diện tích):\s*/i, '');
      } else if (lower.startsWith('vị trí bđs:') || lower.startsWith('địa chỉ bđs:')) {
        propertyAddress = part.replace(/^(vị trí bđs|địa chỉ bđs):\s*/i, '');
      } else if (lower.startsWith('ghi chú:')) {
        notes = part.replace(/^ghi chú:\s*/i, '');
      } else {
        if (!notes) notes = part;
      }
    });
  } else {
    // Dữ liệu cũ dạng text tự do
    notes = reqStr;
  }

  // Nhận diện nhóm dịch vụ để gán màu sắc nhận diện
  const lowerAll = (serviceType + ' ' + notes).toLowerCase();
  let packageType = 'general';
  if (lowerAll.includes('đo') || lowerAll.includes('mốc') || lowerAll.includes('hiện trạng') || lowerAll.includes('trắc địa')) {
    packageType = 'survey';
  } else if (lowerAll.includes('sổ') || lowerAll.includes('chuyển nhượng') || lowerAll.includes('pháp lý') || lowerAll.includes('thừa kế') || lowerAll.includes('tặng cho') || lowerAll.includes('cấp đổi')) {
    packageType = 'legal';
  } else if (lowerAll.includes('xây dựng') || lowerAll.includes('gpxd') || lowerAll.includes('cải tạo')) {
    packageType = 'construction';
  }

  return { serviceType, scaleInfo, propertyAddress, notes, packageType };
}

export default function CRM() {
  const { addToast } = useToast();
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total_leads: 0, won_leads: 0, in_progress: 0, win_rate: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [closingLead, setClosingLead] = useState(null);
  const [closingData, setClosingData] = useState({ price: '', tax_id: '', area: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrCustomUrl, setQrCustomUrl] = useState('');
  const [qrCopied, setQrCopied] = useState(false);

  // Drag & drop state
  const [draggingLeadId, setDraggingLeadId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // Advanced filters state
  const [filterSource, setFilterSource] = useState('All');
  const [formData, setFormData] = useState({ name: '', phone: '', source: 'Facebook', notes: '' });

  const columns = ['Tiếp cận', 'Báo giá', 'Đàm phán', 'Chốt'];

  const fetchData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setRefreshing(true);
      const [leadsData, statsData] = await Promise.all([
        apiFetch('/api/crm/leads'),
        apiFetch('/api/crm/stats')
      ]);

      setLeads(leadsData?.data || []);
      setStats(statsData?.data || {});
    } catch (err) {
      console.error('Lỗi tải dữ liệu CRM:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusChange = async (lead, newStatus) => {
    if (newStatus === 'Chốt' && lead.status !== 'Chốt') {
      const parsed = parseLeadRequirements(lead.requirements);
      setClosingLead(lead);
      // Điền trước quy mô/diện tích từ dữ liệu lead đã có
      setClosingData({
        price: '',
        tax_id: '',
        area: parsed.scaleInfo || ''
      });
      return;
    }
    await submitStatusChange(lead.id, newStatus, {});
  };

  const submitStatusChange = async (leadId, newStatus, extraData = {}) => {
    try {
      const res = await apiFetch(`/api/crm/leads/${leadId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_status: newStatus, ...extraData })
      });
      fetchData(true);
      setClosingLead(null);
      if (res?.data?.contract_id) {
        addToast(`🎉 Đã chốt deal & sinh Hợp đồng ${res.data.contract_id} thành công!`, 'success');
      } else {
        addToast('Đã cập nhật trạng thái hồ sơ thành công.', 'success');
      }
    } catch (err) {
      console.error(err);
      addToast(err?.message || 'Có lỗi xảy ra khi cập nhật trạng thái', 'error');
    }
  };

  const handleConfirmClose = (e) => {
    e.preventDefault();
    const amount = Number(closingData.price);
    if (!Number.isFinite(amount) || amount <= 0) {
      addToast('Giá trị hợp đồng phải là số lớn hơn 0.', 'error');
      return;
    }
    submitStatusChange(closingLead.id, 'Chốt', closingData);
  };

  const handleCreateLead = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/crm/leads', {
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

  // Drag & Drop handlers
  const handleDragStart = (e, lead) => {
    setDraggingLeadId(lead.id);
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingLeadId(null);
    setDragOverCol(null);
  };

  const handleDragOver = (e, col) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== col) {
      setDragOverCol(col);
    }
  };

  const handleDragLeave = (e, col) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (dragOverCol === col) setDragOverCol(null);
  };

  const handleDrop = (e, targetCol) => {
    e.preventDefault();
    setDragOverCol(null);
    const leadId = e.dataTransfer.getData('text/plain') || draggingLeadId;
    if (!leadId) return;

    const lead = leads.find(l => l.id === leadId);
    if (!lead || lead.status === targetCol) return;

    handleStatusChange(lead, targetCol);
  };

  const filteredLeads = leads.filter(l => {
    const matchSearch = (l.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.phone || '').includes(searchTerm) ||
      (l.requirements || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchSource = filterSource === 'All' || l.source === filterSource;

    return matchSearch && matchSource;
  });

  return (
    <section className="tab-pane active crm-container" id="tab-crm">
      {/* Stats Header */}
      <StatsGrid>
        <StatCard
          label="Tổng Lead Tiếp Nhận"
          value={stats.total_leads || 0}
          icon={<Target size={24} />}
          iconVariant="purple"
        />
        <StatCard
          label="Đang Tư Vấn / Báo Giá"
          value={stats.in_progress || 0}
          icon={<Clock size={24} />}
          iconVariant="orange"
        />
        <StatCard
          label="Chốt Thành Hợp Đồng"
          value={stats.won_leads || 0}
          icon={<CheckCircle size={24} />}
          iconVariant="green"
        />
        <StatCard
          label="Tỉ Lệ Chốt Thầu"
          value={`${stats.win_rate || 0}%`}
          icon={<Percent size={24} />}
          iconVariant="red"
        />
      </StatsGrid>

      {/* Toolbar */}
      <FilterBar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Tìm tên khách, số điện thoại, vị trí đất, dịch vụ..."
        filters={[
          {
            key: 'source',
            label: 'Nguồn khách hàng',
            type: 'select',
            width: 200,
            options: [
              { value: 'All', label: 'Tất cả nguồn' },
              { value: 'Web Form (Zalo)', label: 'Web Form (Zalo)' },
              { value: 'Google Form', label: 'Google Form' },
              { value: 'Facebook', label: 'Facebook' },
              { value: 'Hotline', label: 'Hotline công ty' },
              { value: 'Giới thiệu', label: 'Khách giới thiệu' },
              { value: 'Khác', label: 'Khác' }
            ]
          }
        ]}
        values={{ source: filterSource }}
        onFilterChange={(key, value) => {
          if (key === 'source') setFilterSource(value);
        }}
        onReset={() => { setSearchTerm(''); setFilterSource('All'); }}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Nút Làm Mới (Refresh) */}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fetchData()}
              title="Làm mới danh sách Lead tức thì"
            >
              <RotateCw size={14} className={refreshing ? 'spinning' : ''} /> Làm Mới
            </button>

            {/* Nút Copy Link Form Zalo */}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const url = `${window.location.origin}/intake`;
                navigator.clipboard.writeText(url);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 3000);
              }}
              title="Sao chép link trang đăng ký dịch vụ để gửi cho khách qua Zalo"
            >
              {copiedLink ? <Check size={14} style={{ color: 'var(--green-500)' }} /> : <Copy size={14} />}
              {copiedLink ? 'Đã chép link Zalo!' : 'Copy Link Form Zalo'}
            </button>

            {/* Nút Mã QR Form */}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setQrCustomUrl(`${window.location.origin}/intake`);
                setIsQrModalOpen(true);
              }}
              title="Xem và tải mã QR để gửi cho khách quét trên Zalo / điện thoại"
            >
              <QrCodeIcon size={14} /> Mã QR Form
            </button>

            {/* Nút Mở Xem Form */}
            <a
              href="/intake"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              title="Mở tab mới xem trang Form tiếp nhận của khách"
            >
              <ExternalLink size={14} /> Xem Form
            </a>

            {/* Nút Tạo Lead Mới */}
            <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>
              <UserPlus size={14} /> Tạo Lead Mới
            </button>
          </div>
        }
      />

      {/* Kanban Board Grid */}
      <div
        className="crm-kanban-grid"
        id="crm-kanban-board"
        role="region"
        aria-label="Quy trình khách hàng theo trạng thái"
      >
        {columns.map(col => {
          const colLeads = filteredLeads.filter(l => l.status === col);
          const colClassModifier = col === 'Tiếp cận' ? 'tiep-can' : col === 'Báo giá' ? 'bao-gia' : col === 'Đàm phán' ? 'dam-phan' : 'chot';
          const isOver = dragOverCol === col;

          return (
            <div
              key={col}
              className={`crm-kanban-col ${isOver ? 'drag-over' : ''}`}
              onDragOver={(e) => handleDragOver(e, col)}
              onDragLeave={(e) => handleDragLeave(e, col)}
              onDrop={(e) => handleDrop(e, col)}
            >
              {/* Header Cột */}
              <div className={`crm-col-top crm-col-top--${colClassModifier}`}>
                <div className="crm-col-title-wrap">
                  <span className={`crm-col-dot crm-col-dot--${colClassModifier}`} />
                  <h4 className="crm-col-title">{col.toUpperCase()}</h4>
                </div>
                <span className="crm-col-count">{colLeads.length}</span>
              </div>

              {/* Danh Sách Thẻ Trong Cột */}
              <div className="crm-col-list">
                {loading ? (
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', textAlign: 'center', marginTop: '24px' }}>
                    Đang tải dữ liệu...
                  </p>
                ) : colLeads.length === 0 ? (
                  <div className="crm-empty-placeholder">
                    <span>Chưa có lead</span>
                    <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>Kéo thả thẻ vào đây</span>
                  </div>
                ) : (
                  colLeads.map(lead => {
                    const parsed = parseLeadRequirements(lead.requirements);
                    const cleanPhone = (lead.phone || '').replace(/\D/g, '');
                    const isDragging = draggingLeadId === lead.id;

                    return (
                      <div
                        key={lead.id}
                        className={`lead-card ${isDragging ? 'is-dragging' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead)}
                        onDragEnd={handleDragEnd}
                      >
                        {/* Top: Nguồn + Ngày tạo */}
                        <div className="lead-card-header">
                          <span className={`lead-source-badge ${lead.source?.includes('Zalo') ? 'lead-source-badge--zalo' : lead.source?.includes('Google') ? 'lead-source-badge--google' : ''}`}>
                            {lead.source || 'Tự động'}
                          </span>
                          <span className="lead-date">
                            <Clock size={11} /> {lead.created_at?.split(' ')[0] || ''}
                          </span>
                        </div>

                        {/* Tên khách hàng */}
                        <h4 className="lead-customer-name">
                          {lead.customer_name}
                        </h4>

                        {/* Badge Dịch vụ (nếu có) */}
                        {parsed.serviceType && (
                          <div className={`lead-service-pill lead-service-pill--${parsed.packageType}`}>
                            {parsed.packageType === 'survey' ? <Compass size={13} /> : parsed.packageType === 'legal' ? <FileText size={13} /> : parsed.packageType === 'construction' ? <Building2 size={13} /> : <Sparkles size={13} />}
                            {parsed.serviceType}
                          </div>
                        )}

                        {/* Thông tin chi tiết: Vị trí đất & Quy mô */}
                        <div className="lead-meta-list">
                          {parsed.propertyAddress && (
                            <div className="lead-meta-item">
                              <MapPin size={13} className="lead-meta-icon" />
                              <span className="lead-meta-value" title={parsed.propertyAddress}>
                                {parsed.propertyAddress}
                              </span>
                            </div>
                          )}

                          {parsed.scaleInfo && (
                            <div className="lead-meta-item">
                              <Maximize2 size={13} className="lead-meta-icon" />
                              <span className="lead-meta-value">
                                Quy mô: <strong>{parsed.scaleInfo}</strong>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Ghi chú thêm của khách */}
                        {parsed.notes && (
                          <p className="lead-notes-quote" title={parsed.notes}>
                            "{parsed.notes}"
                          </p>
                        )}

                        {/* Thanh thao tác nhanh: Gọi điện + Chat Zalo */}
                        {lead.phone && (
                          <div className="lead-actions-bar">
                            <a
                              href={`tel:${lead.phone}`}
                              className="lead-action-btn lead-action-btn--phone"
                              title={`Gọi điện tới số ${lead.phone}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone size={12} /> {lead.phone}
                            </a>
                            <a
                              href={`https://zalo.me/${cleanPhone}`}
                              target="_blank"
                              rel="noreferrer"
                              className="lead-action-btn lead-action-btn--zalo"
                              title={`Mở cuộc trò chuyện Zalo với ${lead.customer_name}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MessageCircle size={13} /> Chat Zalo
                            </a>
                          </div>
                        )}

                        {/* Hộp chọn di chuyển cột */}
                        <div className="lead-move-footer">
                          <select
                            className="lead-move-select"
                            value={lead.status}
                            onChange={(e) => handleStatusChange(lead, e.target.value)}
                            title="Chọn cột để chuyển trạng thái (hoặc kéo thả thẻ)"
                          >
                            {columns.map(opt => (
                              <option key={opt} value={opt}>Chuyển: {opt}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Tạo Lead Mới Thủ Công */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={20} color="var(--orange-500)" /> Tạo Khách Hàng (Lead) Mới
          </span>
        }
      >
        <form onSubmit={handleCreateLead} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '12px 0' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Tên Khách Hàng *
              </label>
              <input required className="form-control" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} type="text" placeholder="Ví dụ: Anh Minh..." />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Số Điện Thoại Zalo *
              </label>
              <input required className="form-control" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} type="tel" placeholder="090..." />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Nguồn Khách Hàng
              </label>
              <select required className="form-control" value={formData.source} onChange={e => setFormData({ ...formData, source: e.target.value })}>
                <option value="Web Form (Zalo)">Web Form (Zalo)</option>
                <option value="Google Form">Google Form</option>
                <option value="Facebook">Facebook</option>
                <option value="Zalo cá nhân">Zalo cá nhân</option>
                <option value="Hotline">Hotline công ty</option>
                <option value="Giới thiệu">Khách giới thiệu</option>
                <option value="Khác">Khác</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Nhu cầu / Vị trí đất / Quy mô
              </label>
              <textarea className="form-control" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Dịch vụ: Đo hiện trạng | Vị trí: Củ Chi | Quy mô: 200m2..." style={{ minHeight: '80px', resize: 'vertical' }}></textarea>
            </div>
          </div>
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', marginTop: '16px', borderTop: '1px solid var(--border-default)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Hủy bỏ</button>
            <button type="submit" className="btn btn-primary" style={{ padding: '0 24px' }}>Tạo Mới & Đưa vào Pipeline</button>
          </div>
        </form>
      </Modal>

      {/* Modal Xác Nhận Chốt Deal & Sinh Hợp Đồng Thông Minh */}
      <Modal
        open={!!closingLead}
        onClose={() => setClosingLead(null)}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={20} color="var(--green-500)" /> Xác nhận Chốt Deal & Tạo Hợp Đồng
          </span>
        }
      >
        {closingLead && (
          <form onSubmit={handleConfirmClose} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '12px 0' }}>
              <div style={{ background: 'var(--bg-deep)', padding: '12px 14px', borderRadius: '8px', borderLeft: '3px solid var(--green-500)' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>
                  Khách hàng: {closingLead.customer_name} ({closingLead.phone})
                </p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                  {closingLead.requirements}
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Giá trị Hợp Đồng (VNĐ) <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  required
                  className="form-control"
                  value={closingData.price}
                  onChange={e => setClosingData({ ...closingData, price: e.target.value })}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  aria-invalid={closingData.price !== '' && (!Number.isFinite(Number(closingData.price)) || Number(closingData.price) <= 0)}
                  placeholder="Ví dụ: 15000000"
                />
                {closingData.price !== '' && (!Number.isFinite(Number(closingData.price)) || Number(closingData.price) <= 0) && (
                  <div role="alert" style={{ color: 'var(--red-600, #dc2626)', fontSize: '0.78rem', marginTop: '6px' }}>
                    Giá trị hợp đồng phải lớn hơn 0.
                  </div>
                )}
                {closingData.price && Number(closingData.price) > 0 && (
                  <div className="currency-live-preview">
                    <span>Số tiền hiển thị:</span>
                    <span>{new Intl.NumberFormat('vi-VN').format(Number(closingData.price))} VNĐ</span>
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Quy mô / Diện tích / Số mốc
                </label>
                <input
                  className="form-control"
                  value={closingData.area}
                  onChange={e => setClosingData({ ...closingData, area: e.target.value })}
                  type="text"
                  placeholder="Ví dụ: 250 m2 hoặc 06 mốc ranh hoặc 01 bộ hồ sơ..."
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                  Dữ liệu này sẽ tự động điền vào mục "Diện tích/Quy mô (tạm tính)" trên Hợp đồng Word.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Mã số thuế / CCCD (Tùy chọn)
                </label>
                <input
                  className="form-control"
                  value={closingData.tax_id}
                  onChange={e => setClosingData({ ...closingData, tax_id: e.target.value })}
                  type="text"
                  placeholder="Nhập mã số thuế hoặc số CCCD..."
                />
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', marginTop: '16px', borderTop: '1px solid var(--border-default)' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setClosingLead(null)}>Hủy bỏ</button>
              <button type="submit" className="btn btn-primary" style={{ padding: '0 24px', background: '#16a34a', borderColor: '#16a34a' }}>
                Chốt Deal & Sinh Hợp Đồng Tự Động
              </button>
            </div>
          </form>
        )}
      </Modal>
      {/* Modal Mã QR Quét Form Tiếp Nhận Khách Hàng */}
      <Modal
        open={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <QrCodeIcon size={20} color="var(--orange-500)" /> Mã QR Form Tiếp Nhận (Zalo / Mobile)
          </span>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '12px 0' }}>
          {/* Card hiển thị mã QR nét cao */}
          <div style={{
            background: '#ffffff',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px'
          }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrCustomUrl || `${window.location.origin}/intake`)}&margin=6`}
              alt="Mã QR Form Tiếp Nhận Khách Hàng Bách Khoa"
              width={240}
              height={240}
              style={{ borderRadius: '8px', display: 'block' }}
            />
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--orange-600)', letterSpacing: '0.04em' }}>
              BÁCH KHOA • QUÉT BẰNG ZALO HOẶC CAMERA
            </div>
          </div>

          {/* Ô link & nút copy */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Đường dẫn trang tiếp nhận:
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-control"
                value={qrCustomUrl}
                onChange={(e) => setQrCustomUrl(e.target.value)}
                placeholder="http://..."
                style={{ flex: 1, fontSize: '0.85rem' }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  navigator.clipboard.writeText(qrCustomUrl);
                  setQrCopied(true);
                  setTimeout(() => setQrCopied(false), 2500);
                }}
                style={{ minWidth: '100px' }}
              >
                {qrCopied ? <Check size={14} style={{ color: 'var(--green-500)' }} /> : <Copy size={14} />}
                {qrCopied ? 'Đã chép!' : 'Sao chép'}
              </button>
            </div>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)', margin: '4px 0 0', lineHeight: 1.4 }}>
              💡 <strong>Cách dùng:</strong> Khách hàng chỉ cần mở Zalo (nút quét mã góc trên phải) hoặc Camera điện thoại quét mã này để mở ngay biểu mẫu khảo sát & báo giá.
            </p>
          </div>

          {/* Nút tải về & thao tác */}
          <div style={{ width: '100%', display: 'flex', gap: '10px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
            <a
              href={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrCustomUrl || `${window.location.origin}/intake`)}&margin=12`}
              download="QR_BachKhoa_TiepNhan.png"
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary btn-sm"
              style={{ flex: 1, textDecoration: 'none' }}
            >
              Tải Ảnh QR (.PNG Nét Cao)
            </a>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsQrModalOpen(false)}
            >
              Đóng
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
