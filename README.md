# Vite Route Sentinel

Build a local Vite website, open its production preview in Chromium, and check the routes you name. Each route gets a screenshot and a JSON record of navigation, same-origin HTTP errors, failed requests, mis-served assets, and browser console or JavaScript errors. A clean route does not mask a broken one.

This is an original integration of the public APIs of [Vite](https://github.com/vitejs/vite) (MIT) and [Playwright](https://github.com/microsoft/playwright) (Apache-2.0). It does not copy their source, assets, or branding. It targets Node.js developers and CI workflows, not an arbitrary public website crawler.

## Install and run

Requires Node.js `^20.19.0 || >=22.12.0` and a supported Chromium installation:

```sh
npm install
npx playwright install chromium
node bin/sentinel.js path/to/vite-project --route / --route /settings --out path/to/report
```

For a local installation within the target project, `npm install --save-dev vite-route-sentinel` can be used once the package is published to a registry; this repository is currently distributed as source on GitHub. You can also invoke the entry point from an `npm` script. `--route` is repeatable and defaults to `/`. Routes are relative to the Vite `base` path: with `base: '/app/'`, `--route /settings` checks `/app/settings`. `--timeout` sets each navigation and screenshot timeout in milliseconds (default 15000; range 1–120000). `--help` prints the CLI usage.

Unless `--out` is supplied, results are written to `<project>/.route-sentinel/report.json` and numbered screenshots under `screenshots/`. Add that directory to the target project's `.gitignore`; screenshots may contain sensitive on-screen information. Vite's configured production build output is generated or replaced by the usual `vite build` behavior.

```json
{
  "schemaVersion": 1,
  "pages": [
    { "route": "/", "status": 200, "screenshot": "screenshots/001.png", "findings": [] }
  ],
  "passed": true
}
```

Exit status: `0` when every route has no findings, `1` for findings, `2` for an invalid invocation, build error, or browser setup failure. The CLI prints a route-by-route summary and the report path. Requests to hosts other than the loopback preview origin are blocked; service workers are disabled for repeatable local checks. Third-party dependencies can consequently cause browser console errors, which are reported rather than hidden.

**Scope:** This checks only the routes explicitly named. Vite may serve a missing SPA route with HTTP 200; it cannot prove that a client-side route exists. The audit also detects images that fail to decode and HTML sent instead of an image, script, stylesheet or font, including SPA fallback responses. It does not log in, click through a page, wait for asynchronous work after the load event, or validate remote APIs. The route's own JavaScript can still modify page state; only run trusted local Vite projects.

## Develop

```sh
npm ci
npx playwright install chromium
npm run check
npm test
node bin/sentinel.js test/fixture --route /clean.html --route /
```

The integration test exercises a built Vite fixture and a real Chromium browser, including a healthy route and a broken image returned as a 200 HTML fallback. CI installs Chromium before running it.
