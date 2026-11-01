import type { IsoDate, MorningCheck, ReadingResult, Run, SetLog, Side, Workout } from '../schema/index.ts'
import { combinedReading, morningCheckApplies, morningReading, sessionReading, worst, type Reading } from './reading.ts'

export interface WorkoutRecord {
  workout: Workout
  sets: SetLog[]
  morningCheck?: MorningCheck
}

/** Joins workouts to their sets and to the morning check that applies (an explicit link wins). Sorted by date. */
export function attachChecks(workouts: readonly Workout[], sets: readonly SetLog[], checks: readonly MorningCheck[]): WorkoutRecord[] {
  return [...workouts]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? '').localeCompare(b.startedAt ?? ''))
    .map((workout) => {
      const subject = { kind: 'workout' as const, id: workout.id, date: workout.date }
      const linked = checks.find((c) => c.appliesTo?.kind === 'workout' && c.appliesTo.id === workout.id)
      const check = linked ?? checks.find((c) => morningCheckApplies(c, subject))
      return { workout, sets: sets.filter((s) => s.workoutId === workout.id), ...(check ? { morningCheck: check } : {}) }
    })
}

export interface DatedReading {
  date: IsoDate
  reading: Reading
}

/** Sessions that happened: finished, or abandoned with whatever was logged before the stop. */
const finished = (r: WorkoutRecord) => r.workout.status === 'finished' || r.workout.status === 'abandoned'

/** Combined readings for one exercise across sessions that happened, most recent first. */
export function exerciseReadings(records: readonly WorkoutRecord[], exerciseId: string, injuredSide?: Side): DatedReading[] {
  return records
    .filter((r) => finished(r) && r.sets.some((s) => s.exerciseId === exerciseId))
    .map((r) => ({
      date: r.workout.date,
      reading: combinedReading(
        sessionReading(r.sets.filter((s) => s.exerciseId === exerciseId), injuredSide),
        r.morningCheck ? morningReading(r.morningCheck) : undefined,
      ),
    }))
    .reverse()
}

/** Only the sessions dated before a day: the session being run never plans itself, and a same-day earlier attempt doesn't either. */
export function recordsBefore(records: readonly WorkoutRecord[], date: IsoDate): WorkoutRecord[] {
  return records.filter((r) => r.workout.date < date)
}

/**
 * For each side, the sets from the most recent session that logged that side of this exercise. A
 * stop on the injured side leaves the healthy side unlogged; its own last sets still stand.
 */
export function lastSetsBySide(records: readonly WorkoutRecord[], exerciseId: string): SetLog[] {
  const out: SetLog[] = []
  const seen = new Set<string>()
  for (const record of [...records].reverse()) {
    if (!finished(record)) continue
    const own = record.sets.filter((s) => s.exerciseId === exerciseId)
    for (const side of new Set(own.map((s) => s.side))) {
      if (seen.has(side)) continue
      seen.add(side)
      out.push(...own.filter((s) => s.side === side))
    }
  }
  return out
}

/** The most recent session's sets for an exercise, abandoned sessions included. */
export function lastSetsFor(records: readonly WorkoutRecord[], exerciseId: string): SetLog[] {
  const record = [...records].reverse().find((r) => finished(r) && r.sets.some((s) => s.exerciseId === exerciseId))
  return record ? record.sets.filter((s) => s.exerciseId === exerciseId) : []
}

/** A workout's reading in words: the worst of its exercises; a workout with no sets reads hold. */
export function workoutReading(record: WorkoutRecord, injuredSide?: Side): Reading {
  const exerciseIds = Array.from(new Set(record.sets.map((s) => s.exerciseId)))
  if (exerciseIds.length === 0) return { result: 'hold', reasons: ['nothing logged; unknown is not clean'] }
  const morning = record.morningCheck ? morningReading(record.morningCheck) : undefined
  const readings = exerciseIds.map((id) => combinedReading(sessionReading(record.sets.filter((s) => s.exerciseId === id), injuredSide), morning))
  return { result: worst(readings.map((r) => r.result)), reasons: readings.flatMap((r) => r.reasons) }
}

/** A run's reading: its max pain on the rule 1 thresholds, combined with its morning check. */
export function runReading(run: Run, checks: readonly MorningCheck[]): Reading {
  const session: Reading =
    run.maxPain > 5
      ? { result: 'back-off', reasons: [`pain reached ${run.maxPain} on the run`] }
      : run.maxPain >= 4
        ? { result: 'hold', reasons: [`pain reached ${run.maxPain} on the run`] }
        : { result: 'clean', reasons: [`pain stayed at ${run.maxPain} on the run`] }
  const subject = { kind: 'run' as const, id: run.id, date: run.date }
  const linked = checks.find((c) => c.appliesTo?.kind === 'run' && c.appliesTo.id === run.id)
  const check = linked ?? checks.find((c) => morningCheckApplies(c, subject))
  return combinedReading(session, check ? morningReading(check) : undefined)
}

export interface SubjectReading {
  kind: 'workout' | 'run'
  id: string
  date: IsoDate
  result: ReadingResult
}

/** Every finished workout's and every run's reading, dated, for the gates and the Week screen. */
export function subjectReadings(records: readonly WorkoutRecord[], runs: readonly Run[], checks: readonly MorningCheck[], injuredSide?: Side): SubjectReading[] {
  const workouts = records.filter(finished).map((r) => ({ kind: 'workout' as const, id: r.workout.id, date: r.workout.date, result: workoutReading(r, injuredSide).result }))
  const runReadings = runs.map((run) => ({ kind: 'run' as const, id: run.id, date: run.date, result: runReading(run, checks).result }))
  return [...workouts, ...runReadings].sort((a, b) => a.date.localeCompare(b.date))
}
