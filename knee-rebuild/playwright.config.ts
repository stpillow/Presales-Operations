import { defineConfig } from '@playwright/test'

/**
 * `npm run e2e`: the smoke test (e2e/session.spec.ts) and the PWA checklist (e2e/pwa.spec.ts, which
 * serves the same dist/ itself so it can stop the server and change sw.js), on a fresh build served
 * by `vite preview`, the way the phone gets it (service worker and manifest included), never the dev
 * server. Not part of `npm run check`: it needs a browser. @playwright/test is pinned to the
 * Playwright whose Chromium is installed (`npx playwright install chromium` on a machine that has none).
 */
const PORT = 4180
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  // One browser, one database per test: the tests write IndexedDB and walk a calendar.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    browserName: 'chromium',
    headless: true,
    // Shawn's phone: an iPhone held upright, in New York.
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Build first, every run: a preview left over from an older build would test the wrong app. The
    // bundle only (`vite build`): the typecheck is `npm run check`'s, and `npm run build` runs both.
    command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
