begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  recipient_role text not null check (recipient_role in ('student','tutor')),
  kind text not null check (kind in ('new_request','new_bid','bid_accepted','request_closed')),
  problem_id uuid not null references public.problems(id) on delete cascade,
  event_key text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(recipient_email, recipient_role, event_key)
);
create index if not exists notifications_recipient_time on public.notifications(recipient_email,recipient_role,created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select, update on public.notifications to service_role;

-- Write the event in the same transaction as its source. No browser credentials
-- can insert/read notifications; authenticated Next.js routes scope every read.
create or replace function public.notify_problem_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if TG_OP = 'INSERT' then
    if new.status = 'open' then
      insert into public.notifications(recipient_email,recipient_role,kind,problem_id,event_key,message)
      select lower(trim(t.user_email)), 'tutor', 'new_request', new.id, 'request:'||new.id,
        'New '||new.subject||' request — '||new.duration_min||' min, Rs. '||new.offer_price
      from public.tutor_profiles t
      where (t.verification_status='verified' or t.verification_stage='verified')
        and t.is_available is distinct from false
        and to_jsonb(t.subjects) ? new.subject
        and lower(trim(t.user_email)) <> lower(trim(new.student_email))
      on conflict do nothing;
    end if;
  elsif old.status = 'open' and new.status <> 'open' then
    -- Close old request alerts and wake all tutors who saw or bid on the request.
    update public.notifications set read_at=coalesce(read_at,now())
      where problem_id=new.id and kind in ('new_request','new_bid');
    insert into public.notifications(recipient_email,recipient_role,kind,problem_id,event_key,message)
    select r.email, 'tutor',
      case when new.status='accepted' and r.email=lower(trim(b.tutor_email)) then 'bid_accepted' else 'request_closed' end,
      new.id, 'closed:'||new.id,
      case when new.status='accepted' and r.email=lower(trim(b.tutor_email))
        then 'Your bid was accepted. Join the session from your dashboard.'
        else 'The '||new.subject||' request is no longer accepting bids.' end
    from (
      select recipient_email email from public.notifications where problem_id=new.id and recipient_role='tutor'
      union
      select lower(trim(tutor_email)) from public.bids where problem_id=new.id and tutor_email is not null
    ) r
    left join public.bids b on b.id=new.accepted_bid_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.notify_new_bid()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.notifications(recipient_email,recipient_role,kind,problem_id,event_key,message)
  select lower(trim(p.student_email)), 'student', 'new_bid', p.id, 'bid:'||new.id,
    new.tutor_name||' offered Rs. '||new.price||' for your '||p.subject||' request.'
  from public.problems p where p.id=new.problem_id and p.status='open'
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.notify_problem_change() from public,anon,authenticated;
revoke all on function public.notify_new_bid() from public,anon,authenticated;
drop trigger if exists notify_problem_change on public.problems;
create trigger notify_problem_change after insert or update of status on public.problems
  for each row execute function public.notify_problem_change();
drop trigger if exists notify_new_bid on public.bids;
create trigger notify_new_bid after insert on public.bids
  for each row execute function public.notify_new_bid();

do $$ begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
