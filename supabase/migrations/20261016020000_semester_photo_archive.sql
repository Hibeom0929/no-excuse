-- Visibility ends after 24h, but files remain private for a future semester recap.
-- No semester end date has been chosen: NULL means retain, never "delete now".
-- No existing pre-story photos, attendance, votes or fines are deleted.
begin;
alter table public.attendance_stories
  add column if not exists archive_delete_after timestamptz
  check (archive_delete_after is null or archive_delete_after >= expires_at);
comment on column public.attendance_stories.expires_at is
  'Story visibility deadline only. Never use this timestamp to delete files.';
comment on column public.attendance_stories.archive_delete_after is
  'Reserved for a separately approved semester cleanup. NULL retains the file. No automatic cleanup is active.';

-- Cached older clients still upload base64 in attendance INSERTs. Put NEW
-- payloads into a service-only table so SELECT attendance_records cannot bypass
-- 24h photo access control. Pre-story photos with no expiry remain untouched.
create table if not exists public.attendance_legacy_story_photos (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid unique references public.attendance_records(id)
    on delete set null deferrable initially deferred,
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.profiles(id),
  photo text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  archive_delete_after timestamptz,
  check (expires_at = created_at + interval '24 hours'),
  check (archive_delete_after is null or archive_delete_after >= expires_at)
);
alter table public.attendance_legacy_story_photos enable row level security;
revoke all on public.attendance_legacy_story_photos from public, anon, authenticated;
grant all on public.attendance_legacy_story_photos to service_role;

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
      insert into public.attendance_legacy_story_photos
        (attendance_record_id,group_id,member_id,photo,created_at,expires_at)
      values (new.id,new.group_id,new.member_id,new.photo,statement_timestamp(),new.photo_expires_at);
      new.photo := null;
    end if;
  elsif auth.uid() is not null then
    if new.photo is distinct from old.photo then raise exception '이미 등록된 인증사진은 변경할 수 없어요'; end if;
    new.photo_expires_at := old.photo_expires_at;
  end if;
  return new;
end;
$$;

-- Preserve any transitional, post-story legacy uploads before clearing only
-- their duplicate attendance payload. This is a move, not a photo deletion.
insert into public.attendance_legacy_story_photos
  (attendance_record_id,group_id,member_id,photo,created_at,expires_at)
select id,group_id,member_id,photo,photo_expires_at-interval '24 hours',photo_expires_at
from public.attendance_records where photo is not null and photo_expires_at is not null
on conflict (attendance_record_id) do nothing;
update public.attendance_records a set photo=null
where a.photo is not null and a.photo_expires_at is not null
  and exists (select 1 from public.attendance_legacy_story_photos p
    where p.attendance_record_id=a.id and p.photo=a.photo);

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
  select a.id,a.id,a.group_id,a.member_id,t.subject,a.checked_in_at,p.created_at,p.expires_at,null::text
  from public.attendance_legacy_story_photos p join public.attendance_records a on a.id=p.attendance_record_id
  join public.timetable_entries t on t.id=a.timetable_entry_id
  join public.groups g on g.id=a.group_id and g.archived_at is null
  join public.group_members m on m.group_id=a.group_id and m.member_id=a.member_id and m.left_at is null
  where a.group_id=p_group_id and a.status='present' and p.expires_at>statement_timestamp();
end;
$$;

create or replace function public.read_legacy_story_photo(p_record_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_photo text;
begin
  select p.photo into v_photo from public.attendance_legacy_story_photos p
  join public.attendance_records a on a.id=p.attendance_record_id
  join public.groups g on g.id=a.group_id and g.archived_at is null
  join public.group_members m on m.group_id=a.group_id and m.member_id=a.member_id and m.left_at is null
  where a.id=p_record_id and a.status='present' and p.expires_at>statement_timestamp()
    and public.is_group_member(a.group_id) and auth.uid() is not null;
  if v_photo is null then raise exception '사진을 불러오지 못했어요. 다시 시도해주세요.'; end if;
  return v_photo;
end;
$$;

-- Fail closed even if the previously deployed worker is accidentally invoked.
-- Explicitly disable BOTH old deletion paths (Storage candidates and base64).
create or replace function public.expired_story_objects(p_limit integer default 200)
returns table(name text) language sql stable security definer set search_path = '' as $$
  select null::text where false;
$$;
create or replace function public.prune_story_metadata()
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Deliberately no deletion; a future semester cleanup needs a dated policy.
  return;
end;
$$;
revoke all on function public.guard_legacy_story_photo() from public, anon, authenticated;
revoke all on function public.list_attendance_stories(uuid),public.read_legacy_story_photo(uuid) from public, anon;
grant execute on function public.list_attendance_stories(uuid),public.read_legacy_story_photo(uuid) to authenticated;
revoke all on function public.expired_story_objects(integer),public.prune_story_metadata() from public,anon,authenticated;
grant execute on function public.expired_story_objects(integer),public.prune_story_metadata() to service_role;
commit;
