import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  UserRound,
  Phone,
  MapPin,
  FolderOpen,
  PackageCheck,
  TriangleAlert,
  LoaderCircle,
  Workflow,
  Ruler,
  Info,
  ChevronDown,
  X,
  Sparkles,
} from 'lucide-react';
import ContractWorkflowDesigner from './ContractWorkflowDesigner';
import {
  WORKFLOW_INSTANCE_STATUS_LABELS,
  WORKFLOW_REVISION_STATUS_LABELS,
  workflowLabel,
} from './workflowLabels';
import { apiFetch, getAccessToken } from '../../lib/api';
import { requestNavigationPermission } from '../../lib/unsavedChangesGuard';
import PriorityBonusModal from './PriorityBonusModal';

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

export function ContractHeaderDetails({ contract }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!contract) return null;

  return (
    <div className="contract-header-summary" ref={popoverRef}>
      <div className="contract-header-summary__bar">
        <span className="contract-header-summary__client" title={contract.customer_name || 'Khách hàng'}>
          <UserRound size={13} />
          <strong>{contract.customer_name || 'Chưa có tên KH'}</strong>
        </span>
        {contract.customer_phone && (
          <span className="contract-header-summary__phone">
            <Phone size={12} /> {contract.customer_phone}
          </span>
        )}
        <span className="contract-header-summary__divider" aria-hidden="true">•</span>
        <span className="contract-header-summary__value">
          {formatVND(contract.total_value)}
        </span>
        <button
          type="button"
          className={`contract-header-summary__btn${open ? ' is-active' : ''}`}
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-label="Xem chi tiết thông tin khách hàng và hợp đồng"
        >
          <Info size={13} />
          <span>Chi tiết</span>
          <ChevronDown size={13} className={open ? 'is-open' : ''} />
        </button>
      </div>

      {open && (
        <div className="contract-header-summary__popover" role="dialog" aria-label="Chi tiết thông tin hợp đồng">
          <div className="contract-header-summary__popover-head">
            <strong>Thông tin hợp đồng</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng chi tiết">
              <X size={14} />
            </button>
          </div>
          <div className="contract-header-summary__popover-grid">
            <div className="summary-field">
              <span className="summary-field__label"><UserRound size={12} /> Khách hàng</span>
              <strong className="summary-field__value">{contract.customer_name || 'Chưa có'}</strong>
            </div>
            <div className="summary-field">
              <span className="summary-field__label"><Phone size={12} /> Điện thoại</span>
              <strong className="summary-field__value">
                {contract.customer_phone ? (
                  <a href={`tel:${contract.customer_phone}`}>{contract.customer_phone}</a>
                ) : 'Chưa có'}
              </strong>
            </div>
            <div className="summary-field">
              <span className="summary-field__label"><MapPin size={12} /> Địa điểm dịch vụ</span>
              <strong className="summary-field__value">{contract.service_location || 'Chưa có'}</strong>
            </div>
            <div className="summary-field">
              <span className="summary-field__label"><Ruler size={12} /> Diện tích</span>
              <strong className="summary-field__value">
                {contract.service_area ? `${new Intl.NumberFormat('vi-VN').format(Number(contract.service_area))} m²` : 'Chưa có'}
              </strong>
            </div>
            <div className="summary-field summary-field--full">
              <span className="summary-field__label">Giá trị hợp đồng</span>
              <strong className="summary-field__value is-value">{formatVND(contract.total_value)}</strong>
            </div>
          </div>
        </div>
      )}
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
              {line.service_package && (
                <span className={`service-line-pkg service-line-pkg--${line.service_package_id || 'other'}`}>
                  {line.service_package}
                </span>
              )}
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

export const workspaceMemoryCache = new Map();

export function clearWorkspaceMemoryCache(key) {
  if (key) workspaceMemoryCache.delete(key);
  else workspaceMemoryCache.clear();
}

export default function ContractWorkspace({ tab, contract, _contracts, _onContractChange, onBack, addToast, targetServiceLineId, targetNodeKey, targetTaskNodeId, targetType, targetId, targetNonce, isDirector = false }) {
  const contractId = getContractId(contract);
  const contextKey = `${contractId}:${tab}`;
  const [workspace, setWorkspace] = useState(() => workspaceMemoryCache.get(contextKey) || null);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [loading, setLoading] = useState(() => !workspaceMemoryCache.has(contextKey));
  const [error, setError] = useState('');
  const [selectedServiceLineId, setSelectedServiceLineId] = useState(() => {
    const cached = workspaceMemoryCache.get(contextKey);
    return cached?.service_lines?.[0]?.id || '';
  });
  const [refreshKey, setRefreshKey] = useState(0);

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

    // Nếu đã có trong RAM cache và không phải lượt làm mới sau thao tác ghi, nạp ngay lập tức 0ms
    if (workspaceMemoryCache.has(contextKey) && refreshKey === 0) {
      const cached = workspaceMemoryCache.get(contextKey);
      setWorkspace(cached);
      setSelectedServiceLineId(current => (
        cached.service_lines?.some(item => item.id === current)
          ? current
          : cached.service_lines?.[0]?.id || ''
      ));
      setLoading(false);
    }

    const loadWorkspace = (showLoading) => {
      const requestId = (requestIdRef.current += 1);
      if (showLoading) {
        setLoading(true);
        setError('');
      }
      apiFetch(`/api/contracts/workspace?contract_id=${encodeURIComponent(contractId)}`)
        .then(payload => {
          if (cancelled || !payload) return;
          loadedContextRef.current = contextKey;
          workspaceMemoryCache.set(contextKey, payload);
          setWorkspace(payload);
          const shouldApplyTarget = targetServiceLineId && !targetConsumedRef.current
            && payload.service_lines?.some(item => item.id === targetServiceLineId);
          if (targetServiceLineId) targetConsumedRef.current = true;
          setSelectedServiceLineId(current => (
            shouldApplyTarget
              ? targetServiceLineId
              : payload.service_lines?.some(item => item.id === current)
                ? current
                : payload.service_lines?.[0]?.id || ''
          ));
        })
        .catch(fetchError => {
          if (!cancelled && showLoading) setError(fetchError.message || 'Không tải được dữ liệu quy trình');
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setLoading(false);
        });
    };

    // Nếu chưa có trong RAM cache thì mới hiện spinner ngắn lần đầu tiên,
    // các lần sau hoặc chuyển qua lại tab đều mở tức thì 0ms.
    const isFirstTime = !workspaceMemoryCache.has(contextKey);
    loadWorkspace(isFirstTime);

    let streamAbort = null;
    let reconnectTimer = null;
    let refreshTimer = null;
    const refreshFromRealtime = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => loadWorkspace(false), 120);
    };
    const subscribe = async () => {
      if (cancelled || !isDirector) return;
      const token = getAccessToken();
      if (!token) return;
      streamAbort = new AbortController();
      try {
        const response = await fetch('/api/contracts/timeline/events', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          cache: 'no-store',
          signal: streamAbort.signal,
        });
        if (response.status === 401 || response.status === 403 || !response.body) return;
        if (!response.ok) throw new Error('Không kết nối được luồng cập nhật Hợp đồng');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';
          if (blocks.some(block => block.includes('event: timeline-change'))) {
            refreshFromRealtime();
          }
        }
      } catch (streamError) {
        if (cancelled || streamError?.name === 'AbortError') return;
      }
      if (!cancelled) reconnectTimer = window.setTimeout(subscribe, 1500);
    };
    subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadWorkspace(false);
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);

    return () => {
      cancelled = true;
      streamAbort?.abort();
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(refreshTimer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [contractId, contextKey, tab, refreshKey, targetServiceLineId, isDirector]);

  const selectedServiceLine = useMemo(
    () => workspace?.service_lines.find(item => item.id === selectedServiceLineId) || workspace?.service_lines[0],
    [selectedServiceLineId, workspace?.service_lines]
  );

  if (!contractId) {
    return <WorkspaceEmpty title="Chọn một hợp đồng" description="Chọn hợp đồng ở tab Danh sách để xem Hạng mục, tài liệu và thiết lập workflow." />;
  }

  // Giám đốc duyệt/từ chối MỘT tờ giấy. Cố tình không tự làm mới cả workspace
  // sau mỗi lần bấm: duyệt 10 tờ là 10 lần nạp lại toàn bộ hợp đồng, và mỗi lần
  // nạp lại là thanh Chờ duyệt nhảy chỗ dưới tay người đang bấm.
  const reviewDocument = async (checklistResultId, doc, decision, reason) => {
    if (!checklistResultId || !doc?.document_id) {
      addToast?.('Tờ giấy này chưa có tệp nào để duyệt', 'error');
      return;
    }
    try {
      await apiFetch(
        `/api/contracts/workflow/checklist-results/${encodeURIComponent(checklistResultId)}/document-review`,
        {
          method: 'POST',
          body: JSON.stringify({ document_id: doc.document_id, decision, reason }),
        },
      );
      setRefreshKey(current => current + 1);
    } catch (error) {
      addToast?.(error?.message || 'Không duyệt được tờ giấy này', 'error');
    }
  };

  // Chốt đợt duyệt. Nuốt lỗi có chủ đích: đây chỉ là đường CỐ GẮNG chốt sớm,
  // còn lưới an toàn thật là đường chốt lười phía máy chủ. Ném một toast đỏ lúc
  // Giám đốc vừa đóng Drawer chỉ làm họ hoang mang về một việc đã có người lo.
  const flushReviewBatch = async (taskNodeId) => {
    if (!taskNodeId) return;
    try {
      await apiFetch(
        `/api/contracts/workflow/nodes/${encodeURIComponent(taskNodeId)}/review-batch`,
        { method: 'POST' },
      );
      setRefreshKey(current => current + 1);
    } catch {
      // Máy chủ sẽ tự chốt sau 15 phút.
    }
  };

  return (
    <div className={`contract-workspace contract-workspace--${tab}`}>
      <div className="contract-workspace__header">
        {tab === 'workflow' ? (
          <div className="contract-page-heading__title-row">
            {onBack && (
              <button
                type="button"
                className="contract-page-heading__back"
                onClick={async () => { if (await requestNavigationPermission()) onBack(); }}
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
            <ContractHeaderDetails contract={workspace?.contract} />
            {/* Thưởng ưu tiên — chỉ hiện khi có hạng mục đặt ưu tiên và người dùng
                quản được khoán (giám đốc). Bấm để phân bổ thưởng khi hoàn thành. */}
            {workspace?.service_lines?.some(sl => sl.priority && sl.priority !== 'NORMAL')
              && workspace?.capabilities?.manage_workflow_compensation === true && (
              <button type="button" className="btn btn-secondary btn-sm"
                style={{ marginLeft: 'auto', color: '#f59e0b', borderColor: '#f59e0b44' }}
                onClick={() => setBonusOpen(true)}>
                <Sparkles size={15} /> Thưởng ưu tiên
              </button>
            )}
          </div>
        ) : (
          <div>
            <span className="eyebrow">Không gian vận hành hợp đồng</span>
            <h2>{contractId}</h2>
          </div>
        )}
      </div>

      <PriorityBonusModal open={bonusOpen} contractId={contractId}
        onClose={() => setBonusOpen(false)} addToast={addToast}
        onDone={() => setRefreshKey(k => k + 1)} />

      {/* Chỉ che bằng spinner khi CHƯA có dữ liệu nào. Đã có workspace thì luôn hiển thị,
          không để một cờ loading kẹt lại làm mất trắng cả màn hình quy trình. */}
      {loading && !workspace ? (
        <div className="contract-workspace-loading"><LoaderCircle size={24} className="spin" /> Đang tải Hạng mục và workflow…</div>
      ) : error && !workspace ? (
        <WorkspaceEmpty icon={TriangleAlert} title="Không tải được dữ liệu" description={error} />
      ) : !workspace ? null : (
        <>
          {tab !== 'workflow' && <ContractSummary contract={workspace.contract} />}
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
                      onClick={async () => {
                        // Đổi hạng mục là thay cả sơ đồ đang mở — hỏi trước nếu
                        // hạng mục hiện tại còn thay đổi chưa lưu.
                        if (line.id === selectedServiceLineId) return;
                        if (await xinPhepRoiDi()) setSelectedServiceLineId(line.id);
                      }}
                    >
                      <span>{index + 1}</span>
                      <div>
                        {line.service_package && (
                          <span className={`service-line-pkg service-line-pkg--${line.service_package_id || 'other'}`}>
                            {line.service_package}
                          </span>
                        )}
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
                  contractId={getContractId(workspace.contract)}
                  catalog={workspace.workflow_catalog}
                  templates={workspace.workflow_templates}
                  employees={workspace.assignment_options}
                  workItems={workspace.work_item_catalog}
                  contractTotalValue={workspace.contract.total_value}
                  contractPaidAmount={workspace.contract.paid_amount}
                  contractDateSigned={workspace.contract.date_signed}
              capabilities={workspace.capabilities}
                  addToast={addToast}
                  onApproveDocument={(checklistResultId, doc) =>
                    reviewDocument(checklistResultId, doc, 'approved')}
                  onRejectDocument={(checklistResultId, doc, reason) =>
                    reviewDocument(checklistResultId, doc, 'rejected', reason)}
                  onFlushReviewBatch={flushReviewBatch}
                  onPersisted={() => {
                    workspaceMemoryCache.delete(contextKey);
                    setRefreshKey(current => current + 1);
                  }}
                  targetNodeKey={selectedServiceLine?.id === targetServiceLineId ? targetNodeKey : undefined}
                  targetTaskNodeId={selectedServiceLine?.id === targetServiceLineId ? targetTaskNodeId : undefined}
                  targetType={selectedServiceLine?.id === targetServiceLineId ? targetType : undefined}
                  targetId={selectedServiceLine?.id === targetServiceLineId ? targetId : undefined}
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
