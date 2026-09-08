begin;

-- Khóa ngắn bảng audit trong lúc chuyển quyền cấp ID từ ứng dụng sang
-- PostgreSQL, tránh INSERT chen giữa bước đọc max(id) và gắn default.
lock table public.audit_log in share row exclusive mode;

create sequence if not exists public.audit_log_id_seq as bigint;

select setval(
    'public.audit_log_id_seq',
    greatest(coalesce((select max(id) from public.audit_log), 0) + 1, 1),
    false
);

alter sequence public.audit_log_id_seq owned by public.audit_log.id;

alter table public.audit_log
    alter column id set default nextval('public.audit_log_id_seq'::regclass);

commit;
