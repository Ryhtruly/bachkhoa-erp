-- LÙI Migration C1.
--
-- Xoá cột chỉ mất CỜ tồn đọng, không mất lịch sử duyệt — lịch sử nằm ở
-- checklist_result_document_links.reviewed_at. Hệ quả duy nhất: các đợt duyệt
-- đang treo sẽ không còn được lượt quét chốt lười tìm thấy, phải chốt tay.

begin;

drop index if exists public.task_nodes_pending_review_flush_idx;

alter table public.task_nodes
  drop column if exists last_reviewed_at;

commit;
