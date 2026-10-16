// Local UI fixture: no real Supabase calls, browser permissions or subscriptions.
let enabled = false
const mode = new URLSearchParams(location.search).get('mode')
export const useAuth = () => ({ profile: { id: '00000000-0000-4000-8000-000000000001' } })
export const pushSupport = () => mode === 'install' ? 'install' : mode === 'unsupported' ? 'unsupported' : 'supported'
export const setPushWorkerState = async () => {}
export const pushRegistration = async () => ({ pushManager: { getSubscription: async () => ({ endpoint: 'local-fixture-only' }) } })
export const enableDevicePush = async () => { enabled = true }
export const disableDevicePush = async () => { enabled = false }
export const supabase = { rpc: async (name: string) => {
  if (mode === 'error') return { error: { message: 'local failure' } }
  return { error: null, data: name === 'get_push_public_config' ? { public_key: mode === 'pending' ? null : 'local-public-key' } : enabled }
} }
export const pushRpc = supabase.rpc
// The component checks permission when reloading an existing subscription;
// this fixture does not alter Notification.permission or request permission.
