import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const mappers = {}
for (const name of ['mapGroup', 'mapTimetable', 'mapAttendance', 'mapFine', 'mapExcuse']) mappers[name] = row => row
const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/loadAppData.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const exports = {}
vm.runInNewContext(compiled, { exports, require: () => mappers })
const { loadAppData } = exports

function clientWithFailure(failingTable) {
  let membershipReads = 0
  return { from(table) {
    const membershipLookup = table === 'group_members' && membershipReads++ === 0
    const result = table === failingTable
      ? { data: null, error: { message: `failed ${table}` } }
      : { data: membershipLookup ? [{ group_id: 'group' }] : table === 'excuse_requests' ? [{ id: 'request' }] : [], error: null }
    const builder = { select: () => builder, eq: () => builder, is: () => builder, in: () => builder,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) }
    return builder
  } }
}

test('failed attendance query is not converted into deleted/missing attendance', async () => {
  await assert.rejects(loadAppData(clientWithFailure('attendance_records'), 'me'), /failed attendance_records/)
})
test('failed excuse/vote queries do not silently hide requests or votes', async () => {
  for (const table of ['excuse_requests', 'excuse_votes']) {
    await assert.rejects(loadAppData(clientWithFailure(table), 'me'), new RegExp(`failed ${table}`))
  }
})
test('failed membership lookup is not mistaken for having no groups', async () => {
  await assert.rejects(loadAppData(clientWithFailure('group_members'), 'me'), /failed group_members/)
})
test('successful empty history remains a legitimate complete snapshot', async () => {
  const data = await loadAppData(clientWithFailure(), 'me')
  assert.equal(data.attendance.length, 0)
  assert.equal(data.excuses.length, 1)
})
