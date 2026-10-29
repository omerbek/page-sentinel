#!/usr/bin/env node
import { audit, parseArgs } from '../src/audit.js'

const usage = `Page Sentinel — audit a built static site in Chromium

Usage: page-sentinel [static-directory] [--route /path [--expect selector]...]... [--spa] [--out directory] [--timeout ms]

Routes start at the site root. Default: /.
--spa serves index.html for missing document paths; other missing files return 404.
Each --expect checks for a visible element on the preceding --route.
Reports and screenshots default to <static-directory>/.page-sentinel/.
Exit codes: 0 clean, 1 browser finding, 2 usage/site/browser failure.
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
