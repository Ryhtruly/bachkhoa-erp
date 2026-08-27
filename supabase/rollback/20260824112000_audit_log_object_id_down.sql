-- LÙI migration 20260824112000_audit_log_object_id.
--
-- Độc lập với hai bản kia, chạy lúc nào cũng được. Mất object_id là mất khả
-- năng lọc nhật ký theo đối tượng — nhật ký cũ vốn đã null nên không mất gì.
drop index if exists public.audit_log_object_idx;

alter table public.audit_log
  drop column if exists object_id;
