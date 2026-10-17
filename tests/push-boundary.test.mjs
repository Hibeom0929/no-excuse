import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/NotificationPanel.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText
const exports = {}, states = [], logs = []
vm.runInNewContext(compiled, { exports, require: name => ({
  react: React, './NotificationSettings': { default: () => React.createElement('span', null, 'Notification settings') },
  '../lib/i18n': { useLanguage: () => ({ t: value => value }) },
  '../lib/push': { setPushWorkerState: async (...args) => { states.push(args) } },
})[name], console: { warn: value => logs.push(value) } })

test('notification failure has a local retry screen and leaves attendance siblings usable', () => {
  const child = React.createElement('span', null, 'Notification settings')
  const boundary = new exports.NotificationBoundary({ children: child })
  boundary.state = exports.NotificationBoundary.getDerivedStateFromError(new Error('private failure'))
  boundary.componentDidCatch(new Error('private failure'))
  const fallback = boundary.render()
  const html = renderToStaticMarkup(React.createElement('main', null, fallback,
    React.createElement('button', null, '출석 도장 찍기')))
  assert.match(html, /출석 기능은 계속 사용할 수 있어요/)
  assert.match(html, /다시 시도/)
  assert.match(html, /출석 도장 찍기/)
  assert.doesNotMatch(html, /Notification settings|private failure/)
  assert.deepEqual(states.at(-1), [null, false])
  assert.equal(logs.includes('private failure'), false)
  boundary.setState = update => { boundary.state = { ...boundary.state, ...update } }
  fallback.props.retry()
  assert.equal(boundary.render(), child)
})
test('main app and local preview use the isolated panel, not bare notification settings', () => {
  for (const path of ['../src/App.tsx', './push-preview.tsx']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.match(source, /<NotificationPanel\s*\/>/)
    assert.doesNotMatch(source, /<NotificationSettings\s*\/>/)
  }
})
