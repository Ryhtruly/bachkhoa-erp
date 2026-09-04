create table public.checklist_result_document_types (
  id varchar primary key default gen_random_uuid()::text,
  checklist_result_id varchar not null references public.task_node_checklist_results(id) on delete cascade,
  template_id varchar references public.document_checklist_templates(id),
  slot_id varchar references public.dossier_document_slots(id),
  name varchar not null,
  normalized_name varchar not null,
  source varchar not null check (source in ('KHACH_HANG','CONG_TY','CO_QUAN')),
  origin varchar not null check (origin in ('CONFIGURED','EMPLOYEE_CREATED')),
  status varchar not null default 'draft'
    check (status in ('draft','pending_review','approved','rejected')),
  rejection_reason text,
  promoted_template_id varchar references public.document_checklist_templates(id),
  is_active boolean not null default true,
  created_by varchar references public.users(id),
  reviewed_by varchar references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (status <> 'rejected' or nullif(trim(rejection_reason), '') is not null)
);

create unique index ux_checklist_document_type_active_name_source
  on public.checklist_result_document_types
  (checklist_result_id, normalized_name, source) where is_active;

-- Existing runtime checklists predate document-type materialization. Rebuild
-- their configured rows from each Node's immutable defining revision, while
-- preserving catalog names and sources as truth.
insert into public.checklist_result_document_types
    (checklist_result_id, template_id, name, normalized_name, source, origin, status)
select cr.id,
       t.id,
       t.name,
       lower(regexp_replace(btrim(t.name), '[[:space:]]+', ' ', 'g')),
       t.source,
       'CONFIGURED',
       'draft'
from public.task_node_checklist_results cr
join public.task_nodes n on n.id = cr.task_node_id
join public.workflow_instance_revisions r_defined
  on r_defined.workflow_instance_id = n.workflow_instance_id
 and r_defined.id = n.defined_by_revision_id
cross join lateral jsonb_array_elements(coalesce(
  r_defined.graph->'nodes'->n.node_key->'checklist',
  '[]'::jsonb
)) checklist_item
cross join lateral jsonb_array_elements(coalesce(
  checklist_item->'output_documents', '[]'::jsonb
)) output_document
join public.document_checklist_templates t
  on t.id = output_document->>'template_id'
where checklist_item->>'key' = cr.checklist_key
on conflict (checklist_result_id, normalized_name, source) where is_active
do nothing;

create table public.checklist_result_document_type_files (
  id varchar primary key default gen_random_uuid()::text,
  document_type_id varchar not null
    references public.checklist_result_document_types(id) on delete cascade,
  document_id varchar not null references public.dossier_documents(id) on delete restrict,
  is_active boolean not null default true,
  created_by varchar references public.users(id),
  removed_by varchar references public.users(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);

create unique index ux_checklist_document_type_file_active
  on public.checklist_result_document_type_files (document_type_id, document_id)
  where is_active;

alter table public.checklist_result_document_types enable row level security;
alter table public.checklist_result_document_type_files enable row level security;

alter table public.document_template_applicabilities
  drop constraint if exists document_template_applicabilities_shape_check;
alter table public.document_template_applicabilities
  add constraint document_template_applicabilities_shape_check
  check (
    (applicability_type = 'GLOBAL'
      and service_package_id is null and task_type_id is null)
    or (applicability_type = 'PACKAGE'
      and service_package_id is not null and task_type_id is null)
    or (applicability_type = 'TASK_TYPE'
      and task_type_id is not null and service_package_id is null)
    or (applicability_type = 'COMBO'
      and service_package_id is not null
      and task_type_id is not null
      and node_code is not null)
  );

create unique index ux_tpl_app_combo
  on public.document_template_applicabilities
  (template_id, service_package_id, task_type_id, node_code)
  where applicability_type = 'COMBO';
