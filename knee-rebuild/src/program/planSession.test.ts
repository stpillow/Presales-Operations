import { describe, expect, it } from 'vitest'
import { planSession } from '../app/session.ts'
import type { History } from '../db/repo.ts'
import { Settings, type MorningCheck, type SetLog, type Workout } from '../schema/index.ts'
import { program, templateFor } from './program.ts'

// planSession on the live seed: which exercise a slot runs after a back-off, and a Swap chosen for the session.

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
