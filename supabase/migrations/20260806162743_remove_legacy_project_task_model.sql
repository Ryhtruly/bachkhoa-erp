-- Permanently remove the legacy ProjectTask-based execution/payroll model.
-- The canonical runtime is now:
-- contracts -> service_lines -> workflow_instances -> workflow_instance_revisions
-- -> task_nodes -> checklist/assignments/acceptances/events/pay entitlements.
--
-- DROP statements intentionally do not use CASCADE. Unexpected dependencies
-- must stop the migration instead of silently deleting unrelated objects.

set lock_timeout = '5s';
set statement_timeout = '30s';

do $$
begin
  if to_regclass('public.service_lines') is null
     or to_regclass('public.workflow_instances') is null
     or to_regclass('public.workflow_instance_revisions') is null
     or to_regclass('public.task_nodes') is null
     or to_regclass('public.work_pay_entitlements') is null then
    raise exception 'Canonical workflow model is incomplete; legacy cleanup stopped';
  end if;

  -- These foreign-key columns belong to otherwise valid finance/chat tables.
  -- Stop instead of discarding a real relationship created after the audit.
  if to_regclass('public.cashflow_transactions') is not null
     and exists (
       select 1 from public.cashflow_transactions
       where project_id is not null
       limit 1
     ) then
    raise exception 'cashflow_transactions.project_id contains data; legacy cleanup stopped';
  end if;

  if to_regclass('public.chat_rooms') is not null
     and exists (
       select 1 from public.chat_rooms
       where related_task_id is not null
       limit 1
     ) then
    raise exception 'chat_rooms.related_task_id contains data; legacy cleanup stopped';
  end if;

  -- The audited legacy child tables were empty. A newly inserted row means the
  -- old runtime is still writing and the destructive cutover must be reviewed.
  if to_regclass('public.task_submissions') is not null
     and exists (select 1 from public.task_submissions limit 1) then
    raise exception 'task_submissions is no longer empty; legacy cleanup stopped';
  end if;

  if to_regclass('public.task_pay_records') is not null
     and exists (select 1 from public.task_pay_records limit 1) then
    raise exception 'task_pay_records is no longer empty; legacy cleanup stopped';
  end if;

  if to_regclass('public.payroll_adjustments') is not null
     and exists (select 1 from public.payroll_adjustments limit 1) then
    raise exception 'payroll_adjustments is no longer empty; legacy cleanup stopped';
  end if;

  if to_regclass('public.kpi_payroll') is not null
     and exists (select 1 from public.kpi_payroll limit 1) then
    raise exception 'kpi_payroll is no longer empty; legacy cleanup stopped';
  end if;

  if to_regclass('public.stake_rates') is not null
     and exists (select 1 from public.stake_rates limit 1) then
    raise exception 'stake_rates is no longer empty; legacy cleanup stopped';
  end if;
end
$$;

-- Remove the two unused foreign keys without removing their parent
-- finance/chat tables. The nullable identifier columns stay temporarily so
-- the independent finance/chat APIs can be cut over without a same-release
-- ORM column mismatch; both columns were verified to contain no values.
alter table if exists public.cashflow_transactions
  drop constraint if exists cashflow_transactions_project_id_fkey;

alter table if exists public.chat_rooms
  drop constraint if exists chat_rooms_related_task_id_fkey;

-- Drop child tables before projects_tasks so every dependency is explicit.
drop table if exists public.task_submissions;
drop table if exists public.task_pay_records;
drop table if exists public.payroll_adjustments;
drop table if exists public.kpi_payroll;
drop table if exists public.stake_rates;
drop table if exists public.task_type_rates;
drop table if exists public.projects_tasks;
