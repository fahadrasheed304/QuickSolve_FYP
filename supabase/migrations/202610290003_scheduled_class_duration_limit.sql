begin;

-- Allow scheduled classes up to five hours, enforced by both the table and RPC.
alter table public.scheduled_classes
  drop constraint if exists scheduled_classes_duration_min_check;
alter table public.scheduled_classes
  add constraint scheduled_classes_duration_min_check
  check (duration_min between 15 and 300);

create or replace function public.create_scheduled_class(
  p_id uuid,
  p_tutor text,
  p_subject text,
  p_topic text,
  p_level text,
  p_description text,
  p_starts timestamptz,
  p_duration integer,
  p_fee numeric,
  p_capacity integer
)
returns public.scheduled_classes
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  saved public.scheduled_classes;
  tutor public.tutor_profiles;
begin
  p_tutor := lower(trim(p_tutor));
  perform public.scheduled_assert_access(p_tutor);
  perform pg_advisory_xact_lock(hashtextextended('scheduled-tutor:' || p_tutor, 0));
  select * into tutor from public.tutor_profiles where user_email=p_tutor for update;

  if not found
     or (tutor.verification_status is distinct from 'verified' and tutor.verification_stage is distinct from 'verified')
     or exists(select 1 from public.tutor_conduct where tutor_email=p_tutor and status='restricted') then
    raise exception 'A verified, unrestricted tutor is required';
  end if;
  if not (coalesce(to_jsonb(tutor.subjects),'[]'::jsonb) ? p_subject) then
    raise exception 'Choose one of your verified subjects';
  end if;

  select * into saved from public.scheduled_classes where id=p_id;
  if found then
    if saved.tutor_email<>p_tutor or saved.subject<>p_subject or saved.topic<>trim(p_topic)
       or saved.class_level<>trim(p_level) or saved.description<>trim(coalesce(p_description,''))
       or saved.starts_at<>p_starts or saved.duration_min<>p_duration or saved.fee<>p_fee
       or saved.capacity<>p_capacity then
      raise exception 'Class request conflict';
    end if;
    return saved;
  end if;

  if p_id is null or p_starts is null or p_starts<now()+interval '30 minutes'
     or p_starts>now()+interval '90 days' then
    raise exception 'Invalid class details or start time (30 minutes to 90 days ahead)';
  end if;
  if p_duration is null or p_duration not between 15 and 300 then
    raise exception 'Duration must be between 15 and 300 minutes (maximum 5 hours)';
  end if;
  if p_fee is null or p_fee<=0 or p_fee>100000 or p_fee<>trunc(p_fee,2)
     or p_capacity is null or p_capacity not between 2 and 10
     or length(trim(coalesce(p_topic,''))) not between 3 and 120
     or length(trim(coalesce(p_level,''))) not between 1 and 60
     or length(coalesce(p_description,''))>2000 then
    raise exception 'Invalid class details';
  end if;

  if exists(select 1 from public.scheduled_classes
    where tutor_email=p_tutor and status in ('scheduled','live')
      and starts_at<p_starts+p_duration*interval '1 minute' and ends_at>p_starts) then
    raise exception 'This class overlaps another scheduled class';
  end if;
  if exists(select 1 from public.problems problem
    join public.bids bid on bid.id=problem.accepted_bid_id
    where lower(trim(bid.tutor_email))=p_tutor and problem.status='accepted'
      and problem.settled_at is null and problem.session_ended_at is null
      and coalesce(problem.session_started_at,now())
        +(bid.duration_min+coalesce(problem.extension_minutes,0))*interval '1 minute'>p_starts) then
    raise exception 'This class overlaps an active one-to-one session';
  end if;

  insert into public.scheduled_classes(
    id,tutor_email,tutor_name,subject,topic,class_level,description,starts_at,ends_at,duration_min,fee,capacity
  ) values (
    p_id,p_tutor,coalesce(nullif(tutor.fullname,''),'Tutor'),p_subject,trim(p_topic),trim(p_level),
    trim(coalesce(p_description,'')),p_starts,p_starts+p_duration*interval '1 minute',p_duration,p_fee,p_capacity
  ) returning * into saved;
  return saved;
end $$;

revoke all on function public.create_scheduled_class(uuid,text,text,text,text,text,timestamptz,integer,numeric,integer)
  from public,anon,authenticated;
grant execute on function public.create_scheduled_class(uuid,text,text,text,text,text,timestamptz,integer,numeric,integer)
  to service_role;

notify pgrst,'reload schema';
commit;
