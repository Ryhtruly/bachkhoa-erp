// Dữ liệu mẫu (giả) cho ảnh hướng dẫn. Lấy theo hình dạng dữ liệu trong các file test.
export const EMPLOYEE_USER = {
  id: 'u-emp', username: 'nva', full_name: 'Nguyễn Văn An', role_name: 'technician',
  default_workspace: 'employee', is_director: false,
  permissions: { survey_record: { read: true }, wiki: { read: true } },
}

const HELD_ITEM = {
  workflow_instance_id: 'wi-1', service_line_id: 'sl-1', service_line_name: 'Đo vẽ hiện trạng',
  contract_id: '010/BK-2026', customer_name: 'Lê Thị Lan', location_label: 'P. Bến Thành', priority: 'NORMAL',
  nodes: [
    { id: 'n1', node_code: 'K01', status: 'accepted', name: 'Tiếp nhận', mine: true },
    { id: 'n2', node_code: 'K02', status: 'in_progress', name: 'Khảo sát & đo RTK', mine: true, amount: 250000, bonus_amount: 50000, amount_is_settled: false },
    { id: 'n3', node_code: 'K03', status: 'pending', name: 'Chuẩn hoá tài liệu', mine: true },
  ],
  current_task_node_id: 'n2', current_node_code: 'K02', current_node_name: 'Khảo sát & đo RTK',
  current_node_status: 'in_progress', steps_total: 3, steps_done: 1, amount_total: 550000, amount_earned: 250000,
}

const pool = (over) => ({
  node_key: 'k02', node_code: 'K02', status: 'ready', name: 'Khảo sát & đo hiện trường',
  service_line_id: 'sl-2', service_line_name: 'Đo vẽ hiện trạng vị trí thửa đất', deadline_at: null,
  groups: ['CHAIN', 'ASSIST'], available_roles: ['MAIN', 'ASSISTANT'], occupied_roles: [], occupied_assignments: [],
  role_amounts: { MAIN: 250000, ASSISTANT: 100000 }, chain_codes: ['K02', 'K03'], step_count: 6, output_count: 4,
  chain_amount: 550000, preference_locked: false, priority: 'NORMAL', ...over,
})

export const TASK_POOL = {
  department_code: 'SURVEY',
  items: [
    pool({ id: 'pool-1', contract_id: '014/BK-2026', customer_name: 'Anh Tuấn', location_label: 'P. Tân Phong, Q.7', priority: 'URGENT' }),
    pool({ id: 'pool-2', contract_id: '016/BK-2026', customer_name: 'Chị Minh', location_label: 'Xã Hiệp Phước', service_line_name: 'Cắm mốc ranh thửa đất', chain_amount: 500000, role_amounts: { MAIN: 300000, ASSISTANT: 100000 } }),
    pool({ id: 'pool-3', contract_id: '017/BK-2026', customer_name: 'Anh Cường', location_label: 'P. Bình An', service_line_name: 'Tách thửa', groups: ['CHAIN'], available_roles: ['MAIN'], chain_amount: 550000, role_amounts: { MAIN: 300000 } }),
  ],
  help_items: [],
  restrictions: { active_in_progress: 0, held_items: 1, wip_limit: 3, wip_locked: false },
}

export const EMPLOYEE_ME = {
  employee: { full_name: 'Nguyễn Văn An', job_title: 'Nhân viên Đo vẽ', department: 'Đo vẽ', is_active: true },
  tasks: [{
    id: 'n2', node_code: 'K02', node_key: 'k02', name: 'Khảo sát & đo hiện trường',
    description: 'Đo đạc thực địa, lấy toạ độ GPS 4 mốc ranh, chụp ảnh hiện trạng.',
    status: 'in_progress', deadline_at: new Date(Date.now() + 2 * 86400000 + 5 * 3600000).toISOString(), contract_id: '010/BK-2026',
    checklist: [
      { id: 'c1', name: '04 ảnh thực địa tại các góc ranh', is_required: true, require_evidence: true, status: 'pending', evidence_files: [], is_payable: true, amount: 250000 },
      { id: 'c2', name: 'File toạ độ thô .csv/.txt từ máy RTK', is_required: true, require_evidence: true, status: 'pending', evidence_files: [] },
    ],
  }], held_items: [HELD_ITEM],
}

export const DAILY_SUMMARY = { accepted_count: 12, in_progress_count: 2, submitted_count: 1, earned_amount: 750000 }

const ALL = { read: true, create: true, update: true, delete: true, approve: true }
export const DIRECTOR_USER = {
  id: 'u-dir', username: 'giamdoc', full_name: 'Lê Văn Sáu', role_name: 'director',
  default_workspace: 'management', is_director: true,
  permissions: Object.fromEntries(['finance', 'crm', 'customer', 'survey_record', 'legal_submission', 'contract', 'hr', 'wiki', 'settings', 'workflow'].map((k) => [k, ALL])),
}

export const CRM_LEADS = [
  { id: 'lead-1', customer_name: 'Nguyễn Văn Khánh', phone: '0901 234 567', source: 'Zalo cá nhân', requirements: 'Dịch vụ: Đo hiện trạng | Vị trí: Củ Chi | Quy mô: 200m2', status: 'Tiếp cận', assigned_to: null, created_at: '2026-09-24 09:10' },
  { id: 'lead-2', customer_name: 'Trần Thị Mai', phone: '0912 345 678', source: 'Hotline công ty', requirements: 'Dịch vụ: Cấp đổi sổ | Quy mô: 1 bộ hồ sơ', status: 'Tiếp cận', assigned_to: 'u-sale', assigned_to_name: 'Phạm Sale', created_at: '2026-09-24 10:30' },
  { id: 'lead-3', customer_name: 'Lê Hoàng Phúc', phone: '0987 111 222', source: 'Khách giới thiệu', requirements: 'Dịch vụ: Cắm mốc | Vị trí: Nhà Bè | Quy mô: 6 mốc', status: 'Báo giá', assigned_to: 'u-sale', assigned_to_name: 'Phạm Sale', created_at: '2026-09-23 15:00' },
  { id: 'lead-4', customer_id: 'c-4', customer_name: 'Võ Minh Tâm', phone: '0933 444 555', source: 'Zalo cá nhân', requirements: 'Dịch vụ: Tách thửa | Quy mô: 2 lô', status: 'Đàm phán', assigned_to: 'u-sale', assigned_to_name: 'Phạm Sale', created_at: '2026-09-22 08:45' },
  { id: 'lead-5', customer_name: 'Đặng Thu Hà', phone: '0977 888 999', source: 'Hotline công ty', requirements: 'Dịch vụ: Đo hiện trạng | Quy mô: 150m2', status: 'Chốt', assigned_to: 'u-sale', assigned_to_name: 'Phạm Sale', created_at: '2026-09-20 11:20' },
]
export const CRM_STATS = { total_leads: 5, in_progress: 3, won_leads: 1, win_rate: 20 }
export const CRM_POLICY = { commission_rate_percent: 5, max_workload_points: 15, warning_workload_ratio: 0.8, max_open_leads: 20, stage_weights: { 'Tiếp cận': 1, 'Báo giá': 2, 'Đàm phán': 3 } }
export const INTAKE_SERVICES = { status: 'success', data: [{ id: 'sp_001', name: 'Đo Vẽ', services: [{ id: 'tt_001', name: 'Đo hiện trạng vị trí' }, { id: 'tt_002', name: 'Cắm mốc ranh giới' }] }] }

const contract = (id, customer, line, total, remaining, status = 'Đang thực hiện', signed = '10/09/2026') => ({
  id, customer_name: customer, total_value: total, remaining_amount: remaining, paid_amount: total - remaining,
  service_lines: [{ name: line }], status, date_signed: signed,
})
export const CONTRACTS = {
  data: [
    contract('018/BK-2026', 'Đặng Thu Hà', 'Đo vẽ hiện trạng', 8_500_000, 4_250_000, 'Đang thực hiện', '20/09/2026'),
    contract('017/BK-2026', 'Anh Cường', 'Tách thửa', 18_500_000, 9_000_000, 'Đang thực hiện', '18/09/2026'),
    contract('016/BK-2026', 'Chị Minh', 'Cắm mốc ranh thửa đất', 6_000_000, 0, 'Đang thực hiện', '15/09/2026'),
    contract('014/BK-2026', 'Anh Tuấn', 'Đo vẽ hiện trạng vị trí thửa đất', 9_000_000, 4_500_000, 'Đang thực hiện', '12/09/2026'),
    contract('010/BK-2026', 'Lê Thị Lan', 'Đo vẽ hiện trạng', 7_500_000, 0, 'Hoàn thành', '02/09/2026'),
  ],
  pagination: { page: 1, page_size: 15, total_pages: 1, total_groups: 5, total_contracts: 5 },
}
export const SERVICE_PACKAGES = {
  data: [
    { id: 'g-dove', code: 'DO_VE', name: 'Đo Vẽ', task_types: [{ id: 'tt-camoc', name: 'Cắm mốc' }, { id: 'tt-htr', name: 'Đo vẽ hiện trạng' }, { id: 'tt-tach', name: 'Tách thửa' }] },
    { id: 'g-phaply', code: 'PHAP_LY', name: 'Pháp Lý', task_types: [{ id: 'tt-capdoi', name: 'Cấp đổi sổ' }] },
  ],
}
export const CONTRACT_TEMPLATES = [{ id: 'do-dac-v1', code: 'MAU_HOP_DONG_DO_DAC_BACH_KHOA', version: 1, name: 'Mẫu hợp đồng đo đạc' }]
export const CHECKLIST_OPTIONS = { data: [
  { id: 'tpl-so', name: 'Giấy chứng nhận quyền sử dụng đất', is_required: true },
  { id: 'tpl-cccd', name: 'CCCD của chủ sử dụng đất', is_required: true },
] }
export const CONTRACT_ROUTES = [
  [/\/api\/contracts\/workspace-list$/, CONTRACTS],
  ['/api/config', { personnel: [], services: ['Đo vẽ hiện trạng', 'Cắm mốc', 'Tách thửa'] }],
  ['/api/catalog/service-packages', SERVICE_PACKAGES],
  ['/api/contracts/templates', CONTRACT_TEMPLATES],
  ['/api/contracts/next-code', { contract_id: '019/BK-2026' }],
  ['/api/survey-records/wards/provinces', [{ code: '79', name: 'TP. Hồ Chí Minh' }]],
  ['/api/survey-records/wards', [{ code: '26734', name: 'Phường Bến Thành' }, { code: '27010', name: 'Phường Tân Phong' }]],
  ['/api/document-register/checklist-options', CHECKLIST_OPTIONS],
]

// ── Luồng khách tự đăng ký & chốt deal ──
export const INTAKE_SUCCESS = {
  status: 'success',
  data: { lead_id: 'LEAD-7F3A21C9', customer_id: 'c-99', customer_name: 'Nguyễn Văn Bình', service_type: 'Đo hiện trạng vị trí', scale_info: '120 m²', message: 'Bách Khoa đã tiếp nhận yêu cầu của quý khách thành công.' },
}
export const LOYALTY_ELIGIBLE = {
  data: { eligible: true, discount_percent: 5, contract_count: 3, tier: { id: 't-1', tier_name: 'Khách thân thiết' } },
}

// ── Quay ngược bước: pháp lý ở K05b phát hiện bản vẽ sai ranh ──
export const LEGAL_USER = {
  id: 'u-legal', username: 'ttb', full_name: 'Trần Thị Bích', role_name: 'legal',
  default_workspace: 'employee', is_director: false,
  permissions: { legal_submission: { read: true }, wiki: { read: true } },
}
const RB_ITEM = {
  workflow_instance_id: 'wi-rb', service_line_id: 'sl-rb', service_line_name: 'Tách thửa',
  contract_id: '017/BK-2026', customer_name: 'Anh Cường', location_label: 'P. Bình An', priority: 'NORMAL',
  nodes: [
    { id: 'r1', node_code: 'K01', status: 'accepted', name: 'Tiếp nhận', mine: false, assignee_name: 'Lê Hoàng' },
    { id: 'r2', node_code: 'K02', status: 'accepted', name: 'Khảo sát & đo hiện trường', mine: false, assignee_name: 'Nguyễn Văn An' },
    { id: 'r3', node_code: 'K03', status: 'accepted', name: 'Chuẩn hoá tài liệu kỹ thuật', mine: false, assignee_name: 'Phạm Minh' },
    { id: 'r4', node_code: 'K04', status: 'accepted', name: 'Soạn bộ hồ sơ pháp lý', mine: true, assignee_name: 'Trần Thị Bích' },
    { id: 'r5', node_code: 'K05b', status: 'in_progress', name: 'Nộp & theo dõi hồ sơ một cửa', mine: true, assignee_name: 'Trần Thị Bích', amount: 150000 },
  ],
  current_task_node_id: 'r5', current_node_code: 'K05b', current_node_name: 'Nộp & theo dõi hồ sơ một cửa',
  current_node_status: 'in_progress', steps_total: 5, steps_done: 4, amount_total: 300000, amount_earned: 150000,
}
export const LEGAL_ME = {
  employee: { full_name: 'Trần Thị Bích', job_title: 'Chuyên viên Pháp lý', department: 'Pháp lý', is_active: true },
  tasks: [{
    id: 'r5', node_code: 'K05b', node_key: 'k05b', name: 'Nộp & theo dõi hồ sơ một cửa', allow_pause: true,
    description: 'Nộp hồ sơ tại bộ phận một cửa, nhập số biên nhận và theo dõi ngày hẹn trả.',
    status: 'in_progress', deadline_at: new Date(Date.now() + 3 * 86400000).toISOString(), contract_id: '017/BK-2026',
    checklist: [
      { id: 'k1', name: 'Nộp hồ sơ tại bộ phận một cửa', is_required: true, require_evidence: true, status: 'pending', evidence_files: [] },
      { id: 'k2', name: 'Cập nhật mã biên nhận & ngày hẹn', is_required: true, require_evidence: true, status: 'pending', evidence_files: [] },
    ],
  }],
  held_items: [RB_ITEM],
}
export const LEGAL_POOL = { department_code: 'LEGAL', items: [], help_items: [], restrictions: { active_in_progress: 0, held_items: 1, wip_limit: 3, wip_locked: false } }
export const ROLLBACK_PREVIEW = {
  target_task_node_id: 'r3',
  nodes: [
    { task_node_id: 'r3', node_code: 'K03', status: 'accepted', will_reset: true },
    { task_node_id: 'r4', node_code: 'K04', status: 'accepted', will_reset: true },
    { task_node_id: 'r5', node_code: 'K05b', status: 'in_progress', will_reset: true },
  ],
}
export const ROLLBACK_REQUESTS = { data: [{
  id: 'rb-1', service_line_name: 'Tách thửa', contract_id: '017/BK-2026', customer_name: 'Anh Cường',
  requested_by_name: 'Trần Thị Bích', node_code: 'K03', node_name: 'Chuẩn hoá tài liệu kỹ thuật', affected_count: 3,
  reason: 'Một cửa trả hồ sơ: bản vẽ sai ranh mốc số 4 giáp đường, diện tích lệch 2,3 m² so với sổ.',
  created_at: new Date().toISOString(),
}] }
