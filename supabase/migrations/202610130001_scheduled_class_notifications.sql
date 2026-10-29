begin;
-- Allow class alerts alongside existing problem alerts, using the same private feed.
alter table public.notifications alter column problem_id drop not null;
alter table public.notifications add column if not exists class_id uuid references public.scheduled_classes(id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check
 (kind in ('new_request','new_bid','bid_accepted','bid_rejected','request_closed','tutor_joined','scheduled_class'));

create or replace function public.notify_scheduled_email()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.event_key like 'scheduled:%' and new.path ~ '^/(student|tutor)/scheduled-classes/[0-9a-f-]{36}$' then
  insert into public.notifications(recipient_email,recipient_role,kind,class_id,event_key,message)
  values(new.recipient_email,split_part(new.path,'/',2),'scheduled_class',split_part(new.path,'/',4)::uuid,
   new.event_key,new.subject||E'\n'||new.message) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function public.notify_scheduled_email() from public,anon,authenticated;
drop trigger if exists notify_scheduled_email on public.email_alerts;
create trigger notify_scheduled_email after insert on public.email_alerts for each row execute function public.notify_scheduled_email();

-- Restore missed booking/refund alerts once, without sending duplicate email.
insert into public.notifications(recipient_email,recipient_role,kind,class_id,event_key,message,created_at)
select e.recipient_email,split_part(e.path,'/',2),'scheduled_class',c.id,e.event_key,
 e.subject||E'\n'||e.message,e.created_at
from public.email_alerts e join public.scheduled_classes c on c.id::text=split_part(e.path,'/',4)
where e.event_key like 'scheduled:%' and e.status<>'expired'
 and e.path ~ '^/(student|tutor)/scheduled-classes/[0-9a-f-]{36}$'
on conflict do nothing;
notify pgrst,'reload schema';
commit;
