begin;
alter table public.bids add column if not exists tutor_email text;
-- Backfill only unambiguous names; never guess the recipient of a payment.
update public.bids b set tutor_email = p.email from (
 select fullname, min(user_email) email from public.tutor_profiles group by fullname having count(*) = 1
) p where b.tutor_email is null and b.tutor_name = p.fullname;
create table if not exists public.session_payments (
 problem_id uuid primary key references public.problems(id),
 student_email text not null, tutor_email text not null, amount numeric not null check(amount>0),
 rating integer not null check(rating between 0 and 5), feedback text not null default '',
 dispute text, status text not null check(status in ('pending','held','released')),
 release_at timestamptz not null, released_at timestamptz
);
alter table public.session_payments enable row level security;
revoke all on public.session_payments from anon, authenticated;
grant all on public.session_payments to service_role;
create or replace function public.submit_session_review(p_problem_id uuid,p_email text,p_rating integer,p_feedback text,p_dispute text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.problems; b public.bids; payment public.session_payments; result jsonb;
begin
 select * into p from public.problems where id=p_problem_id and student_email=lower(trim(p_email)) for update;
 if not found or p.status <> 'accepted' or p.accepted_bid_id is null then raise exception 'Accepted session not found'; end if;
 if p_rating is null or p_rating not between 0 and 5 or (p_rating=0 and nullif(trim(p_dispute),'') is null) then raise exception 'Rating or dispute required'; end if;
 select * into payment from public.session_payments where problem_id=p.id for update;
 if found then
   -- Allow a dispute during the pending window, without debiting again.
   if nullif(trim(p_dispute),'') is not null then
     if payment.status='released' then raise exception 'Payment already released'; end if;
     update public.session_payments set dispute=p_dispute,status='held' where problem_id=p.id returning * into payment;
   end if;
   return to_jsonb(payment);
 end if;
 select * into b from public.bids where id=p.accepted_bid_id and problem_id=p.id;
 if not found or b.tutor_email is null then raise exception 'Tutor payment identity missing; contact support'; end if;
 perform public.get_or_create_wallet(b.tutor_email,'tutor');
 result := public.complete_student_session(p.id,p_email);
 update public.problems set session_ended_at=coalesce(session_ended_at,now()) where id=p.id;
 insert into public.session_payments(problem_id,student_email,tutor_email,amount,rating,feedback,dispute,status,release_at)
 values(p.id,p.student_email,b.tutor_email,b.price,p_rating,left(coalesce(p_feedback,''),4000),nullif(trim(p_dispute),''),
 case when p_rating>=4 and nullif(trim(p_dispute),'') is null then 'pending' else 'held' end,now()+interval '5 minutes') returning * into payment;
 return to_jsonb(payment);
end; $$;
create or replace function public.release_session_payments()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare payment public.session_payments; result jsonb; released integer:=0;
begin
 for payment in select * from public.session_payments where status='pending' and rating>=4 and dispute is null and release_at<=now() for update skip locked loop
   result := public.apply_wallet_transaction(payment.tutor_email,'tutor',payment.amount,'credit','Session','Tutoring session payment','session-payout:'||payment.problem_id::text);
   if not (result->>'duplicate')::boolean then
     update public.tutor_profiles set total_earnings=coalesce(total_earnings,0)+payment.amount,
       total_sessions=coalesce(total_sessions,0)+1 where user_email=payment.tutor_email;
   end if;
   update public.session_payments set status='released',released_at=now() where problem_id=payment.problem_id;
   released:=released+1;
 end loop;
 return released;
end; $$;
revoke all on function public.submit_session_review(uuid,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.release_session_payments() from public,anon,authenticated;
grant execute on function public.submit_session_review(uuid,text,integer,text,text) to service_role;
grant execute on function public.release_session_payments() to service_role;
commit;
-- Supabase Cron runs independently of browsers. Enable pg_cron in Database > Extensions if needed.
create extension if not exists pg_cron;
select cron.schedule('quicksolve-release-session-payments','* * * * *','select public.release_session_payments()');
