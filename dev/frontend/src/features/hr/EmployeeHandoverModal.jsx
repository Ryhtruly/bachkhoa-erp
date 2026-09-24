import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  Lock,
  UserCheck,
  Users,
} from 'lucide-react';
import { Badge, CustomSelect, Modal } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import './EmployeeHandoverModal.css';

export default function EmployeeHandoverModal({
  isOpen,
  onClose,
  employee,
  workload,
  employees = [],
  onSuccess,
  defaultDeactivate = false,
}) {
  const { addToast } = useToast();
  const [mode, setMode] = useState('reassign'); // 'reassign' | 'pool' | 'keep'
  const [toEmployeeId, setToEmployeeId] = useState('');
  const [handoverContracts, setHandoverContracts] = useState(true);
  const [handoverCrm, setHandoverCrm] = useState(true);
  const [deactivateAfter, setDeactivateAfter] = useState(defaultDeactivate);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filter available candidate employees to receive handover
  const candidateOptions = useMemo(() => {
    return employees
      .filter((emp) => emp.id !== employee?.id && emp.is_active !== false)
      .map((emp) => ({
        value: emp.id,
        label: `${emp.full_name}${emp.department_name ? ` (${emp.department_name})` : ''}`,
      }));
  }, [employees, employee]);

  const totalWork = workload?.total_active_work ?? 0;
  const activeNodes = workload?.active_nodes || [];
  const activeChecklists = workload?.active_checklists || [];
  const activeLeads = workload?.active_leads || [];

  // Group active nodes by contract_code
  const groupedContracts = useMemo(() => {
    const map = new Map();
    for (const node of activeNodes) {
      const code = node.contract_code || 'Chưa gắn mã HĐ';
      if (!map.has(code)) {
        map.set(code, []);
      }
      map.get(code).push(node);
    }
    return Array.from(map.entries()).map(([contractCode, nodes]) => ({
      contractCode,
      nodes,
    }));
  }, [activeNodes]);

  if (!isOpen || !employee) return null;

  const handleConfirm = async () => {
    if (mode === 'reassign' && !toEmployeeId) {
      addToast('Vui lòng chọn nhân sự tiếp nhận bàn giao.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        to_employee_id: mode === 'reassign' ? toEmployeeId : null,
        mode,
        handover_contracts: handoverContracts,
        handover_crm: handoverCrm,
        deactivate_after: deactivateAfter,
        reason: reason.trim() || undefined,
      };

      const result = await apiFetch(`/api/finance/employees/${employee.id}/handover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      addToast(result.message || 'Chuyển giao công việc thành công!', 'success');
      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err) {
      addToast(err.message || 'Không thể thực hiện chuyển giao công việc', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      size="lg"
      onClose={submitting ? undefined : onClose}
      title={
        <div className="handover-header">
          <span className="handover-header__icon-box">
            <ArrowRightLeft size={18} />
          </span>
          <div>
            <div className="handover-header__title">
              Chuyển giao công việc · {employee.full_name}
            </div>
            {employee.department_name && (
              <div className="handover-header__subtitle">{employee.department_name}</div>
            )}
          </div>
        </div>
      }
    >
      <div className="handover-modal" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Workload Summary Banner */}
        <div className={`handover-banner ${totalWork > 0 ? 'handover-banner--active' : ''}`}>
          <div className="handover-banner__hd">
            {totalWork > 0 ? (
              <AlertTriangle size={17} style={{ color: 'var(--orange-600, #ea580c)', flexShrink: 0 }} />
            ) : (
              <CheckCircle2 size={17} style={{ color: 'var(--green-600, #16a34a)', flexShrink: 0 }} />
            )}
            <strong style={{ fontSize: 13.5, fontWeight: 600 }}>
              {totalWork > 0
                ? `Nhân sự có ${totalWork} mục công việc dở dang cần xử lý:`
                : 'Nhân sự không có công việc dở dang nào.'}
            </strong>
          </div>
          <div className="handover-banner__pills">
            <Badge variant={activeNodes.length > 0 ? 'warning' : 'neutral'}>
              <Layers size={13} style={{ marginRight: 4 }} />
              {activeNodes.length} bước Hợp đồng
            </Badge>
            <Badge variant={activeChecklists.length > 0 ? 'warning' : 'neutral'}>
              <FileText size={13} style={{ marginRight: 4 }} />
              {activeChecklists.length} checklist chưa nộp
            </Badge>
            <Badge variant={activeLeads.length > 0 ? 'warning' : 'neutral'}>
              <Users size={13} style={{ marginRight: 4 }} />
              {activeLeads.length} cơ hội CRM
            </Badge>
          </div>

          {activeNodes.length > 0 && (
            <div className="handover-grouped-contracts">
              {groupedContracts.map(({ contractCode, nodes }) => (
                <div key={contractCode} className="handover-contract-block">
                  <div className="handover-contract-block__hd">
                    <div className="handover-contract-block__title">
                      <span>{contractCode}</span>
                    </div>
                    <span className="handover-contract-block__badge">
                      {nodes.length} bước
                    </span>
                  </div>
                  <div className="handover-contract-block__steps">
                    {nodes.map((node, idx) => (
                      <div key={node.task_node_id || idx} className="handover-step-row">
                        <div className="handover-step-info">
                          {node.node_code && (
                            <span className="handover-step-code">{node.node_code}</span>
                          )}
                          <span className="handover-step-name" title={node.node_name}>
                            {node.node_name}
                          </span>
                        </div>
                        <span
                          className={`handover-step-role ${
                            node.is_primary ? 'is-primary' : 'is-secondary'
                          }`}
                        >
                          {node.is_primary ? 'Chính' : 'Phụ'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Handover Mode Selection */}
        {/* Handover Mode Selection (Tinh gọn, dứt khoát, không văn phong AI) */}
        <div>
          <div className="handover-label">
            <span>Phương án xử lý công việc:</span>
          </div>

          <div className="handover-options">
            {/* Mode 1: Reassign to other */}
            <div className={`handover-card ${mode === 'reassign' ? 'is-selected' : ''}`}>
              <label className="handover-card__head">
                <input
                  type="radio"
                  name="handover_mode"
                  value="reassign"
                  checked={mode === 'reassign'}
                  onChange={() => setMode('reassign')}
                  className="handover-card__input"
                />
                <span className="handover-card__icon">
                  <UserCheck size={17} />
                </span>
                <div className="handover-card__body">
                  <div className="handover-card__title">Bàn giao cho nhân sự khác</div>
                  <div className="handover-card__desc">
                    Chuyển giao toàn bộ các bước Hợp đồng, checklist và khách hàng CRM cho người nhận mới.
                  </div>
                </div>
              </label>

              {mode === 'reassign' && (
                <div className="handover-assignee-section">
                  <label className="handover-field-label">
                    Chọn nhân sự tiếp nhận: <span style={{ color: 'var(--red-500)' }}>*</span>
                  </label>
                  <CustomSelect
                    value={toEmployeeId}
                    onChange={setToEmployeeId}
                    options={candidateOptions}
                    placeholder="— Chọn nhân sự thay thế —"
                    searchable
                    searchPlaceholder="Gõ tên nhân sự..."
                  />
                  {activeLeads.length > 0 && (
                    <label className="handover-crm-checkbox">
                      <input
                        type="checkbox"
                        checked={handoverCrm}
                        onChange={(e) => setHandoverCrm(e.target.checked)}
                        style={{ accentColor: 'var(--orange-500)' }}
                      />
                      <span>Bàn giao cả khách hàng CRM ({activeLeads.length})</span>
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* Mode 2: Task Pool */}
            <div className={`handover-card ${mode === 'pool' ? 'is-selected' : ''}`}>
              <label className="handover-card__head">
                <input
                  type="radio"
                  name="handover_mode"
                  value="pool"
                  checked={mode === 'pool'}
                  onChange={() => setMode('pool')}
                  className="handover-card__input"
                />
                <span className="handover-card__icon">
                  <Layers size={17} />
                </span>
                <div className="handover-card__body">
                  <div className="handover-card__title">Giải phóng về Bể việc chung (Task Pool)</div>
                  <div className="handover-card__desc">
                    Nhả lại các bước Hợp đồng lên Bể việc để các nhân viên đủ năng lực tự vào nhận làm thay.
                  </div>
                </div>
              </label>
            </div>

            {/* Mode 3: Keep & reassign later */}
            <div className={`handover-card ${mode === 'keep' ? 'is-selected' : ''}`}>
              <label className="handover-card__head">
                <input
                  type="radio"
                  name="handover_mode"
                  value="keep"
                  checked={mode === 'keep'}
                  onChange={() => setMode('keep')}
                  className="handover-card__input"
                />
                <span className="handover-card__icon">
                  <Clock size={17} />
                </span>
                <div className="handover-card__body">
                  <div className="handover-card__title">Giữ nguyên & phân công lại sau</div>
                  <div className="handover-card__desc">
                    Công việc vẫn tạm gắn với nhân sự này, Giám đốc/Trưởng phòng sẽ phân bổ tay lại sau.
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Lock Account Option */}
        <label className={`handover-deactivate ${deactivateAfter ? 'is-checked' : ''}`}>
          <input
            type="checkbox"
            checked={deactivateAfter}
            onChange={(e) => setDeactivateAfter(e.target.checked)}
            className="handover-deactivate__checkbox"
          />
          <div className="handover-deactivate__content">
            <Lock size={15} style={{ color: deactivateAfter ? 'var(--red-600, #dc2626)' : 'var(--text-tertiary)' }} />
            <span>Khóa tài khoản nhân sự sau khi bàn giao</span>
          </div>
        </label>

        {/* Reason / Note */}
        <div>
          <label className="handover-field-label">Ghi chú bàn giao (không bắt buộc)</label>
          <textarea
            className="handover-textarea"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do hoặc ghi chú nếu có..."
          />
        </div>

        {/* Footer buttons */}
        <div className="handover-foot">
          <button
            type="button"
            className="handover-btn-cancel"
            disabled={submitting}
            onClick={onClose}
          >
            Hủy
          </button>
          <button
            type="button"
            className={`handover-btn-submit ${deactivateAfter ? 'is-danger' : ''}`}
            disabled={submitting || (mode === 'reassign' && !toEmployeeId)}
            onClick={handleConfirm}
          >
            {submitting ? 'Đang xử lý...' : 'Xác nhận Chuyển giao'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
