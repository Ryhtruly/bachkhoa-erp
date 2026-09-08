-- Persist the immutable generated contract DOCX key separately from its API route.
begin;

alter table public.contract_generated_documents
  add column if not exists output_storage_key text;

create index if not exists contract_generated_documents_contract_generated_idx
  on public.contract_generated_documents (contract_id, generated_at desc);

commit;
