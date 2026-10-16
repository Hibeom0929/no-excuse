-- Apply only after send-attendance-reminders is deployed with JWT verification
-- ON, and the operator approves creation of the private scheduler credential.
-- Before this script, set this session-only value to the project's PUBLIC,
-- legacy anon JWT (not an sb_publishable key and NEVER a service-role key):
-- select set_config('no_excuse.push_gateway_anon','<public legacy anon JWT>',false);
-- Do not commit that project-specific value. No user is opted in by this script.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare
  gateway text := current_setting('no_excuse.push_gateway_anon',true);
  claims jsonb;
  encoded text;
begin
  if gateway is null or gateway !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    raise exception 'Set the public legacy anon JWT for this project in this SQL session first';
  end if;
  encoded := translate(split_part(gateway,'.',2),'-_','+/');
  claims := convert_from(decode(encoded||repeat('=',(4-length(encoded)%4)%4),'base64'),'UTF8')::jsonb;
  if claims->>'role' is distinct from 'anon' or claims->>'ref' is distinct from 'jcwvpcojpwjtolljzrks' then
    raise exception 'Only this project''s public anon JWT is accepted; never use a service-role credential';
  end if;
  if exists(select 1 from cron.job where jobname='no-excuse-class-start-reminders') then
    raise exception 'Reminder schedule already exists; inspect it rather than duplicating or replacing it';
  end if;
  if not exists(select 1 from vault.secrets where name='no_excuse_push_gateway_anon') then
    perform vault.create_secret(gateway,'no_excuse_push_gateway_anon','Public anon JWT for the function gateway; no data privileges');
  end if;
  if not exists(select 1 from vault.secrets where name='no_excuse_push_cron_secret') then
    perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,
      'no_excuse_push_cron_secret','Private attendance reminder scheduler credential');
  end if;
end;
$$;

-- The private scheduler secret is resolved inside the database, never included
-- in cron.job's command text, frontend code, SQL output or the Git repository.
select cron.schedule('no-excuse-class-start-reminders','* * * * *',$job$
  select net.http_post(
    url:='https://jcwvpcojpwjtolljzrks.supabase.co/functions/v1/send-attendance-reminders',
    headers:=jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='no_excuse_push_gateway_anon' limit 1),
      'x-no-excuse-cron',(select decrypted_secret from vault.decrypted_secrets where name='no_excuse_push_cron_secret' limit 1)),
    body:='{}'::jsonb, timeout_milliseconds:=60000
  );
$job$);
update public.attendance_push_settings set enabled=true where id;
commit;

-- First cron run initializes the VAPID pair inside the Edge Function and stores
-- it privately in Vault. Wait for last_dispatch_at/public_key before deploying
-- the frontend. Existing attendance/photo/fine/vote tables are not modified.
-- Stop sending, without deleting data or weakening authentication:
-- update public.attendance_push_settings set enabled=false where id;
-- select cron.alter_job((select jobid from cron.job where jobname='no-excuse-class-start-reminders'),active:=false);
