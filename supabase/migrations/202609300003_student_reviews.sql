begin;
create table if not exists public.student_reviews (
 problem_id uuid primary key references public.problems(id), student_email text not null,
 tutor_email text not null, rating integer not null check(rating between 1 and 5),
 feedback text not null default '', created_at timestamptz not null default now()
);
create index if not exists student_reviews_email_idx on public.student_reviews(student_email);
alter table public.student_reviews enable row level security;
revoke all on public.student_reviews from public,anon,authenticated;
grant select,insert on public.student_reviews to service_role;
create or replace function public.submit_student_review(p_problem uuid,p_tutor text,p_rating integer,p_feedback text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.problems; b public.bids; saved public.student_reviews;
begin
 if p_rating is null or p_rating not between 1 and 5 or length(coalesce(p_feedback,''))>2000 then raise exception 'Choose 1 to 5 stars and feedback up to 2000 characters'; end if;
 select * into p from public.problems where id=p_problem for update;
 if not found then raise exception 'Session not found'; end if;
 select * into b from public.bids where id=p.accepted_bid_id;
 if b.tutor_email is null or b.tutor_email<>lower(trim(p_tutor)) or p.student_email=b.tutor_email then raise exception 'Only the assigned tutor may rate this student'; end if;
 if p.session_started_at is null or p.session_ended_at is null then raise exception 'The session must have started and ended before rating'; end if;
 select * into saved from public.student_reviews where problem_id=p_problem;
 if found then
   if saved.rating=p_rating and saved.feedback=trim(coalesce(p_feedback,'')) then return to_jsonb(saved); end if;
   raise exception 'This student has already been rated for this session';
 end if;
 insert into public.student_reviews(problem_id,student_email,tutor_email,rating,feedback)
 values(p_problem,p.student_email,b.tutor_email,p_rating,trim(coalesce(p_feedback,''))) returning * into saved;
 return to_jsonb(saved);
end $$;
create or replace function public.get_student_ratings(p_emails text[])
returns table(student_email text,rating numeric,review_count bigint)
language sql stable security definer set search_path=public,pg_temp as $$
 select student_email,round(avg(rating),2),count(*) from public.student_reviews where student_email=any(p_emails) group by student_email;
$$;
revoke all on function public.submit_student_review(uuid,text,integer,text) from public,anon,authenticated;
revoke all on function public.get_student_ratings(text[]) from public,anon,authenticated;
grant execute on function public.submit_student_review(uuid,text,integer,text),public.get_student_ratings(text[]) to service_role;
commit;
