-- Keep existing template rows readable while moving template binaries to a
-- private, S3-compatible object store such as Cloudflare R2.
begin;

alter table public.contract_templates
  add column if not exists template_storage_key text,
  add column if not exists storage_provider text not null default 's3-compatible';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contract_templates_storage_provider_check'
  ) then
    alter table public.contract_templates
      add constraint contract_templates_storage_provider_check
      check (storage_provider in ('s3-compatible')) not valid;
    alter table public.contract_templates
      validate constraint contract_templates_storage_provider_check;
  end if;
end $$;

commit;
