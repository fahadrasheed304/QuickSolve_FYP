begin;
create table if not exists public.account_moderation (
 user_email text primary key references public.users(email),
 status text not null default 'active' check(status in ('active','suspended','banned')),
 reason text not null default '', suspended_until timestamptz,
 revision integer not null default 0, updated_at timestamptz not null default now(), updated_by text,
 check ((status='suspended' and suspended_until is not null) or (status<>'suspended' and suspended_until is null))
);
create table if not exists public.account_moderation_events (
 id uuid primary key default gen_random_uuid(), user_email text not null references public.users(email),
 action text not null check(action in ('suspend','ban','restore')), reason text not null,
 suspended_until timestamptz, suspension_days integer, actor text not null, created_at timestamptz not null default now(),
 request_id uuid not null unique, revision integer not null
);
create index if not exists account_moderation_events_user_idx on public.account_moderation_events(user_email,created_at desc);
alter table public.account_moderation enable row level security;
alter table public.account_moderation_events enable row level security;
revoke all on public.account_moderation,public.account_moderation_events from public,anon,authenticated;
grant select,insert,update on public.account_moderation to service_role;
grant select,insert on public.account_moderation_events to service_role;

create or replace function public.admin_moderate_account(p_email text,p_action text,p_reason text,p_days integer,p_actor text,p_revision integer,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.users; current_state public.account_moderation; previous public.account_moderation_events; expiry timestamptz;
begin
 p_email:=lower(trim(p_email)); p_actor:=lower(trim(p_actor));
 if p_actor is distinct from 'quicksolve.officials@gmail.com' then raise exception 'Admin required'; end if;
 if p_action not in ('suspend','ban','restore') or p_action is null or length(trim(coalesce(p_reason,'')))<10 or length(p_reason)>2000 or p_request is null then raise exception 'Invalid decision'; end if;
 if p_action='suspend' and (p_days is null or p_days<1 or p_days>365) then raise exception 'Choose 1 to 365 days'; end if;
 select * into target from public.users where email=p_email for update;
 if not found then raise exception 'User not found'; end if;
 if target.role='admin' or p_email=p_actor then raise exception 'Administrator accounts cannot be moderated'; end if;
 select * into previous from public.account_moderation_events where request_id=p_request;
 if found then
   if previous.user_email<>p_email or previous.action<>p_action or previous.reason<>trim(p_reason) or previous.actor<>p_actor or previous.suspension_days is distinct from (case when p_action='suspend' then p_days else null end) then raise exception 'Decision request conflict'; end if;
   return (select to_jsonb(m) from public.account_moderation m where user_email=p_email);
 end if;
 insert into public.account_moderation(user_email) values(p_email) on conflict do nothing;
 select * into current_state from public.account_moderation where user_email=p_email for update;
 if p_revision is distinct from current_state.revision then raise exception 'Account changed. Refresh before deciding'; end if;
 if current_state.status='banned' and p_action='suspend' then raise exception 'Restore the permanent ban before applying a suspension'; end if;
 expiry:=case when p_action='suspend' then now()+make_interval(days=>p_days) else null end;
 update public.account_moderation set status=case p_action when 'ban' then 'banned' when 'suspend' then 'suspended' else 'active' end,
 reason=trim(p_reason),suspended_until=expiry,revision=revision+1,updated_at=now(),updated_by=p_actor
 where user_email=p_email returning * into current_state;
 insert into public.account_moderation_events(user_email,action,reason,suspended_until,suspension_days,actor,request_id,revision)
 values(p_email,p_action,trim(p_reason),expiry,case when p_action='suspend' then p_days else null end,p_actor,p_request,current_state.revision);
 return to_jsonb(current_state);
end $$;
revoke all on function public.admin_moderate_account(text,text,text,integer,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.admin_moderate_account(text,text,text,integer,text,integer,uuid) to service_role;
commit;
