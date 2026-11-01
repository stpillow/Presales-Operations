import { describe, expect, it } from 'vitest'
import type { Prescription } from '../rules/prescription.ts'
import type { Exercise, SetLog, Slot } from '../schema/index.ts'
import {
  buildSet,
  countField,
  countLabel,
  countWords,
  draftFromSet,
  durationWords,
  loadMax,
  loadWords,
  loggedMaxPain,
  mergeSwaps,
  parseStoredSwaps,
  prescriptionWords,
  rangeStopOptions,
  setWords,
  showsLoad,
  swapsFromSets,
} from './SessionRunner.helpers.ts'

const ex = (over: Partial<Exercise> = {}): Exercise => ({ id: 'leg-press', name: 'Leg press', pattern: 'squat', equipment: 'press', loadType: 'stack', loadUnit: 'plate', increment: 1, loadDirection: 'up', unilateral: false, ...over })
const slot = (over: Partial<Slot> = {}): Slot => ({ id: 'p1a-1', order: 1, label: '1', exerciseId: 'leg-press', sets: 3, repsMin: 10, repsMax: 12, repUnit: 'reps', unilateral: false, injuredOnly: false, prescriptionText: '3 × 10–12', cues: [], progressionRule: 'double-progression', substitutionIds: ['leg-press-45'], optional: false, rpeTarget: 6, rpeTargetEnd: 7, ...over })
const rx = (over: Partial<Prescription> = {}): Prescription => ({ exerciseId: 'leg-press', side: 'both', sets: 3, load: 8, loadUnit: 'plate', repsTarget: 10, repUnit: 'reps', basis: 'progress-load', note: '', ...over })
const set = (over: Partial<SetLog> = {}): SetLog => ({ id: 'x', workoutId: 'w1', slotId: 'p1a-1', exerciseId: 'leg-press', setNumber: 1, side: 'both', load: 8, loadUnit: 'plate', reps: 12, rpe: 7, painDuring: 2, stopped: false, loggedAt: '2026-11-03T22:00:00.000Z', ...over })

describe('fields and words', () => {
  it('seconds log as seconds; everything else as reps, labelled by unit', () => {
    expect(countField('seconds')).toBe('seconds')
    expect(countField('minutes')).toBe('reps')
    expect(countLabel('yards')).toBe('Yards')
    expect(countLabel('minutes')).toBe('Minutes')
  })
  it('shows a load field only where a load exists', () => {
    expect(showsLoad(ex())).toBe(true)
    expect(showsLoad(ex({ loadType: 'bodyweight' }))).toBe(false)
    expect(showsLoad(ex({ loadType: 'step-height', holdsLoad: 'dumbbell-each' }))).toBe(true)
    expect(showsLoad(ex({ loadType: 'step-height' }))).toBe(false)
  })
  it('caps dumbbell fields at the rack', () => {
    expect(loadMax(ex({ loadType: 'dumbbell-each', loadUnit: 'lb', increment: 5 }), 80)).toBe(80)
    expect(loadMax(ex(), 80)).toBeGreaterThan(80)
  })
  it('says loads and prescriptions in words', () => {
    expect(loadWords(8, ex())).toBe('plate 8')
    expect(loadWords(null, ex())).toBe('load to pick')
    expect(loadWords(20, ex({ loadType: 'dumbbell-each', loadUnit: 'lb', increment: 5 }))).toBe('20 lb each')
    expect(prescriptionWords(rx(), slot(), ex())).toBe('3 × 10 · RPE 6→7 · plate 8')
    expect(prescriptionWords(rx({ perSet: [{ load: 8, reps: 12 }, { load: 8, reps: 11 }] }), slot(), ex())).toBe('3 × 12, 11 · RPE 6→7 · plate 8')
  })
  it('says a set in words, including unrated pain and a stop', () => {
    expect(setWords(set(), 'reps', ex())).toBe('12 × plate 8 · RPE 7 · pain 2')
    expect(setWords(set({ painDuring: undefined, stopped: true, stopReason: 'sharp-joint-line-pain' }), 'reps', ex())).toBe('12 × plate 8 · RPE 7 · pain not rated · stopped: sharp joint-line pain')
  })
  it('offers only the engine’s range stops, never past the phase stop', () => {
    expect(rangeStopOptions(45)).toEqual([45])
    expect(rangeStopOptions(30)).toEqual([45, 30])
  })
})

describe('buildSet and draftFromSet', () => {
  it('stores seconds as seconds, drops unrated pain and RPE, records a stop', () => {
    const plank = slot({ repUnit: 'seconds' })
    const s = buildSet({ workoutId: 'w1', slot: plank, repUnit: 'seconds', exercise: ex({ loadType: 'time', loadUnit: 's', increment: 5 }), side: 'right', setNumber: 1, draft: { load: 0, count: 20, rpe: null, pain: null }, loggedAt: 't', stop: 'form' })
    expect(s).toMatchObject({ seconds: 20, stopped: true, stopReason: 'form', loadUnit: 's', load: 0 })
    expect(s.reps).toBeUndefined()
    expect(s.painDuring).toBeUndefined()
    expect(s.rpe).toBeUndefined()
  })
  it('stores a step-up’s dumbbells in lb with its height', () => {
    const stepUp = ex({ id: 'step-up', loadType: 'step-height', loadUnit: 'in', increment: 2, holdsLoad: 'dumbbell-each' })
    expect(buildSet({ workoutId: 'w1', slot: slot(), repUnit: 'reps', exercise: stepUp, side: 'right', setNumber: 1, draft: { load: 20, count: 10, rpe: 6, pain: 1, heightIn: 6 }, loggedAt: 't' })).toMatchObject({ load: 20, loadUnit: 'lb', heightIn: 6, reps: 10 })
  })
  it('round-trips a logged set into a draft', () => {
    expect(draftFromSet(set())).toEqual({ load: 8, count: 12, rpe: 7, pain: 2 })
  })
})

describe('swaps', () => {
  const plans = [{ slot: slot(), prescriptions: [{ exerciseId: 'leg-press' }] }]
  it('recovers a user swap from the sets', () => {
    expect(swapsFromSets(plans, [set({ exerciseId: 'leg-press-45' })])).toEqual({ 'p1a-1': 'leg-press-45' })
  })
  it('does not mistake an engine move for a swap', () => {
    const moved = [{ slot: slot(), prescriptions: [{ exerciseId: 'smith-box-squat' }] }]
    expect(swapsFromSets(moved, [set({ exerciseId: 'smith-box-squat' })])).toEqual({})
    expect(swapsFromSets(plans, [set()])).toEqual({})
  })
  it('stored choices win, and a stored null returns the slot to its own exercise', () => {
    expect(mergeSwaps({ a: 'x' }, { a: null, b: 'y' })).toEqual({ a: undefined, b: 'y' })
  })
  it('parses stored swaps defensively', () => {
    expect(parseStoredSwaps(null)).toEqual({})
    expect(parseStoredSwaps('not json')).toEqual({})
    expect(parseStoredSwaps('[1]')).toEqual({})
    expect(parseStoredSwaps('{"a":"x","b":null,"c":3}')).toEqual({ a: 'x', b: null })
  })
})

describe('summary helpers', () => {
  it('finds the highest logged pain', () => {
    expect(loggedMaxPain([set({ painDuring: 2 }), set({ painDuring: 4 }), set({ painDuring: undefined })])).toBe(4)
    expect(loggedMaxPain([set({ painDuring: undefined })])).toBeNull()
  })
  it('says a duration in words', () => {
    expect(durationWords('2026-11-03T22:00:00Z', '2026-11-03T22:48:00Z')).toBe('48 min')
    expect(durationWords('2026-11-03T22:00:00Z', '2026-11-04T00:05:00Z')).toBe('2 h 5 min')
    expect(durationWords(undefined, 'x')).toBeNull()
    expect(durationWords('2026-11-03T22:00:00Z', '2026-11-03T22:00:20Z')).toBeNull()
  })
})

describe('per-side words', () => {
  it('says "each side" on two-sided slots the program counts per side', () => {
    const pallof = slot({ repsMin: 10, repsMax: 10, perSideLabel: 'each side', rpeTarget: undefined, rpeTargetEnd: undefined })
    expect(prescriptionWords(rx({ sets: 2, repsTarget: 10 }), pallof, ex())).toBe('2 × 10 each side · plate 8')
    expect(countWords(10, 'reps', pallof)).toBe('10 reps each side')
    expect(countWords(30, 'seconds', slot({ unilateral: true, perSideLabel: 'each leg' }))).toBe('30 s')
  })
})
