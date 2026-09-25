-- Contract template management: upload lifecycle metadata, content integrity
-- checks, and single-published-version enforcement.
--
-- Everything runs in one transaction: the LOCK, the read-only preflight, the
-- DDL, the backfill, and the constraint/index creation succeed or fail
-- together. All object names are unqualified — the deployment runner applies
-- this with search_path on public, the test runner points search_path at an
-- isolated schema. Never add SET search_path here.
--
-- Deploy BEFORE the backend version that reads the new columns.

begin;

lock table contract_templates in share row exclusive mode;

-- Preflight (read-only): fail fast with actionable diagnostics instead of
-- leaving a half-migrated catalog. Any exception stops the deployment.
do $$
declare
  _dup_codes text;
  _missing_keys text;
begin
  select string_agg(code, ', ') into _dup_codes
  from (
    select code from contract_templates
    where status = 'published'
    group by code having count(*) > 1
  ) dup;

  if _dup_codes is not null then
    raise exception 'Resolve duplicate published template codes before migration: %', _dup_codes;
  end if;

  select string_agg(id, ', ') into _missing_keys
  from contract_templates
  where status in ('published', 'archived')
    and nullif(btrim(template_storage_key), '') is null;

  if _missing_keys is not null then
    raise exception 'Resolve published/archived templates without storage keys: %', _missing_keys;
  end if;
end
$$;

alter table contract_templates
  add column if not exists upload_state text,
  add column if not exists content_sha256 varchar(64),
  add column if not exists content_size bigint,
  add column if not exists publish_requested boolean not null default false;

-- Backfill from the only signal available locally: a stored object key means a
-- previous upload completed; anything else must be retried explicitly through
-- the management API. No business-status changes, no object downloads.
update contract_templates
set upload_state = case when nullif(btrim(template_storage_key), '') is null
                        then 'failed' else 'ready' end
where upload_state is null;

alter table contract_templates alter column upload_state set default 'ready';
alter table contract_templates alter column upload_state set not null;

-- Named CHECK constraints, guarded on (conrelid, conname) so reruns stay
-- idempotent. The pre-existing status CHECK and the (code, version) unique
-- constraint are preserved untouched.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contract_templates_upload_state_check'
      and conrelid = 'contract_templates'::regclass
  ) then
    alter table contract_templates
      add constraint contract_templates_upload_state_check
      check (upload_state in ('pending', 'ready', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'contract_templates_upload_state_status_check'
      and conrelid = 'contract_templates'::regclass
  ) then
    alter table contract_templates
      add constraint contract_templates_upload_state_status_check
      check (upload_state = 'ready' or status = 'draft');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'contract_templates_ready_requires_key_check'
      and conrelid = 'contract_templates'::regclass
  ) then
    alter table contract_templates
      add constraint contract_templates_ready_requires_key_check
      check (upload_state <> 'ready' or nullif(btrim(template_storage_key), '') is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'contract_templates_content_integrity_check'
      and conrelid = 'contract_templates'::regclass
  ) then
    alter table contract_templates
      add constraint contract_templates_content_integrity_check
      check ((content_sha256 is null and content_size is null) or
             (content_sha256 is not null and content_size is not null and
              content_sha256 ~ '^[0-9a-f]{64}$' and content_size between 1 and 20971520));
  end if;
end
$$;

-- One published version per template code. Drafts and archived history are
-- unaffected, so version gaps and rollback stays possible.
create unique index if not exists uq_contract_templates_published_code
  on contract_templates (code) where status = 'published';

commit;
