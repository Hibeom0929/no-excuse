import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/push.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
function client({ permission = 'granted', error = null, ios = false, installed = true } = {}) {
  const calls = [], exports = {}
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }),
    unsubscribe: async () => { calls.push('unsubscribe'); return true },
  }
  const registration = { active: { postMessage(data, ports) { calls.push(['state', data]); queueMicrotask(() => ports[0].peer.onmessage({ data: { ok: true } })) } },
    pushManager: { getSubscription: async () => subscription, subscribe: async () => subscription },
  }
  class Channel { constructor() { this.port1 = { close() {}, onmessage: null }; this.port2 = { peer: this.port1 } } }
  vm.runInNewContext(compiled, { exports, require: () => ({ supabase: { rpc: (name, args) => ({ abortSignal: async () => { calls.push(['rpc', name, args]); return { error } } }) } }),
    navigator: { userAgent: ios ? 'iPhone' : 'Android', platform: '', maxTouchPoints: 0, serviceWorker: { ready: Promise.resolve(registration) } },
    window: { isSecureContext: true, matchMedia: () => ({ matches: installed }), PushManager: true, Notification: true },
    Notification: { requestPermission: () => { calls.push('permission'); return Promise.resolve(permission) } },
    URLSearchParams, Uint8Array, atob, MessageChannel: Channel, AbortController, setTimeout, clearTimeout,
  })
  return { exports, calls }
}
test('permission is requested in the click gesture before any awaited worker/server operation', async () => {
  const c = client()
  const pending = c.exports.enableDevicePush('user', 'B'.repeat(87), 'ko')
  assert.equal(c.calls[0], 'permission')
  await pending
  assert.equal(c.calls.find(call => call[0] === 'rpc')[1], 'upsert_push_subscription')
})
test('permission denial and account-switch cancellation never register subscriptions', async () => {
  const denied = client({ permission: 'denied' })
  await assert.rejects(denied.exports.enableDevicePush('user', 'B'.repeat(87), 'ko'), /허용/)
  assert.equal(denied.calls.length, 1)
  const switched = client()
  await switched.exports.enableDevicePush('user', 'B'.repeat(87), 'ko', () => false)
  assert.equal(switched.calls.length, 1)
})
test('failed server save suppresses local notifications and never reports enabled', async () => {
  const c = client({ error: { message: 'offline' } })
  await assert.rejects(c.exports.enableDevicePush('user', 'B'.repeat(87), 'ko'), /저장/)
  const state = c.calls.filter(call => call[0] === 'state').at(-1)[1]
  assert.equal(state.memberId, null); assert.equal(state.enabled, false)
})
test('stale account binding is cancelled after awaiting the worker registration', async () => {
  const c = client()
  let current = true
  const pending = c.exports.setPushWorkerState('old-user', true, () => current)
  current = false
  await pending
  assert.equal(c.calls.length, 0)
})
test('opt-out and logout suppress locally first, then disable the server subscription and unsubscribe', async () => {
  const c = client()
  await c.exports.disableDevicePush()
  assert.equal(c.calls[0][0], 'state')
  assert.equal(c.calls[0][1].enabled, false)
  assert.equal(c.calls[1][1], 'disable_push_subscription')
  assert.equal(c.calls[2], 'unsubscribe')
})
test('iPhone browser instructs Home Screen installation; deep links accept only UUID group/class pairs', () => {
  assert.equal(client({ ios: true, installed: false }).exports.pushSupport(), 'install')
  assert.equal(client({ ios: true }).exports.pushSupport(), 'supported')
  const { pushRoute } = client().exports
  assert.equal(pushRoute('?group=https://evil.test&entry=any'), null)
  assert.equal(pushRoute('?group=00000000-0000-4000-8000-000000000001&entry=00000000-0000-4000-8000-000000000002').groupId,
    '00000000-0000-4000-8000-000000000001')
})
