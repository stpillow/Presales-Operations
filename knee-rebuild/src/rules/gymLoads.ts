import type { ReadingResult, SetLog, Side } from '../schema/index.ts'
import { exerciseReadings, lastSetsBySide, type DatedReading, type WorkoutRecord } from './history.ts'
import type { Reading } from './reading.ts'

/*
 * Loads across gyms (M4b). Shawn's Nov 1 answer (design section 9 item 4): machine loads are
 * pounds and every load carries between gyms, "pounds are pounds", so history is not kept per gym
 * and a workout's `locationId` changes nothing here. What remains is the rack cap (answer 5): a set
 * logged `rackCapped` ran at the gym's heaviest dumbbell because the prescription was heavier and
 * nothing was there to swap to. A capped session never becomes the baseline a load progresses
 * from, and a capped clean counts neither way: it is left out of the exercise's readings, so it is
 * neither a clean nor a hold (Shawn's Nov 2 answer, PROGRAM-QUESTIONS 73).
 */

/** Whether the gym's rack stopped this set short of its prescription. A set without the field was not capped. */
export function isRackCapped(set: Pick<SetLog, 'rackCapped'>): boolean {
  return set.rackCapped === true
}

const sessionExercise = (s: Pick<SetLog, 'workoutId' | 'exerciseId'>) => `${s.workoutId}\u0000${s.exerciseId}`

/**
 * The sets a load can progress from. When any set of an exercise in a session was rack-capped,
 * every set of that exercise in that session drops, both sides, so the last sets fall back to the
 * exercise's last uncapped session. Other exercises in the same session are untouched. Works on one
 * record's sets or on the whole log.
 */
export function withoutRackCapped(sets: readonly SetLog[]): SetLog[] {
  const capped = new Set(sets.filter(isRackCapped).map(sessionExercise))
  return sets.filter((s) => !capped.has(sessionExercise(s)))
}

/** The records with `withoutRackCapped` applied to each, for `lastSetsBySide` and `lastSetsFor`. */
export function baselineRecords(records: readonly WorkoutRecord[]): WorkoutRecord[] {
  return records.map((r) => ({ ...r, sets: withoutRackCapped(r.sets) }))
}

/**
 * One session's reading for an exercise, as progression counts it, given that exercise's sets from
 * the session. With any rack-capped set a clean counts neither way (null): a load lighter than
 * prescribed earns nothing, and the knee didn't complain, so it is no hold either. Hold and back-off
 * stand, because the knee said them at whatever load it carried (Shawn's Nov 2 answer).
 */
export function capReading(reading: Reading, sets: readonly SetLog[]): Reading | null {
  return reading.result === 'clean' && sets.some(isRackCapped) ? null : reading
}

/**
 * `exerciseReadings` with the rack cap: the same combined readings, most recent first, except that a
 * session with any rack-capped set of this exercise that reads clean is left out.
 */
export function cappedExerciseReadings(records: readonly WorkoutRecord[], exerciseId: string, injuredSide?: Side): DatedReading[] {
  return [...records].reverse().flatMap((record) => {
    const own = record.sets.filter((s) => s.exerciseId === exerciseId)
    return exerciseReadings([record], exerciseId, injuredSide).flatMap((r) => {
      const reading = capReading(r.reading, own)
      return reading === null ? [] : [{ ...r, reading }]
    })
  })
}

export interface ExerciseHistory {
  /** Combined readings, most recent first; a rack-capped session that read clean is left out. */
  readings: ReadingResult[]
  /** Each side's last sets from a session that wasn't rack-capped for this exercise. */
  lastSets: SetLog[]
}

/** What a prescription reads from history for one exercise, at any gym: the two `prescribe` inputs. */
export function exerciseHistory(records: readonly WorkoutRecord[], exerciseId: string, injuredSide?: Side): ExerciseHistory {
  return {
    readings: cappedExerciseReadings(records, exerciseId, injuredSide).map((r) => r.reading.result),
    lastSets: lastSetsBySide(baselineRecords(records), exerciseId),
  }
}
