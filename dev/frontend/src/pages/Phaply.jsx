import React, { useState, useEffect, useCallback } from 'react';
import {
  FileCheck,
  Plus,
  Search,
  Eye,
  Calendar,
  User,
  Building2,
  Image as ImageIcon,
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ExternalLink,
  Edit2
} from 'lucide-react';
import {
  DataTable,
  Modal,
  FormGrid,
  FormRow,
  StatCard,
  StatsGrid,
  Badge
} from '../components/ui';
import { useToast } from '../contexts/ToastContext';

const API = '';

const GOV_STATUS_OPTIONS = [
  'Đã nộp',
  'Đã tiếp nhận',
  'Đang xử lý',
  'Cần bổ sung',
  'Đã xong',
  'Từ chối'
];

const GOV_STATUS_VARIANTS = {
  'Đã nộp': 'info',
  'Đã tiếp nhận': 'primary',
  'Đang xử lý': 'warning',
  'Cần bổ sung': 'warning',
  'Đã xong': 'success',
  'Từ chối': 'danger'
};

const formatDate = (val) => {
  if (!val) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN').format(new Date(val.includes('T') ? val : `${val}T00:00:00`));
  } catch {
    return val;
  }
};

export default function Phaply() {
  const { addToast } = useToast();

  // ── States ──────────────────────────────────────────────────────────────────
  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, completed: 0, needs_supplement: 0, rejected: 0 });
  const [tasksList, setTasksList] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for Create
  const [createForm, setCreateForm] = useState({
    task_id: '',
    receipt_code: '',
    submitted_by: '',
    submission_date: new Date().toISOString().slice(0, 10),
    is_first_submission: true,
    expected_return_date: '',
    receipt_photo_url: '',
    received_by: '',
    gov_status: 'Đã nộp',
    note: ''
  });

  // Edit fields state in Detail Modal
  const [editForm, setEditForm] = useState({
    gov_status: '',
    receipt_photo_url: '',
    note: '',
    expected_return_date: '',
    received_by: '',
    submitted_by: ''
  });

  // ── Fetch Data ──────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await fetch(`${API}/api/legal-submissions/stats`);
      if (res.ok) {
        const payload = await res.json();
        setStats(payload.data || { total: 0, pending: 0, completed: 0, needs_supplement: 0, rejected: 0 });
      }
    } catch (err) {
      console.error('Fetch stats error:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true);
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
            total_pages: payload.meta.total_pages || 1
          });
        }
      } else {
        addToast('Lỗi khi tải danh sách hồ sơ pháp lý', 'error');
      }
    } catch (err) {
      console.error('Fetch submissions error:', err);
      addToast('Không thể kết nối đến máy chủ', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, limit, page, searchTerm, statusFilter]);

  const fetchTasksLookup = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/tasks/`);
      if (res.ok) {
        const payload = await res.json();
        setTasksList(payload.data || []);
      }
    } catch (err) {
      console.error('Fetch tasks error:', err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  useEffect(() => {
    fetchTasksLookup();
  }, [fetchTasksLookup]);

  // ── Inline Status Change ───────────────────────────────────────────────────
  const handleInlineStatusChange = async (submissionId, newStatus) => {
    try {
      const res = await fetch(`${API}/api/legal-submissions/${submissionId}/gov-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gov_status: newStatus })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        addToast(`Đã đổi trạng thái thành "${newStatus}"`, 'success');
        setSubmissions(prev => prev.map(item => item.id === submissionId ? { ...item, gov_status: newStatus } : item));
        fetchStats();
      } else {
        addToast(data.detail || 'Cập nhật trạng thái thất bại', 'error');
      }
    } catch (err) {
      addToast('Lỗi kết nối khi cập nhật trạng thái', 'error');
    }
  };

  // ── Create Submission ─────────────────────────────────────────────────────
  const handleOpenCreateModal = () => {
    setCreateForm({
      task_id: tasksList[0]?.['Mã hồ sơ'] || tasksList[0]?.id || '',
      receipt_code: '',
      submitted_by: '',
      submission_date: new Date().toISOString().slice(0, 10),
      is_first_submission: true,
      expected_return_date: '',
      receipt_photo_url: '',
      received_by: '',
      gov_status: 'Đã nộp',
      note: ''
    });
    setIsCreateModalOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.task_id) {
      addToast('Vui lòng chọn hồ sơ công việc', 'error');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${API}/api/legal-submissions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        addToast('Đã tạo lượt nộp hồ sơ pháp lý mới!', 'success');
        setIsCreateModalOpen(false);
        fetchSubmissions();
        fetchStats();
      } else {
        addToast(data.detail || 'Tạo lượt nộp thất bại', 'error');
      }
    } catch (err) {
      addToast('Lỗi máy chủ khi tạo lượt nộp', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Open & Fetch Detail ───────────────────────────────────────────────────
  const handleOpenDetailModal = async (submissionId) => {
    setSelectedSubmissionId(submissionId);
    setIsDetailModalOpen(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`${API}/api/legal-submissions/${submissionId}`);
      if (res.ok) {
        const payload = await res.json();
        const data = payload.data;
        setDetailData(data);
        setEditForm({
          gov_status: data.gov_status || 'Đã nộp',
          receipt_photo_url: data.receipt_photo_url || '',
          note: data.note || '',
          expected_return_date: data.expected_return_date || '',
          received_by: data.received_by || '',
          submitted_by: data.submitted_by || ''
        });
      } else {
        addToast('Không lấy được chi tiết lượt nộp', 'error');
      }
    } catch (err) {
      addToast('Lỗi kết nối khi tải chi tiết', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Save Updates in Detail Modal ──────────────────────────────────────────
  const handleSaveDetailUpdates = async (e) => {
    e.preventDefault();
    if (!selectedSubmissionId) return;

    try {
      setSaving(true);
      const res = await fetch(`${API}/api/legal-submissions/${selectedSubmissionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        addToast('Đã cập nhật thông tin lượt nộp!', 'success');
        // Refresh detail data
        const updatedDetailRes = await fetch(`${API}/api/legal-submissions/${selectedSubmissionId}`);
        if (updatedDetailRes.ok) {
          const payload = await updatedDetailRes.json();
          setDetailData(payload.data);
        }
        fetchSubmissions();
        fetchStats();
      } else {
        addToast(data.detail || 'Cập nhật thất bại', 'error');
      }
    } catch (err) {
      addToast('Lỗi máy chủ khi cập nhật', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Granular Photo update
  const handleUpdatePhotoOnly = async () => {
    if (!selectedSubmissionId) return;
    try {
      setSaving(true);
      const res = await fetch(`${API}/api/legal-submissions/${selectedSubmissionId}/photo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt_photo_url: editForm.receipt_photo_url })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        addToast('Đã cập nhật ảnh biên nhận!', 'success');
        fetchSubmissions();
      } else {
        addToast(data.detail || 'Lỗi cập nhật ảnh', 'error');
      }
    } catch {
      addToast('Lỗi kết nối', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Granular Note update
  const handleUpdateNoteOnly = async () => {
    if (!selectedSubmissionId) return;
    try {
      setSaving(true);
      const res = await fetch(`${API}/api/legal-submissions/${selectedSubmissionId}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: editForm.note })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        addToast('Đã cập nhật ghi chú!', 'success');
        fetchSubmissions();
      } else {
        addToast(data.detail || 'Lỗi cập nhật ghi chú', 'error');
      }
    } catch {
      addToast('Lỗi kết nối', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Table Columns Definition ──────────────────────────────────────────────
  const columns = [
    {
      key: 'receipt_code',
      label: 'MÃ BIÊN NHẬN',
      width: 170,
      render: (val, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <strong style={{ color: 'var(--blue-400, #38bdf8)', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.92rem' }}>
            {val || 'Chưa có mã'}
          </strong>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)' }}>
            Hồ sơ: {row.task_name || row.task_id}
          </span>
        </div>
      )
    },
    {
      key: 'submitted_by',
      label: 'NHÂN VIÊN NỘP',
      width: 160,
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <User size={14} style={{ color: 'var(--text-muted)' }} />
          <span>{val || 'Chưa ghi nhận'}</span>
        </div>
      )
    },
    {
      key: 'submission_date',
      label: 'NGÀY NỘP',
      width: 130,
      render: (val) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
          <span>{formatDate(val)}</span>
        </div>
      )
    },
    {
      key: 'gov_status',
      label: 'TRẠNG THÁI',
      width: 180,
      render: (val, row) => (
        <select
          className="form-control form-control-sm"
          style={{
            padding: '4px 8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: 'var(--surface-alt, #1e293b)',
            color: 'var(--text-main, #f8fafc)',
            border: '1px solid var(--border-default, #334155)'
          }}
          value={val || 'Đã nộp'}
          onChange={(e) => handleInlineStatusChange(row.id, e.target.value)}
        >
          {GOV_STATUS_OPTIONS.map(opt => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )
    },
    {
      key: 'actions',
      label: 'THAO TÁC',
      width: 130,
      align: 'center',
      render: (_, row) => (
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => handleOpenDetailModal(row.id)}
        >
          <Eye size={14} />
          <span>Chi tiết</span>
        </button>
      )
    }
  ];

  return (
    <div className="phaply-page" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header & Stats Cards */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>
            <FileCheck size={26} style={{ color: 'var(--accent, #38bdf8)' }} />
            Hồ Sơ Pháp Lý (Nộp CQNN)
          </h2>
          <div className="sub" style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
            Quản lý giấy hẹn, biên nhận và tiến trình xử lý hồ sơ tại các cơ quan nhà nước
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontWeight: 600 }}
          onClick={handleOpenCreateModal}
        >
          <Plus size={18} />
          Tạo lượt nộp mới
        </button>
      </div>

      {/* Stats Summary Cards */}
      <StatsGrid cols={5}>
        <StatCard
          label="Tổng lượt nộp"
          value={stats.total}
          icon={FileCheck}
          trend={statsLoading ? 'Đang tải...' : 'Tổng số'}
        />
        <StatCard
          label="Đang chờ xử lý"
          value={stats.pending}
          icon={Clock}
          tone="warning"
        />
        <StatCard
          label="Đã hoàn thành"
          value={stats.completed}
          icon={CheckCircle}
          tone="success"
        />
        <StatCard
          label="Cần bổ sung"
          value={stats.needs_supplement}
          icon={AlertTriangle}
          tone="warning"
        />
        <StatCard
          label="Từ chối"
          value={stats.rejected}
          icon={XCircle}
          tone="danger"
        />
      </StatsGrid>

      {/* Filter Bar & Controls */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: 36 }}
              placeholder="Tìm theo mã biên nhận, tên KH, SĐT..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Trạng thái CQNN:</span>
            <select
              className="form-control"
              style={{ width: 170 }}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="All">Tất cả trạng thái</option>
              {GOV_STATUS_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Refresh button */}
          <button
            type="button"
            className="btn btn-ghost"
            title="Làm mới dữ liệu"
            onClick={() => {
              fetchSubmissions();
              fetchStats();
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="card" style={{ padding: 20 }}>
        <DataTable
          columns={columns}
          data={submissions}
          loading={loading}
          rowKey="id"
          emptyText="Chưa có lượt nộp hồ sơ pháp lý nào"
          pageSize={limit}
        />

        {/* Pagination info */}
        {pagination.total_pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Hiển thị {submissions.length} / {pagination.total} lượt nộp
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Trang trước
              </button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.85rem' }}>
                {page} / {pagination.total_pages}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={page >= pagination.total_pages}
                onClick={() => setPage(p => p + 1)}
              >
                Trang sau
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── CREATE MODAL ──────────────────────────────────────────────────────── */}
      <Modal
        open={isCreateModalOpen}
        onClose={() => !saving && setIsCreateModalOpen(false)}
        size="md"
        closeOnOverlay={!saving}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={20} style={{ color: 'var(--accent)' }} />
            Tạo Lượt Nộp Hồ Sơ Pháp Lý
          </span>
        }
      >
        <form onSubmit={handleCreateSubmit}>
          <FormGrid cols={2}>
            <FormRow label="Hồ sơ công việc" required colSpan={2}>
              <select
                className="form-control"
                required
                value={createForm.task_id}
                onChange={(e) => setCreateForm({ ...createForm, task_id: e.target.value })}
              >
                {tasksList.map(task => {
                  const taskId = task.id || task['Mã hồ sơ'];
                  const name = task.task_name || task['Mã hồ sơ'] || taskId;
                  const cust = task.customer_name || task['Tên khách hàng'] || '';
                  return (
                    <option key={taskId} value={taskId}>
                      {name} {cust ? `(${cust})` : ''}
                    </option>
                  );
                })}
              </select>
            </FormRow>

            <FormRow label="Mã biên nhận (Tự sinh nếu để trống)">
              <input
                type="text"
                className="form-control"
                placeholder="BN-20260729-0001"
                value={createForm.receipt_code}
                onChange={(e) => setCreateForm({ ...createForm, receipt_code: e.target.value })}
              />
            </FormRow>

            <FormRow label="Nhân viên nộp">
              <input
                type="text"
                className="form-control"
                placeholder="Nguyễn Văn A"
                value={createForm.submitted_by}
                onChange={(e) => setCreateForm({ ...createForm, submitted_by: e.target.value })}
              />
            </FormRow>

            <FormRow label="Ngày nộp">
              <input
                type="date"
                className="form-control"
                value={createForm.submission_date}
                onChange={(e) => setCreateForm({ ...createForm, submission_date: e.target.value })}
              />
            </FormRow>

            <FormRow label="Ngày hẹn trả CQNN">
              <input
                type="date"
                className="form-control"
                value={createForm.expected_return_date}
                onChange={(e) => setCreateForm({ ...createForm, expected_return_date: e.target.value })}
              />
            </FormRow>

            <FormRow label="Trạng thái ban đầu">
              <select
                className="form-control"
                value={createForm.gov_status}
                onChange={(e) => setCreateForm({ ...createForm, gov_status: e.target.value })}
              >
                {GOV_STATUS_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </FormRow>

            <FormRow label="Cán bộ tiếp nhận tại CQTN">
              <input
                type="text"
                className="form-control"
                placeholder="Cán bộ phòng Một Cửa..."
                value={createForm.received_by}
                onChange={(e) => setCreateForm({ ...createForm, received_by: e.target.value })}
              />
            </FormRow>

            <FormRow label="Ảnh chụp biên nhận (URL)" colSpan={2}>
              <input
                type="text"
                className="form-control"
                placeholder="https://..."
                value={createForm.receipt_photo_url}
                onChange={(e) => setCreateForm({ ...createForm, receipt_photo_url: e.target.value })}
              />
            </FormRow>

            <FormRow label="Ghi chú thêm" colSpan={2}>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Nhập thông tin ghi chú nộp hồ sơ..."
                value={createForm.note}
                onChange={(e) => setCreateForm({ ...createForm, note: e.target.value })}
              />
            </FormRow>
          </FormGrid>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={saving}
              onClick={() => setIsCreateModalOpen(false)}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? 'Đang tạo...' : 'Tạo lượt nộp'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── DETAIL & UPDATE MODAL ─────────────────────────────────────────────── */}
      <Modal
        open={isDetailModalOpen}
        onClose={() => !saving && setIsDetailModalOpen(false)}
        size="lg"
        closeOnOverlay={!saving}
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={20} style={{ color: 'var(--accent)' }} />
            Chi Tiết Lượt Nộp Hồ Sơ Pháp Lý
          </span>
        }
      >
        {detailLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Đang tải thông tin chi tiết...
          </div>
        ) : detailData ? (
          <form onSubmit={handleSaveDetailUpdates}>
            {/* Header info badge summary */}
            <div style={{
              display: 'flex',
              justify: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: 'var(--surface-alt, #1e293b)',
              borderRadius: 8,
              marginBottom: 20
            }}>
              <div>
                <strong style={{ fontSize: '1.05rem', color: 'var(--accent)' }}>
                  {detailData.receipt_code || 'Chưa có mã biên nhận'}
                </strong>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Ngày nộp: {formatDate(detailData.submission_date)}
                </div>
              </div>
              <Badge variant={GOV_STATUS_VARIANTS[detailData.gov_status] || 'primary'}>
                {detailData.gov_status || 'Đã nộp'}
              </Badge>
            </div>

            {/* Linked Task & Customer info */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              padding: 16,
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              marginBottom: 20,
              backgroundColor: 'rgba(255,255,255,0.02)'
            }}>
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--accent)', textTransform: 'uppercase' }}>
                  Thông tin Hồ sơ & Công việc
                </h4>
                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span><strong>Tên/Mã HS:</strong> {detailData.task?.task_name || detailData.task?.id || detailData.task_id}</span>
                  <span><strong>Phòng ban:</strong> {detailData.task?.department || '—'}</span>
                  <span><strong>Mã hợp đồng:</strong> {detailData.contract?.id || detailData.task?.contract_id || '—'}</span>
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--accent)', textTransform: 'uppercase' }}>
                  Thông tin Khách hàng
                </h4>
                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span><strong>Khách hàng:</strong> {detailData.customer?.full_name || detailData.contract?.customer_name || '—'}</span>
                  <span><strong>SĐT:</strong> {detailData.customer?.phone || detailData.contract?.phone || '—'}</span>
                  <span><strong>Địa chỉ/Khu vực:</strong> {detailData.customer?.location || detailData.contract?.location || '—'}</span>
                </div>
              </div>
            </div>

            {/* Form for updates */}
            <FormGrid cols={2}>
              <FormRow label="Trạng thái cơ quan nhà nước">
                <select
                  className="form-control"
                  value={editForm.gov_status}
                  onChange={(e) => setEditForm({ ...editForm, gov_status: e.target.value })}
                >
                  {GOV_STATUS_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </FormRow>

              <FormRow label="Cán bộ tiếp nhận tại CQTN">
                <input
                  type="text"
                  className="form-control"
                  value={editForm.received_by}
                  onChange={(e) => setEditForm({ ...editForm, received_by: e.target.value })}
                />
              </FormRow>

              <FormRow label="Nhân viên đi nộp">
                <input
                  type="text"
                  className="form-control"
                  value={editForm.submitted_by}
                  onChange={(e) => setEditForm({ ...editForm, submitted_by: e.target.value })}
                />
              </FormRow>

              <FormRow label="Ngày hẹn trả CQTN">
                <input
                  type="date"
                  className="form-control"
                  value={editForm.expected_return_date}
                  onChange={(e) => setEditForm({ ...editForm, expected_return_date: e.target.value })}
                />
              </FormRow>

              <FormRow label="URL Ảnh chụp biên nhận" colSpan={2}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="https://..."
                    value={editForm.receipt_photo_url}
                    onChange={(e) => setEditForm({ ...editForm, receipt_photo_url: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleUpdatePhotoOnly}
                    title="Cập nhật nhanh ảnh"
                  >
                    Lưu ảnh
                  </button>
                </div>
              </FormRow>

              {/* Photo preview if available */}
              {editForm.receipt_photo_url && (
                <FormRow label="Xem ảnh biên nhận" colSpan={2}>
                  <div style={{
                    padding: 8,
                    border: '1px solid var(--border-default)',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    backgroundColor: 'var(--surface-alt)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ImageIcon size={18} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{editForm.receipt_photo_url}</span>
                    </div>
                    <a
                      href={editForm.receipt_photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-ghost"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <ExternalLink size={14} /> Mở ảnh
                    </a>
                  </div>
                </FormRow>
              )}

              <FormRow label="Ghi chú" colSpan={2}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={editForm.note}
                    onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={handleUpdateNoteOnly}
                    >
                      Lưu ghi chú nhanh
                    </button>
                  </div>
                </div>
              </FormRow>
            </FormGrid>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving}
                onClick={() => setIsDetailModalOpen(false)}
              >
                Đóng
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Đang lưu...' : 'Lưu tất cả thay đổi'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Không tìm thấy thông tin lượt nộp này.
          </div>
        )}
      </Modal>
    </div>
  );
}
