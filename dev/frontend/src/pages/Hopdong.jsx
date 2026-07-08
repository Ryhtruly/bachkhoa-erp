import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileSignature, Table, Printer, Download, Plus, MoveHorizontal } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Modal, FormRow, FormGrid, DataTable, StatusBadge, FilterBar } from '../components/ui';

const CHILD_CONTRACT_PATTERN = /^(.*)-(\d+)\/(BK-\d{4})$/i;
const CONTRACT_GROUPS_PER_PAGE = 15;

function getContractHierarchy(contract) {
  const contractId = String(contract['Mã hợp đồng'] || '').trim();
  const apiGroupId = contract['Mã hợp đồng nhóm'];
  const apiChildNumber = contract['Số thứ tự hợp đồng con'];

  if (apiGroupId) {
    return {
      groupId: apiGroupId,
      childNumber: apiChildNumber === null || apiChildNumber === undefined || apiChildNumber === ''
        ? null
        : Number(apiChildNumber),
    };
  }

  const match = contractId.match(CHILD_CONTRACT_PATTERN);
  if (!match) return { groupId: contractId, childNumber: null };

  return {
    groupId: `${match[1]}/${match[3]}`,
    childNumber: Number(match[2]),
  };
}

function commonValue(rows, key, multipleLabel = 'Nhiều giá trị') {
  const values = [...new Set(rows.map(row => row[key]).filter(Boolean))];
  if (values.length === 0) return '';
  return values.length === 1 ? values[0] : multipleLabel;
}

function earliestDate(rows, key) {
  return rows.map(row => row[key]).filter(Boolean).sort()[0] || '';
}

function EllipsisCell({ value }) {
  return (
    <span className="contract-cell-ellipsis" title={value || ''}>
      {value || '—'}
    </span>
  );
}

function getPaginationItems(currentPage, totalPages) {
  return Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter(pageNumber => (
      pageNumber === 1
      || pageNumber === totalPages
      || Math.abs(pageNumber - currentPage) <= 1
    ))
    .reduce((items, pageNumber, index, pages) => {
      if (index > 0 && pages[index - 1] !== pageNumber - 1) items.push('…');
      items.push(pageNumber);
      return items;
    }, []);
}

export default function Hopdong() {
  const [contracts, setContracts] = useState([]);
  const [hosoList, setHosoList] = useState([]);
  const [hosoLoading, setHosoLoading] = useState(false);
  const [config, setConfig] = useState({ personnel: [], services: [] });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const { addToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterValues, setFilterValues] = useState({ status: 'All', service: 'All' });
  const [signedDate, setSignedDate] = useState('');
  const [sort, setSort] = useState('desc');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: CONTRACT_GROUPS_PER_PAGE,
    total_groups: 0,
    total_contracts: 0,
    total_pages: 0,
  });

  const [formData, setFormData] = useState({
    SO_HOP_DONG: '', MA_HO_SO: '', TEN_KHACH_HANG: '', SO_DIEN_THOAI: '',
    KHACH_HANG_EMAIL: 'admin@nhadatbachkhoa.com', LOAI_DICH_VU: '',
    DIA_CHI: '', GIA_TRI_HOP_DONG: '', NGAY_KY: '', NGAY_HET_HAN: '', Sale_nguồn: ''
  });

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) setConfig(await res.json());
    } catch { }
  }, []);

  const fetchContracts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(CONTRACT_GROUPS_PER_PAGE),
        sort,
      });
      if (signedDate) params.set('date_signed', signedDate);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (filterValues.status !== 'All') params.set('status', filterValues.status);
      if (filterValues.service !== 'All') params.set('service', filterValues.service);

      const res = await fetch(`/api/hopdong/?${params}`);
      if (res.ok) {
        const payload = await res.json();
        setContracts(Array.isArray(payload) ? payload : payload.data || []);
        if (payload.pagination) setPagination(payload.pagination);
      }
    } catch {
      addToast('Lỗi tải danh sách hợp đồng', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, filterValues.service, filterValues.status, page, searchTerm, signedDate, sort]);

  const fetchHosoList = useCallback(async () => {
    if (hosoList.length > 0 || hosoLoading) return;
    try {
      setHosoLoading(true);
      const response = await fetch('/api/hoso');
      if (response.ok) {
        const data = await response.json();
        setHosoList(Array.isArray(data) ? data : data.data || []);
      }
    } catch {
      addToast('Không tải được danh sách hồ sơ', 'error');
    } finally {
      setHosoLoading(false);
    }
  }, [addToast, hosoList.length, hosoLoading]);

  const openContractModal = () => {
    setIsModalOpen(true);
    fetchHosoList();
  };

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchContracts();

    const d = new Date();
    const today = d.toISOString().split('T')[0];
    d.setDate(d.getDate() + 7);
    const nextWeek = d.toISOString().split('T')[0];
    setFormData(prev => ({ ...prev, NGAY_KY: today, NGAY_HET_HAN: nextWeek }));
  }, [fetchContracts]);

  const handleHosoChange = (e) => {
    const maHs = e.target.value;
    const hs = hosoList.find(h => h['Mã hồ sơ'] === maHs);
    if (hs) {
      setFormData(prev => ({
        ...prev,
        MA_HO_SO: maHs,
        TEN_KHACH_HANG: hs['Tên khách hàng'] || '',
        SO_DIEN_THOAI: hs['SĐT'] || '',
        DIA_CHI: hs['Khu vực/Phường'] || '',
        LOAI_DICH_VU: hs['Loại dịch vụ'] || ''
      }));
    } else {
      setFormData(prev => ({ ...prev, MA_HO_SO: maHs, TEN_KHACH_HANG: '', SO_DIEN_THOAI: '', DIA_CHI: '', LOAI_DICH_VU: '' }));
    }
  };

  const handleGenerateContract = async (e) => {
    e.preventDefault();
    const val = parseFloat(formData.GIA_TRI_HOP_DONG);
    if (!val || val <= 0) {
      addToast('Nhập giá trị hợp đồng hợp lệ', 'error');
      return;
    }

    try {
      const res = await fetch('/api/hopdong/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, GIA_TRI_HOP_DONG: val })
      });
      if (res.ok) {
        const data = await res.json();
        addToast('Hợp đồng đã được tạo thành công!', 'success');
        if (data.download_url) {
          window.open(data.download_url);
        }
        setFormData(prev => ({ ...prev, SO_HOP_DONG: '', GIA_TRI_HOP_DONG: '' }));
        setIsModalOpen(false);
        if (page === 1) fetchContracts();
        else setPage(1);
      } else {
        const err = await res.json();
        addToast('Lỗi: ' + (err.detail || ''), 'error');
      }
    } catch {
      addToast('Lỗi kết nối máy chủ', 'error');
    }
  };

  const formatVND = (amount) => {
    try { return new Intl.NumberFormat('vi-VN').format(Number(amount) || 0) + '₫'; } catch { return amount; }
  };

  const toggleContractGroup = (groupId) => {
    setExpandedGroups(current => ({ ...current, [groupId]: !current[groupId] }));
  };

  const handleSearchChange = useCallback((value) => {
    setSearchTerm(value);
    setPage(1);
  }, []);

  const handleFilterChange = useCallback((key, value) => {
    setFilterValues(current => ({ ...current, [key]: value }));
    setPage(1);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchTerm('');
    setFilterValues({ status: 'All', service: 'All' });
    setSignedDate('');
    setSort('desc');
    setPage(1);
  }, []);

  const columns = [
    {
      key: 'Mã hợp đồng',
      label: 'Mã HỢP ĐỒNG',
      width: 160,
      render: (val, row) => {
        if (row._rowType === 'group') {
          const expanded = Boolean(expandedGroups[row._groupId]);
          return (
            <button
              type="button"
              className="contract-group-toggle"
              onClick={(event) => {
                event.stopPropagation();
                toggleContractGroup(row._groupId);
              }}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Thu gọn' : 'Mở'} nhóm hợp đồng ${val}`}
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{val}</span>
              <span className="contract-child-count" title={`${row._childCount} hợp đồng con`}>
                {row._childCount}
              </span>
            </button>
          );
        }

        if (row._rowType === 'detail') {
          return (
            <span className="contract-detail-code">
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{val}</span>
              <span className="contract-detail-kind">
                {row._childNumber === null ? 'mã gốc' : `con ${row._childNumber}`}
              </span>
            </span>
          );
        }

        return <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{val}</span>;
      }
    },
    {
      key: 'Mã hồ sơ',
      label: 'Mã hồ sơ',
      width: 90,
      render: (val) => <span style={{ fontFamily: 'var(--font-mono)' }}>{val}</span>
    },
    {
      key: 'Tên khách hàng',
      label: 'Khách hàng',
      width: 150,
      render: (val) => <EllipsisCell value={val} />
    },
    
    {
      key: 'Dịch vụ',
      label: 'Dịch vụ',
      width: 120,
      render: (val, row) => (
        <EllipsisCell value={val || row['Loại dịch vụ']} />
      )
    },
    { key: 'Ngày ký', label: 'Ngày ký', width: 90 },
    {
      key: 'Giá trị hợp đồng',
      label: 'Giá trị',
      align: 'right',
      render: (val, row) => {
        const total = Number(val || row['Giá trị HĐ']) || 0;
        return <span style={{ fontFamily: 'var(--font-mono)' }}>{formatVND(total)}</span>;
      }
    },
    {
      key: 'Đã thu',
      label: 'Đã thu',
      align: 'right',
      render: (val, row) => {
        const paid = Number(val || row['Đã thanh toán']) || 0;
        return <span className="text-success" style={{ fontFamily: 'var(--font-mono)' }}>{formatVND(paid)}</span>;
      }
    },
    {
      key: '_debt',
      label: 'Còn nợ',
      align: 'right',
      render: (_, row) => {
        const total = Number(row['Giá trị hợp đồng'] || row['Giá trị HĐ']) || 0;
        const paid = Number(row['Đã thu'] || row['Đã thanh toán']) || 0;
        const debt = row['Còn nợ'] === null || row['Còn nợ'] === undefined
          ? Math.max(total - paid, 0)
          : Number(row['Còn nợ']) || 0;
        return <span className="text-danger" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatVND(debt)}</span>;
      }
    },
    {
      key: 'Tình trạng',
      label: 'Tình trạng',
      render: (val) => <StatusBadge status={val || 'Chờ thanh toán'} domain="hopdong" />
    },
    
    { key: 'Ngày đến hạn', label: 'Ngày đến hạn', width: 100 },
    
    {
      key: 'File Hợp đồng',
      label: 'File',
      align: 'center',
      width: 80,
      stickyRight: true,
      render: (val) => val
        ? <a href={val} target="_blank" rel="noreferrer" className="btn btn-secondary btn-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}>
          <Download size={14} /> File HĐ
        </a>
        : <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>—</span>
    }
  ];

  const displayContracts = useMemo(() => {
    const groups = new Map();

    contracts.forEach(contract => {
      const hierarchy = getContractHierarchy(contract);
      if (!groups.has(hierarchy.groupId)) {
        groups.set(hierarchy.groupId, { groupId: hierarchy.groupId, members: [] });
      }
      groups.get(hierarchy.groupId).members.push({
        ...contract,
        _childNumber: hierarchy.childNumber,
      });
    });

    const rows = [];
    groups.forEach(group => {
      const members = [...group.members].sort((left, right) => {
        if (left._childNumber === null) return -1;
        if (right._childNumber === null) return 1;
        return left._childNumber - right._childNumber;
      });
      const childCount = members.filter(member => member._childNumber !== null).length;

      if (childCount === 0) {
        rows.push({
          ...members[0],
          _rowKey: `contract:${members[0]['Mã hợp đồng']}`,
          _rowType: 'single',
        });
        return;
      }

      const totalValue = members.reduce(
        (sum, member) => sum + (Number(member['Giá trị hợp đồng']) || 0),
        0
      );
      const totalPaid = members.reduce(
        (sum, member) => sum + (Number(member['Đã thu']) || 0),
        0
      );
      const totalDebt = members.reduce(
        (sum, member) => sum + (Number(member['Còn nợ']) || 0),
        0
      );
      const groupStatus = members.some(member => member['Tình trạng'] === 'Quá hạn')
        ? 'Quá hạn'
        : totalDebt <= 0 ? 'Đã tất toán' : 'Còn nợ';

      rows.push({
        'Mã hợp đồng': group.groupId,
        'Mã hồ sơ': `${members.length} hồ sơ`,
        'Tên khách hàng': commonValue(members, 'Tên khách hàng', 'Nhiều khách hàng'),
        'Phòng ban': commonValue(members, 'Phòng ban', `${new Set(members.map(member => member['Phòng ban']).filter(Boolean)).size} phòng ban`),
        'Dịch vụ': commonValue(members, 'Dịch vụ', `${new Set(members.map(member => member['Dịch vụ']).filter(Boolean)).size} dịch vụ`),
        'Ngày ký': earliestDate(members, 'Ngày ký'),
        'Giá trị hợp đồng': totalValue,
        'Đã thu': totalPaid,
        'Còn nợ': totalDebt,
        'Tình trạng': groupStatus,
        'Sale / nguồn': commonValue(members, 'Sale / nguồn', 'Nhiều nguồn'),
        'Ngày đến hạn': earliestDate(members, 'Ngày đến hạn'),
        'Ghi chú': `Nhóm gồm ${members.length} dòng hợp đồng`,
        'File Hợp đồng': '',
        _rowKey: `group:${group.groupId}`,
        _rowType: 'group',
        _groupId: group.groupId,
        _childCount: childCount,
      });

      if (expandedGroups[group.groupId]) {
        members.forEach(member => {
          rows.push({
            ...member,
            _rowKey: `detail:${member['Mã hợp đồng']}`,
            _rowType: 'detail',
            _groupId: group.groupId,
          });
        });
      }
    });

    return rows;
  }, [contracts, expandedGroups]);

  return (
    <section className="tab-pane active contract-page" id="tab-hopdong">
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Table size={24} color="var(--blue-500)" />
          Quản Lý Hợp Đồng & Công Nợ
        </h2>
      </div>

      <FilterBar
        search={searchTerm}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Tìm mã HĐ, mã HS, khách hàng..."
        filters={[
          {
            key: 'status',
            label: 'Tình trạng',
            type: 'select',
            width: 180,
            options: [
              { value: 'Còn nợ', label: 'Còn nợ' },
              { value: 'Quá hạn', label: 'Quá hạn' },
              { value: 'Đã tất toán', label: 'Đã tất toán' }
            ]
          },
          {
            key: 'service',
            label: 'Dịch vụ',
            type: 'select',
            width: 220,
            options: config.services.map(s => ({ value: s, label: s }))
          }
        ]}
        values={filterValues}
        onFilterChange={handleFilterChange}
        onReset={handleResetFilters}
        date={signedDate}
        dateLabel="Chọn ngày ký"
        onDateChange={(value) => { setSignedDate(value); setPage(1); }}
        sort={sort}
        onSortChange={(value) => { setSort(value); setPage(1); }}
        actions={
          <>
            <button className="btn btn-primary" onClick={openContractModal} style={{ marginLeft: 8 }}>
              <Plus size={16} /> Soạn Hợp Đồng Mới
            </button>
          </>
        }
      />

      {/* Data Table */}
      <div className="contract-table-hint">
        <MoveHorizontal size={15} />
        Kéo ngang để xem đủ cột; mã hợp đồng và mã hồ sơ luôn được cố định.
      </div>
      <DataTable
        columns={columns}
        data={displayContracts}
        loading={loading}
        rowKey="_rowKey"
        rowClassName={(row) => {
          if (row._rowType === 'group') return 'contract-group-row';
          if (row._rowType === 'detail') return 'contract-detail-row';
          return '';
        }}
        emptyText="Chưa có hợp đồng nào"
        pageSize={0}
      />
      {pagination.total_pages > 0 && (
        <div className="contract-server-pagination">
          <span>
            {(pagination.page - 1) * CONTRACT_GROUPS_PER_PAGE + 1}
            –{Math.min(pagination.page * CONTRACT_GROUPS_PER_PAGE, pagination.total_groups)}
            {' / '}{pagination.total_groups} nhóm
            {' · '}{pagination.total_contracts} hợp đồng
          </span>
          <div className="contract-server-pagination__controls">
            <button
              type="button"
              className="contract-page-button"
              disabled={page <= 1 || loading}
              onClick={() => setPage(1)}
              aria-label="Trang đầu"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              type="button"
              className="contract-page-button"
              disabled={page <= 1 || loading}
              onClick={() => setPage(current => Math.max(1, current - 1))}
              aria-label="Trang trước"
            >
              <ChevronLeft size={16} />
            </button>
            {getPaginationItems(pagination.page, pagination.total_pages).map((item, index) => (
              item === '…'
                ? <span key={`ellipsis-${index}`} className="contract-page-ellipsis">…</span>
                : (
                  <button
                    type="button"
                    key={item}
                    className={`contract-page-button${pagination.page === item ? ' contract-page-button--active' : ''}`}
                    disabled={loading}
                    onClick={() => setPage(item)}
                    aria-label={`Trang ${item}`}
                    aria-current={pagination.page === item ? 'page' : undefined}
                  >
                    {item}
                  </button>
                )
            ))}
            <button
              type="button"
              className="contract-page-button"
              disabled={page >= pagination.total_pages || loading}
              onClick={() => setPage(current => Math.min(pagination.total_pages, current + 1))}
              aria-label="Trang sau"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="contract-page-button"
              disabled={page >= pagination.total_pages || loading}
              onClick={() => setPage(pagination.total_pages)}
              aria-label="Trang cuối"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal Soạn Hợp Đồng */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        size="lg"
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSignature size={20} color="var(--orange-500)" /> Soạn Hợp Đồng Mới
          </span>
        }
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 20px 0' }}>
          Tự động điền mẫu Word và ghi công nợ vào hệ thống.
        </p>
        <form id="hopdong-form" onSubmit={handleGenerateContract}>
          <FormGrid cols={2}>
            <FormRow label="Mã hợp đồng" required>
              <input className="form-control" required value={formData.SO_HOP_DONG} onChange={e => setFormData({ ...formData, SO_HOP_DONG: e.target.value })} type="text" placeholder="128/BK-2026" />
            </FormRow>
            <FormRow label="Gắn hồ sơ (Tự động điền)">
              <select className="form-control" value={formData.MA_HO_SO} onChange={handleHosoChange}>
                <option value="">{hosoLoading ? 'Đang tải hồ sơ...' : '— Chọn Hồ Sơ —'}</option>
                {hosoList.map((h, i) => <option key={i} value={h['Mã hồ sơ']}>{h['Mã hồ sơ']} - {h['Tên khách hàng']}</option>)}
              </select>
            </FormRow>
            <FormRow label="Tên khách hàng" required>
              <input className="form-control" required value={formData.TEN_KHACH_HANG} onChange={e => setFormData({ ...formData, TEN_KHACH_HANG: e.target.value })} type="text" />
            </FormRow>
            <FormRow label="Số điện thoại" required>
              <input className="form-control" required value={formData.SO_DIEN_THOAI} onChange={e => setFormData({ ...formData, SO_DIEN_THOAI: e.target.value })} type="text" />
            </FormRow>
            <FormRow label="Địa chỉ BĐS" required cols={2}>
              <input className="form-control" required value={formData.DIA_CHI} onChange={e => setFormData({ ...formData, DIA_CHI: e.target.value })} type="text" />
            </FormRow>
            <FormRow label="Dịch vụ" required>
              <select className="form-control" required value={formData.LOAI_DICH_VU} onChange={e => setFormData({ ...formData, LOAI_DICH_VU: e.target.value })}>
                <option value="">— Chọn Dịch Vụ —</option>
                {config.services.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormRow>
            <FormRow label="Sale / Nguồn" required>
              <input className="form-control" required value={formData.Sale_nguồn} onChange={e => setFormData({ ...formData, Sale_nguồn: e.target.value })} type="text" placeholder="Tên sale" />
            </FormRow>
            <FormRow label="Giá trị HĐ (VNĐ)" required>
              <input className="form-control" required value={formData.GIA_TRI_HOP_DONG} onChange={e => setFormData({ ...formData, GIA_TRI_HOP_DONG: e.target.value })} type="number" placeholder="15000000" />
            </FormRow>
            <FormRow label="Ngày ký" required>
              <input className="form-control" required value={formData.NGAY_KY} onChange={e => setFormData({ ...formData, NGAY_KY: e.target.value })} type="date" />
            </FormRow>
            <FormRow label="Hạn hoàn thành" required>
              <input className="form-control" required value={formData.NGAY_HET_HAN} onChange={e => setFormData({ ...formData, NGAY_HET_HAN: e.target.value })} type="date" />
            </FormRow>
          </FormGrid>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-default)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Hủy bỏ</button>
            <button type="submit" className="btn btn-primary" style={{ padding: '0 24px' }}>
              <Printer size={16} style={{ marginRight: '8px' }} /> Xuất Word & Ghi dữ liệu
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
