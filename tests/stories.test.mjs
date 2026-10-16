import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/stories.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports, Blob, atob, Uint8Array, crypto: { randomUUID: () => 'unique' } })
const { activeStories, visibleGroupStories, checkInWithStory, loadStories, loadStoryPhoto, storyPhotoBlob } = exports
const now = Date.parse('2026-10-16T04:00:00Z')
const story = (overrides = {}) => ({ id: 'story', attendanceRecordId: 'record', groupId: 'g', memberId: 'me',
  subject: 'CLASS', checkedInAt: new Date(now).toISOString(), createdAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 1000).toISOString(), objectPath: 'g/me/unique.jpg', ...overrides })
const group = { id: 'g', members: [{ id: 'me' }] }
const record = { id: 'record', groupId: 'g', memberId: 'me', status: 'present' }
const photo = 'data:image/jpeg;base64,/9j/2Q=='

test('stories expire exactly at the 24-hour boundary, not at midnight', () => {
  const created = Date.parse('2026-10-15T15:59:00Z')
  const s = story({ createdAt: new Date(created).toISOString(), expiresAt: new Date(created + 86400000).toISOString() })
  assert.equal(activeStories([s], 'g', created + 120000).length, 1)
  assert.equal(activeStories([s], 'g', created + 86400000 - 1).length, 1)
  assert.equal(activeStories([s], 'g', created + 86400000).length, 0)
  assert.equal(activeStories([s], 'other', now).length, 0)
  assert.equal(activeStories([story({ createdAt: new Date(now + 1).toISOString() })], 'g', now).length, 0)
  assert.equal(activeStories([story({ expiresAt: 'invalid' })], 'g', now).length, 0)
})

test('cancelled check-ins, departed members and archived groups cannot leave story bubbles', () => {
  assert.equal(visibleGroupStories([story()], group, [record], now).length, 1)
  assert.equal(visibleGroupStories([story()], group, [], now).length, 0)
  assert.equal(visibleGroupStories([story()], group, [{ ...record, status: 'absent' }], now).length, 0)
  assert.equal(visibleGroupStories([story()], { ...group, archivedAt: 'archived' }, [record], now).length, 0)
  assert.equal(visibleGroupStories([story()], { ...group, members: [{ id: 'me', leftAt: 'left' }] }, [record], now).length, 0)
  assert.equal(visibleGroupStories([story()], group, [{ ...record, groupId: 'other' }], now).length, 0)
})

function client({ uploadError, rpcError, response, throwRpc } = {}) {
  const calls = []
  return { calls,
    storage: { from(bucket) { assert.equal(bucket, 'attendance-stories'); return {
      async upload(path, blob, options) { calls.push(['upload', path, blob.size, options]); return { error: uploadError } },
      async remove(paths) { calls.push(['remove', paths]); return { error: null } },
      async download(path) { calls.push(['download', path]); return { data: new Blob(['photo']), error: null } },
    } } },
    async rpc(name, args) {
      calls.push(['rpc', name, args])
      if (throwRpc) throw new Error('network timeout')
      return { error: rpcError, data: response ?? { attendance_id: 'record', object_path: 'g/me/unique.jpg' } }
    },
  }
}

test('a photo uploads once and attendance/story commit through one RPC', async () => {
  const c = client()
  await checkInWithStory(c, 'entry', 'g', 'me', '2026-10-16', photo)
  assert.deepEqual(c.calls.map(call => call[0]), ['upload', 'rpc'])
  assert.equal(c.calls[0][3].cacheControl, '0')
  assert.equal(c.calls[0][3].upsert, false)
  assert.equal(c.calls[1][1], 'check_in_with_story')
  assert.equal(c.calls[1][2].p_object_path, 'g/me/unique.jpg')
})

test('failed upload never creates attendance; RPC timeouts never delete potentially committed photos', async () => {
  const failedUpload = client({ uploadError: { message: 'failure' } })
  await assert.rejects(checkInWithStory(failedUpload, 'entry', 'g', 'me', '2026-10-16', photo), /업로드/)
  assert.deepEqual(failedUpload.calls.map(call => call[0]), ['upload'])
  for (const options of [{ rpcError: { message: 'rejected' } }, { throwRpc: true }, { response: {} }]) {
    const c = client(options)
    await assert.rejects(checkInWithStory(c, 'entry', 'g', 'me', '2026-10-16', photo))
    assert.deepEqual(c.calls.map(call => call[0]), ['upload', 'rpc'])
  }
})

test('idempotent retry removes only its unused upload, never the original story', async () => {
  const c = client({ response: { attendance_id: 'original', object_path: 'g/me/original.jpg' } })
  await checkInWithStory(c, 'entry', 'g', 'me', '2026-10-16', photo)
  assert.equal(c.calls[2][0], 'remove')
  assert.equal(c.calls[2][1][0], 'g/me/unique.jpg')
})

test('optional-photo check-ins still use the server but do not upload anything', async () => {
  const c = client({ response: { attendance_id: 'record', object_path: null } })
  await checkInWithStory(c, 'entry', 'g', 'me', '2026-10-16')
  assert.deepEqual(c.calls.map(call => call[0]), ['rpc'])
  assert.equal(c.calls[0][2].p_object_path, null)
})

test('original/invalid images and photos larger than 200KB never reach Storage', () => {
  assert.equal(storyPhotoBlob(photo).type, 'image/jpeg')
  assert.throws(() => storyPhotoBlob('data:image/png;base64,AAAA'))
  assert.throws(() => storyPhotoBlob('https://example.com/photo.jpg'))
  assert.throws(() => storyPhotoBlob('data:image/jpeg;base64,' + 'AAAA'.repeat(100000)), /200KB/)
})

test('metadata refresh downloads no photo bytes; photo is downloaded only on opening', async () => {
  const c = client({ response: [{ id: 'story', group_id: 'g', attendance_record_id: 'record', member_id: 'me',
    checked_in_at: 'now', created_at: 'now', expires_at: 'later', object_path: 'g/me/unique.jpg' }] })
  const stories = await loadStories(c, 'g')
  assert.deepEqual(c.calls.map(call => call[0]), ['rpc'])
  await loadStoryPhoto(c, stories[0])
  assert.deepEqual(c.calls.map(call => call[0]), ['rpc', 'download'])
})
