-- Apply after 202609250005_session_escrow.sql.
begin;
alter table public.session_payments drop constraint if exists session_payments_status_check;
alter table public.session_payments add constraint session_payments_status_check check(status in ('pending','held','released','refunded'));
alter table public.session_escrows drop constraint if exists session_escrows_status_check;
alter table public.session_escrows add constraint session_escrows_status_check check(status in ('reserved','released','refunded'));
alter table public.session_payments add column if not exists review_submitted_at timestamptz;
alter table public.session_payments add column if not exists hold_reason text;
alter table public.session_payments add column if not exists resolved_by text;
alter table public.session_payments add column if not exists resolution_note text;
alter table public.session_payments add column if not exists resolved_at timestamptz;
update public.session_payments set review_submitted_at=coalesce(review_submitted_at,release_at-interval '5 minutes')
where review_submitted_at is null and (rating>0 or dispute is not null);
update public.session_payments set hold_reason=coalesce(dispute,'Low session rating') where status='held' and hold_reason is null;

-- One terminal decision per session. The payment lock serializes cron, disputes,
-- and concurrent administrator decisions; wallet references protect retries.
create or replace function public.resolve_session_payment(p_problem_id uuid,p_action text,p_admin text,p_note text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare payment public.session_payments; e public.session_escrows; result jsonb; target text;
begin
 if p_action is null or p_action not in ('release','refund') then raise exception 'Invalid payment action'; end if;
 if p_admin is not null and (length(trim(p_admin))=0 or p_note is null or length(trim(p_note))<5 or length(p_note)>2000) then raise exception 'A resolution note is required'; end if;
 select * into payment from public.session_payments where problem_id=p_problem_id for update;
 if not found then raise exception 'Payment not found'; end if;
 target := case when p_action='release' then 'released' else 'refunded' end;
 if payment.status=target then return to_jsonb(payment); end if;
 if payment.status in ('released','refunded') then raise exception 'Payment already resolved with a different outcome'; end if;
 if p_admin is null then
   if p_action<>'release' or payment.status<>'pending' or payment.dispute is not null
     or payment.rating between 1 and 3 or payment.release_at>now() then raise exception 'Payment is not eligible for automatic release'; end if;
 elsif payment.status<>'held' then raise exception 'Only held payments can be resolved by admin';
 end if;
 select * into e from public.session_escrows where problem_id=payment.problem_id for update;
 if found then
   if e.status<>'reserved' or e.amount<>payment.amount or e.student_email<>payment.student_email
     or e.tutor_email<>lower(trim(payment.tutor_email)) then raise exception 'Escrow does not match payment'; end if;
 else
   -- Legacy review payments were already debited before escrow was introduced.
   if not exists(select 1 from public.wallet_transactions where payment_reference='session:'||payment.problem_id
      and user_email=payment.student_email and user_role='student' and type='debit') then
     raise exception 'No funded escrow or legacy debit found';
   end if;
 end if;
 if p_action='release' then
   perform public.get_or_create_wallet(payment.tutor_email,'tutor');
   result := public.apply_wallet_transaction(payment.tutor_email,'tutor',payment.amount,'credit','Session','Tutoring session payment','session-payout:'||payment.problem_id);
   if not (result->>'duplicate')::boolean then
     update public.tutor_profiles set total_earnings=coalesce(total_earnings,0)+payment.amount,total_sessions=coalesce(total_sessions,0)+1 where user_email=payment.tutor_email;
   end if;
 else
   result := public.apply_wallet_transaction(payment.student_email,'student',payment.amount,'credit','Session refund','Session refunded after admin review','session-refund:'||payment.problem_id);
 end if;
 update public.session_escrows set status=target,released_at=case when target='released' then now() else null end where problem_id=payment.problem_id;
 update public.session_payments set status=target,resolved_by=p_admin,resolution_note=case when p_admin is null then 'Automatic release after dispute window' else trim(p_note) end,
   resolved_at=now(),released_at=case when target='released' then now() else null end where problem_id=payment.problem_id returning * into payment;
 return to_jsonb(payment);
end;
$$;

-- Scan durable session clocks: neither an open browser nor a review is required.
create or replace function public.prepare_session_payments()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.problems; b public.bids; queued integer:=0; no_start boolean;
begin
 for p in select problem.* from public.problems problem
   join public.session_escrows e on e.problem_id=problem.id
   join public.bids bid on bid.id=problem.accepted_bid_id
   where problem.status='accepted' and e.status='reserved'
     and not exists(select 1 from public.session_payments sp where sp.problem_id=problem.id)
     and (problem.session_ended_at is not null
       or problem.session_started_at+make_interval(mins=>bid.duration_min+problem.extension_minutes)<=now()
       or (problem.session_started_at is null and e.reserved_at<=now()-interval '30 minutes'))
   for update of problem skip locked
 loop
   select * into b from public.bids where id=p.accepted_bid_id;
   no_start := p.session_started_at is null;
   perform public.complete_student_session(p.id,p.student_email);
   update public.problems set session_ended_at=coalesce(session_ended_at,least(now(),session_started_at+make_interval(mins=>b.duration_min+extension_minutes)),now()) where id=p.id;
   insert into public.session_payments(problem_id,student_email,tutor_email,amount,rating,feedback,status,release_at,hold_reason)
   values(p.id,p.student_email,b.tutor_email,b.price,0,'',case when no_start then 'held' else 'pending' end,now()+interval '5 minutes',
     case when no_start then 'Session never started; admin review required' else null end);
   queued:=queued+1;
 end loop;
 return queued;
end;
$$;

create or replace function public.release_session_payments()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare payment public.session_payments; released integer:=0;
begin
 perform public.prepare_session_payments();
 for payment in select * from public.session_payments where status='pending' and (rating=0 or rating>=4) and dispute is null and release_at<=now() for update skip locked loop
   perform public.resolve_session_payment(payment.problem_id,'release',null,null);
   released:=released+1;
 end loop;
 return released;
end;
$$;

create or replace function public.submit_session_review(p_problem_id uuid,p_email text,p_rating integer,p_feedback text,p_dispute text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.problems; b public.bids; payment public.session_payments;
begin
 select * into p from public.problems where id=p_problem_id and student_email=lower(trim(p_email)) for update;
 if not found or p.status<>'accepted' or p.accepted_bid_id is null then raise exception 'Accepted session not found'; end if;
 if p_rating is null or p_rating not between 0 and 5 or (p_rating=0 and nullif(trim(p_dispute),'') is null) then raise exception 'Rating or dispute required'; end if;
 select * into b from public.bids where id=p.accepted_bid_id;
 if not found or b.tutor_email is null then raise exception 'Tutor payment identity missing'; end if;
 if p.session_ended_at is null and (p.session_started_at is null or p.session_started_at+make_interval(mins=>b.duration_min+p.extension_minutes)>now()) then
   raise exception 'End the session before submitting a review';
 end if;
 select * into payment from public.session_payments where problem_id=p.id for update;
 if not found then
   perform public.complete_student_session(p.id,p_email);
   update public.problems set session_ended_at=coalesce(session_ended_at,now()) where id=p.id;
   insert into public.session_payments(problem_id,student_email,tutor_email,amount,rating,feedback,dispute,status,release_at,review_submitted_at,hold_reason)
   values(p.id,p.student_email,b.tutor_email,b.price,p_rating,left(coalesce(p_feedback,''),4000),nullif(trim(p_dispute),''),
     case when p_rating>=4 and nullif(trim(p_dispute),'') is null and p.session_started_at is not null then 'pending' else 'held' end,
     now()+interval '5 minutes',now(),case when p.session_started_at is null then 'Session never started; admin review required'
       when nullif(trim(p_dispute),'') is not null then p_dispute when p_rating<4 then 'Low session rating' else null end) returning * into payment;
 else
   if nullif(trim(p_dispute),'') is not null then
     if payment.status in ('released','refunded') then raise exception 'Payment already resolved; dispute window closed'; end if;
     update public.session_payments set dispute=left(trim(p_dispute),1000),status='held',hold_reason='Student dispute' where problem_id=p.id;
   end if;
   -- An automatic payment row is not a submitted review. Allow the first real
   -- review even after release, but never reverse a terminal payment decision.
   if payment.review_submitted_at is null then
     update public.session_payments set rating=p_rating,feedback=left(coalesce(p_feedback,''),4000),review_submitted_at=now(),
       status=case when status='pending' and p_rating between 1 and 3 then 'held' else status end,
       hold_reason=case when status='pending' and p_rating between 1 and 3 then 'Low session rating' else hold_reason end where problem_id=p.id;
   end if;
   select * into payment from public.session_payments where problem_id=p.id;
 end if;
 return to_jsonb(payment);
end;
$$;
revoke all on function public.resolve_session_payment(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.prepare_session_payments() from public,anon,authenticated;
revoke all on function public.release_session_payments() from public,anon,authenticated;
revoke all on function public.submit_session_review(uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.resolve_session_payment(uuid,text,text,text) to service_role;
grant execute on function public.prepare_session_payments() to service_role;
grant execute on function public.release_session_payments() to service_role;
grant execute on function public.submit_session_review(uuid,text,integer,text,text) to service_role;
notify pgrst,'reload schema';
commit;
-- Supabase Cron (the existing job name is updated, not duplicated).
create extension if not exists pg_cron;
select cron.schedule('quicksolve-release-session-payments','* * * * *','select public.release_session_payments()');
