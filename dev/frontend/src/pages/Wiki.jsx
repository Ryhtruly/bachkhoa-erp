import React, { useState, useEffect } from 'react';
import { Book, UploadCloud, Link as LinkIcon, Search, Filter, ChevronLeft, ChevronRight, FileText, FileUp, Info, CheckCircle } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Modal, FormRow } from '../components/ui';

export default function Wiki() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Search & Filter & Pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Tất cả');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const toastCtx = useToast();
  const showMessage = toastCtx.addToast || toastCtx.showToast || console.log;

  const [formData, setFormData] = useState({
    id: '', title: '', category: 'Quy trình ISO'
  });
  const [selectedFile, setSelectedFile] = useState(null);

  const categories = ['Tất cả', 'Quy trình ISO', 'Sổ tay nhân sự', 'Tài liệu đào tạo', 'Quy định khác'];

  const fetchWiki = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        page_size: 10
      });
      if (searchQuery) params.append('search', searchQuery);
      if (categoryFilter && categoryFilter !== 'Tất cả') params.append('category', categoryFilter);

      const res = await fetch(`/api/wiki/?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.data || []);
        if (data.meta) {
          setTotalPages(data.meta.total_pages);
        }
      }
    } catch (err) {
      showMessage('Lỗi tải danh sách tài liệu', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch when page, category, or search (debounced) changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchWiki();
    }, 300);
    return () => clearTimeout(timer);
  }, [page, categoryFilter, searchQuery]);

  const handleUploadWiki = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      showMessage('Vui lòng chọn file đính kèm!', 'error');
      return;
    }
    
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('id', formData.id);
      data.append('title', formData.title);
      data.append('category', formData.category);
      data.append('file', selectedFile);

      const res = await fetch('/api/wiki/upload', {
        method: 'POST',
        body: data
      });
      if (res.ok) {
        showMessage('Đăng tài liệu thành công!', 'success');
        setIsModalOpen(false);
        setFormData({ id: '', title: '', category: 'Quy trình ISO' });
        setSelectedFile(null);
        fetchWiki();
      } else {
        const err = await res.json();
        showMessage('Lỗi: ' + (err.detail || 'Không thể lưu tài liệu'), 'error');
      }
    } catch {
      showMessage('Lỗi kết nối máy chủ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="tab-pane active" id="tab-wiki">
      <div className="toolbar card" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <Book color="var(--orange-500)" size={22} /> Tri Thức Doanh Nghiệp (Wiki)
          </h3>
          <p className="sub" style={{ marginTop: '4px', fontSize: '0.9rem' }}>Kho lưu trữ tài liệu, quy trình ISO, sổ tay nội bộ và HDSD trên Google Drive.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UploadCloud size={16} /> Thêm Tài Liệu Mới
        </button>
      </div>

      <div className="filters card" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input 
            type="text" 
            placeholder="Tìm kiếm theo tên hoặc mã tài liệu..." 
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={16} color="var(--text-tertiary)" />
          <select 
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}
          >
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
      </div>
      
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Mã Tài Liệu</th>
              <th>Tên Tài Liệu / Quy Trình</th>
              <th>Phân Loại</th>
              <th style={{ textAlign: 'center' }}>Hành Động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>Đang tải dữ liệu...</td></tr>
            ) : documents.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-tertiary)' }}>Chưa có tài liệu nào phù hợp.</td></tr>
            ) : (
              documents.map(doc => (
                <tr key={doc.id}>
                  <td><strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--blue-400)' }}>{doc.id}</strong></td>
                  <td style={{ fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={16} color="var(--text-tertiary)" />
                      {doc.title}
                    </div>
                  </td>
                  <td>
                    <span className="badge" style={{ 
                      background: doc.category.includes('ISO') ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: doc.category.includes('ISO') ? '#60a5fa' : '#fbbf24',
                      border: 'none'
                    }}>
                      {doc.category}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <a href={`/api/wiki/download/${doc.id}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={14} /> Mở file
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', borderTop: '1px solid var(--border-subtle)', gap: '16px' }}>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft size={16} /> Trước
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Trang {page} / {totalPages}</span>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Sau <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => { if (!submitting) setIsModalOpen(false); }}
        title="Thêm Tài Liệu Mới"
        size="md"
      >
        <form onSubmit={handleUploadWiki} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '0.86rem',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Info size={18} style={{ flexShrink: 0 }} />
            <span>Tải lên tệp tài liệu (PDF, Word, Excel...) từ máy tính của bạn lên hệ thống lưu trữ.</span>
          </div>

          <FormRow label="MÃ TÀI LIỆU (VD: ISO-001)" required>
            <input
              type="text"
              className="form-control"
              required
              placeholder="Nhập mã tài liệu duy nhất (VD: ISO-001, ST-2026)..."
              value={formData.id}
              onChange={e => setFormData({ ...formData, id: e.target.value })}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </FormRow>

          <FormRow label="TÊN QUY TRÌNH / TÀI LIỆU" required>
            <input
              type="text"
              className="form-control"
              required
              placeholder="Ví dụ: Quy trình đo đạc bản đồ địa chính..."
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
            />
          </FormRow>

          <FormRow label="PHÂN LOẠI TÀI LIỆU" required>
            <select
              className="form-control form-select"
              required
              value={formData.category}
              onChange={e => setFormData({ ...formData, category: e.target.value })}
            >
              {categories.filter(c => c !== 'Tất cả').map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </FormRow>

          <FormRow label="FILE ĐÍNH KÈM" required>
            <div style={{
              border: '2px dashed #cbd5e1',
              borderRadius: '10px',
              padding: '16px',
              textAlign: 'center',
              background: '#f8fafc',
              position: 'relative',
              cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}>
              <input
                type="file"
                required
                onChange={e => setSelectedFile(e.target.files[0] || null)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer'
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <FileUp size={24} color="#64748b" />
                {selectedFile ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 600, fontSize: '0.88rem' }}>
                    <CheckCircle size={16} /> {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </div>
                ) : (
                  <>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155' }}>
                      Nhấp vào đây hoặc kéo thả file để tải lên
                    </span>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                      Hỗ trợ PDF, DOCX, XLSX, PNG, JPG...
                    </span>
                  </>
                )}
              </div>
            </div>
          </FormRow>

          <div style={{
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '16px'
          }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={submitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <UploadCloud size={16} /> {submitting ? 'Đang tải lên...' : 'Lưu vào hệ thống'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
