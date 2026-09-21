-- Both participants share the timestamp of the first join request.
alter table public.problems add column if not exists session_started_at timestamptz;
