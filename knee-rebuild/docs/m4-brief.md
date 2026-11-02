# M4 brief: running

Read this, then `PROMPT.md` sections 4 (rule 7) and 5 (Run logger and Week rows), `CLAUDE.md`, `docs/m3-brief.md` (the non-negotiables there all still apply: logic only in `src/rules`, no meaning by color alone, 44 px, numeric keypads, no trapping modals, spdc tokens only, writes through `src/db/repo.ts`, reads through `src/db/hooks.ts`, `useToday()` for today, no silent async failures, strict TypeScript, oxlint clean, helpers tested). Done when three logged runs show against the week's target and a hold reading caps the following week.

## What exists for M4

- `src/rules/weekPlan.ts`: `targetForWeek(plan, week, startDate, runs, readings)` (rule 7 from the logs; a week with nothing logged caps nothing), `suggestRun({ session, week, target, milesSoFar, currentPhase, phaseWeek, morning })` (type, suggested miles under the ceiling, strides, tempo, faster effort, swap suggestion, reasons in words), `weekDays({ startDate, week, today, template, moves, runs, workouts, readings })` (seven days after moves with status `done | missed | today | upcoming | off` and the worst reading), `weekMilesSummary(...)`, `runsInWeek`, `readingsInWeek`, `runTypeFor`.
- `src/rules/mileage.ts`: `isSwap`, `weekMiles`, `runSplit`, `weekTarget`. `src/rules/history.ts`: `attachChecks`, `subjectReadings(records, runs, checks, injuredSide)`, `runReading`. `src/rules/reading.ts`: `morningReading`. `src/rules/calendar.ts`: `weekOf`, `dayOf`, `dateOf`, `addDays`, `isDeloadWeek`, `scheduledSession`, `weekSchedule`. `src/rules/session.ts`: `phaseWeekOf(week, settings.phaseEnteredWeek)`.
- Repo: `addRun`, `deleteRun`, `addSessionMove`, `deleteSessionMove`, `loadHistory()` (runs, sessionMoves, morningChecks, workouts, setLogs). Schema `Run`: `type` (`mbr | easy | long | elliptical-swap | rower-swap`), `miles`, `minutes`, `effort` (`easy | moderate | hard`), `maxPain` (0 to 10, required), `strides`, `tempo`, `stravaUrl` (https, strava.com only), `notes`.
- Components: `Screen`, `Button`, `Stepper` (`decimal` for miles), `Tap`, `ScalePicker` (+ `PAIN_SCALE`), `ReadingWord`, `readingSentence`. Today's helpers: `dateWords`, `shortDateWords`, `sessionLabel`, `runLabel` in `src/screens/Today.helpers.ts`.
- `PROGRAM.mileagePlan`, `PROGRAM.weeklyTemplate`, `PROGRAM.weeklyTemplateRows` (the day notes), `PROGRAM.running.rules`.

## File ownership

| Screen | Files |
|---|---|
| Run logger | `src/screens/RunLogger.tsx`, `src/screens/RunLogger.helpers.ts(+.test.ts)` |
| Week | `src/screens/Week.tsx`, `src/screens/Week.helpers.ts(+.test.ts)` |

The orchestrator wires the routes in `App.tsx` and updates Today's run-day block. Don't edit other files; if a rule is missing, add a new `src/rules/<name>.ts` with its test.

## Screens

**Run logger** (route `run`). Opens on today's date. Type as five choices in words (`Run: MBR`, `Run: easy`, `Run: long`, `Elliptical swap`, `Rower swap`), preselected from today's scheduled session (`runTypeFor`) and, when `suggestRun` says a swap is suggested, showing that suggestion in words with one tap to take it (never silently switching). The suggestion block shows `suggestRun`'s miles and reasons. Miles (`Stepper` decimal, 0.25 steps; hidden and logged as 0 for swaps), minutes, effort as three choices, max pain on the 0 to 10 picker (Save stays disabled with the words "Rate max pain first" until it is picked: `maxPain` is required and unknown is not clean), strides and tempo as `Tap`s prefilled from the suggestion, an optional Strava link (validated by the schema; show the refusal in words), an optional note. A line that updates as you type: "This week: 3 of 10 miles · with this run 6 · target from the plan" (or the capped reason). Save: `addRun`, then "Logged. Tomorrow's morning check reads it." with buttons to Today and to Week. Below the form, this week's runs as rows (date, type, miles, max pain) each with a "Remove" that asks once inline. A run can be logged for an earlier day this week (a date choice limited to this program week up to today).

**Week** (route `week`). Opens on the current program week; previous and next buttons move a week at a time (weeks 1 to 12, plus the current week if past 12). Header: "Week 3 · Nov 16–22", a "Deload week" badge in words when it applies. Miles: "6 of 12 miles · 2 runs and 1 swap" and the target's reason when capped ("Capped at last week's 10.5 miles: last week read hold"). The seven-day strip from `weekDays`: each day a row with the weekday and date, the session in words, a status word with a mark (`✓ Done`, `– Missed`, `● Today`, `Upcoming`, `Off`), and the reading as a `ReadingWord` when there is one. Move: a quiet "Move" on each non-off day; tapping it then another day of the same week swaps them through `addSessionMove`; moves made this week are listed with "Undo" (`deleteSessionMove`). Tapping a done lift day opens its summary (`navigate({ name: 'session', workoutId })`); tapping today's run day opens the run logger.
