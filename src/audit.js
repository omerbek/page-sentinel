import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { startSite } from './server.js'

export function routeUrl(route, baseUrl) {
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('\\')) {
    throw new Error(`Route must be a local path starting with one slash: ${route}`)
  }
  let decoded
  try {
    decoded = decodeURIComponent(route.split(/[?#]/, 1)[0])
  } catch {
    throw new Error(`Invalid route encoding: ${route}`)
  }
  if (decoded.includes('\\') || decoded.includes('\0') ||
    decoded.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Route escapes the local site: ${route}`)
  }
  const url = new URL(route, baseUrl)
  if (url.origin !== baseUrl.origin) throw new Error(`Route escapes the local site: ${route}`)
  return url
}

export function parseArgs(argv) {
  const options = { root: '.', routes: [], expected: [], spa: false, out: undefined, timeout: 15000 }
  let rootSet = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') return { help: true }
    if (arg === '--spa') {
      options.spa = true
      continue
    }
    if (arg === '--route' || arg === '--expect' || arg === '--out' || arg === '--timeout') {
      const value = argv[++i]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      if (arg === '--route') {
        options.routes.push(value)
        options.expected.push([])
      }
      if (arg === '--expect') {
        if (!options.routes.length) throw new Error('--expect must follow --route')
        options.expected.at(-1).push(value)
      }
      if (arg === '--out') options.out = value
      if (arg === '--timeout') {
        const n = Number(value)
        if (!Number.isSafeInteger(n) || n < 1 || n > 120000) {
          throw new Error('--timeout must be an integer between 1 and 120000 ms')
        }
        options.timeout = n
      }
    } else if (!arg.startsWith('-') && !rootSet) {
      options.root = arg
      rootSet = true
    } else {
      throw new Error(`Unexpected argument: ${arg}`)
    }
  }
  if (!options.routes.length) {
    options.routes.push('/')
    options.expected.push([])
  }
  const validationBase = new URL('http://127.0.0.1:1/')
  for (const route of options.routes) routeUrl(route, validationBase)
  return options
}

function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

export async function audit(options, deps = { chromium }) {
  const root = path.resolve(options.root)
  const out = path.resolve(options.out ?? path.join(root, '.page-sentinel'))
  let server
  let browser
  try {
    server = await startSite(root, { spa: options.spa })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Local site did not bind a TCP port')
    const baseUrl = new URL(`http://127.0.0.1:${address.port}/`)
    const urls = options.routes.map((route) => routeUrl(route, baseUrl))
    browser = await deps.chromium.launch()
    const context = await browser.newContext({ serviceWorkers: 'block' })
    // Never let a local audit unexpectedly send app requests to third-party hosts.
    await context.route('**/*', (route) => {
      const url = route.request().url()
      if (sameOrigin(url, baseUrl.origin) || url.startsWith('data:') || url.startsWith('blob:')) {
        return route.continue()
      }
      return route.abort('blockedbyclient')
    })
    const pages = []
    await mkdir(path.join(out, 'screenshots'), { recursive: true })
    for (const [index, url] of urls.entries()) {
      const page = await context.newPage()
      const findings = []
      const seen = new Set()
      const add = (kind, resource, message) => {
        const key = JSON.stringify([kind, resource, message])
        if (!seen.has(key)) {
          seen.add(key)
          findings.push({ kind, url: resource, message })
        }
      }
      page.on('console', (message) => {
        if (message.type() === 'error') add('console', url.href, message.text())
      })
      page.on('pageerror', (error) => add('pageerror', url.href, error.message))
      page.on('response', (response) => {
        if (!sameOrigin(response.url(), baseUrl.origin)) return
        if (response.status() >= 400) {
          add('http', response.url(), `HTTP ${response.status()}`)
        } else if (
          ['image', 'script', 'stylesheet', 'font'].includes(response.request().resourceType()) &&
          /^text\/html\b/i.test(response.headers()['content-type'] ?? '')
        ) {
          add('asset', response.url(), 'HTML served instead of an asset')
        }
      })
      page.on('requestfailed', (request) => {
        if (sameOrigin(request.url(), baseUrl.origin)) {
          add('request', request.url(), request.failure()?.errorText ?? 'Request failed')
        }
      })
      const screenshot = `screenshots/${String(index + 1).padStart(3, '0')}.png`
      let screenshotPath = null
      let status = null
      try {
        const response = await page.goto(url.href, {
          waitUntil: 'load',
          timeout: options.timeout,
        })
        status = response?.status() ?? null
        if (!response) add('navigation', url.href, 'Navigation returned no document')
        if (page.url() !== url.href && !sameOrigin(page.url(), baseUrl.origin)) {
          add('navigation', url.href, 'Redirected outside the local site')
        }
        const brokenImages = await page.locator('img').evaluateAll((images) =>
          images.filter((image) => image.complete && image.naturalWidth === 0)
            .map((image) => image.currentSrc || image.src),
        )
        for (const image of brokenImages) {
          if (sameOrigin(image, baseUrl.origin) &&
            !findings.some((finding) => finding.kind === 'asset' && finding.url === image)) {
            add('asset', image, 'Image did not decode')
          }
        }
        for (const selector of options.expected?.[index] ?? []) {
          try {
            await page.locator(selector).first().waitFor({
              state: 'visible',
              timeout: options.timeout,
            })
          } catch {
            add('assertion', url.href, `visible element not found: ${selector}`)
          }
        }
        await page.screenshot({ path: path.join(out, screenshot), timeout: options.timeout })
        screenshotPath = screenshot
      } catch (error) {
        add('navigation', url.href, error.message)
      } finally {
        await page.close()
      }
      pages.push({ route: options.routes[index], status, screenshot: screenshotPath, findings })
    }
    await context.close()
    const report = { schemaVersion: 1, pages, passed: pages.every((page) => !page.findings.length) }
    await writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    return { report, out }
  } finally {
    if (browser) await browser.close()
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
  }
}
