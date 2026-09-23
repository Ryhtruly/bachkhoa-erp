import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle,
  FileText,
  Layers,
  Users,
  X,
} from 'lucide-react';
import { Badge, CustomSelect, Modal } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

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

  if (!isOpen || !employee) return null;

  const totalWork = workload?.total_active_work ?? 0;
  const activeNodes = workload?.active_nodes || [];
  const activeChecklists = workload?.active_checklists || [];
  const activeLeads = workload?.active_leads || [];

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
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ArrowRightLeft size={20} style={{ color: 'var(--orange-500, #ea580c)' }} />
          Chuyển giao công việc · {employee.full_name}
        </span>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Workload Summary Alert */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: totalWork > 0 ? 'var(--orange-50, #fff7ed)' : 'var(--bg-muted, #f8fafc)',
            border: `1px solid ${totalWork > 0 ? 'var(--orange-200, #fed7aa)' : 'var(--border-subtle, #e2e8f0)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle
              size={18}
              style={{ color: totalWork > 0 ? 'var(--orange-600, #ea580c)' : 'var(--text-muted)' }}
            />
            <strong style={{ fontSize: 14 }}>
              {totalWork > 0
                ? `Nhân sự có ${totalWork} mục công việc dở dang cần xử lý:`
                : 'Nhân sự không có công việc dở dang nào.'}
            </strong>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 13 }}>
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
            <div
              style={{
                marginTop: 10,
                maxHeight: 110,
                overflowY: 'auto',
                fontSize: 12,
                color: 'var(--text-secondary, #475569)',
                borderTop: '1px solid var(--border-subtle, #e2e8f0)',
                paddingTop: 8,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Các bước Hợp đồng đang phụ trách:</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {activeNodes.slice(0, 5).map((node, idx) => (
                  <li key={node.task_node_id || idx}>
                    <strong>{node.contract_code}</strong>: {node.node_name} ({node.node_code}) — vai trò{' '}
                    {node.is_primary ? 'Chính' : 'Phụ'}
                  </li>
                ))}
                {activeNodes.length > 5 && <li>...và {activeNodes.length - 5} bước khác</li>}
              </ul>
            </div>
          )}
        </div>

        {/* Handover Mode Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>Phương án xử lý công việc:</label>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: 10,
              borderRadius: 6,
              border: `1px solid ${mode === 'reassign' ? 'var(--orange-500, #ea580c)' : 'var(--border-subtle, #e2e8f0)'}`,
              background: mode === 'reassign' ? 'var(--orange-50, #fff7ed)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="handover_mode"
              value="reassign"
              checked={mode === 'reassign'}
              onChange={() => setMode('reassign')}
              style={{ marginTop: 3 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                Bàn giao cho nhân sự khác
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>
                Chuyển giao toàn bộ các bước Hợp đồng, checklist và khách hàng CRM cho người nhận mới.
              </div>
            </div>
          </label>

          {mode === 'reassign' && (
            <div style={{ paddingLeft: 24, marginTop: -4 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
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
            </div>
          )}

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: 10,
              borderRadius: 6,
              border: `1px solid ${mode === 'pool' ? 'var(--orange-500, #ea580c)' : 'var(--border-subtle, #e2e8f0)'}`,
              background: mode === 'pool' ? 'var(--orange-50, #fff7ed)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="handover_mode"
              value="pool"
              checked={mode === 'pool'}
              onChange={() => setMode('pool')}
              style={{ marginTop: 3 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                Giải phóng về Bể việc chung (Task Pool)
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>
                Nhả lại các bước Hợp đồng lên Bể việc để các nhân viên đủ năng lực tự vào nhận làm thay.
              </div>
            </div>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: 10,
              borderRadius: 6,
              border: `1px solid ${mode === 'keep' ? 'var(--orange-500, #ea580c)' : 'var(--border-subtle, #e2e8f0)'}`,
              background: mode === 'keep' ? 'var(--orange-50, #fff7ed)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="handover_mode"
              value="keep"
              checked={mode === 'keep'}
              onChange={() => setMode('keep')}
              style={{ marginTop: 3 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                Giữ nguyên & phân công lại sau
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>
                Công việc vẫn tạm gắn với nhân sự này, Giám đốc/Trưởng phòng sẽ phân bổ tay lại sau.
              </div>
            </div>
          </label>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          {activeLeads.length > 0 && mode === 'reassign' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={handoverCrm}
                onChange={(e) => setHandoverCrm(e.target.checked)}
              />
              Bàn giao cả {activeLeads.length} cơ hội / khách hàng CRM cho người nhận mới
            </label>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={deactivateAfter}
              onChange={(e) => setDeactivateAfter(e.target.checked)}
            />
            Đồng thời khóa tài khoản & chuyển trạng thái Ngừng hoạt động cho nhân sự này
          </label>
        </div>

        {/* Reason / Note */}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            Lý do / Ghi chú bàn giao:
          </label>
          <textarea
            className="form-control"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="VD: Nghỉ thai sản 6 tháng, chuyển công tác, bàn giao việc trước khi thôi việc..."
            style={{ width: '100%', fontSize: 13 }}
          />
        </div>

        {/* Footer buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={submitting}
            onClick={onClose}
          >
            Hủy
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || (mode === 'reassign' && !toEmployeeId)}
            onClick={handleConfirm}
            style={{
              background: deactivateAfter ? 'var(--red-600, #dc2626)' : 'var(--orange-500, #ea580c)',
              borderColor: deactivateAfter ? 'var(--red-600, #dc2626)' : 'var(--orange-500, #ea580c)',
            }}
          >
            {submitting ? 'Đang xử lý...' : 'Xác nhận Chuyển giao'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
