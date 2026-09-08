begin;

alter table if exists public.payroll_periods
  add column if not exists snapshot jsonb;

comment on column public.payroll_periods.snapshot is
  'Immutable per-employee totals captured when the period is locked.';

create table if not exists public.advance_requests (
  id varchar(50) primary key default gen_random_uuid()::text,
  employee_id varchar(50) not null references public.employees(id) on delete restrict,
  requested_by_user_id varchar(50) not null references public.users(id) on delete restrict,
  project_id varchar(50) references public.service_lines(id) on delete set null,
  contract_id varchar(50) references public.contracts(id) on delete set null,
  amount numeric(15,2) not null check (amount > 0),
  payment_method text not null default 'CASH',
  note text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'DIRECTOR_APPROVED', 'REJECTED', 'ISSUED')),
  reviewed_by_user_id varchar(50) references public.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  official_transaction_id varchar(50) unique references public.cashflow_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advance_requests_review_check check (
    status in ('PENDING', 'ISSUED')
    or (reviewed_by_user_id is not null and reviewed_at is not null)
  ),
  constraint advance_requests_rejection_check check (
    status <> 'REJECTED' or rejection_reason is not null
  )
);

create index if not exists idx_advance_requests_employee_status
  on public.advance_requests(employee_id, status);
create index if not exists idx_advance_requests_status
  on public.advance_requests(status);

revoke all on public.advance_requests from anon, authenticated;

-- Staff retain the self-service portal endpoint, but must not inherit the
-- legacy collection-wide payroll permission.  Accountant/director keep the
-- all-payroll route through their existing grants.
update public.role_permissions rp
set can_read = false,
    can_create = false,
    can_update = false,
    can_delete = false,
    can_approve = false
from public.roles r
where r.id = rp.role_id
  and r.role_name in ('sales', 'survey_staff', 'legal_staff')
  and rp.resource = 'payroll';

-- The old manual wage-voucher route has been removed.  Workflow completion is
-- now the sole source of work-pay entitlements.

commit;
