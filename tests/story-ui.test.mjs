import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let initialStories = []
const translate = (text, vars = {}) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''))
const modules = {
  react: { ...React, useState: initial => React.useState(Array.isArray(initial) ? initialStories : initial) },
  'react-dom': { createPortal: () => null },
  '../lib/i18n': { useLanguage: () => ({ language: 'ko', t: translate }) },
  '../lib/supabase': { supabase: {} },
  '../lib/image': { compressImageFile: async () => '' },
}
function load(path) {
  const exports = {}
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(compiled, { exports, require: name => modules[name] })
  return exports
}
modules['../lib/stories'] = load('../src/lib/stories.ts')
const AttendanceStories = load('../src/components/AttendanceStories.tsx').default
const { CheckInStamp } = load('../src/components/StampButton.tsx')
const group = { id: 'g', members: [{ id: 'me', name: '나' }, { id: 'friend', name: '친구' }] }
const records = [{ id: 'a', groupId: 'g', memberId: 'friend', status: 'present' }]
function fixture(overrides = {}) {
  return { id: 'photo', attendanceRecordId: 'a', groupId: 'g', memberId: 'friend',
    createdAt: new Date(Date.now() - 3600000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), ...overrides }
}
const render = (props = {}) => renderToStaticMarkup(React.createElement(AttendanceStories, { group, records, meId: 'me', ...props }))

test('no photos means no story title, empty state, bubble or expiry badge', () => {
  initialStories = []
  assert.equal(render(), '')
  initialStories = [fixture({ expiresAt: new Date(Date.now() - 1).toISOString() })]
  assert.equal(render(), '')
})
test('only members with active photos appear; no public/expiry labels are added', () => {
  initialStories = [fixture()]
  const html = render()
  assert.match(html, /우리 팀의 하루/)
  assert.match(html, /친구의 스토리 1개/)
  assert.doesNotMatch(html, /나의 스토리|24시간 공개|만료|사진 없음/)
})
test('archived groups and cancelled attendance leave no story UI', () => {
  initialStories = [fixture()]
  assert.equal(render({ records: [] }), '')
  assert.equal(render({ group: { ...group, archivedAt: 'archived' } }), '')
  assert.equal(render({ group: { ...group, members: [{ id: 'friend', name: '친구', leftAt: 'left' }] } }), '')
})

test('upload form explains one-day sharing AND private semester retention before upload', () => {
  initialStories = []
  const html = renderToStaticMarkup(React.createElement(CheckInStamp, { requirePhoto: false, onConfirm() {} }))
  assert.match(html, /하루 동안 공유/)
  assert.match(html, /학기 말 정리 전까지 비공개로 보관/)
  assert.doesNotMatch(html, /24시간.*삭제/)
})
