begin;

create table if not exists public.tutor_teaching_demos (
 id uuid primary key default gen_random_uuid(),
 tutor_email text not null references public.tutor_profiles(user_email),
 subject text not null check (length(subject) between 1 and 100),
 topic text not null check (length(trim(topic)) between 3 and 120),
 class_level text not null check (length(trim(class_level)) between 1 and 60),
 object_key text not null unique,
 status text not null default 'uploading' check (status in ('uploading','pending','approved','rejected','superseded','cancelled')),
 duration_seconds numeric check (duration_seconds > 0 and duration_seconds <= 300),
 file_size bigint check (file_size > 0 and file_size <= 52428800),
 scores jsonb,
 feedback text not null default '',
 reviewed_by text,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 check (status not in ('pending','approved') or (duration_seconds is not null and file_size is not null))
);
create unique index if not exists tutor_demo_current on public.tutor_teaching_demos(tutor_email,subject) where status='approved';
create unique index if not exists tutor_demo_submission on public.tutor_teaching_demos(tutor_email,subject) where status in ('uploading','pending');
create index if not exists tutor_demo_review_queue on public.tutor_teaching_demos(status,created_at);
alter table public.tutor_teaching_demos enable row level security;
revoke all on public.tutor_teaching_demos from public,anon,authenticated;
grant all on public.tutor_teaching_demos to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('tutor-demos','tutor-demos',false,52428800,array['video/mp4'])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=array['video/mp4'];

create or replace function public.reserve_tutor_demo(p_email text,p_subject text,p_topic text,p_class text)
returns public.tutor_teaching_demos language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.tutor_teaching_demos; demo_id uuid:=gen_random_uuid();
begin
 perform 1 from public.tutor_profiles where user_email=p_email for update;
 if not found then raise exception 'Tutor profile not found'; end if;
 update public.tutor_teaching_demos set status='cancelled'
 where tutor_email=p_email and status='uploading' and created_at<now()-interval '2 hours';
 if (select count(*) from public.tutor_teaching_demos where tutor_email=p_email and created_at>now()-interval '1 day')>=10 then
   raise exception 'Daily demo upload limit reached';
 end if;
 if exists(select 1 from public.tutor_teaching_demos where tutor_email=p_email and subject=p_subject and status in ('uploading','pending')) then
   raise exception 'Cancel or wait for the current submission before uploading another demo';
 end if;
 insert into public.tutor_teaching_demos(id,tutor_email,subject,topic,class_level,object_key)
 values(demo_id,p_email,p_subject,p_topic,p_class,demo_id::text||'.mp4') returning * into result;
 return result;
end $$;

create or replace function public.review_tutor_demo(p_id uuid,p_admin text,p_approve boolean,p_scores jsonb,p_feedback text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare demo public.tutor_teaching_demos; total integer:=0; score integer; criterion text;
begin
 select * into demo from public.tutor_teaching_demos where id=p_id;
 if not found then raise exception 'Demo not found'; end if;
 -- Serialize approvals for the same tutor, including replacement approvals.
 perform 1 from public.tutor_profiles where user_email=demo.tutor_email for update;
 select * into demo from public.tutor_teaching_demos where id=p_id for update;
 if demo.status<>'pending' then raise exception 'This demo is no longer awaiting review'; end if;
 if p_approve then
   if not exists(select 1 from public.tutor_profiles where user_email=demo.tutor_email and to_jsonb(subjects) ? demo.subject) then
     raise exception 'Demo subject is not in the tutor profile';
   end if;
   foreach criterion in array array['accuracy','clarity','example','communication'] loop
     if jsonb_typeof(p_scores->criterion) is distinct from 'number' or (p_scores->>criterion) !~ '^[1-5]$' then
       raise exception 'Each review score must be an integer from 1 to 5';
     end if;
     score:=(p_scores->>criterion)::integer; total:=total+score;
   end loop;
   if total<14 or (p_scores->>'accuracy')::integer<4 then raise exception 'Approval requires 14/20 and accuracy of at least 4/5'; end if;
   update public.tutor_teaching_demos set status='superseded' where tutor_email=demo.tutor_email and subject=demo.subject and status='approved';
 elsif length(trim(coalesce(p_feedback,'')))<10 then
   raise exception 'Give at least 10 characters of feedback for changes requested';
 end if;
 update public.tutor_teaching_demos set status=case when p_approve then 'approved' else 'rejected' end,
 scores=case when p_approve then p_scores else null end,feedback=left(trim(coalesce(p_feedback,'')),2000),reviewed_by=p_admin,reviewed_at=now() where id=p_id;
end $$;

create or replace function public.guard_bid_teaching_demo()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare subject_name text;
begin
 select subject into subject_name from public.problems where id=new.problem_id;
 if not exists(select 1 from public.tutor_teaching_demos where tutor_email=lower(trim(new.tutor_email)) and subject=subject_name and status='approved') then
   raise exception 'An approved teaching demo is required for this subject';
 end if;
 return new;
end $$;
drop trigger if exists guard_bid_teaching_demo on public.bids;
create trigger guard_bid_teaching_demo before insert or update of tutor_email,problem_id,tutor_subject on public.bids
for each row execute function public.guard_bid_teaching_demo();

revoke all on function public.reserve_tutor_demo(text,text,text,text),public.review_tutor_demo(uuid,text,boolean,jsonb,text),public.guard_bid_teaching_demo() from public,anon,authenticated;
grant execute on function public.reserve_tutor_demo(text,text,text,text),public.review_tutor_demo(uuid,text,boolean,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
