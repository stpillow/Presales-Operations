# Session runner design

Synthesized from a three-proposal design panel (ergonomics first, data integrity first, fewest taps first) and two judges (the person between sets; the engineer who owns the rules and the data). Both judges picked the fewest-taps design. This document is that design with every flaw they named fixed. Where they left a choice open, the choice made here is marked **Decision** and logged in `PLAN.md`.

## 1. Screen, top to bottom

The tab bar is hidden on this screen (**Decision**: it removes the sweaty mis-tap that leaves the session mid-rest, and gives the card the space step-ups need). A quiet "Today" link in the header is the way out; nothing is lost by leaving.

1. Title "Session A"; lead "Phase 1 · Week 1 · Tue Nov 3", plus "Deload week: fewer sets, same loads" when it applies. A workout dated before today adds "Started Tue Nov 3. Finish it or end it."
2. Warm-up row: "Warm-up · bike 5 min · knee circuit 5 min" with a quiet "Show" that lists `PROGRAM.warmUp.lift`. Nothing is logged. Collapsed once any set exists.
3. The Now card: a short mono label ("Slot 5 of 9", "Superset 5 · 6 · 7"), the exercise name, the prescription in words ("2 × 15–20 · RPE 7 · plate 8"), the engine's note, the cues (collapsed to "Cues" after the slot's first set), the side toggle on unilateral slots, this slot's done sets as tappable rows, then the editor for the current set. A quiet row "Swap · Stop this exercise" closes the card. Swap and Stop open inline panels with a "Back"; nothing is modal.
4. The slot list: one row per slot with its first cue under it (PROMPT asks for cues visible), a status word with a mark ("● Now", "✓ Done", "2 of 3", "– Stopped", "Optional"), and group members under "Superset 5–7". Tapping a row makes it current: a taken machine costs one tap. Then "Finish session" and "End without finishing".
5. The Done bar, fixed at the bottom with a top border: while resting, the `RestTimer` row; then one line saying what the button will log ("Set 2 of 3 · plate 8 × 12 · RPE 7"); then one wide primary button whose words state the step: "Done: set 2 of 3", "Done: set 1, right", "Save set 1" when editing, "Pick a load first" (disabled) when a first-time load is still 0, "Finish session" when nothing is left.

## 2. The per-set flow

Common case: pick up the phone, read the Done bar line, tap Done. That is the set. Taps per set: bilateral 1, unilateral 1 per side, superset member 1. Pain is one tap per exercise.

Correction: one tap per step on a stepper; a jump is the field, the keypad, Done. A done set: tap its row, change it, "Save set n".

Double taps: Done is disabled while the write is in flight and for 800 ms after it lands (**fix**: the pointer advances under the thumb, so a late second tap would otherwise log the next step).

## 3. Unilateral slots

The side toggle shows "Right · injured" and "Left"; the active side carries a mark. Steps alternate inside each set number, injured side first. After the injured side's Done the card flips to the healthy side with reps prefilled from `healthySideTargets` of the injured sets, the field labelled "Reps (budget 8)". Load is the healthy side's own prescription. Injured-only slots say "Right (injured) only". `sideMeaning` prints under the toggle.

A bilateral slot swapped to a unilateral substitution still logs one side, "both", because sides come from the slot. The card says "Logs as both sides" (PROGRAM-QUESTIONS 54). The component never decides sides.

## 4. Supersets, optional slots, week bands

Slots sharing a `groupId` run round-robin by set number in slot order: A5.1, A6.1, A7.1, A5.2, A6.2, A7.2, A6.3, A7.3. Optional slots are never the automatic next step (**fix**: no skip state to lose); tapping the row or "Do this" focuses them. Week-banded slots come from `planSession`, so the list already holds only this week's.

The step order and when a rest is due are rules, in `src/rules/runOrder.ts` with tests: `sessionSteps`, `nextStep`, `restAfter`. **Decision**: rest starts after the last step of a round (both sides of a set, every member of a superset round), not after every Done.

## 5. Swap

Swap lists the substitutions in order as wide buttons, plus "Keep <own exercise>" when swapped. One tap re-plans the slot. Sets log with the chosen exercise id; a swap after sets exist continues the set numbers. The choice is kept per workout in local storage until the session ends (**fix**: an iOS kill before the first set no longer loses it) and recovered from the sets after that, counting an id as a swap only when it is neither the slot's own nor the engine's un-swapped prescription (**fix**: an engine back-off to a substitution is not mistaken for a user swap). When the engine itself moved the slot, the card says "Moved to <exercise>" with the note.

## 6. Stop this exercise

Stop lists the reasons in enum order, sharp joint-line pain first, with the reps field still showing ("reps done before stopping"). One tap logs the current set with `stopped: true` and the reason; the slot reads "– Stopped: <reason>" and is done for this session, both sides.

## 7. Pain and RPE

**Decision** (both judges flagged the original's carried 0): pain starts "Not rated" on each exercise and is set with one tap on a 0 to 10 picker. A set saved unrated stores no pain, and the engine reads that as hold ("unknown is not clean"). Per exercise (the default), the picked value is written on every set of the exercise, and changing it re-saves those sets. Per set (Settings), each set has its own, carried from the previous set.

RPE prefills from the slot's target, else the last RPE logged for that exercise, else "Not rated". An unrated RPE on a load-rule slot means the load cannot step up; the card says so.

Height, range stop and stage are words with a "Change" that opens the control (**fix**: five open steppers do not fit). Range stop offers only the engine's ladder (to 45°, to 30°), never 1° steps (**fix**).

## 8. Rest timer

No timer state: the start is the `loggedAt` of the newest set when that set ends a round, fed to `RestTimer` with `settings.restTimerSeconds`. Lock, reload or app switch cannot stretch it. "Skip rest" hides it. "Go" hides five minutes after the rest ends.

Corrections keep the stored `loggedAt`; only a new set stamps now (**fix**: a fresh stamp would restart the timer and reorder sets for the climbing check).

## 9. Resume, abandon, finish

Resume re-derives everything from Dexie: done sets, the pointer, swaps, stops. "End without finishing" asks inline ("Keeps the 7 sets logged"), sets `status: 'abandoned'`, returns to Today. "Finish session" works anytime: it names slots not logged ("not logged; they keep last session's prescription", **fix** of the original wording), shows max pain prefilled with the highest logged pain, then writes `maxPainDuring`, `finishedAt`, `status: 'finished'`. Finished and abandoned workouts open on the summary: per exercise its sets in words, its session reading as a word with a mark, the sentence for that reading, any stop, then "Tomorrow's morning check completes the reading; until then it reads hold." and "Back to Today".

## 10. State model

Dexie (live queries): the workout, its sets, settings, history. Every write through the repository: `upsertSet` (ids are coordinates, so re-logging overwrites), `updateWorkout`. Component state, cheap to lose: the editor draft (keyed by step, so a pointer change remounts it with fresh prefill), pain pick per slot, focused slot, open panel, editing step, skipped-rest instant, the last error sentence. Local storage: this workout's swaps.

## 11. Edge cases

A rejected write shows "Not saved: <reason>. Tap Done again." and nothing advances. A stopped injured set ends the slot for both sides. An unknown workout id says so with a button to Today. A Phase 4 or missing template says its sessions are not written. The dumbbell steppers cap at `dumbbellMax`. Minutes and yards label the field from `repUnit`.

## 12. Acceptance

1. Session A, week 1: every slot in order, cues visible in the list and the card.
2. A bilateral set logs with one tap on Done; the row reads done and the next set is current.
3. A second tap within 800 ms of Done logs nothing.
4. A unilateral set: Done on the injured side flips to the healthy side with the budget label.
5. A5/A6/A7 run round-robin and the rest timer shows only after A7 in each round.
6. The rest timer counts from the stored stamp and survives a reload.
7. Pain unrated: the set saves with no pain; rating it later updates every set of the exercise.
8. RPE prefilled from the target; unrated RPE says the load can't step up.
9. First-time loaded exercise: Done reads "Pick a load first" until the load is above 0.
10. Swap shows the substitutions in order; after a swap the prescription and the logged exercise id change.
11. A swap survives a reload before and after the first set.
12. Stop logs the current set with the reason and ends the slot.
13. Optional slots are never automatic; tapping one makes it current.
14. Editing a done set keeps its time stamp and its id.
15. Finish names unlogged slots, asks max pain, writes finished, shows the summary.
16. End without finishing keeps the sets and marks the workout abandoned.
17. Reopening a finished workout shows the summary, read-only.
18. Every control is at least 44 px and every state has a word or a mark.
19. Nothing on the screen decides a load, a reading or an order: those come from `src/rules`.
