import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/profile.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function profileService({ profile = null, readError = null, saved = null, saveError = null } = {}) {
  const calls = []
  const supabase = {
    from(table) {
      assert.equal(table, 'profiles')
      return { select: () => ({ eq: (column, userId) => {
        assert.equal(column, 'id')
        calls.push(['read', userId])
        return { maybeSingle: async () => ({ data: profile, error: readError }) }
      } }) }
    },
    rpc(name, params) {
      calls.push(['rpc', name, params.p_name])
      return { single: async () => ({ data: saved, error: saveError }) }
    },
  }
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: () => ({ supabase }) })
  return { ...exports, calls }
}

test('existing profile keeps its saved name without requesting a repair', async () => {
  const service = profileService({ profile: { id: 'current-user', name: 'Existing name' } })
  const result = await service.loadMyProfile('current-user')
  assert.equal(result.name, 'Existing name')
  assert.equal(service.calls.length, 1)
})

test('a missing profile is restored on the server before entering onboarding', async () => {
  const service = profileService({ saved: { id: 'current-user', name: '' } })
  const result = await service.loadMyProfile('current-user')
  assert.equal(result.id, 'current-user')
  assert.equal(result.name, '')
  assert.deepEqual(service.calls.map(call => [...call]), [
    ['read', 'current-user'], ['rpc', 'save_my_profile', null],
  ])
})

test('a query failure is not mistaken for a missing profile', async () => {
  const service = profileService({ readError: { message: 'Permission denied' } })
  await assert.rejects(service.loadMyProfile('current-user'), /Permission denied/)
  assert.equal(service.calls.length, 1)
})

test('saving a name requires a returned database row, not just an absence of errors', async () => {
  const service = profileService()
  await assert.rejects(service.saveMyProfileName('current-user', 'New name'), /프로필을 저장하지 못했어요/)
})

test('a returned profile for another account is rejected', async () => {
  const service = profileService({ saved: { id: 'other-user', name: 'Someone else' } })
  await assert.rejects(service.saveMyProfileName('current-user', 'New name'), /프로필을 저장하지 못했어요/)
})

test('name saving displays only the name confirmed by the server', async () => {
  const service = profileService({ saved: { id: 'current-user', name: 'Saved name' } })
  const result = await service.saveMyProfileName('current-user', ' Saved name ')
  assert.equal(result.name, 'Saved name')
  assert.deepEqual([...service.calls[0]], ['rpc', 'save_my_profile', 'Saved name'])
})

test('profile restoration errors remain visible instead of inventing a profile', async () => {
  const service = profileService({ saveError: { message: 'Restoration failed' } })
  await assert.rejects(service.loadMyProfile('current-user'), /Restoration failed/)
})
