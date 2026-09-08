-- Localize human-facing RBAC/template data to Vietnamese with accents.
-- Keep machine-facing identifiers in clear English:
-- role_name, code, resource_code, action_code, scope_code, department code.

begin;

update public.roles
set
  display_name = case role_name
    when 'admin' then 'Giám đốc / Quản trị'
    when 'sales' then 'Sale / CSKH'
    when 'survey_staff' then 'Nhân viên đo vẽ'
    when 'legal_staff' then 'Nhân viên pháp lý'
    when 'accountant' then 'Kế toán'
    else display_name
  end,
  description = case role_name
    when 'admin' then 'Toàn quyền hệ thống và toàn quyền nghiệp vụ.'
    when 'sales' then 'Quản lý lead, khách hàng, hợp đồng thương mại và yêu cầu thêm dịch vụ.'
    when 'survey_staff' then 'Xử lý node/checklist đo vẽ được giao và upload minh chứng.'
    when 'legal_staff' then 'Xử lý node/checklist pháp lý, nộp hồ sơ, cập nhật biên nhận và tiến độ.'
    when 'accountant' then 'Quản lý thu chi, công nợ, lương và dữ liệu tài chính.'
    else description
  end,
  updated_at = now()
where role_name in ('admin', 'sales', 'survey_staff', 'legal_staff', 'accountant');

insert into public.departments (id, name, code, is_active, display_order)
values
  ('dept_admin', 'Ban Giám đốc', 'ADMIN', true, 1),
  ('dept_sales', 'Phòng Sale / CSKH', 'SALES', true, 2),
  ('dept_dove', 'Phòng Đo vẽ', 'SURVEY', true, 3),
  ('dept_phaply', 'Phòng Pháp lý', 'LEGAL', true, 4),
  ('dept_ketoan', 'Phòng Kế toán', 'ACCOUNTING', true, 5)
on conflict (id) do update
set
  name = excluded.name,
  code = excluded.code,
  is_active = excluded.is_active,
  display_order = excluded.display_order;

insert into public.permission_resources (code, name, description, sort_order)
values
  ('crm', 'CRM / Lead', 'Lead pipeline và chăm sóc khách hàng.', 10),
  ('customer', 'Khách hàng', 'Thông tin khách hàng đã chuẩn hóa.', 20),
  ('customer_intake', 'Dữ liệu form khách hàng', 'Dữ liệu từ Zalo OA / Google Form / Google Sheet trước khi chuẩn hóa.', 30),
  ('contract', 'Hợp đồng', 'Hợp đồng, phụ lục và file hợp đồng đã render.', 40),
  ('service_line', 'Hạng mục hợp đồng', 'Từng hạng mục dịch vụ trong hợp đồng.', 50),
  ('workflow', 'Quy trình', 'Workflow instance, revision và kích hoạt quy trình.', 60),
  ('task_node', 'Node công việc', 'Node/cụm công việc trong workflow thực tế.', 70),
  ('checklist', 'Checklist', 'Checklist và kết quả nghiệm thu trong node.', 80),
  ('evidence', 'Minh chứng / Tài liệu', 'File minh chứng, link Drive, scan giấy tờ.', 90),
  ('finance', 'Tài chính', 'Thu chi, công nợ, điều kiện bàn giao.', 100),
  ('payroll', 'Lương', 'Lương cơ bản, lương khoán, phụ cấp và khóa kỳ.', 110),
  ('hr', 'Nhân sự', 'Nhân viên, phòng ban, hồ sơ nhân sự.', 120),
  ('settings', 'Cấu hình', 'Cấu hình hệ thống và danh mục.', 130),
  ('user_admin', 'Tài khoản và phân quyền', 'Quản lý user, role và permission.', 140),
  ('wiki', 'Tài liệu nội bộ', 'Wiki / tài liệu nội bộ.', 150)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

update public.permissions
set
  name = case code
    when 'crm.read.all' then 'Xem CRM'
    when 'crm.create.all' then 'Tạo lead'
    when 'crm.update.all' then 'Sửa lead'
    when 'customer.read.all' then 'Xem khách hàng'
    when 'customer.create.all' then 'Tạo khách hàng'
    when 'customer.update.all' then 'Sửa khách hàng'
    when 'customer_intake.read.all' then 'Xem dữ liệu form'
    when 'customer_intake.create.all' then 'Nhập dữ liệu form'
    when 'customer_intake.normalize.all' then 'Chuẩn hóa dữ liệu form'
    when 'customer_intake.approve.all' then 'Duyệt dữ liệu form'
    when 'contract.read.all' then 'Xem toàn bộ hợp đồng'
    when 'contract.read.related' then 'Xem hợp đồng liên quan'
    when 'contract.create.all' then 'Tạo hợp đồng'
    when 'contract.update.all' then 'Sửa hợp đồng'
    when 'contract.approve.all' then 'Duyệt hợp đồng/phụ lục'
    when 'contract.delete.all' then 'Xóa/hủy hợp đồng'
    when 'service_line.read.all' then 'Xem toàn bộ hạng mục'
    when 'service_line.read.related' then 'Xem hạng mục liên quan'
    when 'service_line.create.all' then 'Tạo hạng mục'
    when 'service_line.update.all' then 'Sửa hạng mục'
    when 'service_line.approve.all' then 'Duyệt hạng mục/giá'
    when 'workflow.read.all' then 'Xem toàn bộ quy trình'
    when 'workflow.read.assigned' then 'Xem quy trình được giao'
    when 'workflow.design.all' then 'Thiết kế quy trình'
    when 'workflow.activate.all' then 'Kích hoạt quy trình'
    when 'workflow.cancel.all' then 'Hủy quy trình'
    when 'task_node.read.all' then 'Xem toàn bộ node'
    when 'task_node.read.assigned' then 'Xem node được giao'
    when 'task_node.update.assigned' then 'Cập nhật node được giao'
    when 'task_node.assign.all' then 'Phân công node'
    when 'task_node.approve.all' then 'Nghiệm thu node'
    when 'checklist.read.all' then 'Xem toàn bộ checklist'
    when 'checklist.read.assigned' then 'Xem checklist được giao'
    when 'checklist.update.assigned' then 'Cập nhật checklist được giao'
    when 'checklist.approve.all' then 'Nghiệm thu checklist'
    when 'evidence.read.all' then 'Xem toàn bộ minh chứng'
    when 'evidence.read.assigned' then 'Xem minh chứng được giao'
    when 'evidence.create.assigned' then 'Upload minh chứng được giao'
    when 'finance.read.all' then 'Xem tài chính'
    when 'finance.create.all' then 'Tạo thu chi/công nợ'
    when 'finance.update.all' then 'Sửa tài chính'
    when 'finance.approve.all' then 'Duyệt tài chính'
    when 'payroll.read.all' then 'Xem toàn bộ lương'
    when 'payroll.read.own' then 'Xem lương bản thân'
    when 'payroll.calculate.all' then 'Tính lương'
    when 'payroll.approve.all' then 'Duyệt/khóa lương'
    when 'hr.read.all' then 'Xem nhân sự'
    when 'hr.create.all' then 'Tạo nhân viên'
    when 'hr.update.all' then 'Sửa nhân viên'
    when 'hr.delete.all' then 'Xóa/vô hiệu hóa nhân viên'
    when 'settings.read.all' then 'Xem cấu hình'
    when 'settings.update.all' then 'Sửa cấu hình'
    when 'user_admin.read.all' then 'Xem tài khoản/quyền'
    when 'user_admin.create.all' then 'Tạo tài khoản/quyền'
    when 'user_admin.update.all' then 'Sửa tài khoản/quyền'
    when 'user_admin.delete.all' then 'Vô hiệu hóa tài khoản/quyền'
    when 'wiki.read.all' then 'Xem tài liệu nội bộ'
    when 'wiki.create.all' then 'Tạo tài liệu nội bộ'
    when 'wiki.update.all' then 'Sửa tài liệu nội bộ'
    else name
  end,
  updated_at = now();

update public.role_permission_grants
set note = case
  when note = 'Admin/Giam doc toan quyen' then 'Admin/Giám đốc toàn quyền'
  when note = 'Canonical Bach Khoa RBAC seed' then 'Seed phân quyền chuẩn Bách Khoa'
  else note
end;

update public.contract_templates
set
  name = 'Hợp đồng dịch vụ khung Bách Khoa 2026',
  description = 'Mẫu khung dùng chung cho dịch vụ đo đạc, pháp lý nhà đất và xây dựng.',
  render_rules = jsonb_set(
    render_rules,
    '{vat_labels}',
    '{
      "included": "đã bao gồm VAT",
      "not_included": "chưa bao gồm VAT",
      "exempt": "không áp dụng VAT",
      "custom": "theo thỏa thuận riêng"
    }'::jsonb,
    true
  ),
  updated_at = now()
where code = 'HOP_DONG_DICH_VU_KHUNG_BACH_KHOA';

commit;
