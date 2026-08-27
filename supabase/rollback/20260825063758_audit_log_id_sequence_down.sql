begin;

alter table public.audit_log
    alter column id drop default;

drop sequence if exists public.audit_log_id_seq;

commit;
