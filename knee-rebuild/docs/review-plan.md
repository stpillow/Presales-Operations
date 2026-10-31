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

Correctness pass: `/code-review` at medium over `knee-rebuild/`, ten findings, then a hand walk of the rules. Security pass: `/security-review` on the branch diff plus `npm audit`, a grep for runtime network calls and dangerous sinks, and a check of the built `index.html` for inline scripts (none, so the CSP can forbid them).

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

Security pass result: `npm audit` found 0 vulnerabilities; no runtime network calls, no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in `src/`; the built `index.html` has no inline scripts. The focused security review of the diff is in progress and its findings are appended below when it reports.
