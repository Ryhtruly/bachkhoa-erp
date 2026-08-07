import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  UserRound,
  Phone,
  MapPin,
  FolderOpen,
  PackageCheck,
  TriangleAlert,
  LoaderCircle,
  Workflow,
  ShieldCheck,
  DollarSign
} from 'lucide-react';
import ContractWorkflowDesigner from './ContractWorkflowDesigner';
import {
  WORKFLOW_INSTANCE_STATUS_LABELS,
  WORKFLOW_REVISION_STATUS_LABELS,
  workflowLabel,
} from './workflowLabels';

const getContractId = contract => contract?.id || contract?.contract_id || '';

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
            <span>{index + 1}</span>
            <div>
              <strong>{line.task_type || line.service_type}</strong>
              <small>{line.workflow ? workflowLabel(WORKFLOW_INSTANCE_STATUS_LABELS, line.workflow.status, 'Chưa thiết lập') : 'Chưa thiết lập'}</small>
            </div>
          </button>
        ))}
      </aside>
    </div>
  );
}

function DocumentsTab({ workspace }) {
  return (
    <div className="contract-documents-tab">
      <div className="contract-documents__notice">
        <TriangleAlert size={18} />
        <div><strong>Tài liệu Hợp đồng: {workspace.contract?.file_link || 'Chưa đính kèm file'}</strong></div>
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
