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
    task_types: [{ id: 'tt_006', name: 'Tách thửa' }, { id: 'tt_002', name: 'Cắm mốc' }],
  },
  { id: 'sp_002', name: 'Pháp Lý', task_types: [{ id: 'tt_010', name: 'Cấp đổi sổ' }] },
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
          note: '', is_active: true, in_use: 20,
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
      // Giống server thật: upsert trả về CHÍNH id đã gửi lên, chỉ cấp id mới khi
      // chưa có. Mock trả id lạ cho mọi lượt sẽ che mất lỗi ghi nhầm mẫu.
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

// Cột 1 và Cột 2 không có dòng tiêu đề (đúng bản vẽ) nên tìm theo data-col.
// Ba nhóm nguồn gốc là hằng số nghiệp vụ, không phải dữ liệu test.
const SOURCE_COUNT = 3

const cot = (ten) => document.querySelector(`.dtm__col[data-col="${ten}"]`)

describe('Mẫu Giấy Tờ — ba cột', () => {
  beforeEach(() => mockApi())
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('vào màn là có sẵn gói đầu và hạng mục đầu, không để ba cột trống', async () => {
    render(<DocumentTemplateSettings />)

    // `selected: true` để chờ đúng nhịp: tab hiện ra trước, việc chọn sẵn gói đầu
    // xảy ra ở lượt render sau khi danh mục về.
    expect(await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })).toBeInTheDocument()
    // Hạng mục đầu của gói được chọn sẵn, không để Cột 2 trống chờ người ta đoán.
    expect(within(cot('types')).getByText('Tách thửa')).toHaveClass('is-active')
    // Breadcrumb phải phản ánh đúng ngữ cảnh đang đứng.
    expect(document.querySelector('.dtm__crumb')).toHaveTextContent('Đo Vẽ')
  })

  it('Cột 2 lọc theo cả hạng mục lẫn nhóm nguồn gốc', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })

    // Mặc định nhóm "Khách hàng cung cấp" → chỉ CCCD.
    const docs = cot('docs')
    expect(within(docs).getByText('CCCD chủ đất')).toBeInTheDocument()
    expect(within(docs).queryByText('Bản vẽ trích đo')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Công ty soạn lập' }))
    expect(within(docs).getByText('Bản vẽ trích đo')).toBeInTheDocument()
    expect(within(docs).queryByText('CCCD chủ đất')).not.toBeInTheDocument()
  })

  it('đổi hạng mục thì giấy khai riêng cho hạng mục cũ biến mất', async () => {
    // Đây là luật độc lập nhìn từ giao diện: "Bản vẽ trích đo" khai riêng cho
    // Tách thửa, đứng ở Cắm mốc thì không được thấy nó.
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })
    fireEvent.click(screen.getByRole('tab', { name: 'Công ty soạn lập' }))

    const docs = cot('docs')
    expect(within(docs).getByText('Bản vẽ trích đo')).toBeInTheDocument()

    fireEvent.click(within(cot('types')).getByText('Cắm mốc'))

    expect(within(docs).queryByText('Bản vẽ trích đo')).not.toBeInTheDocument()
    expect(within(docs).getByText('Sơ đồ cắm mốc')).toBeInTheDocument()
  })

  it('chưa chọn giấy thì Cột 3 nói phải làm gì và khoá hai nút', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })

    expect(screen.getByText(/Vui lòng chọn 1 loại giấy tờ bên trái/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Xoá' })).toBeDisabled()
  })

  it('chọn giấy thì Cột 3 hiện bước kèm nhãn phạm vi, hai nút bật lên', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })
    fireEvent.click(screen.getByText('CCCD chủ đất'))

    const nodes = cot('nodes')
    expect(within(nodes).getByText('K01')).toBeInTheDocument()
    // Nhãn phạm vi phải có: cùng tờ giấy có thể vừa nhận bước từ hạng mục này
    // vừa thừa hưởng từ dòng "mọi gói".
    expect(within(nodes).getByText('mọi gói')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sửa' })).toBeEnabled()
  })

  it('đổi ngữ cảnh thì bỏ chọn giấy cũ, Cột 3 không giữ chi tiết lạc', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })
    fireEvent.click(screen.getByText('CCCD chủ đất'))
    expect(within(cot('nodes')).getByText('K01')).toBeInTheDocument()

    fireEvent.click(within(cot('types')).getByText('Cắm mốc'))

    expect(screen.getByText(/Vui lòng chọn 1 loại giấy tờ bên trái/)).toBeInTheDocument()
  })

  it('Sửa ghi theo id của ĐÚNG bản ghi, không gửi lại cả cụm', async () => {
    // Gửi cả cụm là xoá mất bản ghi của hạng mục khác — cái tai nạn mà mô hình
    // độc lập sinh ra để tránh.
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })
    fireEvent.click(screen.getByText('CCCD chủ đất'))
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }))

    fireEvent.click(await screen.findByRole('button', { name: /Lưu/ }))

    await waitFor(() => {
      const calls = apiFetch.mock.calls.filter(([, opt]) => opt?.method === 'PUT')
      expect(calls).toHaveLength(1)
      expect(calls[0][0]).toBe('/api/document-register/templates/T-CCCD/applicabilities/A-CCCD')
    })
  })

  it('chế độ Sửa khoá phạm vi, không bày ma trận Gói/Hạng mục', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })
    fireEvent.click(screen.getByText('CCCD chủ đất'))
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }))

    expect(await screen.findByText(/Cấu hình của hạng mục khác giữ nguyên/)).toBeInTheDocument()
    expect(screen.queryByText('Gói và hạng mục áp dụng')).not.toBeInTheDocument()
  })

  it('Thêm mới mở ma trận và tick sẵn hạng mục đang đứng', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })
    fireEvent.click(screen.getByRole('button', { name: 'Thêm loại giấy tờ' }))

    expect(await screen.findByText('Gói và hạng mục áp dụng')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Mọi gói/ })).not.toBeChecked()
  })

  it('Thêm mới chưa chọn phạm vi thì cảnh báo và không cho lưu', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })
    // Hạng mục rỗng ở gói Pháp Lý? Không — bỏ tick hạng mục mặc định đi.
    fireEvent.click(screen.getByRole('button', { name: 'Thêm loại giấy tờ' }))
    await screen.findByText('Gói và hạng mục áp dụng')

    fireEvent.click(screen.getByRole('button', { name: /Bung hạng mục của Đo Vẽ/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tách thửa' }))

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('sẽ không hiện ở hợp đồng nào')
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled()
  })

  it('Xoá hỏi lại và nêu đúng số hồ sơ đang dùng, không xoá thẳng', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })
    fireEvent.click(screen.getByText('CCCD chủ đất'))
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }))

    expect(await screen.findByText(/20 hồ sơ đang dùng/)).toBeInTheDocument()
    expect(apiFetch.mock.calls.some(([, opt]) => opt?.method === 'DELETE')).toBe(false)
  })

  it('ba hàng tách bạch, và đầu cột thẳng cột với thân cột', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })

    // Hàng 2 và hàng 3 phải dùng CHUNG một lưới, không thì đầu cột lệch khỏi
    // thân cột và không còn nói được cái đầu nào lọc cái thân nào.
    const heads = document.querySelector('.dtm__heads')
    const cols = document.querySelector('.dtm__cols')
    expect(heads).toHaveClass('dtm__grid')
    expect(cols).toHaveClass('dtm__grid')
    expect(heads.querySelectorAll('.dtm__head')).toHaveLength(3)
    expect(cols.querySelectorAll('.dtm__col')).toHaveLength(3)
  })

  it('đầu Cột 1 là bộ lọc Gói, đầu Cột 2 là bộ lọc Nhóm, đầu Cột 3 là nhãn', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })

    const heads = document.querySelectorAll('.dtm__head')
    expect(heads[0].querySelectorAll('.dtm__tab')).toHaveLength(PACKAGES.length)
    expect(heads[1].querySelectorAll('.dtm__tab')).toHaveLength(SOURCE_COUNT)
    expect(heads[2]).toHaveTextContent('Node đã áp dụng')
    // Hai tablist riêng vì Gói và Nhóm là hai chiều lọc độc lập — gộp một nhóm
    // thì mũi tên bàn phím chạy lẫn từ Gói sang Nhóm.
    expect(screen.getAllByRole('tablist')).toHaveLength(2)
  })

  it('đường dẫn trên tiêu đề nêu đủ bốn nấc khi đã chọn tới giấy', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })

    const crumb = document.querySelector('.dtm__crumb')
    // Ba nấc khi chưa chọn giấy: Gói › Hạng mục › Nhóm.
    expect(crumb.querySelectorAll('span')).toHaveLength(3)

    fireEvent.click(screen.getByText('CCCD chủ đất'))

    const nac = [...document.querySelectorAll('.dtm__crumb > span')].map(s => s.textContent.trim())
    expect(nac).toEqual(['Đo Vẽ', 'Tách thửa', 'Khách hàng cung cấp', 'CCCD chủ đất'])
    // Nấc cuối là thứ đang xem nên phải nổi hơn các nấc dẫn đường.
    expect(document.querySelector('.dtm__crumb .is-cuoi')).toHaveTextContent('CCCD chủ đất')
  })

  it('Cột 3 không có nút trên từng dòng, chỉ hai nút ghim ở đáy', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })
    fireEvent.click(screen.getByText('CCCD chủ đất'))

    const nodes = cot('nodes')
    // Mỗi dòng CHÍNH LÀ nút chọn, không chứa nút con nào bên trong.
    const dong = nodes.querySelectorAll('.dtm__node')
    expect(dong.length).toBeGreaterThan(0)
    dong.forEach(d => expect(d.querySelector('button')).toBeNull())
    expect(nodes.querySelectorAll('.dtm__foot button')).toHaveLength(2)
  })

  it('Sửa tác động lên dòng Cột 3 đang chọn, không phải luôn dòng đầu', async () => {
    render(<DocumentTemplateSettings />)
    await screen.findByRole('tab', { name: 'Đo Vẽ', selected: true })
    fireEvent.click(screen.getByText('CCCD chủ đất'))

    // CCCD ở Tách thửa có hai dòng; bấm dòng thứ hai rồi Sửa phải trúng dòng đó.
    const dong = cot('nodes').querySelectorAll('.dtm__node')
    fireEvent.click(dong[1])
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu' }))

    await waitFor(() => {
      const [url] = apiFetch.mock.calls.find(([, o]) => o?.method === 'PUT')
      expect(url).toBe('/api/document-register/templates/T-CCCD/applicabilities/A-CCCD-GLOBAL')
    })
  })

  it('đọc hụt thì không để trang trắng câm', async () => {
    apiFetch.mockRejectedValue(new Error('mất kết nối'))
    render(<DocumentTemplateSettings />)

    expect(await screen.findByText('Mẫu Giấy Tờ')).toBeInTheDocument()
  })
})
