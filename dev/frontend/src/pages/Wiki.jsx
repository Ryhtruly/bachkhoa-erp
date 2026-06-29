import React, { useState, useEffect } from 'react';
import { Book, UploadCloud, Link as LinkIcon } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

export default function Wiki() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    id: '', title: '', category: 'Quy trình nội bộ', link: ''
  });

  const fetchWiki = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8080/api/wiki');
      if (res.ok) {
        const data = await res.json();
        setDocuments(Array.isArray(data) ? data : data.data || []);
      }
    } catch (err) {
      addToast('Lỗi tải Wiki', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWiki();
  }, []);

  const handleUploadWiki = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('http://127.0.0.1:8080/api/wiki/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, roles_allowed: ["*"] })
      });
      if (res.ok) {
        addToast('Đăng tài liệu thành công!', 'success');
        setIsModalOpen(false);
        setFormData({ id: '', title: '', category: 'Quy trình nội bộ', link: '' });
        fetchWiki();
      } else {
        const err = await res.json();
        addToast('Lỗi: ' + (err.detail || 'Không thể lưu tài liệu'), 'error');
      }
    } catch {
      addToast('Lỗi kết nối máy chủ', 'error');
    }
  };

  return (
    <section className="tab-pane active" id="tab-wiki">
      <div className="toolbar card" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Book color="var(--orange-500)" size={20} /> Tri Thức Doanh Nghiệp (Wiki)
          </h3>
          <p className="sub">Kho lưu trữ Quy trình ISO và sổ tay nội bộ.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <UploadCloud size={16} /> Upload Tài Liệu
        </button>
      </div>
      
      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Mã Tài Liệu</th>
              <th>Tên Tài Liệu / Quy Trình</th>
              <th>Phân Loại</th>
              <th>Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>Đang tải...</td></tr>
            ) : documents.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Chưa có tài liệu nào</td></tr>
            ) : (
              documents.map(doc => (
                <tr key={doc.id}>
                  <td><strong style={{ fontFamily: 'var(--font-mono)' }}>{doc.id}</strong></td>
                  <td>{doc.title}</td>
                  <td><span className="badge badge-info">{doc.category}</span></td>
                  <td>
                    <a href={doc.link} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      Xem
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target.className.includes('modal-overlay')) setIsModalOpen(false) }}>
          <div className="modal card" style={{ maxWidth: '500px', width: '100%' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UploadCloud size={20} /> Upload Tài Liệu Mới
              </h2>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleUploadWiki} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
              <div><label>Mã tài liệu</label><input required value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} type="text" placeholder="VD: ISO-001" /></div>
              <div><label>Tên quy trình / Tài liệu</label><input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} type="text" placeholder="Quy trình đo đạc..." /></div>
              <div>
                <label>Phân loại</label>
                <select required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                  <option>Quy trình nội bộ</option>
                  <option>Hướng dẫn sử dụng</option>
                  <option>Biểu mẫu văn bản</option>
                  <option>Tài liệu đào tạo</option>
                </select>
              </div>
              <div>
                <label>Link đính kèm (Google Drive / Docs)</label>
                <div style={{ position: 'relative' }}>
                  <LinkIcon size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                  <input required value={formData.link} onChange={e => setFormData({...formData, link: e.target.value})} type="url" placeholder="https://" style={{ paddingLeft: '36px', width: '100%' }} />
                </div>
              </div>
              <div className="modal-footer" style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu tài liệu</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
