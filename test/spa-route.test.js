import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { audit, parseArgs } from '../src/audit.js'

const fixture = fileURLToPath(new URL('./spa-fixture/', import.meta.url))

test('a missing SPA route fails its own visible-content expectation despite HTTP 200', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'vite-route-sentinel-spa-'))
  try {
    const options = parseArgs([
      fixture,
      '--route', '/', '--expect', 'h1:has-text("Home route")',
      '--route', '/absent', '--expect', 'h1:has-text("Missing route")',
      '--timeout', '3000', '--out', out,
    ])
    const { report } = await audit(options)
    assert.equal(report.passed, false)
    assert.equal(report.pages[0].status, 200)
    assert.deepEqual(report.pages[0].findings, [])
    assert.equal(report.pages[1].status, 200)
    assert.equal(report.pages[1].findings.length, 1)
    assert.equal(report.pages[1].findings[0].kind, 'assertion')
    assert.match(report.pages[1].findings[0].message, /visible element not found/)
  } finally {
    await rm(out, { recursive: true, force: true })
  }
})
