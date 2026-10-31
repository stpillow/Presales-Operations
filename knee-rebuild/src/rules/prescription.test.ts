import { describe, expect, it } from 'vitest'
import type { Exercise, SetLog, Slot } from '../schema/index.ts'
import { backOffLoad, effectiveReading, prescribe, type PrescriptionInput } from './prescription.ts'

const ex = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'leg-press', name: 'Leg press', pattern: 'squat', equipment: 'seated leg press', loadType: 'stack', loadUnit: 'plate', increment: 1, loadDirection: 'up', unilateral: false, ...over,
})
const slot = (over: Partial<Slot> = {}): Slot => ({
  id: 'p1a-1', order: 1, label: '1', exerciseId: 'leg-press', sets: 3, repsMin: 10, repsMax: 12, repUnit: 'reps', unilateral: false, injuredOnly: false,
  prescriptionText: '3 × 10–12', cues: [], progressionRule: 'double-progression', substitutionIds: [], optional: false, ...over,
})
const setLog = (setNumber: number, over: Partial<SetLog> = {}): SetLog => ({
  id: `s${setNumber}`, workoutId: 'w1', slotId: 'p1a-1', exerciseId: 'leg-press', setNumber, side: 'both', load: 8, loadUnit: 'plate', reps: 12, rpe: 7, painDuring: 2, stopped: false, ...over,
})
const threeSets = (over: Partial<SetLog> = {}) => [setLog(1, over), setLog(2, over), setLog(3, over)]

function input(over: Partial<PrescriptionInput> = {}): PrescriptionInput {
  return { slot: slot(), exercise: ex(), substitutions: [], readings: ['clean', 'clean'], lastSets: threeSets(), week: 2, injuredSide: 'right', dumbbellMax: 80, redFlagActive: false, ...over }
}
const one = (over: Partial<PrescriptionInput> = {}) => {
  const [p] = prescribe(input(over))
  if (!p) throw new Error('no prescription')
  return p
}

describe('effectiveReading', () => {
  it('reads the last two combined readings', () => {
    expect(effectiveReading([])).toBe('none')
    expect(effectiveReading(['clean'])).toBe('clean-once')
    expect(effectiveReading(['clean', 'clean'])).toBe('clean-twice')
    expect(effectiveReading(['clean', 'hold'])).toBe('clean-once')
    expect(effectiveReading(['hold', 'clean'])).toBe('hold')
    expect(effectiveReading(['back-off', 'clean'])).toBe('back-off')
  })
  it('two holds in a row read back-off (PROGRAM-QUESTIONS 4)', () => {
    expect(effectiveReading(['hold', 'hold'])).toBe('back-off')
  })
})

describe('worked examples', () => {
  it('leg press, Phase 1: 12, 12, 12 at RPE 7 with pain 2, clean twice and at repsMax: plus one plate, 3 × 10', () => {
    const p = one()
    expect(p).toMatchObject({ load: 9, repsTarget: 10, sets: 3, basis: 'progress-load', loadUnit: 'plate' })
  })
  it('step-up: 3 × 10 with 20 lb, clean twice at 6 in.: next is 8 in. at 20 lb', () => {
    const stepUp = ex({ id: 'step-up', loadType: 'step-height', loadUnit: 'in', increment: 2, heightIncrementIn: 2, holdsLoad: 'dumbbell-each', unilateral: true })
    const s = slot({ exerciseId: 'step-up', repsMin: 10, repsMax: 10, progressionRule: 'height-then-load', unilateral: true, heightIn: 6, heightMaxIn: 8, loadBeforeHeightLb: 20 })
    const sets = [...threeSets({ side: 'right', load: 20, loadUnit: 'lb', reps: 10, heightIn: 6 }), ...threeSets({ side: 'left', load: 20, loadUnit: 'lb', reps: 10, heightIn: 6 })]
    const [injured, healthy] = prescribe(input({ slot: s, exercise: stepUp, lastSets: sets }))
    expect(injured).toMatchObject({ side: 'right', heightIn: 8, load: 20, basis: 'progress-height' })
    expect(healthy).toMatchObject({ side: 'left', heightIn: 8, load: 20, budgetFromInjured: true })
  })
  it('week 4, a 3 × 10 slot: prescribed 2 × 10 at the same load', () => {
    const p = one({ week: 4, lastSets: threeSets({ reps: 10 }) })
    expect(p).toMatchObject({ sets: 2, load: 8, repsTarget: 10, basis: 'deload' })
    expect(p.perSet).toEqual([{ load: 8, reps: 10 }, { load: 8, reps: 10 }])
  })
})

describe('double progression', () => {
  it('clean twice but short of repsMax: same load, target repsMax', () => {
    expect(one({ lastSets: threeSets({ reps: 11 }) })).toMatchObject({ load: 8, repsTarget: 12, basis: 'progress-reps' })
  })
  it('clean twice at repsMax but over RPE 8 on one set: no load change yet', () => {
    expect(one({ lastSets: [setLog(1), setLog(2), setLog(3, { rpe: 9 })] })).toMatchObject({ load: 8, repsTarget: 12, basis: 'progress-reps' })
  })
  it('a missing RPE does not count as RPE 8 or under', () => {
    expect(one({ lastSets: threeSets({ rpe: undefined }) }).basis).toBe('progress-reps')
  })
  it('clean once: same load, same target', () => {
    expect(one({ readings: ['clean', 'hold'] })).toMatchObject({ load: 8, repsTarget: 12, basis: 'same' })
    expect(one({ readings: ['clean'], lastSets: threeSets({ reps: 10 }) })).toMatchObject({ load: 8, repsTarget: 10, basis: 'same' })
  })
  it('hold: repeat the last session exactly, set by set', () => {
    const p = one({ readings: ['hold'], lastSets: [setLog(1, { reps: 12 }), setLog(2, { reps: 11 }), setLog(3, { reps: 10 })] })
    expect(p.basis).toBe('repeat')
    expect(p.perSet).toEqual([{ load: 8, reps: 12 }, { load: 8, reps: 11 }, { load: 8, reps: 10 }])
  })
  it('no reading at all is treated as hold', () => {
    expect(one({ readings: [] }).basis).toBe('repeat')
  })
  it('back-off: load × 0.75 rounded down to the increment', () => {
    expect(one({ readings: ['back-off'] })).toMatchObject({ load: 6, basis: 'back-off' })
    expect(backOffLoad(35, 5)).toBe(25)
    expect(backOffLoad(40, 5)).toBe(30)
    expect(backOffLoad(8, 1)).toBe(6)
    expect(backOffLoad(90, 10)).toBe(60)
  })
  it('an assist stack moves the other way: less assist to progress, more to back off', () => {
    const pullUp = ex({ id: 'assisted-pull-up', loadDirection: 'down' })
    expect(one({ exercise: pullUp, lastSets: threeSets({ reps: 12 }) })).toMatchObject({ load: 7, basis: 'progress-load' })
    expect(one({ exercise: pullUp, readings: ['back-off'] })).toMatchObject({ load: 9, basis: 'back-off' })
  })
})

describe('first session, deload and red flag', () => {
  it('first time: no load to go on, start at repsMin', () => {
    expect(one({ lastSets: [], readings: [] })).toMatchObject({ load: null, repsTarget: 10, basis: 'first' })
  })
  it('first time on a bodyweight slot starts at 0', () => {
    expect(one({ lastSets: [], readings: [], exercise: ex({ loadType: 'bodyweight', loadUnit: 'none', increment: 0 }) }).load).toBe(0)
  })
  it('a new slot in a deload week runs its lightest version with deload sets (PROGRAM-QUESTIONS 8)', () => {
    expect(one({ lastSets: [], readings: [], week: 4 })).toMatchObject({ sets: 2, basis: 'first' })
  })
  it('deload weeks skip progression even when clean twice at the top', () => {
    expect(one({ week: 8 })).toMatchObject({ sets: 2, load: 8, basis: 'deload' })
  })
  it('the red-flag state suspends progression', () => {
    expect(one({ redFlagActive: true })).toMatchObject({ load: 8, basis: 'suspended' })
  })
})

describe('height-then-load (PROGRAM-QUESTIONS 2)', () => {
  const stepUp = ex({ id: 'step-up', loadType: 'step-height', loadUnit: 'in', increment: 2, heightIncrementIn: 2, holdsLoad: 'dumbbell-each', unilateral: true })
  const s = slot({ exerciseId: 'step-up', repsMin: 10, repsMax: 10, progressionRule: 'height-then-load', unilateral: true, injuredOnly: true, heightIn: 6, heightMaxIn: 8, loadBeforeHeightLb: 20 })
  const sets = (load: number, heightIn: number) => threeSets({ side: 'right', load, loadUnit: 'lb', reps: 10, heightIn })
  it('load climbs to 20 lb before height moves', () => {
    expect(one({ slot: s, exercise: stepUp, lastSets: sets(0, 6) })).toMatchObject({ load: 5, heightIn: 6, basis: 'progress-load' })
    expect(one({ slot: s, exercise: stepUp, lastSets: sets(15, 6) })).toMatchObject({ load: 20, heightIn: 6, basis: 'progress-load' })
  })
  it('at the phase top height, load moves again', () => {
    expect(one({ slot: s, exercise: stepUp, lastSets: sets(20, 8) })).toMatchObject({ load: 25, heightIn: 8, basis: 'progress-load' })
  })
  it('back-off drops the height first, then the load, then the easier version', () => {
    expect(one({ slot: s, exercise: stepUp, readings: ['back-off'], lastSets: sets(20, 8) })).toMatchObject({ heightIn: 6, load: 20, basis: 'back-off' })
    expect(one({ slot: s, exercise: stepUp, readings: ['back-off'], lastSets: sets(20, 6) })).toMatchObject({ heightIn: 6, load: 15, basis: 'back-off' })
    const stair = ex({ id: 'step-up-stair', loadType: 'step-height', loadUnit: 'in', increment: 2 })
    expect(one({ slot: s, exercise: stepUp, substitutions: [stair], readings: ['back-off'], lastSets: sets(0, 6) })).toMatchObject({ exerciseId: 'step-up-stair', basis: 'back-off' })
  })
  it('a step-down with no load to add stays at the top height', () => {
    const stepDown = ex({ id: 'lateral-step-down', loadType: 'step-height', loadUnit: 'in', increment: 2, heightIncrementIn: 2, unilateral: true })
    const sd = slot({ exerciseId: 'lateral-step-down', repsMin: 8, repsMax: 8, progressionRule: 'height-then-load', unilateral: true, injuredOnly: true, heightIn: 6, heightMaxIn: 8 })
    expect(one({ slot: sd, exercise: stepDown, lastSets: threeSets({ side: 'right', load: 0, loadUnit: 'in', reps: 8, heightIn: 6, rpe: 6 }) })).toMatchObject({ heightIn: 8, basis: 'progress-height' })
    expect(one({ slot: sd, exercise: stepDown, lastSets: threeSets({ side: 'right', load: 0, loadUnit: 'in', reps: 8, heightIn: 8, rpe: 6 }) })).toMatchObject({ heightIn: 8, basis: 'at-top' })
  })
})

describe('range-then-load (PROGRAM-QUESTIONS 3)', () => {
  const legExt = ex({ id: 'leg-extension', pattern: 'quad' })
  const phase2 = slot({ exerciseId: 'leg-extension', sets: 2, repsMin: 12, repsMax: 15, progressionRule: 'range-then-load', rangeStopDeg: 30 })
  it('moves the range stop to the phase stop before loading', () => {
    const p = one({ slot: phase2, exercise: legExt, lastSets: [setLog(1, { reps: 15, rangeStopDeg: 45, load: 5 }), setLog(2, { reps: 15, rangeStopDeg: 45, load: 5 })] })
    expect(p).toMatchObject({ rangeStopDeg: 30, load: 5, repsTarget: 12, basis: 'progress-range' })
  })
  it('loads once the range sits at the phase stop', () => {
    const p = one({ slot: phase2, exercise: legExt, lastSets: [setLog(1, { reps: 15, rangeStopDeg: 30, load: 5 }), setLog(2, { reps: 15, rangeStopDeg: 30, load: 5 })] })
    expect(p).toMatchObject({ rangeStopDeg: 30, load: 6, basis: 'progress-load' })
  })
})

describe('stage and time rules', () => {
  const balance = ex({ id: 'single-leg-balance', pattern: 'balance', loadType: 'time', loadUnit: 's', increment: 5, unilateral: true, stages: ['eyes open', 'eyes closed', 'on a folded mat'] })
  const bal = slot({ exerciseId: 'single-leg-balance', repsMin: 30, repsMax: 30, repUnit: 'seconds', progressionRule: 'stage', unilateral: true, injuredOnly: true })
  const holds = (stage: number, seconds = 30) => threeSets({ side: 'right', load: 0, loadUnit: 's', reps: undefined, seconds, stage, rpe: undefined })
  it('clean twice at the full hold moves up a stage; back-off moves down one', () => {
    expect(one({ slot: bal, exercise: balance, lastSets: holds(0) })).toMatchObject({ stage: 1, basis: 'progress-stage' })
    expect(one({ slot: bal, exercise: balance, lastSets: holds(2) })).toMatchObject({ stage: 2, basis: 'at-top' })
    expect(one({ slot: bal, exercise: balance, readings: ['back-off'], lastSets: holds(2) })).toMatchObject({ stage: 1, basis: 'back-off' })
    expect(one({ slot: bal, exercise: balance, lastSets: holds(0, 20) })).toMatchObject({ stage: 0, repsTarget: 30, basis: 'progress-reps' })
  })
  it('timed holds climb to the top of their range, then wait for the next phase (PROGRAM-QUESTIONS 45)', () => {
    const plank = ex({ id: 'copenhagen-plank-short', pattern: 'hip', loadType: 'time', loadUnit: 's', increment: 5, unilateral: true })
    const cp = slot({ exerciseId: 'copenhagen-plank-short', repsMin: 15, repsMax: 20, repUnit: 'seconds', progressionRule: 'time', unilateral: true, injuredOnly: true })
    const held = (seconds: number) => threeSets({ side: 'right', load: 0, loadUnit: 's', reps: undefined, seconds, rpe: undefined })
    expect(one({ slot: cp, exercise: plank, lastSets: held(15) })).toMatchObject({ repsTarget: 20, basis: 'progress-reps' })
    expect(one({ slot: cp, exercise: plank, lastSets: held(20) })).toMatchObject({ repsTarget: 20, basis: 'at-top' })
    expect(one({ slot: cp, exercise: plank, readings: ['back-off'], lastSets: held(20) })).toMatchObject({ repsTarget: 15, basis: 'back-off' })
  })
})

describe('bodyweight back-offs and the dumbbell cap', () => {
  it('a bodyweight exercise backs off to its first substitution', () => {
    const nordic = ex({ id: 'nordic-negatives', pattern: 'hamstring', loadType: 'bodyweight', loadUnit: 'none', increment: 0 })
    const curl = ex({ id: 'single-leg-seated-leg-curl', pattern: 'hamstring', unilateral: true })
    const s = slot({ exerciseId: 'nordic-negatives', repsMin: 3, repsMax: 5, progressionRule: 'fixed' })
    expect(one({ slot: s, exercise: nordic, substitutions: [curl], readings: ['back-off'], lastSets: threeSets({ load: 0, loadUnit: 'none', reps: 4 }) })).toMatchObject({ exerciseId: 'single-leg-seated-leg-curl', basis: 'back-off' })
  })
  it('with nothing lighter written, a back-off cuts a set', () => {
    const pogo = ex({ id: 'pogo-hops', pattern: 'plyo', loadType: 'time', loadUnit: 's', increment: 5 })
    const s = slot({ exerciseId: 'pogo-hops', repsMin: 15, repsMax: 15, repUnit: 'seconds', progressionRule: 'fixed' })
    expect(one({ slot: s, exercise: pogo, readings: ['back-off'], lastSets: threeSets({ load: 0, loadUnit: 's', reps: undefined, seconds: 15 }) })).toMatchObject({ sets: 2, basis: 'back-off' })
  })
  it('a dumbbell load past the rack turns into the next substitution (PROGRAM-QUESTIONS 9)', () => {
    const rdl = ex({ id: 'db-rdl', pattern: 'hinge', loadType: 'dumbbell-each', loadUnit: 'lb', increment: 5 })
    const slRdl = ex({ id: 'single-leg-rdl', pattern: 'hinge', loadType: 'dumbbell-single', loadUnit: 'lb', increment: 5, unilateral: true })
    const s = slot({ exerciseId: 'db-rdl', repsMin: 10, repsMax: 10 })
    const p = one({ slot: s, exercise: rdl, substitutions: [slRdl], lastSets: threeSets({ load: 80, loadUnit: 'lb', reps: 10 }) })
    expect(p).toMatchObject({ exerciseId: 'single-leg-rdl', load: null, basis: 'progress-load' })
    expect(one({ slot: s, exercise: rdl, substitutions: [slRdl], lastSets: threeSets({ load: 70, loadUnit: 'lb', reps: 10 }) })).toMatchObject({ exerciseId: 'db-rdl', load: 75 })
  })
})

describe('sides', () => {
  it('unilateral slots get the injured side first and the healthy side on its budget', () => {
    const bss = ex({ id: 'bulgarian-split-squat', loadType: 'dumbbell-each', loadUnit: 'lb', increment: 5, unilateral: true })
    const s = slot({ exerciseId: 'bulgarian-split-squat', repsMin: 8, repsMax: 8, unilateral: true })
    const sets = [...threeSets({ side: 'right', load: 20, loadUnit: 'lb', reps: 8 }), ...threeSets({ side: 'left', load: 25, loadUnit: 'lb', reps: 8 })]
    const [a, b] = prescribe(input({ slot: s, exercise: bss, lastSets: sets, injuredSide: 'right' }))
    expect(a).toMatchObject({ side: 'right', load: 25, repsTarget: 8 })
    expect(b).toMatchObject({ side: 'left', load: 30, repsTarget: 8, budgetFromInjured: true })
  })
  it('bilateral slots prescribe once, for both', () => {
    expect(prescribe(input()).map((p) => p.side)).toEqual(['both'])
  })
})
