import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const owner = '00000000-0000-4000-8000-000000000001'
const teammate = '00000000-0000-4000-8000-000000000002'
const outsider = '00000000-0000-4000-8000-000000000003'
const group = '10000000-0000-4000-8000-000000000001'
const archived = '10000000-0000-4000-8000-000000000002'
const photoId = '20000000-0000-4000-8000-000000000001'
const path = `${group}/${owner}/${photoId}.jpg`

test('actual authenticated Storage INSERT, check-in and private access (isolated PostgreSQL only)', async t => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,
        created_at timestamptz default statement_timestamp(),metadata jsonb,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema auth,public,storage to anon,authenticated,service_role;
      grant select,insert,delete on storage.objects to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated,service_role;`)
    await db.exec(read('../supabase/schema.sql').split('-- Row Level Security:')[0]
      .replace('create extension if not exists "pgcrypto";', ''))
    const groupHelper = read('../supabase/migrations/20260926000000_group_lifecycle.sql')
      .split('create or replace function public.is_group_member(gid uuid)')[1]
      .split('create or replace function public.is_group_owner')[0]
    await db.exec('create or replace function public.is_group_member(gid uuid)' + groupHelper)
    await db.exec(`grant select on public.groups to authenticated;
      alter table public.groups enable row level security;
      create policy "group member read" on public.groups for select to authenticated using(public.is_group_member(id));`)
    await db.exec(read('../supabase/migrations/20261016000000_attendance_stories.sql'))
    await db.exec(read('../supabase/migrations/20261016020000_semester_photo_archive.sql'))
    await db.exec(`insert into auth.users(id) values('${owner}'),('${teammate}'),('${outsider}');
      insert into public.groups(id,name,invite_code,owner_id,treasurer_id,require_photo) values
        ('${group}','평범한 한글 그룹','LOCAL-1','${owner}','${owner}',true),
        ('${archived}','Archived test group','LOCAL-2','${owner}','${owner}',true);
      update public.groups set archived_at=now() where id='${archived}';
      insert into public.group_members(group_id,member_id) values('${group}','${owner}'),('${group}','${teammate}'),('${archived}','${owner}');
      insert into storage.buckets(id,name,public) values('other-private-bucket','other-private-bucket',false);`)
    const as = async (role, id) => db.exec(`reset role; select set_config('request.jwt.claim.sub','${id ?? ''}',false); set role ${role}`)
    const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
    const insert = (name = path, bucket = 'attendance-stories') => db.query(
      `insert into storage.objects(bucket_id,name,metadata) values($1,$2,'{"mimetype":"image/jpeg","size":4}'::jsonb) returning id`, [bucket, name])
    await t.test('reproduces the deployed failure: ordinary group names incorrectly deny the owner', async () => {
      await as('authenticated', owner)
      await assert.rejects(insert(), /row-level security/)
      await db.exec('reset role')
      const policy = await scalar(`select with_check from pg_policies where schemaname='storage' and policyname='story owner upload'`)
      assert.match(policy, /split_part\(g\.name,/)
    })
    await db.exec(read('../supabase/migrations/20261019000000_fix_story_upload_path.sql'))
    await t.test('fix binds the GROUP path to objects.name and permits INSERT RETURNING as the real client role', async () => {
      const policy = await scalar(`select with_check from pg_policies where schemaname='storage' and policyname='story owner upload'`)
      assert.match(policy, /split_part\(objects\.name,/)
      assert.doesNotMatch(policy, /split_part\(g\.name,/)
      await as('authenticated', owner)
      assert.equal((await insert()).rows.length, 1)
      assert.equal(await scalar(`select count(*) from storage.objects where name=$1`, [path]), 1)
      await db.exec('reset role')
    })
    await t.test('still rejects outsiders, anonymous, another owner, other buckets and malformed paths', async () => {
      for (const [role, id, name, bucket] of [
        ['anon', null, `${group}/${owner}/30000000-0000-4000-8000-000000000001.jpg`],
        ['authenticated', outsider, `${group}/${outsider}/${photoId}.jpg`],
        ['authenticated', teammate, `${group}/${owner}/30000000-0000-4000-8000-000000000001.jpg`],
        ['authenticated', owner, `${archived}/${owner}/${photoId}.jpg`],
        ['authenticated', owner, path, 'other-private-bucket'],
        ['authenticated', owner, `${group}/${owner}/not-a-uuid.jpg`],
        ['authenticated', owner, `${group}/${owner}/${photoId}.png`],
        ['authenticated', owner, `${group}/${owner}/extra/${photoId}.jpg`],
      ]) {
        await as(role, id)
        await assert.rejects(insert(name, bucket), /row-level security/)
      }
      await db.exec('reset role')
      await db.exec(`update public.group_members set left_at=now() where group_id='${group}' and member_id='${teammate}'`)
      await as('authenticated', teammate)
      await assert.rejects(insert(`${group}/${teammate}/${photoId}.jpg`), /row-level security/)
      await db.exec('reset role')
      await db.exec(`update public.group_members set left_at=null where group_id='${group}' and member_id='${teammate}'`)
    })
    await t.test('pending-row visibility remains owner-only, limited to ten minutes and independent of group names', async () => {
      await as('authenticated', owner)
      assert.equal(await scalar(`select public.can_read_pending_story_upload($1,statement_timestamp())`, [path]), true)
      for (const age of ["statement_timestamp()-interval '10 minutes'", "statement_timestamp()-interval '11 minutes'", "statement_timestamp()+interval '1 second'"]) {
        assert.equal(await scalar(`select public.can_read_pending_story_upload($1,${age})`, [path]), false)
      }
      await as('authenticated', teammate)
      assert.equal(await scalar(`select public.can_read_pending_story_upload($1,statement_timestamp())`, [path]), false)
      await as('anon', null)
      await assert.rejects(db.query(`select public.can_read_pending_story_upload($1,statement_timestamp())`, [path]), /permission denied/)
      await db.exec('reset role')
      await db.exec(`update public.groups set name='Renamed group, not a UUID' where id='${group}'`)
      await as('authenticated', owner)
      assert.equal((await insert(`${group}/${owner}/30000000-0000-4000-8000-000000000001.jpg`)).rows.length, 1)
      await db.exec('reset role')
    })
    await t.test('photo commits to attendance/story atomically and only then becomes visible to teammates', async () => {
      const entry = await scalar(`insert into public.timetable_entries(group_id,member_id,subject,weekday,start_time,end_time)
        values($1,$2,'LOCAL CLASS',extract(dow from (statement_timestamp() at time zone 'Asia/Singapore'))::int,'00:00','23:59') returning id`, [group, owner])
      await as('authenticated', teammate)
      assert.equal(await scalar(`select count(*) from storage.objects where name=$1`, [path]), 0)
      await as('authenticated', owner)
      const result = await scalar(`select public.check_in_with_story($1,(statement_timestamp() at time zone 'Asia/Singapore')::date,$2)`, [entry, path])
      assert.equal(result.object_path, path)
      assert.ok(result.attendance_id)
      await as('authenticated', teammate)
      assert.equal(await scalar(`select count(*) from storage.objects where name=$1`, [path]), 1)
      await as('authenticated', owner)
      assert.equal(await scalar(`select public.can_read_pending_story_upload($1,statement_timestamp())`, [path]), false)
      assert.equal((await db.query(`delete from storage.objects where name=$1 returning id`, [path])).rows.length, 0)
      await as('authenticated', outsider)
      assert.equal(await scalar(`select count(*) from storage.objects where name=$1`, [path]), 0)
      await db.exec('reset role')
    })
    await t.test('expiry still hides photos without deleting them or making the bucket public', async () => {
      await db.exec(`update public.attendance_stories set created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour'`)
      for (const id of [owner, teammate, outsider]) {
        await as('authenticated', id)
        assert.equal(await scalar(`select count(*) from storage.objects where name=$1`, [path]), 0)
      }
      await db.exec('reset role')
      assert.equal(await scalar(`select public from storage.buckets where id='attendance-stories'`), false)
      assert.equal(await scalar(`select count(*) from storage.objects where name=$1`, [path]), 1)
      assert.equal(await scalar(`select relrowsecurity from pg_class where oid='storage.objects'::regclass`), true)
    })
  } finally { await db.close() }
})
