begin;
lock table public.problems, public.bids, public.session_payments, public.session_recordings in access exclusive mode nowait;
-- Downloads and ordinary evidence retention last 15 minutes. Payment disputes
-- retain their existing 20-minute window, including when video is already gone.
-- Existing held payments still prevent cleanup, using the same problem-row lock.
create or replace function public.recording_dispute_window()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare ended timestamptz; deadline timestamptz;
begin
 -- Only transitions that preserve evidence need the retention lock. Terminal
 -- payout updates already hold the payment lock and must not invert lock order.
 if TG_OP='INSERT' or new.dispute is distinct from old.dispute or (new.status='held' and old.status<>'held') then
   select session_ended_at into ended from public.problems where id=new.problem_id for update;
 else
   select session_ended_at into ended from public.problems where id=new.problem_id;
 end if;
 -- A late first review must not restart the retention/dispute clock.
 select p.session_started_at+make_interval(mins=>b.duration_min+p.extension_minutes) into deadline
 from public.problems p join public.bids b on b.id=p.accepted_bid_id where p.id=new.problem_id;
 ended:=least(ended,deadline);
 if TG_OP='INSERT' then new.release_at:=coalesce(ended,now())+interval '20 minutes'; end if;
 if nullif(trim(new.dispute),'') is not null then
   if TG_OP='INSERT' or new.dispute is distinct from old.dispute then
     if ended is null or now()>=ended+interval '20 minutes' then raise exception 'The 20-minute dispute window has closed'; end if;
   end if;
 end if;
 return new;
end $$;

create or replace function public.claim_recording_deletion(p_egress text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.session_recordings; ended timestamptz;
begin
 select * into r from public.session_recordings where egress_id=p_egress;
 if not found then return null; end if;
 select session_ended_at into ended from public.problems where id=r.problem_id for update;
 select * into r from public.session_recordings where egress_id=p_egress for update;
 if r.state='deleted' or r.state not in ('ready','failed','deleting') or r.object_key is null or ended is null or ended+interval '15 minutes'>now() then return null; end if;
 -- Do not discard evidence before settlement has classified the session.
 if not exists(select 1 from public.session_payments where problem_id=r.problem_id and status in ('pending','released','refunded')) then return null; end if;
 update public.session_recordings set state='deleting',updated_at=now() where egress_id=p_egress;
 return r.object_key;
end $$;

create or replace function public.recording_cleanup_candidates(p_limit integer default 50)
returns table(egress_id text) language sql security definer set search_path=public,pg_temp as $$
 select r.egress_id from public.session_recordings r
 join public.problems p on p.id=r.problem_id
 join public.session_payments sp on sp.problem_id=r.problem_id
 where r.state in ('ready','failed','deleting') and r.object_key is not null
 and p.session_ended_at+interval '15 minutes'<=now()
 and sp.status in ('pending','released','refunded')
 order by r.updated_at,r.egress_id limit greatest(1,least(coalesce(p_limit,50),100));
$$;
revoke all on function public.recording_cleanup_candidates(integer) from public,anon,authenticated;
grant execute on function public.recording_cleanup_candidates(integer) to service_role;


revoke all on function public.recording_dispute_window(),public.claim_recording_deletion(text) from public,anon,authenticated;
grant execute on function public.claim_recording_deletion(text) to service_role;
notify pgrst,'reload schema';
commit;
