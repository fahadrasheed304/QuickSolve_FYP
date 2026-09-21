-- Durable OTP state shared by all application instances. Existing users are untouched.
create table if not exists public.pending_signups (
  email text primary key,
  otp_hash text not null,
  user_data jsonb not null,
  expires_at timestamptz not null
);
alter table public.pending_signups enable row level security;
revoke all on public.pending_signups from anon, authenticated;
grant select, insert, update, delete on public.pending_signups to service_role;
