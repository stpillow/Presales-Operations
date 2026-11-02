import type { ReadingResult, SetLog, Side } from '../schema/index.ts'
import { exerciseReadings, lastSetsBySide, type DatedReading, type WorkoutRecord } from './history.ts'
import { effectiveReading } from './prescription.ts'
import type { Reading } from './reading.ts'

/*
 * Loads across gyms (M4b). Shawn's Nov 1 answer (design section 9 item 4): machine loads are
 * pounds and every load carries between gyms, "pounds are pounds", so history is not kept per gym
 * and a workout's `locationId` changes nothing here. What remains is the rack cap (answer 5): a set
 * logged `rackCapped` ran at the gym's heaviest dumbbell because the prescription was heavier and
 * nothing was there to swap to. Shawn's Nov 2 answers (PROGRAM-QUESTIONS 73): a capped clean
 * counts neither way, left out of the exercise's readings, so it is neither a clean nor a hold; a
 * capped session never becomes the baseline a load progresses from, except that a back-off read on
 * one backs off from the load the rack allowed (0.75 × the capped load), so there it is the baseline.
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

export interface CountedReading extends DatedReading {
  /** The session it was read from. */
  workoutId: string
  /** Any set of this exercise in that session was rack-capped. */
  rackCapped: boolean
}

/**
 * `exerciseReadings` with the rack cap: the same combined readings, most recent first, except that a
 * session with any rack-capped set of this exercise that reads clean is left out.
 */
export function cappedExerciseReadings(records: readonly WorkoutRecord[], exerciseId: string, injuredSide?: Side): CountedReading[] {
  return [...records].reverse().flatMap((record) => {
    const own = record.sets.filter((s) => s.exerciseId === exerciseId)
    const rackCapped = own.some(isRackCapped)
    return exerciseReadings([record], exerciseId, injuredSide).flatMap((r) => {
      const reading = capReading(r.reading, own)
      return reading === null ? [] : [{ ...r, reading, workoutId: record.workout.id, rackCapped }]
    })
  })
}

export interface ExerciseHistory {
  /** Combined readings, most recent first; a rack-capped session that read clean is left out. */
  readings: ReadingResult[]
  /**
   * Each side's last sets from a session that wasn't rack-capped for this exercise; or, when the
   * exercise reads back-off and its latest counted session was capped, from that capped session.
   */
  lastSets: SetLog[]
}

/**
 * What a prescription reads from history for one exercise, at any gym: the two `prescribe` inputs.
 * A back-off read on a rack-capped session (its own, or a capped hold that makes two holds in a row)
 * backs off from the load the rack allowed, never from the heavier uncapped one before it.
 */
export function exerciseHistory(records: readonly WorkoutRecord[], exerciseId: string, injuredSide?: Side): ExerciseHistory {
  const counted = cappedExerciseReadings(records, exerciseId, injuredSide)
  const readings = counted.map((r) => r.reading.result)
  const latest = counted[0]
  const keep = latest?.rackCapped && effectiveReading(readings) === 'back-off' ? latest.workoutId : undefined
  const baseline = records.map((r) => (r.workout.id === keep ? r : { ...r, sets: withoutRackCapped(r.sets) }))
  return { readings, lastSets: lastSetsBySide(baseline, exerciseId) }
}
