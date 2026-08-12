-- Cancellation is a terminal, auditable state. It never deletes revisions,
-- runtime evidence, accepted work, or earned compensation.
set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.workflow_instances
  add column if not exists cancellation_code text,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_data jsonb not null default '{}'::jsonb,
  add column if not exists cancelled_by varchar(50),
  add column if not exists cancelled_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_instances_cancelled_by_fkey'
      and conrelid = 'public.workflow_instances'::regclass
  ) then
    alter table public.workflow_instances
      add constraint workflow_instances_cancelled_by_fkey
      foreign key (cancelled_by) references public.users(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_instances_cancellation_code_check'
      and conrelid = 'public.workflow_instances'::regclass
  ) then
    alter table public.workflow_instances
      add constraint workflow_instances_cancellation_code_check check (
        cancellation_code is null or cancellation_code in (
          'CUSTOMER_REQUEST',
          'DUPLICATE_OR_ERROR',
          'CONTRACT_TERMINATED',
          'SCOPE_CHANGED',
          'OTHER'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_instances_cancellation_audit_check'
      and conrelid = 'public.workflow_instances'::regclass
  ) then
    alter table public.workflow_instances
      add constraint workflow_instances_cancellation_audit_check check (
        status <> 'cancelled'
        or (
          cancellation_code is not null
          and nullif(btrim(cancellation_reason), '') is not null
          and cancelled_by is not null
          and cancelled_at is not null
          and jsonb_typeof(cancellation_data) = 'object'
        )
      );
  end if;
end
$$;

create index if not exists workflow_instances_cancelled_by_idx
  on public.workflow_instances(cancelled_by)
  where cancelled_by is not null;

-- A cancelled assignment is different from reassignment: the employee was
-- released because the whole workflow stopped, not replaced by another person.
alter table public.task_node_assignments
  drop constraint if exists task_node_assignments_assignment_status_check;

alter table public.task_node_assignments
  add constraint task_node_assignments_assignment_status_check check (
    assignment_status in (
      'proposed', 'assigned', 'accepted', 'declined',
      'completed', 'replaced', 'cancelled'
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_node_assignments_cancelled_end_check'
      and conrelid = 'public.task_node_assignments'::regclass
  ) then
    alter table public.task_node_assignments
      add constraint task_node_assignments_cancelled_end_check check (
        assignment_status <> 'cancelled' or ended_at is not null
      );
  end if;
end
$$;
