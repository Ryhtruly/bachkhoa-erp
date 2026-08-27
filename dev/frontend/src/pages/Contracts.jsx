import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus, Workflow as WorkflowIcon, UserRound, CalendarDays, CircleDollarSign, FileText, Layers3 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { DataTable, StatusBadge, FilterBar } from '../components/ui';
import ContractComposer from '../features/contracts/ContractComposer';
import { fetchProtectedDocumentBlob, requestDocxSaveHandle, writeBlobToFileHandle } from '../lib/fileSave';
import { apiFetch, getAccessToken } from '../lib/api';
import ContractDocumentViewer from '../components/contracts/ContractDocumentViewer';
import '../components/contracts/contracts.css';

import ContractWorkspace from '../components/contracts/ContractWorkspace';
import DocumentRegister from '../features/document-register/DocumentRegister';

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

export default function Contracts({ isDirector = false }) {
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
  const [filterValues, setFilterValues] = useState({ task_type_id: 'All' });
  const [danhMucLoc, setDanhMucLoc] = useState([]);
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

  useEffect(() => {
    // Danh mục cho bộ lọc dịch vụ — lọc theo task_type_id để phân biệt trùng tên.
    apiFetch('/api/catalog/service-packages')
      .then(res => setDanhMucLoc(res?.data || []))
      .catch(() => {});
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await apiFetch('/api/config');
      // Gán thẳng `data` là mất mặc định mảng rỗng: chỉ cần payload thiếu một
      // khoá là `config.services.map` nổ và cả trang hợp đồng trắng màn hình.
      if (data) setConfig({
        personnel: Array.isArray(data.personnel) ? data.personnel : [],
        services: Array.isArray(data.services) ? data.services : [],
      });
    } catch { }
  }, []);

  const fetchContracts = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(CONTRACT_GROUPS_PER_PAGE),
        sort,
      });
      if (signedDate) params.set('date_signed', signedDate);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (filterValues.task_type_id !== 'All') params.set('task_type_id', filterValues.task_type_id);

      const payload = await apiFetch(`/api/contracts/workspace-list?${params}`);
      const rows = Array.isArray(payload) ? payload : payload?.data || [];
      setContracts(rows);
      setSelectedContract(current => {
        const matched = rows.find(item => getContractId(item) === getContractId(current));
        if (matched) return matched;
        // Đang được điều hướng tới 1 hợp đồng cụ thể mà nó không có trong trang này:
        // giữ nguyên, tuyệt đối không đá về hợp đồng đầu trang.
        if (navTargetContractRef.current && getContractId(current) === navTargetContractRef.current) return current;
        return rows[0] || null;
      });
      if (payload?.pagination) setPagination(payload.pagination);
    } catch {
      addToast('Lỗi tải danh sách hợp đồng', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, filterValues.task_type_id, page, searchTerm, signedDate, sort]);

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
      const data = await apiFetch('/api/contracts/next-code');
      if (data?.contract_id) {
        setFormData(previous => ({ ...previous, contract_id: data.contract_id }));
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
  // Thực hiện tải ngầm (Stale-While-Revalidate) mà KHÔNG bật lại spinner toàn màn hình,
  // tránh giật lag hay chớp màn hình khi thoát khỏi sơ đồ quy trình.
  useEffect(() => {
    if (contractView === 'list') {
      fetchContracts(false);
    }
  }, [contractView, fetchContracts]);

  const handleGenerateContract = async (payload) => {
    if (!payload.contract_value || payload.contract_value <= 0) {
      addToast('Nhập giá trị hợp đồng hợp lệ', 'error');
      return;
    }

    const sourceDocuments = Array.from(payload.source_documents || []);
    const existingContractId = payload.existing_contract_id || '';
    const contractPayload = { ...payload };
    delete contractPayload.source_documents;
    delete contractPayload.existing_contract_id;

    const uploadSourceDocuments = async (contractId, files) => {
      const failedFiles = files.filter(file => !file || file.size <= 0);
      for (const file of files.filter(file => file && file.size > 0)) {
        try {
          const body = new FormData();
          body.append('file', file);
          await apiFetch(`/api/document-register/contracts/${encodeURI(contractId)}/source-documents`, {
            method: 'POST',
            body,
            timeout: 60_000,
          });
        } catch (uploadError) {
          console.warn(`Không tải được tài liệu nguồn ${file.name}:`, uploadError);
          failedFiles.push(file);
        }
      }
      return failedFiles;
    };

    // Hợp đồng đã tạo thành công ở lượt trước nhưng một vài tệp lỗi: chỉ tải lại
    // đúng các tệp đó, tuyệt đối không tạo thêm một hợp đồng trùng.
    if (existingContractId) {
      setSavingContract(true);
      try {
        const failedFiles = await uploadSourceDocuments(existingContractId, sourceDocuments);
        if (failedFiles.length > 0) {
          addToast(`Còn ${failedFiles.length} tệp chưa tải được. Bạn có thể thử lại.`, 'error');
          return { contract_id: existingContractId, failed_files: failedFiles };
        }
        addToast('Đã tải đủ hồ sơ khách gửi.', 'success');
        setIsModalOpen(false);
        if (page === 1) fetchContracts(); else setPage(1);
        return { contract_id: existingContractId, failed_files: [] };
      } finally {
        setSavingContract(false);
      }
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
    // Safari trên macOS không có hộp chọn nơi lưu. Trước đây gặp trường hợp này
    // là CHẶN LUÔN việc tạo hợp đồng — người dùng Safari không tạo được hợp đồng
    // nào, chỉ vì trình duyệt thiếu một tính năng lưu file. Việc chính là ghi hợp
    // đồng vào hệ thống; chỗ lưu file chỉ là phần phụ, không có thì tải về Downloads.
    const tuTaiVe = fileSelection.reason === 'SaveLocationUnsupported';

    setSavingContract(true);
    try {
      const data = await apiFetch('/api/contracts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, ...contractPayload })
      });

      addToast('Hợp đồng đã được lưu vào hệ thống!', 'success');
      try {
        if (!data?.download_url) throw new Error('Không nhận được đường dẫn tài liệu Word');
        const documentBlob = await fetchProtectedDocumentBlob(data.download_url, getAccessToken());
        if (tuTaiVe) {
          const blobUrl = URL.createObjectURL(documentBlob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = suggestedFileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
          addToast(`📁 Đã tải ${suggestedFileName} về thư mục Tải xuống`, 'success');
        } else {
          await writeBlobToFileHandle(fileSelection.handle, documentBlob);
          addToast(`📁 Đã lưu tệp hợp đồng vào thư mục bạn chọn (${suggestedFileName})`, 'success');
        }
      } catch (fileErr) {
        console.warn('Không thể ghi tệp Word đã tạo vào máy:', fileErr);
        addToast('Hợp đồng đã lưu nhưng chưa thể ghi tệp Word. Bạn có thể mở tài liệu để xem lại.', 'error');
      }

      const savedContractId = data?.id || data?.contract_id || payload.contract_id;
      const failedFiles = await uploadSourceDocuments(savedContractId, sourceDocuments);
      if (failedFiles.length > 0) {
        addToast(`Hợp đồng đã tạo, nhưng còn ${failedFiles.length} tệp chưa tải được. Chỉ cần bấm “Tải lại tệp lỗi”.`, 'error');
        if (page === 1) fetchContracts(); else setPage(1);
        return { contract_id: savedContractId, failed_files: failedFiles };
      }
      if (sourceDocuments.length > 0) addToast(`Đã lưu ${sourceDocuments.length} tài liệu khách gửi.`, 'success');

      setFormData(prev => ({ ...prev, contract_id: '', contract_value: '', address: '' }));
      setAddressLocation({ provinceCode: '', provinceName: '', wardCode: '', wardName: '', detail: '', displayAddress: '' });
      setIsModalOpen(false);
      if (page === 1) fetchContracts();
      else setPage(1);
      return { contract_id: savedContractId, failed_files: [] };
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
          <header className="contract-pane-title">
            <div><span>Danh sách hợp đồng</span><strong>{pagination.total_contracts || contracts.length}</strong></div>
            <button type="button" className="contract-add-button" onClick={openContractModal} title="Soạn hợp đồng mới">
              <Plus size={20} />
            </button>
          </header>

          <div className="contract-master-detail__body">
            <section className="contract-master-pane">
              <div className="contract-master-filters">
                <FilterBar
                  search={searchTerm}
                  onSearchChange={handleSearchChange}
                  searchPlaceholder="Tìm mã hợp đồng, khách hàng, địa điểm..."
                  filters={[
                    {
                      key: 'task_type_id',
                      label: 'Dịch vụ',
                      type: 'select',
                      width: 220,
                      options: danhMucLoc.flatMap(g =>
                        g.task_types.map(hm => ({ value: hm.id, label: `${g.name} · ${hm.name}` }))
                      )
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
                  const classes = [];
                  if (getContractId(row) === getContractId(selectedContract)) classes.push('contract-selected-row');
                  if (Number(row.remaining_amount || 0) > 0.009) classes.push('contract-debt-row');
                  return classes.join(' ');
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
                    <div className="contract-detail-pane__document"><FileText size={20} /></div>
                    <div className="contract-detail-pane__header-info"><span>Hợp đồng đang chọn</span><h3>{getContractId(selectedContract)}</h3></div>
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

                    {/* Giấy tờ khách hàng đưa lúc ký — thu ngay ở đây, cùng chỗ
                        với thao tác tạo hợp đồng, thay vì đợi ai đó nhận việc.
                        Một sổ dùng chung cho mọi hạng mục của hợp đồng. */}
                    <DocumentRegister
                      contractId={getContractId(selectedContract)}
                      addToast={addToast}
                      collapsible
                      title="Giấy tờ khách hàng cung cấp"
                      showSourceRepository
                    />
                  </div>
                  <button type="button" className="btn btn-primary contract-workflow-action" onClick={() => setContractView('workflow')}>
                    <WorkflowIcon size={17} /> Quy trình
                  </button>
                </>
              ) : (
                <>
                  <header className="contract-detail-pane__empty-header">
                    <span>Chi tiết hợp đồng</span>
                  </header>
                  <div className="contract-detail-pane__empty">
                    <FileText size={38} />
                    <strong>Chọn một hợp đồng</strong>
                    <span>Thông tin chi tiết và nút thiết lập quy trình sẽ xuất hiện tại đây.</span>
                  </div>
                </>
              )}
            </aside>
          </div>
        </div>
      ) : (
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
      )}

      {/* Form soạn hợp đồng — dựng theo bản thiết kế riêng, không dùng khung
          Modal chung vì bố cục của nó (đầu · thân cuộn · chân dính) khác hẳn. */}
      <ContractComposer
        open={isModalOpen}
        code={formData.contract_id}
        services={config.services}
        isDirector={isDirector}
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
