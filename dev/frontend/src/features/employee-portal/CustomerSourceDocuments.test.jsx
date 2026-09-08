import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CustomerSourceDocuments from './CustomerSourceDocuments'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))

const CHECKLIST = [{
  id: 'CR-1',
  name: 'Kiểm tra hồ sơ đầu vào',
  template_names: {
    'T-CCCD': 'CCCD/CMND của người sử dụng đất',
    'T-SODO': 'Giấy chứng nhận quyền sử dụng đất',
  },
  output_documents: [
    { template_id: 'T-CCCD' },
    { template_id: 'T-SODO' },
  ],
  review_by_template: {},
}]

const SOURCE_RESPONSE = {
  status: 'success',
  data: [
    {
      id: 'D-RAW', file_name: 'cccd-khach-gui.jpg', content_type: 'image/jpeg',
      size_bytes: 2048, uploaded_at: '2026-09-01T08:00:00Z',
      doc_status: 'DANG_DUNG', uploaded_by_name: 'sale01', slots: [],
    },
    {
      id: 'D-CLASSIFIED', file_name: 'so-do-da-phan-loai.pdf', content_type: 'application/pdf',
      size_bytes: 4096, uploaded_at: '2026-09-01T08:05:00Z',
      doc_status: 'DANG_DUNG', uploaded_by_name: 'sale01',
      slots: [{ id: 'S-1', name: 'Giấy chứng nhận quyền sử dụng đất', scope: 'SERVICE_LINE', service_line_id: 'SL-1' }],
    },
  ],
  unclassified: 1,
}

const mount = (props = {}) => {
  apiFetch.mockImplementation(async (url) => {
    if (url.includes('/source-documents')) return SOURCE_RESPONSE
    throw new Error(`Unexpected request: ${url}`)
  })
  return render(
    <CustomerSourceDocuments
      contractId="HD-1"
      taskNodeId="TN-1"
      checklist={CHECKLIST}
      addToast={vi.fn()}
      {...props}
    />,
  )
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Kho giấy tờ khách gửi trong không gian nhân viên', () => {
  it('chỉ hiện tệp nguyên bản chưa phân loại, không hiện tệp đã gán hoặc nhóm nguồn khác', async () => {
    mount()

    expect(await screen.findByText('cccd-khach-gui.jpg')).toBeInTheDocument()
    expect(screen.queryByText('so-do-da-phan-loai.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText('Khách hàng cung cấp')).not.toBeInTheDocument()
    expect(screen.queryByText('Cơ quan soạn lập')).not.toBeInTheDocument()
    expect(screen.queryByText('Công ty nhà nước')).not.toBeInTheDocument()
  })

  it('báo trạng thái rỗng ngay khi API không còn giấy thô', async () => {
    const onEmptyChange = vi.fn()
    apiFetch.mockResolvedValueOnce({ status: 'success', data: [], unclassified: 0 })

    render(
      <CustomerSourceDocuments
        contractId="HD-1"
        taskNodeId="TN-1"
        checklist={CHECKLIST}
        onEmptyChange={onEmptyChange}
      />,
    )

    await screen.findByText('Không còn giấy nguyên bản nào chưa phân loại.')
    expect(onEmptyChange).toHaveBeenLastCalledWith(true)
  })

  it('đích phân loại chỉ lấy loại giấy sếp đã gắn trong checklist hiện tại', async () => {
    mount()
    const row = (await screen.findByText('cccd-khach-gui.jpg')).closest('li')
    fireEvent.click(within(row).getByRole('button', { name: 'Phân loại' }))

    const options = [...within(row).getByLabelText('Loại giấy trong checklist').options]
      .map(option => option.textContent)
    expect(options).toContain('Kiểm tra hồ sơ đầu vào · CCCD/CMND của người sử dụng đất')
    expect(options).toContain('Kiểm tra hồ sơ đầu vào · Giấy chứng nhận quyền sử dụng đất')
  })

  it('gán giấy thô bằng đúng checklist, template và document trong một request', async () => {
    const onChanged = vi.fn()
    mount({ onChanged })
    const row = (await screen.findByText('cccd-khach-gui.jpg')).closest('li')
    fireEvent.click(within(row).getByRole('button', { name: 'Phân loại' }))
    fireEvent.change(within(row).getByLabelText('Loại giấy trong checklist'), {
      target: { value: 'CR-1::T-CCCD' },
    })

    apiFetch.mockResolvedValueOnce({ status: 'success', data: {} })
    fireEvent.click(within(row).getByRole('button', { name: 'Gán' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      '/api/employee-portal/tasks/TN-1/checklist/CR-1/source-documents/D-RAW',
      {
        method: 'POST',
        body: JSON.stringify({ template_id: 'T-CCCD' }),
      },
    ))
    expect(onChanged).toHaveBeenCalled()
  })

  it('ưu tiên loại runtime, chỉ cho gán vào nhóm khách hàng và gửi document_type_id', async () => {
    const onChanged = vi.fn()
    const onEmptyChange = vi.fn()
    const runtimeChecklist = [{
      id: 'CR-1',
      name: 'Kiểm tra hồ sơ đầu vào',
      document_types: [
        {
          id: 'TYPE-CCCD', name: 'CCCD/CMND', source: 'KHACH_HANG',
          source_label: 'Khách hàng cung cấp', status: 'draft',
        },
        {
          id: 'TYPE-BANVE', name: 'Bản vẽ hiện trạng', source: 'CONG_TY',
          source_label: 'Công ty soạn', status: 'draft',
        },
        {
          id: 'TYPE-PHAPLY', name: 'Thông báo thuế', source: 'CO_QUAN',
          source_label: 'Pháp lý', status: 'draft',
        },
      ],
      output_documents: [{ template_id: 'LEGACY-HIDDEN' }],
    }]
    mount({ checklist: runtimeChecklist, onChanged, onEmptyChange })

    const row = (await screen.findByText('cccd-khach-gui.jpg')).closest('li')
    fireEvent.click(within(row).getByRole('button', { name: 'Phân loại' }))
    const select = within(row).getByLabelText('Loại giấy trong checklist')
    const labels = [...select.options].map(option => option.textContent)
    expect(labels).toContain('Kiểm tra hồ sơ đầu vào · CCCD/CMND')
    expect(labels.some(label => label.includes('Bản vẽ hiện trạng'))).toBe(false)
    expect(labels.some(label => label.includes('Thông báo thuế'))).toBe(false)
    expect(labels.some(label => label.includes('LEGACY-HIDDEN'))).toBe(false)

    fireEvent.change(select, { target: { value: 'CR-1::TYPE-CCCD' } })
    apiFetch.mockResolvedValueOnce({ status: 'success', data: {} })
    fireEvent.click(within(row).getByRole('button', { name: 'Gán' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      '/api/employee-portal/tasks/TN-1/checklist/CR-1/source-documents/D-RAW',
      {
        method: 'POST',
        body: JSON.stringify({ document_type_id: 'TYPE-CCCD' }),
      },
    ))
    expect(onChanged).toHaveBeenCalled()
    expect(onEmptyChange).toHaveBeenLastCalledWith(true)
  })
})
