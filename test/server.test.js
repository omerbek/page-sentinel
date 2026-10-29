import assert from 'node:assert/strict'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { request } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { startSite } from '../src/server.js'

function get(server, url, accept = 'text/html') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path: url, headers: { accept } }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => resolve({ status: response.statusCode, body, type: response.headers['content-type'] }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function stop(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

test('only serves visible local files; opt-in SPA fallback applies to documents, not assets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'page-sentinel-server-'))
  try {
    await writeFile(path.join(root, 'index.html'), '<h1>Home</h1>')
    await writeFile(path.join(root, '.secret'), 'private')
    const server = await startSite(root)
    try {
      assert.deepEqual(await get(server, '/'), { status: 200, body: '<h1>Home</h1>', type: 'text/html; charset=utf-8' })
      assert.equal((await get(server, '/absent')).status, 404)
      assert.equal((await get(server, '/.secret')).status, 403)
      assert.equal((await get(server, '/%2e%2e/.secret')).status, 403)
      assert.equal((await get(server, '/%5csecret')).status, 403)
    } finally {
      await stop(server)
    }
    const spa = await startSite(root, { spa: true })
    try {
      assert.deepEqual(await get(spa, '/absent'), { status: 200, body: '<h1>Home</h1>', type: 'text/html; charset=utf-8' })
      assert.equal((await get(spa, '/missing.png', 'image/png')).status, 404)
    } finally {
      await stop(spa)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
