import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function contained(root, file) {
  return file === root || file.startsWith(`${root}${path.sep}`)
}

export async function startSite(root, { spa = false } = {}) {
  const directory = await realpath(root)
  if (!(await stat(directory)).isDirectory()) throw new Error(`Not a directory: ${root}`)
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }
    let segments
    try {
      const pathname = decodeURIComponent(request.url.split(/[?#]/, 1)[0])
      if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0')) {
        throw new Error('Invalid path')
      }
      segments = pathname.split('/').filter(Boolean)
      if (segments.some((segment) => segment === '.' || segment === '..' || segment.startsWith('.'))) {
        throw new Error('Private path')
      }
    } catch {
      response.writeHead(403).end()
      return
    }
    let candidate = path.join(directory, ...segments)
    try {
      let info = await stat(candidate)
      if (info.isDirectory()) {
        candidate = path.join(candidate, 'index.html')
        info = await stat(candidate)
      }
      if (!info.isFile()) throw new Error('Not a regular file')
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) {
        response.writeHead(404).end()
        return
      }
      if (!spa || !request.headers.accept?.includes('text/html')) {
        response.writeHead(404).end()
        return
      }
      candidate = path.join(directory, 'index.html')
    }
    try {
      const file = await realpath(candidate)
      if (!contained(directory, file)) {
        response.writeHead(403).end()
        return
      }
      const info = await stat(file)
      if (!info.isFile()) {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': info.size,
        'X-Content-Type-Options': 'nosniff',
      })
      if (request.method === 'HEAD') response.end()
      else createReadStream(file).on('error', () => response.destroy()).pipe(response)
    } catch {
      response.writeHead(404).end()
    }
  })
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    return server
  } catch (error) {
    server.close()
    throw error
  }
}
