-- LÙI Migration B.
--
-- Xoá cột là mất toàn bộ phán quyết từng tờ: ai duyệt, lúc nào, tờ nào bị trả và
-- vì sao. Sao lưu trước — không phải để dùng ngay, mà để lúc quyết định làm lại
-- còn có cái đối chiếu.

begin;

create table if not exists public.checklist_result_document_links_backup_20260902 as
select id, checklist_result_id, document_id,
       review_status, rejection_reason, reviewed_by, reviewed_at
  from public.checklist_result_document_links;

drop index if exists public.checklist_result_document_links_pending_idx;
drop index if exists public.checklist_result_document_links_reviewed_idx;

alter table public.checklist_result_document_links
  drop constraint if exists checklist_result_document_links_review_status_check,
  drop constraint if exists checklist_result_document_links_rejection_reason_check,
  drop constraint if exists checklist_result_document_links_reviewed_check,
  drop constraint if exists checklist_result_document_links_reviewed_by_fkey;

alter table public.checklist_result_document_links
  drop column if exists reviewed_at,
  drop column if exists reviewed_by,
  drop column if exists rejection_reason,
  drop column if exists review_status;

commit;
