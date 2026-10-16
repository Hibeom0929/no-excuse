-- All metadata fixtures/attendance are ROLLBACK-only; no real image bytes or
-- member history are deleted or uploaded by this test.
begin;
do $$
declare
  v_members uuid[]; v_group uuid; v_entry uuid; v_path text; v_expired uuid;
begin
  select array_agg(id order by id) into v_members from (select id from public.profiles order by id limit 3) p;
  assert cardinality(v_members)>=3, 'Three existing profiles are required';
  perform set_config('story_test.owner',v_members[1]::text,true);
  perform set_config('story_test.voter',v_members[2]::text,true);
  perform set_config('story_test.outsider',v_members[3]::text,true);
  insert into public.groups(name,invite_code,owner_id,treasurer_id,fine_amount,require_photo)
    values('ROLLBACK ONLY story test',gen_random_uuid()::text,v_members[1],v_members[1],5,true) returning id into v_group;
  perform set_config('story_test.group',v_group::text,true);
  insert into public.group_members(group_id,member_id) values(v_group,v_members[1]),(v_group,v_members[2]);
  insert into public.timetable_entries(group_id,member_id,subject,weekday,start_time,end_time)
    values(v_group,v_members[1],'ROLLBACK ONLY story',extract(dow from (statement_timestamp() at time zone 'Asia/Singapore'))::int,'00:00','23:59') returning id into v_entry;
  perform set_config('story_test.entry',v_entry::text,true);
  v_path := v_group::text||'/'||v_members[1]::text||'/'||gen_random_uuid()::text||'.jpg';
  perform set_config('story_test.path',v_path,true);
  insert into storage.objects(bucket_id,name,metadata) values('attendance-stories',v_path,'{"mimetype":"image/jpeg","size":4}'::jsonb);
end;
$$;
set local role authenticated;
do $$
declare
  v_result jsonb; v_record uuid; v_blocked boolean; v_date date := (statement_timestamp() at time zone 'Asia/Singapore')::date;
begin
  perform set_config('request.jwt.claim.sub',current_setting('story_test.owner'),true);
  v_blocked:=false;
  begin perform public.check_in_with_story(current_setting('story_test.entry')::uuid,v_date,null);
  exception when raise_exception then v_blocked:=true; end;
  assert v_blocked, 'Photo requirement enforced server-side';
  assert public.can_read_story_object(current_setting('story_test.path')), 'Owner can read pending upload';
  assert (select count(*) from storage.objects where bucket_id='attendance-stories' and name=current_setting('story_test.path'))=1;
  perform set_config('request.jwt.claim.sub',current_setting('story_test.voter'),true);
  assert not public.can_read_story_object(current_setting('story_test.path')), 'Team cannot read uncommitted upload';
  assert (select count(*) from storage.objects where bucket_id='attendance-stories' and name=current_setting('story_test.path'))=0;
  v_blocked:=false;
  begin perform public.check_in_with_story(current_setting('story_test.entry')::uuid,v_date,current_setting('story_test.path'));
  exception when raise_exception then v_blocked:=true; end;
  assert v_blocked, 'Another member cannot check in on behalf of the owner';
  perform set_config('request.jwt.claim.sub',current_setting('story_test.owner'),true);
  v_result:=public.check_in_with_story(current_setting('story_test.entry')::uuid,v_date,current_setting('story_test.path'));
  v_record:=(v_result->>'attendance_id')::uuid;
  perform set_config('story_test.record',v_record::text,true);
  assert v_record is not null and v_result->>'object_path'=current_setting('story_test.path');
  assert (select count(*) from public.list_attendance_stories(current_setting('story_test.group')::uuid))=1;
  assert public.can_read_story_object(current_setting('story_test.path'));
  assert not public.can_remove_pending_story_object(current_setting('story_test.path')), 'Cannot compensate a committed photo';
  v_result:=public.check_in_with_story(current_setting('story_test.entry')::uuid,v_date,current_setting('story_test.path'));
  assert v_record=(v_result->>'attendance_id')::uuid, 'Check-in retry must be idempotent';
  perform set_config('request.jwt.claim.sub',current_setting('story_test.voter'),true);
  assert public.can_read_story_object(current_setting('story_test.path')), 'Current group members can read';
  assert (select count(*) from public.list_attendance_stories(current_setting('story_test.group')::uuid))=1;
  perform set_config('request.jwt.claim.sub',current_setting('story_test.outsider'),true);
  assert not public.can_read_story_object(current_setting('story_test.path'));
  assert (select count(*) from storage.objects where bucket_id='attendance-stories' and name=current_setting('story_test.path'))=0;
  v_blocked:=false;
  begin perform public.list_attendance_stories(current_setting('story_test.group')::uuid);
  exception when raise_exception then v_blocked:=true; end;
  assert v_blocked, 'Non-member cannot list photos';
  v_blocked:=false;
  begin perform public.expired_story_objects(200);
  exception when insufficient_privilege then v_blocked:=true; end;
  assert v_blocked, 'Members cannot execute service-only cleanup';
end;
$$;
reset role;
do $$
begin
  perform set_config('request.jwt.claim.sub','',true);
  assert (select photo is null from public.attendance_records where id=current_setting('story_test.record')::uuid), 'New images never go into attendance rows';
  assert (select expires_at=created_at+interval '24 hours' from public.attendance_stories where attendance_record_id=current_setting('story_test.record')::uuid);
  update public.attendance_stories set created_at=statement_timestamp()-interval '25 hours',expires_at=statement_timestamp()-interval '1 hour'
    where attendance_record_id=current_setting('story_test.record')::uuid;
end;
$$;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub',current_setting('story_test.owner'),true);
  assert not public.can_read_story_object(current_setting('story_test.path')), 'Expired file denied even to original owner';
  assert (select count(*) from storage.objects where bucket_id='attendance-stories' and name=current_setting('story_test.path'))=0;
  assert (select count(*) from public.list_attendance_stories(current_setting('story_test.group')::uuid))=0;
  assert (select status='present' from public.attendance_records where id=current_setting('story_test.record')::uuid), 'Photo expiry must retain attendance';
end;
$$;
reset role;
do $$
begin
  assert exists(select 1 from public.expired_story_objects(500) where name=current_setting('story_test.path')), 'Worker selects expired object';
  -- Cancellation: deleting the attendance hides a new photo immediately, while
  -- preserving its metadata until the Storage API has removed actual bytes.
  update public.attendance_stories set created_at=statement_timestamp(),expires_at=statement_timestamp()+interval '24 hours'
    where attendance_record_id=current_setting('story_test.record')::uuid;
  delete from public.attendance_records where id=current_setting('story_test.record')::uuid;
  assert (select attendance_record_id is null from public.attendance_stories where object_path=current_setting('story_test.path'));
  assert exists(select 1 from public.expired_story_objects(500) where name=current_setting('story_test.path'));
end;
$$;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claim.sub',current_setting('story_test.owner'),true);
  assert not public.can_read_story_object(current_setting('story_test.path')), 'Cancelled photo is not readable';
  assert (select count(*) from public.list_attendance_stories(current_setting('story_test.group')::uuid))=0;
end;
$$;
reset role;
set local role anon;
do $$
declare v_blocked boolean:=false;
begin
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.list_attendance_stories(current_setting('story_test.group')::uuid);
  exception when insufficient_privilege then v_blocked:=true; end;
  assert v_blocked, 'Anonymous cannot view stories';
end;
$$;
reset role;
rollback;
select 'PASS: photo/check-in atomicity, idempotency, member/outsider/anonymous permissions, 24h expiry, cancellation, cleanup selection. All fixtures rolled back.' as result;
