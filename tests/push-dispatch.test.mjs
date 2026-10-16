import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import webpush from 'web-push'
import { createECDH, randomBytes } from 'node:crypto'

const compiled = ts.transpileModule(readFileSync(new URL('../supabase/functions/send-attendance-reminders/index.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
}).outputText
const secret = 'a'.repeat(72)
function server({ body, sendError } = {}) {
  const sends = [], calls = []
  const data = body ?? { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: {}, language: 'ko', subject: 'CLASS',
    memberId: 'member', groupId: 'group', entryId: '00000000-0000-4000-8000-000000000001', date: '2026-10-16', expiresAt: Date.now() + 120000 }
  let handler, claims = 0
  const client = { rpc: async (name, args) => {
    calls.push([name, args])
    return { error: null, data: name === 'push_dispatch_config' ? { secret, vapid: { publicKey: 'public', privateKey: 'private' } }
      : name === 'claim_attendance_push' ? (claims++ ? [] : [{ delivery_id: 'delivery' }])
      : name === 'read_attendance_push' ? (body === null ? null : data) : null }
  } }
  vm.runInNewContext(compiled, { exports: {}, require: name => name.startsWith('https:') ? { createClient: () => client }
    : { sendNotification: async (...args) => { sends.push(args); if (sendError) throw sendError } },
    Deno: { serve: callback => { handler = callback }, env: { get: () => 'server-only' } }, URL, Response, console: { error() {} },
  })
  return { sends, calls, invoke: value => handler(new Request('https://app.test', { method: 'POST', headers: value ? { 'x-no-excuse-cron': value } : {} })) }
}
test('scheduler secret is required before claiming or sending anything', async () => {
  const s = server()
  for (const value of [undefined, 'wrong', 'b'.repeat(72)]) assert.equal((await s.invoke(value)).status, 401)
  assert.equal(s.sends.length, 0)
  assert.equal(s.calls.some(call => call[0] === 'claim_attendance_push'), false)
})
test('sends an encrypted, short-lived notification once, never an automatic attendance check-in', async () => {
  const s = server()
  assert.equal((await s.invoke(secret)).status, 200)
  await s.invoke(secret)
  assert.equal(s.sends.length, 1)
  assert.match(JSON.parse(s.sends[0][1]).body, /출석 도장/)
  assert.equal(s.sends[0][2].TTL, 120)
  assert.equal(s.sends[0][2].topic.length, 32)
  assert.equal(s.calls.at(-1)[0], 'claim_attendance_push')
  assert.equal(s.calls.some(call => /check_in|attendance_records/.test(call[0])), false)
})
test('post-claim check-in/opt-out and malicious endpoints are skipped; expired endpoints are disabled', async () => {
  for (const options of [{ body: null }, { body: { endpoint: 'https://127.0.0.1/private' } }]) {
    const s = server(options); await s.invoke(secret); assert.equal(s.sends.length, 0)
    assert.equal(s.calls.at(-1)[1].p_status, 'skipped')
  }
  const s = server({ sendError: { statusCode: 410 } }); await s.invoke(secret)
  assert.equal(s.calls.at(-1)[1].p_disable, true)
})
test('ambiguous delivery timeouts are not blindly retried or reported as success', async () => {
  const s = server({ sendError: new Error('timeout') })
  const result = await (await s.invoke(secret)).json()
  await s.invoke(secret)
  assert.equal(result.failed, 1); assert.equal(result.sent, 0); assert.equal(s.sends.length, 1)
})
test('real Web Push library creates standard AES128GCM encrypted requests and VAPID authorization', () => {
  const keys = webpush.generateVAPIDKeys()
  const receiver = createECDH('prime256v1'); receiver.generateKeys()
  const request = webpush.generateRequestDetails({ endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: receiver.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } }, 'CLASS PRIVATE PAYLOAD', {
    vapidDetails: { subject: 'https://no-excuse-eta.vercel.app', ...keys }, TTL: 120,
  })
  assert.equal(request.headers['Content-Encoding'], 'aes128gcm')
  assert.match(request.headers.Authorization, /^vapid /)
  assert.equal(request.body.includes(Buffer.from('CLASS PRIVATE PAYLOAD')), false)
})
