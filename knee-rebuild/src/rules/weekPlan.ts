import type { Day, DaySession, IsoDate, MileageWeek, ReadingResult, Run, RunType, SessionMove, WeeklyTemplate, Workout } from '../schema/index.ts'
import { DAYS, dateOf, isDeloadWeek, weekOf, weekSchedule } from './calendar.ts'
import type { SubjectReading } from './history.ts'
import { isSwap, runSplit, weekMiles, weekTarget, type WeekTarget } from './mileage.ts'

export function runsInWeek(runs: readonly Run[], startDate: IsoDate, week: number): Run[] {
  return runs.filter((r) => weekOf(r.date, startDate) === week)
}

export function readingsInWeek(readings: readonly SubjectReading[], startDate: IsoDate, week: number): SubjectReading[] {
  return readings.filter((r) => weekOf(r.date, startDate) === week)
}

/**
 * Rule 7 assembled from the logs: the plan's number, capped at last week's actual miles when any
 * run or workout last week read hold or back-off. A week with nothing logged caps nothing: it is
 * unknown, and the plan is already a ceiling (PROGRAM-QUESTIONS 56).
 */
export function targetForWeek(plan: readonly MileageWeek[], week: number, startDate: IsoDate, runs: readonly Run[], readings: readonly SubjectReading[]): WeekTarget {
  if (week <= 1) return weekTarget(plan, week, null)
  const previousReadings = readingsInWeek(readings, startDate, week - 1).map((r) => r.result)
  if (previousReadings.length === 0) return weekTarget(plan, week, null)
  return weekTarget(plan, week, { readings: previousReadings, actualMiles: weekMiles(runsInWeek(runs, startDate, week - 1)) })
}

const RUN_TYPE: Partial<Record<DaySession, RunType>> = { 'run:mbr': 'mbr', 'run:easy': 'easy', 'run:long': 'long' }

export function runTypeFor(session: DaySession): RunType | null {
  return RUN_TYPE[session] ?? null
}

export interface RunSuggestion {
  type: RunType
  /** Suggested miles: the run's share of the target, never more than what is left under the week's ceiling. Null outside the plan. */
  miles: number | null
  strides: boolean
  tempo: boolean
  /** One faster effort is allowed on this run (PROGRAM-QUESTIONS 29). */
  fasterAllowed: boolean
  /** An elliptical or rower swap is suggested instead. */
  swapSuggested: boolean
  reasons: string[]
}

/**
 * What a scheduled run should be. Strides on Wednesdays and the tempo on Fridays come from
 * Phase 3 ("from week 8", "from week 10 if Gate 2 was clean": being in Phase 3 means Gate 2
 * passed), counted from the week the phase was entered. A hold or back-off morning suggests a swap.
 */
export function suggestRun(input: {
  session: DaySession
  week: number
  target: number | null
  /** Miles already logged this week, swaps excluded. */
  milesSoFar: number
  currentPhase: number
  phaseWeek: number
  /** Today's morning reading, or null when no check was logged today. */
  morning: ReadingResult | null
}): RunSuggestion | null {
  const type = runTypeFor(input.session)
  if (!type) return null
  const reasons: string[] = []
  let miles: number | null = null
  if (input.target !== null) {
    const split = runSplit(input.target)
    const share = type === 'long' ? split.long : split.others
    const left = Math.max(0, input.target - input.milesSoFar)
    miles = Math.round(Math.min(share, left) * 4) / 4
    if (share > left) reasons.push(`capped at the ${left} miles left under this week's ${input.target}`)
  }
  const phase3 = input.currentPhase >= 3
  const strides = type === 'easy' && phase3
  const tempo = type === 'long' && phase3 && input.phaseWeek >= 3
  // Every Friday from Phase 2 on, never in a deload week, and not on top of Phase 3's tempo,
  // which is that Friday's hard effort (PROGRAM-QUESTIONS 29, Shawn's Nov 1 call).
  const fasterAllowed = type === 'long' && input.currentPhase >= 2 && !isDeloadWeek(input.week) && !tempo
  if (strides) reasons.push('finish with 4 × 15 s strides building to about 85%, full walk-back between')
  if (tempo) reasons.push('carry a 2 × 5 min comfortably-hard segment with 3 min easy between')
  if (fasterAllowed) reasons.push('one faster effort is allowed today')
  let swapSuggested = false
  if (input.morning === 'back-off') {
    swapSuggested = true
    reasons.unshift('this morning read back off: make it 30 to 40 minutes on the elliptical or rower')
  } else if (input.morning === 'hold') {
    swapSuggested = true
    reasons.unshift('this morning read hold: an elliptical or rower swap at the same effort is the call')
  } else if (input.morning === null) {
    reasons.unshift('no morning check yet today')
  }
  return { type, miles, strides: strides && !swapSuggested, tempo: tempo && !swapSuggested, fasterAllowed: fasterAllowed && !swapSuggested, swapSuggested, reasons }
}

export type DayStatus = 'done' | 'missed' | 'today' | 'upcoming' | 'off'

export interface WeekDay {
  day: Day
  date: IsoDate
  session: DaySession
  status: DayStatus
  /** The worst reading among the day's sessions, when one exists. */
  reading: ReadingResult | null
  runs: Run[]
  workouts: Workout[]
}

const RANK: Record<ReadingResult, number> = { clean: 0, hold: 1, 'back-off': 2 }

/** The seven days of a program week, after moves, with what happened on each. */
export function weekDays(input: {
  startDate: IsoDate
  week: number
  today: IsoDate
  template: WeeklyTemplate
  moves: readonly SessionMove[]
  runs: readonly Run[]
  workouts: readonly Workout[]
  readings: readonly SubjectReading[]
}): WeekDay[] {
  const schedule = weekSchedule(input.template, input.week, input.moves)
  return DAYS.map((day) => {
    const date = dateOf(input.startDate, input.week, day)
    const session = schedule[day]
    const runs = input.runs.filter((r) => r.date === date)
    const workouts = input.workouts.filter((w) => w.date === date && (w.status === 'finished' || w.status === 'abandoned'))
    const dayReadings = input.readings.filter((r) => r.date === date).map((r) => r.result)
    const reading = dayReadings.length ? dayReadings.reduce((a, b) => (RANK[b] > RANK[a] ? b : a)) : null
    const happened = runs.length > 0 || workouts.length > 0
    const status: DayStatus = happened ? 'done' : session === 'off' ? 'off' : date === input.today ? 'today' : date < input.today ? 'missed' : 'upcoming'
    return { day, date, session, status, reading, runs, workouts }
  })
}

export interface WeekMiles {
  target: WeekTarget
  miles: number
  sessions: number
  swaps: number
}

export function weekMilesSummary(plan: readonly MileageWeek[], week: number, startDate: IsoDate, runs: readonly Run[], readings: readonly SubjectReading[]): WeekMiles {
  const own = runsInWeek(runs, startDate, week)
  return { target: targetForWeek(plan, week, startDate, runs, readings), miles: weekMiles(own), sessions: own.length, swaps: own.filter(isSwap).length }
}
