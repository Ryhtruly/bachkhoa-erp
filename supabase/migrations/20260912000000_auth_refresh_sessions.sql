begin;

create table if not exists public.auth_refresh_sessions (
    id varchar(36) primary key,
    user_id varchar(50) not null references public.users(id) on delete cascade,
    token_hash varchar(64) not null unique,
    family_id varchar(36) not null,
    remember_me boolean not null default false,
    created_at timestamptz not null default now(),
    last_used_at timestamptz not null default now(),
    expires_at timestamptz not null,
    idle_expires_at timestamptz not null,
    revoked_at timestamptz,
    replaced_by_id varchar(36),
    user_agent text,
    ip_address inet
);

create index if not exists idx_auth_refresh_sessions_user_id
    on public.auth_refresh_sessions (user_id);

create index if not exists idx_auth_refresh_sessions_family_id
    on public.auth_refresh_sessions (family_id);

create index if not exists idx_auth_refresh_sessions_active_expiry
    on public.auth_refresh_sessions (expires_at, idle_expires_at)
    where revoked_at is null;

alter table public.auth_refresh_sessions
    drop constraint if exists auth_refresh_sessions_replaced_by_id_fkey;

alter table public.auth_refresh_sessions
    add constraint auth_refresh_sessions_replaced_by_id_fkey
    foreign key (replaced_by_id)
    references public.auth_refresh_sessions(id)
    on delete set null;

commit;
