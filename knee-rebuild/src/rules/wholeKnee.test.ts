import { describe, expect, it } from 'vitest'
import type { Exercise, MorningCheck, SetLog, Slot, Workout } from '../schema/index.ts'
import { attachChecks, lastSetsBySide, type WorkoutRecord } from './history.ts'
import { prescribe, WHOLE_KNEE_NOTE } from './prescription.ts'
import { isLowerBody, kneeMorning, LOWER_BODY_PATTERNS, phaseOneLoads, wholeKneeFor, type KneeMorning } from './wholeKnee.ts'

// Question 6: after a morning that reads back-off, the next lift's lower-body work backs off, with
// the last Phase 1 load as a floor from Phase 2 on.

const workout = (id: string, date: string, phase: number, over: Partial<Workout> = {}): Workout => ({
  id, date, templateId: phase === 1 ? 'p1-c' : 'p2-c', phase, week: phase === 1 ? 2 : 5, isDeload: false, status: 'finished', ...over,
})
const sets = (workoutId: string, exerciseId: string, load: number, over: Partial<SetLog> = {}): SetLog[] =>
  [1, 2].map((n) => ({
    id: `${workoutId}-${exerciseId}-${over.side ?? 'both'}-${n}`, workoutId, slotId: 'p2c-5', exerciseId, setNumber: n, side: 'both', load, loadUnit: 'lb', reps: 15, rpe: 7, painDuring: 2, stopped: false, ...over,
  }))
const check = (date: string, over: Partial<MorningCheck> = {}): MorningCheck => ({
  id: `m-${date}`, date, appliesTo: null, stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [], ...over,
})
const swelling = (date: string) => check(date, { visibleSwelling: true })

describe('lower-body work', () => {
  it('is every pattern but pressing, pulling, core, carries and cardio', () => {
    expect([...LOWER_BODY_PATTERNS].sort()).toEqual(['balance', 'calf', 'hamstring', 'hinge', 'hip', 'plyo', 'quad', 'single-leg', 'squat'])
    expect(isLowerBody({ pattern: 'quad' })).toBe(true)
    expect(isLowerBody({ pattern: 'plyo' })).toBe(true)
    for (const pattern of ['push', 'pull', 'core', 'carry', 'cardio'] as const) expect(isLowerBody({ pattern }), pattern).toBe(false)
  })
})

describe('kneeMorning: is this the next lift after a morning that read back off?', () => {
  const tuesday = workout('a', '2026-12-08', 2)

  it('a back-off morning with no lift since makes the next lift the one', () => {
    expect(kneeMorning([check('2026-12-08'), swelling('2026-12-09')], [tuesday], '2026-12-10')).toEqual({ date: '2026-12-09', reasons: ['visible swelling'] })
  })

  it('the morning of the lift itself counts', () => {
    expect(kneeMorning([check('2026-12-09', { warmth: true })], [], '2026-12-09')).toEqual({ date: '2026-12-09', reasons: ['warmth'] })
  })

  it('once a lift has happened on or after that morning, it was the next lift and this one is not', () => {
    expect(kneeMorning([swelling('2026-12-09')], [tuesday, workout('b', '2026-12-10', 2)], '2026-12-12')).toBeNull()
    expect(kneeMorning([swelling('2026-12-09')], [tuesday, workout('b', '2026-12-09', 2)], '2026-12-12')).toBeNull()
    expect(kneeMorning([swelling('2026-12-09')], [tuesday, workout('b', '2026-12-10', 2, { status: 'abandoned' })], '2026-12-12')).toBeNull()
  })

  it('a lift that never happened does not use the morning up', () => {
    expect(kneeMorning([swelling('2026-12-09')], [workout('b', '2026-12-10', 2, { status: 'planned' })], '2026-12-12')?.date).toBe('2026-12-09')
    expect(kneeMorning([swelling('2026-12-09')], [workout('b', '2026-12-10', 2, { status: 'in-progress' })], '2026-12-12')?.date).toBe('2026-12-09')
  })

  it('a later morning that reads clean does not undo it', () => {
    expect(kneeMorning([swelling('2026-12-09'), check('2026-12-10')], [tuesday], '2026-12-10')?.date).toBe('2026-12-09')
  })

  it('clean and hold mornings, and mornings after the lift, are not the whole knee', () => {
    expect(kneeMorning([check('2026-12-09')], [], '2026-12-10')).toBeNull()
    expect(kneeMorning([check('2026-12-09', { worseThanYesterday: true })], [], '2026-12-10')).toBeNull()
    expect(kneeMorning([swelling('2026-12-11')], [], '2026-12-10')).toBeNull()
  })

  it('names the latest of two complaining mornings', () => {
    expect(kneeMorning([swelling('2026-12-08'), check('2026-12-09', { painChangePoints: 2 })], [], '2026-12-10')).toEqual({ date: '2026-12-09', reasons: ['pain up 2 points'] })
  })
})

describe('phaseOneLoads: the last load logged in Phase 1, from the workouts’ phase field', () => {
  const records = (extra: SetLog[] = [], workouts: Workout[] = []) =>
    attachChecks(
      [workout('p1a', '2026-11-07', 1), workout('p1b', '2026-11-14', 1), workout('p2a', '2026-11-28', 2), ...workouts],
      [...sets('p1a', 'leg-extension', 65), ...sets('p1b', 'leg-extension', 70), ...sets('p2a', 'leg-extension', 100), ...extra],
      [],
    )

  it('reads the last Phase 1 session, not the heavier Phase 2 one', () => {
    expect(phaseOneLoads(records(), 'leg-extension')).toEqual({ both: { load: 70, loadUnit: 'lb' } })
  })

  it('is empty for an exercise with no Phase 1 history', () => {
    expect(phaseOneLoads(records(), 'single-leg-rdl')).toEqual({})
  })

  it('reads each side', () => {
    const sided = [...sets('p1b', 'step-up', 10, { side: 'right' }), ...sets('p1b', 'step-up', 15, { side: 'left' })]
    expect(phaseOneLoads(records(sided), 'step-up')).toEqual({ right: { load: 10, loadUnit: 'lb' }, left: { load: 15, loadUnit: 'lb' } })
  })

  it('a rack-capped Phase 1 session is not a load the exercise ran at', () => {
    const capped = sets('p1c', 'leg-extension', 50, { rackCapped: true })
    expect(phaseOneLoads(records(capped, [workout('p1c', '2026-11-18', 1)]), 'leg-extension')).toEqual({ both: { load: 70, loadUnit: 'lb' } })
  })
})

describe('wholeKneeFor: what one slot of the lift reads', () => {
  const morning: KneeMorning = { date: '2026-12-09', reasons: ['visible swelling'] }
  const records = attachChecks([workout('p1b', '2026-11-14', 1)], sets('p1b', 'leg-extension', 70), [])

  it('nothing without a morning that read back off', () => {
    expect(wholeKneeFor({ morning: null, own: { pattern: 'quad' }, exerciseId: 'leg-extension', phase: 2, records })).toBeUndefined()
  })
  it('nothing for upper-body, core, carry or cardio slots', () => {
    expect(wholeKneeFor({ morning, own: { pattern: 'push' }, exerciseId: 'incline-db-press', phase: 2, records })).toBeUndefined()
    expect(wholeKneeFor({ morning, own: { pattern: 'carry' }, exerciseId: 'farmers-carry', phase: 2, records })).toBeUndefined()
  })
  it('in Phase 1, the back-off with no floor: Phase 1 loads are the loads themselves', () => {
    expect(wholeKneeFor({ morning, own: { pattern: 'quad' }, exerciseId: 'leg-extension', phase: 1, records })).toEqual({ morning: '2026-12-09', phaseOneLoads: {} })
  })
  it('from Phase 2 on, the last Phase 1 loads of the exercise the slot runs', () => {
    expect(wholeKneeFor({ morning, own: { pattern: 'quad' }, exerciseId: 'leg-extension', phase: 2, records })).toEqual({ morning: '2026-12-09', phaseOneLoads: { both: { load: 70, loadUnit: 'lb' } } })
    expect(wholeKneeFor({ morning, own: { pattern: 'quad' }, exerciseId: 'wall-sit', phase: 3, records })).toEqual({ morning: '2026-12-09', phaseOneLoads: {} })
  })
})

describe('the next lift’s prescription after a morning that read back off', () => {
  const legExtension: Exercise = { id: 'leg-extension', name: 'Leg extension', pattern: 'quad', equipment: 'leg extension', loadType: 'stack', loadUnit: 'lb', increment: 5, loadDirection: 'up', unilateral: false, requires: [] }
  const slot: Slot = {
    id: 'p2c-5', order: 6, label: '5', exerciseId: 'leg-extension', sets: 2, repsMin: 12, repsMax: 15, repUnit: 'reps', unilateral: false, injuredOnly: false,
    prescriptionText: '2 × 12–15, RPE 7', cues: [], progressionRule: 'range-then-load', rangeStopDeg: 30, substitutionIds: [], optional: false,
  }
  const morning: KneeMorning = { date: '2026-12-09', reasons: ['visible swelling'] }
  /** Phase 2's last leg extension at 100 lb, read clean once; Phase 1's last at `phaseOne` lb when given. */
  function plan(opts: { phase?: number; phaseOne?: number; morning?: KneeMorning | null; week?: number }) {
    const workouts = [workout('p2', '2026-12-05', opts.phase ?? 2)]
    const logs = sets('p2', 'leg-extension', 100, { rangeStopDeg: 30 })
    if (opts.phaseOne !== undefined) {
      workouts.push(workout('p1', '2026-11-14', 1))
      logs.push(...sets('p1', 'leg-extension', opts.phaseOne, { rangeStopDeg: 45 }))
    }
    const records: WorkoutRecord[] = attachChecks(workouts, logs, [])
    const wholeKnee = wholeKneeFor({ morning: opts.morning === undefined ? morning : opts.morning, own: legExtension, exerciseId: 'leg-extension', phase: opts.phase ?? 2, records })
    const [p] = prescribe({
      slot, exercise: legExtension, substitutions: [], readings: ['clean'], lastSets: lastSetsBySide(records, 'leg-extension'), week: opts.week ?? 6,
      injuredSide: 'right', dumbbellMax: 80, redFlagActive: false, ...(wholeKnee ? { wholeKnee } : {}),
    })
    if (!p) throw new Error('no prescription')
    return p
  }

  it('Phase 2, last 100 lb, Phase 1 last 70 lb: 70 lb, and the note says the Phase 1 load won', () => {
    const p = plan({ phaseOne: 70 })
    expect(p).toMatchObject({ load: 70, rangeStopDeg: 30, basis: 'back-off' })
    expect(p.note).toBe(`${WHOLE_KNEE_NOTE} Back off: the last Phase 1 load, 70 lb, is lighter than load × 0.75 (75 lb), so it wins.`)
  })

  it('Phase 2, last 100 lb, Phase 1 last 90 lb: 75 lb, and the note says load × 0.75 won', () => {
    const p = plan({ phaseOne: 90 })
    expect(p).toMatchObject({ load: 75, basis: 'back-off' })
    expect(p.note).toBe(`${WHOLE_KNEE_NOTE} Back off: load × 0.75, rounded down to 75 lb, is lighter than the last Phase 1 load (90 lb), so it wins.`)
  })

  it('a tie says so', () => {
    expect(plan({ phaseOne: 75 }).note).toBe(`${WHOLE_KNEE_NOTE} Back off: load × 0.75 and the last Phase 1 load are both 75 lb.`)
  })

  it('in Phase 1 itself: load × 0.75 alone', () => {
    const p = plan({ phase: 1 })
    expect(p).toMatchObject({ load: 75, basis: 'back-off' })
    expect(p.note).toBe(`${WHOLE_KNEE_NOTE} Back off: load × 0.75, rounded down to 75 lb.`)
  })

  it('with no Phase 1 history: load × 0.75 alone', () => {
    const p = plan({})
    expect(p).toMatchObject({ load: 75, basis: 'back-off' })
    expect(p.note).toBe(`${WHOLE_KNEE_NOTE} Back off: load × 0.75, rounded down to 75 lb.`)
  })

  it('without the morning, the same history reads clean once: same load', () => {
    expect(plan({ phaseOne: 70, morning: null })).toMatchObject({ load: 100, basis: 'same' })
  })

  it('a deload week comes first, as it does for every back-off', () => {
    expect(plan({ phaseOne: 70, week: 8 })).toMatchObject({ load: 100, sets: 2, basis: 'deload' })
  })
})
