import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const allowedEndpoint = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash
      && (url.hostname.endsWith('.push.apple.com') || url.hostname === 'push.apple.com'
        || url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com')
  } catch { return false }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  // Gateway JWT verification stays ON. This additional scheduler-only secret is
  // generated in Vault; anonymous/app users cannot trigger notification sends.
  const supplied = request.headers.get('x-no-excuse-cron')
  if (!supplied || supplied.length !== 72) return new Response('Unauthorized', { status: 401 })
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const config = await client.rpc('push_dispatch_config')
  if (config.error || !config.data?.secret || config.data.secret !== supplied) return new Response('Unauthorized', { status: 401 })
  try {
    let vapid = config.data.vapid
    if (!vapid) {
      const keys = webpush.generateVAPIDKeys()
      const initialized = await client.rpc('initialize_push_keys', { p_public_key: keys.publicKey, p_private_key: keys.privateKey })
      if (initialized.error) throw new Error('VAPID initialization failed')
      const fresh = await client.rpc('push_dispatch_config')
      if (fresh.error || !fresh.data?.vapid) throw new Error('VAPID unavailable')
      vapid = fresh.data.vapid
    }
    const heartbeat = await client.rpc('push_dispatch_heartbeat')
    if (heartbeat.error) throw new Error('Heartbeat failed')
    const claimed = await client.rpc('claim_attendance_push', { p_limit: 20 })
    if (claimed.error) throw new Error('Claim failed')
    const result = { sent: 0, skipped: 0, failed: 0 }
    // Small batches bound network use and CPU; one claim is never retried after
    // an ambiguous send/timeout, avoiding repeated class-start notifications.
    const rows = claimed.data ?? []
    for (let start = 0; start < rows.length; start += 4) {
      await Promise.all(rows.slice(start, start + 4).map(async (row: { delivery_id: string }) => {
        let status = 'failed', disable = false
        try {
          // Recheck attendance, opt-out, membership, class edits and expiry as
          // close as possible to sending. Request bodies cannot choose targets.
          const current = await client.rpc('read_attendance_push', { p_delivery_id: row.delivery_id })
          if (current.error) throw new Error('Recheck failed')
          const data = current.data
          if (!data || !allowedEndpoint(data.endpoint)) { status = 'skipped'; result.skipped++ }
          else {
            const korean = data.language === 'ko'
            const payload = JSON.stringify({
              title: korean ? 'No Excuse · 출석할 시간이에요' : 'No Excuse · Time to check in',
              body: korean ? `${data.subject} 수업이 시작했어요. 출석 도장을 찍어주세요!`
                : `${data.subject} has started. Check in to class!`,
              memberId: data.memberId, groupId: data.groupId, entryId: data.entryId,
              date: data.date, expiresAt: Number(data.expiresAt),
            })
            await webpush.sendNotification({ endpoint: data.endpoint, keys: data.keys }, payload, {
              vapidDetails: { subject: 'https://no-excuse-eta.vercel.app', publicKey: vapid.publicKey, privateKey: vapid.privateKey },
              TTL: 120, urgency: 'high', timeout: 10000,
              topic: data.entryId.replaceAll('-', '').slice(0, 24) + data.date.replaceAll('-', '').slice(-8),
            })
            status = 'sent'; result.sent++
          }
        } catch (error) {
          const code = (error as { statusCode?: number })?.statusCode
          disable = code === 404 || code === 410
          result.failed++
        }
        const finished = await client.rpc('finish_attendance_push', {
          p_delivery_id: row.delivery_id, p_status: status, p_disable: disable,
        })
        if (finished.error) result.failed++
      }))
    }
    return Response.json(result)
  } catch {
    // Never log endpoint capability URLs, auth keys, message text or VAPID keys.
    console.error('Attendance reminder dispatch failed')
    return new Response('Dispatch failed', { status: 500 })
  }
})
