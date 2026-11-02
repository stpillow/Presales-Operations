import type { ReadingResult, SetLog, Side } from '../schema/index.ts'
import { exerciseReadings, lastSetsBySide, type DatedReading, type WorkoutRecord } from './history.ts'
import type { Reading } from './reading.ts'

/*
 * Loads across gyms (M4b). Shawn's Nov 1 answer (design section 9 item 4): machine loads are
 * pounds and every load carries between gyms, "pounds are pounds", so history is not kept per gym
 * and a workout's `locationId` changes nothing here. What remains is the rack cap (answer 5): a set
 * logged `rackCapped` ran at the gym's heaviest dumbbell because the prescription was heavier and
 * nothing was there to swap to. A capped session never becomes the baseline a load progresses
 * from, and it never reads clean (PROGRAM-QUESTIONS 73).
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
 * One session's reading for an exercise, given that exercise's sets from the session: with any
 * rack-capped set it is hold at best. Clean becomes hold, since a load lighter than prescribed earns
 * nothing; hold and back-off stand, because the knee said them at whatever load it carried.
 */
export function capReading(reading: Reading, sets: readonly SetLog[]): Reading {
  const capped = sets.filter(isRackCapped)
  const first = capped[0]
  if (first === undefined || reading.result !== 'clean') return reading
  const top = Math.max(...capped.map((s) => s.load))
  return { result: 'hold', reasons: [...reading.reasons, `the rack stopped the load at ${top} ${first.loadUnit}; a rack-capped session is not counted as clean`] }
}

/**
 * `exerciseReadings` with the rack cap: the same combined readings, most recent first, except that a
 * session with any rack-capped set of this exercise reads hold at best.
 */
export function cappedExerciseReadings(records: readonly WorkoutRecord[], exerciseId: string, injuredSide?: Side): DatedReading[] {
  return [...records].reverse().flatMap((record) => {
    const own = record.sets.filter((s) => s.exerciseId === exerciseId)
    return exerciseReadings([record], exerciseId, injuredSide).map((r) => ({ ...r, reading: capReading(r.reading, own) }))
  })
}

export interface ExerciseHistory {
  /** Combined readings, most recent first; a rack-capped session reads hold at best. */
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
