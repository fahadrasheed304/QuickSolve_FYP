begin;
alter table public.tutor_teaching_demos
 add column if not exists review_email_status text not null default 'not_required'
 check (review_email_status in ('not_required','pending','sending','sent','failed')),
 add column if not exists review_email_attempted_at timestamptz;

update public.tutor_teaching_demos set review_email_status='pending'
where status='rejected' and review_email_status='not_required';

create or replace function public.queue_demo_review_email()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='rejected' and old.status is distinct from new.status then
   new.review_email_status:='pending';
   new.review_email_attempted_at:=null;
 end if;
 return new;
end $$;
drop trigger if exists queue_demo_review_email on public.tutor_teaching_demos;
create trigger queue_demo_review_email before update of status on public.tutor_teaching_demos
for each row execute function public.queue_demo_review_email();
revoke all on function public.queue_demo_review_email() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
