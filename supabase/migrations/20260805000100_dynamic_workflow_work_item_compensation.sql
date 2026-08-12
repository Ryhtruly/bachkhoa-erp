-- Required for exclusion constraints on varchar + daterange.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists internal;
revoke all on schema internal from public;
revoke all on schema internal from anon, authenticated;

-- The two old tables are empty and encode the obsolete ProjectTask payroll model.
do $$
begin
  if to_regclass('public.task_nodes') is not null
     and to_regclass('public.task_nodes_legacy_empty') is null then
    if exists (select 1 from public.task_nodes limit 1) then
      raise exception 'task_nodes is no longer empty; migration stopped';
    end if;
    alter table public.task_nodes rename to task_nodes_legacy_empty;
  end if;

  if to_regclass('public.node_pay_rates') is not null
     and to_regclass('public.node_pay_rates_legacy_empty') is null then
    if exists (select 1 from public.node_pay_rates limit 1) then
      raise exception 'node_pay_rates is no longer empty; migration stopped';
    end if;
    alter table public.node_pay_rates rename to node_pay_rates_legacy_empty;
  end if;
end
$$;

create table public.workflow_instances (
  id varchar(50) primary key default gen_random_uuid()::text,
  service_line_id varchar(50) not null references public.service_lines(id) on delete restrict,
  source_workflow_version_id varchar(50) references public.workflow_templates(id) on delete restrict,
  active_revision_id varchar(50),
  status text not null default 'not_started'
    check (status in ('not_started', 'running', 'paused', 'completed', 'cancelled')),
  created_by varchar(50) references public.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_instances_service_line_unique unique (service_line_id),
  constraint workflow_instances_completed_time_check check (
    status <> 'completed' or completed_at is not null
  )
);

create table public.workflow_instance_revisions (
  id varchar(50) primary key default gen_random_uuid()::text,
  workflow_instance_id varchar(50) not null references public.workflow_instances(id) on delete restrict,
  revision_no integer not null check (revision_no > 0),
  source_workflow_version_id varchar(50) references public.workflow_templates(id) on delete restrict,
  parent_revision_id varchar(50) references public.workflow_instance_revisions(id) on delete restrict,
  graph jsonb not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'superseded', 'discarded')),
  change_reason text,
  created_by varchar(50) references public.users(id) on delete set null,
  activated_by varchar(50) references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint workflow_instance_revisions_number_unique
    unique (workflow_instance_id, revision_no),
  constraint workflow_instance_revisions_instance_id_unique
    unique (workflow_instance_id, id),
  constraint workflow_instance_revisions_activation_check check (
    status not in ('active', 'superseded') or activated_at is not null
  )
);

create unique index workflow_instance_revisions_one_active_idx
  on public.workflow_instance_revisions (workflow_instance_id)
  where status = 'active';

create unique index workflow_instance_revisions_one_draft_idx
  on public.workflow_instance_revisions (workflow_instance_id)
  where status = 'draft';

alter table public.workflow_instances
  add constraint workflow_instances_active_revision_fkey
  foreign key (id, active_revision_id)
  references public.workflow_instance_revisions(workflow_instance_id, id)
  deferrable initially deferred;

create table public.task_nodes (
  id varchar(50) primary key default gen_random_uuid()::text,
  workflow_instance_id varchar(50) not null references public.workflow_instances(id) on delete restrict,
  defined_by_revision_id varchar(50) not null,
  node_key text not null,
  node_code varchar(10) not null references public.workflow_nodes(code) on delete restrict,
  occurrence_no integer not null default 1 check (occurrence_no > 0),
  status text not null default 'pending'
    check (status in (
      'pending', 'ready', 'in_progress', 'submitted', 'accepted',
      'rework_required', 'blocked', 'skipped', 'cancelled'
    )),
  outcome text,
  execution_data jsonb not null default '{}'::jsonb,
  planned_start timestamptz,
  planned_end timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  blocked_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_nodes_instance_key_occurrence_unique
    unique (workflow_instance_id, node_key, occurrence_no),
  constraint task_nodes_revision_fkey
    foreign key (workflow_instance_id, defined_by_revision_id)
    references public.workflow_instance_revisions(workflow_instance_id, id)
    on delete restrict,
  constraint task_nodes_schedule_check check (
    planned_end is null or planned_start is null or planned_end >= planned_start
  ),
  constraint task_nodes_accepted_time_check check (
    status <> 'accepted' or accepted_at is not null
  )
);

create table public.work_items (
  id varchar(50) primary key default gen_random_uuid()::text,
  code text not null unique,
  name text not null,
  department_id varchar(50) references public.departments(id) on delete set null,
  output_definition text,
  default_unit text not null default 'job',
  is_active boolean not null default true,
  created_by varchar(50) references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_items_code_format_check check (code ~ '^[A-Z][A-Z0-9_]*$')
);

create table public.work_item_rates (
  id varchar(50) primary key default gen_random_uuid()::text,
  work_item_id varchar(50) not null references public.work_items(id) on delete restrict,
  role_code text not null,
  amount numeric(15,2) not null check (amount >= 0),
  effective_from date not null,
  effective_to date,
  effective_period daterange generated always as (
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]')
  ) stored,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  approved_by varchar(50) references public.users(id) on delete set null,
  approved_at timestamptz,
  approval_source text not null default 'manual',
  source_note text,
  created_by varchar(50) references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint work_item_rates_role_format_check
    check (role_code ~ '^[A-Z][A-Z0-9_]*$'),
  constraint work_item_rates_date_check
    check (effective_to is null or effective_to >= effective_from),
  constraint work_item_rates_publication_check check (
    status <> 'published'
    or (
      approved_at is not null
      and (approved_by is not null or approval_source = 'migration_user_confirmed')
    )
  ),
  constraint work_item_rates_no_published_overlap exclude using gist (
    work_item_id with =,
    role_code with =,
    effective_period with &&
  ) where (status = 'published')
);

create table public.employee_compensation_terms (
  id varchar(50) primary key default gen_random_uuid()::text,
  employee_id varchar(50) not null references public.employees(id) on delete restrict,
  base_salary numeric(15,2) not null check (base_salary >= 0),
  effective_from date not null,
  effective_to date,
  effective_period daterange generated always as (
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]')
  ) stored,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'legacy_imported', 'archived')),
  source_type text not null default 'manual',
  source_snapshot jsonb not null default '{}'::jsonb,
  approved_by varchar(50) references public.users(id) on delete set null,
  approved_at timestamptz,
  notes text,
  created_by varchar(50) references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint employee_compensation_terms_date_check
    check (effective_to is null or effective_to >= effective_from),
  constraint employee_compensation_terms_publication_check check (
    status not in ('published', 'legacy_imported')
    or approved_at is not null
  ),
  constraint employee_compensation_terms_no_active_overlap exclude using gist (
    employee_id with =,
    effective_period with &&
  ) where (status in ('published', 'legacy_imported'))
);

create table public.task_node_checklist_results (
  id varchar(50) primary key default gen_random_uuid()::text,
  task_node_id varchar(50) not null references public.task_nodes(id) on delete restrict,
  checklist_key text not null,
  checklist_name text not null,
  is_required boolean not null default true,
  status text not null default 'pending'
    check (status in ('pending', 'passed', 'failed', 'not_applicable')),
  completed_by varchar(50) references public.users(id) on delete set null,
  completed_at timestamptz,
  evidence_data jsonb not null default '{}'::jsonb,
  note text,
  work_item_id varchar(50) references public.work_items(id) on delete restrict,
  is_payable boolean not null default false,
  pay_group_key text,
  pay_scope text
    check (pay_scope is null or pay_scope in ('ONCE_PER_WORKFLOW', 'PER_OCCURRENCE', 'MANUAL')),
  condition_result jsonb not null default '{}'::jsonb,
  pay_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_node_checklist_results_key_unique
    unique (task_node_id, checklist_key),
  constraint task_node_checklist_results_payable_check check (
    (not is_payable and work_item_id is null and pay_scope is null and pay_key is null)
    or
    (is_payable and work_item_id is not null and pay_scope is not null and pay_key is not null)
  ),
  constraint task_node_checklist_results_completion_check check (
    status not in ('passed', 'failed') or completed_at is not null
  )
);

create unique index task_node_checklist_results_one_passed_pay_group_idx
  on public.task_node_checklist_results (task_node_id, pay_group_key)
  where is_payable and status = 'passed' and pay_group_key is not null;

create table public.task_node_checklist_assignments (
  id varchar(50) primary key default gen_random_uuid()::text,
  checklist_result_id varchar(50) not null references public.task_node_checklist_results(id) on delete restrict,
  employee_id varchar(50) not null references public.employees(id) on delete restrict,
  role_code text not null,
  pay_slot text not null default 'PRIMARY',
  share_percent numeric(5,2) not null default 100
    check (share_percent > 0 and share_percent <= 100),
  work_item_rate_id varchar(50) references public.work_item_rates(id) on delete restrict,
  amount_override numeric(15,2) check (amount_override is null or amount_override >= 0),
  status text not null default 'proposed'
    check (status in ('proposed', 'assigned', 'completed', 'replaced', 'cancelled')),
  assigned_by varchar(50) references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  approved_by varchar(50) references public.users(id) on delete set null,
  approved_at timestamptz,
  ended_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_node_checklist_assignments_role_format_check
    check (role_code ~ '^[A-Z][A-Z0-9_]*$'),
  constraint task_node_checklist_assignments_pay_slot_format_check
    check (pay_slot ~ '^[A-Z][A-Z0-9_]*$'),
  constraint task_node_checklist_assignments_override_check check (
    amount_override is null or (approved_by is not null and approved_at is not null and reason is not null)
  ),
  constraint task_node_checklist_assignments_end_check check (
    status not in ('replaced', 'cancelled') or ended_at is not null
  )
);

create unique index task_node_checklist_assignments_active_slot_idx
  on public.task_node_checklist_assignments(checklist_result_id, role_code, pay_slot)
  where status not in ('replaced', 'cancelled');

create table public.task_node_assignments (
  id varchar(50) primary key default gen_random_uuid()::text,
  task_node_id varchar(50) not null references public.task_nodes(id) on delete restrict,
  employee_id varchar(50) not null references public.employees(id) on delete restrict,
  role_code text not null,
  is_primary boolean not null default false,
  assignment_status text not null default 'proposed'
    check (assignment_status in ('proposed', 'assigned', 'accepted', 'declined', 'completed', 'replaced')),
  planned_start timestamptz,
  planned_end timestamptz,
  assigned_by varchar(50) references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  replacement_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_node_assignments_role_format_check
    check (role_code ~ '^[A-Z][A-Z0-9_]*$'),
  constraint task_node_assignments_schedule_check check (
    planned_end is null or planned_start is null or planned_end >= planned_start
  )
);

create table public.task_node_acceptances (
  id varchar(50) primary key default gen_random_uuid()::text,
  task_node_id varchar(50) not null references public.task_nodes(id) on delete restrict,
  attempt_no integer not null check (attempt_no > 0),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rework_required', 'rejected')),
  submitted_by varchar(50) not null references public.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  reviewer_user_id varchar(50) references public.users(id) on delete set null,
  reviewed_at timestamptz,
  quality_score numeric(5,2) check (quality_score is null or (quality_score >= 0 and quality_score <= 100)),
  submission_payload jsonb not null default '{}'::jsonb,
  review_payload jsonb not null default '{}'::jsonb,
  review_note text,
  created_at timestamptz not null default now(),
  constraint task_node_acceptances_attempt_unique unique (task_node_id, attempt_no),
  constraint task_node_acceptances_review_check check (
    status = 'pending' or (reviewer_user_id is not null and reviewed_at is not null)
  )
);

create table public.task_node_events (
  id varchar(50) primary key default gen_random_uuid()::text,
  task_node_id varchar(50) not null references public.task_nodes(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id varchar(50) references public.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.work_pay_entitlements (
  id varchar(50) primary key default gen_random_uuid()::text,
  workflow_instance_id varchar(50) not null references public.workflow_instances(id) on delete restrict,
  task_node_id varchar(50) not null references public.task_nodes(id) on delete restrict,
  checklist_result_id varchar(50) not null references public.task_node_checklist_results(id) on delete restrict,
  checklist_assignment_id varchar(50) not null references public.task_node_checklist_assignments(id) on delete restrict,
  acceptance_id varchar(50) not null references public.task_node_acceptances(id) on delete restrict,
  work_item_rate_id varchar(50) not null references public.work_item_rates(id) on delete restrict,
  employee_id varchar(50) not null references public.employees(id) on delete restrict,
  role_code text not null,
  amount numeric(15,2) not null check (amount > 0),
  earned_at timestamptz not null,
  status text not null default 'eligible'
    check (status in ('eligible', 'approved', 'locked', 'void')),
  calculation_snapshot jsonb not null,
  idempotency_key text not null unique,
  approved_by varchar(50) references public.users(id) on delete set null,
  approved_at timestamptz,
  voided_by varchar(50) references public.users(id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  constraint work_pay_entitlements_approval_check check (
    status not in ('approved', 'locked') or (approved_by is not null and approved_at is not null)
  ),
  constraint work_pay_entitlements_void_check check (
    status <> 'void' or (voided_by is not null and voided_at is not null and void_reason is not null)
  )
);

create table public.employee_pay_adjustments (
  id varchar(50) primary key default gen_random_uuid()::text,
  employee_id varchar(50) not null references public.employees(id) on delete restrict,
  adjustment_type text not null
    check (adjustment_type in ('ALLOWANCE', 'BONUS', 'DEDUCTION', 'REIMBURSEMENT')),
  amount numeric(15,2) not null check (amount > 0),
  effective_date date not null,
  reason text not null,
  source_reference jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'locked', 'void')),
  created_by varchar(50) references public.users(id) on delete set null,
  approved_by varchar(50) references public.users(id) on delete set null,
  approved_at timestamptz,
  voided_by varchar(50) references public.users(id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  constraint employee_pay_adjustments_approval_check check (
    status not in ('approved', 'locked') or (approved_by is not null and approved_at is not null)
  ),
  constraint employee_pay_adjustments_void_check check (
    status <> 'void' or (voided_by is not null and voided_at is not null and void_reason is not null)
  )
);

-- Foreign-key and hot-path indexes. PostgreSQL does not create FK indexes automatically.
create index workflow_instances_source_version_idx on public.workflow_instances(source_workflow_version_id);
create index workflow_instances_active_revision_idx on public.workflow_instances(active_revision_id)
  where active_revision_id is not null;
create index workflow_instances_id_active_revision_idx
  on public.workflow_instances(id, active_revision_id);
create index workflow_instances_created_by_idx on public.workflow_instances(created_by)
  where created_by is not null;
create index workflow_instance_revisions_instance_idx on public.workflow_instance_revisions(workflow_instance_id);
create index workflow_instance_revisions_source_version_idx on public.workflow_instance_revisions(source_workflow_version_id);
create index workflow_instance_revisions_parent_idx on public.workflow_instance_revisions(parent_revision_id);
create index workflow_instance_revisions_created_by_idx on public.workflow_instance_revisions(created_by)
  where created_by is not null;
create index workflow_instance_revisions_activated_by_idx on public.workflow_instance_revisions(activated_by)
  where activated_by is not null;
create index task_nodes_instance_idx on public.task_nodes(workflow_instance_id);
create index task_nodes_revision_idx on public.task_nodes(defined_by_revision_id);
create index task_nodes_instance_revision_idx
  on public.task_nodes(workflow_instance_id, defined_by_revision_id);
create index task_nodes_node_code_idx on public.task_nodes(node_code);
create index task_nodes_open_schedule_idx on public.task_nodes(planned_start, planned_end)
  where status in ('ready', 'in_progress', 'submitted', 'blocked', 'rework_required');
create index work_items_department_idx on public.work_items(department_id);
create index work_items_created_by_idx on public.work_items(created_by)
  where created_by is not null;
create index work_item_rates_work_item_idx on public.work_item_rates(work_item_id);
create index work_item_rates_approved_by_idx on public.work_item_rates(approved_by)
  where approved_by is not null;
create index work_item_rates_created_by_idx on public.work_item_rates(created_by)
  where created_by is not null;
create index work_item_rates_published_idx on public.work_item_rates(work_item_id, role_code, effective_from)
  where status = 'published';
create index employee_compensation_terms_employee_idx on public.employee_compensation_terms(employee_id);
create index employee_compensation_terms_approved_by_idx on public.employee_compensation_terms(approved_by)
  where approved_by is not null;
create index employee_compensation_terms_created_by_idx on public.employee_compensation_terms(created_by)
  where created_by is not null;
create index task_node_checklist_results_node_idx on public.task_node_checklist_results(task_node_id);
create index task_node_checklist_results_completed_by_idx on public.task_node_checklist_results(completed_by)
  where completed_by is not null;
create index task_node_checklist_results_work_item_idx on public.task_node_checklist_results(work_item_id)
  where work_item_id is not null;
create index task_node_checklist_assignments_checklist_idx on public.task_node_checklist_assignments(checklist_result_id);
create index task_node_checklist_assignments_employee_idx on public.task_node_checklist_assignments(employee_id);
create index task_node_checklist_assignments_rate_idx on public.task_node_checklist_assignments(work_item_rate_id)
  where work_item_rate_id is not null;
create index task_node_checklist_assignments_assigned_by_idx on public.task_node_checklist_assignments(assigned_by)
  where assigned_by is not null;
create index task_node_checklist_assignments_approved_by_idx on public.task_node_checklist_assignments(approved_by)
  where approved_by is not null;
create index task_node_assignments_node_idx on public.task_node_assignments(task_node_id);
create index task_node_assignments_employee_schedule_idx
  on public.task_node_assignments(employee_id, assignment_status, planned_start);
create index task_node_assignments_assigned_by_idx on public.task_node_assignments(assigned_by)
  where assigned_by is not null;
create index task_node_acceptances_node_idx on public.task_node_acceptances(task_node_id);
create index task_node_acceptances_submitted_by_idx on public.task_node_acceptances(submitted_by);
create index task_node_acceptances_reviewer_idx on public.task_node_acceptances(reviewer_user_id)
  where reviewer_user_id is not null;
create index task_node_events_node_time_idx on public.task_node_events(task_node_id, created_at desc);
create index task_node_events_actor_idx on public.task_node_events(actor_user_id)
  where actor_user_id is not null;
create index work_pay_entitlements_employee_time_idx on public.work_pay_entitlements(employee_id, earned_at);
create index work_pay_entitlements_instance_idx on public.work_pay_entitlements(workflow_instance_id);
create index work_pay_entitlements_node_idx on public.work_pay_entitlements(task_node_id);
create index work_pay_entitlements_checklist_idx on public.work_pay_entitlements(checklist_result_id);
create index work_pay_entitlements_assignment_idx on public.work_pay_entitlements(checklist_assignment_id);
create index work_pay_entitlements_acceptance_idx on public.work_pay_entitlements(acceptance_id);
create index work_pay_entitlements_rate_idx on public.work_pay_entitlements(work_item_rate_id);
create index work_pay_entitlements_approved_by_idx on public.work_pay_entitlements(approved_by)
  where approved_by is not null;
create index work_pay_entitlements_voided_by_idx on public.work_pay_entitlements(voided_by)
  where voided_by is not null;
create index work_pay_entitlements_open_idx on public.work_pay_entitlements(employee_id, earned_at)
  where status in ('eligible', 'approved');
create index employee_pay_adjustments_employee_date_idx on public.employee_pay_adjustments(employee_id, effective_date);
create index employee_pay_adjustments_created_by_idx on public.employee_pay_adjustments(created_by)
  where created_by is not null;
create index employee_pay_adjustments_approved_by_idx on public.employee_pay_adjustments(approved_by)
  where approved_by is not null;
create index employee_pay_adjustments_voided_by_idx on public.employee_pay_adjustments(voided_by)
  where voided_by is not null;
create index employee_pay_adjustments_open_idx on public.employee_pay_adjustments(employee_id, effective_date)
  where status in ('draft', 'approved');

create or replace function internal.validate_checklist_assignment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_is_payable boolean;
  v_work_item_id varchar(50);
  v_rate_work_item_id varchar(50);
  v_rate_role text;
  v_rate_status text;
  v_other_share numeric(7,2);
begin
  select is_payable, work_item_id
    into v_is_payable, v_work_item_id
  from public.task_node_checklist_results
  where id = new.checklist_result_id;

  if not found then
    raise exception 'Checklist result % does not exist', new.checklist_result_id;
  end if;

  new.role_code := upper(new.role_code);

  perform pg_advisory_xact_lock(
    hashtextextended(new.checklist_result_id || ':' || new.role_code, 0)
  );

  select coalesce(sum(share_percent), 0)
    into v_other_share
  from public.task_node_checklist_assignments
  where checklist_result_id = new.checklist_result_id
    and role_code = new.role_code
    and status not in ('replaced', 'cancelled')
    and id <> new.id;

  if new.status not in ('replaced', 'cancelled')
     and v_other_share + new.share_percent > 100 then
    raise exception 'Total share for checklist % role % exceeds 100%%',
      new.checklist_result_id, new.role_code;
  end if;

  if new.work_item_rate_id is not null then
    select work_item_id, role_code, status
      into v_rate_work_item_id, v_rate_role, v_rate_status
    from public.work_item_rates
    where id = new.work_item_rate_id;

    if not found then
      raise exception 'Work item rate % does not exist', new.work_item_rate_id;
    end if;

    if not v_is_payable then
      raise exception 'A non-payable checklist cannot have a work item rate';
    end if;

    if v_rate_work_item_id <> v_work_item_id then
      raise exception 'Rate work item does not match checklist work item';
    end if;

    if v_rate_role <> new.role_code then
      raise exception 'Rate role % does not match assignment role %', v_rate_role, new.role_code;
    end if;

    if v_rate_status <> 'published' then
      raise exception 'Only a published work item rate can be assigned';
    end if;
  end if;

  if v_is_payable
     and new.status in ('assigned', 'completed')
     and new.approved_at is not null
     and new.work_item_rate_id is null then
    raise exception 'An approved payable assignment requires a published rate';
  end if;

  return new;
end
$$;

create trigger task_node_checklist_assignments_validate_trigger
before insert or update on public.task_node_checklist_assignments
for each row execute function internal.validate_checklist_assignment();

create or replace function internal.generate_work_pay_entitlements(
  p_acceptance_id varchar(50),
  p_actor_user_id varchar(50) default null
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_workflow_instance_id varchar(50);
  v_task_node_id varchar(50);
  v_earned_at timestamptz;
  v_inserted integer;
begin
  select n.workflow_instance_id, a.task_node_id, a.reviewed_at
    into v_workflow_instance_id, v_task_node_id, v_earned_at
  from public.task_node_acceptances a
  join public.task_nodes n on n.id = a.task_node_id
  where a.id = p_acceptance_id
    and a.status = 'accepted'
    and n.status = 'accepted';

  if not found then
    raise exception 'Acceptance % is not accepted or its node is not accepted', p_acceptance_id;
  end if;

  if exists (
    select 1
    from public.task_node_checklist_results c
    where c.task_node_id = v_task_node_id
      and c.is_required
      and c.status not in ('passed', 'not_applicable')
  ) then
    raise exception 'Node % still has required checklist items not passed', v_task_node_id;
  end if;

  with candidates as (
    select
      c.id as checklist_result_id,
      c.pay_key,
      c.pay_scope,
      c.checklist_name,
      ca.id as checklist_assignment_id,
      ca.employee_id,
      ca.role_code,
      ca.pay_slot,
      ca.share_percent,
      ca.amount_override,
      r.id as work_item_rate_id,
      r.amount as rate_amount,
      wi.code as work_item_code,
      wi.name as work_item_name,
      case
        when ca.amount_override is not null then ca.amount_override
        else round(r.amount * ca.share_percent / 100.0, 2)
      end as entitlement_amount,
      case
        when c.pay_scope = 'ONCE_PER_WORKFLOW' then concat_ws(':',
          'WORK', v_workflow_instance_id, c.pay_key, ca.role_code, ca.pay_slot
        )
        else concat_ws(':',
          'WORK', v_workflow_instance_id, v_task_node_id, c.pay_key, ca.role_code, ca.pay_slot
        )
      end as idempotency_key
    from public.task_node_checklist_results c
    join public.task_node_checklist_assignments ca
      on ca.checklist_result_id = c.id
     and ca.status in ('assigned', 'completed')
     and ca.approved_at is not null
    join public.work_item_rates r
      on r.id = ca.work_item_rate_id
     and r.status = 'published'
     and v_earned_at::date <@ r.effective_period
    join public.work_items wi on wi.id = c.work_item_id
    where c.task_node_id = v_task_node_id
      and c.is_payable
      and c.status = 'passed'
      and c.pay_scope <> 'MANUAL'
  ), inserted as (
    insert into public.work_pay_entitlements (
      workflow_instance_id,
      task_node_id,
      checklist_result_id,
      checklist_assignment_id,
      acceptance_id,
      work_item_rate_id,
      employee_id,
      role_code,
      amount,
      earned_at,
      status,
      calculation_snapshot,
      idempotency_key
    )
    select
      v_workflow_instance_id,
      v_task_node_id,
      checklist_result_id,
      checklist_assignment_id,
      p_acceptance_id,
      work_item_rate_id,
      employee_id,
      role_code,
      entitlement_amount,
      v_earned_at,
      'eligible',
      jsonb_build_object(
        'work_item_code', work_item_code,
        'work_item_name', work_item_name,
        'checklist_name', checklist_name,
        'rate_amount', rate_amount,
        'share_percent', share_percent,
        'pay_slot', pay_slot,
        'amount_override', amount_override,
        'generated_by', p_actor_user_id
      ),
      idempotency_key
    from candidates
    where entitlement_amount > 0
    on conflict (idempotency_key) do nothing
    returning 1
  )
  select count(*) into v_inserted from inserted;

  return v_inserted;
end
$$;

revoke all on function internal.validate_checklist_assignment() from public;
revoke all on function internal.generate_work_pay_entitlements(varchar, varchar) from public;
grant usage on schema internal to service_role;
grant execute on function internal.generate_work_pay_entitlements(varchar, varchar) to service_role;

-- Seed the approved work catalog. Submission delivery is a paid work item,
-- but it does not include lifecycle tracking after the agency visit.
insert into public.work_items (id, code, name, output_definition, default_unit)
values
  ('wi_survey_stakeout', 'SURVEY_STAKEOUT', 'Cắm mốc', 'Mốc được cắm và có minh chứng nghiệm thu', 'job'),
  ('wi_survey_completion', 'SURVEY_COMPLETION', 'Hoàn công', 'Sản phẩm kỹ thuật hoàn công được nghiệm thu', 'job'),
  ('wi_survey_certificate_reissue', 'SURVEY_CERTIFICATE_REISSUE', 'Cấp đổi', 'Sản phẩm đo vẽ phục vụ cấp đổi được nghiệm thu', 'job'),
  ('wi_survey_parcel_merge', 'SURVEY_PARCEL_MERGE', 'Hợp thửa', 'Sản phẩm kỹ thuật hợp thửa được nghiệm thu', 'job'),
  ('wi_survey_parcel_split', 'SURVEY_PARCEL_SPLIT', 'Tách thửa', 'Sản phẩm kỹ thuật tách thửa được nghiệm thu', 'job'),
  ('wi_survey_first_certificate', 'SURVEY_FIRST_CERTIFICATE', 'Cấp sổ lần đầu', 'Sản phẩm đo vẽ cấp sổ lần đầu được nghiệm thu', 'job'),
  ('wi_survey_land_use_change', 'SURVEY_LAND_USE_CHANGE', 'Chuyển mục đích', 'Sản phẩm đo vẽ chuyển mục đích được nghiệm thu', 'job'),
  ('wi_survey_gps', 'SURVEY_GPS', 'Đo GPS', 'Dữ liệu đo GPS và minh chứng hiện trường được nghiệm thu', 'job'),
  ('wi_survey_site_check', 'SURVEY_SITE_CHECK', 'Kiểm tra hiện trạng', 'Biên bản/kết quả kiểm tra hiện trạng được nghiệm thu', 'job'),
  ('wi_survey_drawing_adjust', 'SURVEY_DRAWING_ADJUST', 'Điều chỉnh bản vẽ', 'Bản vẽ điều chỉnh được nghiệm thu', 'job'),
  ('wi_construction_permit', 'CONSTRUCTION_PERMIT', 'Xin phép xây dựng', 'Bộ sản phẩm xin phép xây dựng được nghiệm thu', 'job'),
  ('wi_survey_area_confirm', 'SURVEY_AREA_CONFIRM', 'Xác định diện tích', 'Kết quả xác định diện tích được nghiệm thu', 'job'),
  ('wi_survey_custom_drawing', 'SURVEY_CUSTOM_DRAWING', 'Hỗ trợ vẽ theo yêu cầu', 'Sản phẩm vẽ theo yêu cầu được nghiệm thu', 'job'),
  ('wi_survey_field_visit', 'SURVEY_FIELD_VISIT', 'Khảo sát', 'Kết quả khảo sát được nghiệm thu', 'visit'),
  ('wi_legal_submission_delivery', 'LEGAL_SUBMISSION_DELIVERY', 'Đi nộp hồ sơ', 'Bộ hồ sơ được mang tới cơ quan và có minh chứng kết quả lần nộp; không bao gồm theo dõi vòng đời hồ sơ', 'visit')
on conflict (code) do nothing;

insert into public.work_item_rates (
  id, work_item_id, role_code, amount, effective_from, status,
  approved_at, approval_source, source_note
)
values
  ('wir_stakeout_main_20260805', 'wi_survey_stakeout', 'MAIN', 1200000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_stakeout_assistant_20260805', 'wi_survey_stakeout', 'ASSISTANT', 300000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_completion_main_20260805', 'wi_survey_completion', 'MAIN', 1100000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_completion_assistant_20260805', 'wi_survey_completion', 'ASSISTANT', 200000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_reissue_main_20260805', 'wi_survey_certificate_reissue', 'MAIN', 1100000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_reissue_assistant_20260805', 'wi_survey_certificate_reissue', 'ASSISTANT', 200000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_merge_main_20260805', 'wi_survey_parcel_merge', 'MAIN', 1200000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_merge_assistant_20260805', 'wi_survey_parcel_merge', 'ASSISTANT', 200000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_split_main_20260805', 'wi_survey_parcel_split', 'MAIN', 900000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_split_assistant_20260805', 'wi_survey_parcel_split', 'ASSISTANT', 200000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_first_certificate_main_20260805', 'wi_survey_first_certificate', 'MAIN', 1100000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_first_certificate_assistant_20260805', 'wi_survey_first_certificate', 'ASSISTANT', 200000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_land_use_main_20260805', 'wi_survey_land_use_change', 'MAIN', 1100000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_land_use_assistant_20260805', 'wi_survey_land_use_change', 'ASSISTANT', 200000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_gps_main_20260805', 'wi_survey_gps', 'MAIN', 1200000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_gps_assistant_20260805', 'wi_survey_gps', 'ASSISTANT', 0, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_site_check_main_20260805', 'wi_survey_site_check', 'MAIN', 300000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_site_check_assistant_20260805', 'wi_survey_site_check', 'ASSISTANT', 150000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_drawing_adjust_main_20260805', 'wi_survey_drawing_adjust', 'MAIN', 500000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_drawing_adjust_assistant_20260805', 'wi_survey_drawing_adjust', 'ASSISTANT', 0, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_permit_main_20260805', 'wi_construction_permit', 'MAIN', 1500000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_permit_assistant_20260805', 'wi_construction_permit', 'ASSISTANT', 0, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_area_main_20260805', 'wi_survey_area_confirm', 'MAIN', 700000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_area_assistant_20260805', 'wi_survey_area_confirm', 'ASSISTANT', 200000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_custom_drawing_main_20260805', 'wi_survey_custom_drawing', 'MAIN', 350000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_field_visit_main_20260805', 'wi_survey_field_visit', 'MAIN', 400000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Bảng khoán người dùng xác nhận ngày 05/08/2026'),
  ('wir_submission_delivery_20260805', 'wi_legal_submission_delivery', 'SUBMITTER', 350000, date '2026-08-05', 'published', now(), 'migration_user_confirmed', 'Đi nộp tại cơ quan, không bao gồm theo dõi vòng đời hồ sơ; người dùng xác nhận ngày 05/08/2026')
on conflict (id) do nothing;

-- Preserve each employee's current base salary as an auditable imported term.
insert into public.employee_compensation_terms (
  employee_id,
  base_salary,
  effective_from,
  status,
  source_type,
  source_snapshot,
  approved_at,
  notes
)
select
  e.id,
  e.base_salary,
  date '2026-08-05',
  'legacy_imported',
  'employees_base_salary_snapshot',
  jsonb_build_object('employees.base_salary', e.base_salary, 'imported_at', now()),
  now(),
  'Imported from employees.base_salary during additive migration; review in payroll redesign.'
from public.employees e
where e.base_salary is not null
  and not exists (
    select 1
    from public.employee_compensation_terms t
    where t.employee_id = e.id
      and t.status in ('published', 'legacy_imported')
      and date '2026-08-05' <@ t.effective_period
  );

-- New public tables are deny-by-default for the Data API. Backend direct DB access remains possible.
alter table public.workflow_instances enable row level security;
alter table public.workflow_instance_revisions enable row level security;
alter table public.task_nodes enable row level security;
alter table public.work_items enable row level security;
alter table public.work_item_rates enable row level security;
alter table public.employee_compensation_terms enable row level security;
alter table public.task_node_checklist_results enable row level security;
alter table public.task_node_checklist_assignments enable row level security;
alter table public.task_node_assignments enable row level security;
alter table public.task_node_acceptances enable row level security;
alter table public.task_node_events enable row level security;
alter table public.work_pay_entitlements enable row level security;
alter table public.employee_pay_adjustments enable row level security;

revoke all on public.workflow_instances from anon, authenticated;
revoke all on public.workflow_instance_revisions from anon, authenticated;
revoke all on public.task_nodes from anon, authenticated;
revoke all on public.work_items from anon, authenticated;
revoke all on public.work_item_rates from anon, authenticated;
revoke all on public.employee_compensation_terms from anon, authenticated;
revoke all on public.task_node_checklist_results from anon, authenticated;
revoke all on public.task_node_checklist_assignments from anon, authenticated;
revoke all on public.task_node_assignments from anon, authenticated;
revoke all on public.task_node_acceptances from anon, authenticated;
revoke all on public.task_node_events from anon, authenticated;
revoke all on public.work_pay_entitlements from anon, authenticated;
revoke all on public.employee_pay_adjustments from anon, authenticated;
