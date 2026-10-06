import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/attendanceView.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const exports = {}
vm.runInNewContext(compiled, { exports, Date })
const { entriesForDay, attendanceForDay, weekdayForDate } = exports

const entry = (id, weekday, overrides = {}) => ({
  id, weekday, groupId: 'group', memberId: 'member', subject: id, startTime: '12:00', endTime: '14:00', ...overrides,
})

test('October 6 is Tuesday; October 5 is Monday regardless of UTC date parsing', () => {
  assert.equal(weekdayForDate('2026-10-06'), 2)
  assert.equal(weekdayForDate('2026-10-05'), 1)
  assert.equal(weekdayForDate('2026-10-11'), 0)
})

test('today filters out yesterday, archived classes, other groups, and other members', () => {
  const entries = [entry('monday', 1), entry('late', 2, { startTime: '16:00' }), entry('early', 2),
    entry('archived', 2, { archivedAt: '2026-10-01' }), entry('other-group', 2, { groupId: 'other' }),
    entry('other-member', 2, { memberId: 'other' })]
  assert.deepEqual(Array.from(entriesForDay(entries, 'group', '2026-10-06', 'member'), e => e.id), ['early', 'late'])
  assert.deepEqual(Array.from(entriesForDay(entries, 'group', '2026-10-05', 'member'), e => e.id), ['monday'])
})

test('day rollover selects the next day rather than retaining yesterday’s timetable', () => {
  const entries = [entry('monday', 1), entry('tuesday', 2)]
  assert.equal(entriesForDay(entries, 'group', '2026-10-05', 'member')[0].id, 'monday')
  assert.equal(entriesForDay(entries, 'group', '2026-10-06', 'member')[0].id, 'tuesday')
})

test('today never borrows attendance from a previous occurrence of the same class', () => {
  const record = { id: 'old', groupId: 'group', memberId: 'member', timetableEntryId: 'class', date: '2026-09-29', status: 'present' }
  const records = [record, { ...record, id: 'today', date: '2026-10-06', status: 'absent' }]
  assert.equal(attendanceForDay(records, 'group', 'member', 'class', '2026-10-06').id, 'today')
  assert.equal(attendanceForDay([record], 'group', 'member', 'class', '2026-10-06'), undefined)
  assert.equal(attendanceForDay(records, 'other-group', 'member', 'class', '2026-10-06'), undefined)
})
