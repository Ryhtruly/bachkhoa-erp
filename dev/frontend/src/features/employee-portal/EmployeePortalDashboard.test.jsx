import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import EmployeePortalDashboard from './EmployeePortalDashboard'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn(), getAccessToken: vi.fn(() => null) }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const HELD_ITEM = {
  workflow_instance_id: 'wi-1',
  service_line_id: 'sl-1',
  service_line_name: 'Đo vẽ hiện trạng',
  contract_id: '010/BK-2026',
  customer_name: 'Lê Thị Lan',
  location_label: 'P. Bến Thành',
  priority: 'NORMAL',
  nodes: [
    { id: 'n1', node_code: 'K01', status: 'accepted', name: 'Tiếp nhận', mine: true },
    { id: 'n2', node_code: 'K02', status: 'in_progress', name: 'Khảo sát & đo RTK', mine: true },
    { id: 'n3', node_code: 'K03', status: 'pending', name: 'Chuẩn hoá tài liệu', mine: true },
  ],
  current_task_node_id: 'n2',
  current_node_code: 'K02',
  current_node_name: 'Khảo sát & đo RTK',
  current_node_status: 'in_progress',
  steps_total: 3,
  steps_done: 1,
  amount_total: 550000,
  amount_earned: 250000,
}

const POOL_CHAIN_ITEM = {
  id: 'pool-1',
  node_key: 'k02',
  node_code: 'K02',
  status: 'ready',
  name: 'Khảo sát & đo hiện trường',
  service_line_id: 'sl-2',
  service_line_name: 'Đo vẽ hiện trạng vị trí thửa đất',
  contract_id: '014/BK-2026',
  customer_name: 'Anh Tuấn',
  location_label: 'P. Tân Phong, Q.7',
  priority: 'URGENT',
  deadline_at: null,
  groups: ['CHAIN', 'ASSIST'],
  available_roles: ['MAIN', 'ASSISTANT'],
  occupied_roles: [],
  occupied_assignments: [],
  role_amounts: { MAIN: 250000, ASSISTANT: 100000 },
  chain_codes: ['K02', 'K03'],
  step_count: 6,
  output_count: 4,
  chain_amount: 550000,
  preference_locked: false,
}

const POOL_DETAIL = {
  task_node_id: 'pool-1',
  service_line_name: 'Đo vẽ hiện trạng vị trí thửa đất',
  contract_id: '014/BK-2026',
  customer_name: 'Anh Tuấn',
  customer_phone: '0938 214 507',
  parcel_address: 'P. Tân Phong, Q.7, TP.HCM',
  certificate_number: null,
  location_label: 'P. Tân Phong',
  priority: 'URGENT',
  deadline_at: '2026-08-25T17:00:00+00:00',
  total_amount: 550000,
  assistant_total_amount: 100000,
  steps: [
    {
      task_node_id: 'pool-1',
      node_code: 'K02',
      name: 'Khảo sát & đo hiện trường',
      status: 'ready',
      duration_seconds: 28800,
      amount: 250000,
      has_assistant_slot: true,
      assistant_amount: 100000,
      checklist: [
        { id: 'a1', name: '04 ảnh thực địa tại các góc ranh', is_required: true, is_payable: true, amount: 250000, assistant_amount: 100000 },
        { id: 'a2', name: 'File toạ độ thô .csv/.txt từ máy RTK', is_required: true, is_payable: false, amount: 0, assistant_amount: 0 },
      ],
    },
    {
      task_node_id: 'pool-2',
      node_code: 'K03',
      name: 'Chuẩn hoá tài liệu kỹ thuật',
      status: 'pending',
      duration_seconds: 172800,
      amount: 300000,
      has_assistant_slot: false,
      assistant_amount: 0,
      checklist: [
        { id: 'b1', name: 'File AutoCAD .dwg đúng chuẩn layer', is_required: true, is_payable: true, amount: 300000, assistant_amount: 0 },
      ],
    },
  ],
}

// Anh A làm K01+K02+K03 trong MỘT hạng mục. Lịch sử phải nói "1 hạng mục",
// không phải "3" — 3 là số bước K, đó chính là lỗi đang sửa.
const COMPLETED_ITEM = {
  workflow_instance_id: 'wi-done-1',
  service_line_id: 'sl-done-1',
  contract_id: '003/BK-2026',
  service_line_name: 'Cắm mốc',
  customer_name: 'Lê Quang Huy',
  location_label: 'Phường Bồ Đề',
  my_node_count: 3,
  last_accepted_at: '2026-08-24T15:02:54Z',
  workflow_done: false,
  nodes: [
    { id: 'd1', node_code: 'K01', status: 'accepted', name: 'Tiếp nhận', mine: true,
      checklist: [{ id: 'c0', name: 'Phân loại giấy tờ', status: 'approved', evidence_files: [] }] },
    { id: 'd2', node_code: 'K02', status: 'accepted', name: 'Khảo sát & đo RTK', mine: true,
      checklist: [{ id: 'c1', name: 'Ảnh hiện trạng', status: 'approved', evidence_files: [{ name: 'anh.jpg' }] }] },
    { id: 'd3', node_code: 'K03', status: 'accepted', name: 'Chuẩn hoá tài liệu', mine: true,
      checklist: [{ id: 'c2', name: 'File CAD', status: 'approved', evidence_files: [] }] },
    { id: 'd4', node_code: 'K06', status: 'accepted', name: 'Bàn giao', mine: false, checklist: [] },
    { id: 'd5', node_code: 'K07', status: 'ready', name: 'Lưu trữ hồ sơ', mine: false, checklist: [] },
  ],
}

const mockApi = ({
  heldItems = [HELD_ITEM], poolItems = [POOL_CHAIN_ITEM], restrictions = {}, tasks = [],
  completedItems = [COMPLETED_ITEM], helpItems = [],
} = {}) => {
  apiFetch.mockImplementation((url) => {
    if (url.includes('/completed-items')) {
      return Promise.resolve({ count: completedItems.length, items: completedItems })
    }
    if (url.includes('/detail')) return Promise.resolve(POOL_DETAIL)
    if (url.includes('/task-pool')) {
      return Promise.resolve({
        department_code: 'SURVEY',
        items: poolItems,
        help_items: helpItems,
        restrictions: {
          active_in_progress: 0,
          held_items: 2,
          wip_limit: 3,
          wip_locked: false,
          ...restrictions,
        },
      })
    }
    if (url.includes('/daily-summary')) {
      return Promise.resolve({ accepted_count: 12, in_progress_count: 2, submitted_count: 0, earned_amount: 0 })
    }
    return Promise.resolve({
      employee: { full_name: 'Nguyễn Văn A', job_title: 'Nhân viên Đo vẽ', department: 'Đo vẽ', is_active: true },
      tasks,
      held_items: heldItems,
    })
  })
}

it('hiển thị tải dở dang và các hạng mục đang giữ', async () => {
  mockApi()

  render(<EmployeePortalDashboard />)

  expect(await screen.findByRole('heading', { name: 'Hạng mục bạn đã nhận' })).toBeInTheDocument()
  expect(screen.getByText('Tải của bạn')).toBeInTheDocument()
  // Đếm HẠNG MỤC, không đếm bước K: anh A làm 3 bước trong 1 hạng mục thì là 1.
  // Số đếm nằm trong huy hiệu riêng nhưng vẫn phải vào tên khả truy cập của nút,
  // nếu không thì trình đọc màn hình chỉ nghe "Xem quy trình đã hoàn thành".
  expect(screen.getByRole('button', { name: /Xem quy trình đã hoàn thành\s*1$/ })).toBeInTheDocument()

  // Hàng rào tải phải nói bằng số hạng mục, không phải phần trăm chung chung.
  expect(screen.getByText('2 / 3 hạng mục')).toBeInTheDocument()
  expect(screen.getByText(/Còn 1 slot — nhận thêm/)).toBeInTheDocument()
  // Ô trống trong vùng đã nhận nói cùng một con số, để không phải nhẩm lại.
  expect(screen.getByText('Còn 1 slot trống')).toBeInTheDocument()

  expect(screen.getByRole('heading', { name: 'Hạng mục bạn đã nhận' })).toBeInTheDocument()
  expect(screen.getByText('Đo vẽ hiện trạng · HĐ 010/BK-2026')).toBeInTheDocument()
  expect(screen.getByText(/KH: Lê Thị Lan · P\. Bến Thành/)).toBeInTheDocument()
  expect(screen.getByText('K02 Khảo sát & đo RTK')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Mở ra làm' })).toBeEnabled()
})

it('bể việc hiện thẻ trọn chuỗi kèm tổng khoán, và đổi sang nhóm thợ phụ được', async () => {
  mockApi()

  render(<EmployeePortalDashboard />)

  expect(await screen.findByRole('heading', { name: /^Bể việc phòng Đo vẽ/ })).toBeInTheDocument()
  expect(screen.getByText('Đo vẽ hiện trạng vị trí thửa đất')).toBeInTheDocument()
  expect(screen.getByText('HĐ 014/BK-2026 · KH: Anh Tuấn')).toBeInTheDocument()
  expect(screen.getByText(/6 bước · 4 đầu ra/)).toBeInTheDocument()
  expect(screen.getByText('550.000đ')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Nhận trọn/ })).toBeEnabled()

  // Suất thợ phụ là cam kết khác hẳn: khoán cố định, chỉ ở bước đo hiện trường.
  fireEvent.click(screen.getByRole('tab', { name: /Thợ phụ/ }))
  expect(await screen.findByRole('button', { name: /Nhận làm phụ/ })).toBeInTheDocument()
  expect(screen.getByText('100.000đ')).toBeInTheDocument()
})

it('bấm Chi tiết mở bảng kê: từng bước, thời lượng, checklist nào có tiền, tổng khoán', async () => {
  mockApi()

  render(<EmployeePortalDashboard />)
  fireEvent.click(await screen.findByRole('button', { name: 'Chi tiết' }))

  // Nhận diện hồ sơ: có SĐT khách để gọi trước khi ra hiện trường.
  expect(await screen.findByText('Anh Tuấn · 0938 214 507')).toBeInTheDocument()
  const popup = within(screen.getByRole('dialog'))
  expect(popup.getByText(/P\. Tân Phong, Q\.7/)).toBeInTheDocument()

  // Từng bước kèm khoán và thời lượng SLA riêng.
  expect(popup.getByText('Bạn nhận cả 2 bước')).toBeInTheDocument()
  expect(popup.getByText('Khảo sát & đo hiện trường')).toBeInTheDocument()
  expect(popup.getByText('Chuẩn hoá tài liệu kỹ thuật')).toBeInTheDocument()
  expect(popup.getByText(/Thời lượng 8 giờ/)).toBeInTheDocument()
  expect(popup.getByText(/Thời lượng 2 ngày/)).toBeInTheDocument()
  // Khoán của bước = tổng các mục checklist có đơn giá, nên K02 hiện 250.000đ
  // hai lần: một ở đầu bước, một ở đúng mục sinh ra khoán đó.
  expect(popup.getAllByText('250.000đ')).toHaveLength(2)
  expect(popup.getAllByText('300.000đ')).toHaveLength(2)

  // Checklist hiện đủ, và chỉ mục có đơn giá mới gắn số tiền.
  expect(popup.getByText('04 ảnh thực địa tại các góc ranh')).toBeInTheDocument()
  expect(popup.getByText('File toạ độ thô .csv/.txt từ máy RTK')).toBeInTheDocument()

  // Suất thợ phụ tách riêng, không cộng vào tiền của người nhận chính.
  expect(popup.getByText(/Có suất thợ phụ 100\.000đ/)).toBeInTheDocument()
  expect(popup.getByText('Tổng khoán trọn chuỗi')).toBeInTheDocument()
  expect(popup.getByText('550.000đ')).toBeInTheDocument()
  expect(popup.getByText(/Người đi phụ nhận riêng 100\.000đ/)).toBeInTheDocument()
})

it('đủ tải thì khoá nút nhận trọn chuỗi và nói rõ vì sao', async () => {
  mockApi({ restrictions: { held_items: 3, wip_locked: true } })

  render(<EmployeePortalDashboard />)

  expect(await screen.findByRole('button', { name: /Nhận trọn/ })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent(/tối đa 3 hạng mục dở dang/i)
  expect(screen.getByText(/Đủ tải/)).toBeInTheDocument()
  // Đủ tải thì không còn ô trống nào mời nhận thêm.
  expect(screen.queryByText(/slot trống/)).not.toBeInTheDocument()
})

it('mở một hạng mục ra là thấy cả sơ đồ chuỗi và bước đang làm', async () => {
  mockApi({
    tasks: [{
      id: 'n2',
      node_code: 'K02',
      node_key: 'k02',
      name: 'Khảo sát & đo hiện trường',
      status: 'in_progress',
      description: 'Đo đạc thực địa, lấy toạ độ GPS 4 mốc ranh.',
      deadline_at: null,
      checklist: [
        { id: 'c1', key: 'anh', name: '4 ảnh mốc ranh GPS', is_required: true, status: 'pending', require_evidence: true },
      ],
      assignees: [],
    }],
  })

  render(<EmployeePortalDashboard />)
  fireEvent.click(await screen.findByRole('button', { name: 'Mở ra làm' }))

  // Đầu trang nói ngay hạng mục nào và tiền đã tích luỹ trên tổng.
  expect(await screen.findByRole('heading', { name: 'Đo vẽ hiện trạng' })).toBeInTheDocument()
  expect(screen.getByText(/HĐ 010\/BK-2026 · KH: Lê Thị Lan/)).toBeInTheDocument()
  expect(screen.getByText('250.000đ')).toBeInTheDocument()

  // Cả 3 bước của chuỗi đều hiện, kể cả bước chưa tới lượt.
  expect(screen.getByRole('heading', { name: /SƠ ĐỒ CHUỖI CÔNG VIỆC/ })).toBeInTheDocument()
  expect(screen.getByText('K01')).toBeInTheDocument()
  expect(screen.getByText('K03')).toBeInTheDocument()
  expect(screen.getByText('ĐANG CHỌN')).toBeInTheDocument()

  // Bước đang làm mở sẵn checklist để nộp minh chứng.
  expect(screen.getByRole('heading', { name: 'Khảo sát & đo hiện trường' })).toBeInTheDocument()
  expect(screen.getByText('4 ảnh mốc ranh GPS')).toBeInTheDocument()
  expect(screen.getByText(/tự đóng bước/)).toBeInTheDocument()
})

it('bước chưa tới lượt thì mở ra chỉ báo chờ, không cho thao tác', async () => {
  mockApi({
    tasks: [],
    heldItems: [{
      ...HELD_ITEM,
      current_task_node_id: 'n3',
      current_node_code: 'K03',
      current_node_name: 'Chuẩn hoá tài liệu',
      current_node_status: 'pending',
    }],
  })

  render(<EmployeePortalDashboard />)
  // Trên thẻ đã báo trước là đang chờ bước khác.
  expect(await screen.findByText('● Chờ bước trước')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Mở ra làm' }))
  expect(await screen.findByText(/K03 Chuẩn hoá tài liệu chưa tới lượt bạn/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Chọn file minh chứng/ })).not.toBeInTheDocument()
})

it('không còn dấu vết của bố cục cũ: lịch tuần và cột thông tin bên phải', async () => {
  mockApi()

  await screen.findByText || null
  render(<EmployeePortalDashboard />)

  expect(await screen.findByRole('heading', { name: 'Hạng mục bạn đã nhận' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /^Lịch làm việc/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Thông tin nghỉ phép' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Check-out / Đã Check-in' })).not.toBeInTheDocument()
})

it('bấm "Xem quy trình đã hoàn thành" mở lịch sử chuỗi K của riêng mình', async () => {
  mockApi()

  render(<EmployeePortalDashboard />)

  fireEvent.click(await screen.findByRole('button', { name: /Xem quy trình đã hoàn thành/ }))

  const history = await screen.findByRole('dialog')
  // Hạng mục nào: hợp đồng, tên hạng mục, khách.
  expect(within(history).getByText(/Cắm mốc/)).toBeInTheDocument()
  expect(within(history).getByText(/003\/BK-2026/)).toBeInTheDocument()

  // Cả dãy K của hạng mục, giống tab Giám đốc — nhưng chỉ rõ bước nào của mình.
  const chain = within(history).getByLabelText('Chuỗi bước của hạng mục')
  expect(within(chain).getByText('K01')).toBeInTheDocument()
  expect(within(chain).getByText('K06')).toBeInTheDocument()
  expect(within(chain).getByText('K07')).toBeInTheDocument()
  expect(within(chain).getAllByTitle(/Bước của bạn/)).toHaveLength(3)
})

it('lịch sử nói rõ anh ta đã nộp gì ở từng bước', async () => {
  mockApi()

  render(<EmployeePortalDashboard />)
  fireEvent.click(await screen.findByRole('button', { name: /Xem quy trình đã hoàn thành/ }))

  const history = await screen.findByRole('dialog')
  expect(within(history).getByText('Ảnh hiện trạng')).toBeInTheDocument()
  expect(within(history).getByText('File CAD')).toBeInTheDocument()
  expect(within(history).getByText('Phân loại giấy tờ')).toBeInTheDocument()
})

it('nói thật khi hạng mục còn bước của phòng khác chưa xong', async () => {
  mockApi()

  render(<EmployeePortalDashboard />)
  fireEvent.click(await screen.findByRole('button', { name: /Xem quy trình đã hoàn thành/ }))

  const history = await screen.findByRole('dialog')
  expect(within(history).getByText(/Bạn xong phần của mình · hạng mục còn bước của phòng khác/))
    .toBeInTheDocument()
})

it('chưa hoàn thành hạng mục nào thì không mở được lịch sử rỗng', async () => {
  mockApi({ completedItems: [] })

  render(<EmployeePortalDashboard />)

  const badge = await screen.findByRole('button', { name: /Xem quy trình đã hoàn thành/ })
  expect(badge).toBeDisabled()
})

// Bấm "Nhờ hỗ trợ" lần thứ hai cho cùng một bước thì máy chủ trả 409
// ("Bước này đã được đẩy lên Bể việc, đang chờ người nhận"). Trước đây nút vẫn
// sáng nguyên sau khi đã nhờ nên nhân viên bấm lại là chuyện đương nhiên.
it('đã nhờ rồi thì nút đổi thành rút lại, không cho nhờ chồng lên nhau', async () => {
  mockApi({
    heldItems: [{ ...HELD_ITEM, current_help_request_open: true, current_help_request_id: 'H-9' }],
  })
  const xacNhan = vi.spyOn(window, 'confirm').mockReturnValue(true)

  render(<EmployeePortalDashboard />)

  const nutRut = await screen.findByRole('button', { name: /Rút lại lời nhờ/ })
  expect(screen.queryByRole('button', { name: /^Nhờ hỗ trợ$/ })).not.toBeInTheDocument()

  fireEvent.click(nutRut)

  await waitFor(() => {
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/employee-portal/help-requests/H-9/cancel',
      { method: 'POST' },
    )
  })
  xacNhan.mockRestore()
})

// Đồng đội khác đã đẩy bước này lên Bể việc: mình không phải người nhờ nên
// không rút được, nhưng cũng tuyệt đối không được nhờ chồng thêm lần nữa.
it('người khác đã nhờ thì nút khoá lại và nói rõ đang chờ ai đó nhận', async () => {
  mockApi({
    heldItems: [{ ...HELD_ITEM, current_help_request_open: true, current_help_request_id: null }],
  })

  render(<EmployeePortalDashboard />)

  const nut = await screen.findByRole('button', { name: /Đang chờ người nhận/ })
  expect(nut).toBeDisabled()
  expect(screen.queryByRole('button', { name: /Rút lại lời nhờ/ })).not.toBeInTheDocument()
})

const HELP_ITEM = {
  id: 'n-help-1',
  help_request_id: 'H-77',
  node_code: 'K01',
  name: 'Tiếp nhận & kiểm tra đầu vào',
  contract_id: '002/BK-2026',
  customer_name: 'Lê quang Trí',
  location_label: 'P. An Khánh',
  priority: 'NORMAL',
  reason: 'tôi bận r',
  yielded_by_name: 'Nguyễn Văn A',
  proposed_amount: 0,
  available_roles: ['MAIN'],
  groups: ['HELP'],
}

// Người NHỜ phải thấy thẻ của chính mình trên Bể việc — không thấy thì họ không
// biết lời nhờ đã lên hay chưa. Nhưng không được mời bấm nhận: máy chủ chặn
// "Bạn không thể nhận hộ chính bước mình nhờ".
it('người nhờ vẫn thấy thẻ của mình nhưng không có nút nhận', async () => {
  mockApi({ helpItems: [{ ...HELP_ITEM, is_mine: true, can_claim: false,
    cannot_claim_reason: 'Đây là bước bạn đã nhờ — chờ đồng đội nhận.' }] })

  render(<EmployeePortalDashboard />)

  fireEvent.click(await screen.findByRole('tab', { name: /Hỗ trợ/ }))

  expect(await screen.findByText(/Đây là bước bạn đã nhờ/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Nhận làm hộ/ })).not.toBeInTheDocument()
})

// Phòng khác cũng thấy để nắm tình hình, nhưng nhận thì không —
// claim_node_help chặn "Bạn không thuộc phòng ban làm được bước này".
it('người phòng khác thấy thẻ nhưng chỉ để nắm tình hình', async () => {
  mockApi({ helpItems: [{ ...HELP_ITEM, is_mine: false, can_claim: false,
    cannot_claim_reason: 'Bước này thuộc phòng khác, bạn xem để nắm tình hình.' }] })

  render(<EmployeePortalDashboard />)

  fireEvent.click(await screen.findByRole('tab', { name: /Hỗ trợ/ }))

  expect(await screen.findByText(/thuộc phòng khác/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Nhận làm hộ/ })).not.toBeInTheDocument()
})

// Đúng phòng và không phải việc mình nhờ thì mới được bấm nhận.
it('đồng đội cùng phòng thấy nút nhận làm hộ', async () => {
  mockApi({ helpItems: [{ ...HELP_ITEM, is_mine: false, can_claim: true, cannot_claim_reason: null }] })

  render(<EmployeePortalDashboard />)

  fireEvent.click(await screen.findByRole('tab', { name: /Hỗ trợ/ }))

  const nut = await screen.findByRole('button', { name: /Nhận làm hộ/ })
  fireEvent.click(nut)

  await waitFor(() => {
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/employee-portal/help-requests/H-77/claim',
      { method: 'POST' },
    )
  })
})

it('với thẻ Nhận trọn, nếu can_claim:false thì ẩn nút nhận, hiện lý do và không cho nhận qua bảng chi tiết', async () => {
  mockApi({
    poolItems: [{ ...POOL_CHAIN_ITEM, can_claim: false, cannot_claim_reason: 'Bạn chưa có chứng chỉ đo đạc.' }],
    restrictions: { wip_locked: false },
  })

  render(<EmployeePortalDashboard />)

  // 1. Thẻ Nhận trọn ở ngoài bể việc
  expect(await screen.findByText('Bạn chưa có chứng chỉ đo đạc.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Nhận trọn$/ })).not.toBeInTheDocument()

  // 2. Mở bảng chi tiết
  fireEvent.click(screen.getByRole('button', { name: 'Chi tiết' }))
  
  // Bảng chi tiết cũng phải bị khoá và hiện lý do
  const popup = within(await screen.findByRole('dialog'))
  expect(popup.getByText('🔒 Bạn chưa có chứng chỉ đo đạc.')).toBeInTheDocument()
  expect(popup.getByRole('button', { name: /Nhận trọn chuỗi/ })).toBeDisabled()
})

it('với thẻ Thợ phụ, nếu can_claim:false thì ẩn nút nhận và hiện lý do', async () => {
  mockApi({
    poolItems: [{ ...POOL_CHAIN_ITEM, can_claim: false, cannot_claim_reason: 'Bạn đang làm thợ chính cho hợp đồng này rồi.' }],
  })

  render(<EmployeePortalDashboard />)
  fireEvent.click(await screen.findByRole('tab', { name: /Thợ phụ/ }))

  expect(await screen.findByText('Bạn đang làm thợ chính cho hợp đồng này rồi.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Nhận làm phụ/ })).not.toBeInTheDocument()
})

it('khóa nút Nhận trọn khi active_in_progress >= 1 dù chưa tới wip_limit', async () => {
  mockApi({
    poolItems: [{ ...POOL_CHAIN_ITEM, can_claim: true }],
    restrictions: { active_in_progress: 1, held_items: 1, wip_limit: 3, wip_locked: false },
  })

  render(<EmployeePortalDashboard />)

  // Nút ngoài thẻ phải bị khoá
  const nutNhan = await screen.findByRole('button', { name: /Nhận trọn/ })
  expect(nutNhan).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent(/đang có một bước đang làm dở dang/)
  
  // Nút trong chi tiết cũng phải bị khoá
  fireEvent.click(screen.getByRole('button', { name: 'Chi tiết' }))
  const popup = within(await screen.findByRole('dialog'))
  const nutNhanTrong = popup.getByRole('button', { name: /Nhận trọn chuỗi/ })
  expect(nutNhanTrong).toBeDisabled()

  // Quan trọng: Thử bấm và apiFetch KHÔNG ĐƯỢC gọi
  fireEvent.click(nutNhan)
  fireEvent.click(nutNhanTrong)
  expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining('/claim'), expect.anything())
})

