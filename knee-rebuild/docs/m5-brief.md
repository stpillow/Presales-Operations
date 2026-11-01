# M5 brief: gates and progress

Read this, then `PROMPT.md` sections 4 (rule 8) and 5 (the Progress and Gates rows), `CLAUDE.md`, `docs/m3-brief.md` (its non-negotiables apply unchanged: logic only in `src/rules`, no meaning by color alone, 44 px, numeric keypads, no trapping modals, spdc tokens only, writes through `src/db/repo.ts`, reads through `src/db/hooks.ts`, `useToday()`, no silent async failures, strict TypeScript, oxlint clean, helpers tested). Done when gate 1 evaluates from logged data alone and the hop-test symmetry matches the worked example (56 against 62 is 90.3%, passing gate 3's 90% line).

## What exists for M5

- `src/rules/gates.ts`: `evaluateGate(gate, ctx)` returns each item's pass and a detail in words, and whether the gate passes. `ctx` needs `today`, `injuredSide`, `readings` (`subjectReadings(attachChecks(...), runs, checks, injuredSide)`), `gateTests`, `morningChecks`, `runs`, `workouts`, `setLogs`, `calfRaiseExerciseIds` (`['single-leg-calf-raise-step']`).
- `src/rules/progress.ts`: `loadSeries(records, exerciseId)`, `symmetrySeries(records, exerciseId, injuredSide)`, `milesSeries(plan, runs, startDate)`, `consecutiveCleanDays(readings, today)`, `advancePhase(settings, gate, passes, week)` (throws unless the gate passes and leads to the next phase).
- `src/rules/unilateral.ts`: `bestOfTrials`, `symmetryPercent`, `meetsSymmetry`. `src/rules/calendar.ts`: `weekOf`. `src/rules/history.ts`: `attachChecks`, `subjectReadings`.
- Repo: `addGateTest`, `saveSettings`; hooks: `useSettings`, `useHistory`. Schema `GateTest`: `id`, `date`, `gate`, `item` (the gate item's `testItem` for symmetry tests, the item's own `id` for manual toggles), `valueInjured`, `valueOther`, `trialsInjured?`, `trialsOther?`, `pass`, `manual`, `notes?`.
- `PROGRAM.gates` (items with `evaluator`, `threshold`, `testItem`, `trials`), `PROGRAM.phases`, `PROGRAM.mileagePlan`, `exerciseById`.

## File ownership

| Screen | Files |
|---|---|
| Gates | `src/screens/Gates.tsx`, `src/screens/Gates.helpers.ts(+.test.ts)` |
| Progress | `src/screens/Progress.tsx`, `src/screens/Progress.helpers.ts(+.test.ts)`, `src/screens/progress/*.tsx` for the charts |

## Gates (route `gates`)

The current gate is the one whose `fromPhase` is `settings.currentPhase`; in Phase 4 there is none ("Gate 3 passed; Phase 4's sessions arrive with the next program update"). Lead with the gate's title and one line: how many items pass ("3 of 4 items pass").

The checklist, in the program's order: each item's text verbatim, its state as a word with a mark (`✓ Passes`, `○ Not yet`), and the detail line from `evaluateGate` in words. Manual items are `Tap`s ("Done" / "Not yet") that write a `GateTest` with `manual: true`, `item` the gate item's id, `pass` the toggle, values 0. Unticking writes a new test with `pass: false` (the latest test wins).

Symmetry items get an entry form inline under the item. Hop tests (`trials: 3`): three trials per side in inches (numeric fields, `Stepper` with `decimal`), the best of each side kept and shown, the symmetry shown live as a percent with the gate's line ("90.3% · the line is 90%: passes"). Other symmetry items (leg press, Bulgarian loads): one value per side, prefilled from the latest session that logged both sides of that exercise (`symmetrySeries` or the latest sets: the injured side's best load and the other side's), with a line saying where the prefill came from. Save writes a `GateTest` (`manual: false`, `pass` from `meetsSymmetry`, the trials when there were trials). Earlier tests for the item are listed below the form, newest first, date and percent.

Advance phase: a primary button that is enabled only when `evaluateGate(...).passes`. Disabled, it says why in words ("2 items don't pass yet"). Tapping it opens an inline confirm, never a modal: "Advance to Phase 2: Single-leg strength and balance? From the next session the templates change and week bands count from this week." with "Yes, advance" and "Not yet". Yes saves `advancePhase(settings, gate, true, weekOf(today, settings.startDate))`. The phase never advances on its own.

## Progress (route `progress`)

Four parts, in this order:

1. **Consecutive clean days**, a stat: the number from `consecutiveCleanDays`, in the spdc stat style (Fraunces number), with a context line ("days since the last hold or back-off" or "no readings yet").
2. **Load over time**, one exercise at a time: a list of the exercises that have logged sets (names, grouped by pattern is fine, most recent first), one tap picks; a line chart of `loadSeries` for that exercise. Two-sided exercises draw two lines.
3. **Symmetry over time**, for the picked exercise when it is two-sided: `symmetrySeries` as one line in percent, with solid hairline reference lines at 80% and 90% labelled in text ("Gate 1 · 80%", "Gates 2 and 3 · 90%"). Say what was compared (loads or counts) in the tooltip and the table.
4. **Weekly miles, actual against plan**, for the 12 weeks: `milesSeries` as columns for actual miles with the plan as a short hairline mark across each week's column slot; down weeks labelled "down" under the axis.

Chart rules (from the dataviz skill; hand-rolled SVG, no chart library):

- **Encoding is emphasis, not categorical.** The injured side (and every one-series chart's line) is `green-bright` (#00B85C), the healthy side `on-dark-muted` (#8A97B8). The pair passes the validator's CVD separation (ΔE 12.9) and normal-vision (21.0) checks and contrast (≥ 3:1 on navy); it is not a categorical palette and stays at two. Identity never rides on color alone: a legend for two series ("● Right · injured" / "○ Left"), direct labels at the line ends, and different markers (filled 8 px dot for the injured side, a hollow ring for the other).
- Lines 2 px with round joins; markers ≥ 8 px with a 2 px navy ring; columns ≤ 24 px wide, 4 px rounded top, square at the baseline, `on-dark-dim` fill; the plan mark a 2 px `paper` hairline. Gridlines and axes are solid 1 px hairlines in `on-dark-faint`, recessive. One y-axis, always.
- Text never wears a data color: labels, values, legends and axis text use the text tokens. Label selectively: the last value and the extreme, not every point.
- Every chart has a table twin behind a "Show the numbers" toggle.
- Tap or focus anywhere on a chart selects the nearest date and shows a readout line above the chart with every series' value at that date (values first, then names). The hit area is the whole plot width, never the 8 px dot.
- The SVG has a `role="img"` and an `aria-label` that says what it shows in one sentence. Empty states say what will appear and when ("Log a session to see this").
- Sizes fit a 375 px phone with the 16 px gutter; the container includes the x-axis labels (no nested scroll).
