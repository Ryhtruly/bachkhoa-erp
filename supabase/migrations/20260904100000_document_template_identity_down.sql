begin;

drop index if exists public.document_checklist_templates_unique;

-- The legacy index cannot represent two sources with the exact same raw name.
-- Keep every template and every foreign/JSON reference intact; only disambiguate
-- later rows before restoring the old two-column identity.
with ranked as (
  select id,
         row_number() over (
           partition by coalesce(task_type_id, '~chung~'), name
           order by created_at, id
         ) as legacy_rank
  from public.document_checklist_templates
)
update public.document_checklist_templates t
set name = t.name || ' [' || t.source || ' · ' || t.id || ']'
from ranked
where ranked.id = t.id and ranked.legacy_rank > 1;

alter table public.document_checklist_templates
  drop column if exists is_identity_owner;

create unique index document_checklist_templates_unique
  on public.document_checklist_templates (coalesce(task_type_id, '~chung~'), name);

commit;
