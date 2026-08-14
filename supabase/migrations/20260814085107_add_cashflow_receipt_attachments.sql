-- Keep the legacy URL column readable while storing immutable S3 object
-- metadata for every receipt attached to a cashflow transaction.
alter table if exists public.cashflow_transactions
  add column if not exists receipt_attachments jsonb not null default '[]'::jsonb;

alter table if exists public.cashflow_transactions
  drop constraint if exists cashflow_transactions_receipt_attachments_is_array;

alter table if exists public.cashflow_transactions
  add constraint cashflow_transactions_receipt_attachments_is_array
  check (jsonb_typeof(receipt_attachments) = 'array');

create index if not exists idx_cashflow_receipt_attachments_gin
  on public.cashflow_transactions using gin (receipt_attachments jsonb_path_ops);

comment on column public.cashflow_transactions.receipt_attachments is
  'Immutable private object metadata for payment receipts. Object bytes live in S3-compatible storage.';
