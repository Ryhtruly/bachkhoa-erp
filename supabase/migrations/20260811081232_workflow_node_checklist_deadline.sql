-- Deadline thuộc Node; checklist dùng chung deadline của Node cha.
alter table public.task_nodes
  add column deadline_at timestamptz,
  add column is_overdue boolean not null default false;

alter table public.task_node_checklist_results
  add column require_evidence boolean not null default false,
  add column approver_role text not null default 'admin',
  add column is_overdue boolean not null default false,
  add column late_reason text;

-- Bảo toàn dữ liệu lịch/hạn và cấu hình minh chứng cũ trước khi bỏ cột.
update public.task_nodes
set deadline_at = planned_end
where planned_end is not null;

update public.task_node_checklist_results
set require_evidence = lower(coalesce(evidence_data ->> 'required', 'false')) = 'true';

-- Chuẩn hóa mã trạng thái checklist mới.
alter table public.task_node_checklist_results
  drop constraint task_node_checklist_results_completion_check,
  drop constraint task_node_checklist_results_status_check;

update public.task_node_checklist_results r
set is_overdue = true,
    late_reason = coalesce(nullif(btrim(r.late_reason), ''), 'Dữ liệu cũ được chuyển đổi khi chuẩn hóa deadline'),
    status = case when r.status = 'submitted' then 'late_pending_approval' else r.status end
from public.task_nodes n
where n.id = r.task_node_id
  and r.submitted_at is not null
  and n.deadline_at is not null
  and r.submitted_at > n.deadline_at;

update public.task_node_checklist_results
set status = case status
  when 'submitted' then 'pending_approval'
  when 'passed' then 'approved'
  else status
end;

update public.task_nodes n
set is_overdue = exists (
  select 1
  from public.task_node_checklist_results r
  where r.task_node_id = n.id and r.is_overdue
);

alter table public.task_node_checklist_results
  add constraint task_node_checklist_results_status_check
    check (status in (
      'pending', 'pending_approval', 'late_pending_approval',
      'approved', 'late_approved', 'failed', 'not_applicable'
    )),
  add constraint task_node_checklist_results_completion_check
    check (status not in ('approved', 'late_approved', 'failed') or completed_at is not null),
  add constraint task_node_checklist_results_approver_role_format_check
    check (approver_role ~ '^[a-z][a-z0-9_]*$'),
  add constraint task_node_checklist_results_late_reason_check
    check (not is_overdue or nullif(btrim(late_reason), '') is not null);

alter table public.task_nodes
  add constraint task_nodes_deadline_check
    check (deadline_at is null or started_at is null or deadline_at >= started_at);

-- Code đã ngừng đọc/ghi lịch riêng trên phân công; xóa nguồn gây lệch deadline.
drop index public.task_node_assignments_employee_schedule_idx;
drop index public.task_nodes_open_schedule_idx;

alter table public.task_node_assignments
  drop constraint task_node_assignments_schedule_check,
  drop column planned_start,
  drop column planned_end;

alter table public.task_nodes
  drop constraint task_nodes_schedule_check,
  drop column planned_start,
  drop column planned_end;

create index idx_task_nodes_deadline_open
  on public.task_nodes (deadline_at)
  where deadline_at is not null
    and status in ('ready', 'in_progress', 'submitted', 'rework_required', 'blocked');

create index task_node_assignments_employee_status_idx
  on public.task_node_assignments (employee_id, assignment_status);

create index idx_checklist_results_overdue
  on public.task_node_checklist_results (task_node_id, submitted_at)
  where is_overdue;
