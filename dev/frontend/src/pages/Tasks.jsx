import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderKanban,
  Eye,
  Phone,
  RefreshCw,
  Pencil,
  ScrollText,
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
import AvatarImage from '../components/AvatarImage';
import { isDossierLocked } from '../lib/dossierStatus';
import DocumentRegister from '../features/document-register/DocumentRegister';
import './surveyRecords.css';

const API = '';

// Ba trạng thái đầu do HỆ THỐNG tính theo tiến độ quy trình, không ai gõ tay được.
// Chỉ hai giá trị cuối là nhân viên tự chọn.
const COMPUTED_STATUSES = ['Đang thực hiện', 'Đã bàn giao', 'Hoàn thành'];
const MANUAL_STATUS_OPTIONS = ['Nộp thành công', 'Huỷ'];
const STATUS_OPTIONS = [...COMPUTED_STATUSES, ...MANUAL_STATUS_OPTIONS];

const STATUS_VARIANTS = {
  'Đang thực hiện': 'info',
  'Đã bàn giao': 'warning',
  'Hoàn thành': 'success',
  'Nộp thành công': 'primary',
  'Huỷ': 'neutral',
};

const PRIORITY_OPTIONS = [
  { value: 'HIGH', label: 'Cao' },
  { value: 'NORMAL', label: 'Trung bình' },
  { value: 'LOW', label: 'Thấp' },
];

const priorityLabel = (value) => PRIORITY_OPTIONS.find((item) => item.value === value)?.label || value;

// Ngưỡng "sắp đến hạn": 2 ngày trước hạn. Cảnh báo luôn TÍNH lúc hiển thị, không lưu DB —
// nếu lưu thì giá trị chết cứng tại thời điểm ghi và sai ngay hôm sau.
const DUE_SOON_DAYS = 2;

function computeWarning(record) {
  if (record.status === 'Huỷ') return { label: 'Đã huỷ', variant: 'neutral' };
  // Hồ sơ đã đóng thì không còn hạn nào để cảnh báo nữa.
  if (isDossierLocked(record)) return { label: 'Xong', variant: 'success' };
  // Đo vẽ xong nhưng hạng mục còn phần pháp lý — hạn của bước sau, không phải của mình.
  if (record.status === 'Đã bàn giao') return { label: 'Chờ pháp lý', variant: 'info' };
  if (!record.deadline_at) return { label: 'Chưa đặt hạn', variant: 'neutral' };
  const remainingMs = new Date(record.deadline_at).getTime() - Date.now();
  if (remainingMs < 0) return { label: 'Trễ hạn', variant: 'danger' };
  if (remainingMs <= DUE_SOON_DAYS * 86_400_000) return { label: 'Sắp đến hạn', variant: 'warning' };
  return { label: 'Trong hạn', variant: 'success' };
}

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN').format(new Date(value));
  } catch {
    return value;
  }
};

function Avatar({ name, url }) {
  if (!name) return null;
  return <AvatarImage
    className="survey-avatar survey-avatar--img"
    fallbackClassName="survey-avatar"
    src={url}
    name={name}
    title={name}
  />;
}

function Field({ label, wide, editing, value, empty = 'Chưa có', children }) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div className={`survey-field${wide ? ' survey-field--wide' : ''}`}>
      <span className="survey-field__label">{label}</span>
      {editing ? children : (
        <div className={`survey-field__value${isEmpty ? ' survey-field__value--muted' : ''}`}>
          {isEmpty ? empty : value}
        </div>
      )}
    </div>
  );
}

const toEditForm = (data) => ({
  dossier_name: data.dossier_name || '',
  ward_code: data.ward_code || '',
  priority: data.priority || 'NORMAL',
  // Chỉ nhận trạng thái thủ công. Rỗng nghĩa là "để hệ thống tự tính theo quy trình".
  status: data.manual_status || '',
  note: data.note || '',
});

export default function Tasks() {
  const { addToast } = useToast();

  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({ total: 0 });
  const [wards, setWards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });

  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ status: 'All', priority: 'All', ward_code: 'All' });

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/survey-records/stats`);
      if (res.ok) setStats((await res.json()).data || { total: 0 });
    } catch { /* im lặng — số liệu tổng hợp không chặn thao tác chính */ }
  }, []);

  const fetchWards = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/survey-records/wards`);
      if (res.ok) setWards((await res.json()).data || []);
    } catch { /* im lặng */ }
  }, []);

  const fetchRecords = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (searchTerm) params.set('search', searchTerm);
      if (filters.status !== 'All') params.set('status', filters.status);
      if (filters.priority !== 'All') params.set('priority', filters.priority);
      if (filters.ward_code !== 'All') params.set('ward_code', filters.ward_code);

      const res = await fetch(`${API}/api/survey-records/?${params}`);
      if (res.ok) {
        const payload = await res.json();
        setRecords(payload.data || []);
        if (payload.meta) {
          setPagination({ total: payload.meta.total || 0, total_pages: payload.meta.total_pages || 1 });
        }
      } else if (showLoading) {
        addToast('Lỗi khi tải danh sách hồ sơ đo vẽ', 'error');
      }
    } catch {
      if (showLoading) addToast('Không thể kết nối đến máy chủ', 'error');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [addToast, limit, page, searchTerm, filters]);

  useEffect(() => { fetchStats(); fetchWards(); }, [fetchStats, fetchWards]);

  useEffect(() => {
    fetchRecords(true);
    const pollId = setInterval(() => fetchRecords(false), 8000);
    return () => clearInterval(pollId);
  }, [fetchRecords]);

  const openDetail = async (recordId) => {
    setSelectedId(recordId);
    setIsDetailOpen(true);
    setDetailLoading(true);
    setEditing(false);
    setDetailError('');
    try {
      const res = await fetch(`${API}/api/survey-records/${recordId}`);
      if (res.ok) {
        const data = (await res.json()).data;
        setDetailData(data);
        setEditForm(toEditForm(data));
      } else {
        // Không được để hộp thoại đứng ở "Đang tải…" mãi — phải nói rõ hỏng gì.
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

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedId || !editForm) return;
    try {
      setSaving(true);
      const res = await fetch(`${API}/api/survey-records/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, ward_code: editForm.ward_code || null }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        addToast('Đã cập nhật hồ sơ đo vẽ', 'success');
        setEditing(false);
        setIsDetailOpen(false);
        fetchRecords(true);
        fetchStats();
      } else {
        addToast(data.detail || 'Cập nhật thất bại', 'error');
        if (res.status === 409) openDetail(selectedId);
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
      width: 210,
      render: (value, row) => (
        <div className="survey-cell-stack">
          <strong>{value || 'Chưa đặt tên'}</strong>
          <span>{row.contract_id} · {row.service_line_name}</span>
        </div>
      ),
    },
    {
      key: 'has_legal',
      label: 'PHÁP LÝ',
      width: 90,
      align: 'center',
      render: (value) => value
        ? <Badge variant="primary">Có</Badge>
        : <span className="survey-muted">—</span>,
    },
    {
      key: 'ward_name',
      label: 'PHƯỜNG',
      width: 150,
      render: (value) => value || <span className="survey-muted">Chưa có</span>,
    },
    {
      key: 'customer_name',
      label: 'KHÁCH HÀNG',
      width: 190,
      render: (value, row) => (
        <div className="survey-cell-stack">
          <span>{value || 'Chưa có'}</span>
          {row.customer_phone && <span><Phone size={11} /> {row.customer_phone}</span>}
        </div>
      ),
    },
    {
      key: 'main_assignee_name',
      label: 'PHỤ TRÁCH',
      width: 180,
      render: (value, row) => (
        <div className="survey-assignees">
          <Avatar name={value} url={row.main_assignee_avatar} />
          <div className="survey-cell-stack">
            <span>{value || 'Chưa phân công'}</span>
            {row.assistant_name && <span>Phụ đo: {row.assistant_name}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'priority',
      label: 'ƯU TIÊN',
      width: 110,
      render: (value) => (
        <Badge variant={value === 'HIGH' ? 'danger' : value === 'LOW' ? 'neutral' : 'info'}>
          {priorityLabel(value)}
        </Badge>
      ),
    },
    {
      key: 'status',
      label: 'TRẠNG THÁI',
      width: 140,
      render: (value) => <Badge variant={STATUS_VARIANTS[value] || 'neutral'}>{value}</Badge>,
    },
    {
      key: 'warning',
      label: 'CẢNH BÁO',
      width: 120,
      render: (_value, row) => {
        const warning = computeWarning(row);
        return <Badge variant={warning.variant}>{warning.label}</Badge>;
      },
    },
    { key: 'started_at', label: 'BẮT ĐẦU', width: 105, render: (value) => formatDate(value) || <span className="survey-muted">—</span> },
    { key: 'deadline_at', label: 'HẠN XỬ LÝ', width: 105, render: (value) => formatDate(value) || <span className="survey-muted">—</span> },
    { key: 'submitted_at', label: 'NGÀY NỘP', width: 105, render: (value) => formatDate(value) || <span className="survey-muted">—</span> },
    { key: 'accepted_at', label: 'NGÀY HT', width: 105, render: (value) => formatDate(value) || <span className="survey-muted">—</span> },
    {
      key: 'actions',
      label: 'THAO TÁC',
      width: 110,
      align: 'center',
      render: (_value, row) => (
        <button type="button" className="btn btn-sm btn-secondary survey-detail-button" onClick={() => openDetail(row.id)}>
          <Eye size={14} /> Chi tiết
        </button>
      ),
    },
  ];

  return (
    <section className="tab-pane active hoso-page list-page-frame" id="tab-hoso">
      <header className="contract-pane-title">
        <div>
          <FolderKanban size={20} style={{ color: 'var(--orange-500)' }} />
          <span>Hồ Sơ Đo Vẽ</span>
          <strong>{stats.total ?? pagination.total ?? tasks.length}</strong>
        </div>
      </header>

      <div className="list-page-frame__toolbar">
        <StatsGrid cols={STATUS_OPTIONS.length}>
          {STATUS_OPTIONS.map((status) => (
            <StatCard key={status} label={status} value={stats[status] || 0} />
          ))}
        </StatsGrid>

        <FilterBar
          search={searchTerm}
          onSearchChange={(value) => { setSearchTerm(value); setPage(1); }}
          searchPlaceholder="Tìm theo tên hồ sơ, mã hợp đồng, khách hàng, hạng mục..."
          filters={[
            { key: 'status', label: 'Trạng thái', type: 'select', width: 180, options: STATUS_OPTIONS.map((s) => ({ value: s, label: s })) },
            { key: 'priority', label: 'Độ ưu tiên', type: 'select', width: 165, options: PRIORITY_OPTIONS },
            { key: 'ward_code', label: 'Phường', type: 'select', width: 190, options: wards.map((w) => ({ value: w.code, label: w.name })) },
          ]}
          values={filters}
          onFilterChange={(key, value) => { setFilters((current) => ({ ...current, [key]: value || 'All' })); setPage(1); }}
          onReset={() => { setSearchTerm(''); setFilters({ status: 'All', priority: 'All', ward_code: 'All' }); setPage(1); }}
          actions={(
            <button type="button" className="btn btn-ghost" title="Làm mới" onClick={() => { fetchRecords(true); fetchStats(); }}>
              <RefreshCw size={16} />
            </button>
          )}
        />
      </div>

      <div className="list-page-frame__table">
        <DataTable
          columns={columns}
          data={records}
          loading={loading}
          rowKey="id"
          emptyText="Chưa có hồ sơ đo vẽ nào — hồ sơ sẽ tự sinh khi nhân viên bắt đầu bước đo vẽ"
          pageSize={0}
          compact
          // Mức khẩn của hạn xử lý là lý do tồn tại của màn này — đưa ra mép trái dòng
          // để quét mắt thấy ngay, thay vì lẫn trong một cột badge giữa bảng.
          rowClassName={(row) => `survey-row survey-row--${computeWarning(row).variant}`}
        />
        <div className="contract-server-pagination">
          <span>{records.length ? `${(page - 1) * limit + 1}–${(page - 1) * limit + records.length}` : '0'} / {pagination.total} hồ sơ</span>
          <div className="contract-server-pagination__controls">
            <button type="button" className="contract-page-button" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
            <button type="button" className="contract-page-button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
            <span className="contract-page-button contract-page-button--active">{page}</span>
            <button type="button" className="contract-page-button" disabled={page >= pagination.total_pages} onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}>›</button>
            <button type="button" className="contract-page-button" disabled={page >= pagination.total_pages} onClick={() => setPage(pagination.total_pages)}>»</button>
          </div>
        </div>
      </div>

      <Modal
        open={isDetailOpen}
        onClose={() => !saving && setIsDetailOpen(false)}
        size="md"
        closeOnOverlay={!saving}
        title={<span className="survey-modal-title"><ScrollText size={20} /> Chi tiết Hồ Sơ Đo Vẽ</span>}
      >
        {detailLoading ? (
          <div className="survey-loading">Đang tải…</div>
        ) : (detailError || !editForm) ? (
          <div className="survey-loading">
            <p style={{ color: 'var(--danger-600, #dc2626)', marginBottom: 14 }}>
              {detailError || 'Không có dữ liệu để hiển thị.'}
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => openDetail(selectedId)}>
              Thử lại
            </button>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <div className="survey-detail__identity">
              <div>
                <div className="survey-detail__code">
                  {detailData?.contract_id}
                  <span>{detailData?.service_line_name}</span>
                </div>
                <div className="survey-detail__name">{editForm.dossier_name || 'Chưa đặt tên hồ sơ'}</div>
              </div>
              <div className="survey-detail__badges">
                <Badge variant={STATUS_VARIANTS[detailData?.status] || 'neutral'}>{detailData?.status || '—'}</Badge>
                {detailData?.has_legal && <Badge variant="primary">Có pháp lý</Badge>}
              </div>
            </div>

            <section className="survey-detail__section">
              <h4>Hồ sơ</h4>
              <div className="survey-detail__grid">
                <Field label="Tên hồ sơ" wide editing={editing} value={editForm.dossier_name}>
                  <input className="form-control" value={editForm.dossier_name}
                    onChange={(e) => setEditForm({ ...editForm, dossier_name: e.target.value })} />
                </Field>
                <Field label="Phường / Xã" editing={editing} value={detailData?.ward_name}>
                  <select className="form-control" value={editForm.ward_code}
                    onChange={(e) => setEditForm({ ...editForm, ward_code: e.target.value })}>
                    <option value="">— Chọn phường —</option>
                    {wards.map((w) => <option key={w.code} value={w.code}>{w.name}</option>)}
                  </select>
                </Field>
                <Field label="Độ ưu tiên" editing={editing} value={priorityLabel(editForm.priority)}>
                  <select className="form-control" value={editForm.priority}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}>
                    {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </Field>
                <Field label="Khách hàng" value={detailData?.customer_name} />
                <Field label="Số điện thoại" value={detailData?.customer_phone} />
                <Field label="Phụ trách chính" value={detailData?.main_assignee_name} empty="Chưa phân công" />
                <Field label="Phụ đo" value={detailData?.assistant_name} empty="Không có" />
              </div>
            </section>

            <section className="survey-detail__section">
              <h4>Tiến độ</h4>
              <div className="survey-detail__grid">
                <Field label="Trạng thái" editing={editing} value={detailData?.status}>
                  {/* Chỉ cho chọn 2 trạng thái thủ công. Ba giá trị còn lại do hệ thống
                      tính theo tiến độ quy trình — gõ tay được là lại lệch như cũ. */}
                  <select className="form-control" value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                    <option value="">Theo tiến độ quy trình ({detailData?.status || '—'})</option>
                    {MANUAL_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Cảnh báo" value={detailData ? computeWarning(detailData).label : ''} />
                <Field label="Ngày bắt đầu" value={formatDate(detailData?.started_at)} empty="Chưa bắt đầu" />
                <Field label="Hạn xử lý" value={formatDate(detailData?.deadline_at)} empty="Chưa đặt hạn" />
                <Field label="Ngày nộp nghiệm thu" value={formatDate(detailData?.submitted_at)} empty="Chưa nộp" />
                <Field label="Ngày hoàn thành" value={formatDate(detailData?.accepted_at)} empty="Chưa xong" />
                <Field label="Ghi chú" wide editing={editing} value={editForm.note}>
                  <input className="form-control" value={editForm.note}
                    onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} />
                </Field>
              </div>
            </section>

            {/* Sổ giấy tờ dùng chung với bên Pháp lý — hạng mục có cả hai khối
                thì mỗi bên đều thấy giấy của bên kia (tài liệu chuyển giao). */}
            <DocumentRegister
              contractId={detailData?.contract_id}
              serviceLineId={detailData?.service_line_id}
              addToast={addToast}
            />

            <div className="survey-detail__footer">
              {isDossierLocked(detailData, editForm.status) ? (
                <>
                  <span className="survey-muted" role="status">Hồ sơ đã hoàn tất và không thể chỉnh sửa.</span>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsDetailOpen(false)}>Đóng</button>
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
                  <button type="button" className="btn btn-secondary" onClick={() => setIsDetailOpen(false)}>Đóng</button>
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
