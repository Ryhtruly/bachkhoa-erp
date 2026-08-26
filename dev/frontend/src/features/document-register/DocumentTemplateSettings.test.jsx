import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import DocumentTemplateSettings from './DocumentTemplateSettings'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const giay = (id, name, extra = {}) => ({
  id, name, source: 'KHACH_HANG', source_label: 'Khách hàng cung cấp',
  is_required: true, needs_original: false, default_quantity: 1,
  sort_order: 1, note: null, is_active: true, in_use: 0, ...extra,
})

const mockApi = () => {
  apiFetch.mockImplementation(async (url) => {
    if (url.includes('/storage-locations')) return { data: [{ id: 'p1', name: 'Tủ hồ sơ A', kind: 'TAI_CHO' }] }
    return {
      data: {
        task_types: [{ id: 'tt-1', name: 'Hoàn công' }],
        groups: [
          { task_type_id: null, task_type_name: '— Bộ chung (mọi thủ tục) —',
            items: [giay('t1', 'Giấy tờ hôn nhân'), giay('t2', 'CCCD chủ đất', { in_use: 3 })] },
          { task_type_id: 'tt-1', task_type_name: 'Hoàn công',
            items: [giay('t3', 'Giấy phép xây dựng')] },
        ],
      },
    }
  })
}

// Trước đây mọi nhóm bung hết cùng lúc và mỗi nhóm tự kê lại đủ sáu tiêu đề cột.
// Hơn hai mươi thủ tục là trang dài mấy màn hình, đọc không ra gì.
it('chỉ mở sẵn Bộ chung, các thủ tục khác gập lại', async () => {
  mockApi()
  render(<DocumentTemplateSettings />)

  expect(await screen.findByText('Giấy tờ hôn nhân')).toBeInTheDocument()
  // Nhóm thủ tục có tiêu đề nhưng chưa bung nội dung.
  expect(screen.getByRole('button', { name: /Hoàn công/ })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('Giấy phép xây dựng')).not.toBeInTheDocument()
})

it('bấm tiêu đề nhóm thì mở ra', async () => {
  mockApi()
  render(<DocumentTemplateSettings />)

  fireEvent.click(await screen.findByRole('button', { name: /Hoàn công/ }))

  expect(await screen.findByText('Giấy phép xây dựng')).toBeInTheDocument()
})

// Tìm phải xuyên qua cả nhóm đang gập — nếu không thì gập lại hoá ra là giấu mất.
it('tìm thấy cả giấy nằm trong nhóm đang gập', async () => {
  mockApi()
  render(<DocumentTemplateSettings />)
  await screen.findByText('Giấy tờ hôn nhân')

  fireEvent.change(screen.getByLabelText(/Tìm tên giấy tờ/), { target: { value: 'xây dựng' } })

  expect(await screen.findByText('Giấy phép xây dựng')).toBeInTheDocument()
  expect(screen.queryByText('Giấy tờ hôn nhân')).not.toBeInTheDocument()
})

it('không khớp gì thì nói rõ, không để trang trắng', async () => {
  mockApi()
  render(<DocumentTemplateSettings />)
  await screen.findByText('Giấy tờ hôn nhân')

  fireEvent.change(screen.getByLabelText(/Tìm tên giấy tờ/), { target: { value: 'khongcogi' } })

  expect(await screen.findByText(/Không có giấy tờ nào khớp/)).toBeInTheDocument()
})

// Danh mục nơi lưu là cấu hình của cấu hình, không được chiếm màn hình đầu.
it('danh mục nơi lưu gập sẵn, mở được khi cần', async () => {
  mockApi()
  render(<DocumentTemplateSettings />)

  const nut = await screen.findByRole('button', { name: /Danh mục nơi lưu bản cứng/ })
  expect(nut).toHaveAttribute('aria-expanded', 'false')

  fireEvent.click(nut)
  await waitFor(() => expect(screen.getByText('Tủ hồ sơ A')).toBeInTheDocument())
})
