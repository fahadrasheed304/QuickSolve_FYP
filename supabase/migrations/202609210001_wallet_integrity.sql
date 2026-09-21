begin;

alter table public.wallet_transactions add column if not exists method text not null default '';
alter table public.wallet_transactions add column if not exists payment_reference text;
create unique index if not exists wallet_payment_reference_unique
  on public.wallet_transactions(payment_reference) where payment_reference is not null;
alter table public.problems add column if not exists accepted_bid_id uuid references public.bids(id);
alter table public.problems add column if not exists settled_at timestamptz;

-- Only trusted server code may credit money. A stable provider/session reference
-- makes retries safe; the wallet row lock serializes concurrent balance changes.
create or replace function public.apply_wallet_transaction(
  p_email text, p_role text, p_amount numeric, p_type text,
  p_method text, p_description text, p_reference text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w public.role_wallets;
  previous public.wallet_transactions;
  delta numeric;
begin
  p_email := lower(trim(p_email));
  if p_role is null or p_role not in ('student', 'tutor') or p_type is null or p_type not in ('credit', 'debit')
     or p_amount is null or p_amount <= 0 or p_amount > 100000 or p_amount <> trunc(p_amount, 2)
     or p_reference is null or length(trim(p_reference)) = 0 or length(p_reference) > 255 then
    raise exception 'Invalid wallet transaction';
  end if;
  -- Same reference always takes the same lock, including cross-wallet retries.
  perform pg_advisory_xact_lock(hashtextextended(p_reference, 0));
  select * into w from public.role_wallets
    where user_email = p_email and role = p_role for update;
  if not found then raise exception 'Wallet not found'; end if;
  select * into previous from public.wallet_transactions where payment_reference = p_reference;
  if found then
    if previous.user_email <> p_email or previous.user_role <> p_role
       or previous.amount <> p_amount or previous.type <> p_type or previous.method <> p_method then
      raise exception 'Payment reference conflict';
    end if;
    return jsonb_build_object('balance', w.balance, 'duplicate', true);
  end if;
  delta := case when p_type = 'credit' then p_amount else -p_amount end;
  if w.balance is null or w.balance + delta < 0 then raise exception 'Insufficient wallet balance'; end if;
  update public.role_wallets set balance = balance + delta, updated_at = now()
    where id = w.id returning * into w;
  insert into public.wallet_transactions(user_email, user_role, type, amount, method, description, status, payment_reference)
    values(p_email, p_role, p_type, p_amount, p_method, p_description, 'completed', p_reference);
  return jsonb_build_object('balance', w.balance, 'duplicate', false);
end;
$$;

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
  update public.problems set status = 'accepted', accepted_bid_id = b.id where id = p.id returning * into p;
  return to_jsonb(p);
end;
$$;

create or replace function public.complete_student_session(p_problem_id uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.problems; b public.bids; result jsonb;
begin
  select * into p from public.problems where id = p_problem_id and student_email = lower(trim(p_email)) for update;
  if not found or p.status <> 'accepted' or p.accepted_bid_id is null then raise exception 'Accepted session not found'; end if;
  select * into b from public.bids where id = p.accepted_bid_id and problem_id = p.id;
  if not found then raise exception 'Accepted bid not found'; end if;
  result := public.apply_wallet_transaction(p.student_email, 'student', b.price, 'debit', 'Session',
    'Session with ' || b.tutor_name, 'session:' || p.id::text);
  if not (result->>'duplicate')::boolean then
    update public.users set sessions = coalesce(sessions, 0) + 1 where email = p.student_email;
    update public.problems set settled_at = now() where id = p.id;
  end if;
  return result;
end;
$$;

revoke all on function public.apply_wallet_transaction(text,text,numeric,text,text,text,text) from public, anon, authenticated;
revoke all on function public.accept_student_bid(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.complete_student_session(uuid,text) from public, anon, authenticated;
grant execute on function public.apply_wallet_transaction(text,text,numeric,text,text,text,text) to service_role;
grant execute on function public.accept_student_bid(uuid,text,uuid) to service_role;
grant execute on function public.complete_student_session(uuid,text) to service_role;
-- Existing privileged wallet functions must also stay server-only.
revoke all on function public.get_or_create_wallet(text,text) from public, anon, authenticated;
revoke all on function public.update_wallet_balance(text,text,numeric) from public, anon, authenticated;
grant execute on function public.get_or_create_wallet(text,text) to service_role;
grant execute on function public.update_wallet_balance(text,text,numeric) to service_role;
notify pgrst, 'reload schema';
commit;
