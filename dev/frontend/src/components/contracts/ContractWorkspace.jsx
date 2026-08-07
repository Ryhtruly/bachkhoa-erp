import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  FileArchive,
  FileCheck2,
  FileText,
  FolderOpen,
  LoaderCircle,
  MapPin,
  PackageCheck,
  Phone,
  TriangleAlert,
  UserRound,
  Workflow,
} from 'lucide-react';
import ContractWorkflowDesigner from './ContractWorkflowDesigner';
import {
  WORKFLOW_INSTANCE_STATUS_LABELS,
  WORKFLOW_REVISION_STATUS_LABELS,
  workflowLabel,
} from './workflowLabels';

const getContractId = contract => contract?.['Mã hợp đồng'] || contract?.id || '';

const formatVND = value => `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)}₫`;

function WorkspaceEmpty({ icon: Icon = FolderOpen, title, description }) {
  return (
    <div className="contract-workspace-empty">
      <div><Icon size={28} /></div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function ContractSummary({ contract }) {
  return (
    <div className="contract-summary-grid">
      <div><span>Khách hàng</span><strong><UserRound size={15} /> {contract.customer_name || 'Chưa có'}</strong></div>
      <div><span>Điện thoại</span><strong><Phone size={15} /> {contract.customer_phone || 'Chưa có'}</strong></div>
      <div><span>Địa điểm dịch vụ</span><strong><MapPin size={15} /> {contract.service_location || 'Chưa có'}</strong></div>
      <div><span>Giá trị hợp đồng</span><strong>{formatVND(contract.total_value)}</strong></div>
    </div>
  );
}

function ServiceLinesTab({ workspace, selectedId, onSelect }) {
  const selected = workspace.service_lines.find(item => item.id === selectedId) || workspace.service_lines[0];
  if (workspace.service_lines.length === 0) {
    return (
      <WorkspaceEmpty
        icon={PackageCheck}
        title="Hợp đồng chưa có Hạng mục"
        description="Cần tạo record trong service_lines và gắn đúng task_type_id/service_package_id trước khi thiết lập quy trình."
      />
    );
  }

  return (
    <div className="service-line-layout">
      <aside className="service-line-list">
        <div className="service-line-list__heading">
          <span>Hạng mục hợp đồng</span>
          <strong>{workspace.service_lines.length}</strong>
        </div>
        {workspace.service_lines.map((line, index) => (
          <button
            type="button"
            key={line.id}
            className={line.id === selected?.id ? 'active' : ''}
            onClick={() => onSelect(line.id)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div><strong>{line.task_type || line.service_type || 'Hạng mục chưa đặt tên'}</strong><small>{line.service_package || 'Chưa xác định gói'}</small></div>
          </button>
        ))}
      </aside>
      <div className="service-line-detail">
        <div className="service-line-detail__hero">
          <div className="service-line-detail__icon"><Building2 size={24} /></div>
          <div>
            <span>{selected.service_package || 'Gói dịch vụ'}</span>
            <h3>{selected.task_type || selected.service_type}</h3>
            <p>{selected.target_property || workspace.contract.service_location || 'Chưa nhập bất động sản mục tiêu'}</p>
          </div>
          <div className="service-line-detail__price"><span>Giá Hạng mục</span><strong>{formatVND(selected.price)}</strong></div>
        </div>
        <div className="service-line-detail__cards">
          <article>
            <span>Tình trạng workflow</span>
            <strong>{workflowLabel(WORKFLOW_INSTANCE_STATUS_LABELS, selected.workflow?.status, 'Chưa thiết lập')}</strong>
            <p>{selected.workflow ? `Bản chỉnh sửa ${selected.workflow.revision_no || '—'} · ${workflowLabel(WORKFLOW_REVISION_STATUS_LABELS, selected.workflow.revision_status, 'Chưa kích hoạt')}` : 'Giám đốc cần thiết lập quy trình cho Hạng mục này.'}</p>
          </article>
          <article>
            <span>Quy trình mẫu</span>
            <strong>{selected.workflow?.template?.name || 'Tự thiết kế'}</strong>
            <p>{selected.workflow?.template ? `${selected.workflow.template.code} · Version ${selected.workflow.template.version}` : 'Có thể bắt đầu từ K01–K09 hoặc chọn template.'}</p>
          </article>
          <article>
            <span>Tiến độ thực thi</span>
            <strong>{selected.workflow?.execution_nodes?.filter(node => node.status === 'accepted').length || 0}/{selected.workflow?.execution_nodes?.length || 0} Node</strong>
            <p>Chỉ Node đã nghiệm thu mới được tính hoàn thành và sinh khoản khoán.</p>
          </article>
        </div>
      </div>
    </div>
  );
}

function DocumentsTab({ workspace }) {
  const hasTechnical = ['true', '1', 'yes', 'có', 'co'].includes(
    String(workspace.contract.has_technical || '').trim().toLowerCase()
  );
  const documents = [
    {
      key: 'contract',
      icon: FileText,
      title: 'Hợp đồng đã ký',
      description: workspace.contract.document_type || 'Bản hợp đồng chính',
      link: workspace.contract.file_link,
      state: workspace.contract.file_link ? 'available' : 'missing',
    },
    {
      key: 'customer',
      icon: FileArchive,
      title: 'Giấy tờ khách hàng',
      description: 'CCCD, giấy chứng nhận và giấy tờ pháp lý khách cung cấp',
      state: 'unsupported',
    },
    {
      key: 'technical',
      icon: FileCheck2,
      title: 'Tài liệu kỹ thuật',
      description: 'Bản vẽ, file scan, biên nhận và minh chứng theo checklist',
      state: hasTechnical ? 'declared' : 'unsupported',
    },
  ];

  return (
    <div className="contract-documents">
      <div className="contract-documents__intro">
        <div><span className="eyebrow">Kho tài liệu</span><h3>Hồ sơ của {workspace.contract.id}</h3></div>
        <div className="capability-chip"><TriangleAlert size={14} /> Chưa có bảng contract_documents</div>
      </div>
      <div className="contract-document-grid">
        {documents.map(document => {
          const Icon = document.icon;
          return (
            <article key={document.key} className={`contract-document-card contract-document-card--${document.state}`}>
              <div className="contract-document-card__icon"><Icon size={22} /></div>
              <div><strong>{document.title}</strong><p>{document.description}</p></div>
              {document.link ? (
                <a href={document.link} target="_blank" rel="noreferrer">Mở file <ExternalLink size={14} /></a>
              ) : document.state === 'declared' ? (
                <span><CheckCircle2 size={14} /> Đã khai báo</span>
              ) : (
                <span>Chưa có dữ liệu</span>
              )}
            </article>
          );
        })}
      </div>
      <div className="contract-documents__notice">
        <TriangleAlert size={18} />
        <div><strong>Database hiện chỉ có `contracts.file_link`.</strong><p>Muốn upload nhiều giấy tờ, phân loại file và gắn vào Hạng mục/Node cần bổ sung bảng tài liệu ở phase database tiếp theo.</p></div>
      </div>
    </div>
  );
}

export default function ContractWorkspace({ tab, contract, contracts, onContractChange, addToast }) {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedServiceLineId, setSelectedServiceLineId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const contractId = getContractId(contract);
  const selectableContracts = useMemo(() => {
    const seen = new Set();
    return [contract, ...contracts].filter(item => {
      const id = getContractId(item);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [contract, contracts]);

  useEffect(() => {
    if (!contractId || tab === 'contracts') return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/contracts/workspace?contract_id=${encodeURIComponent(contractId)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || 'Không tải được workspace hợp đồng');
        }
        return response.json();
      })
      .then(payload => {
        setWorkspace(payload);
        setSelectedServiceLineId(current => (
          payload.service_lines.some(item => item.id === current)
            ? current
            : payload.service_lines[0]?.id || ''
        ));
      })
      .catch(fetchError => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [contractId, tab, refreshKey]);

  const selectedServiceLine = useMemo(
    () => workspace?.service_lines.find(item => item.id === selectedServiceLineId) || workspace?.service_lines[0],
    [selectedServiceLineId, workspace?.service_lines]
  );

  if (!contractId) {
    return <WorkspaceEmpty title="Chọn một hợp đồng" description="Chọn hợp đồng ở tab Danh sách để xem Hạng mục, tài liệu và thiết lập workflow." />;
  }

  return (
    <div className={`contract-workspace contract-workspace--${tab}`}>
      <div className="contract-workspace__header">
        <div>
          <span className="eyebrow">Không gian vận hành hợp đồng</span>
          <h2>{contractId}</h2>
        </div>
        <label>
          <span>Đang xem hợp đồng</span>
          <select
            className="form-control"
            value={contractId}
            onChange={event => onContractChange(
              selectableContracts.find(item => getContractId(item) === event.target.value)
            )}
          >
            {selectableContracts.map(item => (
              <option key={getContractId(item)} value={getContractId(item)}>
                {getContractId(item)} — {item.customer_name || item['Tên khách hàng'] || 'Khách hàng'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="contract-workspace-loading"><LoaderCircle size={24} className="spin" /> Đang tải Hạng mục và workflow…</div>
      ) : error ? (
        <WorkspaceEmpty icon={TriangleAlert} title="Không tải được dữ liệu" description={error} />
      ) : !workspace ? null : (
        <>
          <ContractSummary contract={workspace.contract} />
          {tab === 'services' && (
            <ServiceLinesTab workspace={workspace} selectedId={selectedServiceLineId} onSelect={setSelectedServiceLineId} />
          )}
          {tab === 'documents' && <DocumentsTab workspace={workspace} />}
          {tab === 'workflow' && (
            workspace.service_lines.length === 0 ? (
              <WorkspaceEmpty
                icon={Workflow}
                title="Chưa thể thiết lập workflow"
                description="Hợp đồng phải có ít nhất một service_line. Mỗi Hạng mục sẽ sở hữu một workflow_instance độc lập."
              />
            ) : (
              <div className="contract-workflow-layout">
                <aside className="contract-workflow-services">
                  <div><span>Hạng mục</span><strong>{workspace.service_lines.length}</strong></div>
                  {workspace.service_lines.map((line, index) => (
                    <button
                      type="button"
                      key={line.id}
                      className={line.id === selectedServiceLine?.id ? 'active' : ''}
                      onClick={() => setSelectedServiceLineId(line.id)}
                    >
                      <span>{index + 1}</span>
                      <div>
                        <strong>{line.task_type || line.service_type}</strong>
                        <small>
                          {line.workflow?.status === 'cancelled'
                            ? workflowLabel(WORKFLOW_INSTANCE_STATUS_LABELS, line.workflow.status, 'Đã hủy')
                            : workflowLabel(WORKFLOW_REVISION_STATUS_LABELS, line.workflow?.revision_status, 'Chưa thiết lập')}
                        </small>
                      </div>
                    </button>
                  ))}
                </aside>
                <ContractWorkflowDesigner
                  serviceLine={selectedServiceLine}
                  catalog={workspace.workflow_catalog}
                  templates={workspace.workflow_templates}
                  employees={workspace.assignment_options}
                  workItems={workspace.work_item_catalog}
                  contractDateSigned={workspace.contract.date_signed}
                  contractDriveUrl={workspace.contract.file_link}
                  capabilities={workspace.capabilities}
                  addToast={addToast}
                  onPersisted={() => setRefreshKey(current => current + 1)}
                />
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
