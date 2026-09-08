-- Nhường một BƯỚC lên Bể việc khi người giữ việc gặp trở ngại.
--
-- Khác hẳn suất thợ phụ: thợ phụ là đi cùng làm, khoán cố định, chỉ có ở K02.
-- Nhường việc là giao hẳn một bước cho người khác làm thay, áp dụng mọi bước,
-- và khoán do Giám đốc chốt khi duyệt chứ không cố định trước.
--
-- Nguyên tắc bất biến: nhường MỘT bước KHÔNG đổi chủ hạng mục. Người nhường vẫn
-- phải làm các bước còn lại, tải dở dang của họ không được giải phóng.
create table if not exists public.task_node_help_requests (
  id varchar primary key default gen_random_uuid()::text,
  task_node_id varchar not null
    references public.task_nodes(id) on delete cascade,
  requested_by_employee_id varchar not null
    references public.employees(id) on delete restrict,
  reason text not null,
  proposed_amount numeric,

  status varchar not null default 'open',
  claimed_by_employee_id varchar references public.employees(id) on delete set null,
  claimed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_node_help_requests_status_check
    check (status in ('open', 'claimed', 'cancelled'))
);

create index if not exists task_node_help_requests_open_idx
  on public.task_node_help_requests (status, created_at)
  where status = 'open';

-- Một bước chỉ treo đúng một lời nhờ đang mở: hai thẻ cùng một bước thì hai
-- người nhận, một người làm công cốc.
create unique index if not exists uq_task_node_help_one_open
  on public.task_node_help_requests (task_node_id)
  where status = 'open';
