-- Run after deployment and the scheduled-classes migration.
-- Supabase Vault secrets: quicksolve_app_url (production HTTPS origin) and
-- quicksolve_cron_secret (exactly CRON_SECRET from Vercel, at least 32 characters).
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='quicksolve_app_url' and decrypted_secret like 'https://%')
  or not exists(select 1 from vault.decrypted_secrets where name='quicksolve_cron_secret' and length(decrypted_secret)>=32) then
  raise exception 'Configure quicksolve_app_url and quicksolve_cron_secret in Supabase Vault first';
 end if;
end $$;
select cron.schedule('quicksolve-scheduled-classes','* * * * *',$job$
 select net.http_get(
  url:=rtrim((select decrypted_secret from vault.decrypted_secrets where name='quicksolve_app_url'),'/')||'/api/cron/scheduled-classes',
  headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='quicksolve_cron_secret')),
  timeout_milliseconds:=60000);
$job$);
select cron.schedule('quicksolve-email-alerts','* * * * *',$job$
 select net.http_get(
  url:=rtrim((select decrypted_secret from vault.decrypted_secrets where name='quicksolve_app_url'),'/')||'/api/cron/emails',
  headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='quicksolve_cron_secret')),
  timeout_milliseconds:=60000);
$job$);
-- Monitor actual HTTP results, including 503s:
-- select status_code,timed_out,error_msg,created from net._http_response order by created desc limit 20;
