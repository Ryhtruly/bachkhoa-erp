-- LÙI Migration C2.
--
-- Xoá cột là mất toàn bộ quãng chờ đã cộng dồn — KPI của mọi bước từng tạm dừng
-- sẽ tính cả thời gian nằm chờ vào giờ làm của nhân viên. Sao lưu trước.

begin;

create table if not exists public.task_nodes_pause_backup_20260902 as
select id, pause_reason_type, paused_at, paused_note, paused_seconds, rework_deadline_at
  from public.task_nodes;

drop index if exists public.task_nodes_paused_idx;

alter table public.task_nodes
  drop constraint if exists task_nodes_pause_reason_check,
  drop constraint if exists task_nodes_pause_pair_check,
  drop constraint if exists task_nodes_paused_seconds_check;

alter table public.task_nodes
  drop column if exists rework_deadline_at,
  drop column if exists paused_seconds,
  drop column if exists paused_note,
  drop column if exists paused_at,
  drop column if exists pause_reason_type;

commit;
