-- Runtime-created document types identify a reusable template by normalized
-- name + source. The previous index omitted source and compared raw names, so
-- valid same-name/different-source templates collided while case/spacing
-- variants could coexist.

begin;

alter table public.document_checklist_templates
  add column if not exists is_identity_owner boolean not null default true;

drop index if exists public.document_checklist_templates_unique;

-- Historical case/spacing duplicates may already exist because the old index
-- compared raw names. Preserve every row and every reference; designate one
-- deterministic canonical owner per logical identity instead of deleting or
-- merging records referenced by immutable workflow revisions.
with ranked as (
  select id,
         row_number() over (
           partition by coalesce(task_type_id, '~chung~'),
                        lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')),
                        source
           order by is_active desc, created_at, id
         ) as identity_rank
  from public.document_checklist_templates
)
update public.document_checklist_templates t
set is_identity_owner = (ranked.identity_rank = 1)
from ranked
where ranked.id = t.id;

create unique index document_checklist_templates_unique
  on public.document_checklist_templates (
    coalesce(task_type_id, '~chung~'),
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')),
    source
  )
  where is_identity_owner;

comment on column public.document_checklist_templates.is_identity_owner is
  'Canonical row for normalized task scope + name + source. Historical duplicate rows remain referenced but cannot create new logical duplicates.';

commit;
