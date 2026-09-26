-- 그룹/시간표를 안전하게 정리할 수 있도록 삭제 대신 보관 상태를 추가한다.
alter table public.groups add column if not exists archived_at timestamptz;
alter table public.group_members add column if not exists left_at timestamptz;
alter table public.timetable_entries add column if not exists archived_at timestamptz;

create index if not exists group_members_active_member_idx
  on public.group_members (member_id, group_id) where left_at is null;
create index if not exists timetable_entries_active_group_idx
  on public.timetable_entries (group_id, member_id, weekday) where archived_at is null;

-- 보안 정책이 재귀하지 않도록 security definer 헬퍼를 사용한다.
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = gid
      and gm.member_id = auth.uid()
      and gm.left_at is null
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id and g.owner_id = auth.uid()
  );
$$;

-- 그룹 생성과 최초 멤버 등록은 반드시 같은 트랜잭션에서 처리한다.
create or replace function public.create_group(
  p_name text,
  p_invite_code text,
  p_fine_amount numeric,
  p_currency text,
  p_account_info text,
  p_require_photo boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
begin
  if v_user_id is null then
    raise exception '로그인이 필요해요';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception '그룹 이름을 입력해주세요';
  end if;
  if p_fine_amount < 0 then
    raise exception '벌금은 0보다 작을 수 없어요';
  end if;

  insert into public.groups (
    name, invite_code, fine_amount, currency, account_info,
    require_photo, owner_id, treasurer_id
  ) values (
    trim(p_name), upper(trim(p_invite_code)), p_fine_amount, p_currency,
    trim(p_account_info), p_require_photo, v_user_id, v_user_id
  ) returning id into v_group_id;

  insert into public.group_members (group_id, member_id)
  values (v_group_id, v_user_id);

  return v_group_id;
end;
$$;

-- 초대코드로 처음 가입하거나, 과거에 나갔던 멤버가 재가입한다.
create or replace function public.join_group_by_invite_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
begin
  if v_user_id is null then
    raise exception '로그인이 필요해요';
  end if;

  select g.id into v_group_id
  from public.groups g
  where g.invite_code = upper(trim(p_invite_code))
    and g.archived_at is null;

  if v_group_id is null then
    return null;
  end if;

  insert into public.group_members (group_id, member_id, left_at)
  values (v_group_id, v_user_id, null)
  on conflict (group_id, member_id)
  do update set left_at = null, joined_at = now();

  return v_group_id;
end;
$$;

create or replace function public.set_group_treasurer(p_group_id uuid, p_treasurer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception '그룹장만 총무를 지정할 수 있어요';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and member_id = p_treasurer_id and left_at is null
  ) then
    raise exception '현재 그룹 멤버만 총무로 지정할 수 있어요';
  end if;

  update public.groups set treasurer_id = p_treasurer_id where id = p_group_id;
end;
$$;

create or replace function public.transfer_group_ownership(p_group_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception '그룹장만 그룹장을 위임할 수 있어요';
  end if;
  if p_new_owner_id = auth.uid() then
    raise exception '이미 그룹장이에요';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and member_id = p_new_owner_id and left_at is null
  ) then
    raise exception '현재 그룹 멤버에게만 위임할 수 있어요';
  end if;

  update public.groups set owner_id = p_new_owner_id where id = p_group_id;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_treasurer_id uuid;
begin
  select owner_id, treasurer_id into v_owner_id, v_treasurer_id
  from public.groups where id = p_group_id for update;

  if v_owner_id is null or not public.is_group_member(p_group_id) then
    raise exception '참여 중인 그룹이 아니에요';
  end if;
  if v_owner_id = v_user_id then
    raise exception '그룹장은 먼저 다른 멤버에게 그룹장을 위임해야 해요';
  end if;

  update public.timetable_entries
  set archived_at = coalesce(archived_at, now())
  where group_id = p_group_id and member_id = v_user_id;

  if v_treasurer_id = v_user_id then
    update public.groups set treasurer_id = v_owner_id where id = p_group_id;
  end if;

  update public.group_members
  set left_at = now()
  where group_id = p_group_id and member_id = v_user_id and left_at is null;
end;
$$;

create or replace function public.archive_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception '그룹장만 그룹을 종료할 수 있어요';
  end if;
  update public.groups set archived_at = coalesce(archived_at, now()) where id = p_group_id;
end;
$$;

create or replace function public.restore_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception '그룹장만 그룹을 다시 열 수 있어요';
  end if;
  update public.groups set archived_at = null where id = p_group_id;
end;
$$;

create or replace function public.delete_group(p_group_id uuid, p_confirmation_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from public.groups where id = p_group_id for update;
  if v_name is null or not public.is_group_owner(p_group_id) then
    raise exception '그룹장만 그룹을 삭제할 수 있어요';
  end if;
  if trim(p_confirmation_name) <> v_name then
    raise exception '그룹 이름이 일치하지 않아요';
  end if;

  delete from public.groups where id = p_group_id;
end;
$$;

-- 그룹 변경과 가입/탈퇴는 위의 검증된 함수만 통하도록 제한한다.
drop policy if exists "members can update their groups" on public.groups;
drop policy if exists "users can insert their own membership" on public.group_members;

drop policy if exists "members can insert own timetable" on public.timetable_entries;
create policy "members can insert own active timetable" on public.timetable_entries
  for insert with check (
    member_id = auth.uid()
    and public.is_group_member(group_id)
    and exists (select 1 from public.groups g where g.id = timetable_entries.group_id and g.archived_at is null)
  );

drop policy if exists "members can update own timetable" on public.timetable_entries;
create policy "members can update own active-group timetable" on public.timetable_entries
  for update using (
    member_id = auth.uid()
    and public.is_group_member(group_id)
    and exists (select 1 from public.groups g where g.id = timetable_entries.group_id and g.archived_at is null)
  ) with check (
    member_id = auth.uid()
    and public.is_group_member(group_id)
    and exists (select 1 from public.groups g where g.id = timetable_entries.group_id and g.archived_at is null)
  );

drop policy if exists "members can delete own timetable" on public.timetable_entries;

drop policy if exists "members can insert attendance in their group" on public.attendance_records;
create policy "members can insert attendance in active groups" on public.attendance_records
  for insert with check (
    public.is_group_member(group_id)
    and exists (select 1 from public.groups g where g.id = attendance_records.group_id and g.archived_at is null)
  );

drop policy if exists "members can cast own vote" on public.excuse_votes;
create policy "active members can cast own vote" on public.excuse_votes
  for insert with check (
    voter_id = auth.uid()
    and exists (
      select 1 from public.excuse_requests e
      where e.id = excuse_id
        and e.member_id <> auth.uid()
        and public.is_group_member(e.group_id)
    )
  );

revoke all on function public.create_group(text, text, numeric, text, text, boolean) from public;
revoke all on function public.join_group_by_invite_code(text) from public;
revoke all on function public.set_group_treasurer(uuid, uuid) from public;
revoke all on function public.transfer_group_ownership(uuid, uuid) from public;
revoke all on function public.leave_group(uuid) from public;
revoke all on function public.archive_group(uuid) from public;
revoke all on function public.restore_group(uuid) from public;
revoke all on function public.delete_group(uuid, text) from public;

grant execute on function public.create_group(text, text, numeric, text, text, boolean) to authenticated;
grant execute on function public.join_group_by_invite_code(text) to authenticated;
grant execute on function public.set_group_treasurer(uuid, uuid) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.archive_group(uuid) to authenticated;
grant execute on function public.restore_group(uuid) to authenticated;
grant execute on function public.delete_group(uuid, text) to authenticated;
