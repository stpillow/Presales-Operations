import type { Exercise, IsoDate, MorningCheck, Pattern, SetSide, Workout } from '../schema/index.ts'
import { baselineRecords } from './gymLoads.ts'
import { lastSetsBySide, type WorkoutRecord } from './history.ts'
import type { LoggedLoad, WholeKnee } from './prescription.ts'
import { morningReading } from './reading.ts'

/*
 * "If the whole knee is complaining, the next run becomes an elliptical session and the next
 * lift's lower-body work runs at Phase 1 loads" (program.md's back-off line; PROGRAM-QUESTIONS 6,
 * Shawn's Nov 1 answer). A morning that reads back-off sends every lower-body slot of the next lift
 * to its back-off prescription, whatever each exercise's own readings say. From Phase 2 on the last
 * Phase 1 load is a floor under the cut: the load is the lower of load × 0.75 (rounded down to the
 * increment) and the last load logged for that exercise in Phase 1, when there is one. The next
 * run's elliptical swap is weekPlan.ts's.
 */

/** program.md's lower-body work: every pattern but pressing, pulling, core, carries and cardio. */
export const LOWER_BODY_PATTERNS: ReadonlySet<Pattern> = new Set<Pattern>(['squat', 'quad', 'hinge', 'single-leg', 'hamstring', 'hip', 'calf', 'balance', 'plyo'])

/** Whether a slot's exercise is lower-body work. Asked of the slot's own exercise: its job, whatever it runs today. */
export function isLowerBody(exercise: Pick<Exercise, 'pattern'>): boolean {
  return LOWER_BODY_PATTERNS.has(exercise.pattern)
}

export interface KneeMorning {
  /** The day of the morning check that read back-off. */
  date: IsoDate
  reasons: string[]
}

const happened = (w: Workout) => w.status === 'finished' || w.status === 'abandoned'

/**
 * The morning that makes a lift on `date` the next lift: the latest morning check on or before that
 * day that reads back-off, with no lift that happened (finished or abandoned) dated from its day to
 * the day before `date`. A later morning that reads clean doesn't undo it: the lift is still the
 * next one after the morning that complained. Null when there is none.
 */
export function kneeMorning(checks: readonly MorningCheck[], workouts: readonly Workout[], date: IsoDate): KneeMorning | null {
  const lifts = workouts.filter((w) => happened(w) && w.date < date)
  const complaining = checks
    .filter((c) => c.date <= date && !lifts.some((w) => w.date >= c.date))
    .map((c) => ({ date: c.date, reading: morningReading(c) }))
    .filter((c) => c.reading.result === 'back-off')
    .sort((a, b) => b.date.localeCompare(a.date))
  const latest = complaining[0]
  return latest ? { date: latest.date, reasons: latest.reading.reasons } : null
}

const SIDES: readonly SetSide[] = ['left', 'right', 'both']

/**
 * The last load logged for an exercise in Phase 1, per side: the first set of each side's last
 * Phase 1 session, read from the workouts' phase field. A rack-capped session isn't a load the
 * exercise ran at, so it doesn't count (gymLoads.ts). Empty with no Phase 1 history.
 */
export function phaseOneLoads(records: readonly WorkoutRecord[], exerciseId: string): Partial<Record<SetSide, LoggedLoad>> {
  const sets = lastSetsBySide(baselineRecords(records.filter((r) => r.workout.phase === 1)), exerciseId)
  const out: Partial<Record<SetSide, LoggedLoad>> = {}
  for (const side of SIDES) {
    const first = sets.filter((s) => s.side === side).sort((a, b) => a.setNumber - b.setNumber)[0]
    if (first) out[side] = { load: first.load, loadUnit: first.loadUnit }
  }
  return out
}

/**
 * What `prescribe` reads for one slot of the lift: nothing without a morning that read back-off, or
 * for a slot whose own exercise isn't lower-body work; otherwise the morning, and from Phase 2 on the
 * last Phase 1 loads of the exercise the slot runs (none in Phase 1, where "Phase 1 loads" are the
 * loads themselves, so load × 0.75 stands alone).
 */
export function wholeKneeFor(input: {
  morning: KneeMorning | null
  /** The slot's own exercise. */
  own: Pick<Exercise, 'pattern'>
  /** The exercise the slot runs today. */
  exerciseId: string
  /** The phase of the lift being planned. */
  phase: number
  records: readonly WorkoutRecord[]
}): WholeKnee | undefined {
  if (input.morning === null || !isLowerBody(input.own)) return undefined
  return { morning: input.morning.date, phaseOneLoads: input.phase >= 2 ? phaseOneLoads(input.records, input.exerciseId) : {} }
}
