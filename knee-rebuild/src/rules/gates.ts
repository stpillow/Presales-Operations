import type { Gate, GateItem, GateTest, IsoDate, MorningCheck, Run, SetLog, Workout } from '../schema/index.ts'
import { addDays } from './calendar.ts'
import type { SubjectReading } from './history.ts'
import { isSwap } from './mileage.ts'
import { morningCheckApplies, morningReading } from './reading.ts'
import { bestOfTrials, meetsSymmetry, symmetryPercent } from './unilateral.ts'

export interface GateContext {
  today: IsoDate
  injuredSide: 'left' | 'right'
  /** Every finished workout's and run's reading, dated. */
  readings: readonly SubjectReading[]
  gateTests: readonly GateTest[]
  morningChecks: readonly MorningCheck[]
  runs: readonly Run[]
  workouts: readonly Workout[]
  setLogs: readonly SetLog[]
  /** Which catalog exercises count as the single-leg calf raise. */
  calfRaiseExerciseIds: readonly string[]
}

export interface GateItemResult {
  item: GateItem
  pass: boolean
  detail: string
}

export interface GateResult {
  gate: Gate
  items: GateItemResult[]
  /** Every item passes. The phase still advances only when Shawn confirms. */
  passes: boolean
}

export const DEFAULT_WINDOW_DAYS = 14

function inWindow(date: IsoDate, today: IsoDate, windowDays: number): boolean {
  return date > addDays(today, -windowDays) && date <= today
}

function latestTest(tests: readonly GateTest[], gate: number, item: string, manual: boolean): GateTest | undefined {
  return [...tests]
    .filter((t) => t.gate === gate && t.item === item && t.manual === manual)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)
}

function cleanWeeks(item: GateItem, ctx: GateContext): GateItemResult {
  const window = item.windowDays ?? DEFAULT_WINDOW_DAYS
  const recent = ctx.readings.filter((r) => inWindow(r.date, ctx.today, window))
  const half = addDays(ctx.today, -Math.floor(window / 2))
  const firstHalf = recent.filter((r) => r.date <= half)
  const secondHalf = recent.filter((r) => r.date > half)
  const bad = recent.filter((r) => r.result !== 'clean')
  if (bad.length > 0) return { item, pass: false, detail: `${bad.length} of ${recent.length} readings in the last ${window} days read ${bad.map((b) => b.result).join(', ')}` }
  if (firstHalf.length === 0 || secondHalf.length === 0) return { item, pass: false, detail: `needs sessions in both of the last two weeks (${recent.length} readings so far)` }
  return { item, pass: true, detail: `${recent.length} readings in the last ${window} days, all clean` }
}

function symmetry(item: GateItem, gate: Gate, ctx: GateContext): GateItemResult {
  const test = item.testItem ? latestTest(ctx.gateTests, gate.number, item.testItem, false) : undefined
  const threshold = item.threshold ?? 0.9
  if (!test) return { item, pass: false, detail: 'no test entered yet' }
  const injured = test.trialsInjured?.length ? bestOfTrials(test.trialsInjured) : test.valueInjured
  const other = test.trialsOther?.length ? bestOfTrials(test.trialsOther) : test.valueOther
  const pct = symmetryPercent(injured, other)
  const pass = meetsSymmetry(injured, other, threshold)
  return { item, pass, detail: pct === null ? 'cannot compute: the other side is 0' : `${pct}% (${injured} vs ${other}) against a ${threshold * 100}% line, tested ${test.date}` }
}

function calfRaises(item: GateItem, ctx: GateContext): GateItemResult {
  const window = item.windowDays ?? DEFAULT_WINDOW_DAYS
  const minReps = item.minReps ?? 20
  const dates = new Map(ctx.workouts.map((w) => [w.id, w.date]))
  const sets = ctx.setLogs.filter((s) => {
    const date = dates.get(s.workoutId)
    return date !== undefined && inWindow(date, ctx.today, window) && ctx.calfRaiseExerciseIds.includes(s.exerciseId) && (s.reps ?? 0) >= minReps
  })
  const left = sets.some((s) => s.side === 'left')
  const right = sets.some((s) => s.side === 'right')
  if (left && right) return { item, pass: true, detail: `a set of ${minReps} or more on each side in the last ${window} days` }
  return { item, pass: false, detail: `${minReps}+ reps logged on ${left ? 'left only' : right ? 'right only' : 'neither side'} in the last ${window} days` }
}

function noSwelling(item: GateItem, ctx: GateContext, needsPlyo: boolean): GateItemResult {
  const window = item.windowDays ?? DEFAULT_WINDOW_DAYS
  const checks = ctx.morningChecks.filter((c) => inWindow(c.date, ctx.today, window))
  const swollen = checks.filter((c) => c.visibleSwelling)
  if (checks.length === 0) return { item, pass: false, detail: `no morning checks in the last ${window} days` }
  if (swollen.length > 0) return { item, pass: false, detail: `swelling flagged on ${swollen.map((c) => c.date).join(', ')}` }
  if (needsPlyo) {
    const plyo = ctx.workouts.filter((w) => w.status === 'finished' && w.phase === 3 && /-(a|c)$/.test(w.templateId) && inWindow(w.date, ctx.today, window))
    if (plyo.length === 0) return { item, pass: false, detail: `no Phase 3 A or C session in the last ${window} days` }
    return { item, pass: true, detail: `${plyo.length} plyo sessions and ${checks.length} morning checks in the last ${window} days, no swelling` }
  }
  return { item, pass: true, detail: `${checks.length} morning checks in the last ${window} days, no swelling` }
}

function runNoReaction(item: GateItem, ctx: GateContext): GateItemResult {
  const minMiles = item.minMiles ?? 4
  const qualifying = ctx.runs.filter((r) => !isSwap(r) && r.miles >= minMiles)
  const clean = qualifying.find((run) => {
    const subject = { kind: 'run' as const, id: run.id, date: run.date }
    const check = ctx.morningChecks.find((c) => c.appliesTo?.kind === 'run' && c.appliesTo.id === run.id) ?? ctx.morningChecks.find((c) => morningCheckApplies(c, subject))
    return check !== undefined && morningReading(check).result === 'clean' && run.maxPain <= 3
  })
  if (clean) return { item, pass: true, detail: `${clean.miles} miles on ${clean.date} with a clean morning after` }
  if (qualifying.length === 0) return { item, pass: false, detail: `no run of ${minMiles} miles or more yet` }
  return { item, pass: false, detail: `${qualifying.length} runs of ${minMiles}+ miles, none with a clean morning check after` }
}

function manual(item: GateItem, gate: Gate, ctx: GateContext): GateItemResult {
  const test = latestTest(ctx.gateTests, gate.number, item.id, true)
  if (!test) return { item, pass: false, detail: 'not ticked' }
  return { item, pass: test.pass, detail: test.pass ? `ticked ${test.date}` : `unticked ${test.date}` }
}

/** Rule 8: evaluate every item of a gate from logged data and manual toggles. */
export function evaluateGate(gate: Gate, ctx: GateContext): GateResult {
  const items = gate.items.map((item) => {
    switch (item.evaluator) {
      case 'clean-weeks':
        return cleanWeeks(item, ctx)
      case 'symmetry':
        return symmetry(item, gate, ctx)
      case 'calf-raises':
        return calfRaises(item, ctx)
      case 'no-swelling':
        return noSwelling(item, ctx, false)
      case 'no-swelling-after-plyo':
        return noSwelling(item, ctx, true)
      case 'run-no-reaction':
        return runNoReaction(item, ctx)
      case 'manual':
        return manual(item, gate, ctx)
    }
  })
  return { gate, items, passes: items.every((i) => i.pass) }
}
