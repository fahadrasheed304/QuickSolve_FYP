begin;
create table if not exists public.session_attendance_events (
 event_id text primary key, problem_id uuid not null references public.problems(id),
 room_sid text not null, participant_sid text, identity text,
 kind text not null check(kind in ('participant_joined','participant_left','room_finished')),
 occurred_at timestamptz not null, received_at timestamptz not null default now()
);
create index if not exists session_attendance_problem_idx on public.session_attendance_events(problem_id,occurred_at,event_id);
alter table public.session_attendance_events enable row level security;
revoke all on public.session_attendance_events from public,anon,authenticated;
grant select,insert on public.session_attendance_events to service_role;
create or replace function public.record_session_attendance(p_event_id text,p_problem uuid,p_room_sid text,p_participant_sid text,p_identity text,p_kind text,p_at timestamptz)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare student text; tutor text;
begin
 if nullif(p_event_id,'') is null or nullif(p_room_sid,'') is null or p_at is null or p_kind not in ('participant_joined','participant_left','room_finished') then raise exception 'Invalid attendance event'; end if;
 select p.student_email,b.tutor_email into student,tutor from public.problems p left join public.bids b on b.id=p.accepted_bid_id where p.id=p_problem;
 if not found then return; end if;
 if p_kind<>'room_finished' and (nullif(p_participant_sid,'') is null or p_identity is null or (p_identity is distinct from student||':student' and p_identity is distinct from tutor||':tutor')) then return; end if;
 insert into public.session_attendance_events(event_id,problem_id,room_sid,participant_sid,identity,kind,occurred_at)
 values(p_event_id,p_problem,p_room_sid,p_participant_sid,p_identity,p_kind,p_at) on conflict(event_id) do nothing;
end $$;
revoke all on function public.record_session_attendance(text,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_session_attendance(text,uuid,text,text,text,text,timestamptz) to service_role;
commit;
