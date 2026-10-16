import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('cleanup endpoint cannot delete photos or contact a backend in archive mode', async () => {
  let handler
  vm.runInNewContext(read('../supabase/functions/cleanup-attendance-stories/index.ts')
    .replace('(request: Request)', '(request)'), { Deno: { serve: callback => { handler = callback } }, Response })
  const response = await handler(new Request('https://example.test', { method: 'POST' }))
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /automatic photo deletion is disabled/)
  assert.equal((await handler(new Request('https://example.test'))).status, 405)
})

test('no automatic deletion schedule or weaker authentication is configured', () => {
  const schedule = read('../supabase/migrations/20261016010000_story_cleanup_schedule.sql')
    .split('\n').filter(line => !line.trim().startsWith('--')).join('\n').trim()
  assert.equal(schedule, '')
  assert.match(read('../supabase/config.toml'), /verify_jwt\s*=\s*true/)
})

test('semester migration reserves a separate nullable deletion date and disables old cleanup', () => {
  const sql = read('../supabase/migrations/20261016020000_semester_photo_archive.sql')
  assert.match(sql, /archive_delete_after timestamptz\s+check/)
  assert.doesNotMatch(sql, /archive_delete_after timestamptz\s+(not null|default)/i)
  assert.match(sql, /select null::text where false/)
  const prune = sql.split('create or replace function public.prune_story_metadata()')[1].split('$$;')[0]
  assert.doesNotMatch(prune, /\b(delete from|update public)\b/i)
})

test('both languages explain semester retention rather than claiming daily deletion', () => {
  const translations = read('../src/lib/i18n.tsx')
  assert.match(translations, /하루 동안 공유되고, 이후 학기 말 정리 전까지 비공개로 보관/)
  assert.match(translations, /one day, then kept privately until end-of-semester cleanup/)
})
