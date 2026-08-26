-- Phiếu xin quay lại node. Nhân viên không được tự ý lùi bước: mọi lần quay lại
-- đều phải có lý do và chữ ký duyệt của Quản lý/Giám đốc.
create table if not exists public.workflow_rollback_requests (
  id varchar primary key default gen_random_uuid()::text,
  workflow_instance_id varchar not null
    references public.workflow_instances(id) on delete restrict,
  target_task_node_id varchar not null
    references public.task_nodes(id) on delete restrict,
  requested_by varchar not null,
  reason text not null,
  status varchar not null default 'pending',
  reviewed_by varchar,
  reviewed_at timestamptz,
  review_note text,
  affected_node_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_rollback_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists workflow_rollback_requests_instance_idx
  on public.workflow_rollback_requests (workflow_instance_id, status);

-- Một Hạng mục chỉ được treo đúng một phiếu chờ duyệt: hai phiếu chồng nhau thì
-- duyệt cái sau sẽ cascade đè lên kết quả của cái trước.
create unique index if not exists uq_workflow_rollback_one_pending
  on public.workflow_rollback_requests (workflow_instance_id)
  where status = 'pending';
