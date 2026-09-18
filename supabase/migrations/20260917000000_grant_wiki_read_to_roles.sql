-- Migration: Grant wiki.read.all to accountant, sales, survey_staff, legal_staff
-- Keep wiki.create.all and wiki.update.all restricted to admin / director.

begin;

-- 1. Ensure wiki permissions exist in permissions table
insert into public.permissions (code, resource_code, action_code, scope_code, name, description)
values
  ('wiki.read.all', 'wiki', 'read', 'all', 'Xem tài liệu nội bộ', 'Được phép xem và tải tài liệu Tri thức / ISO'),
  ('wiki.create.all', 'wiki', 'create', 'all', 'Tạo tài liệu nội bộ', 'Được phép đăng tài liệu Wiki mới'),
  ('wiki.update.all', 'wiki', 'update', 'all', 'Sửa tài liệu nội bộ', 'Được phép cập nhật tài liệu Wiki')
on conflict (code) do update
set
  resource_code = excluded.resource_code,
  action_code = excluded.action_code,
  scope_code = excluded.scope_code,
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

-- 2. Grant wiki.read.all to operational roles in normalized role_permission_grants
with role_map(role_name, permission_code) as (
  values
    ('accountant', 'wiki.read.all'),
    ('sales', 'wiki.read.all'),
    ('survey_staff', 'wiki.read.all'),
    ('legal_staff', 'wiki.read.all')
)
insert into public.role_permission_grants (role_id, permission_code, note)
select r.id, role_map.permission_code, 'Grant wiki read access to staff roles'
from role_map
join public.roles r on r.role_name = role_map.role_name
on conflict (role_id, permission_code) do nothing;

-- 3. Sync legacy role_permissions table for backward compatibility
with legacy_wiki(role_name, resource, can_read, can_create, can_update, can_delete, can_approve) as (
  values
    ('admin', 'wiki', true, true, true, true, true),
    ('accountant', 'wiki', true, false, false, false, false),
    ('sales', 'wiki', true, false, false, false, false),
    ('survey_staff', 'wiki', true, false, false, false, false),
    ('legal_staff', 'wiki', true, false, false, false, false)
)
insert into public.role_permissions (role_id, resource, can_read, can_create, can_update, can_delete, can_approve)
select r.id, lw.resource, lw.can_read, lw.can_create, lw.can_update, lw.can_delete, lw.can_approve
from legacy_wiki lw
join public.roles r on r.role_name = lw.role_name
on conflict (role_id, resource) do update
set
  can_read = excluded.can_read,
  can_create = excluded.can_create,
  can_update = excluded.can_update,
  can_delete = excluded.can_delete,
  can_approve = excluded.can_approve;

commit;
