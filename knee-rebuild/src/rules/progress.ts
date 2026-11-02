import type { IsoDate, MileageWeek, MorningCheck, Run, SetLog, Settings, Side } from '../schema/index.ts'
import { addDays, daysBetween, weekOf } from './calendar.ts'
import type { SubjectReading, WorkoutRecord } from './history.ts'
import { weekMiles } from './mileage.ts'
import { morningCheckApplies } from './reading.ts'
import { symmetryPercent } from './unilateral.ts'

const happened = (r: WorkoutRecord) => r.workout.status === 'finished' || r.workout.status === 'abandoned'

/** The set that stands for a side in one session: the heaviest load, then the most reps or seconds. */
function bestSet(sets: readonly SetLog[]): SetLog | undefined {
  return [...sets].sort((a, b) => b.load - a.load || (b.reps ?? b.seconds ?? 0) - (a.reps ?? a.seconds ?? 0))[0]
}

const count = (s: SetLog) => s.reps ?? s.seconds ?? 0

export interface LoadPoint {
  date: IsoDate
  side: SetLog['side']
  load: number
  count: number
}

/** Load over time for one exercise: per session and side, the heaviest set. Stopped sets count as logged. */
export function loadSeries(records: readonly WorkoutRecord[], exerciseId: string): LoadPoint[] {
  const points: LoadPoint[] = []
  for (const record of records) {
    if (!happened(record)) continue
    const own = record.sets.filter((s) => s.exerciseId === exerciseId)
    for (const side of new Set(own.map((s) => s.side))) {
      const best = bestSet(own.filter((s) => s.side === side))
      if (best) points.push({ date: record.workout.date, side, load: best.load, count: count(best) })
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}

export interface SymmetryPoint {
  date: IsoDate
  percent: number
  /** What was compared: the heaviest loads when they differ (a 0 included), else the counts. */
  basis: 'load' | 'count'
  injured: number
  other: number
}

/**
 * Symmetry over time for a two-sided exercise: per session, the injured side's best set over the
 * other side's. Loads are compared whenever they differ, a 0 included (the healthy side may lift
 * more, rule 5): the injured side at bodyweight against 20 lb reads 0%, as the gate's load test
 * reads it, never 100% by counts. Only when the loads are equal (both 0 included) are the reps or
 * seconds compared, since rule 5 sets the healthy side's count from the injured side's. A session
 * where only the other side carried no load has no percent and is left out (PROGRAM-QUESTIONS 111).
 */
export function symmetrySeries(records: readonly WorkoutRecord[], exerciseId: string, injuredSide: Side): SymmetryPoint[] {
  const other: Side = injuredSide === 'left' ? 'right' : 'left'
  const points: SymmetryPoint[] = []
  for (const record of records) {
    if (!happened(record)) continue
    const own = record.sets.filter((s) => s.exerciseId === exerciseId)
    const a = bestSet(own.filter((s) => s.side === injuredSide))
    const b = bestSet(own.filter((s) => s.side === other))
    if (!a || !b) continue
    const byLoad = a.load !== b.load
    const injured = byLoad ? a.load : count(a)
    const healthy = byLoad ? b.load : count(b)
    const percent = symmetryPercent(injured, healthy)
    if (percent !== null) points.push({ date: record.workout.date, percent, basis: byLoad ? 'load' : 'count', injured, other: healthy })
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}

export interface MilesWeek {
  week: number
  planned: number
  actual: number
  isDown: boolean
}

/** Weekly miles, actual against the plan, for every week of the plan (swaps add no miles). */
export function milesSeries(plan: readonly MileageWeek[], runs: readonly Run[], startDate: IsoDate): MilesWeek[] {
  return plan.map((w) => ({ week: w.week, planned: w.targetMiles, isDown: w.isDown, actual: weekMiles(runs.filter((r) => weekOf(r.date, startDate) === w.week)) }))
}

/**
 * A reading still waiting on its morning check: the session or run is dated today or yesterday,
 * so its check can still be logged, and no check applies to it yet (morningCheckApplies, an
 * explicit link included). Older than that, a missing check is final: the reading is hold, as
 * everywhere else (rule 3).
 */
export function awaitingMorningCheck(reading: Pick<SubjectReading, 'kind' | 'id' | 'date' | 'result'>, checks: readonly MorningCheck[], today: IsoDate): boolean {
  if (reading.date > today || reading.date < addDays(today, -1)) return false
  // Without a check a reading is the session's own, held at hold or worse; back-off can only have
  // come from the session's pain, and no check makes it better, so it breaks the count at once.
  if (reading.result === 'back-off') return false
  return !checks.some((c) => morningCheckApplies(c, reading))
}

/**
 * Consecutive clean days: the days from the day after the most recent hold or back-off reading
 * through the last fully read day. With no reading at all there is nothing to count. A day without
 * a session doesn't break the run; a reading that isn't clean does. A session still waiting on its
 * morning check (awaitingMorningCheck) neither extends nor breaks it: its day and any after it
 * aren't counted yet, so the run counts back from the day before the earliest one waiting, and
 * once the check is in its reading counts as usual (PROGRAM-QUESTIONS 109).
 */
export function consecutiveCleanDays(readings: readonly SubjectReading[], today: IsoDate, checks: readonly MorningCheck[]): number {
  const past = readings.filter((r) => r.date <= today).sort((a, b) => a.date.localeCompare(b.date))
  const waiting = past.filter((r) => awaitingMorningCheck(r, checks, today))
  const read = past.filter((r) => !awaitingMorningCheck(r, checks, today))
  if (read.length === 0) return 0
  const firstWaiting = waiting[0]?.date
  const through = firstWaiting ? addDays(firstWaiting, -1) : today
  const lastBad = read.filter((r) => r.result !== 'clean').at(-1)
  const from = lastBad ? addDays(lastBad.date, 1) : read[0]?.date
  if (!from || from > through) return 0
  return daysBetween(from, through) + 1
}

/**
 * Rule 8's last step: a passing gate advances the phase only when Shawn confirms, and the new phase
 * is entered in the week it is confirmed. Refuses anything else.
 */
export function advancePhase(settings: Settings, gate: { number: number; toPhase: number }, passes: boolean, week: number): Settings {
  if (!passes) throw new Error(`gate ${gate.number} has items that don't pass yet`)
  if (gate.toPhase !== settings.currentPhase + 1) throw new Error(`gate ${gate.number} leads to phase ${gate.toPhase}, not the phase after ${settings.currentPhase}`)
  return { ...settings, currentPhase: gate.toPhase, phaseEnteredWeek: Math.max(1, week) }
}
