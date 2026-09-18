-- Add immutable commission snapshots for contracts and payroll reporting.
alter table public.contracts
  add column if not exists commission_rate_snapshot numeric(5, 2),
  add column if not exists commission_locked_at timestamptz;

create index if not exists ix_contracts_sale_id
  on public.contracts (sale_id);
