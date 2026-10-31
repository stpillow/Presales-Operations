import { describe, expect, it } from 'vitest'
import type { Gate, GateTest, MorningCheck, Run, SetLog, Workout } from '../schema/index.ts'
import { evaluateGate, type GateContext } from './gates.ts'
import type { SubjectReading } from './history.ts'

const gate1: Gate = {
  number: 1, fromPhase: 1, toPhase: 2, title: 'Gate 1, to leave Phase 1',
  items: [
    { id: 'g1-clean-weeks', text: 'two consecutive clean weeks', evaluator: 'clean-weeks', windowDays: 14 },
    { id: 'g1-sl-leg-press', text: '10 single-leg leg presses within 20%', evaluator: 'symmetry', threshold: 0.8, testItem: 'sl-leg-press-10rm' },
    { id: 'g1-stance', text: '30 s single-leg stance eyes closed', evaluator: 'manual' },
    { id: 'g1-run', text: 'a 4-mile run with no next-morning reaction', evaluator: 'run-no-reaction', minMiles: 4 },
  ],
}
const gate3: Gate = {
  number: 3, fromPhase: 3, toPhase: 4, title: 'Gate 3',
  items: [
    { id: 'g3-single-hop', text: 'single hop', evaluator: 'symmetry', threshold: 0.9, testItem: 'single-hop', trials: 3 },
    { id: 'g3-no-swelling-plyo', text: 'no swelling the morning after a plyo session', evaluator: 'no-swelling-after-plyo', windowDays: 14 },
  ],
}
const gate2: Gate = {
  number: 2, fromPhase: 2, toPhase: 3, title: 'Gate 2',
  items: [
    { id: 'g2-calf-raises', text: '20 single-leg calf raises each side', evaluator: 'calf-raises', minReps: 20, windowDays: 14 },
    { id: 'g2-no-swelling', text: 'no swelling for two weeks', evaluator: 'no-swelling', windowDays: 14 },
  ],
}

const check = (date: string, over: Partial<MorningCheck> = {}): MorningCheck => ({ id: `m-${date}`, date, appliesTo: null, stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [], ...over })
const reading = (date: string, result: SubjectReading['result'] = 'clean'): SubjectReading => ({ kind: 'workout', id: `w-${date}`, date, result })
const test = (over: Partial<GateTest>): GateTest => ({ id: 't', date: '2026-11-20', gate: 1, item: 'sl-leg-press-10rm', valueInjured: 8, valueOther: 10, pass: true, manual: false, ...over })

function ctx(over: Partial<GateContext> = {}): GateContext {
  return { today: '2026-11-22', injuredSide: 'right', readings: [], gateTests: [], morningChecks: [], runs: [], workouts: [], setLogs: [], calfRaiseExerciseIds: ['single-leg-calf-raise-step'], ...over }
}
const twoCleanWeeks = ['2026-11-10', '2026-11-12', '2026-11-14', '2026-11-17', '2026-11-19', '2026-11-21'].map((d) => reading(d))

describe('evaluateGate (rule 8)', () => {
  it('a gate passes only when every item passes, and never advances on its own', () => {
    const full = ctx({
      readings: twoCleanWeeks,
      gateTests: [test({}), test({ id: 'man', item: 'g1-stance', manual: true, pass: true })],
      runs: [{ id: 'r1', date: '2026-11-20', type: 'long', miles: 4, minutes: 40, effort: 'easy', maxPain: 1, strides: false, tempo: false }],
      morningChecks: [check('2026-11-21')],
    })
    const result = evaluateGate(gate1, full)
    expect(result.items.map((i) => i.pass)).toEqual([true, true, true, true])
    expect(result.passes).toBe(true)
    const noTick = evaluateGate(gate1, { ...full, gateTests: [test({})] })
    expect(noTick.passes).toBe(false)
    expect(noTick.items[2]?.detail).toBe('not ticked')
  })

  it('clean weeks: one hold in the window fails; sessions must exist in both weeks', () => {
    expect(evaluateGate(gate1, ctx({ readings: [...twoCleanWeeks, reading('2026-11-15', 'hold')] })).items[0]?.pass).toBe(false)
    expect(evaluateGate(gate1, ctx({ readings: twoCleanWeeks.slice(3) })).items[0]?.pass).toBe(false)
    expect(evaluateGate(gate1, ctx({ readings: [...twoCleanWeeks, reading('2026-11-05', 'back-off')] })).items[0]?.pass).toBe(true)
  })

  it('symmetry reads the latest test for the item against the gate line', () => {
    expect(evaluateGate(gate1, ctx({ gateTests: [test({ valueInjured: 7, valueOther: 10 })] })).items[1]).toMatchObject({ pass: false, detail: expect.stringContaining('70%') })
    expect(evaluateGate(gate1, ctx({ gateTests: [test({ date: '2026-11-10', valueInjured: 7 }), test({ date: '2026-11-20', valueInjured: 9 })] })).items[1]?.pass).toBe(true)
    expect(evaluateGate(gate1, ctx()).items[1]?.detail).toBe('no test entered yet')
  })

  it('worked example: hop test 56 vs 62 is 90.3% and passes gate 3', () => {
    const hop = test({ gate: 3, item: 'single-hop', trialsInjured: [50, 56, 54], trialsOther: [60, 62, 61], valueInjured: 56, valueOther: 62 })
    const result = evaluateGate(gate3, ctx({ gateTests: [hop] }))
    expect(result.items[0]).toMatchObject({ pass: true, detail: expect.stringContaining('90.3%') })
  })

  it('no swelling after plyos needs checks, no swelling, and a Phase 3 A or C session in the window', () => {
    const plyo: Workout = { id: 'w9', date: '2026-11-18', templateId: 'p3-a', phase: 3, week: 8, isDeload: true, status: 'finished' }
    expect(evaluateGate(gate3, ctx({ morningChecks: [check('2026-11-19')], workouts: [plyo] })).items[1]?.pass).toBe(true)
    expect(evaluateGate(gate3, ctx({ morningChecks: [check('2026-11-19')] })).items[1]?.pass).toBe(false)
    expect(evaluateGate(gate3, ctx({ morningChecks: [check('2026-11-19', { visibleSwelling: true })], workouts: [plyo] })).items[1]?.pass).toBe(false)
    expect(evaluateGate(gate3, ctx({ workouts: [plyo] })).items[1]?.pass).toBe(false)
  })

  it('calf raises need a set of 20 or more on each side inside the window', () => {
    const w: Workout = { id: 'w5', date: '2026-11-15', templateId: 'p2-a', phase: 2, week: 6, isDeload: false, status: 'finished' }
    const calf = (side: SetLog['side'], reps: number): SetLog => ({ id: `${side}-${reps}`, workoutId: 'w5', slotId: 'p2a-6', exerciseId: 'single-leg-calf-raise-step', setNumber: 1, side, load: 0, loadUnit: 'lb', reps, stopped: false })
    const c = ctx({ workouts: [w], morningChecks: [check('2026-11-16')] })
    expect(evaluateGate(gate2, { ...c, setLogs: [calf('right', 20), calf('left', 22)] }).items[0]?.pass).toBe(true)
    expect(evaluateGate(gate2, { ...c, setLogs: [calf('right', 20), calf('left', 19)] }).items[0]?.pass).toBe(false)
    expect(evaluateGate(gate2, { ...c, workouts: [{ ...w, date: '2026-11-01' }], setLogs: [calf('right', 20), calf('left', 22)] }).items[0]?.pass).toBe(false)
    expect(evaluateGate(gate2, c).items[1]?.pass).toBe(true)
    expect(evaluateGate(gate2, { ...c, morningChecks: [] }).items[1]?.pass).toBe(false)
  })

  it('the 4-mile run needs a clean morning after it; swaps and shorter runs do not count', () => {
    const run = (over: Partial<Run>): Run => ({ id: 'r1', date: '2026-11-20', type: 'long', miles: 4, minutes: 40, effort: 'easy', maxPain: 1, strides: false, tempo: false, ...over })
    expect(evaluateGate(gate1, ctx({ runs: [run({})], morningChecks: [check('2026-11-21')] })).items[3]?.pass).toBe(true)
    expect(evaluateGate(gate1, ctx({ runs: [run({ miles: 3.9 })], morningChecks: [check('2026-11-21')] })).items[3]?.pass).toBe(false)
    expect(evaluateGate(gate1, ctx({ runs: [run({ type: 'elliptical-swap' })], morningChecks: [check('2026-11-21')] })).items[3]?.pass).toBe(false)
    expect(evaluateGate(gate1, ctx({ runs: [run({})], morningChecks: [check('2026-11-21', { worseThanYesterday: true })] })).items[3]?.pass).toBe(false)
    expect(evaluateGate(gate1, ctx({ runs: [run({})] })).items[3]?.pass).toBe(false)
  })
})
