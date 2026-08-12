import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowLeft,
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
  DollarSign,
  Ruler
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
      <div><span>Diện tích</span><strong><Ruler size={15} /> {contract.service_area ? `${new Intl.NumberFormat('vi-VN').format(Number(contract.service_area))} m²` : 'Chưa có'}</strong></div>
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

export default function ContractWorkspace({ tab, contract, contracts, onContractChange, onBack, addToast, targetServiceLineId, targetNodeKey, targetType, targetNonce }) {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedServiceLineId, setSelectedServiceLineId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const contractId = getContractId(contract);

  // Điều hướng từ chuông thông báo chỉ áp dụng 1 lần khi có mục tiêu mới —
  // không khoá người dùng vào Hạng mục đó mãi mỗi lần polling làm mới dữ liệu.
  // Mở lại theo từng LẦN BẤM (nonce) chứ không theo giá trị mục tiêu — nếu theo giá trị,
  // bấm lại đúng thông báo cũ sẽ bị coi là "đã dùng rồi" và không điều hướng nữa.
  const targetConsumedRef = useRef(false);
  useEffect(() => {
    targetConsumedRef.current = false;
  }, [targetServiceLineId, targetNonce]);

  // Chỉ đánh dấu "đã nạp xong" khi dữ liệu THỰC SỰ về tới nơi. Nếu đánh dấu sớm ngay lúc
  // gọi fetch, lần chạy effect thứ hai của StrictMode (mount→cleanup→mount) sẽ tưởng đã nạp
  // rồi nên chuyển sang nạp ngầm, khiến cờ loading bật ở lần một không bao giờ được tắt.
  const loadedContextRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!contractId || tab === 'contracts') return undefined;
    let cancelled = false;
    const contextKey = `${contractId}:${tab}`;

    const loadWorkspace = (showLoading) => {
      const controller = new AbortController();
      const requestId = (requestIdRef.current += 1);
      if (showLoading) {
        setLoading(true);
        setError('');
      }
      fetch(`/api/contracts/workspace?contract_id=${encodeURIComponent(contractId)}`, { signal: controller.signal })
        .then(async response => {
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.detail || 'Không tải được workspace hợp đồng');
          }
          return response.json();
        })
        .then(payload => {
          if (cancelled) return;
          loadedContextRef.current = contextKey;
          setWorkspace(payload);
          const shouldApplyTarget = targetServiceLineId && !targetConsumedRef.current
            && payload.service_lines.some(item => item.id === targetServiceLineId);
          if (targetServiceLineId) targetConsumedRef.current = true;
          setSelectedServiceLineId(current => (
            shouldApplyTarget
              ? targetServiceLineId
              : payload.service_lines.some(item => item.id === current)
                ? current
                : payload.service_lines[0]?.id || ''
          ));
        })
        .catch(fetchError => {
          if (!cancelled && fetchError.name !== 'AbortError' && showLoading) setError(fetchError.message);
        })
        .finally(() => {
          // Tắt cờ loading kể cả khi request bị huỷ, miễn là không có request mới hơn
          // đang chạy — nếu không, một lần huỷ giữa chừng sẽ treo spinner vĩnh viễn.
          if (showLoading && requestIdRef.current === requestId) setLoading(false);
        });
      return controller;
    };

    // Chỉ bật spinner khi thật sự đổi hợp đồng/tab. Nếu chỉ là làm mới sau khi lưu
    // (refreshKey), phải nạp NGẦM — bật spinner sẽ unmount cả cây designer bên dưới,
    // xoá sạch state cục bộ đang sửa dở (checklist vừa thêm, node đang chọn, chế độ sửa).
    const initialController = loadWorkspace(loadedContextRef.current !== contextKey);
    // Cập nhật ngầm — không bật lại loading/spinner, giữ nguyên lựa chọn đang xem.
    // 5s để khớp nhịp với chuông thông báo, admin thấy việc cần duyệt gần như tức thì.
    const pollId = setInterval(() => loadWorkspace(false), 5000);

    return () => {
      cancelled = true;
      initialController.abort();
      clearInterval(pollId);
    };
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
        {tab === 'workflow' ? (
          <div className="contract-page-heading__title-row">
            {onBack && (
              <button
                type="button"
                className="contract-page-heading__back"
                onClick={onBack}
                title="Quay lại danh sách"
                aria-label="Quay lại danh sách"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h2>
              <Workflow size={20} />
              {`Thiết lập quy trình · ${contractId}`}
            </h2>
          </div>
        ) : (
          <div>
            <span className="eyebrow">Không gian vận hành hợp đồng</span>
            <h2>{contractId}</h2>
          </div>
        )}
      </div>

      {/* Chỉ che bằng spinner khi CHƯA có dữ liệu nào. Đã có workspace thì luôn hiển thị,
          không để một cờ loading kẹt lại làm mất trắng cả màn hình quy trình. */}
      {loading && !workspace ? (
        <div className="contract-workspace-loading"><LoaderCircle size={24} className="spin" /> Đang tải Hạng mục và workflow…</div>
      ) : error && !workspace ? (
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
              capabilities={workspace.capabilities}
                  addToast={addToast}
                  onPersisted={() => setRefreshKey(current => current + 1)}
                  targetNodeKey={selectedServiceLine?.id === targetServiceLineId ? targetNodeKey : undefined}
                  targetType={selectedServiceLine?.id === targetServiceLineId ? targetType : undefined}
                  targetNonce={selectedServiceLine?.id === targetServiceLineId ? targetNonce : undefined}
                />
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
