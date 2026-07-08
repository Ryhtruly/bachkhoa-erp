import React, { useEffect, useState } from 'react';
import { Modal, FormRow, FormGrid } from '../components/ui';

export default function HosoFormModal({
  isOpen,
  onClose,
  initialData,
  onSubmit,
  assignmentOptions,
  departmentOptions,
  contractsList,
  loading
}) {
  const isEdit = !!initialData;
  const [formData, setFormData] = useState({
    contract_id: '',
    task_name: '',
    department_id: '',
    priority: 'Trung bình',
    assignee_id: '',
    support_id: '',
    deadline: '',
    stake_count: '',
    stake_type: '',
    status: 'Mới tiếp nhận'
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          contract_id: initialData['Mã hợp đồng'] || '',
          task_name: initialData['Loại dịch vụ'] || '',
          department_id: initialData['Phòng ban ID'] || '',
          priority: initialData['Ưu tiên'] || 'Trung bình',
          assignee_id: initialData['Phụ trách chính ID'] || '',
          support_id: initialData['Phụ đo ID'] || '',
          deadline: initialData['Deadline'] || '',
          stake_count: initialData['Số cọc'] || '',
          stake_type: initialData['Loại cọc'] || '',
          status: initialData['Trạng thái'] || 'Mới tiếp nhận'
        });
      } else {
        setFormData({
          contract_id: '',
          task_name: '',
          department_id: '',
          priority: 'Trung bình',
          assignee_id: '',
          support_id: '',
          deadline: '',
          stake_count: '',
          stake_type: '',
          status: 'Mới tiếp nhận'
        });
      }
    }
  }, [isOpen, initialData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      stake_count: formData.stake_count ? parseInt(formData.stake_count, 10) : null,
      assignee_id: formData.assignee_id || null,
      support_id: formData.support_id || null,
      department_id: formData.department_id || null,
      deadline: formData.deadline || null
    };
    onSubmit(payload);
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={isEdit ? 'Chỉnh sửa Hồ sơ đo vẽ' : 'Tạo Hồ sơ mới'}
      footer={
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Hủy
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Đang lưu...' : 'Lưu Hồ sơ'}
          </button>
        </div>
      }
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <FormGrid>
          <FormRow label="Hợp đồng liên kết" required>
            <select
              className="form-control"
              name="contract_id"
              value={formData.contract_id}
              onChange={handleChange}
              required
              disabled={isEdit} // Thường mã HĐ ít khi thay đổi sau khi tạo
            >
              <option value="">-- Chọn Hợp đồng --</option>
              {contractsList.map(c => (
                <option key={c.id} value={c.id}>{c.id} - {c.customer_name} ({c.service_type})</option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Công việc / Dịch vụ" required>
            <input
              type="text"
              className="form-control"
              name="task_name"
              value={formData.task_name}
              onChange={handleChange}
              placeholder="VD: Cắm mốc, Đo hiện trạng..."
              required
            />
          </FormRow>

          <FormRow label="Phòng ban">
            <select
              className="form-control"
              name="department_id"
              value={formData.department_id}
              onChange={handleChange}
            >
              <option value="">Chưa phân phòng</option>
              {departmentOptions.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Độ ưu tiên">
            <select
              className="form-control"
              name="priority"
              value={formData.priority}
              onChange={handleChange}
            >
              <option value="Cao">Cao</option>
              <option value="Trung bình">Trung bình</option>
              <option value="Thấp">Thấp</option>
            </select>
          </FormRow>

          <FormRow label="Người phụ trách chính">
            <select
              className="form-control"
              name="assignee_id"
              value={formData.assignee_id}
              onChange={handleChange}
            >
              <option value="">Chưa phân công</option>
              {assignmentOptions.map(a => (
                <option key={a.user_id} value={a.user_id}>{a.full_name} ({a.department})</option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Phụ đo">
            <select
              className="form-control"
              name="support_id"
              value={formData.support_id}
              onChange={handleChange}
            >
              <option value="">Không cần phụ đo</option>
              {assignmentOptions.map(a => (
                <option key={a.user_id} value={a.user_id}>{a.full_name} ({a.department})</option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Hạn xử lý (Deadline)">
            <input
              type="date"
              className="form-control"
              name="deadline"
              value={formData.deadline}
              onChange={handleChange}
            />
          </FormRow>
          
          <FormRow label="Trạng thái">
            <select
              className="form-control"
              name="status"
              value={formData.status}
              onChange={handleChange}
            >
              <option value="Mới tiếp nhận">Mới tiếp nhận</option>
              <option value="Chờ khảo sát">Chờ khảo sát</option>
              <option value="Đang đo đạc">Đang đo đạc</option>
              <option value="Đang xử lý nội nghiệp">Đang xử lý nội nghiệp</option>
              <option value="Nộp thành công - Chờ kết quả">Nộp thành công - Chờ kết quả</option>
              <option value="Hoàn thành">Hoàn thành</option>
              <option value="Hủy">Hủy</option>
            </select>
          </FormRow>

          <FormRow label="Số cọc">
            <input
              type="number"
              className="form-control"
              name="stake_count"
              value={formData.stake_count}
              onChange={handleChange}
              min="0"
              placeholder="0"
            />
          </FormRow>

          <FormRow label="Loại cọc">
            <select
              className="form-control"
              name="stake_type"
              value={formData.stake_type}
              onChange={handleChange}
            >
              <option value="">Không phát sinh</option>
              <option value="Cọc ranh">Cọc ranh</option>
              <option value="Cọc sơn">Cọc sơn</option>
              <option value="Cọc tiêu">Cọc tiêu</option>
            </select>
          </FormRow>
        </FormGrid>
      </form>
    </Modal>
  );
}
