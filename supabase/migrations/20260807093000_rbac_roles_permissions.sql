-- Canonical RBAC model for Bach Khoa operations.
-- Admin is the director/business owner. Do not recreate redundant
-- customer_code or contract_number columns.

begin;

drop trigger if exists contracts_set_contract_number_from_id on public.contracts;
drop function if exists public.set_contract_number_from_id();
drop index if exists public.customers_customer_code_uidx;
drop index if exists public.contracts_contract_number_uidx;
alter table if exists public.customers drop column if exists customer_code;
alter table if exists public.contracts drop column if exists contract_number;
drop sequence if exists public.customer_code_seq;

alter table public.roles
  add column if not exists display_name text,
  add column if not exists description text,
  add column if not exists is_system boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create sequence if not exists public.roles_id_seq;
select setval(
  'public.roles_id_seq',
  greatest((select coalesce(max(id), 0) from public.roles), 1),
  true
);

alter table public.roles
  alter column id set default nextval('public.roles_id_seq');

insert into public.roles (role_name, display_name, description, is_system, is_active)
values
  ('admin', 'Giam doc / Quan tri', 'Toan quyen he thong va nghiep vu.', true, true),
  ('sales', 'Sale / CSKH', 'Quan ly lead, khach hang, hop dong thuong mai va request them dich vu.', true, true),
  ('survey_staff', 'Nhan vien do ve', 'Xu ly node/checklist do ve duoc giao, upload minh chung.', true, true),
  ('legal_staff', 'Nhan vien phap ly', 'Xu ly node/checklist phap ly, nop ho so, cap nhat bien nhan va tien do.', true, true),
  ('accountant', 'Ke toan', 'Quan ly thu chi, cong no, luong va du lieu tai chinh.', true, true)
on conflict (role_name) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  is_system = excluded.is_system,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.departments (id, name, code, is_active, display_order)
values
  ('dept_admin', 'Ban Giam doc', 'ADMIN', true, 1),
  ('dept_sales', 'Phong Sale / CSKH', 'SALES', true, 2),
  ('dept_dove', 'Phong Do ve', 'SURVEY', true, 3),
  ('dept_phaply', 'Phong Phap ly', 'LEGAL', true, 4),
  ('dept_ketoan', 'Phong Ke toan', 'ACCOUNTING', true, 5)
on conflict (id) do update
set
  name = excluded.name,
  code = excluded.code,
  is_active = excluded.is_active,
  display_order = excluded.display_order;

create table if not exists public.permission_resources (
  code text primary key,
  name text not null,
  description text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  code text primary key,
  resource_code text not null references public.permission_resources(code) on delete cascade,
  action_code text not null,
  scope_code text not null default 'all',
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource_code, action_code, scope_code),
  constraint permissions_action_code_check
    check (action_code ~ '^[a-z][a-z0-9_]*$'),
  constraint permissions_scope_code_check
    check (scope_code in ('all', 'own', 'assigned', 'related', 'department'))
);

create table if not exists public.role_permission_grants (
  role_id integer not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  granted_by varchar(50) references public.users(id),
  granted_at timestamptz not null default now(),
  note text,
  primary key (role_id, permission_code)
);

create table if not exists public.user_permission_overrides (
  user_id varchar(50) not null references public.users(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  effect text not null,
  reason text,
  expires_at timestamptz,
  created_by varchar(50) references public.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, permission_code),
  constraint user_permission_overrides_effect_check
    check (effect in ('allow', 'deny'))
);

create table if not exists public.role_scope_rules (
  role_id integer not null references public.roles(id) on delete cascade,
  resource_code text not null references public.permission_resources(code) on delete cascade,
  scope_code text not null,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role_id, resource_code, scope_code),
  constraint role_scope_rules_scope_code_check
    check (scope_code in ('all', 'own', 'assigned', 'related', 'department'))
);

insert into public.permission_resources (code, name, description, sort_order)
values
  ('crm', 'CRM / Lead', 'Lead pipeline va cham soc khach hang.', 10),
  ('customer', 'Khach hang', 'Thong tin khach hang da chuan hoa.', 20),
  ('customer_intake', 'Du lieu form khach hang', 'Du lieu tu Zalo OA / Google Form / Google Sheet truoc khi chuan hoa.', 30),
  ('contract', 'Hop dong', 'Hop dong, phu luc va file hop dong da render.', 40),
  ('service_line', 'Hang muc hop dong', 'Tung hang muc dich vu trong hop dong.', 50),
  ('workflow', 'Quy trinh', 'Workflow instance, revision va kich hoat quy trinh.', 60),
  ('task_node', 'Node cong viec', 'Node/chau cong viec trong workflow thuc te.', 70),
  ('checklist', 'Checklist', 'Checklist va ket qua nghiem thu trong node.', 80),
  ('evidence', 'Minh chung / Tai lieu', 'File minh chung, link Drive, scan giay to.', 90),
  ('finance', 'Tai chinh', 'Thu chi, cong no, dieu kien ban giao.', 100),
  ('payroll', 'Luong', 'Luong co ban, luong khoan, phu cap va khoa ky.', 110),
  ('hr', 'Nhan su', 'Nhan vien, phong ban, ho so nhan su.', 120),
  ('settings', 'Cau hinh', 'Cau hinh he thong va danh muc.', 130),
  ('user_admin', 'Tai khoan va phan quyen', 'Quan ly user, role va permission.', 140),
  ('wiki', 'Tai lieu noi bo', 'Wiki / tai lieu noi bo.', 150)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

insert into public.permissions (code, resource_code, action_code, scope_code, name, description)
values
  ('crm.read.all', 'crm', 'read', 'all', 'Xem CRM', null),
  ('crm.create.all', 'crm', 'create', 'all', 'Tao lead', null),
  ('crm.update.all', 'crm', 'update', 'all', 'Sua lead', null),
  ('customer.read.all', 'customer', 'read', 'all', 'Xem khach hang', null),
  ('customer.create.all', 'customer', 'create', 'all', 'Tao khach hang', null),
  ('customer.update.all', 'customer', 'update', 'all', 'Sua khach hang', null),
  ('customer_intake.read.all', 'customer_intake', 'read', 'all', 'Xem du lieu form', null),
  ('customer_intake.create.all', 'customer_intake', 'create', 'all', 'Nhap du lieu form', null),
  ('customer_intake.normalize.all', 'customer_intake', 'normalize', 'all', 'Chuan hoa du lieu form', null),
  ('customer_intake.approve.all', 'customer_intake', 'approve', 'all', 'Duyet du lieu form', null),
  ('contract.read.all', 'contract', 'read', 'all', 'Xem hop dong', null),
  ('contract.read.related', 'contract', 'read', 'related', 'Xem hop dong lien quan', null),
  ('contract.create.all', 'contract', 'create', 'all', 'Tao hop dong', null),
  ('contract.update.all', 'contract', 'update', 'all', 'Sua hop dong', null),
  ('contract.approve.all', 'contract', 'approve', 'all', 'Duyet hop dong/phu luc', null),
  ('contract.delete.all', 'contract', 'delete', 'all', 'Xoa/huy hop dong', null),
  ('service_line.read.all', 'service_line', 'read', 'all', 'Xem hang muc', null),
  ('service_line.read.related', 'service_line', 'read', 'related', 'Xem hang muc lien quan', null),
  ('service_line.create.all', 'service_line', 'create', 'all', 'Tao hang muc', null),
  ('service_line.update.all', 'service_line', 'update', 'all', 'Sua hang muc', null),
  ('service_line.approve.all', 'service_line', 'approve', 'all', 'Duyet hang muc/gia', null),
  ('workflow.read.all', 'workflow', 'read', 'all', 'Xem moi quy trinh', null),
  ('workflow.read.assigned', 'workflow', 'read', 'assigned', 'Xem quy trinh duoc giao', null),
  ('workflow.design.all', 'workflow', 'design', 'all', 'Thiet ke quy trinh', null),
  ('workflow.activate.all', 'workflow', 'activate', 'all', 'Kich hoat quy trinh', null),
  ('workflow.cancel.all', 'workflow', 'cancel', 'all', 'Huy quy trinh', null),
  ('task_node.read.all', 'task_node', 'read', 'all', 'Xem moi node', null),
  ('task_node.read.assigned', 'task_node', 'read', 'assigned', 'Xem node duoc giao', null),
  ('task_node.update.assigned', 'task_node', 'update', 'assigned', 'Cap nhat node duoc giao', null),
  ('task_node.assign.all', 'task_node', 'assign', 'all', 'Phan cong node', null),
  ('task_node.approve.all', 'task_node', 'approve', 'all', 'Nghiem thu node', null),
  ('checklist.read.all', 'checklist', 'read', 'all', 'Xem moi checklist', null),
  ('checklist.read.assigned', 'checklist', 'read', 'assigned', 'Xem checklist duoc giao', null),
  ('checklist.update.assigned', 'checklist', 'update', 'assigned', 'Cap nhat checklist duoc giao', null),
  ('checklist.approve.all', 'checklist', 'approve', 'all', 'Nghiem thu checklist', null),
  ('evidence.read.all', 'evidence', 'read', 'all', 'Xem moi minh chung', null),
  ('evidence.read.assigned', 'evidence', 'read', 'assigned', 'Xem minh chung duoc giao', null),
  ('evidence.create.assigned', 'evidence', 'create', 'assigned', 'Upload minh chung duoc giao', null),
  ('finance.read.all', 'finance', 'read', 'all', 'Xem tai chinh', null),
  ('finance.create.all', 'finance', 'create', 'all', 'Tao thu chi/cong no', null),
  ('finance.update.all', 'finance', 'update', 'all', 'Sua tai chinh', null),
  ('finance.approve.all', 'finance', 'approve', 'all', 'Duyet tai chinh', null),
  ('payroll.read.all', 'payroll', 'read', 'all', 'Xem toan bo luong', null),
  ('payroll.read.own', 'payroll', 'read', 'own', 'Xem luong ban than', null),
  ('payroll.calculate.all', 'payroll', 'calculate', 'all', 'Tinh luong', null),
  ('payroll.approve.all', 'payroll', 'approve', 'all', 'Duyet/khoa luong', null),
  ('hr.read.all', 'hr', 'read', 'all', 'Xem nhan su', null),
  ('hr.create.all', 'hr', 'create', 'all', 'Tao nhan vien', null),
  ('hr.update.all', 'hr', 'update', 'all', 'Sua nhan vien', null),
  ('hr.delete.all', 'hr', 'delete', 'all', 'Xoa/vo hieu hoa nhan vien', null),
  ('settings.read.all', 'settings', 'read', 'all', 'Xem cau hinh', null),
  ('settings.update.all', 'settings', 'update', 'all', 'Sua cau hinh', null),
  ('user_admin.read.all', 'user_admin', 'read', 'all', 'Xem tai khoan/quyen', null),
  ('user_admin.create.all', 'user_admin', 'create', 'all', 'Tao tai khoan/quyen', null),
  ('user_admin.update.all', 'user_admin', 'update', 'all', 'Sua tai khoan/quyen', null),
  ('user_admin.delete.all', 'user_admin', 'delete', 'all', 'Vo hieu hoa tai khoan/quyen', null),
  ('wiki.read.all', 'wiki', 'read', 'all', 'Xem tai lieu noi bo', null),
  ('wiki.create.all', 'wiki', 'create', 'all', 'Tao tai lieu noi bo', null),
  ('wiki.update.all', 'wiki', 'update', 'all', 'Sua tai lieu noi bo', null)
on conflict (code) do update
set
  resource_code = excluded.resource_code,
  action_code = excluded.action_code,
  scope_code = excluded.scope_code,
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

with admin_role as (
  select id from public.roles where role_name = 'admin'
)
insert into public.role_permission_grants (role_id, permission_code, note)
select admin_role.id, p.code, 'Admin/Giam doc toan quyen'
from admin_role
cross join public.permissions p
on conflict (role_id, permission_code) do nothing;

with role_map(role_name, permission_code) as (
  values
    ('sales', 'crm.read.all'),
    ('sales', 'crm.create.all'),
    ('sales', 'crm.update.all'),
    ('sales', 'customer.read.all'),
    ('sales', 'customer.create.all'),
    ('sales', 'customer.update.all'),
    ('sales', 'customer_intake.read.all'),
    ('sales', 'customer_intake.create.all'),
    ('sales', 'customer_intake.normalize.all'),
    ('sales', 'contract.read.all'),
    ('sales', 'contract.create.all'),
    ('sales', 'contract.update.all'),
    ('sales', 'service_line.read.all'),
    ('sales', 'service_line.create.all'),
    ('sales', 'service_line.update.all'),
    ('sales', 'payroll.read.own'),
    ('survey_staff', 'contract.read.related'),
    ('survey_staff', 'service_line.read.related'),
    ('survey_staff', 'workflow.read.assigned'),
    ('survey_staff', 'task_node.read.assigned'),
    ('survey_staff', 'task_node.update.assigned'),
    ('survey_staff', 'checklist.read.assigned'),
    ('survey_staff', 'checklist.update.assigned'),
    ('survey_staff', 'evidence.read.assigned'),
    ('survey_staff', 'evidence.create.assigned'),
    ('survey_staff', 'payroll.read.own'),
    ('legal_staff', 'contract.read.related'),
    ('legal_staff', 'service_line.read.related'),
    ('legal_staff', 'workflow.read.assigned'),
    ('legal_staff', 'task_node.read.assigned'),
    ('legal_staff', 'task_node.update.assigned'),
    ('legal_staff', 'checklist.read.assigned'),
    ('legal_staff', 'checklist.update.assigned'),
    ('legal_staff', 'evidence.read.assigned'),
    ('legal_staff', 'evidence.create.assigned'),
    ('legal_staff', 'payroll.read.own'),
    ('accountant', 'contract.read.all'),
    ('accountant', 'service_line.read.all'),
    ('accountant', 'finance.read.all'),
    ('accountant', 'finance.create.all'),
    ('accountant', 'finance.update.all'),
    ('accountant', 'payroll.read.all'),
    ('accountant', 'payroll.calculate.all'),
    ('accountant', 'payroll.read.own')
)
insert into public.role_permission_grants (role_id, permission_code, note)
select r.id, role_map.permission_code, 'Canonical Bach Khoa RBAC seed'
from role_map
join public.roles r on r.role_name = role_map.role_name
on conflict (role_id, permission_code) do nothing;

with scope_map(role_name, resource_code, scope_code, rules) as (
  values
    ('admin', 'contract', 'all', '{"reason":"admin_giam_doc_toan_quyen"}'::jsonb),
    ('admin', 'workflow', 'all', '{"reason":"admin_giam_doc_toan_quyen"}'::jsonb),
    ('admin', 'payroll', 'all', '{"reason":"admin_giam_doc_toan_quyen"}'::jsonb),
    ('sales', 'contract', 'related', '{"via":["sale_id","created_by","lead_assignee"]}'::jsonb),
    ('survey_staff', 'task_node', 'assigned', '{"via":["task_node_assignments","task_node_checklist_assignments"],"department":"SURVEY"}'::jsonb),
    ('survey_staff', 'workflow', 'assigned', '{"via":["task_node_assignments","task_node_checklist_assignments"],"department":"SURVEY"}'::jsonb),
    ('legal_staff', 'task_node', 'assigned', '{"via":["task_node_assignments","task_node_checklist_assignments"],"department":"LEGAL"}'::jsonb),
    ('legal_staff', 'workflow', 'assigned', '{"via":["task_node_assignments","task_node_checklist_assignments"],"department":"LEGAL"}'::jsonb),
    ('accountant', 'finance', 'all', '{"reason":"ke_toan_xem_tai_chinh"}'::jsonb),
    ('accountant', 'payroll', 'all', '{"except":["approve","lock_without_admin"]}'::jsonb)
)
insert into public.role_scope_rules (role_id, resource_code, scope_code, rules)
select r.id, scope_map.resource_code, scope_map.scope_code, scope_map.rules
from scope_map
join public.roles r on r.role_name = scope_map.role_name
on conflict (role_id, resource_code, scope_code) do update
set
  rules = excluded.rules,
  updated_at = now();

-- Keep the legacy role_permissions table in sync for current backend
-- endpoints that still use require_permission(resource, action).
with legacy_permissions(role_name, resource, can_read, can_create, can_update, can_delete, can_approve) as (
  values
    ('admin', 'crm', true, true, true, true, true),
    ('admin', 'customer', true, true, true, true, true),
    ('admin', 'customer_intake', true, true, true, true, true),
    ('admin', 'contract', true, true, true, true, true),
    ('admin', 'service_line', true, true, true, true, true),
    ('admin', 'workflow', true, true, true, true, true),
    ('admin', 'task_node', true, true, true, true, true),
    ('admin', 'checklist', true, true, true, true, true),
    ('admin', 'evidence', true, true, true, true, true),
    ('admin', 'finance', true, true, true, true, true),
    ('admin', 'payroll', true, true, true, true, true),
    ('admin', 'hr', true, true, true, true, true),
    ('admin', 'settings', true, true, true, true, true),
    ('admin', 'user_admin', true, true, true, true, true),
    ('admin', 'wiki', true, true, true, true, true),
    ('sales', 'crm', true, true, true, false, false),
    ('sales', 'customer', true, true, true, false, false),
    ('sales', 'customer_intake', true, true, true, false, false),
    ('sales', 'contract', true, true, true, false, false),
    ('sales', 'service_line', true, true, true, false, false),
    ('sales', 'payroll', true, false, false, false, false),
    ('survey_staff', 'contract', true, false, false, false, false),
    ('survey_staff', 'workflow', true, false, false, false, false),
    ('survey_staff', 'task_node', true, false, true, false, false),
    ('survey_staff', 'checklist', true, false, true, false, false),
    ('survey_staff', 'evidence', true, true, true, false, false),
    ('survey_staff', 'hoso', true, false, true, false, false),
    ('survey_staff', 'payroll', true, false, false, false, false),
    ('legal_staff', 'contract', true, false, false, false, false),
    ('legal_staff', 'workflow', true, false, false, false, false),
    ('legal_staff', 'task_node', true, false, true, false, false),
    ('legal_staff', 'checklist', true, false, true, false, false),
    ('legal_staff', 'evidence', true, true, true, false, false),
    ('legal_staff', 'hoso', true, false, true, false, false),
    ('legal_staff', 'payroll', true, false, false, false, false),
    ('accountant', 'contract', true, false, false, false, false),
    ('accountant', 'service_line', true, false, false, false, false),
    ('accountant', 'finance', true, true, true, false, false),
    ('accountant', 'payroll', true, true, true, false, false),
    ('accountant', 'hr', true, false, false, false, false)
)
insert into public.role_permissions (role_id, resource, can_read, can_create, can_update, can_delete, can_approve)
select r.id, lp.resource, lp.can_read, lp.can_create, lp.can_update, lp.can_delete, lp.can_approve
from legacy_permissions lp
join public.roles r on r.role_name = lp.role_name
on conflict (role_id, resource) do update
set
  can_read = excluded.can_read,
  can_create = excluded.can_create,
  can_update = excluded.can_update,
  can_delete = excluded.can_delete,
  can_approve = excluded.can_approve;

insert into public.user_roles (user_id, role_id)
select u.id, r.id
from public.users u
join public.roles r on r.role_name = 'admin'
where u.username = 'admin'
on conflict do nothing;

commit;
