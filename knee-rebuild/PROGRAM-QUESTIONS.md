# Program questions

Places where `docs/program.md` is ambiguous, or where it and `PROMPT.md` pull in different directions. For each one the app takes the reading that is more conservative for the knee and keeps going (working agreement 6). Nothing here changes training content; where the data model had to bend, the model bent.

Status key: **confirm** = reading taken, Shawn to confirm or overrule · **open** = needs an answer · **FYI** = model decision, no answer needed.

## Readings and progression

1. **Mileage plan is a chart image.** Read from the chart as weeks 1–12: 10, 11, 12, 9 (down), 13, 14, 15, 11 (down), 16, 17, 18, 14 (down). Cross-checks: "from 10 to 18 by week 11" and the worked example that puts week 3 at 12. The table sits under the chart in `docs/program.md`. **confirm**
2. **Step-up: height or load first?** program.md: "Step height goes up 2 in. once 3 × 10 with 20 lb dumbbells is clean." PROMPT rule 4: "height-then-load raises step height one increment before any load is added." The worked example sits at 20 lb and 6 in., which only happens if load climbs first. Reading: load climbs by double progression up to 20 lb per hand; at 20 lb, clean twice raises height 2 in. with load unchanged, repeated to the phase ceiling (8 in. in Phase 1, 16 in. from Phase 2); only then does load move again. **confirm**
3. **Leg extension range stop.** Phase 1 says 90° to about 45°; Phase 2 says 90° to 30°; PROMPT says the stop moves 45° then 30° before load. Reading: the range progresses on clean-twice but never past the phase's stop (45° in Phase 1, 30° from Phase 2), and load is added only once the range sits at the phase's stop. **confirm**
4. **"Two off sessions in a row" reads back off** (the across-the-week row of the signals table). PROMPT's rules don't encode it. Reading: two consecutive hold readings on the same exercise are treated as back-off for that exercise. **confirm** (built in M2 unless overruled)
5. **Stiffness past 30 minutes with nothing else flagged.** PROMPT rule 2 doesn't say. program.md's hold row is "stiffer or sorer than the day before, clears within the day." Reading: not clean; it reads hold. **confirm**
6. **"If the whole knee is complaining"** (next run becomes elliptical; next lift's lower-body work at Phase 1 loads). Reading: a morning back-off reading makes the next run default to an elliptical swap and gives every lower-body slot of the next lift the back-off prescription (×0.75, or the previous substitution). "Phase 1 loads" can't be computed inside Phase 1; from Phase 2 on the app will show the last Phase 1 load for that exercise where one exists. **open**: should the Phase 1 load override ×0.75 when it is lower?
7. **Balance progression has no load** (eyes open → eyes closed → folded mat → head turns → bosu). Modeled as ordered stages under a new progressionRule `stage`: clean twice moves up a stage, back-off moves down one. **FYI**
8. **Week 4 is both a deload and Phase 2's first week**, so the new single-leg slots have no prior loads to deload from. Reading: a slot with no history in a deload week runs at its lightest version (bodyweight or the lightest increment) with deload set counts; week 5 progresses from week 4's logs. **confirm**
9. **Dumbbell cap.** When the next load would exceed dumbbellMax, the engine suggests the slot's next substitution (single-leg RDL or Smith RDL for RDLs, suitcase carry for carries) instead of a load the rack can't give. **confirm**
10. **Carries are in yards** (3 × 40 yd), outside the pounds/miles/seconds units. A `distanceYards` field on the prescription; progression is load only (RPE 8 or under twice → +5 lb per hand). **FYI**

## Templates: Phases 2 and 3 are prose deltas on Phase 1

11. **"New" slots in Phase 2** (B6 lateral step-down, C6 reverse lunge) reuse the slot numbers held in Phase 1 by the seated calf raise (B6) and the 45° back extension (C6). Replace or insert? Reading: replace; the phase "trades" slots and the lower total volume is the conservative side. Seated calf raise and back extension leave B and C in Phase 2. **confirm**
12. **Phase 2 C8 lists two exercises** ("lateral band walk, then cable hip abduction"). Modeled as two slots, paired. **FYI**
13. **Phase 3 A: where do Nordic negatives go?** Reading: they take the leg curl slot (A2), with the leg curl as the first substitution (the substitutions table names Nordics as the leg-curl replacement from Phase 3). A keeps both the two-leg press at 4 × 6–8 and the single-leg press at 3 × 8. **confirm**
14. **Phase 3 B lateral lunge** is "New" with no slot number. Reading: inserted after the hip thrust, before the row; everything else carries over. **confirm**
15. **Phase 3 C "single-leg calf raise holding a dumbbell."** C has no calf slot in Phases 1–2; the single-leg calf raise is A6. Reading: this is A6's progression (add a dumbbell); no new calf slot in C. **confirm**
16. **Phase 3 C step-up "to a high step with a knee drive"** has no sets × reps. Reading: carries Phase 2's 3 × 8 each leg. **confirm**
17. **Week-banded slots.** Snap-downs start in week 6; Phase 3 plyos change by week band (8–9, 10–11, 12). Slots carry an optional week range. **FYI**
18. **Optional slots** (Phase 1 A9 elliptical finisher; Phase 3's fourth upper slot "if sessions finish under 55 minutes"). `optional: true` on the slot: shown, skippable, never part of a reading. **FYI**
19. **RPE written as a range over time** ("RPE 6→7", "7 to 8 across the four weeks"). A slot stores rpeTarget and rpeTargetEnd; the display shows the arrow; the progression test stays "RPE 8 or under" per rule 4. **FYI**
20. **Warm-up and the pre-run routine** aren't logged slots. Reading: a checklist at the top of the runner (the 3-minute circuit from Phase 3), nothing to log. **confirm**
21. **Phase 1 A5/A6/A7 grouping** ("pair with 6"; balance "between calf sets"). A5 and A7 both pair with A6 and render as one group. **FYI**
22. **Cable hip abduction trains the standing leg.** The logged side is the standing leg; the injured side stands first. The cue carries it. **FYI**

## Gates

23. **Gate 1 has two items PROMPT rule 8 doesn't list**: "30 s of single-leg stance with eyes closed" and "a 4-mile run with no next-morning reaction." Reading: the stance is a manual toggle; the run is auto-evaluated from a logged run of 4.0 miles or more whose morning check reads clean. **confirm**
24. **Gate 2 "20 single-leg calf raises each side."** Source: a set of 20 or more reps on each side on the single-leg calf raise slot within the last 14 days. **confirm**
25. **Gate 2 "single-leg leg press and Bulgarian loads within 10% side to side."** GateTest entries, as PROMPT says, prefilled from the latest SetLogs per side so the numbers get confirmed rather than retyped. **confirm**
26. **Gate 3 "no swelling the morning after a plyo session."** Reading: no swelling flagged for 14 days and at least one Phase 3 A or C workout inside that window. **confirm**
27. **Gate 3 "single-leg leg press 8RM within 10%."** A GateTest item at the 90% line, alongside the three hop tests (single, triple, crossover), each best of three per leg at 90%. **FYI**
28. **The red flag "pain climbing session over session despite two back-offs" is computable.** Reading: the morning check shows a warning line when the pattern is present, but the red-flag state is set only by a ticked flag. **confirm**

## Runs

29. **"One faster Friday every other week from Phase 2."** Which Fridays, and does it survive deload weeks? Reading: a suggestion in the run logger, never a rule; starts week 5, skips deload weeks, and is superseded by the week-10 tempo. **open**
30. **Strides and tempo in Phase 3** (Wednesday strides from week 8; Friday 2 × 5 min from week 10 if Gate 2 was clean). The run logger pre-sets the toggles on those days; the tempo suggestion requires gate 2 to have passed. **FYI**
31. **Long run "at most 40%"** vs PROMPT's "40% rounded to the nearest half mile." PROMPT wins on app behavior. **FYI**

## Found while transcribing the seed data (M1)

32. **Phase 3's "fourth upper slot" has no sets × reps.** Reading: an optional slot at the upper-body pattern, 3 × 10–12 at RPE 8, shown with "(not written)" in front of it. **confirm**
33. **Leg press substitutions.** The 45° press is listed first, as the same movement on the other machine, ahead of the program's own row (Smith box squat, then goblet squat to a bench). **confirm**
34. **Nordic negatives have no RPE or progression written.** Modeled as fixed 3 × 3–5: reps move within the range, nothing is loaded. **FYI**
35. **Week 8 is both the first plyo week and a deload.** The deload rule trims the plyo block too (3 × 15 s becomes 2 × 15 s): fewer ground contacts is the conservative side. Week 12's block is written for a down week already and comes out unchanged. **confirm**
36. **Phase 3 C step-up "to a high step"** has no height. Reading: starts at 16 in., the top of Phase 2's range, with no ceiling written (a flat bench is 17–18 in.). **confirm**
37. **Carries are 3 × 40 yd.** Modeled as double progression on a fixed 40-yard "rep": every set completing 40 yd at RPE 8 or under, twice, adds 5 lb per hand. **FYI**
38. **Single-leg calf raise in Phase 2 is bodyweight;** "holding a dumbbell" starts in Phase 3 at 5 lb steps. Phase 2's slot progresses reps only. **FYI**
39. **Balance stage ladders.** Phase 1: eyes open → eyes closed → folded mat. Phase 2 on: folded mat → slow head turns → eyes closed → bosu → bosu with head turns → bosu eyes closed. The program says "folded mat or bosu"; the mat-before-bosu order is my sequencing. **confirm**
40. **Assisted pull-up:** the stack is assistance, so progression is one plate less, not one more. **FYI**
41. **The optional elliptical finisher** carries into Phases 2 and 3 as an optional slot; the program lists it only in Phase 1 A and says the pressing, pulling, carries and core carry over. **confirm**
42. **Single-leg hip thrust (Phase 2 B2)** has no load written: fixed 3 × 10 each leg, bodyweight. **FYI**
43. **Slots with no row in the substitutions table** (shoulder press, dead bug, side plank, Pallof press, snap-downs, every plyo) have no swaps; the Swap button will show nothing for them. **FYI**
44. **"Dumbbells cap at 75 lb"** in the setup notes stays verbatim; the app's cap is the 80 lb from Settings. **FYI**
45. **The `time` progression rule has a name but no semantics in PROMPT rule 4.** It applies to the Copenhagen planks (3 × 15–20 s each side). Reading for M2: clean twice adds 5 s per set up to the slot's top (20 s); at the top the next notch is the longer lever written for Phase 3; back-off drops 5 s. **confirm**
