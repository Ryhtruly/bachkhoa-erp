import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DocumentTemplateSettings from './DocumentTemplateSettings'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn(), peekApiCache: vi.fn(), prefetchApi: vi.fn() }))
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }))

const PACKAGES = [
  {
    id: 'sp_001',
    name: 'Đo Vẽ',
    color: '#3b82f6',
    task_types: [{ id: 'tt_006', name: 'Tách thửa' }, { id: 'tt_002', name: 'Cắm mốc' }],
  },
  {
    id: 'sp_002',
    name: 'Pháp Lý',
    color: '#10b981',
    task_types: [{ id: 'tt_010', name: 'Cấp đổi sổ' }],
  },
]

const NODES = [
  { code: 'K01', name: 'Tiếp nhận & kiểm tra đầu vào' },
  { code: 'K03', name: 'Chuẩn hoá tài liệu kỹ thuật' },
  { code: 'K05a', name: 'Nộp hồ sơ' },
]

const scope = (over) => ({
  id: 'A-1', applicability_type: 'GLOBAL', service_package_id: null,
  task_type_id: null, node_code: null, is_default: true, ...over,
})

const TEMPLATES = {
  groups: [
    {
      task_type_id: null,
      items: [
        {
          id: 'T-CCCD', name: 'CCCD chủ đất', source: 'KHACH_HANG',
          is_required: true, needs_original: false, default_quantity: 1, sort_order: 10,
          note: 'Bản sao công chứng', is_active: true, in_use: 20,
          applicabilities: [
            scope({
              id: 'A-CCCD', applicability_type: 'TASK_TYPE',
              task_type_id: 'tt_006', node_code: 'K01',
            }),
            scope({ id: 'A-CCCD-GLOBAL', node_code: null }),
          ],
        },
        {
          id: 'T-BANVE', name: 'Bản vẽ trích đo', source: 'CONG_TY',
          is_required: true, needs_original: false, default_quantity: 1, sort_order: 20,
          note: '', is_active: true, in_use: 0,
          applicabilities: [scope({
            id: 'A-BANVE', applicability_type: 'TASK_TYPE',
            task_type_id: 'tt_006', node_code: 'K03',
          })],
        },
        {
          id: 'T-CAMMOC', name: 'Sơ đồ cắm mốc', source: 'CONG_TY',
          is_required: false, needs_original: false, default_quantity: 1, sort_order: 30,
          note: '', is_active: true, in_use: 0,
          applicabilities: [scope({
            id: 'A-CAMMOC', applicability_type: 'TASK_TYPE',
            task_type_id: 'tt_002', node_code: 'K05a',
          })],
        },
      ],
    },
  ],
  task_types: [],
}

function mockApi(over = {}) {
  apiFetch.mockImplementation(async (url, options) => {
    if (over[url]) return over[url]
    if (url.includes('/applicabilities')) return { status: 'success', data: {} }
    if (url === '/api/document-register/templates') {
      if (options?.method !== 'POST') return { status: 'success', data: TEMPLATES }
      const body = JSON.parse(options.body)
      return { status: 'success', data: { id: body.id || 'T-MOI' } }
    }
    if (url === '/api/catalog/service-packages') return { data: PACKAGES }
    if (url === '/api/document-register/workflow-nodes') return { status: 'success', data: NODES }
    if (url === '/api/document-register/storage-locations') return { status: 'success', data: [] }
    if (url.startsWith('/api/document-register/templates/')) return { status: 'success', data: {} }
    throw new Error(`Unexpected ${url}`)
  })
}

describe('DocumentTemplateSettings — Bố cục 2 vùng Enterprise', () => {
  beforeEach(() => mockApi())
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('vào màn là có sẵn gói đầu và hạng mục đầu được chọn sẵn', async () => {
    render(<DocumentTemplateSettings />)

    // Chờ tải xong gói và hạng mục (tiêu đề workspace hiển thị)
    expect(await screen.findByRole('heading', { level: 2, name: 'Tách thửa' })).toBeInTheDocument()

    // Hạng mục đầu của gói Đo Vẽ được chọn sẵn trong catalog
    const catalogItem = within(document.querySelector('.dtr-panel-catalog')).getByText('Tách thửa').closest('.dtr-task-item')
    expect(catalogItem).toHaveClass('is-active')

    // Breadcrumb hiển thị đúng
    expect(document.querySelector('.dtr-ws-crumb')).toHaveTextContent('Gói Đo Vẽ')
  })

  it('Workspace mặc định hiển thị Tất cả giấy tờ trong hạng mục và cho phép lọc theo nguồn', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('heading', { level: 2, name: 'Tách thửa' })

    // Mặc định tab "Tất cả": hiển thị cả CCCD và Bản vẽ trích đo (đều thuộc tt_006)
    expect(screen.getByText('CCCD chủ đất')).toBeInTheDocument()
    expect(screen.getByText('Bản vẽ trích đo')).toBeInTheDocument()

    // Bấm tab "Khách hàng cung cấp" -> chỉ thấy CCCD
    fireEvent.click(screen.getByRole('tab', { name: /Khách hàng cung cấp/ }))
    expect(screen.getByText('CCCD chủ đất')).toBeInTheDocument()
    expect(screen.queryByText('Bản vẽ trích đo')).not.toBeInTheDocument()

    // Bấm tab "Công ty soạn lập" -> chỉ thấy Bản vẽ trích đo
    fireEvent.click(screen.getByRole('tab', { name: /Công ty soạn lập/ }))
    expect(screen.queryByText('CCCD chủ đất')).not.toBeInTheDocument()
    expect(screen.getByText('Bản vẽ trích đo')).toBeInTheDocument()
  })

  it('đổi hạng mục thì giấy khai riêng cho hạng mục cũ biến mất, hiển thị giấy hạng mục mới', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('heading', { level: 2, name: 'Tách thửa' })

    expect(screen.getByText('Bản vẽ trích đo')).toBeInTheDocument()
    expect(screen.queryByText('Sơ đồ cắm mốc')).not.toBeInTheDocument()

    // Chuyển sang hạng mục "Cắm mốc" ở catalog bên trái
    fireEvent.click(within(document.querySelector('.dtr-panel-catalog')).getByText('Cắm mốc'))

    expect(await screen.findByRole('heading', { level: 2, name: 'Cắm mốc' })).toBeInTheDocument()
    expect(screen.queryByText('Bản vẽ trích đo')).not.toBeInTheDocument()
    expect(screen.getByText('Sơ đồ cắm mốc')).toBeInTheDocument()
  })

  it('tìm kiếm theo tên giấy tờ trong workspace', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('heading', { level: 2, name: 'Tách thửa' })

    const searchInput = screen.getByPlaceholderText(/Tìm tên giấy tờ/)
    fireEvent.change(searchInput, { target: { value: 'CCCD' } })

    expect(screen.getByText('CCCD chủ đất')).toBeInTheDocument()
    expect(screen.queryByText('Bản vẽ trích đo')).not.toBeInTheDocument()

    fireEvent.change(searchInput, { target: { value: 'khong-ton-tai' } })
    expect(screen.getByText(/Chưa có loại giấy nào/)).toBeInTheDocument()
  })

  it('lọc hạng mục ở panel trái bằng ô tìm kiếm', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('heading', { level: 2, name: 'Tách thửa' })

    const catalogSearchInput = screen.getByPlaceholderText(/Lọc hạng mục/)
    fireEvent.change(catalogSearchInput, { target: { value: 'Cắm mốc' } })

    const catalogPanel = document.querySelector('.dtr-panel-catalog')
    expect(within(catalogPanel).getByText('Cắm mốc')).toBeInTheDocument()
    expect(within(catalogPanel).queryByText('Tách thửa')).not.toBeInTheDocument()
  })

  it('bấm Sửa trên một dòng mở modal sửa thông tin loại giấy', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('heading', { level: 2, name: 'Tách thửa' })

    const editButtons = screen.getAllByRole('button', { name: /Sửa/ })
    fireEvent.click(editButtons[0]) // CCCD chủ đất

    expect(await screen.findByDisplayValue('CCCD chủ đất')).toBeInTheDocument()
  })

  it('bấm Xoá trên dòng giấy tờ hiện modal xác nhận có nêu số hồ sơ đang dùng', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('heading', { level: 2, name: 'Tách thửa' })

    const deleteButtons = screen.getAllByRole('button', { name: /Xoá/ })
    fireEvent.click(deleteButtons[0]) // CCCD chủ đất (in_use = 20)

    expect(await screen.findByText(/Tắt “CCCD chủ đất” khỏi mẫu/)).toBeInTheDocument()
    expect(screen.getByText(/20 hồ sơ đang dùng mục này vẫn giữ nguyên/)).toBeInTheDocument()
    expect(apiFetch.mock.calls.some(([, opt]) => opt?.method === 'DELETE')).toBe(false)
  })

  it('bấm Thêm loại giấy mở modal tạo mới với phạm vi hạng mục đang chọn', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('heading', { level: 2, name: 'Tách thửa' })

    fireEvent.click(screen.getByRole('button', { name: 'Thêm loại giấy tờ' }))

    expect(await screen.findByText('Gói và hạng mục áp dụng')).toBeInTheDocument()
  })

  it('mở modal Nơi lưu bản cứng khi bấm nút trên header', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('heading', { level: 2, name: 'Tách thửa' })

    fireEvent.click(screen.getByRole('button', { name: 'Danh mục nơi lưu bản cứng' }))

    expect(await screen.findByText('Danh mục nơi lưu bản cứng')).toBeInTheDocument()
  })

  it('phân vùng rõ ràng thành 2 panel: catalog và workspace với scroll container riêng biệt', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('heading', { level: 2, name: 'Tách thửa' })

    const catalogPanel = document.querySelector('.dtr-panel-catalog')
    const workspacePanel = document.querySelector('.dtr-panel-workspace')
    const catalogBody = document.querySelector('.dtr-panel-catalog__body')
    const tableWrap = document.querySelector('.dtr-table-wrap')

    expect(catalogPanel).toBeInTheDocument()
    expect(workspacePanel).toBeInTheDocument()
    expect(catalogBody).toBeInTheDocument()
    expect(tableWrap).toBeInTheDocument()
  })

  it('thanh phân trang cố định ở đáy bảng hiển thị đúng số lượng và các nút điều hướng', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('heading', { level: 2, name: 'Tách thửa' })

    const footer = document.querySelector('.contract-server-pagination')
    expect(footer).toBeInTheDocument()
    expect(footer).toHaveTextContent('1–2 / 2 loại giấy tờ')

    const prevBtn = screen.getByRole('button', { name: 'Trang trước' })
    const nextBtn = screen.getByRole('button', { name: 'Trang sau' })
    expect(prevBtn).toBeDisabled()
    expect(nextBtn).toBeDisabled()
  })

  it('khi có hơn 12 loại giấy tờ, phân trang phân chia đúng trang 1 và trang 2', async () => {
    // Tạo 15 giấy tờ thuộc tt_006
    const manyDocs = Array.from({ length: 15 }, (_, i) => ({
      id: `T-MULTI-${i + 1}`,
      name: `Tài liệu thứ ${i + 1}`,
      source: 'CONG_TY',
      is_required: true,
      needs_original: false,
      default_quantity: 1,
      sort_order: i + 1,
      note: '',
      is_active: true,
      in_use: 0,
      applicabilities: [
        {
          id: `A-MULTI-${i + 1}`,
          applicability_type: 'TASK_TYPE',
          service_package_id: 'pkg_dv',
          task_type_id: 'tt_006',
          node_code: null,
          template_id: `T-MULTI-${i + 1}`,
        },
      ],
    }))

    mockApi({
      '/api/document-register/templates': {
        status: 'success',
        data: {
          groups: [{ items: manyDocs }],
        },
      },
    })

    render(<DocumentTemplateSettings />)
    await screen.findByRole('heading', { level: 2, name: 'Tách thửa' })

    // Trang 1: thấy Tài liệu thứ 1 và Tài liệu thứ 12, nhưng không thấy Tài liệu thứ 13
    expect(screen.getByText('Tài liệu thứ 1')).toBeInTheDocument()
    expect(screen.getByText('Tài liệu thứ 12')).toBeInTheDocument()
    expect(screen.queryByText('Tài liệu thứ 13')).not.toBeInTheDocument()

    const footer = document.querySelector('.contract-server-pagination')
    expect(footer).toHaveTextContent('1–12 / 15 loại giấy tờ')

    // Chuyển sang trang 2
    const page2Btn = screen.getByRole('button', { name: 'Trang 2' })
    fireEvent.click(page2Btn)

    expect(screen.queryByText('Tài liệu thứ 1')).not.toBeInTheDocument()
    expect(screen.getByText('Tài liệu thứ 13')).toBeInTheDocument()
    expect(screen.getByText('Tài liệu thứ 15')).toBeInTheDocument()
    expect(footer).toHaveTextContent('13–15 / 15 loại giấy tờ')
  })
})

