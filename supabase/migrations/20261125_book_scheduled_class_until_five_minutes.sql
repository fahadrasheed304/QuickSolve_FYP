create or replace function public.book_scheduled_class(
  p_class uuid,
  p_student text,
  p_request uuid,
  p_consent boolean
)
returns public.scheduled_class_bookings
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  c public.scheduled_classes;
  b public.scheduled_class_bookings;
  name text;
begin
  p_student := lower(trim(p_student));
  perform public.scheduled_assert_access(p_student, 'student');
  perform pg_advisory_xact_lock(hashtextextended('scheduled-student:' || p_student, 0));

  if p_request is null or p_consent is distinct from true then
    raise exception 'Accept the recording and cancellation policy before booking';
  end if;

  select * into c from public.scheduled_classes where id = p_class for update;
  if not found then
    raise exception 'Class not found';
  end if;

  select * into b from public.scheduled_class_bookings where id = p_request;
  if found then
    if b.class_id <> p_class or b.student_email <> p_student then
      raise exception 'Booking request conflict';
    end if;
    return b;
  end if;

  select * into b from public.scheduled_class_bookings
  where class_id = p_class and student_email = p_student and status = 'booked';
  if found then
    return b;
  end if;

  if c.tutor_email = p_student then
    raise exception 'You cannot book your own class';
  end if;
  perform public.scheduled_assert_access(c.tutor_email, 'tutor');

  if exists(select 1 from public.tutor_conduct where tutor_email = c.tutor_email and status = 'restricted') then
    raise exception 'Tutor is restricted from new bookings';
  end if;

  if c.status <> 'scheduled' or c.starts_at <= now() + interval '5 minutes' then
    raise exception 'Booking closes 5 minutes before the class';
  end if;

  if (select count(*) from public.scheduled_class_bookings where class_id = p_class and status = 'booked') >= c.capacity then
    raise exception 'This class is full';
  end if;

  if exists(select 1 from public.scheduled_class_bookings booked
    join public.scheduled_classes other on other.id = booked.class_id
    where booked.student_email = p_student and booked.status = 'booked'
      and other.status in ('scheduled', 'live') and other.starts_at < c.ends_at and other.ends_at > c.starts_at) then
    raise exception 'This class overlaps another booking';
  end if;

  if exists(select 1 from public.problems problem
    join public.bids bid on bid.id = problem.accepted_bid_id
    where problem.student_email = p_student and problem.status = 'accepted'
      and problem.settled_at is null and problem.session_ended_at is null
      and coalesce(problem.session_started_at, now())
        + (bid.duration_min + coalesce(problem.extension_minutes, 0)) * interval '1 minute' > c.starts_at) then
    raise exception 'This class overlaps an active one-to-one session';
  end if;

  select coalesce(nullif(fullname, ''), 'Student') into name
  from public.users where email = p_student;
  perform public.get_or_create_wallet(p_student, 'student');
  perform public.apply_wallet_transaction(
    p_student, 'student', c.fee, 'debit', 'Scheduled class reserve',
    'Seat reserved: ' || c.topic, 'session-scheduled-reserve:' || p_request
  );

  insert into public.scheduled_class_bookings(id, class_id, student_email, student_name, amount)
  values (p_request, p_class, p_student, name, c.fee)
  returning * into b;

  perform public.scheduled_email(
    'booking:' || b.id,
    p_student,
    'Class booking confirmed',
    c.topic || E'\nTutor: ' || c.tutor_name || E'\nStarts (UTC): ' || c.starts_at
      || E'\nDuration: ' || c.duration_min || ' minutes'
      || E'\nReserved fee: Rs. ' || c.fee
      || E'\nAudio, video and shared screens will be recorded. Download within 15 minutes after the recording is ready. Full cancellation refund until 5 minutes before start.',
    'student',
    c.id
  );

  return b;
end;
$function$;
