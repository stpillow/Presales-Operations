import { describe, expect, it } from 'vitest'
import type { MileageWeek, MorningCheck, Run, SessionMove, SetLog, Settings, WeeklyTemplate, Workout } from '../schema/index.ts'
import { attachChecks, type SubjectReading } from './history.ts'
import { advancePhase, awaitingMorningCheck, consecutiveCleanDays, loadSeries, milesSeries, phaseEntryWeek, symmetryLeftOut, symmetrySeries } from './progress.ts'

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

describe('symmetrySeries (PROGRAM-QUESTIONS 111)', () => {
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
  it('compares loads when one side carries none: bodyweight against a load is 0%, never 100% by counts', () => {
    // A back-off took the injured side's 5 lb to 0 (backOffLoad(5, 5)); the other side kept 20 lb. Both did 8 reps.
    const records = attachChecks(
      [workout('w1', '2026-12-15'), workout('w2', '2026-12-22')],
      [set('w1', 'right', 1, 0, 8), set('w1', 'right', 2, 0, 8), set('w1', 'left', 1, 20, 8), set('w1', 'left', 2, 20, 8), set('w2', 'right', 1, 0, 10), set('w2', 'left', 1, 0, 10)],
      [],
    )
    expect(symmetrySeries(records, 'bulgarian-split-squat', 'right')).toEqual([
      { date: '2026-12-15', percent: 0, basis: 'load', injured: 0, other: 20 },
      // No load on either side: the counts are compared.
      { date: '2026-12-22', percent: 100, basis: 'count', injured: 10, other: 10 },
    ])
  })
  it('leaves out a session where only the other side carried no load: there is no percent of 0 lb', () => {
    const records = attachChecks([workout('w1', '2026-12-15')], [set('w1', 'right', 1, 10, 8), set('w1', 'left', 1, 0, 8)], [])
    expect(symmetrySeries(records, 'bulgarian-split-squat', 'right')).toEqual([])
  })
  describe('compares like with like: sides on different steps, stages or ranges are left out, with the reason (PROGRAM-QUESTIONS 112)', () => {
    const step = (workoutId: string, side: SetLog['side'], load: number, reps: number, heightIn: number, exerciseId = 'lateral-step-down'): SetLog => ({ ...set(workoutId, side, 1, load, reps, exerciseId), heightIn })
    const hold = (workoutId: string, side: SetLog['side'], seconds: number, stage: number): SetLog => {
      const { reps: _reps, ...base } = set(workoutId, side, 1, 0, 0, 'single-leg-balance')
      return { ...base, seconds, stage }
    }

    it('a lateral step-down from 4 in. against 8 in. is not 100% by counts', () => {
      const records = attachChecks([workout('w1', '2026-11-10'), workout('w2', '2026-11-17')], [step('w1', 'right', 0, 10, 4), step('w1', 'left', 0, 10, 8), step('w2', 'right', 0, 8, 8), step('w2', 'left', 0, 10, 8)], [])
      expect(symmetrySeries(records, 'lateral-step-down', 'right')).toEqual([{ date: '2026-11-17', percent: 80, basis: 'count', injured: 8, other: 10 }])
      expect(symmetryLeftOut(records, 'lateral-step-down', 'right')).toEqual([
        { date: '2026-11-10', reason: 'the sides stepped from different heights (4 in. on the injured side, 8 in. on the other)' },
      ])
    })

    it('a step-up with more load on a lower step is not 200% by loads', () => {
      const records = attachChecks([workout('w1', '2026-11-10')], [step('w1', 'right', 10, 10, 4, 'step-up'), step('w1', 'left', 5, 10, 8, 'step-up')], [])
      expect(symmetrySeries(records, 'step-up', 'right')).toEqual([])
      expect(symmetryLeftOut(records, 'step-up', 'right')).toEqual([{ date: '2026-11-10', reason: 'the sides stepped from different heights (4 in. on the injured side, 8 in. on the other)' }])
    })

    it('the same step on both sides compares the loads, a 0 included', () => {
      const records = attachChecks([workout('w1', '2026-11-10')], [step('w1', 'right', 0, 10, 8, 'step-up'), step('w1', 'left', 10, 10, 8, 'step-up')], [])
      expect(symmetrySeries(records, 'step-up', 'right')).toEqual([{ date: '2026-11-10', percent: 0, basis: 'load', injured: 0, other: 10 }])
      expect(symmetryLeftOut(records, 'step-up', 'right')).toEqual([])
    })

    it('single-leg balance on different stages is left out; on the same stage the seconds compare', () => {
      const records = attachChecks([workout('w1', '2026-11-10'), workout('w2', '2026-11-17')], [hold('w1', 'right', 30, 0), hold('w1', 'left', 30, 2), hold('w2', 'right', 25, 1), hold('w2', 'left', 30, 1)], [])
      expect(symmetrySeries(records, 'single-leg-balance', 'right')).toEqual([{ date: '2026-11-17', percent: 83.3, basis: 'count', injured: 25, other: 30 }])
      expect(symmetryLeftOut(records, 'single-leg-balance', 'right')).toEqual([{ date: '2026-11-10', reason: 'the sides were on different stages (stage 1 on the injured side, stage 3 on the other)' }])
    })

    it('different range stops are left out too', () => {
      const ranged = (side: SetLog['side'], rangeStopDeg: number): SetLog => ({ ...set('w1', side, 1, 20, 8, 'split-squat'), rangeStopDeg })
      const records = attachChecks([workout('w1', '2026-11-10')], [ranged('right', 45), ranged('left', 30)], [])
      expect(symmetrySeries(records, 'split-squat', 'right')).toEqual([])
      expect(symmetryLeftOut(records, 'split-squat', 'right')).toEqual([{ date: '2026-11-10', reason: 'the sides stopped at different ranges (45° on the injured side, 30° on the other)' }])
    })

    it('says why a session with no percent is left out, and passes over one missing a side', () => {
      const records = attachChecks(
        [workout('w1', '2026-12-15'), workout('w2', '2026-12-22'), workout('w3', '2026-12-29')],
        [set('w1', 'right', 1, 10, 8), set('w1', 'left', 1, 0, 8), set('w2', 'right', 1, 20, 0), set('w2', 'left', 1, 20, 0), set('w3', 'right', 1, 20, 8)],
        [],
      )
      expect(symmetryLeftOut(records, 'bulgarian-split-squat', 'right')).toEqual([
        { date: '2026-12-15', reason: 'only the injured side carried a load (10 lb against 0 lb), so there is no percent' },
        { date: '2026-12-22', reason: 'the other side logged 0 reps, so there is no percent' },
      ])
    })
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
  const r = (date: string, result: SubjectReading['result'], kind: SubjectReading['kind'] = 'workout'): SubjectReading => ({ kind, id: date, date, result })
  const check = (date: string, appliesTo: MorningCheck['appliesTo'] = null): MorningCheck => ({
    id: `m-${date}`, date, appliesTo, stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [],
  })
  it('counts from the day after the last hold or back-off through today', () => {
    expect(consecutiveCleanDays([r('2026-11-03', 'clean'), r('2026-11-05', 'hold'), r('2026-11-07', 'clean')], '2026-11-10', [])).toBe(5)
  })
  it('counts from the first reading when none was bad, and is 0 with no readings or a bad reading today', () => {
    expect(consecutiveCleanDays([r('2026-11-03', 'clean')], '2026-11-04', [check('2026-11-04')])).toBe(2)
    expect(consecutiveCleanDays([r('2026-11-03', 'clean')], '2026-11-09', [])).toBe(7)
    expect(consecutiveCleanDays([], '2026-11-09', [])).toBe(0)
    // A check linked to today's session is in, so today's back-off counts.
    expect(consecutiveCleanDays([r('2026-11-09', 'back-off')], '2026-11-09', [check('2026-11-09', { kind: 'workout', id: '2026-11-09' })])).toBe(0)
  })

  describe('a session waiting on its morning check neither extends nor breaks the run (PROGRAM-QUESTIONS 109)', () => {
    // Nov 3's session read clean with Nov 4's check; nothing bad since.
    const before = [r('2026-11-03', 'clean')]
    const checks = [check('2026-11-04')]

    it('yesterday’s session with no check yet: the count runs back from the day before it', () => {
      expect(awaitingMorningCheck(r('2026-11-09', 'hold'), checks, '2026-11-10')).toBe(true)
      // Nov 3 to Nov 8: the hold Nov 9 reads until its check doesn't break the run, and Nov 9 and 10 don't count yet.
      expect(consecutiveCleanDays([...before, r('2026-11-09', 'hold')], '2026-11-10', checks)).toBe(6)
    })

    it('today’s session waits too, and the count runs through yesterday; so do two days waiting', () => {
      expect(awaitingMorningCheck(r('2026-11-10', 'hold', 'run'), checks, '2026-11-10')).toBe(true)
      expect(consecutiveCleanDays([...before, r('2026-11-10', 'hold', 'run')], '2026-11-10', checks)).toBe(7)
      expect(consecutiveCleanDays([...before, r('2026-11-09', 'hold'), r('2026-11-10', 'hold', 'run')], '2026-11-10', checks)).toBe(6)
    })

    it('once the check is in, the reading counts as usual', () => {
      const withCheck = [...checks, check('2026-11-10')]
      expect(awaitingMorningCheck(r('2026-11-09', 'clean'), withCheck, '2026-11-10')).toBe(false)
      expect(consecutiveCleanDays([...before, r('2026-11-09', 'clean')], '2026-11-10', withCheck)).toBe(8)
      expect(consecutiveCleanDays([...before, r('2026-11-09', 'hold')], '2026-11-10', withCheck)).toBe(1)
      // A check linked to today's run is that run's check.
      expect(consecutiveCleanDays([...before, r('2026-11-10', 'back-off', 'run')], '2026-11-10', [...checks, check('2026-11-10', { kind: 'run', id: '2026-11-10' })])).toBe(0)
    })

    it('a session that already reads back-off on its own pain breaks the count at once: no check can make it better', () => {
      expect(awaitingMorningCheck(r('2026-11-09', 'back-off'), checks, '2026-11-10')).toBe(false)
      // Nov 10 is the one day since the back-off on Nov 9.
      expect(consecutiveCleanDays([...before, r('2026-11-09', 'back-off')], '2026-11-10', checks)).toBe(1)
      expect(consecutiveCleanDays([...before, r('2026-11-10', 'back-off', 'run')], '2026-11-10', checks)).toBe(0)
    })

    it('a session older than yesterday with no check still reads hold, as today, and breaks the run', () => {
      expect(awaitingMorningCheck(r('2026-11-08', 'hold'), checks, '2026-11-10')).toBe(false)
      expect(consecutiveCleanDays([...before, r('2026-11-08', 'hold')], '2026-11-10', checks)).toBe(2)
    })

    it('a session waiting right after a hold leaves nothing to count yet, and so do waiting sessions alone', () => {
      expect(consecutiveCleanDays([r('2026-11-08', 'hold'), r('2026-11-09', 'hold')], '2026-11-10', [check('2026-11-09')])).toBe(0)
      expect(consecutiveCleanDays([r('2026-11-10', 'hold')], '2026-11-10', [])).toBe(0)
    })
  })
})

describe('advancePhase (rule 8)', () => {
  const settings: Settings = { injuredSide: 'right', startDate: '2026-11-02', dumbbellMax: 80, restTimerSeconds: 60, painPerSet: false, currentPhase: 1, phaseEnteredWeek: 1, redFlag: { active: false, items: [] }, activeLocationId: 'planet-fitness', kit: ['ankle-strap', 'mini-band'] }
  it('moves to the next phase, entered in the week given (phaseEntryWeek’s answer)', () => {
    expect(advancePhase(settings, { number: 1, toPhase: 2 }, true, 4)).toMatchObject({ currentPhase: 2, phaseEnteredWeek: 4 })
  })
  it('refuses a gate that does not pass, or one for another phase', () => {
    expect(() => advancePhase(settings, { number: 1, toPhase: 2 }, false, 4)).toThrow()
    expect(() => advancePhase(settings, { number: 2, toPhase: 3 }, true, 8)).toThrow()
  })
})

describe('phaseEntryWeek: the week a confirmed phase is entered (PROGRAM-QUESTIONS 113)', () => {
  // program.md's week: lifts Tuesday, Thursday, Saturday; Sunday off. Week 3 is Nov 16 to 22, week 4 Nov 23 to 29.
  const template: WeeklyTemplate = { mon: 'run:mbr', tue: 'lift:A', wed: 'run:easy', thu: 'lift:B', fri: 'run:long', sat: 'lift:C', sun: 'off' }
  const START = '2026-11-02'
  const lift = (date: string, status: Workout['status'] = 'finished'): Workout => ({ ...workout(`w-${date}`, date, status), templateId: 'p1-a', phase: 1, week: 3 })
  const week3Lifts = [lift('2026-11-17'), lift('2026-11-19'), lift('2026-11-21')]
  const entry = (today: string, workouts: readonly Workout[] = [], moves: readonly SessionMove[] = []) => phaseEntryWeek({ today, startDate: START, template, moves, workouts })

  it('Sunday of week 3, after the week’s last lift: the phase is entered in week 4, not week 3', () => {
    expect(entry('2026-11-22', week3Lifts)).toBe(4)
  })
  it('Saturday of week 3, before Lift C: A and B already ran in the old phase, so week 4', () => {
    expect(entry('2026-11-21', week3Lifts.slice(0, 2))).toBe(4)
  })
  it('Monday, or Tuesday before Lift A: every lift of the week is still ahead, so this week', () => {
    expect(entry('2026-11-23', week3Lifts)).toBe(4)
    expect(entry('2026-11-24', week3Lifts)).toBe(4)
  })
  it('Tuesday with Lift A started or logged: next week', () => {
    expect(entry('2026-11-24', [lift('2026-11-24', 'in-progress')])).toBe(5)
    expect(entry('2026-11-24', [lift('2026-11-24', 'abandoned')])).toBe(5)
    // A planned workout hasn't happened.
    expect(entry('2026-11-24', [lift('2026-11-24', 'planned')])).toBe(4)
  })
  it('a lift day already past with nothing logged still counts: next week', () => {
    expect(entry('2026-11-25')).toBe(5)
  })
  it('reads the week after its moves: Lift A moved to Wednesday leaves every lift ahead on Wednesday', () => {
    const move: SessionMove = { id: 'm1', week: 4, dayA: 'tue', dayB: 'wed' }
    expect(entry('2026-11-25', [], [move])).toBe(4)
  })
  it('gate 2 on the nominal schedule: Sunday Dec 20 (week 7) and Monday Dec 21 both enter Phase 3 in week 8', () => {
    const week7 = [lift('2026-12-15'), lift('2026-12-17'), lift('2026-12-19')]
    expect(entry('2026-12-20', week7)).toBe(8)
    expect(entry('2026-12-21', week7)).toBe(8)
  })
  it('before the program starts, week 1', () => {
    expect(entry('2026-10-30')).toBe(1)
  })
})
