-- LÙI giai đoạn C: nới NOT NULL, giữ nguyên cột và dữ liệu.
--
-- Đây là bản lùi rẻ nhất trong cả bộ: không mất dòng nào, không mất cột nào.
-- Dùng khi mã nguồn giai đoạn B phải rollback mà cột vẫn muốn giữ.
alter table public.task_node_checklist_results
  alter column contract_id drop not null;
