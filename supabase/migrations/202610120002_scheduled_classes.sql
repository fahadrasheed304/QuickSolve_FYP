begin;
-- Requires wallet integrity, account moderation, conduct and email-alert migrations.
alter table public.email_alerts add column if not exists priority integer not null default 0,
 add column if not exists expires_at timestamptz;
alter table public.email_alerts drop constraint if exists email_alerts_status_check;
alter table public.email_alerts add constraint email_alerts_status_check check(status in ('pending','sending','sent','failed','expired'));
-- Time-sensitive recording and class reminders must not wait behind routine mail.
create or replace function public.claim_email_alerts(p_limit integer default 10)
returns setof public.email_alerts language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.email_alerts set status='expired' where expires_at<=now() and status in ('pending','failed','sending');
 return query update public.email_alerts set status='sending',attempts=attempts+1,claimed_at=now(),claim_token=gen_random_uuid()
 where id in (select id from public.email_alerts
  where (expires_at is null or expires_at>now()) and
   ((status in ('pending','failed') and available_at<=now()) or (status='sending' and claimed_at<now()-interval '5 minutes'))
  order by priority desc,created_at,id for update skip locked limit greatest(1,least(coalesce(p_limit,10),10))) returning *;
end $$;
revoke all on function public.claim_email_alerts(integer) from public,anon,authenticated;
grant execute on function public.claim_email_alerts(integer) to service_role;
create table if not exists public.scheduled_classes (
 id uuid primary key, tutor_email text not null references public.users(email), tutor_name text not null,
 subject text not null, topic text not null check(length(topic) between 3 and 120),
 class_level text not null check(length(class_level) between 1 and 60), description text not null default '' check(length(description)<=2000),
 starts_at timestamptz not null, ends_at timestamptz not null, duration_min integer not null check(duration_min between 15 and 180),
 fee numeric(12,2) not null check(fee>0 and fee<=100000), capacity integer not null check(capacity between 2 and 10),
 status text not null default 'scheduled' check(status in ('scheduled','live','completed','cancelled')),
 tutor_joined_at timestamptz, ended_at timestamptz, cancellation_reason text,
 created_at timestamptz not null default now(), check(ends_at=starts_at+duration_min*interval '1 minute')
);
create index if not exists scheduled_classes_browse on public.scheduled_classes(status,starts_at,id);
create index if not exists scheduled_classes_tutor on public.scheduled_classes(tutor_email,starts_at,id);
create table if not exists public.scheduled_class_bookings (
 id uuid primary key, class_id uuid not null references public.scheduled_classes(id),
 student_email text not null references public.users(email), student_name text not null,
 amount numeric(12,2) not null check(amount>0), status text not null default 'booked' check(status in ('booked','cancelled')),
 payment_status text not null default 'reserved' check(payment_status in ('reserved','pending','held','released','refunded')),
 recording_consent_at timestamptz not null default now(), created_at timestamptz not null default now(), cancelled_at timestamptz,
 joined_at timestamptz, release_at timestamptz, dispute text, resolved_by text, resolution_note text, resolved_at timestamptz
);
create unique index if not exists scheduled_class_active_booking on public.scheduled_class_bookings(class_id,student_email) where status='booked';
create index if not exists scheduled_class_bookings_owner on public.scheduled_class_bookings(student_email,created_at desc,id);
create table if not exists public.scheduled_class_attendance (
 event_id text primary key, class_id uuid not null references public.scheduled_classes(id),
 identity text not null, participant_sid text not null, kind text not null check(kind in ('participant_joined','participant_left')),
 happened_at timestamptz not null
);
create table if not exists public.scheduled_class_recordings (
 egress_id text primary key, class_id uuid not null references public.scheduled_classes(id),
 object_key text, state text not null check(state in ('starting','recording','processing','ready','failed','deleting','deleted')),
 event_version numeric not null, ready_at timestamptz, download_until timestamptz, deleted_at timestamptz,
 created_at timestamptz not null default now()
);
do $$ declare tab text; begin
 foreach tab in array array['scheduled_classes','scheduled_class_bookings','scheduled_class_attendance','scheduled_class_recordings'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant select on public.%I to service_role',tab);
 end loop;
end $$;

create or replace function public.scheduled_email(p_key text,p_email text,p_title text,p_body text,p_role text,p_class uuid,p_expires timestamptz default null,p_priority integer default 10)
returns void language sql security definer set search_path=public,pg_temp as $$
 insert into public.email_alerts(event_key,recipient_email,subject,message,path,expires_at,priority)
 values('scheduled:'||p_key,lower(trim(p_email)),p_title,p_body,'/'||p_role||'/scheduled-classes/'||p_class,p_expires,p_priority)
 on conflict(event_key) do nothing;
$$;
create or replace function public.scheduled_assert_access(p_email text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.users where email=p_email) then raise exception 'Account not found'; end if;
 if exists(select 1 from public.account_moderation where user_email=p_email and
  (status='banned' or (status='suspended' and suspended_until>now()))) then raise exception 'Account is restricted'; end if;
end $$;
create or replace function public.create_scheduled_class(p_id uuid,p_tutor text,p_subject text,p_topic text,p_level text,p_description text,p_starts timestamptz,p_duration integer,p_fee numeric,p_capacity integer)
returns public.scheduled_classes language plpgsql security definer set search_path=public,pg_temp as $$
declare saved public.scheduled_classes; tutor public.tutor_profiles;
begin
 p_tutor:=lower(trim(p_tutor));
 perform public.scheduled_assert_access(p_tutor);
 perform pg_advisory_xact_lock(hashtextextended('scheduled-tutor:'||p_tutor,0));
 select * into tutor from public.tutor_profiles where user_email=p_tutor for update;
 if not found or (tutor.verification_status is distinct from 'verified' and tutor.verification_stage is distinct from 'verified')
  or exists(select 1 from public.tutor_conduct where tutor_email=p_tutor and status='restricted') then raise exception 'A verified, unrestricted tutor is required'; end if;
 if not (coalesce(to_jsonb(tutor.subjects),'[]'::jsonb) ? p_subject) then raise exception 'Choose one of your verified subjects'; end if;
 select * into saved from public.scheduled_classes where id=p_id;
 if found then
  if saved.tutor_email<>p_tutor or saved.subject<>p_subject or saved.topic<>trim(p_topic) or saved.class_level<>trim(p_level)
   or saved.description<>trim(coalesce(p_description,'')) or saved.starts_at<>p_starts or saved.duration_min<>p_duration or saved.fee<>p_fee or saved.capacity<>p_capacity then raise exception 'Class request conflict'; end if;
  return saved;
 end if;
 if p_id is null or p_starts is null or p_starts<now()+interval '30 minutes' or p_starts>now()+interval '90 days'
  or p_duration is null or p_duration not between 15 and 180 or p_fee is null or p_fee<=0 or p_fee>100000 or p_fee<>trunc(p_fee,2)
  or p_capacity is null or p_capacity not between 2 and 10 or length(trim(coalesce(p_topic,''))) not between 3 and 120
  or length(trim(coalesce(p_level,''))) not between 1 and 60 or length(coalesce(p_description,''))>2000 then raise exception 'Invalid class details or start time (30 minutes to 90 days ahead)'; end if;
 if exists(select 1 from public.scheduled_classes where tutor_email=p_tutor and status in ('scheduled','live')
  and starts_at<p_starts+p_duration*interval '1 minute' and ends_at>p_starts) then raise exception 'This class overlaps another scheduled class'; end if;
 if exists(select 1 from public.problems problem join public.bids bid on bid.id=problem.accepted_bid_id
  where lower(trim(bid.tutor_email))=p_tutor and problem.status='accepted' and problem.settled_at is null and problem.session_ended_at is null
  and coalesce(problem.session_started_at,now())+(bid.duration_min+coalesce(problem.extension_minutes,0))*interval '1 minute'>p_starts) then raise exception 'This class overlaps an active one-to-one session'; end if;
 insert into public.scheduled_classes(id,tutor_email,tutor_name,subject,topic,class_level,description,starts_at,ends_at,duration_min,fee,capacity)
 values(p_id,p_tutor,coalesce(nullif(tutor.fullname,''),'Tutor'),p_subject,trim(p_topic),trim(p_level),trim(coalesce(p_description,'')),p_starts,p_starts+p_duration*interval '1 minute',p_duration,p_fee,p_capacity) returning * into saved;
 return saved;
end $$;

create or replace function public.book_scheduled_class(p_class uuid,p_student text,p_request uuid,p_consent boolean)
returns public.scheduled_class_bookings language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.scheduled_classes; b public.scheduled_class_bookings; name text;
begin
 p_student:=lower(trim(p_student)); perform public.scheduled_assert_access(p_student);
 perform pg_advisory_xact_lock(hashtextextended('scheduled-student:'||p_student,0));
 if p_request is null or p_consent is distinct from true then raise exception 'Accept the recording and cancellation policy before booking'; end if;
 select * into c from public.scheduled_classes where id=p_class for update;
 if not found then raise exception 'Class not found'; end if;
 select * into b from public.scheduled_class_bookings where id=p_request;
 if found then
  if b.class_id<>p_class or b.student_email<>p_student then raise exception 'Booking request conflict'; end if;
  return b;
 end if;
 select * into b from public.scheduled_class_bookings where class_id=p_class and student_email=p_student and status='booked';
 if found then return b; end if;
 if c.tutor_email=p_student then raise exception 'You cannot book your own class'; end if;
 perform public.scheduled_assert_access(c.tutor_email);
 if exists(select 1 from public.tutor_conduct where tutor_email=c.tutor_email and status='restricted') then raise exception 'Tutor is restricted from new bookings'; end if;
 if c.status<>'scheduled' or c.starts_at<=now()+interval '10 minutes' then raise exception 'Booking closes 10 minutes before the class'; end if;
 if (select count(*) from public.scheduled_class_bookings where class_id=p_class and status='booked')>=c.capacity then raise exception 'This class is full'; end if;
 if exists(select 1 from public.scheduled_class_bookings booked join public.scheduled_classes other on other.id=booked.class_id
  where booked.student_email=p_student and booked.status='booked' and other.status in ('scheduled','live')
  and other.starts_at<c.ends_at and other.ends_at>c.starts_at) then raise exception 'This class overlaps another booking'; end if;
 if exists(select 1 from public.problems problem join public.bids bid on bid.id=problem.accepted_bid_id
  where problem.student_email=p_student and problem.status='accepted' and problem.settled_at is null and problem.session_ended_at is null
  and coalesce(problem.session_started_at,now())+(bid.duration_min+coalesce(problem.extension_minutes,0))*interval '1 minute'>c.starts_at) then raise exception 'This class overlaps an active one-to-one session'; end if;
 select coalesce(nullif(fullname,''),'Student') into name from public.users where email=p_student;
 perform public.get_or_create_wallet(p_student,'student');
 perform public.apply_wallet_transaction(p_student,'student',c.fee,'debit','Scheduled class reserve','Seat reserved: '||c.topic,'session-scheduled-reserve:'||p_request);
 insert into public.scheduled_class_bookings(id,class_id,student_email,student_name,amount) values(p_request,p_class,p_student,name,c.fee) returning * into b;
 perform public.scheduled_email('booking:'||b.id,p_student,'Class booking confirmed',c.topic||E'\nTutor: '||c.tutor_name||E'\nStarts (UTC): '||c.starts_at||E'\nDuration: '||c.duration_min||' minutes'||E'\nReserved fee: Rs. '||c.fee||E'\nAudio, video and shared screens will be recorded. Download within 15 minutes after the recording is ready. Full cancellation refund until 2 hours before start.','student',c.id);
 return b;
end $$;

create or replace function public.resolve_scheduled_booking(p_booking uuid,p_action text,p_actor text,p_note text)
returns public.scheduled_class_bookings language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.scheduled_classes; b public.scheduled_class_bookings; target text;
begin
 select cl.* into c from public.scheduled_classes cl join public.scheduled_class_bookings bk on bk.class_id=cl.id where bk.id=p_booking for update of cl;
 if not found then raise exception 'Booking not found'; end if;
 select * into b from public.scheduled_class_bookings where id=p_booking for update;
 if p_action is null or p_action not in ('release','refund') then raise exception 'Invalid payment action'; end if;
 target:=case when p_action='release' then 'released' else 'refunded' end;
 if p_actor is not null then
  if p_actor<>'quicksolve.officials@gmail.com' or length(trim(coalesce(p_note,''))) not between 5 and 2000 then raise exception 'Administrator and resolution note required'; end if;
 end if;
 if b.payment_status=target then return b; end if;
 if b.payment_status in ('released','refunded') then raise exception 'Payment already resolved'; end if;
 if not exists(select 1 from public.wallet_transactions where payment_reference='session-scheduled-reserve:'||b.id
  and user_email=b.student_email and user_role='student' and type='debit' and amount=b.amount and status='completed') then raise exception 'No matching funded seat reservation'; end if;
 if p_actor is not null and b.payment_status<>'held' then raise exception 'Only held payments can be resolved by admin'; end if;
 if p_actor is null and p_action='release' and (b.payment_status<>'pending' or b.release_at is null or b.release_at>now() or b.dispute is not null) then raise exception 'Payment is not eligible for release'; end if;
 if p_actor is null and p_action='refund' and c.status<>'cancelled' and not (b.status='cancelled' and b.cancelled_at<=c.starts_at-interval '2 hours') then raise exception 'Payment is not eligible for refund'; end if;
 if p_action='release' then
  perform public.get_or_create_wallet(c.tutor_email,'tutor');
  perform public.apply_wallet_transaction(c.tutor_email,'tutor',b.amount,'credit','Scheduled class payout','Class: '||c.topic,'session-scheduled-payout:'||b.id);
  update public.tutor_profiles set total_earnings=coalesce(total_earnings,0)+b.amount where user_email=c.tutor_email;
 else
  perform public.apply_wallet_transaction(b.student_email,'student',b.amount,'credit','Scheduled class refund','Class: '||c.topic,'session-scheduled-refund:'||b.id);
 end if;
 update public.scheduled_class_bookings set payment_status=target,resolved_by=p_actor,resolution_note=coalesce(p_note,'Automatic class settlement'),resolved_at=now() where id=b.id returning * into b;
 perform public.scheduled_email('payment:'||b.id||':'||target,b.student_email,'Class payment '||target,c.topic||E'\nAmount: Rs. '||b.amount||E'\n'||coalesce(p_note,'Automatic class settlement'),'student',c.id);
 perform public.scheduled_email('payment-tutor:'||b.id||':'||target,c.tutor_email,'Class payment '||target,c.topic||E'\nAmount: Rs. '||b.amount,'tutor',c.id);
 return b;
end $$;

create or replace function public.cancel_scheduled_booking(p_booking uuid,p_student text)
returns public.scheduled_class_bookings language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.scheduled_classes; b public.scheduled_class_bookings;
begin
 p_student:=lower(trim(p_student));
 select cl.* into c from public.scheduled_classes cl join public.scheduled_class_bookings bk on bk.class_id=cl.id where bk.id=p_booking and bk.student_email=p_student for update of cl;
 if not found then raise exception 'Booking not found'; end if;
 select * into b from public.scheduled_class_bookings where id=p_booking for update;
 if b.status='cancelled' then return b; end if;
 if c.status not in ('scheduled','live') or c.starts_at<=now() then raise exception 'Cancellation is only available before class starts'; end if;
 update public.scheduled_class_bookings set status='cancelled',cancelled_at=now() where id=b.id returning * into b;
 update public.email_alerts set status='expired',expires_at=now() where status in ('pending','failed') and
  (event_key='scheduled:booking:'||b.id or event_key like 'scheduled:reminder:'||b.id||':%');
 if now()<=c.starts_at-interval '2 hours' then b:=public.resolve_scheduled_booking(b.id,'refund',null,'Full refund for cancellation at least 2 hours before start'); end if;
 perform public.scheduled_email('cancel-booking:'||b.id,p_student,'Class booking cancelled',c.topic||E'\n'||case when b.payment_status='refunded' then 'Your reserved fee has been refunded.' else 'Late cancellation: the fee remains reserved and is charged if the class takes place.' end,'student',c.id);
 return b;
end $$;

create or replace function public.assert_scheduled_join(p_class uuid,p_email text,p_role text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.scheduled_classes;
begin
 p_email:=lower(trim(p_email));perform public.scheduled_assert_access(p_email);
 select * into c from public.scheduled_classes where id=p_class;
 if not found then raise exception 'Class not found'; end if;
 if p_role='tutor' then
  if c.tutor_email<>p_email then raise exception 'Only the assigned tutor can teach this class'; end if;
 elsif p_role='student' then
  if not exists(select 1 from public.scheduled_class_bookings where class_id=c.id and student_email=p_email and status='booked' and payment_status='reserved') then raise exception 'A paid confirmed booking is required'; end if;
 else raise exception 'Student or tutor login required';
 end if;
 perform public.scheduled_assert_access(c.tutor_email);
 if c.status not in ('scheduled','live') or now()<c.starts_at-interval '10 minutes' or now()>=c.ends_at then raise exception 'Class is outside its join window'; end if;
 if c.tutor_joined_at is null and now()>=c.starts_at+interval '10 minutes' then raise exception 'Tutor grace period expired; refund is pending'; end if;
 if (c.status='scheduled' or c.starts_at>now()) and exists(select 1 from public.tutor_conduct where tutor_email=c.tutor_email and status='restricted') then raise exception 'Tutor is restricted; class cancellation is pending'; end if;
end $$;

create or replace function public.cancel_scheduled_class(p_class uuid,p_tutor text,p_reason text)
returns public.scheduled_classes language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.scheduled_classes; b public.scheduled_class_bookings;
begin
 select * into c from public.scheduled_classes where id=p_class for update;
 if not found or (p_tutor is not null and c.tutor_email<>lower(trim(p_tutor))) then raise exception 'Class not found'; end if;
 if c.status='cancelled' then return c; end if;
 if c.status<>'scheduled' and not (c.status='live' and c.starts_at>now()) then raise exception 'Only a class that has not started can be cancelled'; end if;
 if length(trim(coalesce(p_reason,''))) not between 5 and 2000 then raise exception 'Provide a cancellation reason'; end if;
 update public.scheduled_classes set status='cancelled',ended_at=now(),cancellation_reason=trim(p_reason) where id=c.id returning * into c;
 update public.email_alerts set status='expired',expires_at=now() where event_key='scheduled:tutor-reminder:'||c.id and status in ('pending','failed');
 for b in select * from public.scheduled_class_bookings where class_id=c.id order by student_email,id for update loop
  update public.email_alerts set status='expired',expires_at=now() where status in ('pending','failed') and
   (event_key='scheduled:booking:'||b.id or event_key like 'scheduled:reminder:'||b.id||':%');
  if b.payment_status not in ('released','refunded') then perform public.resolve_scheduled_booking(b.id,'refund',null,trim(p_reason)); end if;
  perform public.scheduled_email('cancel-class:'||b.id,b.student_email,'Scheduled class cancelled',c.topic||E'\nReason: '||trim(p_reason)||E'\nYour reserved fee has been refunded.','student',c.id);
 end loop;
 perform public.scheduled_email('cancel-class-tutor:'||c.id,c.tutor_email,'Scheduled class cancelled',c.topic||E'\nReason: '||trim(p_reason),'tutor',c.id);
 return c;
end $$;

create or replace function public.finish_scheduled_class(p_class uuid,p_tutor text)
returns public.scheduled_classes language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.scheduled_classes; b public.scheduled_class_bookings;
begin
 select * into c from public.scheduled_classes where id=p_class for update;
 if not found or (p_tutor is not null and c.tutor_email<>lower(trim(p_tutor))) then raise exception 'Class not found'; end if;
 if c.status='completed' then return c; end if;
 if c.status<>'live' or c.tutor_joined_at is null then raise exception 'The tutor must join before completing this class'; end if;
 -- Early closure is held for administrator review, never an automatic full payout.
 update public.scheduled_classes set status='completed',ended_at=least(now(),ends_at) where id=c.id returning * into c;
 update public.tutor_profiles set total_sessions=coalesce(total_sessions,0)+1 where user_email=c.tutor_email;
 for b in select * from public.scheduled_class_bookings where class_id=c.id and payment_status='reserved' order by student_email,id for update loop
  update public.scheduled_class_bookings set payment_status=case when c.ended_at<c.ends_at then 'held' else 'pending' end,
   release_at=c.ended_at+interval '20 minutes',resolution_note=case when c.ended_at<c.ends_at then 'Class ended early; administrator review required' else null end where id=b.id;
  perform public.scheduled_email('completed:'||b.id,b.student_email,'Scheduled class completed',c.topic||E'\nReport any payment issue within 20 minutes of class end. Recording processing may take a few minutes; a separate email will contain the download deadline.','student',c.id);
 end loop;
 update public.scheduled_class_recordings set download_until=greatest(ready_at,c.ended_at)+interval '15 minutes' where class_id=c.id and state='ready';
 perform public.queue_scheduled_recording_emails(c.id);
 return c;
end $$;

create or replace function public.dispute_scheduled_booking(p_booking uuid,p_student text,p_reason text)
returns public.scheduled_class_bookings language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.scheduled_classes; b public.scheduled_class_bookings;
begin
 select cl.* into c from public.scheduled_classes cl join public.scheduled_class_bookings bk on bk.class_id=cl.id where bk.id=p_booking and bk.student_email=lower(trim(p_student)) for update of cl;
 if not found then raise exception 'Booking not found'; end if;
 select * into b from public.scheduled_class_bookings where id=p_booking for update;
 if length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Describe the issue (5 to 1000 characters)'; end if;
 if c.status<>'completed' or c.ended_at+interval '20 minutes'<=now() or b.payment_status not in ('pending','held') then raise exception 'The 20-minute dispute window has closed or payment is resolved'; end if;
 update public.scheduled_class_bookings set payment_status='held',dispute=trim(p_reason) where id=b.id returning * into b;
 perform public.scheduled_email('dispute:'||b.id,b.student_email,'Class payment held for review',c.topic||E'\nYour payment issue has been sent to the administrator.','student',c.id);
 perform public.scheduled_email('dispute-tutor:'||b.id,c.tutor_email,'Class payment held for review',c.topic||E'\nA student reported a payment issue. Administrator review is required.','tutor',c.id);
 return b;
end $$;

create or replace function public.record_scheduled_attendance(p_event text,p_class uuid,p_identity text,p_sid text,p_kind text,p_at timestamptz)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.scheduled_classes; email text; role text; inserted integer;
begin
 if p_event is null or p_sid is null or p_kind not in ('participant_joined','participant_left') or p_at is null then return false; end if;
 select * into c from public.scheduled_classes where id=p_class for update;
 if not found then return false; end if;
 role:=substring(p_identity from ':(student|tutor)$');
 if role='tutor' then
  if p_identity<>c.id||':tutor' then return false; end if;
  email:=c.tutor_email;
 elsif role='student' then
  select student_email into email from public.scheduled_class_bookings where class_id=c.id and id::text||':student'=p_identity and status='booked';
  if not found then return false; end if;
 else return false;
 end if;
 if p_at<c.starts_at-interval '10 minutes' or p_at>c.ends_at+interval '5 minutes' then return false; end if;
 insert into public.scheduled_class_attendance values(p_event,p_class,p_identity,p_sid,p_kind,p_at) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return false; end if;
 if p_kind='participant_joined' and c.status in ('scheduled','live') then
  if role='tutor' and (c.tutor_joined_at is not null or p_at<=c.starts_at+interval '10 minutes') then
   update public.scheduled_classes set status='live',tutor_joined_at=least(coalesce(tutor_joined_at,p_at),p_at) where id=c.id;
  elsif role='student' then
   update public.scheduled_class_bookings set joined_at=least(coalesce(joined_at,p_at),p_at) where class_id=c.id and student_email=email and status='booked';
  end if;
 end if;
 return true;
end $$;

create or replace function public.scheduled_tutor_attendance_seconds(p_class uuid)
returns numeric language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(sum(greatest(0,extract(epoch from least(coalesce(a.left_at,c.ended_at,c.ends_at),c.ends_at)-greatest(a.joined_at,c.starts_at)))),0)
 from public.scheduled_classes c join (
  select participant_sid,min(happened_at) filter(where kind='participant_joined') joined_at,
   min(happened_at) filter(where kind='participant_left') left_at
  from public.scheduled_class_attendance where class_id=p_class and identity=p_class||':tutor' group by participant_sid
 ) a on a.joined_at is not null where c.id=p_class;
$$;

create or replace function public.reconcile_scheduled_absence(p_class uuid,p_present text[],p_at timestamptz)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.scheduled_classes; attendee record;
begin
 select * into c from public.scheduled_classes where id=p_class for update;
 if not found then return; end if;
 for attendee in select a.participant_sid,a.identity,min(a.happened_at) joined_at from public.scheduled_class_attendance a
  where a.class_id=c.id and a.kind='participant_joined' and not (a.participant_sid=any(coalesce(p_present,array[]::text[])))
   and not exists(select 1 from public.scheduled_class_attendance departed where departed.class_id=c.id and departed.participant_sid=a.participant_sid and departed.kind='participant_left')
  group by a.participant_sid,a.identity having min(a.happened_at)<p_at-interval '1 minute' loop
  perform public.record_scheduled_attendance('reconciled-left:'||attendee.participant_sid,c.id,attendee.identity,attendee.participant_sid,'participant_left',least(p_at,c.ends_at));
 end loop;
end $$;

create or replace function public.scheduled_class_tick()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.scheduled_classes; b public.scheduled_class_bookings; reminder text; processed integer:=0;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('scheduled-class-tick',0)) then return 0; end if;
 for c in select * from public.scheduled_classes where status in ('scheduled','live') order by starts_at,id for update skip locked loop
  if (c.status='scheduled' or c.starts_at>now()) and (exists(select 1 from public.account_moderation where user_email=c.tutor_email and
   (status='banned' or (status='suspended' and suspended_until>now()))) or exists(select 1 from public.tutor_conduct where tutor_email=c.tutor_email and status='restricted')) then
   perform public.cancel_scheduled_class(c.id,null,'Tutor is unavailable due to an account restriction');
  elsif c.status='live' and exists(select 1 from public.account_moderation where user_email=c.tutor_email and
   (status='banned' or (status='suspended' and suspended_until>now()))) then
   perform public.finish_scheduled_class(c.id,null);
  elsif c.status='scheduled' and c.starts_at+interval '10 minutes'<=now() then
   perform public.cancel_scheduled_class(c.id,null,'Tutor did not join within the 10-minute grace period');
  elsif c.status='live' and c.ends_at<=now() then
   perform public.finish_scheduled_class(c.id,null);
  elsif c.starts_at>now() then
   foreach reminder in array array['24h','15m'] loop
    if c.starts_at<=now()+(case when reminder='24h' then interval '24 hours' else interval '15 minutes' end) then
     for b in select * from public.scheduled_class_bookings where class_id=c.id and status='booked' and
       (reminder<>'24h' or created_at<=c.starts_at-interval '24 hours') loop
      perform public.scheduled_email('reminder:'||b.id||':'||reminder,b.student_email,'Class reminder ('||reminder||')',c.topic||E'\nTutor: '||c.tutor_name||E'\nStarts (UTC): '||c.starts_at||E'\nJoin from your scheduled classes page.','student',c.id,c.starts_at,case when reminder='15m' then 50 else 20 end);
     end loop;
     if reminder='15m' then
      perform public.scheduled_email('tutor-reminder:'||c.id,c.tutor_email,'Your class starts soon',c.topic||E'\nStarts (UTC): '||c.starts_at||E'\nBooked students: '||(select count(*) from public.scheduled_class_bookings where class_id=c.id and status='booked'),'tutor',c.id,c.starts_at,50);
     end if;
    end if;
   end loop;
  end if;
  processed:=processed+1;
 end loop;
 -- Missing tutor attendance is held for evidence review rather than silently paid.
 for c in select * from public.scheduled_classes where status='completed' and exists(select 1 from public.scheduled_class_bookings where class_id=scheduled_classes.id and payment_status='pending') order by id for update skip locked loop
  if public.scheduled_tutor_attendance_seconds(c.id)<c.duration_min*60*0.8 then
   update public.scheduled_class_bookings set payment_status='held',resolution_note='Tutor attendance below 80%; administrator review required' where class_id=c.id and payment_status='pending';
  end if;
 end loop;
 for b in select bk.* from public.scheduled_class_bookings bk join public.scheduled_classes cl on cl.id=bk.class_id
  where bk.payment_status='pending' and bk.release_at<=now() and bk.dispute is null order by cl.id,bk.id loop
  perform public.resolve_scheduled_booking(b.id,'release',null,null);
 end loop;
 for c in select * from public.scheduled_classes where status='completed' and exists(select 1 from public.scheduled_class_recordings where class_id=scheduled_classes.id and state='ready' and download_until>now()) loop
  perform public.queue_scheduled_recording_emails(c.id);
 end loop;
 return processed;
end $$;

create or replace function public.queue_scheduled_recording_emails(p_class uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.scheduled_classes; r public.scheduled_class_recordings; b public.scheduled_class_bookings;
begin
 select * into c from public.scheduled_classes where id=p_class;
 if not found or c.status<>'completed' then return; end if;
 for r in select * from public.scheduled_class_recordings where class_id=c.id and state='ready' and object_key is not null and download_until>now() loop
  for b in select * from public.scheduled_class_bookings where class_id=c.id and status='booked' loop
   perform public.scheduled_email('recording:'||r.egress_id||':'||b.id,b.student_email,'Class recording ready — download now',c.topic||E'\nDownload deadline (UTC): '||r.download_until||E'\nDownload the recording to your device within 15 minutes.','student',c.id,r.download_until,100);
  end loop;
 end loop;
end $$;

create or replace function public.save_scheduled_recording(p_egress text,p_class uuid,p_key text,p_state text,p_version numeric)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.scheduled_class_recordings; c public.scheduled_classes; b public.scheduled_class_bookings;
begin
 select * into c from public.scheduled_classes where id=p_class for update;
 if not found then raise exception 'Class not found'; end if;
 if p_state not in ('starting','recording','processing','ready','failed') or p_version is null or
  (p_key is not null and p_key !~ ('^classes/'||p_class||'/[0-9a-f-]{36}\.mp4$')) then raise exception 'Invalid recording event'; end if;
 select * into r from public.scheduled_class_recordings where egress_id=p_egress for update;
 if found then
  if r.class_id<>p_class then raise exception 'Recording class conflict'; end if;
  if r.event_version>=p_version or r.state in ('deleting','deleted') or (r.state='ready' and p_state<>'ready') then return; end if;
 end if;
 insert into public.scheduled_class_recordings(egress_id,class_id,object_key,state,event_version,ready_at,download_until)
 values(p_egress,p_class,p_key,p_state,p_version,case when p_state='ready' then now() end,case when p_state='ready' then greatest(now(),coalesce(c.ended_at,c.ends_at))+interval '15 minutes' end)
 on conflict(egress_id) do update set object_key=coalesce(excluded.object_key,scheduled_class_recordings.object_key),state=excluded.state,event_version=excluded.event_version,
  ready_at=coalesce(scheduled_class_recordings.ready_at,excluded.ready_at),download_until=coalesce(scheduled_class_recordings.download_until,excluded.download_until)
 returning * into r;
 if p_state='ready' then perform public.queue_scheduled_recording_emails(c.id); end if;
end $$;

create or replace function public.claim_scheduled_recording_deletion(p_egress text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.scheduled_class_recordings; c public.scheduled_classes;
begin
 select cl.* into c from public.scheduled_classes cl join public.scheduled_class_recordings rec on rec.class_id=cl.id where rec.egress_id=p_egress for update of cl;
 if not found then return null; end if;
 select * into r from public.scheduled_class_recordings where egress_id=p_egress for update;
 if r.state='deleted' or r.object_key is null or c.status not in ('completed','cancelled') then return null; end if;
 -- Keep evidence through the dispute window and while any payment is held.
 if c.status='completed' and (now()<c.ended_at+interval '20 minutes' or exists(select 1 from public.scheduled_class_bookings where class_id=c.id and payment_status='held')) then return null; end if;
 if r.state in ('starting','recording','processing') or (r.download_until is not null and r.download_until>now()) then return null; end if;
 update public.scheduled_class_recordings set state='deleting' where egress_id=p_egress;
 return r.object_key;
end $$;
create or replace function public.finish_scheduled_recording_deletion(p_egress text)
returns void language sql security definer set search_path=public,pg_temp as $$
 update public.scheduled_class_recordings set state='deleted',deleted_at=now() where egress_id=p_egress and state='deleting';
$$;

create or replace function public.scheduled_recording_cleanup_candidates(p_limit integer default 50)
returns table(egress_id text,class_id uuid) language sql stable security definer set search_path=public,pg_temp as $$
 select r.egress_id,r.class_id from public.scheduled_class_recordings r join public.scheduled_classes c on c.id=r.class_id
 where r.state in ('ready','failed','deleting') and r.object_key is not null and (r.download_until is null or r.download_until<=now())
  and (c.status='cancelled' or (c.status='completed' and c.ended_at+interval '20 minutes'<=now()
    and not exists(select 1 from public.scheduled_class_bookings b where b.class_id=c.id and b.payment_status='held')))
 order by r.created_at,r.egress_id limit greatest(1,least(coalesce(p_limit,50),50));
$$;

create or replace function public.scheduled_wallet_summary(p_email text,p_role text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('reserved',coalesce(sum(b.amount) filter(where b.payment_status='reserved'),0),
  'pending',coalesce(sum(b.amount) filter(where b.payment_status='pending'),0),
  'held',coalesce(sum(b.amount) filter(where b.payment_status='held'),0),
  'released',coalesce(sum(b.amount) filter(where b.payment_status='released'),0),
  'refunded',coalesce(sum(b.amount) filter(where b.payment_status='refunded'),0))
 from public.scheduled_class_bookings b join public.scheduled_classes c on c.id=b.class_id
 where (p_role='student' and b.student_email=lower(trim(p_email))) or (p_role='tutor' and c.tutor_email=lower(trim(p_email)));
$$;

create or replace function public.scheduled_class_summary(p_class uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('booked_count',count(*) filter(where status='booked'),
  'reserved',coalesce(sum(amount) filter(where payment_status='reserved'),0),
  'released',coalesce(sum(amount) filter(where payment_status='released'),0))
 from public.scheduled_class_bookings where class_id=p_class;
$$;

create or replace function public.scheduled_student_classes(p_email text,p_mode text,p_page integer default 0)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 with matching as (
  select (to_jsonb(c)-'tutor_email')||jsonb_build_object('my_booking',to_jsonb(b)-'student_email') item,
   c.starts_at,b.id from public.scheduled_class_bookings b join public.scheduled_classes c on c.id=b.class_id
  where b.student_email=lower(trim(p_email)) and
   ((p_mode='mine' and b.status='booked' and c.status in ('scheduled','live')) or
    (p_mode='past' and (b.status='cancelled' or c.status in ('completed','cancelled'))))
 ), page as (
  select * from matching order by case when p_mode='mine' then starts_at end asc,
   case when p_mode='past' then starts_at end desc,id limit 12 offset greatest(0,least(coalesce(p_page,0),100000))*12
 ) select jsonb_build_object('classes',coalesce((select jsonb_agg(item order by case when p_mode='mine' then starts_at end asc,
  case when p_mode='past' then starts_at end desc,id) from page),'[]'::jsonb),'count',(select count(*) from matching));
$$;

create or replace function public.guard_scheduled_tutor_bid()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status in ('pending','accepted') and exists(select 1 from public.scheduled_classes where tutor_email=lower(trim(new.tutor_email))
  and status in ('scheduled','live') and ends_at>now() and starts_at<now()+new.duration_min*interval '1 minute') then raise exception 'This instant session overlaps your scheduled class'; end if;
 return new;
end $$;
drop trigger if exists guard_scheduled_tutor_bid on public.bids;
create trigger guard_scheduled_tutor_bid before insert or update of status on public.bids for each row execute function public.guard_scheduled_tutor_bid();

create or replace function public.guard_scheduled_student_session()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare duration integer;
begin
 if new.status='accepted' and new.session_ended_at is null and new.settled_at is null then
  select duration_min+coalesce(new.extension_minutes,0) into duration from public.bids where id=new.accepted_bid_id;
  if exists(select 1 from public.scheduled_class_bookings b join public.scheduled_classes c on c.id=b.class_id where b.student_email=new.student_email
   and b.status='booked' and c.status in ('scheduled','live') and c.ends_at>now()
   and c.starts_at<coalesce(new.session_started_at,now())+duration*interval '1 minute') then raise exception 'This instant session overlaps your scheduled class booking'; end if;
  if exists(select 1 from public.scheduled_classes c join public.bids bid on bid.tutor_email=c.tutor_email where bid.id=new.accepted_bid_id
   and c.status in ('scheduled','live') and c.ends_at>now() and c.starts_at<coalesce(new.session_started_at,now())+duration*interval '1 minute') then raise exception 'This session or extension overlaps the tutor scheduled class'; end if;
 end if;
 return new;
end $$;
drop trigger if exists guard_scheduled_student_session on public.problems;
create trigger guard_scheduled_student_session before update of status,session_started_at,extension_minutes on public.problems for each row execute function public.guard_scheduled_student_session();

-- Only the server can mutate classes, bookings, payments, attendance and recordings.
do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('scheduled_email','scheduled_assert_access','create_scheduled_class','book_scheduled_class','resolve_scheduled_booking','cancel_scheduled_booking',
  'cancel_scheduled_class','finish_scheduled_class','dispute_scheduled_booking','record_scheduled_attendance','scheduled_class_tick',
  'save_scheduled_recording','claim_scheduled_recording_deletion','finish_scheduled_recording_deletion','scheduled_recording_cleanup_candidates','scheduled_tutor_attendance_seconds','reconcile_scheduled_absence','queue_scheduled_recording_emails','scheduled_wallet_summary','scheduled_class_summary','scheduled_student_classes','guard_scheduled_tutor_bid','guard_scheduled_student_session','assert_scheduled_join') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
