-- Contract template generation support for Bach Khoa service contracts.
-- This migration keeps existing contract/customer data intact, then adds the
-- fields required to render DOCX templates with a historical data snapshot.

begin;

alter table public.customers
  add column if not exists customer_code text,
  add column if not exists customer_type text default 'individual',
  add column if not exists preferred_contact_channel text,
  add column if not exists id_card_number varchar,
  add column if not exists id_card_date date,
  add column if not exists id_card_place varchar,
  add column if not exists email varchar,
  add column if not exists zalo_phone varchar,
  add column if not exists representative_name varchar,
  add column if not exists representative_role varchar,
  add column if not exists source_channel text,
  add column if not exists source_reference jsonb default '{}'::jsonb,
  add column if not exists data_quality_status text default 'unverified',
  add column if not exists identity_verified_at timestamptz,
  add column if not exists identity_verified_by varchar(50) references public.users(id);

with numbered_customers as (
  select
    id,
    'KH-' || lpad(row_number() over (order by created_at nulls last, id)::text, 6, '0') as generated_code
  from public.customers
  where customer_code is null
)
update public.customers c
set customer_code = numbered_customers.generated_code
from numbered_customers
where c.id = numbered_customers.id;

create sequence if not exists public.customer_code_seq;

select setval(
  'public.customer_code_seq',
  greatest((select count(*) from public.customers), 1),
  true
);

alter table public.customers
  alter column customer_code set default ('KH-' || lpad(nextval('public.customer_code_seq')::text, 6, '0'));

alter table public.customers
  alter column customer_code set not null,
  alter column customer_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customers_customer_type_check'
  ) then
    alter table public.customers
      add constraint customers_customer_type_check
      check (customer_type in ('individual', 'business'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'customers_data_quality_status_check'
  ) then
    alter table public.customers
      add constraint customers_data_quality_status_check
      check (data_quality_status in ('unverified', 'needs_review', 'verified', 'rejected'));
  end if;
end $$;

create unique index if not exists customers_customer_code_uidx
  on public.customers (customer_code);

alter table public.contracts
  add column if not exists contract_number text,
  add column if not exists effective_date date,
  add column if not exists signing_place text,
  add column if not exists vat_policy text default 'not_included',
  add column if not exists vat_rate numeric(5,2),
  add column if not exists vat_note text,
  add column if not exists appendix_summary text,
  add column if not exists copies_total integer default 2,
  add column if not exists copies_party_a integer default 1,
  add column if not exists copies_party_b integer default 1,
  add column if not exists page_count integer,
  add column if not exists late_payment_days integer,
  add column if not exists refund_period_days integer,
  add column if not exists remedy_period_days integer,
  add column if not exists acceptance_period_days integer,
  add column if not exists response_period_days integer;

update public.contracts
set
  contract_number = coalesce(contract_number, id),
  effective_date = coalesce(effective_date, date_signed)
where contract_number is null
   or effective_date is null;

alter table public.contracts
  alter column contract_number set not null;

create or replace function public.set_contract_number_from_id()
returns trigger
language plpgsql
as $$
begin
  if new.contract_number is null or btrim(new.contract_number) = '' then
    new.contract_number := new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_set_contract_number_from_id on public.contracts;
create trigger contracts_set_contract_number_from_id
before insert or update of contract_number, id on public.contracts
for each row
execute function public.set_contract_number_from_id();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contracts_vat_policy_check'
  ) then
    alter table public.contracts
      add constraint contracts_vat_policy_check
      check (vat_policy in ('included', 'not_included', 'exempt', 'custom'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'contracts_copies_total_positive'
  ) then
    alter table public.contracts
      add constraint contracts_copies_total_positive
      check (copies_total is null or copies_total > 0);
  end if;
end $$;

create unique index if not exists contracts_contract_number_uidx
  on public.contracts (contract_number);

alter table public.service_lines
  add column if not exists land_owner_name varchar,
  add column if not exists property_certificate_number varchar,
  add column if not exists property_address text,
  add column if not exists property_metadata jsonb default '{}'::jsonb;

create table if not exists public.customer_intake_submissions (
  id varchar(50) primary key default gen_random_uuid()::text,
  source_channel text not null default 'google_form',
  google_form_id text,
  google_response_id text,
  sheet_id text,
  worksheet_name text,
  sheet_row_number integer,
  submitted_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  status text not null default 'new',
  linked_customer_id varchar(50) references public.customers(id),
  linked_lead_id varchar(50) references public.leads_pipeline(id),
  linked_contract_id varchar(50) references public.contracts(id),
  linked_service_line_id varchar(50) references public.service_lines(id),
  processed_by varchar(50) references public.users(id),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_intake_submissions_source_channel_check
    check (source_channel in ('zalo_oa', 'google_form', 'google_sheet', 'manual', 'import')),
  constraint customer_intake_submissions_status_check
    check (status in ('new', 'normalized', 'needs_review', 'converted', 'duplicate', 'rejected'))
);

create unique index if not exists customer_intake_google_response_uidx
  on public.customer_intake_submissions (google_form_id, google_response_id)
  where google_form_id is not null and google_response_id is not null;

create unique index if not exists customer_intake_sheet_row_uidx
  on public.customer_intake_submissions (sheet_id, worksheet_name, sheet_row_number)
  where sheet_id is not null and worksheet_name is not null and sheet_row_number is not null;

create index if not exists customer_intake_status_idx
  on public.customer_intake_submissions (status);

create index if not exists customer_intake_linked_customer_idx
  on public.customer_intake_submissions (linked_customer_id);

create table if not exists public.contract_templates (
  id varchar(50) primary key default gen_random_uuid()::text,
  code text not null,
  version integer not null default 1,
  name text not null,
  description text,
  template_file_name text,
  template_file_link text,
  placeholder_schema jsonb not null default '[]'::jsonb,
  render_rules jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_by varchar(50) references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, version),
  constraint contract_templates_status_check
    check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.contract_appendices (
  id varchar(50) primary key default gen_random_uuid()::text,
  contract_id varchar(50) not null references public.contracts(id) on delete cascade,
  appendix_code text not null,
  title text not null,
  file_link text,
  status text not null default 'draft',
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, appendix_code),
  constraint contract_appendices_status_check
    check (status in ('draft', 'issued', 'signed', 'void'))
);

create table if not exists public.contract_generated_documents (
  id varchar(50) primary key default gen_random_uuid()::text,
  contract_id varchar(50) not null references public.contracts(id) on delete cascade,
  template_id varchar(50) references public.contract_templates(id),
  status text not null default 'draft',
  output_file_link text,
  output_file_name text,
  render_data_snapshot jsonb not null default '{}'::jsonb,
  generated_by varchar(50) references public.users(id),
  generated_at timestamptz,
  signed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_generated_documents_status_check
    check (status in ('draft', 'generated', 'signed', 'void'))
);

create index if not exists contract_appendices_contract_id_idx
  on public.contract_appendices (contract_id);

create index if not exists contract_generated_documents_contract_id_idx
  on public.contract_generated_documents (contract_id);

create index if not exists contract_generated_documents_template_id_idx
  on public.contract_generated_documents (template_id);

insert into public.contract_templates (
  code,
  version,
  name,
  description,
  template_file_name,
  placeholder_schema,
  render_rules,
  status
)
values (
  'HOP_DONG_DICH_VU_KHUNG_BACH_KHOA',
  1,
  'Hop dong dich vu khung Bach Khoa 2026',
  'Mau khung dung chung cho dich vu do dac, phap ly nha dat va xay dung.',
  '01_Hop_dong_dich_vu_khung_Bach_Khoa_2026.docx',
  '[
    {"placeholder":"TEN_BEN_A","source":"customers.full_name"},
    {"placeholder":"CCCD_HOAC_MST_BEN_A","source":"customers.id_card_number|customers.tax_id"},
    {"placeholder":"NGAY_CAP","source":"customers.id_card_date"},
    {"placeholder":"NOI_CAP","source":"customers.id_card_place"},
    {"placeholder":"DIA_CHI_BEN_A","source":"customers.address"},
    {"placeholder":"DIEN_THOAI_BEN_A","source":"customers.phone"},
    {"placeholder":"EMAIL_ZALO_BEN_A","source":"customers.email|customers.zalo_phone"},
    {"placeholder":"DAI_DIEN_BEN_A","source":"customers.representative_name"},
    {"placeholder":"CHUC_VU_BEN_A","source":"customers.representative_role"},
    {"placeholder":"SO_HOP_DONG","source":"contracts.contract_number"},
    {"placeholder":"NGAY_HIEU_LUC","source":"contracts.effective_date"},
    {"placeholder":"DIA_DIEM_KY","source":"contracts.signing_place"},
    {"placeholder":"TONG_GIA_TRI_HOP_DONG","source":"contracts.total_value"},
    {"placeholder":"DA_BAO_GOM_HAY_CHUA_BAO_GOM_VAT","source":"contracts.vat_policy"},
    {"placeholder":"MA_TEN_PHU_LUC_KEM_THEO","source":"contract_appendices"},
    {"placeholder":"SO_BAN","source":"contracts.copies_total"},
    {"placeholder":"SO_BAN_BEN_A","source":"contracts.copies_party_a"},
    {"placeholder":"SO_BAN_BEN_B","source":"contracts.copies_party_b"},
    {"placeholder":"SO_TRANG","source":"contracts.page_count"},
    {"placeholder":"SO_NGAY_CHAM_THANH_TOAN","source":"contracts.late_payment_days"},
    {"placeholder":"THOI_HAN_HOAN_TIEN","source":"contracts.refund_period_days"},
    {"placeholder":"THOI_HAN_KHAC_PHUC","source":"contracts.remedy_period_days"},
    {"placeholder":"THOI_HAN_NGHIEM_THU","source":"contracts.acceptance_period_days"},
    {"placeholder":"THOI_HAN_PHAN_HOI","source":"contracts.response_period_days"}
  ]'::jsonb,
  '{
    "date_parts": {
      "NGAY": "contracts.date_signed.day",
      "THANG": "contracts.date_signed.month",
      "NAM": "contracts.date_signed.year"
    },
    "vat_labels": {
      "included": "da bao gom VAT",
      "not_included": "chua bao gom VAT",
      "exempt": "khong ap dung VAT",
      "custom": "theo thoa thuan rieng"
    }
  }'::jsonb,
  'published'
)
on conflict (code, version) do update
set
  name = excluded.name,
  description = excluded.description,
  template_file_name = excluded.template_file_name,
  placeholder_schema = excluded.placeholder_schema,
  render_rules = excluded.render_rules,
  status = excluded.status,
  updated_at = now();

commit;
