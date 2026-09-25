-- Apply after 202609250004_reject_unselected_bids.sql. Sandbox wallet escrow.
begin;
create table if not exists public.session_escrows (
  problem_id uuid primary key references public.problems(id),
  student_email text not null,
  tutor_email text not null,
  bid_id uuid not null references public.bids(id),
  base_amount numeric(12,2) not null check(base_amount > 0),
  amount numeric(12,2) not null check(amount >= base_amount),
  status text not null default 'reserved' check(status in ('reserved','released')),
  reserved_at timestamptz not null default now(),
  released_at timestamptz
);
create index if not exists session_escrows_student_status on public.session_escrows(student_email,status);
alter table public.session_escrows enable row level security;
revoke all on public.session_escrows from public,anon,authenticated;
grant select on public.session_escrows to service_role;

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
  if b.tutor_email is null then raise exception 'Tutor payment identity missing'; end if;
  perform public.apply_wallet_transaction(p.student_email,'student',b.price,'debit','Session escrow',
    'Reserved for session with '||b.tutor_name,'session-reserve:'||p.id::text);
  insert into public.session_escrows(problem_id,student_email,tutor_email,bid_id,base_amount,amount)
    values(p.id,p.student_email,lower(trim(b.tutor_email)),b.id,b.price,b.price);
  update public.bids set status = 'accepted' where id = b.id;
  update public.bids set status = 'rejected' where problem_id = p.id and id <> b.id and status = 'pending';
  update public.problems set status = 'accepted', accepted_bid_id = b.id where id = p.id returning * into p;
  return to_jsonb(p);
end;
$$;



create or replace function public.complete_student_session(p_problem_id uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.problems; b public.bids; result jsonb; e public.session_escrows; balance numeric;
begin
  select * into p from public.problems where id = p_problem_id and student_email = lower(trim(p_email)) for update;
  if not found or p.status <> 'accepted' or p.accepted_bid_id is null then raise exception 'Accepted session not found'; end if;
  select * into b from public.bids where id = p.accepted_bid_id and problem_id = p.id;
  if not found then raise exception 'Accepted bid not found'; end if;
  if p.settled_at is not null then
    select w.balance into balance from public.role_wallets w where user_email=p.student_email and role='student';
    return jsonb_build_object('balance',balance,'duplicate',true);
  end if;
  select * into e from public.session_escrows where problem_id=p.id for update;
  if found then
    if e.status <> 'reserved' or e.bid_id <> b.id or e.student_email <> p.student_email
      or e.tutor_email <> lower(trim(b.tutor_email)) or e.base_amount <> b.price then
      raise exception 'Session escrow does not match accepted bid';
    end if;
    select w.balance into balance from public.role_wallets w where user_email=p.student_email and role='student';
    result := jsonb_build_object('balance',balance,'duplicate',false);
  else
    -- Sessions accepted before this migration retain their original billing path.
    result := public.apply_wallet_transaction(p.student_email, 'student', b.price, 'debit', 'Session',
    'Session with ' || b.tutor_name, 'session:' || p.id::text);
  end if;
  if not (result->>'duplicate')::boolean then
    update public.users set sessions = coalesce(sessions, 0) + 1 where email = p.student_email;
    update public.problems set settled_at = now() where id = p.id;
  end if;
  return result;
end;
$$;


create or replace function public.extend_student_session(
  p_problem_id uuid, p_email text, p_minutes integer, p_request_id uuid, p_expected_minutes integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.problems; b public.bids; previous public.session_extensions;
  deadline timestamptz; charge numeric; available numeric; result jsonb; escrow public.session_escrows; required numeric;
begin
  if p_minutes is null or p_minutes not in (5,10,15,30) or p_request_id is null or p_expected_minutes is null then
    raise exception 'Invalid extension';
  end if;
  select * into p from public.problems where id=p_problem_id and student_email=lower(trim(p_email)) for update;
  if not found then raise exception 'Session not found'; end if;
  select * into b from public.bids where id=p.accepted_bid_id and problem_id=p.id;
  if not found or b.duration_min is null or b.duration_min <= 0 or b.price <= 0 then raise exception 'Accepted bid unavailable'; end if;
  deadline := p.session_started_at + make_interval(mins => b.duration_min + p.extension_minutes);
  select * into previous from public.session_extensions where request_id=p_request_id;
  if found then
    if previous.problem_id <> p.id or previous.minutes <> p_minutes or previous.previous_minutes <> p_expected_minutes then
      raise exception 'Extension request conflict';
    end if;
    return jsonb_build_object('endsAt',extract(epoch from deadline)*1000,'serverNow',extract(epoch from clock_timestamp())*1000,'duplicate',true,'amount',previous.amount);
  end if;
  if p.status <> 'accepted' or p.settled_at is not null or p.session_ended_at is not null or deadline is null or deadline <= clock_timestamp() then
    raise exception 'Session is not active';
  end if;
  if p.extension_minutes <> p_expected_minutes then raise exception 'Session already extended. Refresh and retry'; end if;
  if deadline > clock_timestamp() + interval '5 minutes' then raise exception 'Extension is available in the last 5 minutes'; end if;
  charge := round(b.price::numeric * p_minutes / b.duration_min, 2);
  select * into escrow from public.session_escrows where problem_id=p.id for update;
  if found and escrow.status <> 'reserved' then raise exception 'Session escrow is not active'; end if;
  required := charge + case when escrow.problem_id is null then b.price else 0 end;
  select balance into available from public.role_wallets where user_email=p.student_email and role='student' for update;
  if available is null or available < required then raise exception 'Insufficient wallet balance'; end if;
  result := public.apply_wallet_transaction(p.student_email,'student',charge,'debit',case when escrow.problem_id is null then 'Session extension' else 'Session escrow extension' end,
    'Extra ' || p_minutes || ' minutes with ' || b.tutor_name,'session-extension:' || p_request_id);
  insert into public.session_extensions(request_id,problem_id,minutes,amount,previous_minutes)
    values(p_request_id,p.id,p_minutes,charge,p.extension_minutes);
  if escrow.problem_id is not null then
    update public.session_escrows set amount=amount+charge where problem_id=p.id;
  end if;
  update public.problems set extension_minutes=extension_minutes+p_minutes where id=p.id;
  deadline := deadline + make_interval(mins => p_minutes);
  return result || jsonb_build_object('endsAt',extract(epoch from deadline)*1000,'serverNow',extract(epoch from clock_timestamp())*1000,'amount',charge);
end;
$$;

create or replace function public.release_session_payments()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare payment public.session_payments; result jsonb; released integer:=0; e public.session_escrows;
begin
 for payment in select * from public.session_payments where status='pending' and rating>=4 and dispute is null and release_at<=now() for update skip locked loop
   select * into e from public.session_escrows where problem_id=payment.problem_id for update;
   if found and (e.status <> 'reserved' or e.amount <> payment.amount
     or e.student_email <> payment.student_email or e.tutor_email <> lower(trim(payment.tutor_email))) then
     raise exception 'Escrow does not match session payment';
   end if;
   result := public.apply_wallet_transaction(payment.tutor_email,'tutor',payment.amount,'credit','Session','Tutoring session payment','session-payout:'||payment.problem_id::text);
   if not (result->>'duplicate')::boolean then
     update public.tutor_profiles set total_earnings=coalesce(total_earnings,0)+payment.amount,
       total_sessions=coalesce(total_sessions,0)+1 where user_email=payment.tutor_email;
   end if;
   update public.session_payments set status='released',released_at=now() where problem_id=payment.problem_id;
   update public.session_escrows set status='released',released_at=now() where problem_id=payment.problem_id;
   released:=released+1;
 end loop;
 return released;
end; $$;

revoke all on function public.accept_student_bid(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.complete_student_session(uuid,text) from public,anon,authenticated;
revoke all on function public.extend_student_session(uuid,text,integer,uuid,integer) from public,anon,authenticated;
revoke all on function public.release_session_payments() from public,anon,authenticated;
grant execute on function public.accept_student_bid(uuid,text,uuid) to service_role;
grant execute on function public.complete_student_session(uuid,text) to service_role;
grant execute on function public.extend_student_session(uuid,text,integer,uuid,integer) to service_role;
grant execute on function public.release_session_payments() to service_role;
notify pgrst, 'reload schema';
commit;
