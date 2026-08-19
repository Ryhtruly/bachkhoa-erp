import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus, Workflow as WorkflowIcon, UserRound, CalendarDays, CircleDollarSign, FileText, Layers3 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { DataTable, StatusBadge, FilterBar } from '../components/ui';
import ContractComposer from '../features/contracts/ContractComposer';
import { fetchProtectedDocumentBlob, requestDocxSaveHandle, writeBlobToFileHandle } from '../lib/fileSave';
import { apiFetch, getAccessToken } from '../lib/api';
import ContractDocumentViewer from '../components/contracts/ContractDocumentViewer';
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
  const [savingContract, setSavingContract] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [contractView, setContractView] = useState('list');
  const [selectedContract, setSelectedContract] = useState(null);
  const [documentUrl, setDocumentUrl] = useState('');
  const [navTarget, setNavTarget] = useState(null);
  const navTargetContractRef = useRef(null);
  const { addToast } = useToast();

  // Điều hướng từ chuông thông báo — bấm 1 mục là nhảy thẳng tới đúng hợp đồng/Hạng mục/Node.
  useEffect(() => {
    const handler = (event) => {
      const { contractId, serviceLineId, nodeKey, type, nonce } = event.detail || {};
      if (!contractId) return;
      // Ghim lại hợp đồng đích: danh sách có phân trang, hợp đồng cần tới có thể không nằm
      // trong trang đang tải nên vòng fetch sau đó sẽ đá về hợp đồng đầu trang nếu không ghim.
      navTargetContractRef.current = contractId;
      setSelectedContract(current => (getContractId(current) === contractId ? current : { id: contractId }));
      setNavTarget({ serviceLineId, nodeKey, type, nonce });
      setContractView('workflow');
    };
    window.addEventListener('bachkhoa:navigate-to-node', handler);
    return () => window.removeEventListener('bachkhoa:navigate-to-node', handler);
  }, []);

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
  const [addressLocation, setAddressLocation] = useState({
    provinceCode: '', provinceName: '', wardCode: '', wardName: '', detail: '', displayAddress: '',
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
        setSelectedContract(current => {
          const matched = rows.find(item => getContractId(item) === getContractId(current));
          if (matched) return matched;
          // Đang được điều hướng tới 1 hợp đồng cụ thể mà nó không có trong trang này:
          // giữ nguyên, tuyệt đối không đá về hợp đồng đầu trang.
          if (navTargetContractRef.current && getContractId(current) === navTargetContractRef.current) return current;
          return rows[0] || null;
        });
        if (payload.pagination) setPagination(payload.pagination);
      }
    } catch {
      addToast('Lỗi tải danh sách hợp đồng', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, filterValues.service, page, searchTerm, signedDate, sort]);

  const openContractModal = async () => {
    setTemplatesLoading(true);
    setTemplatesError('');
    let catalog;
    try {
      catalog = await apiFetch('/api/contracts/templates');
    } catch {
      const message = 'Không thể tải mẫu hợp đồng để soạn hợp đồng mới';
      setTemplates([]);
      setTemplatesError(message);
      addToast(message, 'error');
      setTemplatesLoading(false);
      return;
    }

    if (!Array.isArray(catalog) || catalog.length === 0) {
      const message = 'Chưa có mẫu hợp đồng đã ban hành để soạn hợp đồng mới';
      setTemplates([]);
      setTemplatesError(message);
      addToast(message, 'error');
      setTemplatesLoading(false);
      return;
    }
    setTemplates(catalog);

    try {
      const response = await fetch('/api/contracts/next-code');
      if (response.ok) {
        const { contract_id: contractId } = await response.json();
        setFormData(previous => ({ ...previous, contract_id: contractId }));
      } else {
        addToast('Không thể tạo mã hợp đồng mới', 'error');
      }
      setIsModalOpen(true);
    } catch {
      addToast('Không thể kết nối để tạo mã hợp đồng mới', 'error');
      setIsModalOpen(true);
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    const d = new Date();
    const today = d.toISOString().split('T')[0];
    d.setDate(d.getDate() + 7);
    const nextWeek = d.toISOString().split('T')[0];
    setFormData(prev => ({ ...prev, date_signed: today, due_date: nextWeek }));
  }, []);

  // Vào sơ đồ quy trình rồi quay ra, trạng thái và công nợ đã đổi ở màn kia.
  // Màn này không bị gỡ khỏi cây nên dữ liệu cũ nằm nguyên đó — người dùng thấy
  // "Đang thực hiện" cho hợp đồng vừa nghiệm thu xong và phải tự F5.
  useEffect(() => {
    if (contractView === 'list') fetchContracts();
  }, [contractView, fetchContracts]);

  const handleGenerateContract = async (payload) => {
    if (!payload.contract_value || payload.contract_value <= 0) {
      addToast('Nhập giá trị hợp đồng hợp lệ', 'error');
      return;
    }

    const safeCustName = (payload.customer_name || 'KhachHang').replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/g, '_');
    const safeContractId = (payload.contract_id || formData.contract_id || 'HD').replace(/[/\\?%*:|"<>]/g, '_');
    const suggestedFileName = `HopDong_${safeContractId}_${safeCustName}.docx`;
    let fileSelection;

    try {
      fileSelection = await requestDocxSaveHandle(suggestedFileName);
    } catch (error) {
      addToast(error.message || 'Không thể mở hộp chọn nơi lưu file Word', 'error');
      return;
    }

    if (fileSelection.cancelled) {
      addToast('Đã hủy chọn nơi lưu; hợp đồng chưa được tạo.', 'info');
      return;
    }
    if (fileSelection.reason === 'SaveLocationUnsupported') {
      addToast('Trình duyệt không hỗ trợ chọn nơi lưu DOCX. Vui lòng dùng Chrome hoặc Edge.', 'info');
      return;
    }

    setSavingContract(true);
    try {
      const data = await apiFetch('/api/contracts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, ...payload })
      });

      addToast('✅ Hợp đồng đã được lưu vào hệ thống!', 'success');
      try {
        if (!data?.download_url) throw new Error('Không nhận được đường dẫn tài liệu Word');
        const documentBlob = await fetchProtectedDocumentBlob(data.download_url, getAccessToken());
        await writeBlobToFileHandle(fileSelection.handle, documentBlob);
        addToast(`📁 Đã lưu tệp hợp đồng vào thư mục bạn chọn (${suggestedFileName})`, 'success');
      } catch (fileErr) {
        console.warn('Không thể ghi tệp Word đã tạo vào máy:', fileErr);
        addToast('Hợp đồng đã lưu nhưng chưa thể ghi tệp Word. Bạn có thể mở tài liệu để xem lại.', 'error');
      }

      setFormData(prev => ({ ...prev, contract_id: '', contract_value: '', address: '' }));
      setAddressLocation({ provinceCode: '', provinceName: '', wardCode: '', wardName: '', detail: '', displayAddress: '' });
      setIsModalOpen(false);
      if (page === 1) fetchContracts();
      else setPage(1);
    } catch (err) {
      addToast('Lỗi: ' + (err.message || 'Không thể tạo hợp đồng'), 'error');
    } finally {
      setSavingContract(false);
    }
  };

  const openContractDocument = (nextDocumentUrl) => {
    setDocumentUrl(nextDocumentUrl);
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
      width: 145,
      render: (value) => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{value}</span>
    },
    {
      key: 'customer_name',
      label: 'Khách hàng',
      width: 160,
      render: (val) => <EllipsisCell value={val} />
    },
    {
      key: 'service_lines',
      label: 'Hạng mục',
      width: 135,
      render: (lines = []) => (
        <span className="contract-service-summary">
          <Layers3 size={14} />
          <span>{lines.map(line => line.name).filter(Boolean).join(', ') || 'Chưa có Hạng mục'}</span>
          {lines.length > 1 && <small>{lines.length}</small>}
        </span>
      )
    },
    {
      // Tiền là thứ người dùng tìm đầu tiên. Trước đây cột này bị đẩy ra ngoài
      // màn hình, phải kéo ngang mới thấy — nên gộp giá trị và công nợ làm một,
      // bỏ cột Ngày ký (đã có trong khung chi tiết bên phải).
      key: 'total_value',
      label: 'Giá trị / Còn nợ',
      align: 'right',
      width: 172,
      render: (value, row) => (
        <span className="contract-money">
          <strong>{formatVND(value)}</strong>
          {/* Chỉ dám nói "đã thu đủ" khi thật sự có số để đối chiếu — thiếu dữ
              liệu mà báo đã thu đủ là báo sai chiều nguy hiểm nhất. */}
          {row.remaining_amount == null
            ? <em className="is-unknown">chưa có số liệu</em>
            : Number(row.remaining_amount) > 0
              ? <em className="is-owed">còn {formatVND(row.remaining_amount)}</em>
              : <em className="is-paid">đã thu đủ</em>}
        </span>
      )
    },
    {
      key: 'status',
      label: 'Trạng thái',
      width: 155,
      render: (value) => <StatusBadge status={value || 'Chưa cập nhật'} domain="contracts" />
    },
    {
      key: 'file_link',
      label: 'File',
      align: 'center',
      width: 68,
      render: (val) => val
        ? <button type="button" className="btn btn-secondary btn-xs contract-file-btn"
            title="Mở tài liệu hợp đồng" aria-label="Mở tài liệu hợp đồng" onClick={() => openContractDocument(val)}>
          <FileText size={14} />
        </button>
        : <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>—</span>
    }
  ];

  return (
    <section className={`tab-pane active contract-page${contractView === 'list' ? ' contract-page--list' : ''}`} id="tab-hopdong">
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
                    {selectedContract.file_link && <button type="button" onClick={() => openContractDocument(selectedContract.file_link)}><FileText size={15} /> Mở tài liệu</button>}
                  </div>
                </div>
                <button type="button" className="btn btn-primary contract-workflow-action" onClick={() => setContractView('workflow')}>
                  <WorkflowIcon size={17} /> Quy trình
                </button>
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
            onBack={() => setContractView('list')}
            addToast={addToast}
            targetServiceLineId={navTarget?.serviceLineId}
            targetNodeKey={navTarget?.nodeKey}
            targetType={navTarget?.type}
            targetNonce={navTarget?.nonce}
          />
        </React.Suspense>
      )}

      {/* Form soạn hợp đồng — dựng theo bản thiết kế riêng, không dùng khung
          Modal chung vì bố cục của nó (đầu · thân cuộn · chân dính) khác hẳn. */}
      <ContractComposer
        open={isModalOpen}
        code={formData.contract_id}
        services={config.services}
        templates={templates}
        templatesLoading={templatesLoading}
        templatesError={templatesError}
        saving={savingContract}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleGenerateContract}
      />
      <ContractDocumentViewer
        isOpen={Boolean(documentUrl)}
        documentUrl={documentUrl}
        accessToken={getAccessToken()}
        onClose={() => setDocumentUrl('')}
      />
    </section>
  );
}
