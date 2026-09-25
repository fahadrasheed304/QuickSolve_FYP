-- Apply after 202609250003_realtime_notifications.sql.
begin;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('new_request','new_bid','bid_accepted','bid_rejected','request_closed'));

-- Acceptance locks the parent request and settles all bid statuses atomically.
create or replace function public.accept_student_bid(p_problem_id uuid, p_email text, p_bid_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.problems; b public.bids; available numeric;
begin
  select * into p from public.problems where id = p_problem_id and student_email = lower(trim(p_email)) for update;
  if not found then raise exception 'Problem not found'; end if;
  if p.settled_at is not null then raise exception 'Session already settled'; end if;
  if p.status = 'accepted' and p.accepted_bid_id = p_bid_id then return to_jsonb(p); end if;
  if p.status <> 'open' or p.created_at < now() - interval '15 minutes' then raise exception 'Problem is no longer open'; end if;
  select * into b from public.bids where id = p_bid_id and problem_id = p.id for update;
  if not found or b.price <= 0 or b.status <> 'pending' then raise exception 'Invalid bid'; end if;
  select balance into available from public.role_wallets where user_email = p.student_email and role = 'student';
  if available is null or available < b.price then raise exception 'Insufficient wallet balance'; end if;
  update public.bids set status = 'accepted' where id = b.id;
  update public.bids set status = 'rejected' where problem_id = p.id and id <> b.id and status = 'pending';
  update public.problems set status = 'accepted', accepted_bid_id = b.id where id = p.id returning * into p;
  return to_jsonb(p);
end;
$$;


-- Serialize new bids with selection: an in-flight insert cannot leave a pending
-- bid behind after another transaction has accepted the request.
create or replace function public.guard_new_bid()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.problems;
begin
  select * into p from public.problems where id=new.problem_id for update;
  if not found or p.status <> 'open' or p.created_at < now() - interval '15 minutes' then
    raise exception 'This problem is no longer accepting bids';
  end if;
  if new.status is distinct from 'pending' then
    raise exception 'New bids must be pending';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_new_bid() from public,anon,authenticated;
drop trigger if exists guard_new_bid on public.bids;
create trigger guard_new_bid before insert on public.bids
  for each row execute function public.guard_new_bid();

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
      case when new.status='accepted' and r.email=lower(trim(b.tutor_email)) then 'bid_accepted'
        when new.status='accepted' and exists (select 1 from public.bids losing where losing.problem_id=new.id and lower(trim(losing.tutor_email))=r.email and losing.id<>new.accepted_bid_id) then 'bid_rejected'
        else 'request_closed' end,
      new.id, 'closed:'||new.id,
      case when new.status='accepted' and r.email=lower(trim(b.tutor_email))
        then 'Your bid was accepted. Join the session from your dashboard.'
        when new.status='accepted' and exists (select 1 from public.bids losing where losing.problem_id=new.id and lower(trim(losing.tutor_email))=r.email and losing.id<>new.accepted_bid_id)
        then 'Your bid was not selected. The student chose another tutor for the '||new.subject||' request.'
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


-- Repair historical pending losers without changing winners, payments or
-- generating retroactive notifications.
update public.bids b set status='rejected'
from public.problems p
where b.problem_id=p.id and p.status='accepted' and p.accepted_bid_id is not null
  and b.id<>p.accepted_bid_id and b.status='pending';

revoke all on function public.accept_student_bid(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.accept_student_bid(uuid,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
