#!/usr/bin/env node
import { audit, parseArgs } from '../src/audit.js'

const usage = `Vite Route Sentinel — smoke-check a built Vite app in Chromium

Usage: vite-route-sentinel [project-directory] [--route /path [--expect selector]...]... [--out directory] [--timeout ms]

Routes are relative to the Vite base path. Default: /.
Each --expect checks for a visible element on the preceding --route.
Reports and screenshots default to <project-directory>/.route-sentinel/.
Exit codes: 0 clean, 1 browser finding, 2 usage/build/browser failure.
Run "npx playwright install chromium" once before the first audit.`

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`${error.message}\n\n${usage}`)
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log(usage)
    return
  }
  try {
    const { report, out } = await audit(options)
    for (const page of report.pages) {
      console.log(`${page.findings.length ? 'FAIL' : 'PASS'} ${page.route} (${page.status ?? 'no response'})`)
      for (const finding of page.findings) {
        console.log(`  ${finding.kind}: ${finding.url}: ${finding.message}`)
      }
    }
    console.log(`Report: ${out}/report.json`)
    if (!report.passed) process.exitCode = 1
  } catch (error) {
    console.error(error.stack ?? String(error))
    process.exitCode = 2
  }
}

await main()
