drop index if exists public.ix_checklist_document_type_files_review_status;

alter table public.checklist_result_document_type_files
  drop constraint if exists checklist_result_document_type_files_rejection_reason_check,
  drop constraint if exists checklist_result_document_type_files_status_check,
  drop column if exists reviewed_at,
  drop column if exists reviewed_by,
  drop column if exists rejection_reason,
  drop column if exists change_reason,
  drop column if exists status;
