-- Deploy cleanup-attendance-stories with custom secret verification before
-- applying this migration. No app user receives the scheduler credential.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
begin
  if not exists (select 1 from vault.secrets where name='no_excuse_story_cleanup_secret') then
    perform vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text,
      'no_excuse_story_cleanup_secret','Limited-purpose attendance story cleanup authentication');
  end if;
end;
$$;
create or replace function public.story_cleanup_secret()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name='no_excuse_story_cleanup_secret' limit 1;
$$;
revoke all on function public.story_cleanup_secret() from public,anon,authenticated;
grant execute on function public.story_cleanup_secret() to service_role;
do $$
declare v_job bigint;
begin
  for v_job in select jobid from cron.job where jobname='no-excuse-expire-attendance-stories' loop
    perform cron.unschedule(v_job);
  end loop;
end;
$$;
select cron.schedule('no-excuse-expire-attendance-stories','*/5 * * * *', $job$
  select net.http_post(
    url:='https://jcwvpcojpwjtolljzrks.supabase.co/functions/v1/cleanup-attendance-stories',
    headers:=jsonb_build_object('Content-Type','application/json','x-story-cleanup-secret',public.story_cleanup_secret()),
    body:='{}'::jsonb, timeout_milliseconds:=30000
  );
$job$);
commit;
