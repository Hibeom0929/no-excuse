begin;

-- Keep duplicate requests and their original votes for audit/recovery; only the
-- canonical request is displayed. Never delete attendance, fines, or votes.
alter table public.excuse_requests
  add column if not exists superseded_by uuid references public.excuse_requests(id);

with ranked as (
  select id, first_value(id) over (
    partition by attendance_record_id
    order by (status <> 'pending') desc, created_at, id
  ) as canonical_id
  from public.excuse_requests where superseded_by is null
)
update public.excuse_requests e set superseded_by = ranked.canonical_id
from ranked where e.id = ranked.id and ranked.id <> ranked.canonical_id;

-- Preserve the canonical vote if already present; otherwise keep the earliest
-- vote from a duplicate. Original rows remain untouched.
insert into public.excuse_votes (excuse_id, voter_id, approve, voted_at)
select distinct on (e.superseded_by, v.voter_id)
  e.superseded_by, v.voter_id, v.approve, v.voted_at
from public.excuse_votes v join public.excuse_requests e on e.id = v.excuse_id
where e.superseded_by is not null
order by e.superseded_by, v.voter_id, v.voted_at, e.created_at, e.id
on conflict (excuse_id, voter_id) do nothing;

create unique index if not exists excuse_requests_one_per_attendance_idx
  on public.excuse_requests (attendance_record_id) where superseded_by is null;

-- Called only inside the checked RPC below, while the attendance/request locks
-- are held. Request, attendance status, and fine waiver commit together.
create or replace function public.resolve_excuse_vote(p_excuse_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_request public.excuse_requests;
  v_total bigint;
  v_cast bigint;
  v_approve bigint;
  v_reject bigint;
  v_status text := 'pending';
begin
  select * into strict v_request from public.excuse_requests where id = p_excuse_id;
  if v_request.status <> 'pending' then return v_request.status; end if;

  select count(*), count(v.voter_id),
    count(*) filter (where v.approve is true),
    count(*) filter (where v.approve is false)
  into v_total, v_cast, v_approve, v_reject
  from public.group_members gm
  left join public.excuse_votes v on v.excuse_id = p_excuse_id and v.voter_id = gm.member_id
  where gm.group_id = v_request.group_id and gm.left_at is null
    and gm.member_id <> v_request.member_id;

  if v_total > 0 and v_approve * 2 > v_total then v_status := 'approved';
  elsif v_total > 0 and v_reject * 2 > v_total then v_status := 'rejected';
  elsif v_total > 0 and v_cast = v_total then
    v_status := case when v_approve > v_reject then 'approved' else 'rejected' end;
  end if;

  if v_status <> 'pending' then
    update public.excuse_requests set status = v_status where id = p_excuse_id;
    update public.attendance_records
      set status = case when v_status = 'approved' then 'excused_approved' else 'excused_rejected' end
      where id = v_request.attendance_record_id;
    if v_status = 'approved' then
      update public.fine_transactions set status = 'waived'
        where attendance_record_id = v_request.attendance_record_id;
    end if;
  end if;
  return v_status;
end;
$$;

create or replace function public.submit_excuse(p_attendance_record_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_record public.attendance_records;
  v_request_id uuid;
begin
  if v_user is null then raise exception '로그인이 필요해요'; end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 2000 then
    raise exception '해명 사유를 1~2000자로 입력해주세요';
  end if;
  select * into v_record from public.attendance_records
    where id = p_attendance_record_id for update;
  if not found or v_record.member_id <> v_user or not public.is_group_member(v_record.group_id) then
    raise exception '본인의 결석 기록만 해명할 수 있어요';
  end if;
  if not exists (select 1 from public.groups where id = v_record.group_id and archived_at is null) then
    raise exception '종료된 그룹에서는 해명을 제출할 수 없어요';
  end if;

  -- Retried/double-tapped requests return the same id without changing reason
  -- or reopening an already decided vote.
  select id into v_request_id from public.excuse_requests
    where attendance_record_id = v_record.id and superseded_by is null;
  if found then return v_request_id; end if;
  if v_record.status <> 'absent' then raise exception '결석 기록만 해명할 수 있어요'; end if;

  insert into public.excuse_requests (group_id, attendance_record_id, member_id, reason)
    values (v_record.group_id, v_record.id, v_user, trim(p_reason)) returning id into v_request_id;
  update public.attendance_records set status = 'excused_pending' where id = v_record.id;
  return v_request_id;
end;
$$;

create or replace function public.cast_excuse_vote(p_excuse_id uuid, p_approve boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_request public.excuse_requests;
  v_attendance_id uuid;
  v_canonical_id uuid;
begin
  if v_user is null then raise exception '로그인이 필요해요'; end if;
  if p_approve is null then raise exception '투표를 선택해주세요'; end if;
  select attendance_record_id, coalesce(superseded_by, id)
    into v_attendance_id, v_canonical_id from public.excuse_requests where id = p_excuse_id;
  if not found then raise exception '해명 요청을 찾을 수 없어요'; end if;

  -- Lock order matches submit_excuse: attendance first, then its request.
  perform 1 from public.attendance_records where id = v_attendance_id for update;
  select * into strict v_request from public.excuse_requests where id = v_canonical_id for update;
  if not public.is_group_member(v_request.group_id) or v_request.member_id = v_user then
    raise exception '다른 팀원의 해명에만 투표할 수 있어요';
  end if;
  if not exists (select 1 from public.groups where id = v_request.group_id and archived_at is null) then
    raise exception '종료된 그룹에서는 투표할 수 없어요';
  end if;
  if v_request.status <> 'pending' then return v_request.status; end if;

  -- First vote wins. Retrying never requires a client-side UPDATE permission
  -- and never changes an already persisted vote.
  insert into public.excuse_votes (excuse_id, voter_id, approve)
    values (v_request.id, v_user, p_approve)
    on conflict (excuse_id, voter_id) do nothing;
  return public.resolve_excuse_vote(v_request.id);
end;
$$;

-- Writes must use the atomic, authenticated RPCs. Group-member SELECT rules
-- remain unchanged, and no new access is granted to other users.
drop policy if exists "members can file own excuse" on public.excuse_requests;
drop policy if exists "members can update excuse status in their group" on public.excuse_requests;
drop policy if exists "members can cast own vote" on public.excuse_votes;
drop policy if exists "active members can cast own vote" on public.excuse_votes;

revoke all on function public.resolve_excuse_vote(uuid) from public, anon, authenticated;
revoke all on function public.submit_excuse(uuid, text) from public, anon, authenticated;
revoke all on function public.cast_excuse_vote(uuid, boolean) from public, anon, authenticated;
grant execute on function public.submit_excuse(uuid, text) to authenticated;
grant execute on function public.cast_excuse_vote(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
