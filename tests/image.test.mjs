import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/image.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
function compressor({ noCanvas, oversized, unsupported, failRead } = {}) {
  const calls = []
  class Reader {
    readAsDataURL() { this.result = 'data:image/jpeg;base64,ORIGINAL'; if (failRead) this.onerror(); else this.onload() }
    error = new Error('read failed')
  }
  class Image {
    width = 4000; height = 3000
    set src(value) { this.onload() }
  }
  const canvas = { width: 0, height: 0,
    getContext: () => noCanvas ? null : { fillStyle: '', fillRect() {}, drawImage() {} },
    toDataURL(type, quality) {
      calls.push({ width: canvas.width, height: canvas.height, quality })
      return `data:image/${unsupported ? 'png' : 'jpeg'};base64,` + 'AAAA'.repeat(oversized ? 80000 : 10)
    },
  }
  const exports = {}
  vm.runInNewContext(compiled, { exports, FileReader: Reader, Image, document: { createElement: () => canvas } })
  return { compress: exports.compressImageFile, calls }
}
test('camera photos resize before upload and remain valid JPEG', async () => {
  const c = compressor()
  assert.match(await c.compress({}), /^data:image\/jpeg;base64,/)
  assert.equal(c.calls[0].width, 640)
  assert.equal(c.calls[0].height, 480)
})
test('missing canvas never falls back to uploading the original image', async () => {
  await assert.rejects(compressor({ noCanvas: true }).compress({}), /사진을 처리/)
})
test('oversized images reduce dimensions and fail safely if they cannot fit 200KB', async () => {
  const c = compressor({ oversized: true })
  await assert.rejects(c.compress({}), /200KB/)
  assert.equal(c.calls.length, 6)
  assert.ok(c.calls[5].width < c.calls[0].width)
})
test('unsupported encoders and file-read errors are surfaced, not stamped as success', async () => {
  await assert.rejects(compressor({ unsupported: true }).compress({}))
  await assert.rejects(compressor({ failRead: true }).compress({}), /read failed/)
})
