import { describe, expect, it } from 'vitest'
import type { MileageWeek, Run, WeeklyTemplate, Workout } from '../schema/index.ts'
import type { SubjectReading } from './history.ts'
import { readingsInWeek, runTypeFor, runsInWeek, sessionDone, suggestRun, targetForWeek, weekDays, weekMilesSummary } from './weekPlan.ts'

const START = '2026-11-02'
const plan: MileageWeek[] = [10, 11, 12, 9, 13, 14, 15, 11, 16, 17, 18, 14].map((targetMiles, i) => ({ week: i + 1, targetMiles, isDown: [4, 8, 12].includes(i + 1) }))
const TEMPLATE: WeeklyTemplate = { mon: 'run:mbr', tue: 'lift:A', wed: 'run:easy', thu: 'lift:B', fri: 'run:long', sat: 'lift:C', sun: 'off' }
const run = (date: string, miles: number, type: Run['type'] = 'easy'): Run => ({ id: `r-${date}`, date, type, miles, minutes: 30, effort: 'easy', maxPain: 1, strides: false, tempo: false })
const reading = (date: string, result: SubjectReading['result'], kind: SubjectReading['kind'] = 'run'): SubjectReading => ({ kind, id: `${kind}-${date}`, date, result })

describe('week assembly', () => {
  it('puts runs and readings in their program week', () => {
    const runs = [run('2026-11-08', 3), run('2026-11-09', 3)]
    expect(runsInWeek(runs, START, 1).map((r) => r.date)).toEqual(['2026-11-08'])
    expect(readingsInWeek([reading('2026-11-09', 'clean')], START, 2)).toHaveLength(1)
  })
})

describe('targetForWeek (rule 7 from the logs)', () => {
  it("worked example: week 2's Friday run reads hold; week 3 is capped at week 2's actual miles, not 12", () => {
    const runs = [run('2026-11-09', 3, 'mbr'), run('2026-11-11', 3), run('2026-11-13', 4.5, 'long')]
    const readings = [reading('2026-11-09', 'clean'), reading('2026-11-11', 'clean'), reading('2026-11-13', 'hold')]
    expect(targetForWeek(plan, 3, START, runs, readings)).toMatchObject({ target: 10.5, capped: true })
  })
  it('a clean week leaves the next on plan; week 1 is the plan', () => {
    expect(targetForWeek(plan, 3, START, [run('2026-11-09', 3)], [reading('2026-11-09', 'clean')]).target).toBe(12)
    expect(targetForWeek(plan, 1, START, [], []).target).toBe(10)
  })
  it('a workout reading hold caps runs too', () => {
    expect(targetForWeek(plan, 3, START, [run('2026-11-09', 3)], [reading('2026-11-10', 'hold', 'workout')]).target).toBe(3)
  })
  it('a week with nothing logged caps nothing (PROGRAM-QUESTIONS 56)', () => {
    expect(targetForWeek(plan, 2, START, [], [])).toMatchObject({ target: 11, capped: false })
  })
  it('swaps add no miles to the cap', () => {
    const runs = [run('2026-11-09', 0, 'elliptical-swap'), run('2026-11-11', 3)]
    expect(targetForWeek(plan, 3, START, runs, [reading('2026-11-11', 'hold')]).target).toBe(3)
  })
})

describe('suggestRun', () => {
  const base = { week: 1, target: 10, milesSoFar: 0, currentPhase: 1, phaseWeek: 1, morning: 'clean' as const }
  it('maps sessions to run types', () => {
    expect(runTypeFor('run:long')).toBe('long')
    expect(runTypeFor('lift:A')).toBeNull()
    expect(suggestRun({ ...base, session: 'off' })).toBeNull()
  })
  it('splits the week: long run 40% to the half mile, the others share the rest', () => {
    expect(suggestRun({ ...base, session: 'run:long' })?.miles).toBe(4)
    expect(suggestRun({ ...base, session: 'run:mbr' })?.miles).toBe(3)
  })
  it('never suggests more than what is left under the ceiling', () => {
    const s = suggestRun({ ...base, session: 'run:long', milesSoFar: 7.5 })
    expect(s?.miles).toBe(2.5)
    expect(s?.reasons.join(' ')).toContain('capped')
  })
  it('strides on Wednesdays and the tempo on Fridays from the third week, in Phase 3 only', () => {
    expect(suggestRun({ ...base, session: 'run:easy', currentPhase: 3, phaseWeek: 1 })?.strides).toBe(true)
    expect(suggestRun({ ...base, session: 'run:easy', currentPhase: 2, phaseWeek: 4 })?.strides).toBe(false)
    expect(suggestRun({ ...base, session: 'run:long', currentPhase: 3, phaseWeek: 2 })?.tempo).toBe(false)
    expect(suggestRun({ ...base, session: 'run:long', currentPhase: 3, phaseWeek: 3 })?.tempo).toBe(true)
  })
  it('a faster Friday every week from Phase 2, never in a deload week or on top of the tempo', () => {
    expect(suggestRun({ ...base, session: 'run:long', currentPhase: 2, phaseWeek: 2, week: 5 })?.fasterAllowed).toBe(true)
    expect(suggestRun({ ...base, session: 'run:long', currentPhase: 2, phaseWeek: 3, week: 6 })?.fasterAllowed).toBe(true)
    expect(suggestRun({ ...base, session: 'run:long', currentPhase: 2, phaseWeek: 1, week: 4 })?.fasterAllowed).toBe(false)
    expect(suggestRun({ ...base, session: 'run:long', currentPhase: 1, phaseWeek: 2, week: 2 })?.fasterAllowed).toBe(false)
    expect(suggestRun({ ...base, session: 'run:easy', currentPhase: 2, phaseWeek: 2, week: 5 })?.fasterAllowed).toBe(false)
    expect(suggestRun({ ...base, session: 'run:long', currentPhase: 3, phaseWeek: 1, week: 9 })?.fasterAllowed).toBe(true)
    expect(suggestRun({ ...base, session: 'run:long', currentPhase: 3, phaseWeek: 3, week: 11 })).toMatchObject({ tempo: true, fasterAllowed: false })
  })
  it('a hold or back-off morning suggests the swap and drops the hard parts', () => {
    const s = suggestRun({ ...base, session: 'run:long', currentPhase: 3, phaseWeek: 3, morning: 'hold' })
    expect(s).toMatchObject({ swapSuggested: true, tempo: false })
    expect(suggestRun({ ...base, session: 'run:easy', morning: 'back-off' })?.swapSuggested).toBe(true)
  })
  it('the reasons come from the final call: no strides, tempo or faster line on a hold or back-off morning', () => {
    const hard = /strides|comfortably-hard|faster/
    for (const morning of ['hold', 'back-off'] as const) {
      const faster = suggestRun({ ...base, session: 'run:long', currentPhase: 2, phaseWeek: 2, week: 5, morning })
      expect(faster).toMatchObject({ swapSuggested: true, fasterAllowed: false })
      expect(faster?.reasons).toHaveLength(1)
      expect(faster?.reasons.join(' ')).not.toMatch(hard)
      expect(suggestRun({ ...base, session: 'run:easy', currentPhase: 3, phaseWeek: 3, week: 10, morning })?.reasons.join(' ')).not.toMatch(hard)
      expect(suggestRun({ ...base, session: 'run:long', currentPhase: 3, phaseWeek: 3, week: 10, morning })?.reasons.join(' ')).not.toMatch(hard)
    }
    const clean = suggestRun({ ...base, session: 'run:long', currentPhase: 3, phaseWeek: 3, week: 10 })
    expect(clean?.reasons).toEqual(['carry a 2 × 5 min comfortably-hard segment with 3 min easy between'])
  })
  it('says when no morning check was logged', () => {
    expect(suggestRun({ ...base, session: 'run:easy', morning: null })?.reasons[0]).toContain('no morning check')
  })
})

describe('weekDays', () => {
  const workout = (date: string, status: Workout['status']): Workout => ({ id: `w-${date}`, date, templateId: 'p1-a', phase: 1, week: 1, isDeload: false, status })
  it('marks each day done, missed, today, upcoming or off, with its worst reading', () => {
    const days = weekDays({
      startDate: START, week: 1, today: '2026-11-05', template: TEMPLATE, moves: [],
      runs: [run('2026-11-02', 3, 'mbr')], workouts: [workout('2026-11-03', 'finished')],
      readings: [reading('2026-11-02', 'clean'), reading('2026-11-03', 'hold', 'workout')],
    })
    expect(days.map((d) => d.status)).toEqual(['done', 'done', 'missed', 'today', 'upcoming', 'upcoming', 'off'])
    expect(days[1]?.reading).toBe('hold')
    expect(days[0]?.date).toBe('2026-11-02')
  })
  it('is done only when what was logged is the day’s session; anything else keeps the date’s status and stays listed', () => {
    // Thu Nov 5. Tue (Session A) has only a jog; Wed (easy run) only a workout; Mon a swap; Sun a run.
    const days = weekDays({
      startDate: START, week: 1, today: '2026-11-05', template: TEMPLATE, moves: [],
      runs: [run('2026-11-02', 0, 'rower-swap'), run('2026-11-03', 2), run('2026-11-05', 3, 'long'), run('2026-11-08', 2)],
      workouts: [workout('2026-11-04', 'finished')],
      readings: [],
    })
    expect(days.map((d) => `${d.day}:${d.status}`)).toEqual(['mon:done', 'tue:missed', 'wed:missed', 'thu:today', 'fri:upcoming', 'sat:upcoming', 'sun:done'])
    expect(days[1]?.runs.map((r) => r.date)).toEqual(['2026-11-03'])
    expect(days[2]?.workouts.map((w) => w.date)).toEqual(['2026-11-04'])
    expect(days[3]?.runs.map((r) => r.type)).toEqual(['long'])
  })
  it('an abandoned workout counts as the lift day’s session; one still open or only planned does not', () => {
    const days = weekDays({
      startDate: START, week: 1, today: '2026-11-08', template: TEMPLATE, moves: [],
      runs: [], workouts: [workout('2026-11-03', 'abandoned'), workout('2026-11-05', 'in-progress'), workout('2026-11-07', 'planned')], readings: [],
    })
    expect([days[1]?.status, days[3]?.status, days[5]?.status]).toEqual(['done', 'missed', 'missed'])
  })
  it('sessionDone: a lift needs a workout that happened, a run day a run or swap, an off day anything', () => {
    const jog = [{ date: '2026-11-03' }]
    expect(sessionDone('lift:A', jog, [])).toBe(false)
    expect(sessionDone('lift:A', [], [{ status: 'abandoned' }])).toBe(true)
    expect(sessionDone('lift:A', [], [{ status: 'in-progress' }])).toBe(false)
    expect(sessionDone('run:easy', [], [{ status: 'finished' }])).toBe(false)
    expect(sessionDone('run:easy', jog, [])).toBe(true)
    expect(sessionDone('off', [], [{ status: 'finished' }])).toBe(true)
    expect(sessionDone('off', [], [])).toBe(false)
  })
  it('a moved run on a lift day’s date is done once the run is logged there', () => {
    const days = weekDays({ startDate: START, week: 1, today: '2026-11-08', template: TEMPLATE, moves: [{ id: 'm', week: 1, dayA: 'thu', dayB: 'fri' }], runs: [run('2026-11-05', 4, 'long')], workouts: [], readings: [] })
    expect([days[3]?.session, days[3]?.status, days[4]?.session, days[4]?.status]).toEqual(['run:long', 'done', 'lift:B', 'missed'])
  })
  it('follows session moves', () => {
    const days = weekDays({ startDate: START, week: 1, today: '2026-11-01', template: TEMPLATE, moves: [{ id: 'm', week: 1, dayA: 'thu', dayB: 'fri' }], runs: [], workouts: [], readings: [] })
    expect(days[3]?.session).toBe('run:long')
    expect(days[4]?.session).toBe('lift:B')
  })
})

describe('weekMilesSummary', () => {
  it('counts miles, sessions and swaps against the target', () => {
    const runs = [run('2026-11-02', 3, 'mbr'), run('2026-11-04', 0, 'rower-swap'), run('2026-11-06', 4, 'long')]
    expect(weekMilesSummary(plan, 1, START, runs, [])).toMatchObject({ miles: 7, sessions: 3, swaps: 1, target: { target: 10 } })
  })
})
