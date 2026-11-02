import { describe, expect, it } from 'vitest'
import { planSession } from '../app/session.ts'
import type { History } from '../db/repo.ts'
import { isLowerBody } from '../rules/wholeKnee.ts'
import { Settings, type MorningCheck, type SetLog, type Workout } from '../schema/index.ts'
import { exerciseById, program, templateFor } from './program.ts'

// planSession on the live seed: which exercise a slot runs after a back-off, a Swap chosen for the
// session, and the next lift after a morning that read back off.

const settingsIn = (phase: number, phaseEnteredWeek: number): Settings =>
  Settings.parse({ injuredSide: program.injuredSide, startDate: program.startDate, dumbbellMax: 80, restTimerSeconds: 60, painPerSet: false, currentPhase: phase, phaseEnteredWeek })

const workout = (id: string, date: string, templateId: string, phase: number, week: number): Workout => ({ id, date, templateId, phase, week, isDeload: false, status: 'finished' })
const sets = (workoutId: string, slotId: string, exerciseId: string, over: Partial<SetLog>): SetLog[] =>
  [1, 2, 3].map((n) => ({ id: `${workoutId}-${exerciseId}-${n}`, workoutId, slotId, exerciseId, setNumber: n, side: 'both', load: 0, loadUnit: 'none', reps: 4, painDuring: 2, stopped: false, ...over }))
const check = (date: string, over: Partial<MorningCheck> = {}): MorningCheck => ({
  id: `m-${date}`, date, appliesTo: null, stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [], ...over,
})
const historyOf = (workouts: Workout[], setLogs: SetLog[], morningChecks: MorningCheck[]): History => ({ workouts, setLogs, morningChecks, runs: [], gateTests: [], sessionMoves: [] })

describe('Phase 3 A, slot 2: Nordics back off to the single-leg leg curl and come back (PROGRAM-QUESTIONS 55)', () => {
  const template = templateFor(3, 'A')
  const settings = settingsIn(3, 8)
  const nordicsHurt = workout('w1', '2026-12-29', 'p3-a', 3, 9)
  const curlOne = workout('w2', '2027-01-05', 'p3-a', 3, 10)
  const curlTwo = workout('w3', '2027-01-12', 'p3-a', 3, 11)
  const logs = [
    ...sets('w1', 'p3a-2', 'nordic-negatives', { reps: 3, painDuring: 6 }),
    ...sets('w2', 'p3a-2', 'single-leg-seated-leg-curl', { load: 40, loadUnit: 'lb', reps: 10 }),
    ...sets('w3', 'p3a-2', 'single-leg-seated-leg-curl', { load: 40, loadUnit: 'lb', reps: 10 }),
  ]
  const checks = [check('2026-12-30'), check('2027-01-06'), check('2027-01-13')]
  const slotTwo = (before: string, workouts: Workout[], chosenExercise?: Record<string, string>) => {
    const plan = planSession({ template, week: 11, settings, history: historyOf(workouts, logs, checks), before, ...(chosenExercise ? { chosenExercise } : {}) }).find((p) => p.slot.id === 'p3a-2')
    if (!plan) throw new Error('no slot p3a-2')
    return plan
  }

  it('the session after the back-off moves to the easier version', () => {
    const plan = slotTwo('2027-01-05', [nordicsHurt])
    expect(plan.exercise.id).toBe('nordic-negatives')
    expect(plan.prescriptions[0]).toMatchObject({ exerciseId: 'single-leg-seated-leg-curl', basis: 'back-off', note: 'Back off: the easier version, Single-leg seated leg curl.' })
  })

  it('after one clean on the leg curl the slot stays on it, at its own load', () => {
    const plan = slotTwo('2027-01-12', [nordicsHurt, curlOne])
    expect(plan.exercise.id).toBe('single-leg-seated-leg-curl')
    expect(plan.prescriptions[0]).toMatchObject({ exerciseId: 'single-leg-seated-leg-curl', load: 40, basis: 'same' })
    expect(plan.prescriptions[0]?.note).toMatch(/^On Single-leg seated leg curl since Nordic hamstring negatives backed off: clean once/)
  })

  it('a Swap chosen for the session still wins', () => {
    const plan = slotTwo('2027-01-12', [nordicsHurt, curlOne], { 'p3a-2': 'lying-leg-curl' })
    expect(plan.exercise.id).toBe('lying-leg-curl')
    expect(plan.prescriptions[0]).toMatchObject({ exerciseId: 'lying-leg-curl', load: null, basis: 'first' })
  })

  it('two cleans on the leg curl bring the slot back to Nordics at their last session', () => {
    const plan = slotTwo('2027-01-19', [nordicsHurt, curlOne, curlTwo])
    expect(plan.exercise.id).toBe('nordic-negatives')
    expect(plan.prescriptions[0]).toMatchObject({ exerciseId: 'nordic-negatives', load: 0, repsTarget: 3, basis: 'repeat' })
    expect(plan.prescriptions[0]?.note).toBe('Back on Nordic hamstring negatives: Single-leg seated leg curl read clean twice. Same loads and reps as its last session.')
  })
})

describe('the whole knee on the live seed (PROGRAM-QUESTIONS 6)', () => {
  it('lower-body work is every slot but the pressing, pulling, core, carry and cardio ones', () => {
    const notLower = program.templates.flatMap((t) => t.slots.filter((s) => !isLowerBody(exerciseById(s.exerciseId))).map((s) => `${s.id} ${exerciseById(s.exerciseId).pattern}`))
    expect(notLower).toEqual([
      'p1a-3 push', 'p1a-4 pull', 'p1a-8 core', 'p1a-9 cardio', 'p1b-3 pull', 'p1b-4 push', 'p1b-7 core', 'p1b-8 core', 'p1c-3 pull', 'p1c-4 push', 'p1c-7 carry',
      'p2a-3 push', 'p2a-4 pull', 'p2a-8 core', 'p2a-9 cardio', 'p2b-3 pull', 'p2b-4 push', 'p2b-7 core', 'p2b-8 core', 'p2c-3 pull', 'p2c-4 push', 'p2c-7 carry',
      'p3a-3 push', 'p3a-4 pull', 'p3a-8 core', 'p3a-9 cardio', 'p3a-upper4 pull', 'p3b-3 pull', 'p3b-4 push', 'p3b-7 core', 'p3b-8 core', 'p3b-upper4 pull',
      'p3c-3 pull', 'p3c-4 push', 'p3c-7 carry', 'p3c-upper4 pull',
    ])
  })

  // Phase 2 C in week 6: the leg extension last ran at 100 lb in Phase 2 and at 70 lb in Phase 1;
  // the incline press last ran at 40 lb. Every session read clean. Thursday morning reads back off.
  const template = templateFor(2, 'C')
  const settings = settingsIn(2, 4)
  const phaseOne = workout('w1', '2026-11-14', 'p1-c', 1, 2)
  const phaseTwo = workout('w2', '2026-12-05', 'p2-c', 2, 5)
  const logs = [
    ...sets('w1', 'p1c-5', 'leg-extension', { load: 70, loadUnit: 'lb', reps: 15, rangeStopDeg: 45 }),
    ...sets('w2', 'p2c-5', 'leg-extension', { load: 100, loadUnit: 'lb', reps: 15, rangeStopDeg: 30 }),
    ...sets('w2', 'p2c-4', 'incline-db-press', { load: 40, loadUnit: 'lb', reps: 8, rpe: 8 }),
  ]
  const checks = [check('2026-11-15'), check('2026-12-06'), check('2026-12-10', { visibleSwelling: true })]
  const plan = (workouts: Workout[], before?: string) => {
    const plans = planSession({ template, week: 6, settings, history: historyOf(workouts, logs, checks), ...(before ? { before } : {}) })
    return (slotId: string) => plans.find((p) => p.slot.id === slotId)?.prescriptions[0]
  }

  it('the next lift backs off its lower-body work, at the lower of load × 0.75 and the last Phase 1 load', () => {
    const slot = plan([phaseOne, phaseTwo], '2026-12-12')
    expect(slot('p2c-5')).toMatchObject({ exerciseId: 'leg-extension', load: 70, rangeStopDeg: 30, basis: 'back-off' })
    expect(slot('p2c-5')?.note).toBe('Whole knee: a morning check since the last lift read back off. Back off: the last Phase 1 load, 70 lb, is lighter than load × 0.75 (75 lb), so it wins.')
    expect(slot('p2c-4')).toMatchObject({ exerciseId: 'incline-db-press', load: 40, basis: 'same' })
  })

  it('once a lift has run since that morning, this one reads its own history', () => {
    const slot = plan([phaseOne, phaseTwo, workout('w3', '2026-12-10', 'p2-b', 2, 6)], '2026-12-12')
    expect(slot('p2c-5')).toMatchObject({ load: 100, basis: 'progress-reps' })
  })

  it('a plan with no session date (the morning check’s next-time preview) is not the next lift', () => {
    expect(plan([phaseOne, phaseTwo])('p2c-5')).toMatchObject({ load: 100, basis: 'progress-reps' })
  })
})
