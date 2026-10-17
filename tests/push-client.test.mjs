import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'

const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/push.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
function client({ permission = 'granted', error = null, ios = false, installed = true, hang, clock = false, ackDelay = 0, blockedWorker = false } = {}) {
  const calls = [], exports = {}
  let time = 0, timerId = 0, finishLateSubscribe
  const timers = new Map(), never = new Promise(() => {})
  const delayedSubscribe = new Promise(resolve => { finishLateSubscribe = resolve })
  const setTimer = (fn, milliseconds) => { const id = ++timerId; timers.set(id, { fn, at: time + milliseconds }); return id }
  class ClockDate extends Date { static now() { return time } }
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }),
    unsubscribe: async () => { calls.push('unsubscribe'); return hang === 'unsubscribe' || hang === 'both' ? never : true },
  }
  const registration = { active: { postMessage(data, ports) {
    calls.push(['state', data])
    const ack = () => ports[0].peer.onmessage({ data: { ok: true } })
    if (ackDelay) setTimer(ack, ackDelay); else queueMicrotask(ack)
  } },
    pushManager: { getSubscription: async () => hang === 'lookup' ? never : hang === 'subscribe' ? null : subscription,
      subscribe: async () => { calls.push('subscribe'); return hang === 'subscribe' ? delayedSubscribe : subscription } },
  }
  class Channel { constructor() { this.port1 = { close() {}, onmessage: null }; this.port2 = { peer: this.port1 } } }
  const navigator = { userAgent: ios ? 'iPhone' : 'Android', platform: '', maxTouchPoints: 0,
    serviceWorker: { ready: hang === 'worker' ? never : Promise.resolve(registration) } }
  if (blockedWorker) Object.defineProperty(navigator, 'serviceWorker', { get() { throw new Error('Access denied by browser') } })
  vm.runInNewContext(compiled, { exports, require: () => ({ supabase: { rpc: (name, args) => ({ abortSignal: async signal => {
    calls.push(['rpc', name, args]); signal.addEventListener('abort', () => calls.push('abort'))
    return hang === 'rpc' || hang === 'both' ? never : { error }
  } }) } }),
    navigator,
    window: { isSecureContext: true, matchMedia: () => ({ matches: installed }), PushManager: true, Notification: true },
    Notification: { requestPermission: () => { calls.push('permission'); return hang === 'permission' ? never : Promise.resolve(permission) } },
    URLSearchParams, Uint8Array, atob, MessageChannel: Channel, AbortController,
    Date: clock ? ClockDate : Date, setTimeout: clock ? setTimer : setTimeout, clearTimeout: clock ? id => timers.delete(id) : clearTimeout,
  })
  return { exports, calls, registration,
    finishLateSubscribe: () => finishLateSubscribe(subscription),
    advance: milliseconds => { time += milliseconds; for (const [id, timer] of [...timers]) {
      if (timer.at <= time) { timers.delete(id); timer.fn() }
    } },
  }
}
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve() }
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

test('hung permission, lookup and subscription calls time out; late subscribe never opts in', async () => {
  for (const hang of ['permission', 'lookup', 'subscribe']) {
    const c = client({ hang, clock: true })
    const rejected = assert.rejects(c.exports.enableDevicePush('user', 'B'.repeat(87), 'ko'), /지연/)
    await flush(); c.advance(12001); await rejected
    c.finishLateSubscribe(); await flush()
    assert.equal(c.calls.some(call => call[0] === 'rpc' || call[0] === 'state'), false)
  }
})
test('settings lookup and an unresponsive SDK request both settle within the time limit', async () => {
  const lookup = client({ hang: 'lookup', clock: true })
  const lookupFailure = assert.rejects(lookup.exports.devicePushSubscription(lookup.registration), /지연/)
  lookup.advance(12001); await lookupFailure
  const c = client({ hang: 'rpc', clock: true })
  const rejected = assert.rejects(c.exports.pushRpc('get_push_public_config'), /지연/)
  await flush(); c.advance(12001); await rejected
  assert.equal(c.calls.includes('abort'), true)
})
test('all logout cleanup paths have ONE 12-second budget, not unlimited or stacked waits', async () => {
  for (const hang of ['worker', 'lookup', 'unsubscribe', 'rpc', 'both']) {
    const c = client({ hang, clock: true })
    const done = c.exports.disableDevicePush()
    const checked = ['worker', 'lookup', 'both'].includes(hang) ? assert.rejects(done) : done
    await flush(); c.advance(12001); await checked
    if (hang !== 'worker' && hang !== 'lookup') {
      assert.equal(c.calls.some(call => call[0] === 'rpc' && call[1] === 'disable_push_subscription'), true)
      assert.equal(c.calls.includes('unsubscribe'), true)
    }
  }
})
test('actual sign-out still reaches authentication when browser cleanup never responds', async () => {
  const c = client({ hang: 'lookup', clock: true }), exports = {}
  const supabase = { auth: { signOut: async () => { c.calls.push('auth-sign-out') } } }
  const hooks = { ...React, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect() {}, useCallback: callback => callback }
  const authCode = ts.transpileModule(readFileSync(new URL('../src/lib/auth.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(authCode, { exports, require: name => name === 'react' ? hooks : name === './push' ? c.exports : { supabase },
    window: { location: { search: '', hash: '' } }, URLSearchParams })
  const provider = exports.AuthProvider({ children: null })
  const done = provider.props.value.signOut()
  await flush(); c.advance(12001); await done
  assert.equal(c.calls.at(-1), 'auth-sign-out')
})
test('time already spent suppressing the worker is deducted from the logout budget', async () => {
  const c = client({ hang: 'lookup', clock: true, ackDelay: 3000 })
  const rejected = assert.rejects(c.exports.disableDevicePush(), /지연/)
  await flush(); c.advance(3000); await flush()
  c.advance(9001); await rejected
  assert.equal(c.calls.some(call => call[0] === 'rpc'), false)
})
test('browser refusing worker access cannot crash ordinary app navigation or cleanup', () => {
  const c = client({ blockedWorker: true })
  let stop
  assert.doesNotThrow(() => { stop = c.exports.listenForPushNavigation(() => {}) })
  assert.doesNotThrow(() => stop())
})
