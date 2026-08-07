import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileSignature, Table, Printer, Download, Plus, MoveHorizontal, Workflow as WorkflowIcon, UserRound, CalendarDays, CircleDollarSign, FileText, Layers3 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Modal, FormRow, FormGrid, DataTable, StatusBadge, FilterBar } from '../components/ui';
import '../components/contracts/contracts.css';

const ContractWorkspace = React.lazy(() => import('../components/contracts/ContractWorkspace'));

const CONTRACT_GROUPS_PER_PAGE = 15;
function getContractId(contract) {
  return contract?.id || contract?.contract_id || '';
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

export default function Contracts() {
  const [contracts, setContracts] = useState([]);
  const [config, setConfig] = useState({ personnel: [], services: [] });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contractView, setContractView] = useState('list');
  const [selectedContract, setSelectedContract] = useState(null);
  const { addToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterValues, setFilterValues] = useState({ service: 'All' });
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
    contract_id: '', customer_name: '', phone: '',
    customer_email: 'admin@nhadatbachkhoa.com', service_type: '',
    address: '', contract_value: '', date_signed: '', due_date: '', sales_source: ''
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
      if (filterValues.service !== 'All') params.set('service', filterValues.service);

      const res = await fetch(`/api/contracts/workspace-list?${params}`);
      if (res.ok) {
        const payload = await res.json();
        const rows = Array.isArray(payload) ? payload : payload.data || [];
        setContracts(rows);
        setSelectedContract(current => (
          rows.find(item => getContractId(item) === getContractId(current)) || rows[0] || null
        ));
        if (payload.pagination) setPagination(payload.pagination);
      }
    } catch {
      addToast('Lỗi tải danh sách hợp đồng', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, filterValues.service, page, searchTerm, signedDate, sort]);

  const openContractModal = () => {
    setIsModalOpen(true);
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
    setFormData(prev => ({ ...prev, date_signed: today, due_date: nextWeek }));
  }, [fetchContracts]);

  const handleGenerateContract = async (e) => {
    e.preventDefault();
    const val = parseFloat(formData.contract_value);
    if (!val || val <= 0) {
      addToast('Nhập giá trị hợp đồng hợp lệ', 'error');
      return;
    }

    try {
      const res = await fetch('/api/contracts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, contract_value: val })
      });
      if (res.ok) {
        const data = await res.json();
        addToast('Hợp đồng đã được tạo thành công!', 'success');
        if (data.download_url) {
          window.open(data.download_url);
        }
        setFormData(prev => ({ ...prev, contract_id: '', contract_value: '' }));
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
    setFilterValues({ service: 'All' });
    setSignedDate('');
    setSort('desc');
    setPage(1);
  }, []);

  const columns = [
    {
      key: 'id',
      label: 'Mã hợp đồng',
      width: 150,
      render: (value) => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{value}</span>
    },
    {
      key: 'customer_name',
      label: 'Khách hàng',
      width: 170,
      render: (val) => <EllipsisCell value={val} />
    },
    {
      key: 'service_lines',
      label: 'Hạng mục',
      width: 210,
      render: (lines = []) => (
        <span className="contract-service-summary">
          <Layers3 size={14} />
          <span>{lines.map(line => line.name).filter(Boolean).join(', ') || 'Chưa có Hạng mục'}</span>
          <small>{lines.length}</small>
        </span>
      )
    },
    { key: 'date_signed', label: 'Ngày ký', width: 105 },
    {
      key: 'total_value',
      label: 'Giá trị',
      align: 'right',
      render: (value) => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 650 }}>{formatVND(value)}</span>
    },
    {
      key: 'status',
      label: 'Trạng thái',
      width: 120,
      render: (value) => <StatusBadge status={value || 'Chưa cập nhật'} domain="contracts" />
    },
    {
      key: 'file_link',
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

  return (
    <section className={`tab-pane active contract-page${contractView === 'list' ? ' contract-page--list' : ''}`} id="tab-hopdong">
      <div className={`contract-page-heading contract-page-heading--${contractView}`}>
        <div>
          <h2>
            {contractView === 'workflow' ? <WorkflowIcon size={22} /> : <Table size={23} />}
            {contractView === 'workflow' ? `Thiết lập quy trình · ${getContractId(selectedContract)}` : 'Quản Lý Hợp Đồng'}
          </h2>
        </div>
        {contractView === 'workflow' && (
          <button type="button" className="btn btn-secondary" onClick={() => setContractView('list')}>
            <ArrowLeft size={16} /> Quay lại danh sách
          </button>
        )}
      </div>

      {contractView === 'list' ? (
        <div className="contract-master-detail">
          <section className="contract-master-pane">
            <header className="contract-pane-title">
              <div><span>Danh sách hợp đồng</span><strong>{pagination.total_contracts || contracts.length}</strong></div>
              <button type="button" className="contract-add-button" onClick={openContractModal} title="Soạn hợp đồng mới">
                <Plus size={20} />
              </button>
            </header>

            <div className="contract-master-filters">
              <FilterBar
                search={searchTerm}
                onSearchChange={handleSearchChange}
                searchPlaceholder="Tìm mã hợp đồng, khách hàng, địa điểm..."
                filters={[
                  {
                    key: 'service',
                    label: 'Dịch vụ',
                    type: 'select',
                    width: 180,
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
              />
            </div>

            <div className="contract-table-hint">
              <MoveHorizontal size={15} /> Kéo ngang để xem đầy đủ thông tin.
            </div>
            <DataTable
              columns={columns}
              data={contracts}
              loading={loading}
              rowKey="id"
              onRowClick={setSelectedContract}
              rowClassName={(row) => {
                return getContractId(row) === getContractId(selectedContract) ? 'contract-selected-row' : '';
              }}
              emptyText="Chưa có hợp đồng nào"
              pageSize={0}
            />
            {pagination.total_pages > 0 && (
              <div className="contract-server-pagination">
                <span>
                  {(pagination.page - 1) * CONTRACT_GROUPS_PER_PAGE + 1}
                  –{Math.min(pagination.page * CONTRACT_GROUPS_PER_PAGE, pagination.total_groups)}
                  {' / '}{pagination.total_contracts} hợp đồng
                </span>
                <div className="contract-server-pagination__controls">
                  <button type="button" className="contract-page-button" disabled={page <= 1 || loading} onClick={() => setPage(1)} aria-label="Trang đầu"><ChevronsLeft size={16} /></button>
                  <button type="button" className="contract-page-button" disabled={page <= 1 || loading} onClick={() => setPage(current => Math.max(1, current - 1))} aria-label="Trang trước"><ChevronLeft size={16} /></button>
                  {getPaginationItems(pagination.page, pagination.total_pages).map((item, index) => (
                    item === '…'
                      ? <span key={`ellipsis-${index}`} className="contract-page-ellipsis">…</span>
                      : <button type="button" key={item} className={`contract-page-button${pagination.page === item ? ' contract-page-button--active' : ''}`} disabled={loading} onClick={() => setPage(item)} aria-label={`Trang ${item}`}>{item}</button>
                  ))}
                  <button type="button" className="contract-page-button" disabled={page >= pagination.total_pages || loading} onClick={() => setPage(current => Math.min(pagination.total_pages, current + 1))} aria-label="Trang sau"><ChevronRight size={16} /></button>
                  <button type="button" className="contract-page-button" disabled={page >= pagination.total_pages || loading} onClick={() => setPage(pagination.total_pages)} aria-label="Trang cuối"><ChevronsRight size={16} /></button>
                </div>
              </div>
            )}
          </section>

          <aside className="contract-detail-pane">
            {selectedContract ? (
              <>
                <header>
                  <div className="contract-detail-pane__document"><FileText size={24} /></div>
                  <div><span>Hợp đồng đang chọn</span><h3>{getContractId(selectedContract)}</h3></div>
                  <StatusBadge status={selectedContract.status || 'Chưa cập nhật'} domain="contracts" />
                </header>
                <div className="contract-detail-pane__content">
                  <div className="contract-detail-field"><UserRound size={17} /><div><span>Khách hàng</span><strong>{selectedContract.customer_name || 'Chưa cập nhật'}</strong></div></div>
                  <div className="contract-detail-field"><CalendarDays size={17} /><div><span>Ngày ký</span><strong>{selectedContract.date_signed || 'Chưa cập nhật'}</strong></div></div>
                  <div className="contract-detail-field"><CircleDollarSign size={17} /><div><span>Giá trị hợp đồng</span><strong>{formatVND(selectedContract.total_value)}</strong></div></div>
                  <div className="contract-detail-field"><Layers3 size={17} /><div><span>Hạng mục</span><strong>{selectedContract.service_lines?.map(line => line.name).filter(Boolean).join(', ') || 'Chưa cập nhật'}</strong></div></div>
                  <div className="contract-paper-preview">
                    <FileText size={42} />
                    <strong>Tài liệu hợp đồng</strong>
                    <span>{selectedContract.file_link ? 'Đã có file hợp đồng' : 'Chưa đính kèm file hợp đồng'}</span>
                    {selectedContract.file_link && <a href={selectedContract.file_link} target="_blank" rel="noreferrer"><Download size={15} /> Mở tài liệu</a>}
                  </div>
                </div>
                <footer>
                  <button type="button" className="btn btn-primary" onClick={() => setContractView('workflow')}>
                    <WorkflowIcon size={17} /> Thiết lập quy trình Hạng mục hợp đồng
                  </button>
                </footer>
              </>
            ) : (
              <div className="contract-detail-pane__empty">
                <FileText size={38} />
                <strong>Chọn một hợp đồng</strong>
                <span>Thông tin chi tiết và nút thiết lập quy trình sẽ xuất hiện tại đây.</span>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <React.Suspense fallback={<div className="contract-workspace-loading">Đang mở trình thiết lập quy trình…</div>}>
          <ContractWorkspace
            tab="workflow"
            contract={selectedContract}
            contracts={contracts}
            onContractChange={setSelectedContract}
            addToast={addToast}
          />
        </React.Suspense>
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
          Điền thông tin và lưu hợp đồng vào hệ thống.
        </p>
        <form id="hopdong-form" onSubmit={handleGenerateContract}>
          <FormGrid cols={2}>
            <FormRow label="Mã hợp đồng" required>
              <input className="form-control" required value={formData.contract_id} onChange={e => setFormData({ ...formData, contract_id: e.target.value })} type="text" placeholder="128/BK-2026" />
            </FormRow>
            <FormRow label="Tên khách hàng" required>
              <input className="form-control" required value={formData.customer_name} onChange={e => setFormData({ ...formData, customer_name: e.target.value })} type="text" />
            </FormRow>
            <FormRow label="Số điện thoại" required>
              <input className="form-control" required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} type="text" />
            </FormRow>
            <FormRow label="Địa chỉ BĐS" required cols={2}>
              <input className="form-control" required value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} type="text" />
            </FormRow>
            <FormRow label="Dịch vụ" required>
              <select className="form-control" required value={formData.service_type} onChange={e => setFormData({ ...formData, service_type: e.target.value })}>
                <option value="">— Chọn Dịch Vụ —</option>
                {config.services.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormRow>
            <FormRow label="Sale / Nguồn" required>
              <input className="form-control" required value={formData.sales_source} onChange={e => setFormData({ ...formData, sales_source: e.target.value })} type="text" placeholder="Tên sale" />
            </FormRow>
            <FormRow label="Giá trị HĐ (VNĐ)" required>
              <input className="form-control" required value={formData.contract_value} onChange={e => setFormData({ ...formData, contract_value: e.target.value })} type="number" placeholder="15000000" />
            </FormRow>
            <FormRow label="Ngày ký" required>
              <input className="form-control" required value={formData.date_signed} onChange={e => setFormData({ ...formData, date_signed: e.target.value })} type="date" />
            </FormRow>
            <FormRow label="Hạn hoàn thành" required>
              <input className="form-control" required value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} type="date" />
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
