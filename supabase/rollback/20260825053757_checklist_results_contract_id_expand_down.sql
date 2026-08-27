-- LÙI migration 20260825085000_checklist_results_contract_id.
--
-- Chạy SAU bản lùi của 20260825090000: khoá ngoại ghép của bảng nối trỏ vào
-- unique (id, contract_id) ở đây, còn nó thì không drop được.
--
-- contract_id là dữ liệu suy ra được (task_node → workflow_instance →
-- service_line), nên xoá cột không mất thông tin gốc — chạy lại migration lên là
-- backfill lại y hệt. Không cần sao lưu.

alter table public.task_node_checklist_results
  drop constraint if exists uq_task_node_checklist_results_id_contract;

alter table public.task_node_checklist_results
  drop constraint if exists task_node_checklist_results_contract_fk;

alter table public.task_node_checklist_results
  drop column if exists contract_id;
