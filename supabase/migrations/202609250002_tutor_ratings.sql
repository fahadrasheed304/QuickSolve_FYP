begin;
create index if not exists session_payments_tutor_rating_idx on public.session_payments(tutor_email) where rating between 1 and 5;
-- One saved review per session. Low ratings count even if payment is held.
-- Zero means a dispute without stars, and is excluded from the average.
create or replace function public.get_tutor_rating(p_email text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('rating',round(avg(rating),2),'review_count',count(*))
  from public.session_payments
  where tutor_email=lower(trim(p_email)) and rating between 1 and 5;
$$;
revoke all on function public.get_tutor_rating(text) from public,anon,authenticated;
grant execute on function public.get_tutor_rating(text) to service_role;
notify pgrst,'reload schema';
commit;
