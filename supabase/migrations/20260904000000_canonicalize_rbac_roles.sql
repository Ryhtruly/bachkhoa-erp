-- Canonicalize legacy role names without deleting role rows that may be useful
-- for historical audit data.  Runtime authorization must only use active
-- canonical roles; this migration is intentionally idempotent.

begin;

insert into public.roles (role_name, display_name, description, is_system, is_active)
values
  ('admin', 'Giam doc / Quan tri', 'Toan quyen he thong va nghiep vu.', true, true),
  ('accountant', 'Ke toan', 'Quan ly thu chi, cong no, luong va du lieu tai chinh.', true, true),
  ('sales', 'Sale / CSKH', 'Quan ly lead, khach hang va hop dong thuong mai.', true, true),
  ('survey_staff', 'Nhan vien do ve', 'Xu ly cong viec do ve duoc giao.', true, true),
  ('legal_staff', 'Nhan vien phap ly', 'Xu ly cong viec phap ly duoc giao.', true, true)
on conflict (role_name) do update
set is_active = true,
    updated_at = now();

-- Preserve direct role permissions and normalized grants when an alias had
-- custom permissions. Canonical seed data wins on conflicts, so this cannot
-- silently broaden a canonical role's policy.
with role_map(alias_name, canonical_name) as (
  values
    ('director', 'admin'),
    ('giam_doc', 'admin'),
    ('giám đốc', 'admin'),
    ('kế toán', 'accountant'),
    ('ke_toan', 'accountant')
),
alias_permissions as (
  select distinct on (target.id, legacy.resource)
    target.id as role_id,
    legacy.resource,
    legacy.can_read,
    legacy.can_create,
    legacy.can_update,
    legacy.can_delete,
    legacy.can_approve
  from role_map
  join public.roles source
    on lower(source.role_name) = role_map.alias_name
  join public.roles target
    on target.role_name = role_map.canonical_name
  join public.role_permissions legacy
    on legacy.role_id = source.id
  order by target.id, legacy.resource, source.id
)
insert into public.role_permissions (
  role_id, resource, can_read, can_create, can_update, can_delete, can_approve
)
select role_id, resource, can_read, can_create, can_update, can_delete, can_approve
from alias_permissions
on conflict (role_id, resource) do nothing;

with role_map(alias_name, canonical_name) as (
  values
    ('director', 'admin'),
    ('giam_doc', 'admin'),
    ('giám đốc', 'admin'),
    ('kế toán', 'accountant'),
    ('ke_toan', 'accountant')
),
alias_grants as (
  select distinct on (target.id, legacy.permission_code)
    target.id as role_id,
    legacy.permission_code,
    legacy.granted_by,
    legacy.granted_at,
    legacy.note
  from role_map
  join public.roles source
    on lower(source.role_name) = role_map.alias_name
  join public.roles target
    on target.role_name = role_map.canonical_name
  join public.role_permission_grants legacy
    on legacy.role_id = source.id
  order by target.id, legacy.permission_code, source.id
)
insert into public.role_permission_grants (
  role_id, permission_code, granted_by, granted_at, note
)
select role_id, permission_code, granted_by, granted_at, note
from alias_grants
on conflict (role_id, permission_code) do nothing;

with role_map(alias_name, canonical_name) as (
  values
    ('director', 'admin'),
    ('giam_doc', 'admin'),
    ('giám đốc', 'admin'),
    ('kế toán', 'accountant'),
    ('ke_toan', 'accountant')
),
alias_scopes as (
  select distinct on (target.id, legacy.resource_code, legacy.scope_code)
    target.id as role_id,
    legacy.resource_code,
    legacy.scope_code,
    legacy.rules
  from role_map
  join public.roles source
    on lower(source.role_name) = role_map.alias_name
  join public.roles target
    on target.role_name = role_map.canonical_name
  join public.role_scope_rules legacy
    on legacy.role_id = source.id
  order by target.id, legacy.resource_code, legacy.scope_code, source.id
)
insert into public.role_scope_rules (role_id, resource_code, scope_code, rules)
select role_id, resource_code, scope_code, rules
from alias_scopes
on conflict (role_id, resource_code, scope_code) do nothing;

-- Re-point users first. This is safe to re-run because user_roles has a
-- composite primary key and the canonical relation is inserted idempotently.
with role_map(alias_name, canonical_name) as (
  values
    ('director', 'admin'),
    ('giam_doc', 'admin'),
    ('giám đốc', 'admin'),
    ('kế toán', 'accountant'),
    ('ke_toan', 'accountant')
)
insert into public.user_roles (user_id, role_id)
select ur.user_id, target.id
from public.user_roles ur
join public.roles source
  on source.id = ur.role_id
join role_map
  on lower(source.role_name) = role_map.alias_name
join public.roles target
  on target.role_name = role_map.canonical_name
on conflict (user_id, role_id) do nothing;

with role_map(alias_name) as (
  values ('director'), ('giam_doc'), ('giám đốc'), ('kế toán'), ('ke_toan')
)
delete from public.user_roles ur
using public.roles source, role_map
where ur.role_id = source.id
  and lower(source.role_name) = role_map.alias_name;

with role_map(alias_name) as (
  values ('director'), ('giam_doc'), ('giám đốc'), ('kế toán'), ('ke_toan')
)
update public.roles source
set is_active = false,
    updated_at = now()
from role_map
where lower(source.role_name) = role_map.alias_name;

-- `employee` was a stale application default, not a canonical RBAC role. Fail
-- closed if an existing account still uses it: silently guessing a department
-- would grant the wrong business permissions. The operator can assign one of
-- the canonical roles and re-run this idempotent migration.
do $$
begin
  if exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where lower(r.role_name) = 'employee'
  ) then
    raise exception
      'Cannot deactivate legacy employee role while it is assigned; assign a canonical role first';
  end if;

  update public.roles
  set is_active = false,
      updated_at = now()
  where lower(role_name) = 'employee';
end;
$$;

commit;
