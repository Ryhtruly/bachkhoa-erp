import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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

const API = 'http://127.0.0.1:8080';

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

function candidateScore(candidate, row, role) {
  const sameDepartment = (
    Boolean(
      row['Phòng ban ID']
      && candidate.department_id
      && row['Phòng ban ID'] === candidate.department_id
    )
    || displayDepartment(row['Phòng ban']) === displayDepartment(candidate.department)
  );
  const experienceMap = role === 'main'
    ? candidate.main_experience
    : candidate.support_experience;
  const experience = Number(experienceMap?.[row['Loại dịch vụ']] || 0);
  const load = Number(candidate.open_main_tasks || 0)
    + Number(candidate.open_support_tasks || 0) * 0.5;

  return (sameDepartment ? 40 : 0)
    + Math.min(experience * 3, 30)
    - Math.min(load * 4, 32);
}

function AssignmentPicker({
  role,
  row,
  candidates,
  disabled,
  onChange,
}) {
  const isMain = role === 'main';
  const value = isMain ? row['Phụ trách chính ID'] : row['Phụ đo ID'];
  const otherRoleId = isMain ? row['Phụ đo ID'] : row['Phụ trách chính ID'];

  const ranked = useMemo(
    () => candidates
      .filter((candidate) => candidate.user_id !== otherRoleId)
      .map((candidate) => ({
        ...candidate,
        score: candidateScore(candidate, row, role),
        experience: Number(
          (isMain ? candidate.main_experience : candidate.support_experience)
            ?.[row['Loại dịch vụ']] || 0
        ),
        load: Number(candidate.open_main_tasks || 0)
          + Number(candidate.open_support_tasks || 0) * 0.5,
      }))
      .sort((a, b) => b.score - a.score || a.load - b.load || a.full_name.localeCompare(b.full_name, 'vi')),
    [candidates, isMain, otherRoleId, role, row],
  );

  const recommended = ranked[0];
  const selected = candidates.find((candidate) => candidate.user_id === value);
  const selectedExperience = selected
    ? Number((isMain ? selected.main_experience : selected.support_experience)?.[row['Loại dịch vụ']] || 0)
    : 0;
  const selectedLoad = selected
    ? Number(selected.open_main_tasks || 0) + Number(selected.open_support_tasks || 0) * 0.5
    : 0;

  return (
    <div className="assignment-picker" onClick={(event) => event.stopPropagation()}>
      <select
        className="assignment-picker__select"
        value={value || ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        aria-label={isMain ? 'Chọn người phụ trách chính' : 'Chọn người phụ đo'}
      >
        <option value="">{isMain ? 'Chưa phân công' : 'Không cần phụ đo'}</option>
        {ranked.map((candidate, index) => (
          <option key={candidate.user_id} value={candidate.user_id}>
            {index === 0 ? '★ ' : ''}
            {candidate.full_name} · {candidate.load} việc mở · {candidate.experience} cùng DV
          </option>
        ))}
      </select>
      <div className="assignment-picker__meta">
        {disabled ? (
          'Đang lưu...'
        ) : selected ? (
          `${selectedLoad} việc đang mở · ${selectedExperience} hồ sơ cùng dịch vụ`
        ) : recommended ? (
          <>
            <Sparkles size={11} />
            Gợi ý: {recommended.full_name}
          </>
        ) : (
          'Chưa có nhân sự phù hợp'
        )}
      </div>
    </div>
  );
}

export default function Hoso() {
  const { addToast } = useToast();
  const [hosoList, setHosoList] = useState([]);
  const [assignmentOptions, setAssignmentOptions] = useState([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, in_progress: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  const [savingAssignment, setSavingAssignment] = useState('');
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
      const response = await fetch(`${API}/api/hoso/assignment-options`);
      if (!response.ok) throw new Error('Không tải được danh sách nhân sự');
      const data = await response.json();
      setAssignmentOptions(data.data || []);
    } catch (error) {
      console.error(error);
      addToast(error.message, 'error');
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

  const handleStatusChange = async (id, newStatus) => {
    try {
      const response = await fetch(`${API}/api/hoso/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'Mã_hồ_sơ': id, 'Trạng_thái': newStatus }),
      });
      if (!response.ok) throw new Error('Không cập nhật được trạng thái');
      setHosoList((current) => current.map((row) => (
        row['Mã hồ sơ'] === id ? { ...row, 'Trạng thái': newStatus } : row
      )));
      addToast('Đã cập nhật trạng thái hồ sơ', 'success');
    } catch (error) {
      console.error(error);
      addToast(error.message, 'error');
    }
  };

  const handleAssignmentChange = async (row, role, userId) => {
    const taskId = row['Mã hồ sơ'];
    const assigneeId = role === 'main' ? userId : row['Phụ trách chính ID'];
    const supportId = role === 'support' ? userId : row['Phụ đo ID'];
    if (assigneeId && assigneeId === supportId) {
      addToast('Người chính và phụ đo phải là hai người khác nhau', 'error');
      return;
    }

    try {
      setSavingAssignment(`${taskId}:${role}`);
      const response = await fetch(`${API}/api/hoso/update-assignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          assignee_id: assigneeId,
          support_id: supportId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'Không cập nhật được phân công');

      setHosoList((current) => current.map((item) => (
        item['Mã hồ sơ'] === taskId
          ? {
            ...item,
            'Phụ trách chính ID': payload.data.assignee_id,
            'Phụ trách chính': payload.data.assignee_name,
            'Phụ đo ID': payload.data.support_id,
            'Phụ đo': payload.data.support_name,
          }
          : item
      )));
      addToast('Đã cập nhật người chính và phụ đo', 'success');
      fetchAssignmentOptions();
    } catch (error) {
      console.error(error);
      addToast(error.message, 'error');
    } finally {
      setSavingAssignment('');
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
      width: 170,
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
      width: 220,
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
      width: 190,
      sortable: true,
      render: (value) => <strong className="hoso-service">{value}</strong>,
    },
    {
      key: 'Phụ trách chính',
      label: 'NHÂN VIÊN ĐO',
      width: 270,
      render: (_value, row) => (
        <AssignmentPicker
          role="main"
          row={row}
          candidates={assignmentOptions}
          disabled={assignmentLoading || savingAssignment.startsWith(`${row['Mã hồ sơ']}:`)}
          onChange={(userId) => handleAssignmentChange(row, 'main', userId)}
        />
      ),
    },
    {
      key: 'Phụ đo',
      label: 'PHỤ ĐO',
      width: 270,
      render: (_value, row) => (
        <AssignmentPicker
          role="support"
          row={row}
          candidates={assignmentOptions}
          disabled={assignmentLoading || savingAssignment.startsWith(`${row['Mã hồ sơ']}:`)}
          onChange={(userId) => handleAssignmentChange(row, 'support', userId)}
        />
      ),
    },
    {
      key: 'Ngày đo',
      label: 'NGÀY ĐO',
      width: 125,
      sortable: true,
      render: formatDate,
    },
    {
      key: 'Deadline',
      label: 'DEADLINE',
      width: 155,
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
      width: 220,
      render: (value, row) => (
        <select
          className="hoso-status-select"
          value={value}
          onChange={(event) => handleStatusChange(row['Mã hồ sơ'], event.target.value)}
          onClick={(event) => event.stopPropagation()}
        >
          <option value="Mới tiếp nhận">Mới tiếp nhận</option>
          <option value="Chờ khảo sát">Chờ khảo sát</option>
          <option value="Đang đo đạc">Đang đo đạc</option>
          <option value="Đang xử lý nội nghiệp">Đang xử lý nội nghiệp</option>
          <option value="Nộp thành công - Chờ kết quả">Nộp thành công - Chờ kết quả</option>
          <option value="Hoàn thành">Hoàn thành</option>
          <option value="Hủy">Hủy</option>
        </select>
      ),
    },
    {
      key: 'Kết quả hiện trường',
      label: 'KẾT QUẢ HIỆN TRƯỜNG',
      width: 210,
    },
    {
      key: 'Cảnh báo',
      label: 'QUÁ HẠN?',
      width: 145,
      render: (value) => <WarningBadge warning={value} />,
    },
    {
      key: 'Ngày hoàn thành',
      label: 'NGÀY HOÀN THÀNH',
      width: 165,
      sortable: true,
      render: formatDate,
    },
    {
      key: 'Phụ cấp',
      label: 'PHỤ CẤP',
      width: 180,
      render: (value, row) => (
        <div className="hoso-stack">
          <strong>{formatMoney(value)}</strong>
          {row['Số cọc'] ? (
            <span>
              {row['Số cọc']} cọc · {row['Loại cọc'] || 'Chưa rõ loại'}
            </span>
          ) : (
            <span>Không phát sinh</span>
          )}
        </div>
      ),
    },
    {
      key: 'Ghi chú',
      label: 'GHI CHÚ',
      width: 260,
      render: (value) => (
        <span className="hoso-note" title={value || ''}>{value || '—'}</span>
      ),
    },
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
          <button className="btn btn-primary" style={{ height: 38, marginLeft: 8 }}>
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
        columns={columns}
        data={sortedList}
        loading={loading}
        rowKey="Mã hồ sơ"
        emptyText="Không có hồ sơ nào phù hợp"
        pageSize={15}
        compact
      />
    </section>
  );
}
