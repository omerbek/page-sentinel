import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { audit, parseArgs, routeUrl } from '../src/audit.js'

const fixture = fileURLToPath(new URL('./fixture/', import.meta.url))

test('route validation prevents escaping the configured Vite base', () => {
  const base = new URL('http://127.0.0.1:1234/sample/')
  assert.equal(routeUrl('/clean.html?mode=test', base).href, `${base}clean.html?mode=test`)
  for (const route of ['https://other.test/', '//other.test/', '/../../outside', '/\\other.test']) {
    assert.throws(() => routeUrl(route, base))
  }
  assert.deepEqual(parseArgs(['site', '--route', '/clean.html', '--route', '/']), {
    root: 'site', routes: ['/clean.html', '/'], out: undefined, timeout: 15000,
  })
  assert.throws(() => parseArgs(['--timeout', 'NaN']))
})

test('audits built pages in a real browser, retaining route-specific findings', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'vite-route-sentinel-'))
  try {
    const { report } = await audit({
      root: fixture,
      out,
      routes: ['/clean.html', '/'],
      timeout: 15000,
    })
    assert.equal(report.passed, false)
    assert.equal(report.pages[0].status, 200)
    assert.deepEqual(report.pages[0].findings, [])
    assert.equal(report.pages[1].status, 200)
    assert.ok(report.pages[1].findings.some((f) => f.kind === 'asset' && f.message === 'HTML served instead of an asset' && f.url.endsWith('/missing.png')))
    assert.ok(report.pages[1].findings.some((f) => f.kind === 'console' && f.message === 'intentional console error'))
    const persisted = JSON.parse(await readFile(path.join(out, 'report.json'), 'utf8'))
    assert.deepEqual(persisted, report)
    const screenshot = await readFile(path.join(out, report.pages[0].screenshot))
    assert.deepEqual([...screenshot.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  } finally {
    await rm(out, { recursive: true, force: true })
  }
})
