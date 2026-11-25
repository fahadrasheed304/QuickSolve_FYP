create or replace function public.cancel_scheduled_booking(p_booking uuid, p_student text)
returns public.scheduled_class_bookings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  c public.scheduled_classes;
  b public.scheduled_class_bookings;
begin
  p_student := lower(trim(p_student));

  select cl.* into c
  from public.scheduled_classes cl
  join public.scheduled_class_bookings bk on bk.class_id = cl.id
  where bk.id = p_booking and bk.student_email = p_student
  for update of cl;

  if not found then
    raise exception 'Booking not found';
  end if;

  select * into b
  from public.scheduled_class_bookings
  where id = p_booking
  for update;

  if b.status = 'cancelled' then
    return b;
  end if;

  if c.status not in ('scheduled', 'live')
    or c.starts_at < now() + interval '5 minutes' then
    raise exception 'Cancellation is only available at least 5 minutes before class starts';
  end if;

  update public.scheduled_class_bookings
  set status = 'cancelled', cancelled_at = now()
  where id = b.id
  returning * into b;

  update public.email_alerts
  set status = 'expired', expires_at = now()
  where status in ('pending', 'failed')
    and (event_key = 'scheduled:booking:' || b.id
      or event_key like 'scheduled:reminder:' || b.id || ':%');

  if now() <= c.starts_at - interval '5 minutes' then
    b := public.resolve_scheduled_booking(
      b.id,
      'refund',
      null,
      'Full refund for cancellation at least 5 minutes before start'
    );
  end if;

  perform public.scheduled_email(
    'cancel-booking:' || b.id,
    p_student,
    'Class booking cancelled',
    c.topic || E'\n' || case
      when b.payment_status = 'refunded' then 'Your reserved fee has been refunded.'
      else 'Your booking was cancelled.'
    end,
    'student',
    c.id
  );

  return b;
end
$function$;
