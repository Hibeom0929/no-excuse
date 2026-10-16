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
  assert not exists(select 1 from public.expired_story_objects(500)), 'Visibility expiry must not select archived files for deletion';
  perform public.prune_story_metadata();
  assert exists(select 1 from public.attendance_stories where object_path=current_setting('story_test.path')), 'Expired metadata retained for semester archive';
  assert exists(select 1 from storage.objects where bucket_id='attendance-stories' and name=current_setting('story_test.path')), 'Expired file retained privately';
  assert (select archive_delete_after is null from public.attendance_stories where object_path=current_setting('story_test.path')), 'No semester deadline invented';
  -- Cancellation: deleting the attendance hides a new photo immediately, while
  -- preserving its metadata until the Storage API has removed actual bytes.
  update public.attendance_stories set created_at=statement_timestamp(),expires_at=statement_timestamp()+interval '24 hours'
    where attendance_record_id=current_setting('story_test.record')::uuid;
  delete from public.attendance_records where id=current_setting('story_test.record')::uuid;
  assert (select attendance_record_id is null from public.attendance_stories where object_path=current_setting('story_test.path'));
  assert not exists(select 1 from public.expired_story_objects(500)), 'Cancellation cannot accidentally activate old 24h deletion worker';
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
-- Cached clients insert a base64 photo. New payloads are private even to direct
-- attendance SELECTs, while authorized story reads work only during the first day.
set local role authenticated;
do $$
declare v_record uuid; v_blocked boolean:=false;
begin
  perform set_config('request.jwt.claim.sub',current_setting('story_test.owner'),true);
  insert into public.attendance_records(group_id,member_id,timetable_entry_id,date,status,photo)
  values(current_setting('story_test.group')::uuid,current_setting('story_test.owner')::uuid,
    current_setting('story_test.entry')::uuid,(statement_timestamp() at time zone 'Asia/Singapore')::date,
    'present','data:image/jpeg;base64,/9j/2Q==') returning id into v_record;
  perform set_config('story_test.legacy_record',v_record::text,true);
  assert (select photo is null from public.attendance_records where id=v_record), 'Attendance query cannot leak new legacy photo bytes';
  assert public.read_legacy_story_photo(v_record)='data:image/jpeg;base64,/9j/2Q==';
  perform set_config('request.jwt.claim.sub',current_setting('story_test.voter'),true);
  assert public.read_legacy_story_photo(v_record)='data:image/jpeg;base64,/9j/2Q==';
  assert (select count(*) from public.list_attendance_stories(current_setting('story_test.group')::uuid))=1;
  begin perform 1 from public.attendance_legacy_story_photos;
  exception when insufficient_privilege then v_blocked:=true; end;
  assert v_blocked, 'Even members cannot directly read the private legacy archive';
  perform set_config('request.jwt.claim.sub',current_setting('story_test.outsider'),true);
  v_blocked:=false;
  begin perform public.read_legacy_story_photo(v_record);
  exception when raise_exception then v_blocked:=true; end;
  assert v_blocked, 'Outsiders cannot read legacy photos';
end;
$$;
set constraints all immediate;
reset role;
do $$
begin
  perform set_config('request.jwt.claim.sub','',true);
  update public.attendance_legacy_story_photos set created_at=statement_timestamp()-interval '25 hours',
    expires_at=statement_timestamp()-interval '1 hour'
  where attendance_record_id=current_setting('story_test.legacy_record')::uuid;
  perform public.prune_story_metadata();
  assert exists(select 1 from public.attendance_legacy_story_photos
    where attendance_record_id=current_setting('story_test.legacy_record')::uuid and archive_delete_after is null), 'Legacy archive survives visibility expiry';
end;
$$;
set local role authenticated;
do $$
declare v_blocked boolean:=false;
begin
  perform set_config('request.jwt.claim.sub',current_setting('story_test.owner'),true);
  begin perform public.read_legacy_story_photo(current_setting('story_test.legacy_record')::uuid);
  exception when raise_exception then v_blocked:=true; end;
  assert v_blocked, 'Expired legacy photo cannot be opened even by its owner';
  perform set_config('request.jwt.claim.sub',current_setting('story_test.voter'),true);
  v_blocked:=false;
  begin perform public.read_legacy_story_photo(current_setting('story_test.legacy_record')::uuid);
  exception when raise_exception then v_blocked:=true; end;
  assert v_blocked, 'Expired legacy photo cannot be opened by teammates';
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
select 'PASS: atomic check-in, permissions, 24h visibility, retained semester archive, private legacy photos, disabled deletion. All fixtures rolled back.' as result;
