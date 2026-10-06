begin;

-- Mobile PWAs can keep old JavaScript running after a deployment. Retain the
-- old INSERT endpoint, with the SAME authenticated member/own-record scope,
-- and move its duplicate protection + status changes into DB triggers.
create or replace function public.guard_excuse_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_record public.attendance_records;
  v_existing public.excuse_requests;
begin
  -- Trusted SQL/admin fixtures without a user context do not use the legacy API.
  if v_user is null and current_setting('role', true) <> 'authenticated' then return new; end if;
  if v_user is null then raise exception '로그인이 필요해요'; end if;
  select * into v_record from public.attendance_records where id = new.attendance_record_id for update;
  if not found or v_record.member_id <> v_user or new.member_id <> v_user
    or new.group_id <> v_record.group_id or not public.is_group_member(v_record.group_id) then
    raise exception '본인의 결석 기록만 해명할 수 있어요';
  end if;
  if not exists (select 1 from public.groups where id = v_record.group_id and archived_at is null) then
    raise exception '종료된 그룹에서는 해명을 제출할 수 없어요';
  end if;
  if nullif(trim(new.reason), '') is null or length(trim(new.reason)) > 2000 then
    raise exception '해명 사유를 1~2000자로 입력해주세요';
  end if;
  select * into v_existing from public.excuse_requests
    where attendance_record_id = v_record.id and superseded_by is null;
  if found then
    if v_existing.status = 'pending' then return null; end if;
    raise exception '이미 처리된 해명 요청이에요';
  end if;
  if v_record.status <> 'absent' then raise exception '결석 기록만 해명할 수 있어요'; end if;
  new.reason := trim(new.reason);
  new.status := 'pending';
  new.superseded_by := null;
  return new;
end;
$$;

create or replace function public.sync_excuse_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.attendance_records set status = 'excused_pending' where id = new.attendance_record_id;
  return new;
end;
$$;

create or replace function public.guard_excuse_vote_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_attendance uuid;
  v_request public.excuse_requests;
begin
  if v_user is null and current_setting('role', true) <> 'authenticated' then return new; end if;
  if v_user is null or new.voter_id <> v_user then raise exception '로그인이 필요해요'; end if;
  select attendance_record_id into v_attendance from public.excuse_requests where id = new.excuse_id;
  if not found then raise exception '해명 요청을 찾을 수 없어요'; end if;
  perform 1 from public.attendance_records where id = v_attendance for update;
  select * into strict v_request from public.excuse_requests
    where attendance_record_id = v_attendance and superseded_by is null for update;
  if v_request.member_id = v_user or not public.is_group_member(v_request.group_id) then
    raise exception '다른 팀원의 해명에만 투표할 수 있어요';
  end if;
  if not exists (select 1 from public.groups where id = v_request.group_id and archived_at is null) then
    raise exception '종료된 그룹에서는 투표할 수 없어요';
  end if;
  -- Skip an already cast/finalized vote BEFORE ON CONFLICT reaches an UPDATE
  -- policy. Cached clients can retry without overwriting the original vote.
  if v_request.status <> 'pending' or exists (
    select 1 from public.excuse_votes where excuse_id = v_request.id and voter_id = v_user
  ) then return null; end if;
  new.excuse_id := v_request.id;
  new.voted_at := now();
  return new;
end;
$$;

create or replace function public.sync_excuse_vote_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.resolve_excuse_vote(new.excuse_id);
  return new;
end;
$$;

drop trigger if exists guard_excuse_insert on public.excuse_requests;
create trigger guard_excuse_insert before insert on public.excuse_requests
  for each row execute function public.guard_excuse_insert();
drop trigger if exists sync_excuse_insert on public.excuse_requests;
create trigger sync_excuse_insert after insert on public.excuse_requests
  for each row execute function public.sync_excuse_insert();
drop trigger if exists guard_excuse_vote_insert on public.excuse_votes;
create trigger guard_excuse_vote_insert before insert on public.excuse_votes
  for each row execute function public.guard_excuse_vote_insert();
drop trigger if exists sync_excuse_vote_insert on public.excuse_votes;
create trigger sync_excuse_vote_insert after insert on public.excuse_votes
  for each row execute function public.sync_excuse_vote_insert();

drop policy if exists "checked legacy excuse insert" on public.excuse_requests;
create policy "checked legacy excuse insert" on public.excuse_requests
  for insert to authenticated with check (
    member_id = auth.uid() and public.is_group_member(group_id) and superseded_by is null and status = 'pending'
  );
drop policy if exists "checked legacy vote insert" on public.excuse_votes;
create policy "checked legacy vote insert" on public.excuse_votes
  for insert to authenticated with check (
    voter_id = auth.uid() and exists (
      select 1 from public.excuse_requests e where e.id = excuse_id and e.superseded_by is null
        and e.member_id <> auth.uid() and public.is_group_member(e.group_id)
    )
  );

revoke all on function public.guard_excuse_insert() from public, anon, authenticated;
revoke all on function public.sync_excuse_insert() from public, anon, authenticated;
revoke all on function public.guard_excuse_vote_insert() from public, anon, authenticated;
revoke all on function public.sync_excuse_vote_insert() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
