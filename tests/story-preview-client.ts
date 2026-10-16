// This client is used ONLY by the manual QA Vite config. No real API requests.
let expired = false
let failed = false
export function setPhotoExpiry(value: boolean) { expired = value }
export function setPhotoFailure(value: boolean) { failed = value }
const created = new Date(Date.now() - 3600000).toISOString()
export const supabase = {
  async rpc() {
    if (failed) return { data: null, error: { message: 'QA network failure' } }
    return { data: ['mine', 'friend-1', 'friend-2'].map((id, i) => ({
      id, attendance_record_id: id, group_id: 'qa', member_id: i ? 'friend' : 'me',
      subject: i === 2 ? 'CS2106 TUT' : 'CS3264 LEC', checked_in_at: created, created_at: created,
      expires_at: new Date(expired ? Date.now() - 1 : Date.parse(created) + 86400000).toISOString(), object_path: id,
    })), error: null }
  },
  storage: { from() { return { async download(path: string) {
    if (expired || failed) return { data: null, error: { message: 'QA unavailable' } }
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#e9ede5'; ctx.fillRect(0, 0, 640, 480)
    ctx.fillStyle = '#1f3d2b'; ctx.fillRect(55, 65, 530, 270)
    ctx.fillStyle = '#f7f5f0'; ctx.font = '32px sans-serif'; ctx.fillText(path === 'friend-2' ? 'CS2106 TUT' : 'CS3264 LEC', 130, 200)
    ctx.font = '16px sans-serif'; ctx.fillText('LOCAL QA SAMPLE — NOT A REAL CHECK-IN', 100, 250)
    ctx.fillStyle = '#b8ad95'; ctx.fillRect(100, 380, 440, 45)
    const data = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('canvas')), 'image/jpeg', 0.7))
    return { data, error: null }
  } } } },
}
