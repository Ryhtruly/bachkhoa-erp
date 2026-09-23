import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmployeeHandoverModal from './EmployeeHandoverModal';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../../lib/api';

describe('EmployeeHandoverModal', () => {
  const mockEmployee = {
    id: 'emp-1',
    full_name: 'Nguyễn Văn A',
    department_name: 'Phòng Đo đạc',
  };

  const mockWorkload = {
    has_active_work: true,
    total_active_work: 3,
    active_nodes_count: 1,
    active_nodes: [
      {
        task_node_id: 'tn-1',
        node_code: 'K02',
        node_name: 'Đo đạc hiện trạng',
        contract_code: 'HĐ-2026-001',
        is_primary: true,
      },
    ],
    active_checklists_count: 1,
    active_checklists: [
      {
        checklist_result_id: 'ck-1',
        checklist_name: 'Biên bản hiện trạng',
        node_code: 'K02',
        contract_code: 'HĐ-2026-001',
      },
    ],
    active_leads_count: 1,
    active_leads: [
      {
        id: 'lead-1',
        customer_name: 'Trần Văn Khách',
        phone: '0901234567',
        status: 'Tiếp cận',
      },
    ],
  };

  const mockEmployees = [
    mockEmployee,
    { id: 'emp-2', full_name: 'Lê Văn B', department_name: 'Phòng Đo đạc', is_active: true },
    { id: 'emp-3', full_name: 'Phạm Thị C', department_name: 'Phòng Pháp lý', is_active: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders workload summary badges and details', () => {
    render(
      <ToastProvider>
        <EmployeeHandoverModal
          isOpen={true}
          onClose={vi.fn()}
          employee={mockEmployee}
          workload={mockWorkload}
          employees={mockEmployees}
        />
      </ToastProvider>
    );

    expect(screen.getByText(/Chuyển giao công việc · Nguyễn Văn A/)).toBeInTheDocument();
    expect(screen.getByText(/Nhân sự có 3 mục công việc dở dang cần xử lý:/)).toBeInTheDocument();
    expect(screen.getByText(/1 bước Hợp đồng/)).toBeInTheDocument();
    expect(screen.getByText(/1 checklist chưa nộp/)).toBeInTheDocument();
    expect(screen.getByText(/1 cơ hội CRM/)).toBeInTheDocument();
    expect(screen.getByText(/HĐ-2026-001/)).toBeInTheDocument();
  });

  it('allows choosing Task Pool mode and submitting', async () => {
    apiFetch.mockResolvedValueOnce({ status: 'success', message: 'Chuyển giao công việc thành công!' });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <ToastProvider>
        <EmployeeHandoverModal
          isOpen={true}
          onClose={onClose}
          employee={mockEmployee}
          workload={mockWorkload}
          employees={mockEmployees}
          onSuccess={onSuccess}
        />
      </ToastProvider>
    );

    // Switch to Task Pool mode
    const poolRadio = screen.getByLabelText(/Giải phóng về Bể việc chung/i);
    fireEvent.click(poolRadio);

    // Click confirm button
    const submitBtn = screen.getByRole('button', { name: /Xác nhận Chuyển giao/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/finance/employees/emp-1/handover',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            to_employee_id: null,
            mode: 'pool',
            handover_contracts: true,
            handover_crm: true,
            deactivate_after: false,
          }),
        })
      );
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

