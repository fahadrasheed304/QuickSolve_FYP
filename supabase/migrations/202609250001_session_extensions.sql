-- Requires the existing wallet, session clock/end and session payments migrations.
begin;
alter table public.problems add column if not exists extension_minutes integer not null default 0 check (extension_minutes >= 0);
create table if not exists public.session_extensions (
  request_id uuid primary key,
  problem_id uuid not null references public.problems(id),
  minutes integer not null check (minutes in (5,10,15,30)),
  amount numeric(12,2) not null check (amount > 0),
  previous_minutes integer not null,
  created_at timestamptz not null default now(),
  unique(problem_id, previous_minutes)
);
alter table public.session_extensions enable row level security;
revoke all on public.session_extensions from anon, authenticated;

create or replace function public.extend_student_session(
  p_problem_id uuid, p_email text, p_minutes integer, p_request_id uuid, p_expected_minutes integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.problems; b public.bids; previous public.session_extensions;
  deadline timestamptz; charge numeric; available numeric; result jsonb;
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
  select balance into available from public.role_wallets where user_email=p.student_email and role='student' for update;
  -- The base session is charged by the existing review flow. Keep enough for it.
  if available is null or available < charge + b.price then raise exception 'Insufficient wallet balance (including base session payment)'; end if;
  result := public.apply_wallet_transaction(p.student_email,'student',charge,'debit','Session extension',
    'Extra ' || p_minutes || ' minutes with ' || b.tutor_name,'session-extension:' || p_request_id);
  insert into public.session_extensions(request_id,problem_id,minutes,amount,previous_minutes)
    values(p_request_id,p.id,p_minutes,charge,p.extension_minutes);
  update public.problems set extension_minutes=extension_minutes+p_minutes where id=p.id;
  deadline := deadline + make_interval(mins => p_minutes);
  return result || jsonb_build_object('endsAt',extract(epoch from deadline)*1000,'serverNow',extract(epoch from clock_timestamp())*1000,'amount',charge);
end;
$$;
revoke all on function public.extend_student_session(uuid,text,integer,uuid,integer) from public,anon,authenticated;
grant execute on function public.extend_student_session(uuid,text,integer,uuid,integer) to service_role;

-- Extra minutes were already debited. Include them in the existing held/released
-- tutor payment without charging the student again during review.
create or replace function public.include_session_extension_payment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.amount := new.amount + coalesce((select sum(amount) from public.session_extensions where problem_id=new.problem_id),0);
  return new;
end;
$$;
drop trigger if exists include_session_extensions on public.session_payments;
create trigger include_session_extensions before insert on public.session_payments
  for each row execute function public.include_session_extension_payment();
notify pgrst, 'reload schema';
commit;
