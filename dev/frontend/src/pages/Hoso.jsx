import React, { useState, useEffect } from 'react';
import { FolderOpen, Clock, AlertTriangle, CheckCircle, User, Calendar, MapPin, Plus } from 'lucide-react';
import { StatsGrid, StatCard, FilterBar, DataTable, WarningBadge } from '../components/ui';

export default function Hoso() {
  const [hosoList, setHosoList] = useState([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, in_progress: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterValues, setFilterValues] = useState({ status: 'All', warning: 'All' });

  const fetchData = async () => {
    try {
      const [hosoRes, statsRes] = await Promise.all([
        fetch('http://127.0.0.1:8080/api/hoso/'),
        fetch('http://127.0.0.1:8080/api/hoso/stats')
      ]);
      if (hosoRes.ok) {
        const data = await hosoRes.json();
        setHosoList(data.data || []);
      }
      if (statsRes.ok) {
        const sData = await statsRes.json();
        setStats(sData.data || {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await fetch('http://127.0.0.1:8080/api/hoso/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'Mã_hồ_sơ': id, 'Trạng_thái': newStatus })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredList = hosoList.filter(h => {
    const matchSearch = (h['Tên khách hàng'] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (h['Mã hồ sơ'] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (h['SĐT'] || '').includes(searchTerm);
    const matchStatus = filterValues.status === 'All' || h['Trạng thái'] === filterValues.status;
    const matchWarning = filterValues.warning === 'All' || h['Cảnh báo'] === filterValues.warning;
    return matchSearch && matchStatus && matchWarning;
  });

  const columns = [
    {
      key: 'Mã hồ sơ',
      label: 'MÃ HS & ƯU TIÊN',
      width: 160,
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{val}</div>
          {row['Ưu tiên'] === 'Cao' ? (
            <span style={{ fontSize: '0.7rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>Ưu tiên Cao</span>
          ) : (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{row['Ưu tiên']}</span>
          )}
        </div>
      )
    },
    {
      key: 'Tên khách hàng',
      label: 'KHÁCH HÀNG',
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{val}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{row['SĐT']}</div>
        </div>
      )
    },
    {
      key: 'Loại dịch vụ',
      label: 'DỊCH VỤ & KHU VỰC',
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--orange-500)', marginBottom: '4px' }}>{val}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={12} /> {row['Khu vực/Phường'] || 'Chưa cập nhật'}
          </div>
        </div>
      )
    },
    {
      key: 'Phụ trách chính',
      label: 'PHỤ TRÁCH',
      render: (val, row) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <User size={14} color="var(--text-secondary)" />
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{val}</span>
          </div>
          {row['Hỗ trợ'] && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', paddingLeft: '22px' }}>
              + Hỗ trợ: {row['Hỗ trợ']}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'Deadline',
      label: 'DEADLINE & CẢNH BÁO',
      render: (val, row) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            <Calendar size={14} /> {val || 'N/A'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <WarningBadge warning={row['Cảnh báo']} />
            {row['Số ngày còn lại'] !== null && row['Cảnh báo'] !== 'Hoàn thành' && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                ({row['Số ngày còn lại']} ngày)
              </span>
            )}
          </div>
        </div>
      )
    },
    {
      key: 'Trạng thái',
      label: 'TRẠNG THÁI',
      width: 200,
      render: (val, row) => (
        <select
          className="form-control"
          value={val}
          onChange={(e) => handleStatusChange(row['Mã hồ sơ'], e.target.value)}
          style={{ fontSize: '0.85rem', padding: '6px 12px', height: 'auto', background: 'var(--bg-deep)', border: '1px solid var(--border-default)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="Mới tiếp nhận">Mới tiếp nhận</option>
          <option value="Đang đo đạc">Đang đo đạc</option>
          <option value="Đang xử lý nội nghiệp">Đang xử lý nội nghiệp</option>
          <option value="Nộp thành công - Chờ kết quả">Nộp thành công - Chờ kết quả</option>
          <option value="Hoàn thành">Hoàn thành</option>
        </select>
      )
    }
  ];

  return (
    <section className="tab-pane active" id="tab-hoso">
      {/* Stats Header */}
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

      {/* Toolbar + Filter */}
      <FilterBar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Tìm mã hồ sơ, khách hàng, SĐT..."
        filters={[
          {
            key: 'status',
            label: 'Lọc theo Trạng thái',
            type: 'select',
            width: 220,
            options: [
              { value: 'Mới tiếp nhận', label: 'Mới tiếp nhận' },
              { value: 'Đang đo đạc', label: 'Đang đo đạc' },
              { value: 'Đang xử lý nội nghiệp', label: 'Đang xử lý nội nghiệp' },
              { value: 'Nộp thành công - Chờ kết quả', label: 'Nộp thành công - Chờ kết quả' },
              { value: 'Hoàn thành', label: 'Hoàn thành' },
            ]
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
            ]
          }
        ]}
        values={filterValues}
        onFilterChange={(key, value) => setFilterValues(prev => ({ ...prev, [key]: value }))}
        onReset={() => { setSearchTerm(''); setFilterValues({ status: 'All', warning: 'All' }); }}
        actions={
          <button className="btn btn-primary" style={{ height: '38px' }}>
            <Plus size={16} /> Tạo Hồ Sơ Mới
          </button>
        }
      />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredList}
        loading={loading}
        rowKey="Mã hồ sơ"
        emptyText="Không có hồ sơ nào phù hợp"
        pageSize={15}
      />
    </section>
  );
}
