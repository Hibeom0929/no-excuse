-- Opt-in, device-scoped attendance reminders. No existing records are deleted.
begin;
create table public.attendance_push_settings (
  id boolean primary key default true check (id),
  public_key text,
  last_dispatch_at timestamptz,
  enabled boolean not null default false
);
insert into public.attendance_push_settings(id) values(true);
create table public.attendance_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id),
  endpoint text not null unique check (length(endpoint)<=2048),
  p256dh text not null,
  auth_key text not null,
  language text not null default 'ko' check (language in ('ko','en')),
  enabled boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
create table public.attendance_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.attendance_push_subscriptions(id),
  member_id uuid not null references public.profiles(id),
  entry_id uuid not null references public.timetable_entries(id) on delete cascade,
  class_date date not null,
  status text not null default 'claimed' check (status in ('claimed','sent','failed','skipped','expired')),
  claimed_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  unique(subscription_id,entry_id,class_date)
);
create index attendance_push_enabled_idx on public.attendance_push_subscriptions(member_id) where enabled;
alter table public.attendance_push_settings enable row level security;
alter table public.attendance_push_subscriptions enable row level security;
alter table public.attendance_push_deliveries enable row level security;
revoke all on public.attendance_push_settings,public.attendance_push_subscriptions,public.attendance_push_deliveries from public,anon,authenticated;
grant all on public.attendance_push_settings,public.attendance_push_subscriptions,public.attendance_push_deliveries to service_role;

create function public.valid_push_endpoint(p_endpoint text)
returns boolean language sql immutable set search_path='' as $$
  select length(p_endpoint)<=2048 and p_endpoint ~ '^https://(([a-zA-Z0-9-]+\.)*push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com)/[^[:space:]#]+$';
$$;
revoke all on function public.valid_push_endpoint(text) from public,anon,authenticated;

create function public.get_push_public_config()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('public_key',case when s.enabled then s.public_key else null end)
  from public.attendance_push_settings s where s.id and auth.uid() is not null;
$$;
create function public.get_push_subscription_status(p_endpoint text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.attendance_push_subscriptions
    where endpoint=p_endpoint and member_id=auth.uid() and enabled);
$$;
create function public.upsert_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_language text default 'ko')
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  perform pg_advisory_xact_lock(hashtextextended('push-device:'||auth.uid()::text,0));
  if not coalesce(public.valid_push_endpoint(p_endpoint),false)
    or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}$'
    or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$'
    or p_language is null or p_language not in ('ko','en') then raise exception '알림 구독 정보가 올바르지 않아요'; end if;
  if not exists(select 1 from public.attendance_push_settings where id and enabled and public_key is not null) then
    raise exception '알림 서버를 준비 중이에요. 잠시 후 다시 시도해주세요.';
  end if;
  if not exists(select 1 from public.attendance_push_subscriptions where endpoint=p_endpoint and member_id=auth.uid())
    and (select count(*) from public.attendance_push_subscriptions where member_id=auth.uid())>=10 then
    raise exception '등록된 알림 기기가 너무 많아요. 관리자에게 문의해주세요.';
  end if;
  insert into public.attendance_push_subscriptions(member_id,endpoint,p256dh,auth_key,language)
  values(auth.uid(),p_endpoint,p_p256dh,p_auth,p_language)
  on conflict(endpoint) do update set member_id=excluded.member_id,enabled=true,
    language=excluded.language,updated_at=statement_timestamp()
  -- Account switching may reuse a device, but knowing only its endpoint cannot
  -- steal or overwrite another device's encryption keys/subscription.
  where attendance_push_subscriptions.p256dh=excluded.p256dh
    and attendance_push_subscriptions.auth_key=excluded.auth_key;
  if not found then raise exception '알림 구독 정보가 올바르지 않아요'; end if;
end;
$$;
create function public.disable_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  update public.attendance_push_subscriptions set enabled=false,updated_at=statement_timestamp()
  where endpoint=p_endpoint and member_id=auth.uid();
end;
$$;
create function public.set_push_subscription_language(p_endpoint text,p_language text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or p_language is null or p_language not in ('ko','en') then raise exception '알림 구독 정보가 올바르지 않아요'; end if;
  update public.attendance_push_subscriptions set language=p_language,updated_at=statement_timestamp()
  where endpoint=p_endpoint and member_id=auth.uid() and enabled;
end;
$$;

-- No credentials are returned to normal app users. VAPID keys are generated by
-- the authenticated worker and stored in Vault, never in Vercel/browser code.
create function public.push_dispatch_config()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'secret',(select decrypted_secret from vault.decrypted_secrets where name='no_excuse_push_cron_secret' limit 1),
    'vapid',(select decrypted_secret::jsonb from vault.decrypted_secrets where name='no_excuse_push_vapid' limit 1)
  );
$$;
create function public.initialize_push_keys(p_public_key text,p_private_key text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('no-excuse-push-vapid',0));
  if p_public_key !~ '^[A-Za-z0-9_-]{87}$' or p_private_key !~ '^[A-Za-z0-9_-]{43}$'
    or p_public_key is null or p_private_key is null then raise exception 'Invalid VAPID keys'; end if;
  if not exists(select 1 from vault.secrets where name='no_excuse_push_vapid') then
    perform vault.create_secret(jsonb_build_object('publicKey',p_public_key,'privateKey',p_private_key)::text,
      'no_excuse_push_vapid','Attendance Web Push VAPID key pair');
    update public.attendance_push_settings set public_key=p_public_key where id;
  end if;
end;
$$;

-- One atomic claim per class/date/device; concurrent cron calls cannot duplicate
-- sends. Old/late events are not replayed when a paused server comes back.
create function public.attendance_push_class_at(p_date date,p_time text)
returns timestamptz language sql immutable set search_path='' as $$
  select case when p_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    then (p_date+p_time::time) at time zone 'Asia/Singapore' else null end;
$$;
revoke all on function public.attendance_push_class_at(date,text) from public,anon,authenticated;
create function public.claim_attendance_push(p_limit integer default 100,p_now timestamptz default statement_timestamp())
returns table(delivery_id uuid) language sql security definer set search_path='' as $$
  with clock as (select p_now as now, (p_now at time zone 'Asia/Singapore')::date as date),
  candidates as (
    select s.id as subscription_id,s.member_id,t.id as entry_id,c.date
    from clock c join public.timetable_entries t on t.weekday=extract(dow from c.date)::integer and t.archived_at is null
    join public.groups g on g.id=t.group_id and g.archived_at is null
    join public.group_members m on m.group_id=g.id and m.member_id=t.member_id and m.left_at is null
    join public.attendance_push_subscriptions s on s.member_id=t.member_id and s.enabled
    where exists(select 1 from public.attendance_push_settings where id and enabled)
      and public.attendance_push_class_at(c.date,t.start_time) <= c.now
      and public.attendance_push_class_at(c.date,t.start_time) > c.now-interval '2 minutes'
      and public.attendance_push_class_at(c.date,t.end_time) > c.now
      and not exists(select 1 from public.attendance_records a where a.timetable_entry_id=t.id and a.date=c.date
        and a.status in ('present','excused_pending','excused_approved'))
      and not exists(select 1 from public.attendance_push_deliveries d where d.subscription_id=s.id and d.entry_id=t.id and d.class_date=c.date)
    order by t.start_time,s.id,t.id limit greatest(1,least(coalesce(p_limit,100),100))
  ), claimed as (
    insert into public.attendance_push_deliveries(subscription_id,member_id,entry_id,class_date)
    select subscription_id,member_id,entry_id,date from candidates
    on conflict(subscription_id,entry_id,class_date) do nothing returning id
  ) select id from claimed;
$$;
create function public.read_attendance_push(p_delivery_id uuid,p_now timestamptz default statement_timestamp())
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('deliveryId',d.id,'memberId',s.member_id,'endpoint',s.endpoint,
    'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key),'language',s.language,
    'groupId',t.group_id,'entryId',t.id,'subject',t.subject,'startTime',t.start_time,'date',d.class_date,
    'expiresAt',extract(epoch from (public.attendance_push_class_at(d.class_date,t.start_time)+interval '2 minutes'))*1000)
  from public.attendance_push_deliveries d join public.attendance_push_subscriptions s on s.id=d.subscription_id
  join public.timetable_entries t on t.id=d.entry_id and t.archived_at is null
  join public.groups g on g.id=t.group_id and g.archived_at is null
  join public.group_members m on m.group_id=g.id and m.member_id=s.member_id and m.left_at is null
  where d.id=p_delivery_id and d.status='claimed' and s.enabled and d.member_id=s.member_id and t.member_id=s.member_id
    and exists(select 1 from public.attendance_push_settings where id and enabled)
    and public.attendance_push_class_at(d.class_date,t.start_time) <= p_now
    and public.attendance_push_class_at(d.class_date,t.start_time) > p_now-interval '2 minutes'
    and public.attendance_push_class_at(d.class_date,t.end_time) > p_now
    and not exists(select 1 from public.attendance_records a where a.timetable_entry_id=t.id and a.date=d.class_date
      and a.status in ('present','excused_pending','excused_approved'));
$$;
create function public.finish_attendance_push(p_delivery_id uuid,p_status text,p_disable boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_status is null or p_status not in ('sent','failed','skipped','expired') then raise exception 'Invalid delivery outcome'; end if;
  update public.attendance_push_deliveries set status=p_status,completed_at=statement_timestamp()
  where id=p_delivery_id and status='claimed';
  if found and p_disable then
    update public.attendance_push_subscriptions s set enabled=false,updated_at=statement_timestamp()
    from public.attendance_push_deliveries d where d.id=p_delivery_id and s.id=d.subscription_id and s.member_id=d.member_id;
  end if;
end;
$$;
create function public.push_dispatch_heartbeat()
returns void language sql security definer set search_path='' as $$
  update public.attendance_push_settings set last_dispatch_at=statement_timestamp() where id;
$$;

revoke all on function public.get_push_public_config(),public.get_push_subscription_status(text),
  public.upsert_push_subscription(text,text,text,text),public.disable_push_subscription(text),public.set_push_subscription_language(text,text) from public,anon;
grant execute on function public.get_push_public_config(),public.get_push_subscription_status(text),
  public.upsert_push_subscription(text,text,text,text),public.disable_push_subscription(text),public.set_push_subscription_language(text,text) to authenticated;
revoke all on function public.push_dispatch_config(),public.initialize_push_keys(text,text),public.claim_attendance_push(integer,timestamptz),
  public.read_attendance_push(uuid,timestamptz),public.finish_attendance_push(uuid,text,boolean),public.push_dispatch_heartbeat() from public,anon,authenticated;
grant execute on function public.push_dispatch_config(),public.initialize_push_keys(text,text),public.claim_attendance_push(integer,timestamptz),
  public.read_attendance_push(uuid,timestamptz),public.finish_attendance_push(uuid,text,boolean),public.push_dispatch_heartbeat() to service_role;
commit;
