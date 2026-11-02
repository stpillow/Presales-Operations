# M4b brief: where you train

Read this, then `docs/locations-equipment-design.md` (section 9 holds Shawn's Nov 1 answers and wins over the rest of the doc), PROGRAM-QUESTIONS 63 to 85 (each carries Shawn's Nov 2 answer), `CLAUDE.md`, and `docs/m3-brief.md` (its non-negotiables apply unchanged: logic only in `src/rules`, no meaning by color alone, 44 px targets, numeric keypads, no trapping modals, spdc tokens only, writes through `src/db/repo.ts`, reads through `src/db/hooks.ts`, `useToday()`, no silent async failures, strict TypeScript, oxlint clean, helpers tested).

Done when Shawn can type a gym's name, mark what it has or lacks, add equipment it has that isn't on the list, switch to it on Today, and get a Session A that uses only what's there, with each change said in words.

## What exists

- Seed: `program.equipment` (36 items), `program.planetFitness`, `program.equipmentListVersion`, `Exercise.requires`, `Exercise.stageRequires`. `npm run program -- --equipment` prints them.
- Schema: `Location`, `Settings.activeLocationId` (default `'planet-fitness'`), `Settings.kit` (default both carried items), `Workout.locationId?`, `SetLog.rackCapped?`, `Run.locationId?`. No Dexie version stores locations yet.
- Rules: `equipment.ts` (`availableEquipment`, `missingFor`, `routeSlot`, `fallbacksAfter`, `stageCeiling`, `runSwapsHere`, `matchTyped`, `locationCoverage`, `forNextProgramUpdate`), `gymLoads.ts` (rack-capped history), `slotExercise.ts` (question 55's way back), `wholeKnee.ts` (question 6), and `prescribe`'s optional `gym` input (`available`, `dumbbellMaxLb`, names). `runOrder.ts` takes an optional not-here set.
- `src/db/migrations.ts`: pure `homeLocation(dumbbellMax, planetFitness, createdOn, listVersion)`.
- `planSession` (src/app/session.ts) passes no gym yet.

## Part A: engine answers and the verifier's fixes (src/rules, seed, tests)

Shawn's Nov 2 answers that change what was built:
1. Question 73: a rack-capped session that reads clean counts neither way: it is left out of the exercise's readings for progression (no clean, no hold). A capped hold or back-off still stands.
2. Question 73: a rack-capped back-off backs off from the capped load (0.75 × the capped load), not the last uncapped one. The capped session is the baseline in that one case.
3. Question 73: rack-capped sessions are left out of the gates' clean weeks (a capped clean neither counts as clean nor breaks the streak; a capped hold or back-off still breaks it).
4. Question 84: cleans on the easier version from before the back-off count toward the two that bring the slot back, provided at least one of the two is since the move (so the back-off is always served at least once).
5. Question 68: the single-leg calf raise accepts the lowest stair as its step (`anyOf` step platforms or stair); the lateral step-down does not. The seed test that pins the either-or requirements grows to four.
6. Question 66: a new equipment item, an adjustable (incline) bench, sourced from program.md's own words for the incline press; the incline dumbbell press and the chest-supported dumbbell row require it instead of the flat bench. It is on Planet Fitness's list ("everything this program needs except a barbell") and so at the home gym.
7. Question 67 stays as built (a crossover does not count as a cable station). Question 71 stays (no 45° press assumed for new gyms). Question 78 stays (typed items plus unused list items), but see fix 1 below.

The final verifier's findings to fix:
1. `forNextProgramUpdate` and whatever decides the editor checklist count the rower and elliptical (run swaps) and the upright bike (warm-up) as used. Update the seed pin and question 78.
2. `routeSlot` and `locationCoverage` treat an exercise whose `stageCeiling` is -1 as not runnable here, so routes, Today's moves and the run order agree with `prescribe` (bosu and no mat). Inline test.
3. `toRack`: a moved prescription keeps its own note (`${p.note} ${why} ${moved.note}`), as `offTheLadder` does; note assertions in the deload-at-a-lighter-rack test.
4. `toRack`, nothing to swap: `load: Math.min(p.load, rack)`; an ascending-sets test.
5. Move the two decisions in `planSession` into src/rules: only a dated session can be the next lift after a back-off morning (`kneeMorning` takes an optional date and returns nothing without one), and a swap chosen for the session beats the slot's history (a `slotExercise` helper that takes the optional chosen exercise). planSession only wires them.
6. A live-seed test: for each slot of all nine templates under a few readings and loads, `prescribe` with the home gym (`availableEquipment(homeLocation(80, …))`, rack 80) equals `prescribe` with no gym, with the lying-leg-curl cases listed as expected differences. Reword the snapshot test's comment and question 80 to say the snapshot covers first sessions only.
7. Question 66's line: a typed "incline bench" now matches the new item.

Each change: a failing test first, the fix, its question's line updated ("Changed Nov 2" or "Built Nov 2"), one commit per change.

## Part B: storage and the plan (src/db, src/app, schema, one dev dependency)

- Dexie version 3: `locations: 'id'`, additive, no upgrade callback, no v2 row rewritten. `ensureLocations()` at launch (after `ensureSettings` in App.tsx) writes `homeLocation(settings.dumbbellMax, …)` if no `planet-fitness` row exists. `resetAll` clears locations and re-seeds through the same path. Add `fake-indexeddb` as a dev dependency only, with a test that opens a v2 database holding week-1 rows at v3 and finds every row unchanged plus the home gym.
- Repo (all writes parsed with Zod): `addLocation`, `renameLocation`, `setPresent(locationId, itemId, here)`, `markOff(locationId, itemId, on)` and `clearMarkOff`, `addExtra(locationId, text, addedOn)`, `setDumbbellMax(locationId, lb)`, `archiveLocation` (archiving the active gym makes Planet Fitness active, in the same transaction), `setActiveLocation`, `setKit`. Hooks: `useLocations()`, `useActiveLocation()`.
- A guard test fails if anything outside `src/db` reads `Settings.dumbbellMax` (frozen; the location's `dumbbellMaxLb` is the rack now).
- `planSession` takes a required `gym: { location: Location; kit: string[] }`, computes `availableEquipment`, routes each slot (`routeSlot`) unless a Swap chose, passes the gym into `prescribe`, and returns `route` on each `SlotPlan`. Fix every caller. Today and Morning check plan at the active gym; the runner plans at `workout.locationId` (absent means Planet Fitness).
- Start stamps `Workout.locationId` with the active gym. The runner stamps `SetLog.rackCapped` when the slot's prescription was capped. Run swaps store `Run.locationId`.

## Part C: screens, three builders on disjoint files

| Builder | Files |
|---|---|
| Runner | `src/screens/SessionRunner.tsx`, `SessionRunner.helpers.ts(+test)`, `src/screens/session/*` |
| Today and runs | `src/screens/Today.tsx`, `Today.helpers.ts(+test)`, `src/screens/RunLogger.tsx`, `RunLogger.helpers.ts(+test)`, `src/screens/MorningCheck.tsx` (planning call only) |
| Where you train | new `src/screens/Locations.tsx`, `LocationEditor.tsx`, `NextUpdate.tsx` with helpers and tests, `src/app/router.ts` (+test), `src/App.tsx`, `src/screens/More.tsx`, `src/screens/Settings.tsx` (+helpers) |

**Runner** (design section 4): "At Hotel gym · Change" under the title; Change opens an inline list of gyms and works only until the first set is logged, then the line reads "At Hotel gym" with no Change. A moved slot says "Not at Hotel gym: Seated leg press. Using Goblet squat to a bench (no 45° leg press, no Smith machine)." A slot with nothing here says "Nothing here for Step-off landing (needs a 6–8 in. step)" with Skip and "Do it anyway"; Do it anyway offers "Mark step platforms here". Swap lists the slot's own exercise and its substitutions in order, each "Here" or "Not here · needs Smith machine", all tappable; a not-here pick offers "Mark Smith machine here"; a here pick offers "Smith machine isn't here: mark it" (mark-off). Rack-capped prescriptions say so ("Rack-capped at 25 lb: this session won't count as clean"). The warm-up line says "No upright bike here; nothing else is written for it." when it isn't. Finish lists the not-here slots in words. Rest timer, sides, pain and the rest of the runner unchanged.

**Today and runs**: under the date, "At Planet Fitness · Change"; Change opens an inline list of 44 px rows, each gym's name with "✓ Active" on the active one and "New location" at the end (navigates to the editor). On a lift day, list what moves at this gym ("Cable hip abduction → Lateral band walk (no ankle strap in your bag)"), from `locationCoverage`. A mark-off shows "Seated leg press marked not here since Nov 10 · It's back". Resume reads "Resume Session A at Marriott Downtown" when the workout's gym is not the active one. Run logger: the swap choices read "Here" or "Not at <gym>", both loggable; on a Hold or back-off morning the suggestion names the first swap here (elliptical, then rower); with neither here it suggests nothing and says "No elliptical or rower at <gym>" (Shawn: let him pick). Swaps store the gym.

**Where you train** (`#/locations`, from More and from Today's "New location"): each gym's name, "Active" on the active one, "Dumbbells to 80 lb · 3 not here"; New, Use here, Archive (two inline taps; no delete). Archiving the active gym returns to Planet Fitness and says so. **Location editor** (`#/location/:id`, `#/location/new`): name (1 to 60 characters); a new one picks "Start from Planet Fitness's list" (preselected) or "Start empty"; dumbbells None, 25, 50, 60, 75, 80, or a Stepper by 5; the items some exercise or run swap uses, grouped by program.md's "Program slot" rows, each a Tap "Here ✓" / "Not here –" with "Used by: …", the table's "If not here: …" where the substitution table gives one, and "if your club has one" on hedged items; "In your bag (every gym)" for the kit; "Something else here?" (typed text through `matchTyped`: known → "Matches Bosu or balance pad. Mark it here?"; suggest → a button per candidate plus "Neither: keep as typed"; unknown → kept, "No exercise in the program uses kettlebells. Kept for the next program.md update."); "What this changes" lists `locationCoverage`'s moves for the current phase. Every change saves at once. **For the next program update** (`#/next-update`, from More): `forNextProgramUpdate`'s lines with gym and date, and "Copy as text". **Settings**: the dumbbell section becomes a line and a link: "Dumbbells are set per gym in Where you train." Router routes and tests for all three.

## Checks

`npm run check` and `npm run build` green; the Planet Fitness snapshot unchanged; a browser drive (Playwright, iPhone 14, page.clock): make "Marriott Downtown" started empty, mark a few items and dumbbells to 25, switch to it on Today, start Session A, see each moved slot said in words, log a set, see Change gone, finish; then switch back and see Planet Fitness's Session A unchanged.
