begin;
-- Transactional outbox: rolled-back actions never produce email. No historical backfill.
create table if not exists public.email_alerts (
 id uuid primary key default gen_random_uuid(), event_key text not null unique,
 recipient_email text not null, subject text not null, message text not null,
 path text not null default '/login' check(path like '/%' and path not like '//%'),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 claimed_at timestamptz, claim_token uuid, sent_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists email_alerts_delivery on public.email_alerts(status,available_at,created_at);
alter table public.email_alerts enable row level security;
revoke all on public.email_alerts from public,anon,authenticated;
grant select,update on public.email_alerts to service_role;

create or replace function public.queue_email_alert()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare j jsonb:=to_jsonb(new); prior jsonb; recipient text; title text; body text; link text:='/login'; key text;
begin
 if TG_OP='UPDATE' then prior:=to_jsonb(old); end if;
 key:=TG_TABLE_NAME||':'||coalesce(j->>'id',j->>'problem_id');
 case TG_TABLE_NAME
 when 'account_moderation_events' then
  recipient:=j->>'user_email';
  title:=case j->>'action' when 'ban' then 'Your account has been banned' when 'suspend' then 'Your account has been suspended' else 'Your account access has been restored' end;
  body:=title||E'\n\nReason: '||(j->>'reason');
  if j->>'action'='suspend' then body:=body||E'\nSuspended until: '||(j->>'suspended_until')||' (UTC).'; end if;
 when 'tutor_conduct_events' then
  recipient:=j->>'tutor_email'; title:='Tutor conduct update';
  body:='Decision: '||(j->>'action')||E'\nReason: '||(j->>'reason'); link:='/tutor/dashboard';
 when 'verification_notes' then
  if j->>'note_type' not in ('admin_to_tutor','system') then return new; end if;
  recipient:=j->>'tutor_email'; title:='Tutor verification update'; body:=j->>'message'; link:='/tutor/waiting-verification';
 when 'notifications' then
  -- Broadcast requests and request_closed stay in-app to avoid unsolicited bulk mail.
  if j->>'kind' not in ('new_bid','bid_accepted','bid_rejected','tutor_joined') then return new; end if;
  recipient:=j->>'recipient_email'; title:=case j->>'kind' when 'new_bid' then 'New offer for your request' when 'bid_accepted' then 'Your bid was accepted' when 'bid_rejected' then 'Your bid was not selected' else 'Your tutor has joined' end;
  body:=j->>'message'; link:='/'||(j->>'recipient_role')||'/dashboard';
 when 'wallet_transactions' then
  if j->>'status'<>'completed' or j->>'type'<>'credit' or coalesce(j->>'payment_reference','') like 'session-%' then return new; end if;
  if TG_OP='UPDATE' and prior->>'status'='completed' then return new; end if;
  recipient:=j->>'user_email'; title:='Wallet credited'; body:='Rs. '||(j->>'amount')||E' was added to your wallet.\n'||coalesce(j->>'description',''); link:='/'||(j->>'user_role')||'/dashboard';
 when 'session_payments' then
  if TG_OP='UPDATE' and j->>'status' is not distinct from prior->>'status' then return new; end if;
  title:='Session payment '||(j->>'status');
  body:='Payment status: '||(j->>'status')||E'\nAmount: Rs. '||(j->>'amount')||E'\nSession: '||(j->>'problem_id');
  if j->>'status'='held' then body:=body||E'\nPayment is held for review. Check your dashboard for details.'; end if;
  key:=key||':'||(j->>'status');
  insert into public.email_alerts(event_key,recipient_email,subject,message,path)
   values(key||':student',lower(trim(j->>'student_email')),title,body,'/student/dashboard') on conflict do nothing;
  recipient:=j->>'tutor_email'; link:='/tutor/dashboard'; key:=key||':tutor';
 when 'tutor_teaching_demos' then
  -- Rejections already have their own feedback email and retry flow.
  if j->>'status'<>'approved' or j->>'status' is not distinct from prior->>'status' then return new; end if;
  recipient:=j->>'tutor_email'; title:='Teaching demo approved';
  body:='Your '||(j->>'subject')||' teaching demo ('||(j->>'topic')||E') was approved.\n'||coalesce(j->>'feedback',''); link:='/tutor/waiting-verification';
  key:=key||':approved:'||coalesce(j->>'reviewed_at',j->>'updated_at','');
 else return new;
 end case;
 if nullif(trim(recipient),'') is not null and nullif(body,'') is not null then
  insert into public.email_alerts(event_key,recipient_email,subject,message,path)
   values(key,lower(trim(recipient)),title,body,link) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.queue_email_alert() from public,anon,authenticated;

do $$ declare tab text; begin
 foreach tab in array array['account_moderation_events','tutor_conduct_events','verification_notes','notifications'] loop
  execute format('drop trigger if exists queue_email_alert on public.%I',tab);
  execute format('create trigger queue_email_alert after insert on public.%I for each row execute function public.queue_email_alert()',tab);
 end loop;
 foreach tab in array array['wallet_transactions','session_payments','tutor_teaching_demos'] loop
  execute format('drop trigger if exists queue_email_alert on public.%I',tab);
  execute format('create trigger queue_email_alert after insert or update on public.%I for each row execute function public.queue_email_alert()',tab);
 end loop;
end $$;

create or replace function public.claim_email_alerts(p_limit integer default 10)
returns setof public.email_alerts language sql security definer set search_path=public,pg_temp as $$
 update public.email_alerts set status='sending',attempts=attempts+1,claimed_at=now(),claim_token=gen_random_uuid()
 where id in (select id from public.email_alerts
  where ((status in ('pending','failed') and available_at<=now()) or (status='sending' and claimed_at<now()-interval '5 minutes'))
  order by created_at,id for update skip locked limit greatest(1,least(coalesce(p_limit,10),10))) returning *;
$$;
revoke all on function public.claim_email_alerts(integer) from public,anon,authenticated;
grant execute on function public.claim_email_alerts(integer) to service_role;
notify pgrst,'reload schema';
commit;
