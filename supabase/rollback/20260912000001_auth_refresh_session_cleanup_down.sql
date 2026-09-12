begin;

drop index if exists public.idx_auth_refresh_sessions_cleanup_revoked_at;

commit;
