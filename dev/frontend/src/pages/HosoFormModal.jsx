import React, { useEffect, useMemo, useState } from 'react';
import { Modal, FormRow, FormGrid } from '../components/ui';

export default function HosoFormModal({
  isOpen,
  onClose,
  initialData,
  onSubmit,
  assignmentOptions,
  departmentOptions,
  contractsList,
  taskTypes,
  loading
}) {
  const isEdit = !!initialData;
  const [formData, setFormData] = useState({
    contract_id: '',
    service_package_id: '',
    task_type_id: '',
    department_id: '',
    priority: 'Trung bình',
    assignee_id: '',
    support_id: '',
    deadline: '',
    start_date: '',
    ward: '',
    stake_count: '',
    stake_type: '',
    status: 'Mới tiếp nhận',
    review_note: ''
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        const initialTaskType = taskTypes.find(tt => tt.id === initialData['Hạng mục ID']);
        setFormData({
          contract_id: initialData['Mã hợp đồng'] || '',
          service_package_id: initialData['Service Package ID'] || initialTaskType?.service_package_id || '',
          task_type_id: initialData['Hạng mục ID'] || '',
          department_id: initialData['Phòng ban ID'] || '',
          priority: initialData['Ưu tiên'] || 'Trung bình',
          assignee_id: initialData['Phụ trách chính ID'] || '',
          support_id: initialData['Phụ đo ID'] || '',
          deadline: initialData['Deadline'] || '',
          start_date: initialData['Ngày giao'] || '',
          ward: initialData['Khu vực/Phường'] || '',
          stake_count: initialData['Số cọc'] || '',
          stake_type: initialData['Loại cọc'] || '',
          status: initialData['Trạng thái'] || 'Mới tiếp nhận',
          review_note: initialData['Ghi chú'] || ''
        });
      } else {
        setFormData({
          contract_id: '',
          service_package_id: '',
          task_type_id: '',
          department_id: '',
          priority: 'Trung bình',
          assignee_id: '',
          support_id: '',
          deadline: '',
          start_date: '',
          ward: '',
          stake_count: '',
          stake_type: '',
          status: 'Mới tiếp nhận',
          review_note: ''
        });
      }
    }
  }, [isOpen, initialData, taskTypes]);

  const packageOptions = useMemo(() => {
    const packages = new Map();
    taskTypes.forEach(tt => {
      if (tt.service_package_id) {
        packages.set(tt.service_package_id, {
          id: tt.service_package_id,
          name: tt.service_package_name || tt.service_package_id
        });
      }
    });
    return Array.from(packages.values());
  }, [taskTypes]);

  const selectedPackage = useMemo(
    () => packageOptions.find(pkg => pkg.id === formData.service_package_id),
    [packageOptions, formData.service_package_id]
  );

  const packageTaskTypes = useMemo(
    () => taskTypes.filter(tt => tt.service_package_id === formData.service_package_id),
    [taskTypes, formData.service_package_id]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'contract_id' && value !== formData.contract_id) {
      const contract = contractsList.find(c => c.id === value);
      setFormData(prev => ({
        ...prev,
        contract_id: value,
        service_package_id: contract?.service_package_id || '',
        task_type_id: ''
      }));
    } else if (name === 'service_package_id' && value !== formData.service_package_id) {
      setFormData(prev => ({ ...prev, service_package_id: value, task_type_id: '' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      task_name: taskTypes.find(tt => tt.id === formData.task_type_id)?.name || '',
      stake_count: formData.stake_count ? parseInt(formData.stake_count, 10) : null,
      assignee_id: formData.assignee_id || null,
      support_id: formData.support_id || null,
      department_id: formData.department_id || null,
      deadline: formData.deadline || null,
      start_date: formData.start_date || null,
      ward: formData.ward || null,
      review_note: formData.review_note || null
    };
    onSubmit(payload);
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={isEdit ? `Chi tiết Hồ sơ${selectedPackage ? ` - ${selectedPackage.name}` : ''}` : 'Tạo Hồ sơ mới'}
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
          <FormRow label="Hợp đồng" required>
            <select
              className="form-control"
              name="contract_id"
              value={formData.contract_id}
              onChange={handleChange}
              required
              disabled={isEdit}
            >
              <option value="">-- Chọn Hợp đồng --</option>
              {contractsList.map(c => (
                <option key={c.id} value={c.id}>{c.id} - {c.customer_name} ({c.service_type})</option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Gói dịch vụ" required>
            <select
              className="form-control"
              name="service_package_id"
              value={formData.service_package_id}
              onChange={handleChange}
              required
            >
              <option value="">-- Chọn Gói dịch vụ --</option>
              {packageOptions.map(pkg => (
                <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Hạng mục" required>
            <select
              className="form-control"
              name="task_type_id"
              value={formData.task_type_id}
              onChange={handleChange}
              required
              disabled={!formData.service_package_id}
            >
              <option value="">-- Chọn Hạng mục --</option>
              {packageTaskTypes.map(tt => (
                <option key={tt.id} value={tt.id}>{tt.name}</option>
              ))}
            </select>
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

          <FormRow label="Ưu tiên">
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

          <FormRow label="Phụ trách chính">
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

          <FormRow label="Ngày giao">
            <input
              type="date"
              className="form-control"
              name="start_date"
              value={formData.start_date}
              onChange={handleChange}
            />
          </FormRow>

          <FormRow label="Hạn xử lý">
            <input
              type="date"
              className="form-control"
              name="deadline"
              value={formData.deadline}
              onChange={handleChange}
            />
          </FormRow>

          <FormRow label="Khu vực/Phường">
            <input
              type="text"
              className="form-control"
              name="ward"
              value={formData.ward}
              onChange={handleChange}
              placeholder="VD: Phường Bến Nghé, Quận 1..."
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

          <FormRow label="Ghi chú">
            <textarea
              className="form-control"
              name="review_note"
              value={formData.review_note}
              onChange={handleChange}
              rows={3}
              placeholder="Nhập ghi chú..."
            />
          </FormRow>
        </FormGrid>
      </form>
    </Modal>
  );
}
