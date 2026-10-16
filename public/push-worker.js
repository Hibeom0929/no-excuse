/* Imported by Workbox. No auth tokens, subscription endpoints or photos stored. */
const PUSH_STATE_DB = 'no-excuse-push-state'

function pushState(value) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_STATE_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('settings')
    request.onerror = () => reject(new Error('Push state unavailable'))
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('settings', value === undefined ? 'readonly' : 'readwrite')
      const store = tx.objectStore('settings')
      const operation = value === undefined ? store.get('active') : store.put(value, 'active')
      let result
      operation.onsuccess = () => { result = operation.result }
      tx.oncomplete = () => { db.close(); resolve(result) }
      tx.onerror = () => { db.close(); reject(new Error('Push state unavailable')) }
      tx.onabort = tx.onerror
    }
  })
}

const pushUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
function pushTarget(data) {
  if (!pushUuid(data?.groupId) || !pushUuid(data?.entryId)) return null
  return '/?group=' + encodeURIComponent(data.groupId) + '&entry=' + encodeURIComponent(data.entryId)
}

self.addEventListener('message', event => {
  if (event.data?.type !== 'NO_EXCUSE_PUSH_STATE') return
  // Accept only messages from this app's own controlled windows.
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return
  const memberId = pushUuid(event.data.memberId) ? event.data.memberId : null
  event.waitUntil(pushState({ memberId, enabled: !!memberId && event.data.enabled === true })
    .then(() => event.ports[0]?.postMessage({ ok: true }))
    .catch(() => event.ports[0]?.postMessage({ ok: false })))
})

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    try {
      const data = event.data?.json()
      const target = pushTarget(data)
      if (!target || !pushUuid(data.memberId) || typeof data.title !== 'string' || typeof data.body !== 'string'
        || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) return
      const state = await pushState()
      // Fail closed after logout/account switch; no old-account lock-screen data.
      if (!state?.enabled || state.memberId !== data.memberId) return
      await self.registration.showNotification(data.title.slice(0, 120), {
        body: data.body.slice(0, 300), icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
        tag: `class-${data.entryId}-${data.date}`, renotify: false,
        data: { groupId: data.groupId, entryId: data.entryId, memberId: data.memberId, target },
      })
    } catch { /* invalid payload/state is never shown or logged */ }
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const data = event.notification.data
    const target = pushTarget(data)
    if (!target) return
    const state = await pushState().catch(() => null)
    if (!state?.enabled || state.memberId !== data.memberId) return
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) {
      // The page handles the message without losing unsaved forms/session state.
      existing.postMessage({ type: 'NO_EXCUSE_OPEN_CLASS', groupId: data.groupId, entryId: data.entryId })
      await existing.focus()
    } else await self.clients.openWindow(target)
  })())
})
