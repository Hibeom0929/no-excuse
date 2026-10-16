import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const script = readFileSync(new URL('../public/push-worker.js', import.meta.url), 'utf8')
const memberId = '00000000-0000-4000-8000-000000000001'
const groupId = '10000000-0000-4000-8000-000000000001'
const entryId = '20000000-0000-4000-8000-000000000001'
const payload = () => ({ memberId, groupId, entryId, title: 'No Excuse', body: 'CLASS has started', date: '2026-10-16', expiresAt: Date.now() + 60000 })

function worker(storage = { value: undefined }) {
  const events = {}, notifications = [], messages = [], opened = []
  const client = { url: 'https://app.test/', postMessage: data => messages.push(data), focus: async () => {} }
  const indexedDB = { open() {
    const request = { result: { createObjectStore() {}, close() {}, transaction() {
      const tx = { objectStore: () => ({ get() { return op(false) }, put(value) { storage.value = value; return op(true) } }) }
      function op(write) {
        const operation = { result: write ? undefined : storage.value }
        queueMicrotask(() => { operation.onsuccess?.(); tx.oncomplete?.() })
        return operation
      }
      return tx
    } } }
    queueMicrotask(() => request.onsuccess?.())
    return request
  } }
  vm.runInNewContext(script, { URL, indexedDB,
    self: { location: { origin: 'https://app.test' }, addEventListener: (type, callback) => { events[type] = callback },
      registration: { showNotification: async (title, options) => notifications.push({ title, options }) },
      clients: { matchAll: async () => [client], openWindow: async url => opened.push(url) },
    },
  })
  async function fire(type, data) {
    const pending = []
    events[type]({ ...data, waitUntil: promise => pending.push(promise) })
    await Promise.all(pending)
  }
  return { storage, notifications, messages, opened,
    state: (value, origin = 'https://app.test/') => fire('message', { data: { type: 'NO_EXCUSE_PUSH_STATE', ...value }, source: { url: origin }, ports: [{ postMessage() {} }] }),
    push: value => fire('push', { data: { json: () => value } }),
    click: data => fire('notificationclick', { notification: { data, close() {} } }),
  }
}

test('closed-app worker displays only the opted-in, active account and persists that binding', async () => {
  const w = worker()
  await w.push(payload()); assert.equal(w.notifications.length, 0)
  await w.state({ memberId, enabled: true })
  await w.push(payload()); assert.equal(w.notifications.length, 1)
  const rebooted = worker(w.storage)
  await rebooted.push(payload()); assert.equal(rebooted.notifications.length, 1)
  assert.equal(w.notifications[0].options.renotify, false)
  assert.equal(w.notifications[0].options.tag, `class-${entryId}-2026-10-16`)
})
test('expiry, malformed routes, other accounts and cross-origin state changes cannot expose notifications', async () => {
  const w = worker()
  await w.state({ memberId, enabled: true }, 'https://evil.test/')
  await w.push(payload()); assert.equal(w.notifications.length, 0)
  await w.state({ memberId, enabled: true })
  for (const changed of [{ expiresAt: Date.now() - 1 }, { memberId: groupId }, { groupId: 'https://evil.test/' }, { expiresAt: 'tomorrow' }]) {
    await w.push({ ...payload(), ...changed })
  }
  assert.equal(w.notifications.length, 0)
  await w.state({ memberId: null, enabled: false })
  await w.push(payload()); assert.equal(w.notifications.length, 0)
})
test('click opens the correct group/class without trusting arbitrary payload URLs; old-account clicks are blocked', async () => {
  const w = worker()
  await w.state({ memberId, enabled: true })
  await w.click({ ...payload(), target: 'https://evil.test/' })
  assert.equal(w.messages.length, 1)
  assert.equal(w.messages[0].type, 'NO_EXCUSE_OPEN_CLASS')
  assert.equal(w.messages[0].groupId, groupId)
  assert.equal(w.messages[0].entryId, entryId)
  assert.equal(w.opened.length, 0)
  await w.state({ memberId: null, enabled: false })
  await w.click(payload()); assert.equal(w.messages.length, 1)
})
