-- Sổ giấy tờ hồ sơ: danh mục có trước, tệp scan gắn vào sau.
-- Hai tầng — sổ gốc ở HỢP ĐỒNG (giấy khách cung cấp), sổ thủ tục ở HẠNG MỤC
-- (giấy công ty soạn + cơ quan trả). Xem migration kế tiếp cho bộ mẫu.

create table if not exists public.document_checklist_templates (
  id varchar primary key default gen_random_uuid()::text,
  task_type_id varchar references public.task_types(id) on delete cascade,
  name varchar not null,
  source varchar not null,
  is_required boolean not null default true,
  needs_original boolean not null default false,
  default_quantity integer not null default 1,
  sort_order integer not null default 0,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_checklist_templates_source_check
    check (source in ('KHACH_HANG', 'CONG_TY', 'CO_QUAN'))
);

create unique index if not exists document_checklist_templates_unique
  on public.document_checklist_templates (coalesce(task_type_id, '~chung~'), name);

create table if not exists public.dossier_document_slots (
  id varchar primary key default gen_random_uuid()::text,
  scope varchar not null,
  contract_id varchar not null references public.contracts(id) on delete cascade,
  service_line_id varchar references public.service_lines(id) on delete cascade,
  template_id varchar references public.document_checklist_templates(id) on delete set null,
  name varchar not null,
  source varchar not null,
  is_required boolean not null default true,
  needs_original boolean not null default false,
  quantity integer not null default 1,
  copy_type varchar,
  storage_place varchar,
  status varchar not null default 'CHUA_CO',
  note text,
  sort_order integer not null default 0,
  updated_by varchar,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dossier_document_slots_scope_check
    check (scope in ('CONTRACT', 'SERVICE_LINE')),
  constraint dossier_document_slots_source_check
    check (source in ('KHACH_HANG', 'CONG_TY', 'CO_QUAN')),
  constraint dossier_document_slots_copy_type_check
    check (copy_type is null or copy_type in ('BAN_CHINH', 'BAN_SAO', 'BAN_SAO_Y')),
  constraint dossier_document_slots_status_check
    check (status in ('CHUA_CO', 'DA_NHAN', 'DA_KY', 'DA_SCAN', 'DA_NOP', 'BI_TRA_LAI')),
  constraint dossier_document_slots_anchor_check
    check (
      (scope = 'CONTRACT' and service_line_id is null)
      or (scope = 'SERVICE_LINE' and service_line_id is not null)
    )
);

create index if not exists dossier_document_slots_contract_idx
  on public.dossier_document_slots (contract_id, scope, sort_order);
create index if not exists dossier_document_slots_service_line_idx
  on public.dossier_document_slots (service_line_id) where service_line_id is not null;

-- Kho tệp cũ chỉ phục vụ pháp lý; đo vẽ nay cũng dùng, và có thêm tầng hợp đồng.
alter table if exists public.legal_dossier_documents rename to dossier_documents;

alter table public.dossier_documents
  add column if not exists slot_id varchar references public.dossier_document_slots(id) on delete set null,
  add column if not exists scope varchar not null default 'SERVICE_LINE';

alter table public.dossier_documents alter column dossier_id drop not null;
alter table public.dossier_documents alter column service_line_id drop not null;

alter table public.dossier_documents
  drop constraint if exists legal_dossier_documents_stage_check;
alter table public.dossier_documents
  add constraint dossier_documents_stage_check
  check (stage in ('ho-so-goc', 'chuan-hoa-ky-thuat', 'soan-ho-so', 'nop-co-quan', 'ket-qua'));

create index if not exists dossier_documents_slot_idx
  on public.dossier_documents (slot_id);
