import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import ChecklistDocumentTypePicker from './ChecklistDocumentTypePicker'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))

const SUGGESTIONS = {
  data: [
    {
      template_id: 'TPL-CCCD',
      name: 'CCCD/CMND',
      source: 'KHACH_HANG',
      source_label: 'Khách hàng cung cấp',
    },
    {
      template_id: 'TPL-BANVE',
      name: 'Bản vẽ hiện trạng',
      source: 'CONG_TY',
      source_label: 'Công ty soạn',
    },
  ],
  context: {
    service_package_name: 'Gói tách thửa',
    task_type_name: 'Đo vẽ hiện trạng',
    node_code: 'K02',
  },
}

const mount = (props = {}) => render(
  <ChecklistDocumentTypePicker
    taskNodeId="TN-1"
    checklistResultId="CR-1"
    onAdded={vi.fn()}
    onClose={vi.fn()}
    addToast={vi.fn()}
    {...props}
  />,
)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Thêm loại giấy ngay trong checklist', () => {
  it('chỉ tải gợi ý khi panel được mount, tìm kiếm và khóa nguồn của mẫu CCCD', async () => {
    apiFetch.mockResolvedValueOnce(SUGGESTIONS)
    mount()

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/employee-portal/tasks/TN-1/checklist/CR-1/document-type-suggestions',
    )
    expect(await screen.findByText('CCCD/CMND')).toBeInTheDocument()
    expect(screen.getByText('Gói tách thửa · Đo vẽ hiện trạng · K02')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Loại giấy' }), {
      target: { value: 'CCCD' },
    })
    expect(screen.getByRole('option', { name: /CCCD\/CMND/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Bản vẽ hiện trạng/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('option', { name: /CCCD\/CMND/ }))
    expect(screen.getByLabelText('Nhóm')).toHaveValue('KHACH_HANG')
    expect(screen.getByLabelText('Nhóm')).toBeDisabled()
    expect(screen.queryByText('Gửi duyệt')).not.toBeInTheDocument()
  })

  it('không thấy gợi ý thì cho tạo mới với đúng ba nhóm nguồn', async () => {
    apiFetch.mockResolvedValueOnce(SUGGESTIONS)
    mount()

    await screen.findByText('CCCD/CMND')
    fireEvent.click(screen.getByRole('option', { name: 'Không thấy loại giấy — Tạo mới' }))

    const source = screen.getByLabelText('Nhóm')
    expect(source).not.toBeDisabled()
    expect([...source.options].map(option => option.textContent)).toEqual([
      'Khách hàng cung cấp',
      'Công ty soạn',
      'Pháp lý',
    ])
    expect(screen.getByLabelText('Tên loại giấy')).toBeInTheDocument()
  })

  it('chọn gợi ý gửi duy nhất template_id rồi upload nhiều file trong một request', async () => {
    const onAdded = vi.fn()
    apiFetch
      .mockResolvedValueOnce(SUGGESTIONS)
      .mockResolvedValueOnce({ status: 'success', data: { id: 'TYPE-1' } })
      .mockResolvedValueOnce({ status: 'success', data: [] })
    mount({ onAdded })

    fireEvent.click(await screen.findByRole('option', { name: /CCCD\/CMND/ }))
    const first = new File(['front'], 'cccd-truoc.jpg', { type: 'image/jpeg' })
    const second = new File(['back'], 'cccd-sau.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Chọn file hoặc ảnh'), {
      target: { files: [first, second] },
    })

    const selected = screen.getByRole('list', { name: 'Tệp đã chọn' })
    expect(within(selected).getByText('cccd-truoc.jpg')).toBeInTheDocument()
    expect(within(selected).getByText('cccd-sau.jpg')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào checklist' }))

    await waitFor(() => expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/api/employee-portal/tasks/TN-1/checklist/CR-1/document-types',
      { method: 'POST', body: JSON.stringify({ template_id: 'TPL-CCCD' }) },
    ))
    const uploadCall = apiFetch.mock.calls[2]
    expect(uploadCall[0]).toBe(
      '/api/employee-portal/tasks/TN-1/checklist/CR-1/document-types/TYPE-1/files',
    )
    expect(uploadCall[1]).toEqual(expect.objectContaining({ method: 'POST', body: expect.any(FormData) }))
    expect(uploadCall[1].body.getAll('files')).toEqual([first, second])
    expect(onAdded).toHaveBeenCalled()
  })

  it('tạo mới gửi tên và mã nguồn, không gửi khóa combo từ client', async () => {
    apiFetch
      .mockResolvedValueOnce(SUGGESTIONS)
      .mockResolvedValueOnce({ status: 'success', data: { id: 'TYPE-NEW' } })
    mount()

    await screen.findByText('CCCD/CMND')
    fireEvent.click(screen.getByRole('option', { name: 'Không thấy loại giấy — Tạo mới' }))
    fireEvent.change(screen.getByLabelText('Tên loại giấy'), { target: { value: 'Ảnh vị trí mốc phụ' } })
    fireEvent.change(screen.getByLabelText('Nhóm'), { target: { value: 'CO_QUAN' } })
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào checklist' }))

    await waitFor(() => expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/api/employee-portal/tasks/TN-1/checklist/CR-1/document-types',
      {
        method: 'POST',
        body: JSON.stringify({ name: 'Ảnh vị trí mốc phụ', source: 'CO_QUAN' }),
      },
    ))
  })
})
