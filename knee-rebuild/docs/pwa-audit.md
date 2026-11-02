# PWA audit (M6)

Nov 2, 2026, on `claude/epic-meitner-0dmkbq` at `bf41382` (the Program screen included) plus this audit's two changes to `vite.config.ts` (findings 1 and 8). Two halves, as `docs/m6-brief.md` section 4 asks: Lighthouse 11 for the PWA, performance and accessibility categories, and a manual checklist for what Lighthouse 12 dropped. The checklist is automated in `e2e/pwa.spec.ts`, so it runs again with every `npm run e2e`.

## How it was run

```bash
npm run build && npx vite preview --host 127.0.0.1 --port 4181 &
npx lighthouse@11 http://127.0.0.1:4181/ \
  --chrome-path=/opt/pw-browsers/chromium --chrome-flags="--headless=new --no-sandbox" \
  --only-categories=pwa,performance,accessibility --form-factor=mobile --view
npm run e2e        # the manual checklist (e2e/pwa.spec.ts) and the smoke test (e2e/session.spec.ts)
```

Lighthouse 11.7.1, Chromium 1243 headless, mobile form factor with Lighthouse's simulated throttling (slow 4G, 4x CPU), storage cleared before each run, so every number is a first visit. Each screen was audited by its hash route (`#/week`, `#/settings`, ...). The Session runner needs a session in storage, so it was audited from a Chromium profile with Session A started and two sets logged, with `--disable-storage-reset`.

## Lighthouse

| Category | Score | What it says |
|---|---|---|
| PWA | 100 | Installable manifest, splash screen, themed address bar, content sized to the viewport, viewport meta, maskable icon: all pass. Lighthouse's three manual items are answered under the checklist. |
| Accessibility | 100 on every screen | Today, Week, Progress, Gates, More, Morning check, Log a run, Where you train, New location, For the next program update, Program, Settings, and the Session runner mid-session. One experimental, unweighted audit flags the runner's slot list (finding 5). |
| Performance | 86, 86, 86 (three runs) | FCP 2.1 to 2.6 s, LCP 3.5 to 3.6 s, TBT 110 to 150 ms, CLS 0, Speed Index 2.1 to 2.6 s, 375 KiB transferred. The same runs before the Program screen landed read 87 to 89 with LCP 3.3 to 3.5 s. Findings 2 to 4. |

Re-checked by a second reviewer on a fresh build after finding 8's fix: Today read PWA 100, accessibility 100, performance 85 (LCP 3.5 s); the Program screen read PWA 100, accessibility 100, performance 86 (LCP 3.7 s). The one-point drop on Today is run-to-run noise in the simulated throttle, not a change.

## Manual checklist

Each row is a test in `e2e/pwa.spec.ts`, run on a pinned clock (Tuesday of week 2), so the screens don't depend on the day the suite runs. They serve `dist/` from their own small server with `vercel.json`'s headers (the content security policy included), so they can take the network away for real and change `sw.js` the way a deploy does. Every test also fails on any script error or console error, which is where a CSP refusal shows up.

| Item | How | Result |
|---|---|---|
| Manifest: id, start URL and scope `/`, name, short name, `standalone`, theme and background `#001A57` matching the `theme-color` meta | Read from the linked manifest; the id also as Chromium parses it | Pass after finding 8's fix |
| Chromium's own verdict | `Page.getAppManifest` errors and `Page.getInstallabilityErrors` over CDP | Pass: none of either |
| Icons 192 and 512 (`any`) and 512 `maskable`, plus iOS's 180 px apple-touch-icon | Each decoded in the page at its stated size | Pass. By eye, the maskable icon's KR monogram sits inside the central safe circle (its corners about 127 px from the centre against a 205 px radius) on a full-bleed navy ground |
| The precache | `sw.js` read: each file once, the page, both scripts, the stylesheet, all three font families, every icon and the manifest in it | Pass after finding 1's fix; the test fails on the old config |
| The service worker controls the page | First visit, wait for the worker to activate, reload: `navigator.serviceWorker.controller` is `/sw.js` | Pass |
| Every screen offline after a reload | Server stopped and the context offline; each of the 13 routes (the 11 a tab or More opens, plus New location and the Planet Fitness editor), opened and reloaded, screen title shown and storage read, still controlled; then every tab in the tab bar tapped; then program.md's two charts on the Program screen decoded | Pass, no request failed |
| The Session runner offline | Server stopped and the context offline on Tuesday of week 2: Start Session A, pick a load, rate pain, log set 1, reload (iOS dropping the page while the screen is locked); the runner reopens on the same `#/session/<id>` with set 2 of 3 next at the logged load | Pass, no request failed |
| Fonts offline | `document.fonts` after the offline reloads | Pass: Fraunces Variable, IBM Plex Sans and IBM Plex Mono loaded from the cache |
| Under the production CSP | Every check above | Pass: no console error, no refusal |
| The update prompt | A byte-different `sw.js` served, the app reopened: "A new version is ready. It will not reload on its own." shows with Reload now; three seconds on, the same page is still there and the new worker still waits; Reload now reloads once and nothing waits after | Pass |
| Lighthouse's "works across browsers" | Chromium here; iOS Safari standalone is the target | Shawn's phone check (below) |
| Lighthouse's "page transitions don't feel like they block on the network" | Hash routes render from memory; one document, nothing fetched on a tap | Pass |
| Lighthouse's "each page has a URL" | Every screen has a hash route (`#/week`, `#/session/<id>`); the offline test reloads each one into the same screen | Pass |

## Findings

| # | Finding | Verdict | Status |
|---|---|---|---|
| 1 | The precache listed six files twice: the icons and the manifest, once from `includeAssets` and the plugin's manifest icons, again from `globPatterns` (23 entries for 17 files). Workbox accepts a repeat with the same revision, so nothing broke, but the service worker's list said 23 files where the build had 17 | Real, low | Fixed in `vite.config.ts`: `includeAssets` dropped and `includeManifestIcons: false`, since `globPatterns` already takes every PNG from `public/`, and `webmanifest` out of `globPatterns`, since the plugin adds the manifest itself. Test first: "the precache lists each file once" |
| 2 | First-visit LCP 3.5 s on simulated slow 4G. The entry chunk (114 KB gzipped) runs before it imports `App.tsx` (127 KB), so the two download one after the other, and the fonts are found only when the first screen renders | Real, first visit only | Tried, before the Program screen landed: a `modulepreload` for the App chunk from `index.html` (a small plugin in `vite.config.ts`). LCP moved 3.4 to 3.3 s and FCP no better across three runs each way, so it was not kept. Accepted: after the first visit everything is served from the precache, and the first visit happens once |
| 3 | About 139 KiB of unused JavaScript on Today: `App.tsx` imports every screen, and since the Program screen the App chunk also carries program.md's text and its reference renderer | Real, first visit only | Logged for the owners of `src/App.tsx` and `src/screens/Program.tsx`: `lazy()` per route, or a lazy `Reference`, would trim the first paint. It saves nothing after install, because the precache downloads every chunk anyway. Not in this builder's files |
| 4 | The stylesheet blocks rendering for about 110 ms (4.7 KB gzipped) | Accepted | The first paint needs it; inlining it would repeat it in every load of `index.html` |
| 5 | `label-content-name-mismatch` (experimental, weight 0) on the Session runner's slot list: each slot's button is named by an `aria-label` ("Slot 2: Seated leg curl") that leaves out the prescription and cue its text shows, so a voice-control "tap 3 × 12–15" would not find it | Real, low (Shawn taps) | Logged for the owner of `src/screens/session/SlotList.tsx`: start the label with the visible text, or let the text be the name and add the status as visually hidden text |
| 6 | Lighthouse 11 is older than the Chromium it drives: its LCP-element and layout-shift-element gatherers error ("RootCauses ... frame_sequence") | Tooling | Accepted: those two are informational; every scored audit ran |
| 7 | `uses-long-cache-ttl` finds no cached resources | Not an app issue | `vite preview` sends no cache headers. Repeat visits are served by the service worker, not the HTTP cache |
| 8 | The manifest has no `id` | Real, low | Fixed in `vite.config.ts`: `id: '/'`, which resolves to the id Chromium already took from `start_url`, so nothing installed changes and a later `start_url` can't fork the home-screen app. Test first: the manifest check asserts the id and Chromium's parsed id |
| 9 | When a deploy shows | Behavior, as designed | The browser looks for a new `sw.js` when the app is opened (a navigation), not when it returns from the background, so on the phone a deploy's prompt appears at the next launch from the home screen, never mid-set. Part of Shawn's phone check |

## Size

The precache after finding 1: 19 entries, 1133 KiB. The entry chunk is 397 KB (114 KB gzipped), the App chunk 422 KB (127 KB gzipped), the stylesheet 18 KB, the six WOFF2 faces 168 KB, program.md's two charts 123 KB; the icons, Workbox's window script, the page and the manifest make up the rest. The WOFF fallbacks are not precached: every browser that runs the app takes WOFF2 first.

## Still for the phone (M6's done criterion, Shawn)

Install from Safari to the home screen, open it once, turn on airplane mode, and open every tab; log a full Session B on cellular with the screen locked between sets; after the next deploy, check that the prompt shows at launch and Reload now brings the new version in.
