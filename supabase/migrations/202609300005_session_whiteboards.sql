begin;

create table if not exists public.session_whiteboards (
  problem_id uuid primary key references public.problems(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.session_whiteboards enable row level security;
revoke all on public.session_whiteboards from public, anon, authenticated;
grant select, insert, update on public.session_whiteboards to service_role;

commit;
