import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ContractComposer from './ContractComposer'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => 'mock-token'),
}))

describe('ContractComposer', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  // Giám đốc chốt bộ giấy ngay lúc soạn hợp đồng. Trước đây hệ thống đổ cứng cả
  // bộ chung cho mọi hạng mục, nên hợp đồng Cắm mốc vẫn bị đòi giấy hôn nhân và
  // K01 không nộp được — người ta phải nhét đại một tệp cho qua cổng.
  const mockDanhMuc = (loaiGiay) => {
    apiFetch.mockImplementation(async (url) => {
      if (url === '/api/catalog/service-packages') {
        return { data: [{ id: 'g-1', code: 'DO_VE', name: 'Đo Vẽ',
                          task_types: [{ id: 'tt-1', name: 'Cắm mốc' }] }] }
      }
      if (url === '/api/document-register/checklist-options') return { data: loaiGiay }
      return { data: [] }
    })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })))
  }

  const LOAI_GIAY = [
    { id: 'tpl-so', name: 'Giấy chứng nhận quyền sử dụng đất', is_required: true },
    { id: 'tpl-cccd', name: 'CCCD/CMND của chủ sử dụng đất', is_required: true },
    { id: 'tpl-honnhan', name: 'Giấy tờ hôn nhân', is_required: true },
  ]

  it('không tick sẵn chế độ nào — "quên chọn" phải nhìn thấy được', async () => {
    mockDanhMuc(LOAI_GIAY)

    render(<ContractComposer open code="004/BK-2026" services={[]} templates={[]}
      onClose={vi.fn()} onSubmit={vi.fn()} />)

    // Ba chế độ đều hiện, không cái nào được chọn sẵn: nếu có mặc định ngầm thì
    // người soạn bấm Lưu là hệ thống tự dựng cả bộ giấy mà họ chưa hề quyết định.
    const cac_o = await screen.findAllByRole('radio')
    expect(cac_o).toHaveLength(3)
    expect(cac_o.every(o => o.getAttribute('aria-checked') === 'false')).toBe(true)
  })

  it('chọn thủ công mới hiện danh sách tick', async () => {
    mockDanhMuc(LOAI_GIAY)

    render(<ContractComposer open code="004/BK-2026" services={[]} templates={[]}
      onClose={vi.fn()} onSubmit={vi.fn()} />)

    expect(screen.queryByText(/loại giấy|Đủ bộ chuẩn/)).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('radio', { name: /Chọn thủ công/ }))

    // Vào chế độ thủ công thì tick sẵn bộ mặc định để đỡ thao tác, nhưng đó là
    // hệ quả của một lựa chọn CÓ Ý THỨC, không phải mặc định ngầm.
    expect(await screen.findByText(/Đủ bộ chuẩn · 3 loại/)).toBeInTheDocument()

    fireEvent.click(screen.getByText(/Đủ bộ chuẩn · 3 loại/))
    fireEvent.click(await screen.findByRole('option', { name: /Giấy tờ hôn nhân/ }))
    expect(await screen.findByText('2/3 loại giấy')).toBeInTheDocument()
  })

  it('chọn "không yêu cầu giấy tờ" thì nói rõ hệ quả', async () => {
    mockDanhMuc(LOAI_GIAY)

    render(<ContractComposer open code="004/BK-2026" services={[]} templates={[]}
      onClose={vi.fn()} onSubmit={vi.fn()} />)

    fireEvent.click(await screen.findByRole('radio', { name: /Không yêu cầu giấy tờ/ }))

    expect(await screen.findByText(/sổ trống/)).toBeInTheDocument()
    // Không bày danh sách tick ở chế độ này — bày ra chỉ gây hiểu nhầm.
    expect(screen.queryByText(/Đủ bộ chuẩn/)).not.toBeInTheDocument()
  })

  it('schema V2 chưa bật thì khoá phần chọn giấy, phần còn lại vẫn dùng được', async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url === '/api/catalog/service-packages') {
        return { data: [{ id: 'g-1', code: 'DO_VE', name: 'Đo Vẽ',
                          task_types: [{ id: 'tt-1', name: 'Cắm mốc' }] }] }
      }
      if (url === '/api/document-register/checklist-options') {
        const loi = new Error('column does not exist')
        loi.status = 503
        throw loi
      }
      return { data: [] }
    })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: async () => [] })))

    render(<ContractComposer open code="004/BK-2026" services={[]} templates={[]}
      onClose={vi.fn()} onSubmit={vi.fn()} />)

    expect(await screen.findByText(/chưa được kích hoạt/)).toBeInTheDocument()
    // Không được lộ lỗi kỹ thuật.
    expect(screen.queryByText(/column|Internal Server Error/i)).not.toBeInTheDocument()
    // Form vẫn dùng bình thường.
    expect(screen.getByText(/Soạn hợp đồng mới/)).toBeInTheDocument()
  })

  it('submits the explicitly chosen template ID', async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url === '/api/catalog/service-packages') {
        return {
          data: [
            {
              id: 'g-1',
              code: 'DO_VE',
              name: 'Đo Vẽ',
              task_types: [{ id: 'tt-1', name: 'Tách thửa' }],
            },
          ],
        }
      }
      return { data: [] }
    })
    vi.stubGlobal('fetch', vi.fn((url) => {
      const normalized = String(url)
      if (normalized === '/api/survey-records/wards/provinces') {
        return Promise.resolve({ ok: true, json: async () => [{ code: '79', name: 'TP. Hồ Chí Minh' }] })
      }
      if (normalized.startsWith('/api/survey-records/wards?province_code=79')) {
        return Promise.resolve({ ok: true, json: async () => [{ code: '26734', name: 'Phường Bến Nghé' }] })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${normalized}`))
    }))
    const onSubmit = vi.fn()

    render(
      <ContractComposer
        open
        code="001/BK-2026"
        services={['Đo đạc']}
        templates={[{ id: 'do-dac-v1', code: 'MAU_HOP_DONG_DO_DAC_BACH_KHOA', version: 1, name: 'Mẫu đo đạc' }]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Tên khách hàng/), { target: { value: 'Nguyễn Văn An' } })
    fireEvent.change(screen.getByLabelText(/Số điện thoại/), { target: { value: '0901234567' } })
    fireEvent.change(screen.getByLabelText(/Số CCCD/), { target: { value: '079300012345' } })

    // Chọn Tỉnh
    fireEvent.click(screen.getByLabelText(/Tỉnh \/ Thành phố/))
    await screen.findByRole('button', { name: /TP\. Hồ Chí Minh/ })
    fireEvent.click(screen.getByRole('button', { name: /TP\. Hồ Chí Minh/ }))

    // Chọn Phường
    fireEvent.click(screen.getByLabelText(/Phường \/ Xã/))
    await screen.findByRole('button', { name: /Phường Bến Nghé/ })
    fireEvent.click(screen.getByRole('button', { name: /Phường Bến Nghé/ }))

    // Chọn Gói dịch vụ
    fireEvent.click(screen.getByLabelText(/Gói dịch vụ/))
    await screen.findByRole('button', { name: /Đo Vẽ/ })
    fireEvent.click(screen.getByRole('button', { name: /Đo Vẽ/ }))

    fireEvent.change(screen.getByLabelText(/Sale \/ nguồn/), { target: { value: 'Trần Minh' } })
    fireEvent.change(screen.getByLabelText(/Giá trị hợp đồng/), { target: { value: '18tr' } })

    fireEvent.click(screen.getByRole('button', { name: 'Lưu hợp đồng' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      contract_template_id: 'do-dac-v1',
      task_type_id: 'tt-1',
    })))
  })

  it('resets customer name, phone, and identity fields when switching between customer types', async () => {
    apiFetch.mockResolvedValue({ data: [] })
    render(
      <ContractComposer
        open
        code="001/BK-2026"
        services={[]}
        templates={[{ id: 't-1', code: 'MAU_1', version: 1, name: 'Mẫu 1' }]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    // Nhập dữ liệu cá nhân
    const nameInput = screen.getByLabelText(/Tên khách hàng/)
    const phoneInput = screen.getByLabelText(/Số điện thoại/)
    fireEvent.change(nameInput, { target: { value: 'Nguyễn Văn A' } })
    fireEvent.change(phoneInput, { target: { value: '0901234567' } })
    expect(nameInput.value).toBe('Nguyễn Văn A')
    expect(phoneInput.value).toBe('0901234567')

    // Chuyển sang Doanh nghiệp
    const businessTab = screen.getByRole('tab', { name: 'Doanh nghiệp' })
    fireEvent.click(businessTab)

    // Ô Tên công ty và Số điện thoại phải được xoá trắng
    const companyInput = screen.getByLabelText(/Tên công ty/)
    const phoneInputAfter = screen.getByLabelText(/Số điện thoại/)
    expect(companyInput.value).toBe('')
    expect(phoneInputAfter.value).toBe('')

    // Nhập dữ liệu doanh nghiệp
    fireEvent.change(companyInput, { target: { value: 'Công ty ABC' } })
    fireEvent.change(phoneInputAfter, { target: { value: '0283888888' } })
    expect(companyInput.value).toBe('Công ty ABC')
    expect(phoneInputAfter.value).toBe('0283888888')

    // Chuyển lại sang Cá nhân
    const individualTab = screen.getByRole('tab', { name: 'Cá nhân' })
    fireEvent.click(individualTab)

    const individualNameAfter = screen.getByLabelText(/Tên khách hàng/)
    const phoneInputFinal = screen.getByLabelText(/Số điện thoại/)
    expect(individualNameAfter.value).toBe('')
    expect(phoneInputFinal.value).toBe('')
  })

  it('đưa các tệp khách gửi vào payload để chỉ upload sau khi hợp đồng được tạo', async () => {
    apiFetch.mockResolvedValue({ data: [] })
    const onSubmit = vi.fn()
    render(
      <ContractComposer
        open
        code="001/BK-2026"
        templates={[{ id: 't-1', code: 'MAU_1', version: 1, name: 'Mẫu 1' }]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    const files = [
      new File(['cccd'], 'cccd.jpg', { type: 'image/jpeg' }),
      new File(['so-do'], 'so-do.pdf', { type: 'application/pdf' }),
    ]
    fireEvent.change(screen.getByLabelText('Tài liệu khách gửi'), {
      target: { files },
    })

    expect(await screen.findByText('cccd.jpg')).toBeInTheDocument()
    expect(screen.getByText('so-do.pdf')).toBeInTheDocument()
    expect(screen.getByText('2 tệp chờ tải lên sau khi lưu hợp đồng')).toBeInTheDocument()
  })

  it('hiển thị nhiều tài liệu theo danh sách dọc có thể thu gọn', async () => {
    apiFetch.mockResolvedValue({ data: [] })
    render(
      <ContractComposer
        open
        code="001/BK-2026"
        templates={[{ id: 't-1', code: 'MAU_1', version: 1, name: 'Mẫu 1' }]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const files = Array.from({ length: 6 }, (_, index) => (
      new File([`tai-lieu-${index + 1}`], `tai-lieu-${index + 1}.pdf`, { type: 'application/pdf' })
    ))
    fireEvent.change(screen.getByLabelText('Tài liệu khách gửi'), {
      target: { files },
    })

    const toggle = await screen.findByRole('button', { name: '6 tài liệu đã chọn' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('tai-lieu-6.pdf')).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ tai-lieu-4.pdf' }))
    expect(screen.getByRole('button', { name: '5 tài liệu đã chọn' })).toBeInTheDocument()
    expect(screen.queryByText('tai-lieu-4.pdf')).not.toBeInTheDocument()
  })

  it('mở xem trước tài liệu khách gửi ngay trước khi lưu hợp đồng', async () => {
    apiFetch.mockResolvedValue({ data: [] })
    const createObjectURL = vi.fn(() => 'blob:cccd-preview')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    render(
      <ContractComposer
        open
        code="001/BK-2026"
        templates={[{ id: 't-1', code: 'MAU_1', version: 1, name: 'Mẫu 1' }]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const file = new File(['cccd'], 'cccd.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Tài liệu khách gửi'), {
      target: { files: [file] },
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Xem cccd.jpg' }))

    const previewDialog = screen.getByRole('dialog', { name: 'Xem tài liệu cccd.jpg' })
    expect(previewDialog).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'cccd.jpg' })).toHaveAttribute('src', 'blob:cccd-preview')
    expect(createObjectURL).toHaveBeenCalledWith(file)

    fireEvent.click(within(previewDialog).getByRole('button', { name: 'Đóng' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cccd-preview')
  })
})
