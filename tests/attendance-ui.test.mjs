import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const fixedNow = new Date(2026, 9, 6, 15, 13)
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
