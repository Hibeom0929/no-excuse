-- New photos only: existing base64 photos are neither published nor deleted.
begin;
create table if not exists public.attendance_stories (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid unique references public.attendance_records(id) on delete set null,
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.profiles(id),
  object_path text not null unique,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default (statement_timestamp() + interval '24 hours'),
  check (expires_at = created_at + interval '24 hours')
);
create index if not exists attendance_stories_expiry_idx on public.attendance_stories(expires_at);
alter table public.attendance_stories enable row level security;
revoke all on public.attendance_stories from anon, authenticated;
grant all on public.attendance_stories to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-stories', 'attendance-stories', false, 204800, array['image/jpeg'])
on conflict (id) do update set public=false, file_size_limit=204800, allowed_mime_types=array['image/jpeg'];

-- A pending upload is accessible only to its owner, for up to 10 minutes.
-- Published files require current group membership, present attendance and TTL.
create or replace function public.can_read_story_object(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.attendance_stories s
      join public.attendance_records a on a.id=s.attendance_record_id
      join public.groups g on g.id=s.group_id and g.archived_at is null
      join public.group_members owner on owner.group_id=s.group_id and owner.member_id=s.member_id and owner.left_at is null
      where s.object_path=p_path and a.status='present' and s.expires_at > statement_timestamp()
        and public.is_group_member(s.group_id)
    ) or (
      split_part(p_path,'/',2)=auth.uid()::text
      and not exists (select 1 from public.attendance_stories s where s.object_path=p_path)
      and exists (select 1 from storage.objects o where o.bucket_id='attendance-stories'
        and o.name=p_path and o.created_at > statement_timestamp()-interval '10 minutes')
      and exists (select 1 from public.groups g where g.id::text=split_part(p_path,'/',1)
        and g.archived_at is null and public.is_group_member(g.id))
    )
  );
$$;
revoke all on function public.can_read_story_object(text) from public, anon;
grant execute on function public.can_read_story_object(text) to authenticated;

create policy "story authenticated read" on storage.objects for select to authenticated
using (bucket_id='attendance-stories' and public.can_read_story_object(name));
create policy "story owner upload" on storage.objects for insert to authenticated
with check (
  bucket_id='attendance-stories' and split_part(name,'/',2)=auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and exists (select 1 from public.groups g where g.id::text=split_part(name,'/',1)
    and g.archived_at is null and public.is_group_member(g.id))
);
-- Clients may compensate failed uploads, but must not delete an already
-- committed photo after a network timeout. Cancellation uses attendance DELETE.
create or replace function public.can_remove_pending_story_object(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and split_part(p_path,'/',2)=auth.uid()::text
    and not exists (select 1 from public.attendance_stories where object_path=p_path);
$$;
revoke all on function public.can_remove_pending_story_object(text) from public, anon;
grant execute on function public.can_remove_pending_story_object(text) to authenticated;
create policy "story owner remove uncommitted" on storage.objects for delete to authenticated
using (bucket_id='attendance-stories' and public.can_remove_pending_story_object(name));

create or replace function public.check_in_with_story(p_entry_id uuid, p_date date, p_object_path text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_entry public.timetable_entries;
  v_record public.attendance_records;
  v_group public.groups;
  v_path text;
  v_created timestamptz;
begin
  if v_user is null then raise exception '로그인이 필요해요'; end if;
  select * into v_entry from public.timetable_entries where id=p_entry_id and archived_at is null for share;
  if not found or v_entry.member_id <> v_user or not public.is_group_member(v_entry.group_id) then
    raise exception '본인의 등록된 수업만 출석할 수 있어요';
  end if;
  select * into strict v_group from public.groups where id=v_entry.group_id for share;
  if v_group.archived_at is not null then raise exception '종료된 그룹에서는 출석할 수 없어요'; end if;
  if p_date is null or p_date <> (statement_timestamp() at time zone 'Asia/Singapore')::date
    or extract(dow from p_date)::integer <> v_entry.weekday then
    raise exception '오늘 수업만 출석할 수 있어요';
  end if;
  -- Serialize double taps on this class without competing with vote locks.
  perform pg_advisory_xact_lock(hashtextextended(p_entry_id::text || p_date::text, 0));
  select * into v_record from public.attendance_records where timetable_entry_id=p_entry_id and date=p_date for update;
  if found then
    if v_record.status <> 'present' then raise exception '이미 처리된 출석 기록이에요'; end if;
    select object_path into v_path from public.attendance_stories where attendance_record_id=v_record.id;
    return jsonb_build_object('attendance_id',v_record.id,'object_path',v_path);
  end if;
  if v_group.require_photo and p_object_path is null then raise exception '인증사진을 첨부해주세요.'; end if;
  if p_object_path is not null then
    if split_part(p_object_path,'/',1) <> v_group.id::text
      or split_part(p_object_path,'/',2) <> v_user::text then raise exception '사진 경로가 올바르지 않아요'; end if;
    select created_at into v_created from storage.objects where bucket_id='attendance-stories' and name=p_object_path for update;
    if not found or v_created <= statement_timestamp()-interval '10 minutes'
      or exists (select 1 from public.attendance_stories where object_path=p_object_path) then
      raise exception '사진을 다시 첨부해주세요.';
    end if;
  end if;
  insert into public.attendance_records(group_id,member_id,timetable_entry_id,date,status,checked_in_at)
    values(v_group.id,v_user,p_entry_id,p_date,'present',statement_timestamp()) returning * into v_record;
  if p_object_path is not null then
    insert into public.attendance_stories(attendance_record_id,group_id,member_id,object_path,created_at,expires_at)
      values(v_record.id,v_group.id,v_user,p_object_path,v_created,v_created+interval '24 hours');
  end if;
  return jsonb_build_object('attendance_id',v_record.id,'object_path',p_object_path);
end;
$$;
revoke all on function public.check_in_with_story(uuid,date,text) from public, anon;
grant execute on function public.check_in_with_story(uuid,date,text) to authenticated;

-- Cached clients still send a base64 photo. Give only NEW legacy photos a
-- server-owned deadline; leave pre-migration photos entirely untouched.
alter table public.attendance_records add column if not exists photo_expires_at timestamptz;
create or replace function public.guard_legacy_story_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    new.photo_expires_at := null;
    if new.photo is not null then
      if new.status <> 'present' or (auth.uid() is not null and new.member_id <> auth.uid()) then
        raise exception '본인의 출석 인증사진만 첨부할 수 있어요';
      end if;
      if length(new.photo)>273100 or new.photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$' then
        raise exception '사진은 200KB 이하로 압축해주세요.';
      end if;
      new.checked_in_at := statement_timestamp();
      new.photo_expires_at := statement_timestamp()+interval '24 hours';
    end if;
  elsif auth.uid() is not null then
    if new.photo is distinct from old.photo then raise exception '이미 등록된 인증사진은 변경할 수 없어요'; end if;
    new.photo_expires_at := old.photo_expires_at;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_legacy_story_photo() from public, anon, authenticated;
create trigger guard_legacy_story_photo before insert or update of photo,photo_expires_at on public.attendance_records
for each row execute function public.guard_legacy_story_photo();

create or replace function public.list_attendance_stories(p_group_id uuid)
returns table(id uuid,attendance_record_id uuid,group_id uuid,member_id uuid,subject text,
  checked_in_at timestamptz,created_at timestamptz,expires_at timestamptz,object_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_group_member(p_group_id) then raise exception '그룹 멤버만 사진을 볼 수 있어요'; end if;
  return query
  select s.id,a.id,s.group_id,s.member_id,t.subject,a.checked_in_at,s.created_at,s.expires_at,s.object_path
  from public.attendance_stories s join public.attendance_records a on a.id=s.attendance_record_id
  join public.timetable_entries t on t.id=a.timetable_entry_id
  join public.groups g on g.id=s.group_id and g.archived_at is null
  join public.group_members m on m.group_id=s.group_id and m.member_id=s.member_id and m.left_at is null
  where s.group_id=p_group_id and a.status='present' and s.expires_at>statement_timestamp()
  union all
  select a.id,a.id,a.group_id,a.member_id,t.subject,a.checked_in_at,
    a.photo_expires_at-interval '24 hours',a.photo_expires_at,null::text
  from public.attendance_records a join public.timetable_entries t on t.id=a.timetable_entry_id
  join public.groups g on g.id=a.group_id and g.archived_at is null
  join public.group_members m on m.group_id=a.group_id and m.member_id=a.member_id and m.left_at is null
  where a.group_id=p_group_id and a.status='present' and a.photo is not null
    and a.photo_expires_at>statement_timestamp();
end;
$$;
revoke all on function public.list_attendance_stories(uuid) from public, anon;
grant execute on function public.list_attendance_stories(uuid) to authenticated;

create or replace function public.read_legacy_story_photo(p_record_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_photo text;
begin
  select a.photo into v_photo from public.attendance_records a
  join public.groups g on g.id=a.group_id and g.archived_at is null
  join public.group_members m on m.group_id=a.group_id and m.member_id=a.member_id and m.left_at is null
  where a.id=p_record_id and a.status='present' and a.photo_expires_at>statement_timestamp()
    and public.is_group_member(a.group_id) and auth.uid() is not null;
  if v_photo is null then raise exception '사진을 불러오지 못했어요. 다시 시도해주세요.'; end if;
  return v_photo;
end;
$$;
revoke all on function public.read_legacy_story_photo(uuid) from public, anon;
grant execute on function public.read_legacy_story_photo(uuid) to authenticated;

-- Service-only cleanup helpers. Actual bytes MUST be removed through Storage
-- API, not DELETE FROM storage.objects (which leaves billed orphaned files).
create or replace function public.expired_story_objects(p_limit integer default 200)
returns table(name text) language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o
  left join public.attendance_stories s on s.object_path=o.name
  left join public.attendance_records a on a.id=s.attendance_record_id
  where o.bucket_id='attendance-stories' and (
    s.expires_at<=statement_timestamp() or (s.id is not null and (a.id is null or a.status<>'present'))
    or (s.id is null and o.created_at<=statement_timestamp()-interval '30 minutes')
  ) order by o.created_at limit greatest(1,least(coalesce(p_limit,200),500));
$$;
create or replace function public.prune_story_metadata()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.attendance_stories s where
    (s.expires_at<=statement_timestamp() or s.attendance_record_id is null)
    and not exists (select 1 from storage.objects o where o.bucket_id='attendance-stories' and o.name=s.object_path);
  update public.attendance_records set photo=null,photo_expires_at=null
    where photo_expires_at<=statement_timestamp();
end;
$$;
revoke all on function public.expired_story_objects(integer),public.prune_story_metadata() from public,anon,authenticated;
grant execute on function public.expired_story_objects(integer),public.prune_story_metadata() to service_role;
commit;
