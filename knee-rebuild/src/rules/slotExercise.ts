import type { Exercise, ReadingResult, SetLog, Side, Slot } from '../schema/index.ts'
import { exerciseHistory } from './gymLoads.ts'
import type { WorkoutRecord } from './history.ts'
import { backOffMoves, effectiveReading, type Placement } from './prescription.ts'

/*
 * Which exercise a slot runs, from its history (PROGRAM-QUESTIONS 49 and 55, Shawn's Nov 1 answer).
 * A back-off on bodyweight work moves the slot to its easier version, the next exercise on its list
 * (`prescribe` makes that move). From the next session on, the slot runs the easier version, which
 * progresses on its own readings, until it reads clean twice in a row; then the slot goes back to the
 * exercise it moved from, at that exercise's last session, and the back-off that moved it is served.
 * Cleans on the easier version from before the move count toward the two, as long as at least one of
 * them is since the move, so the back-off is always served at least once (Shawn's Nov 2 answer,
 * PROGRAM-QUESTIONS 84). A hold or a back-off on the easier version starts the count again. An
 * easier version that itself backs off to the one after it comes back to it the same way, one step
 * at a time.
 *
 * Readings are the exercise's, from every session that logged it (as `prescribe` reads them), so
 * "after" is by session: the records are in date order (`attachChecks`).
 */

export interface SlotExerciseInput {
  slot: Slot
  /** The slot's own exercise, resolved. */
  own: Exercise
  /** The slot's substitutions, resolved, in the program's order. */
  substitutions: readonly Exercise[]
  /** Every workout before the session being planned, in date order. */
  records: readonly WorkoutRecord[]
  injuredSide: Side
}

export interface SlotExercise {
  /** The exercise the slot runs today. */
  exercise: Exercise
  /** Its combined readings, most recent first, from every session that logged it (a rack-capped session that read clean is left out). */
  readings: ReadingResult[]
  /** Its last sets, both sides, from the last session that wasn't rack-capped. */
  lastSets: SetLog[]
  /** Why, in words, when the history moved the slot; absent when it runs its own exercise as usual. */
  placement?: Placement
}

const happened = (r: WorkoutRecord) => r.workout.status === 'finished' || r.workout.status === 'abandoned'
const logs = (r: WorkoutRecord, exerciseId: string) => happened(r) && r.sets.some((s) => s.exerciseId === exerciseId)

function lastSessionOf(records: readonly WorkoutRecord[], exerciseId: string): number {
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i]
    if (record && logs(record, exerciseId)) return i
  }
  return -1
}

function historyOf(input: SlotExerciseInput, exercise: Exercise): { readings: ReadingResult[]; lastSets: SetLog[] } {
  return exerciseHistory(input.records, exercise.id, input.injuredSide)
}

/**
 * Where a back-off on this exercise moved the slot: the first exercise after it on the list that
 * was logged after its last session, when its standing reading is back-off and a back-off on it
 * moves the slot (not a load cut a swap happened to follow). Null when the slot hasn't moved.
 */
function movedFrom(input: SlotExerciseInput, list: readonly Exercise[], exercise: Exercise): Exercise | null {
  const { readings, lastSets } = historyOf(input, exercise)
  if (effectiveReading(readings) !== 'back-off') return null
  if (!backOffMoves({ slot: input.slot, exercise, lastSets, injuredSide: input.injuredSide })) return null
  const at = lastSessionOf(input.records, exercise.id)
  return list.slice(list.findIndex((e) => e.id === exercise.id) + 1).find((e) => input.records.some((r, i) => i > at && logs(r, e.id))) ?? null
}

function leadingCleans(readings: readonly ReadingResult[]): number {
  const firstOther = readings.findIndex((r) => r !== 'clean')
  return firstOther === -1 ? readings.length : firstOther
}

/** Which exercise the slot runs today and why, from its history (PROGRAM-QUESTIONS 55). */
export function slotExercise(input: SlotExerciseInput): SlotExercise {
  const list = [input.own, ...input.substitutions]
  let from: Exercise | null = null
  let on: Exercise = input.own
  // Each move goes forward on the list, so the walk ends within its length.
  for (let next = movedFrom(input, list, on); next !== null; next = movedFrom(input, list, on)) {
    from = on
    on = next
  }
  if (from === null) return { exercise: on, ...historyOf(input, on) }
  const easier = on.name
  const back = from.name
  // The slot is on the easier version only once it has run since the move (`movedFrom`), so the most
  // recent clean is always one since the move: cleans from before it alone never serve the back-off.
  const cleans = leadingCleans(historyOf(input, on).readings)
  if (cleans >= 2) {
    return { exercise: from, ...historyOf(input, from), placement: { note: `Back on ${back}: ${easier} read clean twice.`, returned: true } }
  }
  const note =
    cleans === 1
      ? `On ${easier} since ${back} backed off: clean once; clean again and the slot goes back to ${back}.`
      : `On ${easier} since ${back} backed off; two clean readings in a row take the slot back to ${back}.`
  return { exercise: on, ...historyOf(input, on), placement: { note, returned: false } }
}

/**
 * Which exercise a slot runs in the session being planned: a swap chosen for this session (the
 * slot's own exercise or one of its substitutions) beats the slot's history and reads its own
 * (`exerciseHistory`), with no placement; with nothing chosen, or a choice that isn't on the slot's
 * list, the history decides (`slotExercise`). PROGRAM-QUESTIONS 84: a Swap chosen for the session
 * still wins.
 */
export function sessionSlotExercise(input: SlotExerciseInput, chosenId: string | undefined): SlotExercise {
  const chosen = chosenId === undefined ? undefined : [input.own, ...input.substitutions].find((e) => e.id === chosenId)
  return chosen ? { exercise: chosen, ...historyOf(input, chosen) } : slotExercise(input)
}
