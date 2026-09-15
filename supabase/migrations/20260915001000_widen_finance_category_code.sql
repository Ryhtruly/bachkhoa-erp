begin;

-- Finance category values can contain a localized label and, for legacy UI
-- payloads, a short description after ": ".  VARCHAR(50) truncated valid
-- labels and caused cashflow creation to fail with StringDataRightTruncation.
alter table public.cashflow_transactions
    alter column category_code type text
    using category_code::text;

comment on column public.cashflow_transactions.category_code is
    'Finance category code or localized category label; Text avoids truncating valid UI labels.';

commit;
