# Where you train: locations and equipment design (M4b)

Proposal 1, both judges' pick, with their flaws fixed and grafts from proposals 2 and 3. **Resolved** marks a settled disagreement.

## 1. What Shawn gets

1. Type a gym's name, start from Planet Fitness's list or nothing, tap what's there, set the dumbbell max.
2. Switch gyms on Today, which says what moves ("Leg press → Goblet squat to a bench").
3. Each slot runs the first exercise program.md lists for it that the gym has, says why, and Swap still overrides.
4. Typed equipment no exercise uses is kept for the next program.md update; no workout is built around it.
5. Machine plates stay per gym, readings follow the knee, and Hold-day swaps offer only machines that are there.

## 2. Data model and the Dexie v3 migration

Seed (`data/program.json`):
- `equipment[]`, about 37 items: `{ id, name, group, source, aliases[], carried, hedged, addedIn }`. `group` is a program.md "Program slot" row or "Bring"; `source` is its verbatim phrase; `hedged` marks "if your club has one"; `addedIn` is the list version.
- `Exercise.requires: Requirement[]` (may be empty; all must hold), `Requirement = EquipmentId | { anyOf: EquipmentId[] }`, `anyOf` only where program.md says "or". Optional `stageRequires` parallels `stages`.
- `planetFitness: EquipmentId[]`, `equipmentListVersion`.

Stored:
- New `Location`: `{ id, name (1–60), present: EquipmentId[], dumbbellMaxLb (0 = none), startedFrom: 'planet-fitness' | 'empty', listVersion, extras: { id, text, addedOn }[], markedOff: { id, on }[], createdOn, archived }`. A max above 0 means dumbbells.
- **Resolved** (present vs missing): store `present`. An item newer than `listVersion` counts as here at a gym started from Planet Fitness's list (if listed there), not here at one started empty; the editor flags it "New on the program's list".
- `Settings` gains `activeLocationId` (Zod default `'planet-fitness'`) and `kit` (default both carried items). `dumbbellMax` stays, frozen; a guard test fails if anything outside `src/db` reads it.
- `Workout.locationId?` stamped at Start (absent = Planet Fitness), `SetLog.rackCapped?`, `Run.locationId?` on swaps.

**Resolved**, purely additive: `version(3).stores({ locations: 'id' })`, no upgrade callback, no v2 row rewritten. At launch, `ensureLocations()` writes `homeLocation(settings.dumbbellMax)` if missing: `planetFitness` plus Shawn's answers (both leg presses, rower), 80 lb. `homeLocation` is pure (`src/db/migrations.ts`), reused by `resetAll` and the M6 import. A fake-indexeddb (dev) test opens v2 week-1 rows at v3 unchanged.

## 3. Rules in src/rules

`equipment.ts`:
```ts
availableEquipment(location, vocabulary, kit): ReadonlySet<EquipmentId>
missingFor(requires, available): Requirement[]
routeSlot(slot, byId, available): { kind: 'own' | 'moved' | 'none'; exerciseId; passedOver }
fallbacksAfter(slot, currentId, byId, available): Exercise[]
stageCeiling(exercise, available): number | null
runSwapsHere(available): { type: 'elliptical-swap' | 'rower-swap'; here: boolean }[]
matchTyped(text, vocabulary, present): { kind: 'known' | 'already'; id } | { kind: 'suggest'; ids } | { kind: 'unknown' | 'empty' }
locationCoverage(templates, phaseWeek, byId, available): { templateId; moves }[]
forNextProgramUpdate(locations, vocabulary, exercises): { text; locationName; addedOn? }[]
```
`routeSlot` takes the first of [own, ...substitutionIds] whose requirements hold; `none` keeps the own exercise, marked. Extras are strings, not `EquipmentId`s, so they can't reach `available`. `matchTyped` matches normalized names and aliases exactly, suggests first-three-letter near misses, and never ticks without a tap.

Tests: `homeLocation` routes all nine templates `own`. No seated press: P1 A1 → 45° press. Hotel (25 lb, bench): A1 → goblet squat. Smith only: calf raise runs. Back-extension bench, mat, no pulldown: Nordics run. Empty kit: C8 → abductor machine. Mat, no bosu: P2 A7 ceiling 2; neither: single-leg balance, ceiling 1. A newer item: here at Planet Fitness, not at an empty-started gym. "Bosu ball" known; "Rowing machine" suggests Rower, Seated row; "kettlebells" unknown.

`gymLoads.ts` (**resolved**: keyed on loadType, not loadUnit):
```ts
loadsCarryBetweenGyms(exercise: Pick<Exercise, 'loadType'>): boolean // false for stack, plates
exerciseHistoryAt(records, exercise, locationId, injuredSide): { readings; lastSets }
```
Stack and plate-loaded machines take last sets from the same gym and drop another gym's clean readings, keeping holds and back-offs (same knee). Rack-capped sessions never set the baseline or count as clean. Dumbbells, Smith plates ("ignore it and track plates"), heights, bands and time carry. Tests: plate 8 at home, clean plate 5 at the hotel: home prescribes from plate 8, clean-once. A hotel hold makes home hold. No `locationId` reads as Planet Fitness.

`prescription.ts`: `substitutions` becomes `fallbacksAfter` the current exercise, fixing the cap and bodyweight back-off swapping a slot already on `substitutions[0]` to itself. The cap uses the gym's rack on every basis; with no fallback, the rack max with `capped: true`. `stageCeiling` stops the ladder: "Bosu isn't marked here; staying at folded mat, eyes closed." Tests: a swapped single-leg RDL over the rack → Smith RDL, not itself. A 60 lb hold at a 25 lb rack → single-leg RDL. Back-off from the step-up with no stair → split squat, never back (a gym never walks backward from the engine's pick). The worked examples and a pre-change Planet Fitness snapshot of all nine templates stay byte-identical, bosu ceiling aside.

`runOrder.ts`: `none` slots are never the automatic next step.

Each behavior change gets a PROGRAM-QUESTIONS entry (56 on).

## 4. Engine and runner changes

`planSession` takes a required `gym: { location, kit }` (the compiler finds all three callers), routes each slot unless a Swap chose, and prescribes from `exerciseHistoryAt`; `SlotPlan` gains `route`. Today and MorningCheck plan at the active gym, the runner at `workout.locationId`.

Runner:
- "At Hotel gym · Change". **Resolved**: Change works only until the first set, so logged plates can't change gyms and `swapsFromSets` compares against the same plan.
- Moved: "Not at Hotel gym: Seated leg press. Using Goblet squat to a bench (no 45° leg press, no Smith machine)."
- None: "Nothing here for Step-off landing (needs a 6–8 in. step)", with Skip and "Do it anyway", which offers "Mark step platforms here".
- Swap lists [own, ...subs] in order, "Here" or "Not here · needs Smith machine", all tappable. A not-here pick offers "Mark Smith machine here"; a here one, "Smith machine isn't here: mark it" (`markedOff`).
- New stack machine here: "Plate numbers don't carry between gyms: pick a load at RPE 7." A unilateral slot on a two-legged exercise: "one leg at a time."
- Warm-up: "No upright bike here; nothing else is written for it." Finish lists not-here slots.

## 5. Screens

- **Today**: "At Planet Fitness · Change" opens an inline list of 44 px rows ("✓ Active", "New location"). Lift days list moves: "Cable hip abduction → Lateral band walk (no ankle strap in your bag)". A mark-off shows "Seated leg press marked not here since Nov 10 · It's back". Resume: "Resume Session A at Marriott Downtown".
- **Where you train** (More, `#/locations`): name, "Active", "Dumbbells to 80 lb · 3 not here"; New, Use here, Archive (two inline taps; no delete, workouts point at it). Archiving the active gym returns to Planet Fitness and says so.
- **Location editor** (`#/location/:id`): name; new ones "Start from Planet Fitness's list" (preselected) or "Start empty"; dumbbells None, 25, 50, 60, 75, 80, stepper by 5; used items by program.md's rows, each a `Tap` "Here ✓" / "Not here –" with "Used by: …", the table's "If not here: …", "if your club has one" when hedged; "In your bag (every gym)" (`Settings.kit`); "Something else here?"; "What this changes". Saves at once.
- **Settings**: the dumbbell section becomes a link to Where you train.

## 6. Typed equipment the program does not use

Known: "Matches Bosu or balance pad. Mark it here?" Suggest: a button per candidate plus "Neither: keep as typed". Unknown goes to `extras`: "No exercise in the program uses kettlebells. Kept for the next program.md update." Vocabulary items no exercise uses (shoulder press machine, medicine ball) stay off the checklist; typed, they read "On program.md's list, but no session uses it" and are kept too. More → "For the next program update" lists them with gym and date and "Copy as text".

## 7. Run swaps for M4

Swaps read "Here" or "Not at <gym>", both loggable. On a Hold or PROGRAM-QUESTIONS 6's morning back-off, the logger suggests the first one here, elliptical then rower (rower cue verbatim). Neither: "No elliptical or rower at <gym>; program.md names no other Hold swap. Rest is the conservative reading." With no elliptical the optional finisher reads "Not here", never a rower session. Swaps store `locationId`.

## 8. Seed data work

Add `equipment[]`, `planetFitness`, `requires` on all 71 exercises, `stageRequires` on both balance exercises. Program.md's words beat catalog strings; each call is logged:
- **Resolved**: dumbbells are required only where they are the movement. Step-ups, split squats, the back extension and the Phase 2 calf raise run at bodyweight; the rack caps only added load.
- **Resolved**: floor and space are assumed. A mat is required only as the balance surface or under Nordic knees; dead bug and side plank need nothing.
- Face pull's "rope" isn't required; the incline press implies an incline bench.

Tests: ids resolve; aliases are unique; every `source` is verbatim in program.md; dumbbell requirements match loadType, with the load-only list pinned. `npm run program -- --equipment` prints them for a spot check.

## 9. Shawn's answers (Nov 1)

These replace the defaults below wherever they differ; build on these.

1. Order: M4b, then M5, then M6.
2. His club has a bosu or balance pad, a stability ball and a usable stair; it has no lying leg curl. `planetFitness` includes the first three and not the lying leg curl.
3. He has both the ankle strap and the mini band.
4. **Changed:** machine loads are pounds, not plate numbers ("I'll always give weight, not plate count"), in 5 lb steps, and they carry between gyms ("pounds are pounds"). `gymLoads.ts` loses its per-gym history: every load type carries; only the rack cap and `rackCapped` remain.
5. Lighter rack with nothing to swap to: the heaviest dumbbell there, rack-capped, not counted as clean.
6. Nothing from a slot's list here: show it with Skip or Do it anyway.
7. **Changed:** a Hold run day at a gym with neither machine gets no suggestion; the logger says neither is here and he picks.
8. Floor work anywhere; a mat only as a balance surface or under Nordic knees. Kept.
9. An away gym stays active until he changes it, named on Today.
10. The gym locks at the first set.
11. program.md's words only. Kept.

## 9a. The questions as first asked, with the defaults

1. Build order? Default: finish M3, then M4, then M4b before week 4 (Nov 23); lift tasks jump ahead of M4 if he trains elsewhere sooner.
2. Bosu, lying leg curl, stability ball, usable stair at his club? Default: not here until marked (balance stops at folded mat, eyes closed); Swap still offers them.
3. Ankle strap and mini band bought? Default: yes.
4. Machine plates per gym, other gyms' machine cleans not counted? Default: yes.
5. Lighter rack, nothing to swap to? Default: heaviest dumbbell there, rack-capped, not counted.
6. Nothing from a slot's list here? Default: show it, Skip or Do it anyway; nothing from outside the list.
7. Hold run day, neither machine? Default: rest.
8. Floor work anywhere, mat only for balance and Nordics? Default: yes.
9. Away gym after a trip? Default: stays active until changed, named on Today.
10. Change gyms mid-session? Default: only before the first set.
11. Catalog strings beyond program.md (rope, incline bench, cable crossover)? Default: program.md's words.

## 10. Tasks for PLAN.md

First finish M3, then M4.

- [ ] PROGRAM-QUESTIONS 56 on; record the Planet Fitness `planSession` snapshot
- [ ] Seed: vocabulary, `planetFitness`, `requires`, `stageRequires`, seed tests, `--equipment`
- [ ] Schema fields, `dumbbellMax` guard, Dexie v3, `homeLocation`, `ensureLocations`, fake-indexeddb test
- [ ] `equipment.ts` and `gymLoads.ts` with tests
- [ ] `prescription.ts`, `runOrder.ts`, required `gym` in `planSession`; snapshot and worked examples green
- [ ] Runner: header lock, wording, Swap marks, warm-up, Finish
- [ ] Today: location line, moves, mark-off, Resume
- [ ] Where you train, editor, typed equipment, next-update list
- [ ] Run swaps in the M4 run logger
- [ ] Phone check on the real v2 database, Session A at a second gym, adversarial review
