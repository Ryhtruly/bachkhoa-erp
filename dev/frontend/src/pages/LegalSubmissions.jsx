import React, { useState, useEffect, useCallback } from 'react';
import {
  FileCheck,
  Eye,
  Phone,
  RefreshCw,
  ExternalLink,
  Pencil,
  Clock3,
} from 'lucide-react';
import {
  DataTable,
  Modal,
  StatCard,
  StatsGrid,
  FilterBar,
  Badge,
} from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { isDossierLocked } from '../lib/dossierStatus';
import LegalDossierActions from '../features/legal-dossier/LegalDossierActions';
import './legalSubmissions.css';

const API = '';

const GOV_STATUS_OPTIONS = ['Đang chi nhánh', 'Hoàn thành', 'Rút hồ sơ', 'Trả công văn'];

const GOV_STATUS_VARIANTS = {
  'Đang chi nhánh': 'info',
  'Hoàn thành': 'success',
  'Rút hồ sơ': 'warning',
  'Trả công văn': 'neutral',
};

const toEditForm = (data) => ({
  dossier_name: data.dossier_name || '',
  case_description: data.case_description || '',
  contact_phone: data.contact_phone || '',
  receipt_code: data.receipt_code || '',
  receipt_photo_url: data.receipt_photo_url || '',
  dossier_file_url: data.dossier_file_url || '',
  payment_status: data.payment_status || '',
  gov_status: data.gov_status || 'Đang chi nhánh',
  received_date: data.received_date || '',
  expected_return_date: data.expected_return_date || '',
  note: data.note || '',
});

// Ở chế độ xem chỉ hiển thị chữ; phải bấm nút "Sửa" mới đổi sang ô nhập liệu.
function Field({ label, wide, mono, editing, value, empty = 'Chưa có', children }) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div className={`legal-field${wide ? ' legal-field--wide' : ''}`}>
      <span className="legal-field__label">{label}</span>
      {editing ? children : (
        <div className={`legal-field__value${isEmpty ? ' legal-field__value--muted' : ''}${mono && !isEmpty ? ' legal-field__value--code' : ''}`}>
          {isEmpty ? empty : value}
        </div>
      )}
    </div>
  );
}

const driveLink = (url, label) => url
  ? <a className="legal-field__link" href={url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> {label}</a>
  : '';

const formatDate = (val) => {
  if (!val) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN').format(new Date(val.includes('T') ? val : `${val}T00:00:00`));
  } catch {
    return val;
  }
};

export default function LegalSubmissions() {
  const { addToast } = useToast();

  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats] = useState({ total: 0 });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  // Hồ sơ (1 dòng / Hạng mục) giữ trạng thái vòng đời; mỗi lần nộp là một dòng
  // legal_submissions treo dưới nó. Hai thứ khác nhau nên tải riêng.
  const [dossier, setDossier] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState(null);
  // Mở chi tiết là chế độ XEM; phải bấm nút "Sửa" mới cho nhập liệu.
  const [editing, setEditing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/legal-submissions/stats`);
      if (res.ok) {
        const payload = await res.json();
        setStats(payload.data || { total: 0 });
      }
    } catch (err) {
      console.error('Fetch stats error:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // showLoading=false cho vòng lặp polling ngầm — không bật spinner/xoá UI khi tự làm mới,
  // vì dòng dữ liệu được hệ thống tự tạo khi nhân viên khác bấm "Bắt đầu làm" ở Node Pháp lý.
  const fetchSubmissions = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (searchTerm) params.set('search', searchTerm);
      if (statusFilter && statusFilter !== 'All') params.set('gov_status', statusFilter);

      const res = await fetch(`${API}/api/legal-submissions/?${params}`);
      if (res.ok) {
        const payload = await res.json();
        setSubmissions(payload.data || []);
        if (payload.meta) {
          setPagination({
            total: payload.meta.total || 0,
            total_pages: payload.meta.total_pages || 1,
          });
        }
      } else if (showLoading) {
        addToast('Lỗi khi tải danh sách hồ sơ pháp lý', 'error');
      }
    } catch (err) {
      if (showLoading) addToast('Không thể kết nối đến máy chủ', 'error');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [addToast, limit, page, searchTerm, statusFilter]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    fetchSubmissions(true);
    const pollId = setInterval(() => fetchSubmissions(false), 8000);
    return () => clearInterval(pollId);
  }, [fetchSubmissions]);

  const loadDossier = useCallback(async (taskNodeId) => {
    if (!taskNodeId) { setDossier(null); return; }
    try {
      const res = await fetch(`${API}/api/legal-dossiers/by-task-node/${taskNodeId}`);
      setDossier(res.ok ? (await res.json()).data : null);
    } catch {
      setDossier(null);
    }
  }, []);

  const handleOpenDetailModal = async (submissionId) => {
    setSelectedSubmissionId(submissionId);
    setIsDetailModalOpen(true);
    setDetailLoading(true);
    setEditing(false);
    setDetailError('');
    try {
      const res = await fetch(`${API}/api/legal-submissions/${submissionId}`);
      if (res.ok) {
        const payload = await res.json();
        const data = payload.data;
        setDetailData(data);
        setEditForm(toEditForm(data));
        loadDossier(data.task_node_id);
      } else {
        // Không được để hộp thoại đứng ở "Đang tải…" mãi — phải nói rõ hỏng gì
        // và cho người dùng bấm thử lại.
        setDetailError(`Không lấy được chi tiết hồ sơ (lỗi ${res.status}).`);
        addToast('Không lấy được chi tiết hồ sơ', 'error');
      }
    } catch {
      setDetailError('Mất kết nối tới máy chủ.');
      addToast('Lỗi kết nối khi tải chi tiết', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveDetail = async (e) => {
    e.preventDefault();
    if (!selectedSubmissionId || !editForm) return;
    try {
      setSaving(true);
      const res = await fetch(`${API}/api/legal-submissions/${selectedSubmissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        addToast('Đã cập nhật hồ sơ pháp lý!', 'success');
        setEditing(false);
        setIsDetailModalOpen(false);
        fetchSubmissions(true);
        fetchStats();
      } else {
        addToast(data.detail || 'Cập nhật thất bại', 'error');
        if (res.status === 409) handleOpenDetailModal(selectedSubmissionId);
      }
    } catch {
      addToast('Lỗi máy chủ khi cập nhật', 'error');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: 'dossier_name',
      label: 'TÊN HỒ SƠ',
      width: 220,
      render: (val, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <strong>{val || 'Chưa có tên'}</strong>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
            {row.contract_id} · {row.service_line_name || 'Hạng mục'}
          </span>
        </div>
      ),
    },
    {
      key: 'receipt_code',
      label: 'SỐ BIÊN NHẬN',
      width: 150,
      render: (val) => val
        ? <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{val}</strong>
        : <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Chưa nộp</span>,
    },
    {
      key: 'assigned_employee_name',
      label: 'PHỤ TRÁCH PHÁP LÝ',
      width: 180,
      render: (val, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{val || 'Chưa phân công'}</span>
          {row.contact_phone && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
              <Phone size={11} /> {row.contact_phone}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'gov_status',
      label: 'TÌNH TRẠNG',
      width: 170,
      // Chỉ hiển thị — mọi chỉnh sửa đi qua nút "Chi tiết" rồi bấm "Sửa",
      // không cho sửa trực tiếp trên dòng dữ liệu.
      render: (val) => (
        <Badge variant={GOV_STATUS_VARIANTS[val] || 'neutral'}>{val || 'Đang chi nhánh'}</Badge>
      ),
    },
    {
      key: 'received_date',
      label: 'NGÀY NHẬN',
      width: 110,
      render: (val) => formatDate(val),
    },
    {
      key: 'expected_return_date',
      label: 'NGÀY HẸN TRẢ',
      width: 110,
      render: (val) => formatDate(val),
    },
    {
      key: 'actions',
      label: 'THAO TÁC',
      width: 110,
      align: 'center',
      render: (_, row) => (
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => handleOpenDetailModal(row.id)}
        >
          <Eye size={14} />
          Chi tiết
        </button>
      ),
    },
  ];

  return (
    <section className="tab-pane active phaply-page list-page-frame">
      <div className="list-page-frame__toolbar">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>
              <FileCheck size={22} style={{ color: 'var(--orange-500)' }} />
              Hồ Sơ Pháp Lý
            </h2>
            <div className="sub" style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: 2 }}>
              Hồ sơ nộp cơ quan nhà nước — tự sinh khi Node Pháp lý bắt đầu, không tạo tay
            </div>
          </div>
        </div>

        <StatsGrid cols={5}>
          <StatCard label="Tổng hồ sơ" value={stats.total || 0} icon={FileCheck} loading={statsLoading} />
          {GOV_STATUS_OPTIONS.map(opt => (
            <StatCard key={opt} label={opt} value={stats[opt] || 0} loading={statsLoading} />
          ))}
        </StatsGrid>

        <FilterBar
          search={searchTerm}
          onSearchChange={(val) => { setSearchTerm(val); setPage(1); }}
          searchPlaceholder="Tìm theo tên hồ sơ, số biên nhận, mã hợp đồng..."
          filters={[
            {
              key: 'gov_status',
              label: 'Tình trạng',
              type: 'select',
              width: 190,
              options: GOV_STATUS_OPTIONS.map(opt => ({ value: opt, label: opt })),
            },
          ]}
          values={{ gov_status: statusFilter }}
          onFilterChange={(_key, value) => { setStatusFilter(value || 'All'); setPage(1); }}
          onReset={() => { setSearchTerm(''); setStatusFilter('All'); setPage(1); }}
          actions={(
            <button type="button" className="btn btn-ghost" title="Làm mới" onClick={() => { fetchSubmissions(true); fetchStats(); }}>
              <RefreshCw size={16} />
            </button>
          )}
        />
      </div>

      <div className="list-page-frame__table">
        <DataTable
          columns={columns}
          data={submissions}
          loading={loading}
          rowKey="id"
          emptyText="Chưa có hồ sơ pháp lý nào — hồ sơ sẽ tự sinh khi nhân viên bắt đầu làm Node Pháp lý"
          pageSize={0}
        />
        <div className="contract-server-pagination">
          <span>{submissions.length ? `${(page - 1) * limit + 1}–${(page - 1) * limit + submissions.length}` : '0'} / {pagination.total} hồ sơ</span>
          <div className="contract-server-pagination__controls">
            <button type="button" className="contract-page-button" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
            <button type="button" className="contract-page-button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button>
            <span className="contract-page-button contract-page-button--active">{page}</span>
            <button type="button" className="contract-page-button" disabled={page >= pagination.total_pages} onClick={() => setPage(p => Math.min(pagination.total_pages, p + 1))}>›</button>
            <button type="button" className="contract-page-button" disabled={page >= pagination.total_pages} onClick={() => setPage(pagination.total_pages)}>»</button>
          </div>
        </div>
      </div>

      <Modal
        open={isDetailModalOpen}
        onClose={() => !saving && setIsDetailModalOpen(false)}
        size="md"
        closeOnOverlay={!saving}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileCheck size={20} style={{ color: 'var(--orange-500)' }} />
            Chi tiết Hồ Sơ Pháp Lý
          </span>
        }
      >
        {detailLoading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>Đang tải…</div>
        ) : (detailError || !editForm) ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--danger-600, #dc2626)', marginBottom: 14 }}>
              {detailError || 'Không có dữ liệu để hiển thị.'}
            </p>
            <button type="button" className="btn btn-secondary"
              onClick={() => handleOpenDetailModal(selectedSubmissionId)}>
              Thử lại
            </button>
          </div>
        ) : (
          <form onSubmit={handleSaveDetail}>
            <div className="legal-detail__identity">
              <div>
                <div className="legal-detail__identity-code">
                  {detailData?.contract_id}
                  <span>{detailData?.service_line_name}</span>
                </div>
                <div className="legal-detail__identity-name">{editForm.dossier_name || 'Chưa đặt tên hồ sơ'}</div>
              </div>
              <Badge variant={GOV_STATUS_VARIANTS[editForm.gov_status] || 'neutral'}>{editForm.gov_status}</Badge>
            </div>

            {dossier && (
              <LegalDossierActions
                dossier={dossier}
                addToast={addToast}
                onDone={() => { loadDossier(detailData?.task_node_id); fetchSubmissions(); }}
              />
            )}

            <section className="legal-detail__section">
              <h4 className="legal-detail__section-title">Hồ sơ</h4>
              <div className="legal-detail__grid">
                <Field label="Tên hồ sơ" wide editing={editing} value={editForm.dossier_name}>
                  <input className="form-control" value={editForm.dossier_name}
                    onChange={(e) => setEditForm({ ...editForm, dossier_name: e.target.value })} />
                </Field>
                <Field label="Loại việc" wide editing={editing} value={editForm.case_description}>
                  <input className="form-control" placeholder="VD: Chuyển mục đích sử dụng đất"
                    value={editForm.case_description}
                    onChange={(e) => setEditForm({ ...editForm, case_description: e.target.value })} />
                </Field>
                <Field label="Phụ trách pháp lý" editing={false}
                  value={detailData?.assigned_employee_name} empty="Chưa phân công" />
                <Field label="Số điện thoại" mono editing={editing} value={editForm.contact_phone}>
                  <input className="form-control" value={editForm.contact_phone}
                    onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })} />
                </Field>
              </div>
            </section>

            <section className="legal-detail__section">
              <h4 className="legal-detail__section-title">Biên nhận cơ quan</h4>
              {editing ? (
                <div className="legal-detail__grid">
                  <Field label="Số biên nhận" editing value={editForm.receipt_code}>
                    <input className="form-control" placeholder="VD: H29.147-260406-9248"
                      value={editForm.receipt_code}
                      onChange={(e) => setEditForm({ ...editForm, receipt_code: e.target.value })} />
                  </Field>
                  <Field label="Tình trạng" editing value={editForm.gov_status}>
                    <select className="form-control" value={editForm.gov_status}
                      onChange={(e) => setEditForm({ ...editForm, gov_status: e.target.value })}>
                      {GOV_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </Field>
                  <Field label="Ngày nhận" editing value={editForm.received_date}>
                    <input type="date" className="form-control" value={editForm.received_date || ''}
                      onChange={(e) => setEditForm({ ...editForm, received_date: e.target.value })} />
                  </Field>
                  <Field label="Ngày hẹn trả" editing value={editForm.expected_return_date}>
                    <input type="date" className="form-control" value={editForm.expected_return_date || ''}
                      onChange={(e) => setEditForm({ ...editForm, expected_return_date: e.target.value })} />
                  </Field>
                  <Field label="Ảnh chụp biên nhận" wide editing value={editForm.receipt_photo_url}>
                    <input className="form-control" placeholder="Dán link Drive ảnh biên nhận"
                      value={editForm.receipt_photo_url}
                      onChange={(e) => setEditForm({ ...editForm, receipt_photo_url: e.target.value })} />
                  </Field>
                </div>
              ) : (
                <div className={`legal-receipt${editForm.receipt_code ? ' legal-receipt--filled' : ''}`}>
                  {editForm.receipt_code ? (
                    <>
                      <span className="legal-receipt__code">{editForm.receipt_code}</span>
                      <div className="legal-receipt__dates">
                        <Field label="Ngày nhận" value={formatDate(editForm.received_date)} />
                        <Field label="Ngày hẹn trả" value={formatDate(editForm.expected_return_date)} />
                        <Field label="Ảnh chụp biên nhận" wide
                          value={driveLink(editForm.receipt_photo_url, 'Xem ảnh biên nhận')}
                          empty="Chưa đính kèm" />
                      </div>
                    </>
                  ) : (
                    <div className="legal-receipt__pending">
                      <Clock3 size={16} />
                      <div>
                        <strong>Chưa có biên nhận</strong>
                        <span>Bấm Sửa để điền số biên nhận sau khi nộp tại cơ quan.</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="legal-detail__section">
              <h4 className="legal-detail__section-title">Tài liệu &amp; theo dõi</h4>
              <div className="legal-detail__grid">
                <Field label="Tệp hồ sơ" wide editing={editing}
                  value={driveLink(editForm.dossier_file_url, 'Mở tệp hồ sơ')} empty="Chưa đính kèm">
                  <input className="form-control" placeholder="Dán link Drive hồ sơ tổng hợp"
                    value={editForm.dossier_file_url}
                    onChange={(e) => setEditForm({ ...editForm, dossier_file_url: e.target.value })} />
                </Field>
                {detailData?.linked_survey_folder_url && (
                  <Field label="Drive Đo vẽ" wide editing={false}
                    value={driveLink(detailData.linked_survey_folder_url, 'Mở thư mục Đo vẽ')} />
                )}
                <Field label="Thanh toán" editing={editing} value={editForm.payment_status}>
                  <input className="form-control" value={editForm.payment_status}
                    onChange={(e) => setEditForm({ ...editForm, payment_status: e.target.value })} />
                </Field>
                <Field label="Ghi chú nội bộ" editing={editing} value={editForm.note}>
                  <input className="form-control" value={editForm.note}
                    onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} />
                </Field>
              </div>
            </section>

            <div className="legal-detail__footer">
              {isDossierLocked(detailData, editForm.gov_status) ? (
                <>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }} role="status">
                    Hồ sơ đã hoàn tất và không thể chỉnh sửa.
                  </span>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsDetailModalOpen(false)}>Đóng</button>
                </>
              ) : editing ? (
                <>
                  <button type="button" className="btn btn-secondary" disabled={saving}
                    onClick={() => { setEditForm(toEditForm(detailData || {})); setEditing(false); }}>
                    Huỷ
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsDetailModalOpen(false)}>Đóng</button>
                  <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
                    <Pencil size={15} /> Sửa
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
