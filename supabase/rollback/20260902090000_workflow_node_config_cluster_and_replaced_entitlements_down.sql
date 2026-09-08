-- LÙI Migration A.
--
-- Thứ tự bắt buộc: bỏ VIEW trước, rồi mới bỏ cột — view
-- active_work_pay_entitlements phụ thuộc vào is_replaced, bỏ cột trước là
-- Postgres từ chối (hoặc cascade đi mất view mà không ai biết).
--
-- Xoá cột là MẤT dữ liệu trong cột đó: toàn bộ cấu hình phòng ban / vai trò /
-- cụm vừa khai, mọi mốc hết hạn nhờ hỗ trợ, và mọi dấu vết suất khoán đã chuyển
-- người. Sao lưu trước — không phải để dùng ngay, mà để lúc quyết định làm lại
-- còn có cái đối chiếu.

begin;

create table if not exists public.workflow_nodes_backup_20260902 as
select code, allowed_departments, default_roles, sla_hours,
       allow_pause, allow_gov_tracking, cluster_code
  from public.workflow_nodes;

create table if not exists public.task_node_help_requests_backup_20260902 as
select id, status, expires_at
  from public.task_node_help_requests;

create table if not exists public.work_pay_entitlements_backup_20260902 as
select id, employee_id, amount, is_replaced, replaced_by
  from public.work_pay_entitlements;

-- ── 4. View ──────────────────────────────────────────────────────────────────
drop view if exists public.active_work_pay_entitlements;

-- ── 3. work_pay_entitlements ─────────────────────────────────────────────────
drop index if exists public.work_pay_entitlements_replaced_idx;

alter table public.work_pay_entitlements
  drop constraint if exists work_pay_entitlements_replaced_by_fkey,
  drop constraint if exists work_pay_entitlements_replaced_check,
  drop constraint if exists work_pay_entitlements_replaced_self_check;

alter table public.work_pay_entitlements
  drop column if exists replaced_by,
  drop column if exists is_replaced;

-- ── 2. task_node_help_requests ───────────────────────────────────────────────
--
-- Trả 'expired' về 'open' TRƯỚC khi siết lại CHECK cũ. Bỏ qua bước này là câu
-- add constraint phía dưới hỏng ngay khi đã có dòng hết hạn — và bản lùi hỏng
-- giữa chừng còn tệ hơn không lùi.
--
-- Chỉ trả về 'open' được cho bước chưa có ai khác giữ: uq_task_node_help_one_open
-- chỉ cho MỘT yêu cầu mở trên mỗi bước. Bước đã có yêu cầu mở khác thì dòng hết
-- hạn chuyển thành 'cancelled' kèm lý do, chứ không chen vào làm vỡ khoá duy nhất.
update public.task_node_help_requests h
set status = case
      when exists (
        select 1 from public.task_node_help_requests o
        where o.task_node_id = h.task_node_id and o.status = 'open' and o.id <> h.id
      ) then 'cancelled'
      else 'open'
    end,
    cancel_reason = case
      when exists (
        select 1 from public.task_node_help_requests o
        where o.task_node_id = h.task_node_id and o.status = 'open' and o.id <> h.id
      ) then coalesce(cancel_reason, 'Lùi Migration A: bước đã có yêu cầu mở khác')
      else cancel_reason
    end,
    cancelled_at = case
      when exists (
        select 1 from public.task_node_help_requests o
        where o.task_node_id = h.task_node_id and o.status = 'open' and o.id <> h.id
      ) then coalesce(cancelled_at, now())
      else cancelled_at
    end
where status = 'expired';

drop index if exists public.task_node_help_requests_expiring_idx;

alter table public.task_node_help_requests
  drop constraint if exists task_node_help_requests_status_check;
alter table public.task_node_help_requests
  add constraint task_node_help_requests_status_check
    check (status::text = any (array['open', 'claimed', 'cancelled']));

alter table public.task_node_help_requests
  drop column if exists expires_at;

-- ── 1. workflow_nodes ────────────────────────────────────────────────────────
alter table public.workflow_nodes
  drop constraint if exists workflow_nodes_allowed_departments_check,
  drop constraint if exists workflow_nodes_default_roles_check,
  drop constraint if exists workflow_nodes_sla_hours_check,
  drop constraint if exists workflow_nodes_cluster_code_check;

alter table public.workflow_nodes
  drop column if exists cluster_code,
  drop column if exists allow_gov_tracking,
  drop column if exists allow_pause,
  drop column if exists sla_hours,
  drop column if exists default_roles,
  drop column if exists allowed_departments;

commit;
