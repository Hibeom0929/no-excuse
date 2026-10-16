import { supabase } from './supabase'

export const PUSH_TIMEOUT_MS = 12000
export async function pushRpc(name: string, args?: Record<string, unknown>) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS)
  try { return await supabase.rpc(name, args).abortSignal(controller.signal) }
  finally { clearTimeout(timeout) }
}
export const validPushId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export function pushRoute(search: string): { groupId: string; entryId: string } | null {
  const params = new URLSearchParams(search)
  const groupId = params.get('group'), entryId = params.get('entry')
  return validPushId(groupId) && validPushId(entryId) ? { groupId, entryId } : null
}

export function pushSupport(): 'supported' | 'install' | 'unsupported' {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
  if (ios && !installed) return 'install'
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    ? 'supported' : 'unsupported'
}

export async function pushRegistration(): Promise<ServiceWorkerRegistration> {
  let timeout: ReturnType<typeof setTimeout>
  try {
    return await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('앱을 완전히 닫았다가 다시 열고 시도해주세요.')), PUSH_TIMEOUT_MS)
    })])
  } finally { clearTimeout(timeout!) }
}

export async function setPushWorkerState(memberId: string | null, enabled: boolean, isCurrent = () => true): Promise<void> {
  const registration = await pushRegistration()
  if (!isCurrent()) return
  if (!registration.active) throw new Error('앱을 완전히 닫았다가 다시 열고 시도해주세요.')
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel()
    const timeout = setTimeout(() => {
      channel.port1.close(); reject(new Error('앱을 완전히 닫았다가 다시 열고 시도해주세요.'))
    }, 4000)
    channel.port1.onmessage = event => {
      clearTimeout(timeout); channel.port1.close()
      if (event.data?.ok) resolve()
      else reject(new Error('알림 설정을 저장하지 못했어요. 다시 시도해주세요.'))
    }
    registration.active!.postMessage({ type: 'NO_EXCUSE_PUSH_STATE', memberId, enabled }, [channel.port2])
  })
}

export function pushServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - publicKey.length % 4) % 4))
  return Uint8Array.from(raw, character => character.charCodeAt(0))
}

export async function enableDevicePush(memberId: string, publicKey: string | null, language: string, isCurrent = () => true): Promise<void> {
  // Keep this first: iOS requires the permission prompt in the click gesture.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('기기 설정에서 No Excuse 알림을 허용해주세요.')
  if (!isCurrent()) return
  if (!publicKey) throw new Error('알림 서버를 준비 중이에요. 잠시 후 다시 시도해주세요.')
  const registration = await pushRegistration()
  let subscription = await registration.pushManager.getSubscription()
  if (!isCurrent()) return
  if (!subscription) subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: pushServerKey(publicKey),
  })
  if (!isCurrent()) return
  await setPushWorkerState(memberId, true, isCurrent)
  if (!isCurrent()) { await setPushWorkerState(null, false).catch(() => {}); return }
  const value = subscription.toJSON()
  try {
    const { error } = await pushRpc('upsert_push_subscription', {
      p_endpoint: value.endpoint, p_p256dh: value.keys?.p256dh, p_auth: value.keys?.auth, p_language: language,
    })
    if (error) throw error
    if (!isCurrent()) await setPushWorkerState(null, false).catch(() => {})
  } catch {
    await setPushWorkerState(null, false).catch(() => {})
    throw new Error('알림 설정을 저장하지 못했어요. 다시 시도해주세요.')
  }
}

export async function disableDevicePush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  // Local suppression first: protects logout even when the network is offline.
  await setPushWorkerState(null, false).catch(() => {})
  const registration = await pushRegistration().catch(() => null)
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  let serverError: unknown
  try {
    const { error } = await pushRpc('disable_push_subscription', { p_endpoint: subscription.endpoint })
    if (error) serverError = error
  } catch (error) { serverError = error }
  const removed = await subscription.unsubscribe().catch(() => false)
  if (serverError && !removed) throw new Error('알림 설정을 저장하지 못했어요. 다시 시도해주세요.')
}
