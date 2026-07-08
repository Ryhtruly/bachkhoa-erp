import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Edit2,
  AlertTriangle,
  Building2,
  CheckCircle,
  ChevronDown,
  Clock,
  FolderOpen,
  Plus,
  Sparkles,
} from 'lucide-react';
import {
  DataTable,
  FilterBar,
  StatCard,
  StatsGrid,
  WarningBadge,
} from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import HosoFormModal from './HosoFormModal';
import { StatusBadge } from '../components/ui';

const API = '';

const terminalStatuses = new Set(['Hoàn thành', 'Hủy', 'Đã hủy']);

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${value}T00:00:00`))
  : '—';

const formatMoney = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)}đ`;

function priorityVariant(value) {
  if (value === 'Cao') return 'high';
  if (value === 'Thấp') return 'low';
  return 'normal';
}

function displayDepartment(value) {
  if (!value) return 'Chưa phân phòng';
  return value === 'Kỹ thuật' ? 'Phòng Đo đạc' : value;
}



export default function Hoso() {
  const { addToast } = useToast();
  const [hosoList, setHosoList] = useState([]);
  const [contractsList, setContractsList] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHoso, setEditingHoso] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [assignmentOptions, setAssignmentOptions] = useState([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, in_progress: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterValues, setFilterValues] = useState({
    status: 'All',
    warning: 'All',
    priority: 'All',
  });
  const [activeDepartment, setActiveDepartment] = useState('all');
  const [month, setMonth] = useState('');
  const [sort, setSort] = useState('desc');

  const fetchAssignmentOptions = useCallback(async () => {
    try {
      setAssignmentLoading(true);
      const [assignmentRes, contractsRes] = await Promise.all([
        fetch(`${API}/api/hoso/assignment-options`),
        fetch(`${API}/api/hoso/contracts-lookup`),
      ]);
      const [assignmentData, contractsData] = await Promise.all([
        assignmentRes.ok ? assignmentRes.json() : { data: [] },
        contractsRes.ok ? contractsRes.json() : { data: [] },
      ]);
      setAssignmentOptions(assignmentData.data || []);
      setContractsList(contractsData.data || []);
    } catch (error) {
      console.error(error);
      addToast('Lỗi khi tải danh sách phụ trợ', 'error');
    } finally {
      setAssignmentLoading(false);
    }
  }, [addToast]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = month ? `?month=${month}` : '';
      const [hosoRes, statsRes] = await Promise.all([
        fetch(`${API}/api/hoso/${params}`),
        fetch(`${API}/api/hoso/stats${params}`),
      ]);
      if (!hosoRes.ok || !statsRes.ok) throw new Error('Không tải được dữ liệu hồ sơ');

      const [hosoData, statsData] = await Promise.all([hosoRes.json(), statsRes.json()]);
      setHosoList(hosoData.data || []);
      setStats(statsData.data || {});
    } catch (error) {
      console.error(error);
      addToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, month]);

  useEffect(() => {
    fetchAssignmentOptions();
  }, [fetchAssignmentOptions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleModalSubmit = async (payload) => {
    try {
      setModalLoading(true);
      const isEdit = !!editingHoso;
      const url = isEdit ? `${API}/api/hoso/${editingHoso['Mã hồ sơ']}` : `${API}/api/hoso/`;
      const method = isEdit ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Không lưu được hồ sơ');
      addToast(isEdit ? 'Đã cập nhật hồ sơ' : 'Đã tạo hồ sơ mới', 'success');
      setIsModalOpen(false);
      setEditingHoso(null);
      fetchData();
    } catch (error) {
      console.error(error);
      addToast(error.message, 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const departmentOptions = useMemo(() => {
    const counts = new Map();
    hosoList.forEach((row) => {
      const id = row['Phòng ban ID'] || 'unassigned';
      const current = counts.get(id) || {
        id,
        label: displayDepartment(row['Phòng ban']),
        count: 0,
      };
      current.count += 1;
      counts.set(id, current);
    });
    return Array.from(counts.values()).sort((a, b) => (
      b.count - a.count || a.label.localeCompare(b.label, 'vi')
    ));
  }, [hosoList]);

  const filteredList = hosoList.filter((row) => {
    const normalizedSearch = searchTerm.toLowerCase();
    const matchSearch = [
      row['Tên khách hàng'],
      row['Mã hồ sơ'],
      row['Mã hợp đồng'],
      row['SĐT'],
      row['Loại dịch vụ'],
      row['Phụ trách chính'],
      row['Phụ đo'],
    ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    const departmentId = row['Phòng ban ID'] || 'unassigned';
    const matchDepartment = activeDepartment === 'all' || departmentId === activeDepartment;
    const matchStatus = filterValues.status === 'All' || row['Trạng thái'] === filterValues.status;
    const matchWarning = filterValues.warning === 'All' || row['Cảnh báo'] === filterValues.warning;
    const rowPriority = row['Ưu tiên'] || 'Trung bình';
    const matchPriority = filterValues.priority === 'All' || rowPriority === filterValues.priority;
    return matchDepartment && matchSearch && matchStatus && matchWarning && matchPriority;
  });

  const sortedList = sort === 'asc' ? [...filteredList].reverse() : filteredList;

  const columns = [
    {
      key: 'Mã hồ sơ',
      label: 'MÃ HỒ SƠ',
      width: 140,
      sortable: true,
      render: (value, row) => (
        <div className="hoso-identity">
          <strong>{value}</strong>
          <span className="hoso-contract-priority" title={`Ưu tiên: ${row['Ưu tiên'] || 'Trung bình'}`}>
            <i className={`hoso-priority-dot hoso-priority-dot--${priorityVariant(row['Ưu tiên'])}`} />
            HĐ: {row['Mã hợp đồng'] || 'Chưa có'}
          </span>
          <span>Tạo: {formatDate(row['Ngày tạo'])}</span>
        </div>
      ),
    },
    {
      key: 'Tên khách hàng',
      label: 'KHÁCH HÀNG',
      width: 180,
      render: (value, row) => (
        <div className="hoso-stack">
          <strong>{value}</strong>
          <span>{row['SĐT'] || 'Chưa có SĐT'}</span>
          <span>{row['Khu vực/Phường'] || 'Chưa cập nhật khu vực'}</span>
        </div>
      ),
    },
    {
      key: 'Loại dịch vụ',
      label: 'CÔNG VIỆC',
      width: 120,
      sortable: true,
      render: (value) => <strong className="hoso-service">{value}</strong>,
    },
    {
      key: 'Phụ trách chính',
      label: 'NHÂN VIÊN ĐO',
      width: 140,
      render: (value, row) => <span>{value || 'Chưa phân công'}</span>,
    },
    {
      key: 'Phụ đo',
      label: 'PHỤ ĐO',
      width: 140,
      render: (value, row) => <span>{value || 'Không cần phụ đo'}</span>,
    },
    {
      key: 'Ngày đo',
      label: 'NGÀY ĐO',
      width: 90,
      sortable: true,
      render: formatDate,
    },
    {
      key: 'Deadline',
      label: 'DEADLINE',
      width: 110,
      sortable: true,
      render: (value, row) => (
        <div className="hoso-stack">
          <strong>{formatDate(value)}</strong>
          {row['Số ngày còn lại'] !== null && !terminalStatuses.has(row['Trạng thái']) && (
            <span>{row['Số ngày còn lại']} ngày còn lại</span>
          )}
        </div>
      ),
    },
    {
      key: 'Trạng thái',
      label: 'TRẠNG THÁI ĐO',
      width: 140,
      render: (value) => <StatusBadge status={value} />,
    },


    {
      key: 'actions',
      label: '',
      width: 35,
      stickyRight: true,
      render: (_, row) => (
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => {
            setEditingHoso(row);
            setIsModalOpen(true);
          }}
          title="Chỉnh sửa hồ sơ"
        >
          <Edit2 size={16} />
        </button>
      )
    }
  ];

  return (
    <section className="tab-pane active hoso-page" id="tab-hoso">
      <StatsGrid>
        <StatCard
          label="Tổng Hồ Sơ"
          value={stats.total || 0}
          icon={<FolderOpen size={24} />}
          iconVariant="purple"
          loading={loading}
        />
        <StatCard
          label="Đang Xử Lý"
          value={stats.in_progress || 0}
          icon={<Clock size={24} />}
          iconVariant="orange"
          loading={loading}
        />
        <StatCard
          label="Trễ Hạn (Cần Xử Lý)"
          value={stats.overdue || 0}
          icon={<AlertTriangle size={24} />}
          iconVariant="red"
          loading={loading}
        />
        <StatCard
          label="Đã Hoàn Thành"
          value={stats.completed || 0}
          icon={<CheckCircle size={24} />}
          iconVariant="green"
          loading={loading}
        />
      </StatsGrid>

      <div className="hoso-department-filter">
        <label htmlFor="hoso-department">
          <Building2 size={17} />
          Phòng ban
        </label>
        <div className="hoso-department-filter__select">
          <select
            id="hoso-department"
            value={activeDepartment}
            onChange={(event) => setActiveDepartment(event.target.value)}
            aria-label="Chọn phòng ban để lọc hồ sơ"
          >
            <option value="all">Tất cả phòng ban ({hosoList.length})</option>
            {departmentOptions.map((department) => (
              <option key={department.id} value={department.id}>
                {department.label} ({department.count})
              </option>
            ))}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
        <span>
          Hiển thị {filteredList.length} hồ sơ
        </span>
      </div>

      <FilterBar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Tìm mã hồ sơ, hợp đồng, khách hàng, dịch vụ, nhân sự..."
        filters={[
          {
            key: 'status',
            label: 'Lọc theo Trạng thái',
            type: 'select',
            width: 220,
            options: [
              { value: 'Mới tiếp nhận', label: 'Mới tiếp nhận' },
              { value: 'Chờ khảo sát', label: 'Chờ khảo sát' },
              { value: 'Đang đo đạc', label: 'Đang đo đạc' },
              { value: 'Đang xử lý nội nghiệp', label: 'Đang xử lý nội nghiệp' },
              { value: 'Nộp thành công - Chờ kết quả', label: 'Nộp thành công - Chờ kết quả' },
              { value: 'Hoàn thành', label: 'Hoàn thành' },
              { value: 'Hủy', label: 'Hủy' },
            ],
          },
          {
            key: 'warning',
            label: 'Lọc theo Cảnh báo',
            type: 'select',
            width: 200,
            options: [
              { value: 'Hoàn thành', label: 'Hoàn thành' },
              { value: 'Trong hạn', label: 'Trong hạn' },
              { value: 'Sắp đến hạn', label: 'Sắp đến hạn' },
              { value: 'Trễ hạn', label: 'Trễ hạn' },
            ],
          },
          {
            key: 'priority',
            label: 'Lọc theo Độ ưu tiên',
            type: 'select',
            width: 200,
            options: [
              { value: 'Cao', label: '🔴 Cao' },
              { value: 'Trung bình', label: '🟠 Trung bình' },
              { value: 'Thấp', label: '🟢 Thấp' },
            ],
          },
        ]}
        values={filterValues}
        onFilterChange={(key, value) => setFilterValues((current) => ({ ...current, [key]: value }))}
        onReset={() => {
          setSearchTerm('');
          setFilterValues({ status: 'All', warning: 'All', priority: 'All' });
          setActiveDepartment('all');
          setMonth('');
          setSort('desc');
        }}
        month={month}
        onMonthChange={setMonth}
        sort={sort}
        onSortChange={setSort}
        actions={(
          <button className="btn btn-primary" style={{ height: 38, marginLeft: 8 }} onClick={() => { setEditingHoso(null); setIsModalOpen(true); }}>
            <Plus size={16} /> Tạo Hồ Sơ Mới
          </button>
        )}
      />

      <div className="hoso-table-note">
        <div className="hoso-priority-legend" aria-label="Chú thích mức độ ưu tiên">
          <span>Ưu tiên:</span>
          <span><i className="hoso-priority-dot hoso-priority-dot--high" /> Cao</span>
          <span><i className="hoso-priority-dot hoso-priority-dot--normal" /> Trung bình</span>
          <span><i className="hoso-priority-dot hoso-priority-dot--low" /> Thấp</span>
        </div>
        <div className="hoso-assignment-note">
          <Sparkles size={15} />
          Gợi ý nhân sự dựa trên phòng ban, kinh nghiệm cùng dịch vụ và số việc đang mở.
        </div>
      </div>

      <DataTable
        onRowClick={(row) => { setEditingHoso(row); setIsModalOpen(true); }}
        columns={columns}
        data={sortedList}
        loading={loading}
        rowKey="Mã hồ sơ"
        emptyText="Không có hồ sơ nào phù hợp"
        pageSize={15}
        compact
      />

      <HosoFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialData={editingHoso}
        onSubmit={handleModalSubmit}
        assignmentOptions={assignmentOptions}
        departmentOptions={departmentOptions}
        contractsList={contractsList}
        loading={modalLoading}
      />
    </section>
  );
}
