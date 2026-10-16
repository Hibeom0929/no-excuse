import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const owner = '00000000-0000-4000-8000-000000000001'
const friend = '00000000-0000-4000-8000-000000000002'
const group = '10000000-0000-4000-8000-000000000001'
const now = '2026-10-16T04:00:30Z' // Friday noon in Singapore, not browser/UTC time.
const endpoint = 'https://fcm.googleapis.com/fcm/send/test-owner'
const pub = 'B'.repeat(87), auth = 'a'.repeat(22)

test('real PostgreSQL migration, privacy, scheduler and no-duplicate guarantees (local only)', async t => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      create schema vault; create table vault.secrets(id uuid default gen_random_uuid(),name text unique,secret text,description text);
      create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
      create function vault.create_secret(secret text,name text,description text) returns uuid language plpgsql as $$
      declare result uuid; begin insert into vault.secrets(name,secret,description) values($2,$1,$3) returning id into result; return result; end; $$;`)
    // Use repository DDL, without unrelated production RLS/publication plumbing.
    const ddl = read('../supabase/schema.sql').split('-- Row Level Security:')[0]
      .replace('create extension if not exists "pgcrypto";', '')
    await db.exec(ddl)
    await db.exec(read('../supabase/migrations/20261017000000_attendance_push.sql'))
    await db.exec(`insert into auth.users(id) values('${owner}'),('${friend}');
      insert into groups(id,name,invite_code,owner_id,treasurer_id) values('${group}','LOCAL TEST','LOCAL','${owner}','${owner}');
      insert into group_members(group_id,member_id) values('${group}','${owner}'),('${group}','${friend}');
      update attendance_push_settings set public_key='${pub}',enabled=true;
      insert into attendance_push_subscriptions(member_id,endpoint,p256dh,auth_key) values('${owner}','${endpoint}','${pub}','${auth}');`)
    const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0]
    const insertClass = async (subject, { start = '12:00', end = '13:00', member = owner, archived = false, weekday = 5 } = {}) =>
      scalar(`insert into timetable_entries(group_id,member_id,subject,weekday,start_time,end_time,archived_at)
        values($1,$2,$3,$4,$5,$6,case when $7 then now() else null end) returning id`, [group, member, subject, weekday, start, end, archived])
    const due = await insertClass('DUE')
    const present = await insertClass('PRESENT')
    await db.query(`insert into attendance_records(group_id,member_id,timetable_entry_id,date,status)
      values($1,$2,$3,'2026-10-16','present')`, [group, owner, present])
    await insertClass('FUTURE', { start: '12:10' })
    await insertClass('STALE', { start: '11:55' })
    await insertClass('ENDED', { start: '12:00', end: '12:00' })
    await insertClass('ARCHIVED', { archived: true })
    await insertClass('WRONG DAY', { weekday: 4 })
    await insertClass('MALFORMED', { start: 'not-a-time' })
    await insertClass('UNSUBSCRIBED', { member: friend })
    await t.test('only the due, opted-in, unmarked class is claimed, at Singapore time', async () => {
      const rows = (await db.query('select * from claim_attendance_push(100,$1)', [now])).rows
      assert.equal(rows.length, 1)
      assert.equal(await scalar('select entry_id from attendance_push_deliveries where id=$1', [rows[0].delivery_id]), due)
      assert.equal((await db.query('select * from claim_attendance_push(100,$1)', [now])).rows.length, 0)
      const payload = await scalar('select read_attendance_push($1,$2)', [rows[0].delivery_id, now])
      assert.equal(payload.subject, 'DUE')
      assert.equal(payload.expiresAt, Date.parse('2026-10-16T04:02:00Z'))
    })
    const delivery = await scalar('select id from attendance_push_deliveries limit 1')
    await t.test('rechecks attendance, opt-out, leaving and class edits immediately before sending', async () => {
      for (const sql of [
        `update attendance_push_subscriptions set enabled=false`,
        `update group_members set left_at=now() where member_id='${owner}'`,
        `update timetable_entries set archived_at=now() where id='${due}'`,
        `update groups set archived_at=now()`,
        `update timetable_entries set start_time='14:00' where id='${due}'`,
        `insert into attendance_records(group_id,member_id,timetable_entry_id,date,status) values('${group}','${owner}','${due}','2026-10-16','present')`,
      ]) {
        await db.exec('begin; ' + sql)
        assert.equal(await scalar('select read_attendance_push($1,$2)', [delivery, now]), null)
        await db.exec('rollback')
      }
      assert.equal(await scalar('select read_attendance_push($1,$2)', [delivery, '2026-10-16T04:03:00Z']), null)
    })
    await t.test('another account cannot enumerate private endpoints, keys, claims or config', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`)
        for (const sql of [
          'select * from attendance_push_subscriptions', 'select * from attendance_push_deliveries',
          'select * from attendance_push_settings', 'select push_dispatch_config()',
          'select * from claim_attendance_push()', `select read_attendance_push('${delivery}')`,
          `select initialize_push_keys('${pub}','${'a'.repeat(43)}')`,
        ]) await assert.rejects(db.query(sql), /permission denied/)
        await db.exec('reset role')
      }
    })
    await t.test('own settings only; secret endpoint ownership requires both browser encryption keys', async () => {
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${friend}',false)`)
      assert.equal(await scalar('select get_push_subscription_status($1)', [endpoint]), false)
      await db.query('select disable_push_subscription($1)', [endpoint])
      await assert.rejects(db.query('select upsert_push_subscription($1,$2,$3,$4)', [endpoint, pub, 'b'.repeat(22), 'ko']), /올바르지/)
      await db.exec('reset role')
      assert.equal(await scalar('select enabled from attendance_push_subscriptions where endpoint=$1', [endpoint]), true)
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false)`)
      assert.equal(await scalar('select get_push_subscription_status($1)', [endpoint]), true)
      await db.query('select disable_push_subscription($1)', [endpoint])
      assert.equal(await scalar('select get_push_subscription_status($1)', [endpoint]), false)
      for (const url of ['http://fcm.googleapis.com/test', 'https://127.0.0.1/test', 'https://fcm.googleapis.com.evil.test/path', 'https://user@fcm.googleapis.com/path', 'https://fcm.googleapis.com:8080/path']) {
        await assert.rejects(db.query('select upsert_push_subscription($1,$2,$3,$4)', [url, pub, auth, 'ko']), /올바르지/)
      }
      await db.query('select upsert_push_subscription($1,$2,$3,$4)', [endpoint, pub, auth, 'en'])
      await db.exec('reset role')
      assert.equal(await scalar('select language from attendance_push_subscriptions where endpoint=$1', [endpoint]), 'en')
    })
    await t.test('permanent push failures disable only the owning device; completed claims never resend', async () => {
      await db.query('select finish_attendance_push($1,$2,$3)', [delivery, 'failed', true])
      assert.equal(await scalar('select enabled from attendance_push_subscriptions where endpoint=$1', [endpoint]), false)
      await db.query('select finish_attendance_push($1,$2,$3)', [delivery, 'sent', false])
      assert.equal(await scalar('select status from attendance_push_deliveries where id=$1', [delivery]), 'failed')
      assert.equal(await scalar('select read_attendance_push($1,$2)', [delivery, now]), null)
    })
    await t.test('schedule requires the matching public anon key and privately resolves its separate credential', async () => {
      // Mock only extension entry points; execute the actual setup SQL and job
      // command in PostgreSQL. This never contacts Supabase or push providers.
      await db.exec(`create schema cron; create table cron.job(jobid bigint generated always as identity,jobname text,schedule text,command text);
        create function cron.schedule(text,text,text) returns bigint language sql as $$
          insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid; $$;
        create schema net; create table net.local_requests(url text,headers jsonb,body jsonb);
        create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
          begin insert into net.local_requests values($1,$2,$3); return 1; end; $$;`)
      const script = read('../supabase/migrations/20261017010000_attendance_push_schedule.sql')
        .replace(/^create extension.*;$/gm, '')
      const jwt = role => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role, ref: 'jcwvpcojpwjtolljzrks' })).toString('base64url') + '.localonly'
      for (const invalid of ['sb_publishable_wrong_type', jwt('service_role')]) {
        await db.query(`select set_config('no_excuse.push_gateway_anon',$1,false)`, [invalid])
        await assert.rejects(db.exec(script), /anon JWT|anon JWT is accepted/)
        await db.exec('rollback')
      }
      await db.query(`select set_config('no_excuse.push_gateway_anon',$1,false)`, [jwt('anon')])
      await db.exec(script)
      const job = (await db.query('select * from cron.job')).rows[0]
      assert.equal(job.schedule, '* * * * *')
      assert.equal(await scalar('select count(*) from cron.job'), 1)
      assert.equal(await scalar(`select length(secret) from vault.secrets where name='no_excuse_push_cron_secret'`), 72)
      assert.equal(job.command.includes(jwt('anon')), false)
      await db.exec(job.command)
      const request = (await db.query('select * from net.local_requests')).rows[0]
      assert.equal(request.url, 'https://jcwvpcojpwjtolljzrks.supabase.co/functions/v1/send-attendance-reminders')
      assert.equal(request.headers.Authorization, `Bearer ${jwt('anon')}`)
      assert.equal(request.headers['x-no-excuse-cron'].length, 72)
      await assert.rejects(db.exec(script), /already exists/)
      await db.exec('rollback')
      assert.equal(await scalar('select count(*) from cron.job'), 1)
    })
  } finally { await db.close() }
})
