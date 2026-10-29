begin;

-- Existing tutors are grandfathered in. New tutor profiles opt in at creation.
alter table public.tutor_profiles
  add column if not exists demo_required boolean not null default false;

create or replace function public.guard_bid_teaching_demo()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare subject_name text; requires_demo boolean;
begin
 select subject into subject_name from public.problems where id=new.problem_id;
 select demo_required into requires_demo from public.tutor_profiles
   where user_email=lower(trim(new.tutor_email));
 if coalesce(requires_demo,false) and not exists(
   select 1 from public.tutor_teaching_demos
   where tutor_email=lower(trim(new.tutor_email)) and subject=subject_name and status='approved'
 ) then
   raise exception 'An approved teaching demo is required for this subject';
 end if;
 return new;
end $$;

revoke all on function public.guard_bid_teaching_demo() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
