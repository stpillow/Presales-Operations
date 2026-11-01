# Knee Rebuild: Plan

The status page. Ticked when done, not when started. Questions about the program live in [PROGRAM-QUESTIONS.md](PROGRAM-QUESTIONS.md); the questions for Shawn before M1 are at the bottom.

**Now:** M2 merged. M3 (the daily loop) in progress: data layer, shell, Today, Session runner, Morning check, Settings basics.
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
- [x] Shawn: add to the home screen, reload in airplane mode, say go (merged Oct 31; "it loaded on my phone", Nov 1)

### M1 · Seed data
Done when the schema validates, the script output matches program.md on a spot check of all three phases, and PROGRAM-QUESTIONS.md lists anything ambiguous.

- [x] Zod schemas for every section 3 entity in `src/schema/`, plus the model additions from PROGRAM-QUESTIONS (week range, optional, `stage` rule, repUnit, rpeTargetEnd)
- [x] Exercise catalog: id, name, pattern, equipment, loadType, increment, unilateral
- [x] `data/program.json`: phases 1–4, gates 1–3, the nine templates, every slot's cues and ordered substitutions
- [x] Mileage plan for 12 weeks, the red-flag list, the warm-up and pre-run checklists
- [x] `npm run program -- --week 5 --session B` prints a session, deload-aware
- [x] Spot-check A, B and C once per phase against program.md
- [x] Refresh PROGRAM-QUESTIONS.md with anything new
- [x] Adversarial review before merge: security and correctness passes on the diff, findings fixed or logged (see `docs/review-plan.md`)

### M2 · Rules engine
Done when tests are green and no rule lives outside `src/rules/`.

- [x] `calendar`: week and day from startDate in America/New_York, the scheduled session per date, move-session (deload weeks landed in M1)
- [x] `reading`: session reading, morning reading, combined reading, the 36-hour unknown-is-hold rule
- [x] `prescription`: next prescription per exercise and side for every progression rule; back-off; the dumbbell cap (deload sets and week-banded slots landed in M1)
- [x] `unilateral`: injured-first rep budget, symmetry percent
- [x] `mileage`: weekly target, the hold cap, the long-run split, swaps
- [x] `gates`: auto and manual items, hop-test best of three, pass logic, confirm-to-advance
- [x] `redFlags`: red-flag state and clearing with a note
- [x] Vitest for every rule, plus the six worked examples as named tests
- [x] A guard test that keeps `src/rules/` pure (no React, Dexie, DOM or clock) and fully tested
- [x] `history`: joins workouts, sets and morning checks into per-exercise reading timelines, workout and run readings
- [x] Adversarial review before merge: 5 findings, 4 fixed, 1 accepted (see `docs/review-plan.md`)

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

### M4b · Where you train (added Nov 1 at Shawn's request)
Done when Shawn can type a gym's name, mark what it has or lacks, add equipment it has that isn't on the list, switch to it on Today, and get a Session A that uses only what's there, with each change said in words.

- [ ] Design: `docs/locations-equipment-design.md` (design panel running)
- [ ] Equipment requirements per catalog exercise, transcribed from program.md's equipment and substitution tables
- [ ] Locations: typed name, equipment present or missing, typed extras, dumbbell max per location; Dexie v3 with `dumbbellMax` migrated into a "Planet Fitness" location
- [ ] Rule in `src/rules/` (tested): the first available of the slot's exercise and its substitutions, in the program's order, at the active location
- [ ] Engine and runner: prescriptions for the available exercise, with "Not at <gym>: using <exercise>" in words; Swap still overrides
- [ ] Screens: add and edit locations, add typed equipment, switch the active location from Today
- [ ] Typed equipment no exercise uses is kept and listed for the next program.md update; the app never invents an exercise for it
- [ ] Run swaps (elliptical, rower) respect what the location has

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
| 2026-11-01 | New milestone M4b, Where you train: typed gym locations and user-added equipment | Shawn's request on Nov 1. Sequenced after M4 unless he says otherwise. The app can only route to exercises the program already names; typed equipment with no matching exercise waits for a program.md update (PROMPT section 1). |
| 2026-10-31 | Claude merges milestone PRs once CI and the preview are green, then stops for Shawn's go on the next milestone | Shawn's ask after merging M0: "in the future, I want you to just handle merges" |
| 2026-10-31 | Every milestone PR gets an adversarial review pass (security and correctness) before merge; the standing plan is `docs/review-plan.md` | Shawn's ask on M1 |
| 2026-10-31 | Model additions in M1, none of them content changes: `loadUnit` (stacks log the plate number), `dumbbell-single` and `plates` load types, `quad` and `cardio` patterns, `repUnit`, `perSideLabel` (the program's own "each leg" / "each side"), `prescriptionText` kept verbatim per slot, `loadBeforeHeightLb`, `rangeStopDeg`, `heightIn`/`heightMaxIn` | Working agreement 6: change the model, not the content |
| 2026-10-31 | `data/program.json` was produced once by a throwaway generator so carried-over slots were copied rather than retyped; the JSON is the committed source and edits go there | One source of truth |
| 2026-10-31 | Week-banded slots count from the week the phase was entered, not the calendar week (`phaseWeeks`, open-ended tops allowed) | M1 review finding: phases advance on gate confirmation, so calendar bands would drop snap-downs and plyo rungs when a gate runs late (PROGRAM-QUESTIONS 46) |
| 2026-10-31 | Supersets are a shared `groupId` on every member slot, replacing the one-way `pairWithSlot` | A5/A6/A7 is a three-way group; a single pointer couldn't say so, and one-way links drifted |
| 2026-10-31 | The mileage plan carries no dates; week dates derive from `Settings.startDate` | startDate is editable, so seeded Mondays would go stale |
| 2026-10-31 | `vercel.json` sets a CSP (`default-src 'self'`, no inline scripts), nosniff, no-referrer and a permissions policy | Belt and braces against injected notes or a bad import; nothing in the app needs anything else |
| 2026-10-31 | `SetLog.stopReason` is an enum; a stop for sharp joint-line pain reads back-off, any other stop reads hold | Rule 1 names only the joint-line case; unknown is not clean (PROGRAM-QUESTIONS 48) |
| 2026-10-31 | Back-off on bodyweight work moves to the slot's first substitution; with none written it drops a set | PROGRAM-QUESTIONS 49 |
| 2026-10-31 | The `time` rule climbs to the top of its range, then waits for the next phase's version; back-off drops 5 s | PROGRAM-QUESTIONS 45 |
| 2026-10-31 | Runs have readings (max pain on rule 1's thresholds, combined with the morning check) | Rule 7 and rule 8 both speak of runs reading hold or clean (PROGRAM-QUESTIONS 53) |
| 2026-10-31 | The engine never reads the clock; screens pass `today` in, computed once by `todayIn(new Date())` | Testability, and one place to get the time zone right |
| 2026-10-31 | Section 9 answers from Shawn: right knee; week 1 starts Monday Nov 2, 2026; dumbbells to 80 lb; both a seated and a 45° leg press; pain logged once per exercise (per set stays available in Settings); MBR is always Monday; Vercel URL for now; rest timer 60 s for every slot. Rower yes and spdc-design on, both confirmed in a follow-up | Answered in chat on Oct 31 |
| 2026-10-31 | `dumbbellMax` is a number with presets 60, 75 and 80, not the 75-or-60 pair in PROMPT section 3 | His rack goes to 80 |
| 2026-10-31 | Leg press: the seated machine is the default (program.md's setup cue is written for it); the 45° press is its first substitution | Both exist at his club |
| 2026-10-31 | Rest timer: one default of 60 s for every slot; the 90 s lower-body split from section 9 is dropped | His call |

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

Answered Oct 31, 2026. Recorded in the Decisions log.

1. Which knee is injured? **Right.**
2. Start date Monday Nov 2, 2026 as week 1? **Yes.**
3. Dumbbells; leg press; rower? **Dumbbells to 80 lb; both seated and 45° leg press; rower yes (confirmed).**
4. Pain once per exercise or per set? **Once per exercise; per set available in Settings.**
5. Monday MBR fixed on Mondays? **Yes, always.**
6. Custom domain or Vercel URL? **Vercel URL for now.**
7. spdc-design? **Yes, use it (confirmed); already wired into the scaffold.**
8. Rest timer? **60 s for every slot.**
