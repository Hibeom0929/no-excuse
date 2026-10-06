-- Run in SQL Editor as postgres after the migration. All fixtures and votes are
-- inside one ROLLBACK transaction: no real member's attendance/fine is changed.
begin;
do $$
declare
  v_members uuid[];
  v_group uuid;
  v_entry uuid;
  v_record uuid;
begin
  select array_agg(member_id order by member_id) into v_members
    from public.group_members where group_id = (
      select group_id from public.group_members where left_at is null
      group by group_id having count(*) >= 3 order by group_id limit 1
    ) and left_at is null;
  if coalesce(array_length(v_members, 1), 0) < 3 then raise exception 'Tests need three existing profiles'; end if;
  perform set_config('no_excuse.test_requester', v_members[1]::text, true);
  perform set_config('no_excuse.test_voter_a', v_members[2]::text, true);
  perform set_config('no_excuse.test_voter_b', v_members[3]::text, true);
  insert into public.groups (name, invite_code, owner_id, treasurer_id, fine_amount)
    values ('ROLLBACK ONLY voting test', gen_random_uuid()::text, v_members[1], v_members[1], 10)
    returning id into v_group;
  insert into public.group_members (group_id, member_id)
    select v_group, unnest(v_members[1:3]);
  perform set_config('no_excuse.test_group', v_group::text, true);
  insert into public.timetable_entries (group_id, member_id, subject, weekday, start_time, end_time)
    values (v_group, v_members[1], 'ROLLBACK ONLY', 2, '10:00', '11:00') returning id into v_entry;
  insert into public.attendance_records (group_id, member_id, timetable_entry_id, date, status)
    values (v_group, v_members[1], v_entry, '2026-10-06', 'absent') returning id into v_record;
  insert into public.fine_transactions (group_id, member_id, attendance_record_id, amount, reason, date, status)
    values (v_group, v_members[1], v_record, 10, 'ROLLBACK ONLY', '2026-10-06', 'charged');
  perform set_config('no_excuse.test_record', v_record::text, true);
  insert into public.attendance_records (group_id, member_id, timetable_entry_id, date, status)
    values (v_group, v_members[1], v_entry, '2026-10-13', 'absent') returning id into v_record;
  insert into public.fine_transactions (group_id, member_id, attendance_record_id, amount, reason, date, status)
    values (v_group, v_members[1], v_record, 10, 'ROLLBACK ONLY tie', '2026-10-13', 'charged');
  perform set_config('no_excuse.test_tie_record', v_record::text, true);
end;
$$;

set local role authenticated;
do $$
declare
  v_record uuid := current_setting('no_excuse.test_tie_record')::uuid;
  v_request uuid;
  v_blocked boolean := false;
begin
  perform set_config('request.jwt.claim.sub', current_setting('no_excuse.test_requester'), true);
  v_request := public.submit_excuse(v_record, 'Tie test');
  begin
    insert into public.excuse_requests (group_id, attendance_record_id, member_id, reason)
      values (current_setting('no_excuse.test_group')::uuid, v_record, auth.uid(), 'Direct duplicate');
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'Direct insert must not bypass the checked submission RPC';
  perform set_config('request.jwt.claim.sub', current_setting('no_excuse.test_voter_a'), true);
  assert public.cast_excuse_vote(v_request, true) = 'pending';
  v_blocked := false;
  begin
    insert into public.excuse_votes (excuse_id, voter_id, approve) values (v_request, auth.uid(), false);
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'Direct vote must not bypass the checked voting RPC';
  perform set_config('request.jwt.claim.sub', current_setting('no_excuse.test_voter_b'), true);
  assert public.cast_excuse_vote(v_request, false) = 'rejected', 'Tie rejects only when everyone has voted';
  assert (select status from public.attendance_records where id = v_record) = 'excused_rejected';
  assert (select status from public.fine_transactions where attendance_record_id = v_record) = 'charged';
end;
$$;

do $$
declare
  v_record uuid := current_setting('no_excuse.test_record')::uuid;
  v_request uuid;
  v_retry uuid;
  v_outcome text;
  v_blocked boolean;
begin
  perform set_config('request.jwt.claim.sub', current_setting('no_excuse.test_requester'), true);
  v_request := public.submit_excuse(v_record, 'Test reason');
  v_retry := public.submit_excuse(v_record, 'Double tap');
  assert v_request = v_retry, 'Repeated submission must return one request';
  assert (select count(*) from public.excuse_requests where attendance_record_id = v_record) = 1;
  assert (select status from public.attendance_records where id = v_record) = 'excused_pending';
  perform set_config('no_excuse.test_request', v_request::text, true);
  v_blocked := false;
  begin
    perform public.cast_excuse_vote(v_request, true);
  exception when raise_exception then v_blocked := true;
  end;
  assert v_blocked, 'Requester must not vote on own request';

  perform set_config('request.jwt.claim.sub', current_setting('no_excuse.test_voter_a'), true);
  v_outcome := public.cast_excuse_vote(v_request, true);
  assert v_outcome = 'pending', 'One of two voters is not a majority';
  v_outcome := public.cast_excuse_vote(v_request, false);
  assert v_outcome = 'pending';
  assert (select approve from public.excuse_votes where excuse_id = v_request and voter_id = auth.uid()) is true,
    'Retry must not overwrite the first vote';
  assert (select count(*) from public.excuse_votes where excuse_id = v_request) = 1;
  v_blocked := false;
  begin
    perform public.submit_excuse(v_record, 'Not my absence');
  exception when raise_exception then v_blocked := true;
  end;
  assert v_blocked, 'Another member must not file requester absence';

  perform set_config('request.jwt.claim.sub', current_setting('no_excuse.test_voter_b'), true);
  v_outcome := public.cast_excuse_vote(v_request, true);
  assert v_outcome = 'approved';
  assert (select status from public.excuse_requests where id = v_request) = 'approved';
  assert (select status from public.attendance_records where id = v_record) = 'excused_approved';
  assert (select status from public.fine_transactions where attendance_record_id = v_record) = 'waived';
  assert public.cast_excuse_vote(v_request, false) = 'approved', 'Final verdict must not reopen';
end;
$$;

-- An authenticated outsider has no access even if they know a request id.
do $$
declare v_blocked boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  begin
    perform public.cast_excuse_vote(current_setting('no_excuse.test_request')::uuid, true);
  exception when raise_exception then v_blocked := true;
  end;
  assert v_blocked, 'Non-member vote must be denied';
end;
$$;

set local role anon;
do $$
declare v_blocked boolean := false;
begin
  begin
    perform public.cast_excuse_vote(current_setting('no_excuse.test_request')::uuid, true);
  exception when insufficient_privilege then v_blocked := true;
  end;
  assert v_blocked, 'Anonymous callers must not execute voting RPC';
end;
$$;
reset role;
rollback;
select 'PASS: request/vote retries, majority waiver, tie rejection, direct-write/own-vote/outsider/anonymous denial; all fixtures rolled back' as result;
