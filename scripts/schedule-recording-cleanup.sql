-- Run in Supabase SQL Editor AFTER the recording migration and Vercel deployment.
-- First create these named secrets in Supabase Vault (Dashboard):
-- quicksolve_app_url: your production HTTPS origin, without a trailing slash
-- quicksolve_cron_secret: exactly the same CRON_SECRET configured in Vercel
-- No credentials belong in this file.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='quicksolve_app_url' and decrypted_secret like 'https://%')
    or not exists(select 1 from vault.decrypted_secrets where name='quicksolve_cron_secret' and length(decrypted_secret)>=32) then
    raise exception 'Add quicksolve_app_url and quicksolve_cron_secret to Supabase Vault first';
  end if;
end $$;

select cron.schedule(
  'quicksolve-recording-cleanup',
  '* * * * *',
  $job$
    select net.http_get(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name='quicksolve_app_url'), '/') || '/api/cron/recordings',
      headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='quicksolve_cron_secret')),
      timeout_milliseconds := 60000
    );
  $job$
);

-- Inspect HTTP outcomes, not only Cron's successful enqueue:
-- select id,status_code,timed_out,error_msg,created from net._http_response order by created desc limit 20;
-- Disable just this job when retiring the deployment:
-- select cron.unschedule('quicksolve-recording-cleanup');
