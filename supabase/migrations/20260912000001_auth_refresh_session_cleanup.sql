begin;

create index if not exists idx_auth_refresh_sessions_cleanup_revoked_at
    on public.auth_refresh_sessions (revoked_at)
    where revoked_at is not null;

commit;
