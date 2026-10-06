import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/excuseActions.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const exports = {}
vm.runInNewContext(compiled, { exports })
const { submitExcuse, voteOnExcuse } = exports

test('submission is one atomic RPC, not separate inserts and status updates', async () => {
  const calls = []
  await submitExcuse({ rpc: async (name, args) => {
    calls.push([name, args]); return { data: 'request-id', error: null }
  } }, 'attendance-id', '  reason  ')
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'submit_excuse')
  assert.equal(calls[0][1].p_attendance_record_id, 'attendance-id')
  assert.equal(calls[0][1].p_reason, 'reason')
})

test('voting sends no spoofable voter id and commits its outcome through one RPC', async () => {
  const calls = []
  await voteOnExcuse({ rpc: async (name, args) => {
    calls.push([name, args]); return { data: 'approved', error: null }
  } }, 'excuse-id', true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'cast_excuse_vote')
  assert.equal(calls[0][1].p_excuse_id, 'excuse-id')
  assert.equal(calls[0][1].p_approve, true)
  assert.deepEqual(Object.keys(calls[0][1]).sort(), ['p_approve', 'p_excuse_id'])
})

test('failed or empty RPC responses never report success', async () => {
  for (const action of [
    client => submitExcuse(client, 'record', 'reason'),
    client => voteOnExcuse(client, 'request', false),
  ]) {
    await assert.rejects(action({ rpc: async () => ({ data: null, error: { message: 'denied' } }) }), /denied/)
    await assert.rejects(action({ rpc: async () => ({ data: null, error: null }) }))
  }
})

test('all persisted voting outcomes are accepted, including already-finalized retries', async () => {
  for (const data of ['pending', 'approved', 'rejected']) {
    await voteOnExcuse({ rpc: async () => ({ data, error: null }) }, 'request', true)
  }
})
