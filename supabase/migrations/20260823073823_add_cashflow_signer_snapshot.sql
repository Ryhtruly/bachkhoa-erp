ALTER TABLE public.cashflow_transactions
  ADD COLUMN IF NOT EXISTS signer_snapshot jsonb;

COMMENT ON COLUMN public.cashflow_transactions.signer_snapshot IS
  'Historical signer configuration captured when the financial document is created or approved.';
