import React, { useState, useEffect } from 'react';
import { Book, UploadCloud, Link as LinkIcon, Search, Filter, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

export default function Wiki() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Search & Filter & Pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Tất cả');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const { showToast } = useToast(); // Fix: standardizing hook name if changed, or use addToast if Context provides addToast. 
  // Let's check Context provided name. Previous Wiki.jsx used `addToast`. I will use addToast to be safe. Wait, context uses `showToast` in other files (like Settings.jsx). Let's extract both and use whichever exists.
  const toastCtx = useToast();
  const showMessage = toastCtx.showToast || toastCtx.addToast || console.log;

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

      {isModalOpen && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target.className.includes('modal-overlay')) setIsModalOpen(false) }}>
          <div className="modal card" style={{ maxWidth: '500px', width: '100%', border: '1px solid var(--border-subtle)' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem' }}>
                <UploadCloud size={20} color="var(--blue-500)" /> Thêm Tài Liệu Mới
              </h2>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleUploadWiki} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--blue-400)' }}>
                ℹ️ Tải lên tệp tài liệu (PDF, Word, Excel...) từ máy tính của bạn.
              </div>
              <div>
                <label>Mã tài liệu (VD: ISO-001)</label>
                <input required value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} type="text" placeholder="Nhập mã duy nhất..." />
              </div>
              <div>
                <label>Tên quy trình / Tài liệu</label>
                <input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} type="text" placeholder="Quy trình đo đạc..." />
              </div>
              <div>
                <label>Phân loại</label>
                <select required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                  {categories.filter(c => c !== 'Tất cả').map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label>File đính kèm</label>
                <div style={{ position: 'relative' }}>
                  <input required onChange={e => setSelectedFile(e.target.files[0])} type="file" style={{ width: '100%' }} />
                </div>
              </div>
              <div className="modal-footer" style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UploadCloud size={16} /> Lưu vào hệ thống
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
