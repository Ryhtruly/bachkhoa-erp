-- Remove four obsolete, empty tables after the workflow-instance migration.
-- DROP statements intentionally do not use CASCADE: unexpected dependencies
-- must stop this migration instead of being deleted implicitly.

do $$
begin
  if to_regclass('public.task_nodes_legacy_empty') is not null
     and exists (select 1 from public.task_nodes_legacy_empty limit 1) then
    raise exception 'task_nodes_legacy_empty is not empty; cleanup stopped';
  end if;

  if to_regclass('public.node_pay_rates_legacy_empty') is not null
     and exists (select 1 from public.node_pay_rates_legacy_empty limit 1) then
    raise exception 'node_pay_rates_legacy_empty is not empty; cleanup stopped';
  end if;

  if to_regclass('public.legal_submissions') is not null
     and exists (select 1 from public.legal_submissions limit 1) then
    raise exception 'legal_submissions is not empty; cleanup stopped';
  end if;

  if to_regclass('public.task_transitions') is not null
     and exists (select 1 from public.task_transitions limit 1) then
    raise exception 'task_transitions is not empty; cleanup stopped';
  end if;
end
$$;

-- task_pay_records remains for the next compatibility phase. Its optional
-- legacy Node link is removed so the empty legacy Node table can be dropped.
alter table if exists public.task_pay_records
  drop constraint if exists task_pay_records_task_node_id_fkey;

drop table if exists public.task_nodes_legacy_empty;
drop table if exists public.node_pay_rates_legacy_empty;
drop table if exists public.legal_submissions;
drop table if exists public.task_transitions;
