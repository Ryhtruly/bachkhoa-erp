import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Book, UploadCloud, Search, Filter, ChevronLeft, ChevronRight, FileText, FileUp, Info, CheckCircle, Download, Eye, Pencil, Trash2, Loader2, Bot, AlertTriangle, RefreshCw } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Modal, FormRow, CustomSelect, FilePreviewModal } from '../components/ui';
import { apiFetch, getAccessToken } from '../lib/api';
import { fetchProtectedDocumentFile, downloadBlob, resolveDocumentFileName } from '../lib/fileSave';

const AI_STATUS_POLL_MS = 5000;
const AI_STATUS_MAX_POLLS = 36; // ~3 phút: tài liệu dài hoặc đang chờ lượt thử lại
const isAiStatusPending = (status) => ['QUEUED', 'PROCESSING', 'PENDING'].includes(status?.status);

// Trợ lý AI đã "học" tài liệu chưa — trước đây chỉ nằm trong log server.
function WikiAiStatus({ status, canReindex, reindexing, onReindex }) {
  if (!status) return null;
  const base = { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 500 };
  let body;
  if (status.status === 'FAILED') {
    body = (
      <span style={{ ...base, color: 'var(--red-500, #ef4444)' }} title={status.error || ''}>
        <AlertTriangle size={13} /> AI chưa học được: {status.error || 'lỗi không rõ'}
      </span>
    );
  } else if (status.chunks > 0 && !isAiStatusPending(status)) {
    body = <span style={{ ...base, color: 'var(--green-600, #059669)' }}><Bot size={13} /> AI đã học ({status.chunks} đoạn)</span>;
  } else if (status.status === 'PENDING') {
    // Chưa vào hàng đợi: worker sẽ nhặt trong vòng 1 phút, hoặc bấm "Học lại" để xếp ngay.
    body = <span style={{ ...base, color: 'var(--text-tertiary)' }}><Bot size={13} /> AI chưa học tài liệu này — đang chờ lượt</span>;
  } else {
    body = <span style={{ ...base, color: 'var(--text-tertiary)' }}><Loader2 size={13} className="animate-spin" /> AI đang đọc tài liệu…</span>;
  }
  const showReindex = canReindex && (
    status.status === 'FAILED' || status.status === 'PENDING' || (!isAiStatusPending(status) && status.chunks > 0)
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', marginLeft: '24px', flexWrap: 'wrap' }}>
      {body}
      {showReindex && (
        <button
          type="button"
          onClick={onReindex}
          disabled={reindexing}
          style={{ ...base, padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: reindexing ? 'wait' : 'pointer' }}
        >
          <RefreshCw size={12} className={reindexing ? 'animate-spin' : undefined} /> Học lại
        </button>
      )}
    </div>
  );
}

export default function Wiki({ user: propUser, isDirector: propIsDirector }) {
  const [currentUser, setCurrentUser] = useState(propUser || null);

  useEffect(() => {
    if (propUser) {
      setCurrentUser(propUser);
    } else {
      apiFetch('/api/auth/me')
        .then(u => setCurrentUser(u))
        .catch(() => {});
    }
  }, [propUser]);

  const canUpload = propIsDirector ?? Boolean(
    currentUser?.is_director ||
    currentUser?.username === 'admin' ||
    currentUser?.role_name === 'admin' ||
    currentUser?.role === 'director' ||
    currentUser?.role_name === 'director' ||
    currentUser?.role === 'tong_giam_doc' ||
    currentUser?.role === 'pho_tong_giam_doc'
  );

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Edit & Delete modal states
  const [editModalDoc, setEditModalDoc] = useState(null);
  const [editFormData, setEditFormData] = useState({ title: '', category: 'Quy trình ISO', description: '' });
  const [editFile, setEditFile] = useState(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const [deletingDoc, setDeletingDoc] = useState(null);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);
  
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

  const [aiStatus, setAiStatus] = useState({});
  const [reindexingId, setReindexingId] = useState(null);
  const [aiStatusPollKey, setAiStatusPollKey] = useState(0);

  const documentIds = documents.map(doc => doc.id).join(',');
  useEffect(() => {
    if (!documentIds) {
      setAiStatus({});
      return undefined;
    }
    let cancelled = false;
    let timer;
    let polls = 0;
    const load = async () => {
      try {
        const data = await apiFetch(`/api/wiki/index-status?ids=${encodeURIComponent(documentIds)}`);
        if (cancelled) return;
        const next = data.data || {};
        setAiStatus(next);
        polls += 1;
        if (polls < AI_STATUS_MAX_POLLS && Object.values(next).some(isAiStatusPending)) {
          timer = setTimeout(load, AI_STATUS_POLL_MS);
        }
      } catch {
        // Trạng thái AI chỉ là thông tin phụ: lỗi thì không chặn danh sách tài liệu.
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [documentIds, aiStatusPollKey]);

  const handleReindex = async (doc) => {
    setReindexingId(doc.id);
    try {
      const data = await apiFetch(`/api/wiki/${encodeURIComponent(doc.id)}/reindex`, { method: 'POST' });
      setAiStatus(prev => ({ ...prev, [doc.id]: data.data }));
      setAiStatusPollKey(key => key + 1);
      showMessage('Đã xếp tài liệu vào hàng chờ để AI học lại.', 'success');
    } catch (error) {
      showMessage(error.message || 'Không thể cho AI học lại tài liệu.', 'error');
    } finally {
      setReindexingId(null);
    }
  };

  const fetchWiki = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: '10',
      });
      if (searchQuery) params.append('search', searchQuery);
      if (categoryFilter && categoryFilter !== 'Tất cả') params.append('category', categoryFilter);

      const data = await apiFetch(`/api/wiki/?${params.toString()}`);
      setDocuments(data.data || []);
      setTotalPages(data.meta?.total_pages || 1);
    } catch (error) {
      if (error?.status === 403) {
        showMessage('Bạn không có quyền xem tài liệu Wiki.', 'error');
      } else if (error?.status === 401) {
        showMessage('Phiên đăng nhập đã hết hạn.', 'error');
      } else {
        showMessage('Không thể tải dữ liệu Wiki.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, categoryFilter, showMessage]);

  // Fetch immediately on mount / filter change, debounce text search
  useEffect(() => {
    if (!searchQuery) {
      fetchWiki();
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchWiki();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchWiki, searchQuery]);

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

      await apiFetch('/api/wiki/upload', {
        method: 'POST',
        body: data,
      });
      showMessage('Đăng tài liệu thành công!', 'success');
      setIsModalOpen(false);
      setFormData({ id: '', title: '', category: 'Quy trình ISO' });
      setSelectedFile(null);
      fetchWiki();
    } catch (error) {
      if (error?.status === 403) {
        showMessage('Bạn không có quyền thêm tài liệu Wiki.', 'error');
      } else if (error?.status === 401) {
        showMessage('Phiên đăng nhập đã hết hạn.', 'error');
      } else {
        showMessage(error?.message || 'Không thể lưu tài liệu', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (doc) => {
    setEditModalDoc(doc);
    setEditFormData({
      title: doc.title || '',
      category: doc.category || 'Quy trình ISO',
      description: doc.description || '',
    });
    setEditFile(null);
  };

  const handleUpdateWiki = async (e) => {
    e.preventDefault();
    if (!editModalDoc) return;
    setSubmittingEdit(true);
    try {
      const data = new FormData();
      data.append('title', editFormData.title);
      data.append('category', editFormData.category);
      if (editFormData.description) {
        data.append('description', editFormData.description);
      }
      if (editFile) {
        data.append('file', editFile);
      }

      await apiFetch(`/api/wiki/${encodeURIComponent(editModalDoc.id)}`, {
        method: 'PUT',
        body: data,
      });
      showMessage('Cập nhật tài liệu thành công!', 'success');
      setEditModalDoc(null);
      setEditFile(null);
      fetchWiki();
    } catch (error) {
      if (error?.status === 403) {
        showMessage('Bạn không có quyền chỉnh sửa tài liệu Wiki.', 'error');
      } else {
        showMessage(error?.message || 'Không thể cập nhật tài liệu', 'error');
      }
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDeleteWiki = async () => {
    if (!deletingDoc) return;
    setDeletingDocId(deletingDoc.id);
    setSubmittingDelete(true);
    try {
      await apiFetch(`/api/wiki/${encodeURIComponent(deletingDoc.id)}`, {
        method: 'DELETE',
      });
      showMessage('Đã xóa tài liệu thành công!', 'success');
      setDeletingDoc(null);
      fetchWiki();
    } catch (error) {
      if (error?.status === 403) {
        showMessage('Bạn không có quyền xóa tài liệu Wiki.', 'error');
      } else {
        showMessage(error?.message || 'Không thể xóa tài liệu', 'error');
      }
    } finally {
      setSubmittingDelete(false);
      setDeletingDocId(null);
    }
  };

  const [preview, setPreview] = useState(null);
  const [openingDocId, setOpeningDocId] = useState(null);
  const [downloadingDocId, setDownloadingDocId] = useState(null);
  const objectUrlRef = useRef(null);

  const closePreview = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setPreview(null);
  };

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const handleOpenDocument = async (docOrId, docTitle) => {
    const doc = typeof docOrId === 'object' && docOrId !== null
      ? docOrId
      : { id: docOrId, title: docTitle };

    setOpeningDocId(doc.id);
    try {
      const { blob, fileName: headerFileName, mimeType } = await fetchProtectedDocumentFile(
        `/api/wiki/download/${encodeURIComponent(doc.id)}`,
        getAccessToken(),
      );
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;

      const resolvedFileName = resolveDocumentFileName(doc, headerFileName, mimeType || blob.type);

      setPreview({
        fileName: resolvedFileName,
        mimeType: mimeType || blob.type,
        url: objectUrl,
        blob,
      });
    } catch (err) {
      showMessage(err?.message || 'Không thể mở tài liệu Wiki', 'error');
    } finally {
      setOpeningDocId(null);
    }
  };

  const handleDownloadDocument = async (docOrId, docTitle) => {
    const doc = typeof docOrId === 'object' && docOrId !== null
      ? docOrId
      : { id: docOrId, title: docTitle };

    setDownloadingDocId(doc.id);
    try {
      const { blob, fileName: headerFileName, mimeType } = await fetchProtectedDocumentFile(
        `/api/wiki/download/${encodeURIComponent(doc.id)}`,
        getAccessToken(),
      );

      const resolvedFileName = resolveDocumentFileName(doc, headerFileName, mimeType || blob.type);
      downloadBlob(blob, resolvedFileName);
    } catch (err) {
      showMessage(err?.message || 'Không thể tải tài liệu', 'error');
    } finally {
      setDownloadingDocId(null);
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
        {canUpload && (
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UploadCloud size={16} /> Thêm Tài Liệu Mới
          </button>
        )}
      </div>

      <div className="filters card" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 10 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px', position: 'relative', zIndex: 11 }}>
          <Filter size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
          <CustomSelect 
            value={categoryFilter}
            onChange={(val) => { setCategoryFilter(val); setPage(1); }}
            options={categories}
            placeholder="Tất cả"
            aria-label="Lọc theo phân loại tài liệu"
          />
        </div>
      </div>
      
      <div className="table-wrap card" style={{ padding: 0, position: 'relative', zIndex: 1 }}>
        <table>
          <thead>
            <tr>
              <th>Mã Tài Liệu</th>
              <th>Tên Tài Liệu / Quy Trình</th>
              <th>Phân Loại</th>
              <th style={{ textAlign: 'center', width: canUpload ? '160px' : '95px' }}>Hành Động</th>
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
                    <WikiAiStatus
                      status={aiStatus[doc.id]}
                      canReindex={canUpload}
                      reindexing={reindexingId === doc.id}
                      onReindex={() => handleReindex(doc)}
                    />
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
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenDocument(doc)}
                        disabled={openingDocId === doc.id}
                        className="btn btn-secondary btn-sm"
                        title="Mở file"
                        aria-label="Mở file"
                        style={{ width: '32px', height: '32px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      >
                        {openingDocId === doc.id ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadDocument(doc)}
                        disabled={downloadingDocId === doc.id}
                        className="btn btn-secondary btn-sm"
                        title="Tải về"
                        aria-label="Tải về"
                        style={{ width: '32px', height: '32px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                      >
                        {downloadingDocId === doc.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                      </button>
                      {canUpload && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditModal(doc)}
                            className="btn btn-secondary btn-sm"
                            title="Sửa tài liệu"
                            aria-label="Sửa tài liệu"
                            style={{ width: '32px', height: '32px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingDoc(doc)}
                            disabled={deletingDocId === doc.id}
                            className="btn btn-secondary btn-sm"
                            title="Xóa tài liệu"
                            aria-label="Xóa tài liệu"
                            style={{ width: '32px', height: '32px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--red-500, #ef4444)' }}
                          >
                            {deletingDocId === doc.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>
                        </>
                      )}
                    </div>
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

      {canUpload && (
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
            <CustomSelect
              value={formData.category}
              onChange={val => setFormData({ ...formData, category: val })}
              options={categories.filter(c => c !== 'Tất cả')}
              placeholder="Chọn phân loại"
              aria-label="Phân loại tài liệu"
            />
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
                      Hỗ trợ PDF, DOCX, XLSX, PNG, JPG... tối đa 25MB
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
      )}

      {canUpload && editModalDoc && (
        <Modal
          open={Boolean(editModalDoc)}
          onClose={() => { if (!submittingEdit) setEditModalDoc(null); }}
          title="Chỉnh Sửa Tài Liệu"
          size="md"
        >
          <form onSubmit={handleUpdateWiki} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <FormRow label="MÃ TÀI LIỆU">
              <input
                type="text"
                className="form-control"
                value={editModalDoc.id}
                disabled
                style={{ fontFamily: 'var(--font-mono)', opacity: 0.7, background: 'rgba(0,0,0,0.03)' }}
              />
            </FormRow>

            <FormRow label="TÊN QUY TRÌNH / TÀI LIỆU" required>
              <input
                type="text"
                className="form-control"
                required
                placeholder="Ví dụ: Quy trình đo đạc bản đồ địa chính..."
                value={editFormData.title}
                onChange={e => setEditFormData({ ...editFormData, title: e.target.value })}
              />
            </FormRow>

            <FormRow label="PHÂN LOẠI TÀI LIỆU" required>
              <CustomSelect
                value={editFormData.category}
                onChange={val => setEditFormData({ ...editFormData, category: val })}
                options={categories.filter(c => c !== 'Tất cả')}
                placeholder="Chọn phân loại"
                aria-label="Phân loại tài liệu"
              />
            </FormRow>

            <FormRow label="MÔ TẢ (TÙY CHỌN)">
              <textarea
                className="form-control"
                rows={3}
                placeholder="Nhập ghi chú hoặc mô tả ngắn về tài liệu..."
                value={editFormData.description}
                onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
              />
            </FormRow>

            <FormRow label="TỆP ĐÍNH KÈM">
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
                  onChange={e => setEditFile(e.target.files[0] || null)}
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
                  {editFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 600, fontSize: '0.88rem' }}>
                      <CheckCircle size={16} /> Thay bằng: {editFile.name} ({(editFile.size / 1024).toFixed(1)} KB)
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155' }}>
                        Tệp hiện tại: {editModalDoc.file_name || editModalDoc.link || 'Có sẵn'}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                        Nhấp hoặc kéo thả nếu muốn tải tệp mới thay thế (để trống nếu giữ nguyên)
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
                onClick={() => setEditModalDoc(null)}
                disabled={submittingEdit}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submittingEdit}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Pencil size={16} /> {submittingEdit ? 'Đang lưu...' : 'Lưu Thay Đổi'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {canUpload && deletingDoc && (
        <Modal
          open={Boolean(deletingDoc)}
          onClose={() => { if (!submittingDelete) setDeletingDoc(null); }}
          title="Xác Nhận Xóa Tài Liệu"
          size="sm"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
              Bạn có chắc chắn muốn xóa tài liệu <strong style={{ color: 'var(--orange-500)' }}>{deletingDoc.title}</strong> (Mã: <code>{deletingDoc.id}</code>)?
            </p>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Thao tác này sẽ gỡ bỏ tài liệu khỏi hệ thống và tri thức tìm kiếm.
            </p>
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              borderTop: '1px solid var(--border-subtle, #e2e8f0)',
              paddingTop: '16px'
            }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeletingDoc(null)}
                disabled={submittingDelete}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteWiki}
                disabled={submittingDelete}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#ef4444', color: '#fff' }}
              >
                {submittingDelete ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Đang xóa...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} /> Xóa Tài Liệu
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <FilePreviewModal
        open={Boolean(preview)}
        fileName={preview?.fileName || ''}
        mimeType={preview?.mimeType || ''}
        url={preview?.url || ''}
        blob={preview?.blob || null}
        onClose={closePreview}
      />
    </section>
  );
}
