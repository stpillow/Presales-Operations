import type { Exercise, ReadingResult, SetLog, Side, Slot } from '../schema/index.ts'
import { baselineRecords, cappedExerciseReadings } from './gymLoads.ts'
import { lastSetsBySide, type WorkoutRecord } from './history.ts'
import { backOffMoves, effectiveReading, type Placement } from './prescription.ts'

/*
 * Which exercise a slot runs, from its history (PROGRAM-QUESTIONS 49 and 55, Shawn's Nov 1 answer).
 * A back-off on bodyweight work moves the slot to its easier version, the next exercise on its list
 * (`prescribe` makes that move). From the next session on, the slot runs the easier version, which
 * progresses on its own readings since the move, until it reads clean twice in a row; then the slot
 * goes back to the exercise it moved from, at that exercise's last session, and the back-off that
 * moved it is served. A hold or a back-off on the easier version starts the count again. An easier
 * version that itself backs off to the one after it comes back to it the same way, one step at a time.
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
  /** Its combined readings, most recent first (a rack-capped session that read clean is left out); on an easier version, or back from one, only those since the move. */
  readings: ReadingResult[]
  /** Its last sets, both sides, from the last session that wasn't rack-capped. */
  lastSets: SetLog[]
  /** Why, in words, when the history moved the slot; absent when it runs its own exercise as usual. */
  placement?: Placement
}

/** One exercise on the slot's list, with the record its readings count after (-1: all of them). */
interface Step {
  exercise: Exercise
  after: number
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

function historyOf(input: SlotExerciseInput, step: Step): { readings: ReadingResult[]; lastSets: SetLog[] } {
  const later = input.records.slice(step.after + 1)
  return {
    readings: cappedExerciseReadings(later, step.exercise.id, input.injuredSide).map((r) => r.reading.result),
    lastSets: lastSetsBySide(baselineRecords(input.records), step.exercise.id),
  }
}

/**
 * Where a back-off on this exercise moved the slot: the first exercise after it on the list that
 * was logged after its last session, when its standing reading is back-off and a back-off on it
 * moves the slot (not a load cut a swap happened to follow). Null when the slot hasn't moved.
 */
function movedFrom(input: SlotExerciseInput, list: readonly Exercise[], step: Step): Step | null {
  const { readings, lastSets } = historyOf(input, step)
  if (effectiveReading(readings) !== 'back-off') return null
  if (!backOffMoves({ slot: input.slot, exercise: step.exercise, lastSets, injuredSide: input.injuredSide })) return null
  const at = lastSessionOf(input.records, step.exercise.id)
  const easier = list.slice(list.findIndex((e) => e.id === step.exercise.id) + 1).find((e) => input.records.some((r, i) => i > at && logs(r, e.id)))
  return easier ? { exercise: easier, after: at } : null
}

function leadingCleans(readings: readonly ReadingResult[]): number {
  const firstOther = readings.findIndex((r) => r !== 'clean')
  return firstOther === -1 ? readings.length : firstOther
}

/** Which exercise the slot runs today and why, from its history (PROGRAM-QUESTIONS 55). */
export function slotExercise(input: SlotExerciseInput): SlotExercise {
  const list = [input.own, ...input.substitutions]
  let from: Step | null = null
  let on: Step = { exercise: input.own, after: -1 }
  // Each move goes forward on the list, so the walk ends within its length.
  for (let next = movedFrom(input, list, on); next !== null; next = movedFrom(input, list, on)) {
    from = on
    on = next
  }
  if (from === null) return { exercise: on.exercise, ...historyOf(input, on) }
  const easier = on.exercise.name
  const back = from.exercise.name
  const cleans = leadingCleans(historyOf(input, on).readings)
  if (cleans >= 2) {
    return { exercise: from.exercise, ...historyOf(input, from), placement: { note: `Back on ${back}: ${easier} read clean twice.`, returned: true } }
  }
  const note =
    cleans === 1
      ? `On ${easier} since ${back} backed off: clean once; clean again and the slot goes back to ${back}.`
      : `On ${easier} since ${back} backed off; two clean readings in a row take the slot back to ${back}.`
  return { exercise: on.exercise, ...historyOf(input, on), placement: { note, returned: false } }
}
