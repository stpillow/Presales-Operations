import type { IsoDate, MileageWeek, Run, SetLog, Settings, Side } from '../schema/index.ts'
import { addDays, daysBetween, weekOf } from './calendar.ts'
import type { SubjectReading, WorkoutRecord } from './history.ts'
import { weekMiles } from './mileage.ts'
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
  /** What was compared: the heaviest loads, or the counts when the loads match or there is no load. */
  basis: 'load' | 'count'
  injured: number
  other: number
}

/**
 * Symmetry over time for a two-sided exercise: per session, the injured side's best set over the
 * other side's. Loads are compared when they differ (the healthy side may lift more, rule 5); when
 * they match or there is no load, the reps or seconds are (PROGRAM-QUESTIONS 59).
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
    const byLoad = a.load > 0 && b.load > 0 && a.load !== b.load
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
 * Consecutive clean days: the days from the day after the most recent hold or back-off reading
 * through today. With no reading at all there is nothing to count. A day without a session doesn't
 * break the run; a reading that isn't clean does.
 */
export function consecutiveCleanDays(readings: readonly SubjectReading[], today: IsoDate): number {
  const past = readings.filter((r) => r.date <= today)
  if (past.length === 0) return 0
  const lastBad = [...past].filter((r) => r.result !== 'clean').sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  const from = lastBad ? addDays(lastBad.date, 1) : [...past].sort((a, b) => a.date.localeCompare(b.date))[0]?.date
  if (!from || from > today) return 0
  return daysBetween(from, today) + 1
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
