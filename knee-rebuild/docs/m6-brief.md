# M6 brief: hardening

Read this, then `PROMPT.md` sections 2, 3 (Settings), 5 (the Program and Settings rows) and 6 (M6), `CLAUDE.md`, and `docs/m3-brief.md` (its non-negotiables apply unchanged: logic only in `src/rules`, no meaning by color alone, 44 px targets, no trapping modals, spdc tokens only, writes through `src/db/repo.ts`, reads through `src/db/hooks.ts`, `useToday()`, no silent async failures, strict TypeScript, oxlint clean, helpers tested). `docs/review-plan.md`'s failure-point table names what M6 has to close: iOS storage eviction, export and import, the service worker.

Done when export, wipe, import restores everything (a test proves it byte for byte), and a full Session B gets logged on cellular with the screen locked between sets (Shawn's phone check; the app's part is the smoke test and the audit).

## 1. Program screen (`#/program`)

- **This phase**: the current phase's three sessions (from `templateFor` and `slotsForPhaseWeek` for this week), each slot's label, exercise, prescription text verbatim, cues, and substitutions in order, read-only by default.
- **Editor**: per slot, edit the cues (add, reword, remove, reorder; plain text, 1 to 200 characters each) and the substitutions (reorder, remove, or add an exercise from the catalog; never a new exercise, and never the slot's own exercise). Edits are overrides stored in Dexie version 4, table `programOverrides: 'slotId'` (`{ slotId, cues?, substitutionIds?, editedOn }`), additive, no v3 row rewritten. "Back to program.md's" clears a slot's override. Every edited slot says "Edited" in words next to its label.
- **The engine** reads the effective slot: a pure `src/rules/overrides.ts` `applyOverrides(slot, override)` with tests; `planSession` applies it before routing and prescribing. Substitution edits change routing and back-off order (question 49) exactly as if program.md had said so. Seed slots are never written.
- **Reference**: program.md rendered as reference, from `docs/program.md` imported `?raw` and parsed by a small pure function into headings, paragraphs, lists and tables rendered as React elements (no HTML strings, no `dangerouslySetInnerHTML`, no new dependency); the chart images (`docs/media`) imported as assets. A contents list jumps to each heading.

## 2. Export, import, reset (Settings)

- **Export**: one versioned JSON file, `knee-rebuild-YYYY-MM-DD.json`: `{ app: 'knee-rebuild', schemaVersion, exportedAt, settings, workouts, setLogs, morningChecks, runs, gateTests, sessionMoves, locations, programOverrides }`. On iOS, offer the share sheet (`navigator.share` with a File) where it exists, else a download link. Settings gains `lastExportedAt`; Settings shows "Last export: 9 days ago", and Today shows one quiet line "No export in 9 days" once it passes 7 days (iOS can evict storage; review-plan).
- **Import**: a file picker for `.json`. Parse the whole file with strict Zod schemas before touching Dexie; refuse a newer `schemaVersion` or another app's file in words; show what it holds ("312 sets, 41 runs, 3 gyms, from Nov 2 to Dec 20") and an inline confirm ("Replace everything on this phone with this file?"); then clear and write every table in one transaction, all or nothing. Older versions migrate forward through pure functions with tests.
- **Reset** and **clearing the red flag** exist from M3; check they cover the new tables (locations re-seed through `ensureLocations`, overrides cleared, `lastExportedAt` cleared).
- **The round-trip test**: with fake-indexeddb, seed a realistic history (every table, every M4b field), export, reset, import, export again: the two exports are equal apart from `exportedAt`.

## 3. Smoke test

One Playwright test in the repo (`e2e/session.spec.ts`, script `npm run e2e`): build, serve the preview, Session A start to finish at week 1 (load picks, pain ratings, one swap, Finish), then the morning check, then Session A at week 2 shows the progressed load. `@playwright/test` pinned to the preinstalled Playwright's version; launch with `executablePath: '/opt/pw-browsers/chromium'` if the versions differ. Not part of `npm run check` (it needs a browser); documented in CLAUDE.md's commands.

## 4. PWA audit

Lighthouse 12 dropped the PWA category, so the audit runs Lighthouse 11 (`npx lighthouse@11` against the preview, Chromium at `/opt/pw-browsers/chromium`, headless, mobile) for the PWA category plus performance and accessibility, and a manual checklist for what Lighthouse no longer checks: installable manifest (name, icons 192 and 512, maskable, standalone, theme color), the service worker controlling the page, the app shell and fonts served offline (Playwright: load, go offline, reload, every tab renders), the update prompt. Results and any fixes in `docs/pwa-audit.md`.

## 5. File ownership for parallel builders

| Builder | Files |
|---|---|
| Program | `src/screens/Program.tsx`, `Program.helpers.ts(+test)`, `src/screens/program/*`, `src/rules/overrides.ts(+test)`, `src/rules/markdown.ts(+test)`, Dexie v4 and its repo/hooks additions for overrides, `planSession`'s override wiring |
| Backup | `src/rules/backup.ts(+test)` (the export shape, version checks, summaries, migrations), `src/db/backup.ts(+test)` (read all, replace all in one transaction), Settings' export and import sections, Today's export line, `Settings.lastExportedAt` |
| Smoke and audit | `e2e/*`, `playwright.config.ts`, `package.json` scripts and the dev dependency, `docs/pwa-audit.md`, fixes the audit calls for in `vite.config.ts` or `public/` |

The Program builder lands Dexie v4 first; the Backup builder's export includes `programOverrides` once it exists and its tests seed it.
