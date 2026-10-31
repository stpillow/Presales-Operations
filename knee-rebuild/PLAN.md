# Knee Rebuild: Plan

The status page. Ticked when done, not when started. Questions about the program live in [PROGRAM-QUESTIONS.md](PROGRAM-QUESTIONS.md); the questions for Shawn before M1 are at the bottom.

**Now:** M0 is built and pushed as a draft PR; waiting on the preview deploy check and Shawn's phone test. M1 waits on the section 9 answers.
**Last updated:** Oct 31, 2026

## Milestones

### M0 · Scaffold
Done when the app installs to an iPhone home screen and loads in airplane mode after one visit.

- [x] Repo layout: `knee-rebuild/` with `PROMPT.md`, `docs/program.md`, `PLAN.md`, `PROGRAM-QUESTIONS.md`
- [x] Vite 8 + React 19 + TypeScript strict + Tailwind 4, with the spdc tokens and only those colors as utilities
- [x] vite-plugin-pwa: offline-first service worker, manifest, icons, iOS home-screen meta
- [x] Dexie with an empty schema (`src/db/db.ts`)
- [x] Vitest wired, one smoke test
- [x] `CLAUDE.md` for the app (stack, commands, layout, glossary, the two non-negotiable rules)
- [x] Vercel project with a preview deploy on every push, builds skipped when `knee-rebuild/` is untouched
- [ ] Shawn: add to the home screen, reload in airplane mode, say go

### M1 · Seed data
Done when the schema validates, the script output matches program.md on a spot check of all three phases, and PROGRAM-QUESTIONS.md lists anything ambiguous.

- [ ] Zod schemas for every section 3 entity in `src/schema/`, plus the model additions from PROGRAM-QUESTIONS (week range, optional, `stage` rule, distanceYards, rpeTargetEnd)
- [ ] Exercise catalog: id, name, pattern, equipment, loadType, increment, unilateral
- [ ] `data/program.json`: phases 1–4, gates 1–3, the nine templates, every slot's cues and ordered substitutions
- [ ] Mileage plan for 12 weeks, the red-flag list, the warm-up and pre-run checklists
- [ ] `npm run program -- --week 5 --session B` prints a session, deload-aware
- [ ] Spot-check A, B and C once per phase against program.md
- [ ] Refresh PROGRAM-QUESTIONS.md with anything new

### M2 · Rules engine
Done when tests are green and no rule lives outside `src/rules/`.

- [ ] `calendar`: week and day from startDate in America/New_York, deload weeks, the scheduled session per date, move-session
- [ ] `reading`: session reading, morning reading, combined reading, the 36-hour unknown-is-hold rule
- [ ] `prescription`: next prescription per exercise and side for every progression rule; back-off; deload sets; the dumbbell cap
- [ ] `unilateral`: injured-first rep budget, symmetry percent
- [ ] `mileage`: weekly target, the hold cap, the long-run split, swaps
- [ ] `gates`: auto and manual items, hop-test best of three, pass logic, confirm-to-advance
- [ ] `redFlags`: red-flag state and clearing with a note
- [ ] Vitest for every rule, plus the six worked examples as named tests
- [ ] A guard test that fails if decision logic appears outside `src/rules/`

### M3 · The daily loop
Done when Shawn can run Session A on his phone end to end, do a morning check, and watch the next Session A's prescriptions change according to the reading.

- [ ] Dexie schema v1 (settings, workouts, setLogs, morningChecks, runs, gateTests) and seed on first run
- [ ] App shell: bottom tab bar (Today, Week, Progress, Gates, More), 44 px targets, every state carries a word or shape
- [ ] Today: scheduled session, phase and week, deload badge, yesterday's reading in words, one Start button; red-flag takeover
- [ ] Session runner: slots with cues, steppers prefilled from the engine, side toggle with the rep budget, supersets, rest timer, Swap, Stop this exercise, Finish with max pain and a summary
- [ ] Morning check: four taps, pain-change stepper, red-flag checklist, note; save shows the reading and what changes next
- [ ] Settings basics: injured side, start date, dumbbell max, rest timer, pain per set or per exercise
- [ ] Shawn runs Session A end to end on the phone; the next Session A reflects the reading

### M4 · Running
Done when three logged runs show against the week's target and a hold reading caps the following week.

- [ ] Run logger: type, miles, minutes, effort, max pain, strides and tempo toggles, Strava link; week miles against target as you type
- [ ] Week screen: seven-day strip with readings in words, deload badge, miles against target, move-session
- [ ] The hold cap applied to next week's target
- [ ] Three logged runs show against the target; a hold reading caps the following week

### M5 · Gates and progress
Done when gate 1 evaluates from logged data alone and the hop-test symmetry matches the worked example.

- [ ] Gates screen: live auto items, manual toggles, Advance phase enabled only when every item passes, with a confirm step
- [ ] Hop-test entry: three trials per side, best kept, symmetry shown
- [ ] Progress: load over time per exercise (one chart at a time), symmetry over time, weekly miles against plan, consecutive clean days
- [ ] Gate 1 evaluates from logged data alone; the hop-test symmetry matches the worked example

### M6 · Hardening
Done when export, wipe, import restores everything, and a full Session B gets logged on cellular with the screen locked between sets.

- [ ] Program screen: read-only phase view, cue and substitution editor, program.md rendered as reference
- [ ] Export JSON, import JSON, reset all data, clear the red-flag state with a note
- [ ] Playwright smoke test for the Session runner
- [ ] Lighthouse PWA audit
- [ ] Offline QA at the gym: a full Session B on cellular with the screen locked between sets
- [ ] Export, wipe, import restores everything

**Definition of done for v1:** Shawn runs week 1 of the program entirely from the app, on his phone, with morning check-ins deciding the loads for week 2.

## Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-10-31 | The app lives in `knee-rebuild/` inside Presales-Operations, not in its own repo | This session can only push to this repo. `git subtree split --prefix=knee-rebuild` moves it out later with history intact. Shawn to confirm or ask for the split. |
| 2026-10-31 | Vercel project `knee-rebuild` in the SPDC team, root directory `knee-rebuild`, framework Vite, builds skipped when the folder didn't change | Preview on every push, production from `main`, and pushes to the skills library don't burn builds |
| 2026-10-31 | The project's first deployment was assigned to production (knee-rebuild.vercel.app) because none existed; later pushes on the M0 branch deploy as previews | Vercel's first-deploy behavior, not a misconfiguration. `main` takes over production once M0 merges. Nothing to do. |
| 2026-10-31 | Vercel Authentication turned off on the `knee-rebuild` project | The team default protects every deployment behind a Vercel login, which would bounce a home-screen PWA to vercel.com and break the airplane-mode test. The app keeps no server data and PROMPT section 2 says no accounts, no auth. Shawn can turn it back on in the Vercel dashboard if he wants the URL gated. |
| 2026-10-31 | spdc-design applied (the skill is installed here) | PROMPT section 2 says use it if present. Tokens live in `src/index.css`; Tailwind's default palette, radii, fonts and sizes are cleared so only the spdc scales exist as utilities. Colorblind rule still governs: no meaning by color alone. |
| 2026-10-31 | Fonts vendored through fontsource (OFL) and precached | The PWA has to render offline with no runtime fetches; Google Fonts would be an external call |
| 2026-10-31 | `package-lock.json` committed for the app | Reproducible Vercel builds. The root `.gitignore` excludes lockfiles; `knee-rebuild/.gitignore` re-includes this one |
| 2026-10-31 | Service worker updates on prompt, not auto-reload | A deploy landing mid-set must never reload the page; the app shows "Update ready" and waits |
| 2026-10-31 | TypeScript 7 and oxlint, as create-vite ships them | typescript-eslint doesn't support TS 7 yet; oxlint is zero-config and small |
| 2026-10-31 | Model additions rather than content changes: week-banded slots, optional slots, a `stage` progression rule, `distanceYards`, `rpeTargetEnd` | Working agreement 6 |
| 2026-10-31 | Two consecutive hold readings on one exercise escalate to back-off | program.md's "two off sessions in a row" row; the conservative reading. Built in M2 unless Shawn overrules (PROGRAM-QUESTIONS 4) |
| 2026-10-31 | Section 9 answers | Pending; asked in the first reply |

## Program questions

The full list with the reading taken for each is in [PROGRAM-QUESTIONS.md](PROGRAM-QUESTIONS.md). The ones that want an answer from Shawn, by number there:

- 1 · Mileage plan read from the chart: 10, 11, 12, 9, 13, 14, 15, 11, 16, 17, 18, 14
- 2 · Step-up: load climbs to 20 lb first, then height rises 2 in. at a time, then load again
- 3 · Leg extension: range to the phase's stop first, then load
- 4 · Two holds in a row on one exercise read as back-off
- 5 · Stiffness past 30 minutes reads hold, not clean
- 6 · Morning back-off: next run defaults to elliptical, lower-body slots back off; does "Phase 1 loads" override ×0.75?
- 8 · A new slot in a deload week starts at its lightest version
- 9 · Loads past the dumbbell cap turn into the next substitution
- 11 · Phase 2's "new" B6 and C6 replace the seated calf raise and the back extension
- 13, 14, 15, 16 · Phase 3 placements: Nordics take the leg curl slot; lateral lunge goes after the hip thrust; the dumbbell calf raise is A6's progression; the high step-up stays 3 × 8
- 20 · Warm-up shown as a checklist, not logged
- 23 to 26, 28 · Gate items not covered by PROMPT rule 8 and how each is evaluated
- 29 · Which Fridays get the faster effort from Phase 2

## Questions for Shawn before M1 (PROMPT section 9)

Asked in the first reply with a proposed default beside each. "Defaults" takes every default. Answers go in the Decisions log.

1. Which knee is injured? No default.
2. Start date Monday Nov 2, 2026 as week 1? Default: yes.
3. Dumbbells to 75 or 60 lb; seated or 45° leg press; rower? Defaults: 75, seated, yes.
4. Pain once per exercise or per set? Default: per exercise, per set available in Settings.
5. Monday MBR fixed on Mondays? Default: yes.
6. Custom domain or Vercel URL? Default: Vercel URL.
7. spdc-design: installed here; use it? Default: yes (already wired into the scaffold).
8. Rest timer 90 s lower body, 60 s everything else? Default: yes.
