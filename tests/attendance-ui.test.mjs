import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let fixedNow = new Date(2026, 9, 6, 15, 13)
class PreviewDate extends Date { constructor(...args) { super(...(args.length ? args : [fixedNow])) } }
const group = { id: 'group', members: [{ id: 'me', name: 'Me' }, { id: 'friend', name: 'Friend' }] }
const member = group.members[1]
const entry = (id, weekday, startTime = '12:00') => ({ id, groupId: 'group', memberId: 'friend', subject: id, weekday, startTime, endTime: '14:00' })
const data = {
  timetable: [entry('YESTERDAY CLASS', 1), entry('TODAY CLASS', 2), entry('TODAY LATE', 2, '16:00')],
  attendance: [{ id: 'old', groupId: 'group', memberId: 'friend', timetableEntryId: 'YESTERDAY CLASS', date: '2026-10-05', status: 'present' }],
  excuses: [],
}
const translate = (text, vars = {}) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''))
const modules = {
  react: React,
  '../lib/store': { useStore: () => ({ data, processAutoAbsences: async () => {} }) },
  '../lib/i18n': { useLanguage: () => ({ language: 'ko', t: translate }) },
  './StampButton': { CheckInStamp: () => null, StampMark: () => null },
  './ExcuseModal': { default: () => null },
  './MemberHistory': { default: () => null },
  '../lib/currency': { formatMoney: () => '' },
}
function load(path) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: name => modules[name], Date: PreviewDate })
  return exports
}
modules['../lib/time'] = load('../src/lib/time.ts')
modules['../lib/attendanceView'] = load('../src/lib/attendanceView.ts')
const MemberHistory = load('../src/components/MemberHistory.tsx').default
const TodayAttendance = load('../src/components/TodayAttendance.tsx').default

test('today drilldown shows only today’s scheduled classes, including classes not checked in yet', () => {
  const html = renderToStaticMarkup(React.createElement(MemberHistory, { group, member, date: '2026-10-06', onClose() {} }))
  assert.match(html, /TODAY CLASS/)
  assert.match(html, /TODAY LATE/)
  assert.match(html, /체크인 전/)
  assert.match(html, /10월 6일/)
  assert.doesNotMatch(html, /YESTERDAY CLASS|10월 5일/)
})

test('full history remains available by default from the members panel', () => {
  const html = renderToStaticMarkup(React.createElement(MemberHistory, { group, member, onClose() {} }))
  assert.match(html, /YESTERDAY CLASS/)
  assert.match(html, /10월 5일/)
  assert.match(html, /월요일/)
})

test('today team summary displays only today’s two course dots', () => {
  const html = renderToStaticMarkup(React.createElement(TodayAttendance, { group, meId: 'me' }))
  assert.match(html, /우리 팀 오늘 현황/)
  assert.match(html, /title="TODAY CLASS"/)
  assert.match(html, /title="TODAY LATE"/)
  assert.doesNotMatch(html, /YESTERDAY CLASS/)
})

test('already voted request stays visible as awaiting result, not missing/deleted', () => {
  data.excuses = [{ id: 'request', groupId: 'group', memberId: 'friend', attendanceRecordId: 'old',
    status: 'pending', reason: 'VISIBLE REASON', votes: { me: true } }]
  try {
    const html = renderToStaticMarkup(React.createElement(TodayAttendance, { group, meId: 'me' }))
    assert.match(html, /VISIBLE REASON/)
    assert.match(html, /투표 완료 · 결과 대기 중/)
    assert.match(html, /내 투표: 인정/)
    assert.doesNotMatch(html, />반려<\/button>|>인정<\/button>/)
  } finally { data.excuses = [] }
})

test('unvoted request remains actionable for a different member', () => {
  data.excuses = [{ id: 'request', groupId: 'group', memberId: 'friend', attendanceRecordId: 'old',
    status: 'pending', reason: 'ACTIONABLE REASON', votes: { someoneElse: true } }]
  try {
    const html = renderToStaticMarkup(React.createElement(TodayAttendance, { group, meId: 'me' }))
    assert.match(html, /ACTIONABLE REASON/)
    assert.match(html, />반려<\/button>/)
    assert.match(html, />인정<\/button>/)
  } finally { data.excuses = [] }
})

test('today’s finalized request stays visible with its decision', () => {
  data.excuses = [{ id: 'request', groupId: 'group', memberId: 'friend', attendanceRecordId: 'today-record',
    status: 'approved', reason: 'DECIDED REASON', votes: { me: true } }]
  data.attendance.push({ id: 'today-record', groupId: 'group', memberId: 'friend', timetableEntryId: 'TODAY CLASS', date: '2026-10-06', status: 'excused_approved' })
  try {
    const html = renderToStaticMarkup(React.createElement(TodayAttendance, { group, meId: 'me' }))
    assert.match(html, /DECIDED REASON/)
    assert.match(html, /해명 승인됨/)
  } finally { data.excuses = []; data.attendance.pop() }
})

test('my history can request an excuse for yesterday and much older absences', () => {
  data.attendance.push(
    { id: 'yesterday-absent', groupId: 'group', memberId: 'friend', timetableEntryId: 'YESTERDAY CLASS', date: '2026-10-05', status: 'absent' },
    { id: 'old-absent', groupId: 'group', memberId: 'friend', timetableEntryId: 'YESTERDAY CLASS', date: '2026-09-07', status: 'absent' },
  )
  try {
    const html = renderToStaticMarkup(React.createElement(MemberHistory, { group, member, meId: 'friend', onClose() {} }))
    assert.equal((html.match(/>해명하고 투표 요청<\/button>/g) ?? []).length, 2)
    assert.match(html, /9월 7일/)
    assert.match(html, /내 출석 기록/)
    const other = renderToStaticMarkup(React.createElement(MemberHistory, { group, member, meId: 'me', onClose() {} }))
    assert.match(other, /읽기 전용/)
    assert.doesNotMatch(other, /해명하고 투표 요청/)
    const archived = renderToStaticMarkup(React.createElement(MemberHistory, { group: { ...group, archivedAt: '2026-10-06' }, member, meId: 'friend', onClose() {} }))
    assert.doesNotMatch(archived, /해명하고 투표 요청/)
    const former = renderToStaticMarkup(React.createElement(MemberHistory, { group, member: { ...member, leftAt: '2026-10-06' }, meId: 'friend', onClose() {} }))
    assert.doesNotMatch(former, /해명하고 투표 요청/)
  } finally { data.attendance.splice(-2) }
})

test('pending or decided absences cannot create a second request from history', () => {
  const statuses = ['excused_pending', 'excused_approved', 'excused_rejected', 'present']
  data.attendance.push(...statuses.map((status, i) => ({ id: `record-${i}`, groupId: 'group', memberId: 'friend',
    timetableEntryId: 'YESTERDAY CLASS', date: '2026-10-05', status })),
    { id: 'inconsistent', groupId: 'group', memberId: 'friend', timetableEntryId: 'YESTERDAY CLASS', date: '2026-10-05', status: 'absent' })
  data.excuses = [{ attendanceRecordId: 'inconsistent', status: 'pending', votes: {} }]
  try {
    const html = renderToStaticMarkup(React.createElement(MemberHistory, { group, member, meId: 'friend', onClose() {} }))
    assert.doesNotMatch(html, /해명하고 투표 요청/)
    assert.match(html, /해명 투표중/)
    assert.match(html, /해명 승인/)
    assert.match(html, /해명 반려/)
  } finally { data.attendance.splice(-5); data.excuses = [] }
})

test('Tuesday pending votes remain actionable on Wednesday and weeks later even with no classes today', () => {
  data.attendance.push({ id: 'tuesday-record', groupId: 'group', memberId: 'friend', timetableEntryId: 'TODAY CLASS', date: '2026-10-06', status: 'excused_pending' })
  data.excuses = [{ id: 'request', groupId: 'group', memberId: 'friend', attendanceRecordId: 'tuesday-record', status: 'pending', reason: 'TUESDAY PENDING', votes: {} }]
  const originalNow = fixedNow
  try {
    for (const nextDay of [new Date(2026, 9, 7, 15, 13), new Date(2026, 10, 4, 15, 13)]) {
      fixedNow = nextDay
      const html = renderToStaticMarkup(React.createElement(TodayAttendance, { group, meId: 'me' }))
      assert.match(html, /TUESDAY PENDING/)
      assert.match(html, /10월 6일/)
      assert.match(html, />인정<\/button>/)
      assert.match(html, /지난 출석·결석 기록 →/)
      assert.match(html, /오늘은 등록된 내 수업이 없어요/)
    }
  } finally { fixedNow = originalNow; data.excuses = []; data.attendance.pop() }
})

test('excuse form identifies the selected historical class and date', () => {
  const ExcuseModal = load('../src/components/ExcuseModal.tsx').default
  const html = renderToStaticMarkup(React.createElement(ExcuseModal, { record: data.attendance[0], onClose() {} }))
  assert.match(html, /YESTERDAY CLASS/)
  assert.match(html, /10월 5일/)
})
