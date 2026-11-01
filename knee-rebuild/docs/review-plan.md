# Adversarial review plan

Every milestone PR gets attacked before it merges. The attacker's goal is simple: make the app lie to the knee (a wrong prescription, a lost log, a stale build) or leak what's on the phone. The reviewer is not the author's friend.

## Standing passes, in order

1. **Threat model refresh.** Local-first, single user, no server: the assets are the logs on the phone and the prescriptions computed from them. The threats are data loss (storage eviction, failed migration, bad import), wrong decisions (rule edge cases, timezone and week math, missing data read as good), a stale or broken shell (service worker and cache), and content injection through the two places untrusted text enters: imported JSON and free-text notes. Anything new in the PR gets added here first.
2. **Security pass.** Run `/security-review` on the branch diff. Checklist: imported JSON validated with strict schemas before it touches Dexie; links rendered from user input (Strava URL) restricted to `https:`; no `dangerouslySetInnerHTML`; CSP and the other response headers in `vercel.json` stay in force; `npm audit` clean or every advisory explained; no runtime external calls; nothing secret ever enters the bundle (there is nothing secret, keep it that way).
3. **Correctness pass.** Run `/code-review` at medium on the branch diff, then walk the rules by hand at their boundaries: pain exactly 3 and exactly 5, a climb of exactly 2, the 36-hour morning-check window at both ends, a workout with no sets, a unilateral slot with a stopped set on the injured side, symmetry with a zero on either side, deload rounding at 2 and 4 sets, the week number on a Sunday night and a Monday morning in America/New_York, and the first week after the start date.
4. **Failure-point walk.** The list below, re-read against the diff. Each item is either covered, a test to add, or a logged risk with an owner.
5. **Tests before fixes.** Every real finding gets a failing test first, then the fix, in the same PR.
6. **Exit.** The PR merges when the findings are fixed or logged with a reason, `npm run check` and `npm run build` are green, and the preview is Ready.

## Likely failure points, standing list

| Area | What breaks | How we know / what guards it |
|---|---|---|
| iOS storage | Safari can evict IndexedDB for a site it considers unused; a reinstall wipes it | `navigator.storage.persist()` at first run (M3), an export reminder on the Week screen, export to Files (M6). Logged risk until then. |
| Service worker | A deploy lands mid-session; a stale precache serves old code against new data; the update prompt never shows | `registerType: 'prompt'`, the Reload button, `cleanupOutdatedCaches`; M6 QA on cellular with the screen locked. |
| Dexie migrations | A new version changes an index or drops a table and loses rows | Every version additive; a migration test with a seeded old database (M3). Never edit a shipped version. |
| Seed validation | A hand edit to `data/program.json` breaks the schema and the app throws at import | Strict schemas, `src/schema/program.test.ts`, and a readable error state instead of a blank screen. |
| Date math | Week boundaries drift across DST (Nov 1, 2026 is the fall-back, the day before week 1) or when the phone's timezone differs | Calendar math on YYYY-MM-DD strings in America/New_York, never on millisecond deltas; tests pinned to the DST dates. |
| Unknown reads as clean | A missing morning check, an unfinished workout, or an unlogged side is treated as a good signal | Rule 3's 36-hour rule; prescriptions default to hold when inputs are missing; tests for each missing input. |
| Rest timer | iOS suspends JavaScript timers when the screen locks | Timer computed from a stored start timestamp on each render, not from `setInterval` ticks. |
| Double taps | A set logged twice in a 60-second rest window | Idempotent writes keyed on (workout, slot, side, set number). |
| Export and import | A large or malformed file, a file from a newer schema version | Strict parse before any write, version field in the export, import is all-or-nothing in one transaction. |
| Red-flag state | A ticked flag never shows the stop screen, or clears without a note | Rule 9 tests; clearing requires a note. |
| Bundle | The seed and fonts grow the precache past what a weak signal tolerates | Build output size tracked in each PR; fonts are latin subsets only. |

## Findings, M1 (Oct 31, 2026)

Correctness pass: `/code-review` at medium over `knee-rebuild/`, ten findings, then a hand walk of the rules. Nineteen items in all across both passes: 14 fixed, 5 accepted or logged with a reason.

| # | Finding | Verdict | Status |
|---|---|---|---|
| 1 | Week-banded slots were keyed to the calendar week, but phases advance on gate confirmation; a late gate would drop Phase 2's snap-downs and skip Phase 3 plyo rungs, and the schema capped bands at week 12 | Real, the most important one | Fixed: `phaseWeeks` counts from phase entry, open-ended tops; fixture tests; PROGRAM-QUESTIONS 46 |
| 2 | `deloadSets` floored at 2 unconditionally, so a one-set slot got two sets in a deload week, and the test locked the bug in | Real | Fixed: capped at the slot's own sets; test rewritten |
| 3 | `pairWithSlot` was one-way and inconsistent; A5/A6/A7 is a three-way group a single pointer can't express | Real | Fixed: `groupId` on every member; test requires two or more members per group |
| 4 | `MileageWeek.starts` seeded Monday dates that go stale when `startDate` is edited | Real | Fixed: dates removed from the seed; derived from Settings in M4 |
| 5 | `DELOAD_WEEKS` and `mileagePlan.isDown` are two statements of one fact with nothing tying them together | Real, low risk | Fixed: a test asserts they agree; the rule keeps its own constant because PROMPT rule 6 states it |
| 6 | The script's Phase 4 message was unreachable behind the week-range check | Real, cosmetic | Fixed: weeks past 12 reach the Phase 4 message |
| 7 | The script hardcoded "10 lb steps", "2 in. risers" and the bike line instead of reading the seed | Real, drift risk | Fixed: reads `increment`, `heightIncrementIn` and the warm-up intro |
| 8 | `tsconfig.node.json` lacked `noUncheckedIndexedAccess`, so scripts compiled looser than the app | Real | Fixed; the one undefined case it exposed is handled |
| 9 | Rules tests imported the live seed, coupling rule tests to content edits | Real | Fixed: inline fixtures in `src/rules/*.test.ts`; seed checks stay in `src/schema/program.test.ts` |
| 10 | `SetLog` accepted a set with neither reps nor seconds; `IsoDate` accepted 2026-13-45 | Real | Fixed: refinements plus `src/schema/log.test.ts`; Strava links restricted to https while there |
| 11 | (own) Zod's default of stripping unknown keys let a mis-named seed field vanish silently; it happened during transcription | Real | Fixed: every schema is `strictObject`; the test suite caught the next occurrence |
| 12 | (own) No content security policy; a bad import or note would have had free rein if a render path ever slipped | Hardening | Fixed: CSP with no inline scripts, nosniff, no-referrer, permissions policy in `vercel.json` |
| 13 | (own) `src/program/program.ts` throws at import if the seed fails validation: a blank screen with no words | Risk, not yet reachable (the shell doesn't import the seed until M3) | Logged: M3 wires a readable error state before the seed is imported by the app |
| 14 | (own) The `time` progression rule is named in PROMPT rule 4 with no semantics | Open question | PROGRAM-QUESTIONS 45 |

### Security pass, M1

Method: `/security-review` over the branch diff (a read-only reviewer tracing every untrusted flow to every sink), plus `npm audit`, a grep for runtime network calls and dangerous DOM sinks, and a check of the built `index.html` for inline scripts.

Verdict: no finding above the bar. What was checked, so the absence is evidence: every file in `src/`, `scripts/` and the two configs for `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `location`, `window.open`, `.href`, `postMessage`, `fetch`, `localStorage` (zero matches; all rendering is JSX text); the Strava URL schema probed live with `javascript:`, `data:`, `vbscript:`, `http:` and scheme-relative URLs (all rejected); the seed import path (bundled at build, never fetched, Map lookups); the CLI (`parseArgs` strict, no filesystem or shell access); the CSP against the real build (no inline script, the service worker loads Workbox same-origin, fonts are vendored); the lockfile additions (zod, tsx, esbuild, all from the npm registry); the diff and the seed for secrets or PII (none; the seed carries the program plus the injured side and start date, by design). `npm audit`: 0 vulnerabilities.

Low observations, below the bar:

| # | Observation | Status |
|---|---|---|
| 15 | `Settings.redFlag` and `MorningCheck.appliesTo` were plain objects while every sibling is strict | Fixed; test added |
| 16 | `stravaUrl` was https-only but not host-restricted | Fixed: `strava.com` or `www.strava.com` only; test added |
| 17 | `script-src 'self'` will block Vercel's preview toolbar (it loads from vercel.live) on preview deploys | Accepted: the toolbar is noise on a phone test. Allow-list `vercel.live` for previews only if it is ever wanted |
| 18 | `style-src 'unsafe-inline'` | Accepted: React and Tailwind set style attributes; with no inline script allowed, CSS injection has no meaningful impact here |
| 19 | Seed validation throwing at import blanks the app | Same as finding 13; M3 adds the readable error state |

## Findings, M2 (Oct 31, 2026)

Correctness pass: eight review angles over `src/rules/`, then the boundary walk from the standing list. Security pass: a read-only reviewer traced every untrusted field (red-flag ids, stop reasons, dates, numbers, template ids, move days) through the engine; no sink exists (the engine returns text and numbers, the guard test forbids DOM, storage, network and clock), `Map`/`Set` keys and enum-constrained object keys rule out prototype pollution; nothing above the bar. It recommends re-running when M3 and M6 add the first rendering and parsing sinks.

| # | Finding | Verdict | Status |
|---|---|---|---|
| 20 | A morning check dated the same day as a session attached to it, so a Thursday-morning check (about Wednesday's run) read Thursday evening's lift before it happened | Real | Fixed: only the morning after applies, or an explicit link; test flipped |
| 21 | Sets from an abandoned session (the sharp-pain stop being the obvious case) fed neither readings nor the next prescription | Real | Fixed: abandoned sessions count; test added |
| 22 | `backOff` carried an unused `side` parameter | Cleanup | Fixed |
| 23 | Two readings of one exercise count as consecutive whatever the calendar gap between them | Accepted: "twice in a row" is about that slot's sessions, and a slot can skip a week on a move or a swap | Logged |
| 24 | The per-exercise pain storage convention lived only in a comment | Convention | Fixed: stated in CLAUDE.md's glossary |

## Findings, M3 (Nov 1, 2026)

Method: a five-angle adversarial review run as a workflow (data integrity; rule fidelity and placement; the gym experience against the brief and the runner design; security and robustness; dates, phases and edge cases). Each reviewer reported up to eight findings with a concrete scenario; each finding then went to three skeptics told to refute it (by code reading, against the spec, and by reproduction). A finding survived on two confirmations of three. 32 reported, 31 survived, most reproduced with a script; many were the same defect seen from two angles. The locations design panel found one more (a slot already on its first substitution was "moved" to itself).

| # | Finding | Fix |
|---|---|---|
| 25 | A back-off or the dumbbell cap took the slot's first substitution even when the slot was already on it | `nextSubstitution`: the one after the current exercise; tests |
| 26 | After a mid-exercise swap, the old exercise's load, height and stage prefilled the new one, slipping past "Pick a load first" | Prefill moved to `src/rules/prefill.ts`; only sets of the same exercise carry; tests |
| 27 | Per-exercise pain was keyed by slot, so after a swap one exercise's pain rewrote the other's sets (hold turned clean, reproduced) | Pain keyed by slot and exercise; a rating rewrites only that exercise's sets |
| 28 | The healthy side's reps took last session's per-set repeat ahead of the injured side's budget in hold, deload and red-flag weeks (rule 5) | Budget first; tests |
| 29 | Unrated pain in the default per-exercise mode read hold silently; two skipped ratings backed loads off 25% | Done waits for a pain rating ("Rate pain first") with a line saying why; the bar line says "pain not rated". A stop doesn't need a rating |
| 30 | Stop skipped the load check and labelled the count as the target | Stop waits for a load on a first-time exercise; the count reads "Reps done before stopping" while the panel is open |
| 31 | End, then Start again created a second workout planned from the abandoned one; the next morning's check covered only one | Start reopens today's abandoned workout (one workout per lift day); planning reads only sessions before the day; a morning check links one session only when exactly one happened |
| 32 | A stop on the injured side left the healthy side looking like a first-ever session next time | `lastSetsBySide`: each side's own most recent sets; test |
| 33 | An accidental Start, then End or Finish, kept an empty session that read hold and capped next week's miles | A session with nothing logged is discarded |
| 34 | A swap to a substitution of another kind kept the slot's unit, targets, step height and range stop | `effectiveSlot`: unit, targets and rule follow the exercise done (PROGRAM-QUESTIONS 57); tests |
| 35 | Finish, End and slot-row taps changed the screen far above the thumb | The card or panel scrolls into view |
| 36 | No side toggle on two-sided slots, against the brief and the design | Side buttons with a mark, landing on that side's open set (`openStepForSide`, tested) |
| 37 | readingSentence stated a consequence that contradicted the engine (two holds back off; a second clean progresses) | It now describes the reading; the summary shows the reading's actual reasons |
| 38 | The card dropped "each side" and "each way"; the bar said "load 8" with no unit | Both fixed |
| 39 | "Remove this set" was one tap, next to Back | Two taps, on its own row |
| 40 | A malformed escape in the URL blanked the app | `parseHash` lands on Today; test |
| 41 | Reset left this workout's swaps in local storage; ids repeat after a reset | `resetAll` clears them |
| 42 | The seed threw at import, so the readable seed-error screen could never show | `seed.ts` validates without throwing; `main.tsx` shows the error or loads the app |
| 43 | The Morning check's "Next time" used the stored week + 1, wrong after a start-date edit | From the calendar |
| 44 | Switching to per-exercise pain mid-session could flatten a per-set climb | A rating overwrites only unrated or uniform sets (`painRewriteAllowed`, tested) |
| 45 | A first time in a deload week gave two conflicting load instructions | The engine prescribes the lightest load (PROGRAM-QUESTIONS 58) |
| 46 | (refuted, kept as hardening) A stored swap id the seed lacks would crash the runner | `planSession` only honours the slot's own exercise or its substitutions |

Not fixed, logged: the Stop panel's count starts at the prefilled target rather than blank (relabelled instead); the engine never moves a slot back from a back-off substitution (PROGRAM-QUESTIONS 55, before Phase 2).

Verified in a browser drive after the fixes: the full Session A loop, a mid-exercise swap asking for a load again, End then Resume reopening the same session, and a malformed link landing on Today, with no console errors.
