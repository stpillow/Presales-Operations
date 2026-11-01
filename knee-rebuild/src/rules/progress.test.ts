import { describe, expect, it } from 'vitest'
import type { MileageWeek, Run, SetLog, Settings, Workout } from '../schema/index.ts'
import { attachChecks, type SubjectReading } from './history.ts'
import { advancePhase, consecutiveCleanDays, loadSeries, milesSeries, symmetrySeries } from './progress.ts'

const workout = (id: string, date: string, status: Workout['status'] = 'finished'): Workout => ({ id, date, templateId: 'p2-b', phase: 2, week: 5, isDeload: false, status })
const set = (workoutId: string, side: SetLog['side'], n: number, load: number, reps: number, exerciseId = 'bulgarian-split-squat'): SetLog => ({ id: `${workoutId}-${side}-${n}`, workoutId, slotId: 'p2b-1', exerciseId, setNumber: n, side, load, loadUnit: 'lb', reps, painDuring: 1, stopped: false })

describe('loadSeries', () => {
  it('takes the heaviest set per side per session, oldest first, finished or abandoned only', () => {
    const records = attachChecks(
      [workout('w2', '2026-12-08'), workout('w1', '2026-12-01'), workout('w3', '2026-12-15', 'in-progress')],
      [set('w1', 'right', 1, 20, 8), set('w1', 'right', 2, 25, 6), set('w1', 'left', 1, 25, 8), set('w2', 'right', 1, 25, 8), set('w3', 'right', 1, 30, 8)],
      [],
    )
    expect(loadSeries(records, 'bulgarian-split-squat')).toEqual([
      { date: '2026-12-01', side: 'right', load: 25, count: 6 },
      { date: '2026-12-01', side: 'left', load: 25, count: 8 },
      { date: '2026-12-08', side: 'right', load: 25, count: 8 },
    ])
  })
})

describe('symmetrySeries (PROGRAM-QUESTIONS 59)', () => {
  it('compares loads when they differ, counts when they match', () => {
    const records = attachChecks(
      [workout('w1', '2026-12-01'), workout('w2', '2026-12-08')],
      [set('w1', 'right', 1, 20, 8), set('w1', 'left', 1, 25, 8), set('w2', 'right', 1, 25, 7), set('w2', 'left', 1, 25, 8)],
      [],
    )
    expect(symmetrySeries(records, 'bulgarian-split-squat', 'right')).toEqual([
      { date: '2026-12-01', percent: 80, basis: 'load', injured: 20, other: 25 },
      { date: '2026-12-08', percent: 87.5, basis: 'count', injured: 7, other: 8 },
    ])
  })
  it('skips a session missing either side', () => {
    const records = attachChecks([workout('w1', '2026-12-01')], [set('w1', 'right', 1, 20, 8)], [])
    expect(symmetrySeries(records, 'bulgarian-split-squat', 'right')).toEqual([])
  })
})

describe('milesSeries', () => {
  it('puts actual miles against every planned week; swaps add none', () => {
    const plan: MileageWeek[] = [{ week: 1, targetMiles: 10, isDown: false }, { week: 2, targetMiles: 11, isDown: false }]
    const run = (date: string, miles: number, type: Run['type'] = 'easy'): Run => ({ id: date, date, type, miles, minutes: 30, effort: 'easy', maxPain: 1, strides: false, tempo: false })
    expect(milesSeries(plan, [run('2026-11-02', 3), run('2026-11-04', 0, 'rower-swap'), run('2026-11-10', 4)], '2026-11-02')).toEqual([
      { week: 1, planned: 10, actual: 3, isDown: false },
      { week: 2, planned: 11, actual: 4, isDown: false },
    ])
  })
})

describe('consecutiveCleanDays', () => {
  const r = (date: string, result: SubjectReading['result']): SubjectReading => ({ kind: 'workout', id: date, date, result })
  it('counts from the day after the last hold or back-off through today', () => {
    expect(consecutiveCleanDays([r('2026-11-03', 'clean'), r('2026-11-05', 'hold'), r('2026-11-07', 'clean')], '2026-11-10')).toBe(5)
  })
  it('counts from the first reading when none was bad, and is 0 with no readings or a bad reading today', () => {
    expect(consecutiveCleanDays([r('2026-11-03', 'clean')], '2026-11-03')).toBe(1)
    expect(consecutiveCleanDays([r('2026-11-03', 'clean')], '2026-11-09')).toBe(7)
    expect(consecutiveCleanDays([], '2026-11-09')).toBe(0)
    expect(consecutiveCleanDays([r('2026-11-09', 'back-off')], '2026-11-09')).toBe(0)
  })
})

describe('advancePhase (rule 8)', () => {
  const settings: Settings = { injuredSide: 'right', startDate: '2026-11-02', dumbbellMax: 80, restTimerSeconds: 60, painPerSet: false, currentPhase: 1, phaseEnteredWeek: 1, redFlag: { active: false, items: [] } }
  it('moves to the next phase, entered in the confirming week', () => {
    expect(advancePhase(settings, { number: 1, toPhase: 2 }, true, 4)).toMatchObject({ currentPhase: 2, phaseEnteredWeek: 4 })
  })
  it('refuses a gate that does not pass, or one for another phase', () => {
    expect(() => advancePhase(settings, { number: 1, toPhase: 2 }, false, 4)).toThrow()
    expect(() => advancePhase(settings, { number: 2, toPhase: 3 }, true, 8)).toThrow()
  })
})
