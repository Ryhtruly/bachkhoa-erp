import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DocumentCabinet from './DocumentCabinet'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => 'token'),
}))

const SERVICE_LINES = [
  { id: 'SL-1', name: 'Cắm mốc', service_package: 'Đo Vẽ' },
  { id: 'SL-2', name: 'Tách thửa', service_package: 'Đo Vẽ' },
]

const slot = (over) => ({
  id: 'S-1', name: 'CCCD', source: 'KHACH_HANG', source_label: 'Khách hàng cung cấp',
  template_id: 'T-CCCD', status: 'CHUA_CO', status_label: 'Chưa có',
  needs_original: false, copy_type_label: null, quantity: 1,
  file_count: 0, files: [], ...over,
})

const doc = (over) => ({
  template_id: 'T-CCCD', name: 'CCCD', source: 'KHACH_HANG', source_label: 'Khách hàng cung cấp',
  is_required: false, needs_original: false, slot_id: 'S-CCCD',
  status: 'CHUA_CO', status_label: 'Chưa có', is_waived: false,
  files: [], file_count: 0, ...over,
})

const CCCD = doc({ template_id: 'T-CCCD', name: 'CCCD', slot_id: 'S-CCCD', needs_original: true })
const BAN_VE = doc({
  template_id: 'T-BANVE', name: 'Bản vẽ hiện trạng', slot_id: 'S-BANVE',
  source: 'CONG_TY', source_label: 'Công ty soạn',
  status: 'DA_NHAN', status_label: 'Đã nhận', file_count: 1,
  files: [{ id: 'D-BANVE', file_name: 'ban-ve.pdf', content_type: 'application/pdf' }],
})
const SO_HO_KHAU = doc({ template_id: 'T-HK', name: 'Sổ hộ khẩu', slot_id: 'S-HK' })

/** Tủ xếp theo bước — cấu trúc lấy từ master data. */
const cabinet = (docs = { K01: [CCCD], K03: [BAN_VE], null: [SO_HO_KHAU] }) => [
  { node_code: 'K01', node_name: 'Tiếp nhận & kiểm tra đầu vào', documents: docs.K01, total: docs.K01.length, done: docs.K01.filter(d => d.file_count > 0).length },
  { node_code: 'K03', node_name: 'Chuẩn hoá tài liệu kỹ thuật', documents: docs.K03, total: docs.K03.length, done: docs.K03.filter(d => d.file_count > 0).length },
  { node_code: null, node_name: null, documents: docs.null, total: docs.null.length, done: docs.null.filter(d => d.file_count > 0).length },
]

/**
 * ``groups`` cố tình đầy ô rác — đúng thứ đã thấy trên hợp đồng thật: master data
 * khai 3 loại giấy nhưng sổ dựng ra 58 ô, vì luật dựng sổ cũ vơ cả kho mẫu công
 * ty. Fixture giữ nguyên tình trạng đó để test chứng minh tủ KHÔNG đọc từ đây.
 */
const RAC = Array.from({ length: 30 }, (_, i) => slot({
  id: `S-RAC-${i}`, name: `Giấy công ty không thuộc gói này ${i}`,
  source: 'CONG_TY', template_id: `T-RAC-${i}`,
}))

const REGISTER = {
  planned_node_by_template: { 'T-CCCD': 'K01', 'T-BANVE': 'K03' },
  cabinet_by_node: cabinet(),
  groups: [
    {
      source: 'KHACH_HANG',
      slots: [
        slot({ id: 'S-CCCD', name: 'CCCD', template_id: 'T-CCCD', needs_original: true, quantity: 2 }),
        slot({ id: 'S-HK', name: 'Sổ hộ khẩu', template_id: 'T-HK' }),
      ],
    },
    {
      source: 'CONG_TY',
      slots: [
        slot({
          id: 'S-BANVE', name: 'Bản vẽ hiện trạng', source: 'CONG_TY', template_id: 'T-BANVE',
          status: 'DA_NHAN', status_label: 'Đã nhận', file_count: 1,
          files: [{ id: 'D-BANVE', content_type: 'application/pdf' }],
        }),
        ...RAC,
      ],
    },
    { source: 'CO_QUAN', slots: [] },
  ],
}

const RAW_FILES = {
  data: [
    { id: 'D-1', file_name: 'anh-zalo.jpg', content_type: 'image/jpeg', slots: [] },
    {
      id: 'D-2', file_name: 'so-do-scan.pdf', content_type: 'application/pdf',
      slots: [{ id: 'S-HK', name: 'Sổ hộ khẩu' }],
    },
  ],
  unclassified: 1,
}

function mockApi(register = REGISTER) {
  apiFetch.mockImplementation(async (url, options) => {
    if (url.startsWith('/api/document-register/register')) return register
    if (url.includes('/source-documents')) return RAW_FILES
    if (url.includes('/links')) return { status: 'success', data: {} }
    throw new Error(`Unexpected ${url} ${options?.method || ''}`)
  })
}

const box = () => document.querySelector('.doc-cabinet')
const openNodeTab = () => fireEvent.click(screen.getByRole('tab', { name: /theo bước/ }))
const expandStep = (name) => fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }))

describe('Tủ hồ sơ', () => {
  beforeEach(() => mockApi())
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  const mount = (props = {}) => render(
    <DocumentCabinet contractId="HD-1" serviceLines={SERVICE_LINES} addToast={vi.fn()} {...props} />,
  )

  it('gọi sổ kèm service_line_id — thiếu nó là mất nhãn bước và rơi về sổ đời 1', async () => {
    mount()
    await waitFor(() => {
      const url = apiFetch.mock.calls.map(([u]) => u).find(u => u.startsWith('/api/document-register/register'))
      expect(url).toContain('contract_id=HD-1')
      expect(url).toContain('service_line_id=SL-1')
    })
  })

  it('đổi Hạng mục thì gọi lại sổ với mã hạng mục mới', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')
    apiFetch.mockClear()

    fireEvent.change(screen.getByLabelText('Hạng mục của tủ hồ sơ'), { target: { value: 'SL-2' } })

    await waitFor(() => {
      const url = apiFetch.mock.calls.map(([u]) => u).find(u => u.startsWith('/api/document-register/register'))
      expect(url).toContain('service_line_id=SL-2')
    })
  })

  it('một hạng mục thì bỏ hẳn hàng Hạng mục, không nhắc lại thứ đã biết', async () => {
    mount({ serviceLines: [SERVICE_LINES[0]] })
    await screen.findByText('anh-zalo.jpg')

    expect(screen.queryByLabelText('Hạng mục của tủ hồ sơ')).not.toBeInTheDocument()
    expect(within(box()).queryByText('Hạng mục')).not.toBeInTheDocument()
  })

  it('nhiều hạng mục thì vẫn có ô chọn để đổi tủ', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')

    expect(screen.getByLabelText('Hạng mục của tủ hồ sơ')).toBeInTheDocument()
  })

  it('mở mặc định ở ngăn Nguyên bản và liệt kê tệp thô', async () => {
    mount()
    expect(await screen.findByText('anh-zalo.jpg')).toBeInTheDocument()
    expect(screen.getByText('so-do-scan.pdf')).toBeInTheDocument()
  })
})

/**
 * Lỗi đã thấy trên hợp đồng thật: tủ bày badge 33 / 14 / 11 cho một hạng mục mà
 * master data chỉ khai 18 loại giấy. Bốn ngăn theo nguồn đọc thẳng ô giấy, nên ô
 * sinh thừa bởi luật dựng sổ cũ lọt hết vào tủ.
 */
describe('Tủ đọc master data, không đọc ô giấy thô', () => {
  beforeEach(() => mockApi())
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  const mount = () => render(
    <DocumentCabinet contractId="HD-1" serviceLines={SERVICE_LINES} addToast={vi.fn()} />,
  )

  it('đếm theo bộ giấy của hạng mục, không đếm 30 ô rác trong sổ', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')
    openNodeTab()

    // groups có 33 ô; master data khai 3 loại, 1 loại đã có tệp.
    expect(screen.getByText('1/3 loại giấy đã có tệp')).toBeInTheDocument()
    expect(screen.getByTitle('2 loại giấy chưa có')).toHaveTextContent('2')
  })

  it('không bày ô giấy nào ngoài bộ master data, kể cả khi tìm đúng tên nó', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')
    openNodeTab()

    fireEvent.change(screen.getByLabelText('Tìm giấy tờ'), { target: { value: 'khong thuoc goi' } })

    expect(screen.queryByText(/Giấy công ty không thuộc gói này/)).not.toBeInTheDocument()
    expect(screen.getByText('Không có loại giấy nào khớp từ khoá.')).toBeInTheDocument()
  })

  it('xếp theo bước, mỗi bước nói rõ đã thu được mấy trên mấy', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')
    openNodeTab()

    const heads = [...document.querySelectorAll('.doc-cabinet__group-head')]
      .map(h => h.textContent.replace(/\s+/g, ' ').trim())

    expect(heads[0]).toContain('K01')
    expect(heads[0]).toContain('Tiếp nhận & kiểm tra đầu vào')
    expect(heads[0]).toContain('0/1')
    expect(heads[1]).toContain('K03')
    // Giấy chưa bước nào nhận xuống CUỐI, không lẫn vào giữa các bước thật.
    expect(heads[2]).toContain('chưa gán bước')
  })

  it('bước chưa gán được đánh dấu cảnh báo, không trông như bước bình thường', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')
    openNodeTab()

    const group = screen.getByText(/chưa gán bước/).closest('.doc-cabinet__group')
    expect(group).toHaveClass('is-none')
  })

  it('mở sẵn bước đầu, các bước sau bấm mới mở', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')
    openNodeTab()

    expect(screen.getByText('CCCD')).toBeInTheDocument()
    expect(screen.queryByText('Bản vẽ hiện trạng')).not.toBeInTheDocument()

    expandStep('K03')
    expect(screen.getByText('Bản vẽ hiện trạng')).toBeInTheDocument()
  })

  it('gõ từ khoá thì mở luôn mọi bước còn khớp, không bắt bấm từng bước', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')
    openNodeTab()

    // "Bản vẽ" nằm ở K03 — bước đang đóng.
    fireEvent.change(screen.getByLabelText('Tìm giấy tờ'), { target: { value: 'ban ve' } })

    expect(screen.getByText('Bản vẽ hiện trạng')).toBeInTheDocument()
    expect(screen.queryByText('CCCD')).not.toBeInTheDocument()
    // Bước không còn tờ nào khớp thì bỏ hẳn, không để lại hàng tiêu đề rỗng.
    expect(screen.queryByText('Tiếp nhận & kiểm tra đầu vào')).not.toBeInTheDocument()
  })

  it('dòng loại giấy hiện nguồn và bản chính, KHÔNG hiện số lượng', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')
    openNodeTab()

    const row = screen.getByText('CCCD').closest('.doc-cabinet__row')
    expect(within(row).getByText('khách')).toBeInTheDocument()
    // Một loại giấy có thể gồm nhiều file — số lượng do nhân viên nộp quyết định.
    expect(within(row).getByText('Bản chính')).toBeInTheDocument()
    expect(within(row).queryByText(/SL /)).not.toBeInTheDocument()
    expect(within(row).getByText('Chưa có')).toBeInTheDocument()
  })

  it('loại giấy đã có tệp hiện trạng thái xanh và mở được tệp', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')
    openNodeTab()
    expandStep('K03')

    const row = screen.getByText('Bản vẽ hiện trạng').closest('.doc-cabinet__row')
    expect(within(row).getByText('Đã nhận')).toHaveClass('is-done')
    expect(within(row).getByRole('button', { name: 'Bản vẽ hiện trạng' })).toBeInTheDocument()
  })

  it('loại giấy được miễn nói rõ là miễn, không nằm im ở "Chưa có"', async () => {
    mockApi({
      ...REGISTER,
      cabinet_by_node: cabinet({
        K01: [{ ...CCCD, is_waived: true }], K03: [BAN_VE], null: [SO_HO_KHAU],
      }),
    })
    mount()
    await screen.findByText('anh-zalo.jpg')
    openNodeTab()

    const row = screen.getByText('CCCD').closest('.doc-cabinet__row')
    expect(within(row).getByText('Đã miễn')).toBeInTheDocument()
  })

  it('hạng mục chưa khai giấy nào thì nói thẳng, không mở tủ rỗng không lời', async () => {
    mockApi({ ...REGISTER, cabinet_by_node: [] })
    mount()
    await screen.findByText('anh-zalo.jpg')
    openNodeTab()

    expect(screen.getByText(/chưa khai loại giấy nào trong tab Mẫu giấy tờ/)).toBeInTheDocument()
  })
})

describe('Kho nguyên bản', () => {
  beforeEach(() => mockApi())
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  const mount = (props = {}) => render(
    <DocumentCabinet contractId="HD-1" serviceLines={SERVICE_LINES} addToast={vi.fn()} {...props} />,
  )

  it('badge đếm hai kiểu khác nhau: tệp chưa gán vs loại giấy chưa có', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')

    // Nguyên bản: 2 tệp nhưng chỉ 1 tệp chưa gán vào ô nào.
    expect(screen.getByTitle('1 tệp chưa gán vào ô giấy nào')).toHaveTextContent('1')
    expect(screen.getByTitle('2 loại giấy chưa có')).toHaveTextContent('2')
    expect(document.querySelectorAll('.doc-cabinet__badge')).toHaveLength(2)
  })

  it('nút Thêm giấy tờ CHỈ có ở ngăn Nguyên bản', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')
    expect(screen.getByRole('button', { name: /thêm giấy tờ/i })).toBeInTheDocument()

    openNodeTab()
    // Ngăn theo bước liệt kê LOẠI GIẤY hồ sơ cần; đổ tệp thẳng vào đó là bỏ qua
    // bước phân loại của K01.
    expect(screen.queryByRole('button', { name: /thêm giấy tờ/i })).not.toBeInTheDocument()
  })

  it('tệp đã gán hiện tick kèm tên ô, tệp chưa gán hiện nút gán', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')

    const assigned = screen.getByText('so-do-scan.pdf').closest('li')
    expect(within(assigned).getByText(/Đã gán vào Sổ hộ khẩu/)).toBeInTheDocument()

    const unassigned = screen.getByText('anh-zalo.jpg').closest('li')
    expect(within(unassigned).getByRole('button', { name: 'Gán vào ô giấy' })).toBeInTheDocument()
  })

  it('gán tệp gọi đúng ô, và chỉ liệt kê ô KHÁCH CUNG CẤP còn trống của hạng mục', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')

    const row = screen.getByText('anh-zalo.jpg').closest('li')
    fireEvent.click(within(row).getByRole('button', { name: 'Gán vào ô giấy' }))

    const picker = screen.getByLabelText('Chọn ô giấy để gán')
    const options = [...picker.options].map(o => o.textContent)
    expect(options).toContain('CCCD')
    expect(options).toContain('Sổ hộ khẩu')
    // Ô nguồn CÔNG TY: backend trả 409, kho nguyên bản là giấy KHÁCH gửi.
    expect(options.some(t => t.includes('Bản vẽ hiện trạng'))).toBe(false)
    // Ô rác ngoài bộ master data: gán vào đó là chôn tệp ở chỗ không bước nào tìm ra.
    expect(options.some(t => t.includes('không thuộc gói này'))).toBe(false)

    fireEvent.change(picker, { target: { value: 'S-CCCD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gán' }))

    await waitFor(() => {
      const call = apiFetch.mock.calls.find(([u, o]) => u.includes('/links') && o?.method === 'POST')
      expect(call[0]).toBe('/api/document-register/slots/S-CCCD/links')
      expect(JSON.parse(call[1].body)).toEqual({ document_id: 'D-1' })
    })
  })

  it('gỡ gán gọi đúng cặp ô và tệp', async () => {
    mount()
    await screen.findByText('so-do-scan.pdf')

    fireEvent.click(screen.getByLabelText('Gỡ so-do-scan.pdf khỏi Sổ hộ khẩu'))

    await waitFor(() => {
      const call = apiFetch.mock.calls.find(([, o]) => o?.method === 'DELETE')
      expect(call[0]).toBe('/api/document-register/slots/S-HK/links/D-2')
    })
  })

  it('hết ô khách cung cấp trống thì nói thẳng, không bày nút Gán vô dụng', async () => {
    const daDay = (d) => ({ ...d, file_count: 1, files: [{ id: `D-${d.template_id}` }] })
    mockApi({
      ...REGISTER,
      cabinet_by_node: cabinet({
        K01: [daDay(CCCD)], K03: [BAN_VE], null: [daDay(SO_HO_KHAU)],
      }),
    })
    mount()
    await screen.findByText('anh-zalo.jpg')

    const row = screen.getByText('anh-zalo.jpg').closest('li')
    fireEvent.click(within(row).getByRole('button', { name: 'Gán vào ô giấy' }))

    expect(screen.getByText(/Không còn ô giấy khách cung cấp nào trống/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gán' })).not.toBeInTheDocument()
  })

  it('loại giấy đã khai nhưng chưa dựng được ô thì không mời gán vào nó', async () => {
    mockApi({
      ...REGISTER,
      cabinet_by_node: cabinet({
        K01: [{ ...CCCD, slot_id: null }], K03: [BAN_VE], null: [SO_HO_KHAU],
      }),
    })
    mount()
    await screen.findByText('anh-zalo.jpg')

    const row = screen.getByText('anh-zalo.jpg').closest('li')
    fireEvent.click(within(row).getByRole('button', { name: 'Gán vào ô giấy' }))

    const options = [...screen.getByLabelText('Chọn ô giấy để gán').options].map(o => o.textContent)
    expect(options).not.toContain('CCCD')
    expect(options).toContain('Sổ hộ khẩu')
  })
})

describe('Trạng thái chung của tủ', () => {
  beforeEach(() => mockApi())
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  const mount = () => render(
    <DocumentCabinet contractId="HD-1" serviceLines={SERVICE_LINES} addToast={vi.fn()} />,
  )

  it('lọc theo tên, bỏ dấu vẫn tìm ra', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')
    openNodeTab()

    fireEvent.change(screen.getByLabelText('Tìm giấy tờ'), { target: { value: 'so ho khau' } })

    expect(screen.getByText('Sổ hộ khẩu')).toBeInTheDocument()
    expect(screen.queryByText('CCCD')).not.toBeInTheDocument()
  })

  it('đóng tủ thì ẩn hết nội dung, nút Quy trình bên dưới không bị đẩy đi', async () => {
    mount()
    await screen.findByText('anh-zalo.jpg')

    fireEvent.click(screen.getByRole('button', { name: /tủ hồ sơ/i }))

    expect(screen.queryByText('anh-zalo.jpg')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tìm giấy tờ')).not.toBeInTheDocument()
  })

  it('đọc hụt thì báo lỗi, không im lặng hiện tủ rỗng', async () => {
    apiFetch.mockRejectedValue(new Error('mất kết nối'))
    mount()

    expect(await screen.findByRole('alert')).toHaveTextContent('mất kết nối')
  })

  it('đổi hợp đồng thì về ngăn đầu và xoá từ khoá', async () => {
    const { rerender } = render(
      <DocumentCabinet contractId="HD-1" serviceLines={SERVICE_LINES} addToast={vi.fn()} />,
    )
    await screen.findByText('anh-zalo.jpg')
    openNodeTab()
    fireEvent.change(screen.getByLabelText('Tìm giấy tờ'), { target: { value: 'xyz' } })

    rerender(
      <DocumentCabinet contractId="HD-2" serviceLines={SERVICE_LINES} addToast={vi.fn()} />,
    )

    await waitFor(() => expect(screen.getByLabelText('Tìm giấy tờ')).toHaveValue(''))
    expect(screen.getByRole('tab', { name: /nguyên bản/ })).toHaveAttribute('aria-selected', 'true')
  })
})
