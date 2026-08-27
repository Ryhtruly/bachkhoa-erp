-- Yêu cầu bàn giao K08 khi hợp đồng còn công nợ.
-- Phê duyệt này chỉ mở khóa nghiệp vụ bàn giao; tuyệt đối không đồng nghĩa đã thu đủ tiền.

create table if not exists public.handover_debt_requests (
    id varchar(50) primary key default gen_random_uuid()::text,
    task_node_id varchar(50) not null references public.task_nodes(id) on delete cascade,
    contract_id varchar(50) not null references public.contracts(id) on delete cascade,
    requester_user_id varchar(50) not null references public.users(id),
    remaining_amount_snapshot numeric(15,2) not null check (remaining_amount_snapshot > 0),
    reason text not null check (length(btrim(reason)) >= 5),
    promised_payment_date date not null,
    commitment_file jsonb not null default '{}'::jsonb,
    status varchar(20) not null default 'pending'
        check (status in ('pending', 'approved', 'rejected', 'cancelled')),
    reviewed_by varchar(50) references public.users(id),
    reviewed_at timestamptz,
    review_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint handover_debt_requests_review_state_ck check (
        (status = 'pending' and reviewed_by is null and reviewed_at is null)
        or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
        or status = 'cancelled'
    )
);

create unique index if not exists uq_handover_debt_requests_pending_node
    on public.handover_debt_requests(task_node_id)
    where status = 'pending';

create unique index if not exists uq_handover_debt_requests_approved_node
    on public.handover_debt_requests(task_node_id)
    where status = 'approved';

create index if not exists ix_handover_debt_requests_contract_status
    on public.handover_debt_requests(contract_id, status, created_at desc);

create index if not exists ix_handover_debt_requests_requester_status
    on public.handover_debt_requests(requester_user_id, status, created_at desc);

comment on table public.handover_debt_requests is
    'Yêu cầu mở khóa Node bàn giao khi còn nợ; không thay thế số dư công nợ thực tế.';
comment on column public.handover_debt_requests.remaining_amount_snapshot is
    'Số tiền còn nợ tại thời điểm gửi yêu cầu, phục vụ audit; số dư hiện tại vẫn tính từ phiếu thu đã duyệt.';
comment on column public.handover_debt_requests.commitment_file is
    'Metadata file cam kết lưu riêng tư trên MinIO/S3, không lưu URL công khai.';

alter table public.handover_debt_requests enable row level security;
revoke all on table public.handover_debt_requests from anon, authenticated;
grant all on table public.handover_debt_requests to service_role;
