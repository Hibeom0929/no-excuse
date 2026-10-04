import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/email.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const exports = {}
vm.runInNewContext(compiled, { exports })
const { validateEmail } = exports

test('catches .comm and .coom before they can be used as separate accounts', () => {
  for (const domain of ['gmail.comm', 'gmail.coom', 'gmail.cmo', 'gmail.ocm']) {
    const result = validateEmail(`student@${domain}`)
    assert.equal(result.valid, false)
    assert.equal(result.suggestion, 'student@gmail.com')
  }
})

test('suggests common provider misspellings without silently changing the address', () => {
  for (const [domain, expected] of [
    ['gmial.com', 'gmail.com'], ['gamil.com', 'gmail.com'],
    ['outlok.com', 'outlook.com'], ['hotmial.com', 'hotmail.com'],
    ['yaho.com', 'yahoo.com'], ['icould.com', 'icloud.com'],
  ]) {
    const result = validateEmail(`student+course@${domain}`)
    assert.equal(result.valid, false)
    assert.equal(result.suggestion, `student+course@${expected}`)
  }
})

test('accepts NUS, other school, and custom domain addresses', () => {
  for (const email of [
    'student@u.nus.edu', 'staff@nus.edu.sg', 'student@school.ac.kr',
    'student@college.edu.au', 'hello@my-custom-domain.dev', 'hello@example.co',
    'student@gmail.com', 'student@naver.com', 'student@proton.me',
  ]) {
    const result = validateEmail(email)
    assert.equal(result.valid, true, email)
    assert.equal(result.email, email)
  }
})

test('rejects malformed addresses in every authentication flow', () => {
  for (const email of [
    '', ' ', 'student', 'student@gmail', '@gmail.com', 'student@@gmail.com',
    'student @gmail.com', 'student@gmail..com', 'student@-gmail.com',
    'student@gmail-.com', '.student@gmail.com', 'student.@gmail.com',
    'stu..dent@gmail.com', 'student@ gmail.com', 'student@gmail.c',
    `${'a'.repeat(65)}@gmail.com`, `student@${'a'.repeat(64)}.com`,
  ]) assert.equal(validateEmail(email).valid, false, email)
})

test('trims surrounding spaces and normalizes domain case while preserving the local part', () => {
  const result = validateEmail('  Student+Class@GMAIL.COM  ')
  assert.equal(result.valid, true)
  assert.equal(result.email, 'Student+Class@gmail.com')
})

test('handles an uppercase typo without suggesting a different mailbox', () => {
  const result = validateEmail(' Student+Class@GMAIL.COOM ')
  assert.equal(result.valid, false)
  assert.equal(result.suggestion, 'Student+Class@gmail.com')
})
