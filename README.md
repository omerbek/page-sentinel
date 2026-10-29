# Page Sentinel

Audit a **built static website directory** in Chromium. For each route you name, Page Sentinel saves a screenshot and a JSON report with document status, same-origin HTTP errors, failed requests, mis-served assets, browser console errors, JavaScript exceptions and missing visible content. A healthy route cannot hide another route's findings.

The tool uses Node.js's built-in loopback HTTP server and the [Playwright](https://github.com/microsoft/playwright) browser library (Apache-2.0). No third-party build system is required. Source is original; it does not vendor browser or server source.

## Install and run

Requires Node.js `^20.19.0 || >=22.12.0` and Chromium:

```sh
npm ci
npx playwright install chromium
node bin/sentinel.js path/to/built-site --route / --expect 'h1:has-text("Home")' --route /settings.html --expect '[data-testid="settings"]' --out path/to/report
```

Supply the directory **after** building your site with your own workflow; this tool neither modifies that directory nor runs project build scripts. The checked-in `test/spa-fixture` directory is a small ready-to-run example. `--route` is repeatable and defaults to `/`. Each `--expect` belongs to the preceding route and requires a visible element; repeat it for multiple conditions. `--timeout` sets navigation, selector and screenshot timeouts in milliseconds (default 15000; range 1–120000). `--help` prints usage.

By default, a missing file responds with HTTP 404. For a static single-page app, add `--spa`: missing **document** requests receive `index.html` and status 200. In that mode, use a route-specific `--expect` to distinguish a valid page from a home-page fallback. Missing images, scripts, stylesheets and fonts do not use this fallback. A genuine 200 response containing the wrong content produces an `assertion` finding.

Unless `--out` is supplied, results go to `<static-directory>/.page-sentinel/report.json` with numbered screenshots under `screenshots/`. Keep screenshots out of version control: they may contain sensitive page content.

```json
{
  "schemaVersion": 1,
  "pages": [
    { "route": "/", "status": 200, "screenshot": "screenshots/001.png", "findings": [] }
  ],
  "passed": true
}
```

Exit status: `0` for clean routes, `1` for browser findings, `2` for invalid invocation, site access or browser setup errors. The server binds only to `127.0.0.1`, refuses private paths and symlinks outside the supplied directory, blocks third-party browser requests and disables service workers. External dependencies may consequently raise browser console errors; these are recorded, not hidden. **Only audit trusted local sites:** page JavaScript runs in the browser. The tool checks only explicit routes; it does not authenticate, click through a UI, run a dynamic backend, wait for unrelated asynchronous work after load, or validate remote APIs.

## Develop

```sh
npm ci
npx playwright install chromium
npm run check
npm test
node bin/sentinel.js test/spa-fixture --spa --route /absent --expect 'h1:has-text("Missing route")' --timeout 3000
```

The tests launch real Chromium for a healthy page, broken asset and missing single-page route. The loopback server tests also check private paths and fallback rules. CI installs Chromium before testing.
