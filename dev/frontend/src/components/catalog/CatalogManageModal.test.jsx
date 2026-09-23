import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import CatalogManageModal from './CatalogManageModal'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
}))

describe('CatalogManageModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders package create mode and calls API on submit', async () => {
    apiFetch.mockResolvedValueOnce({ data: { id: 'sp_new', name: 'Gói Mới' } })
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const addToast = vi.fn()

    render(
      <CatalogManageModal
        open={true}
        targetType="PACKAGE"
        mode="create"
        onClose={onClose}
        onSuccess={onSuccess}
        addToast={addToast}
      />
    )

    expect(screen.getByText('Thêm mới Gói Dịch Vụ')).toBeInTheDocument()
    const nameInput = screen.getByPlaceholderText(/Đo đạc & Cắm mốc/i)
    fireEvent.change(nameInput, { target: { value: 'Gói Đo Đạc Thửa Đất' } })

    // Bấm chọn màu xanh ngọc
    const colorBtn = screen.getByTitle('Xanh ngọc')
    fireEvent.click(colorBtn)

    const submitBtn = screen.getByRole('button', { name: /Thêm mới/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/catalog/service-packages', expect.objectContaining({
        method: 'POST',
      }))
      expect(addToast).toHaveBeenCalledWith('Thêm mới gói dịch vụ thành công!', 'success')
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('renders task_type edit mode and supports soft-delete confirmation', async () => {
    apiFetch.mockResolvedValueOnce({ data: { id: 'tt_123', deleted: true } })
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    const addToast = vi.fn()

    const item = {
      id: 'tt_123',
      name: 'Trích lục thửa đất',
      code: 'TRICH_LUC',
      color: '#10b981',
      display_order: 10,
      is_active: true,
    }

    render(
      <CatalogManageModal
        open={true}
        targetType="TASK_TYPE"
        mode="edit"
        item={item}
        parentPackageId="sp_001"
        onClose={onClose}
        onSuccess={onSuccess}
        addToast={addToast}
      />
    )

    expect(screen.getByText(/Chỉnh sửa Hạng Mục: Trích lục thửa đất/i)).toBeInTheDocument()

    // Bấm nút xoá
    const deleteBtn = screen.getByRole('button', { name: /Xoá mục/i })
    fireEvent.click(deleteBtn)

    // Xác nhận trong ConfirmationModal
    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận xoá' })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/catalog/task-types/tt_123', { method: 'DELETE' })
      expect(addToast).toHaveBeenCalledWith('Đã ẩn/xóa hạng mục công việc.', 'success')
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('renders with catalog-modal class, excludes Nhóm nghiệp vụ, and allows selecting Gói dịch vụ via CustomSelect', async () => {
    const packages = [
      { id: 'sp_1', name: 'Gói Đo Đạc' },
      { id: 'sp_2', name: 'Gói Pháp Lý' },
    ]

    render(
      <CatalogManageModal
        open={true}
        targetType="TASK_TYPE"
        mode="create"
        packageList={packages}
      />
    )

    const modalEl = document.querySelector('.catalog-modal')
    expect(modalEl).toBeInTheDocument()

    // Khẳng định không còn trường "Nhóm nghiệp vụ" gây thừa thãi
    expect(screen.queryByText('Nhóm nghiệp vụ')).not.toBeInTheDocument()

    // Tìm trigger của CustomSelect "Thuộc Gói dịch vụ"
    const selectTrigger = modalEl.querySelector('.custom-select-trigger')
    expect(selectTrigger).toBeInTheDocument()
    expect(selectTrigger).toHaveTextContent('Gói Đo Đạc')

    // Bấm mở dropdown
    fireEvent.click(selectTrigger)

    // Kiểm tra danh sách dropdown sổ xuống
    const menuEl = modalEl.querySelector('.custom-select-menu')
    expect(menuEl).toBeInTheDocument()

    const optionLegal = Array.from(menuEl.querySelectorAll('.custom-select-option')).find(el =>
      el.textContent.includes('Gói Pháp Lý')
    )
    expect(optionLegal).toBeInTheDocument()

    // Chọn option Gói Pháp Lý
    fireEvent.click(optionLegal)

    // Trigger hiển thị giá trị mới
    expect(selectTrigger).toHaveTextContent('Gói Pháp Lý')
  })
})

