import { describe, expect, it } from 'vitest'
import type { SetLog, Slot } from '../schema/index.ts'
import { loggedPain, needsLoadPick, painRewriteAllowed, prefill } from './prefill.ts'
import type { Prescription } from './prescription.ts'

const slot = (over: Partial<Slot> = {}): Slot => ({ id: 'p1a-1', order: 1, label: '1', exerciseId: 'leg-press', sets: 3, repsMin: 10, repsMax: 12, repUnit: 'reps', unilateral: false, injuredOnly: false, prescriptionText: '', cues: [], progressionRule: 'double-progression', substitutionIds: [], optional: false, rpeTarget: 6, ...over })
const rx = (over: Partial<Prescription> = {}): Prescription => ({ exerciseId: 'leg-press', side: 'both', sets: 3, load: 8, loadUnit: 'plate', repsTarget: 10, repUnit: 'reps', basis: 'progress-load', note: '', ...over })
const set = (over: Partial<SetLog> = {}): SetLog => ({ id: 'x', workoutId: 'w', slotId: 'p1a-1', exerciseId: 'leg-press', setNumber: 1, side: 'both', load: 8, loadUnit: 'plate', reps: 12, rpe: 7, painDuring: 2, stopped: false, loggedAt: '2026-11-03T22:00:00.000Z', ...over })
const base = { slot: slot(), setNumber: 1, slotSets: [] as SetLog[], budget: null, historyRpe: null, painPerSet: false }

describe('prefill', () => {
  it('first set: the prescription, the RPE target, pain not rated', () => {
    expect(prefill({ ...base, prescription: rx() })).toEqual({ load: 8, count: 10, rpe: 6, pain: null })
  })
  it('carries a corrected load from the same exercise on the same side, never the reps', () => {
    const d = prefill({ ...base, setNumber: 2, prescription: rx(), slotSets: [set({ load: 9 })] })
    expect(d).toMatchObject({ load: 9, count: 10 })
  })
  it('after a swap nothing carries from the other exercise: a first-time load still reads 0 to pick', () => {
    const swapped = rx({ exerciseId: 'leg-press-45', load: null })
    const d = prefill({ ...base, setNumber: 2, prescription: swapped, slotSets: [set({ load: 8, painDuring: 5 })] })
    expect(d).toMatchObject({ load: 0, pain: null })
    expect(needsLoadPick(swapped, true, 'up', d)).toBe(true)
  })
  it('the healthy side takes the injured side’s reps even when the engine repeats last session set by set (rule 5)', () => {
    const p = rx({ side: 'left', repsTarget: 8, basis: 'repeat', perSet: [{ load: 20, reps: 8 }, { load: 20, reps: 8 }, { load: 20, reps: 8 }] })
    expect(prefill({ ...base, prescription: p, budget: [6] }).count).toBe(6)
    expect(prefill({ ...base, setNumber: 2, prescription: p, budget: [6] }).count).toBe(8)
  })
  it('without a budget the per-set repeat wins over the target', () => {
    const p = rx({ perSet: [{ load: 8, reps: 12 }, { load: 8, reps: 11 }] })
    expect(prefill({ ...base, setNumber: 2, prescription: p }).count).toBe(11)
  })
  it('RPE without a target comes from the last logged, else stays unrated', () => {
    const s = slot({ rpeTarget: undefined })
    expect(prefill({ ...base, slot: s, prescription: rx(), historyRpe: 8 }).rpe).toBe(8)
    expect(prefill({ ...base, slot: s, prescription: rx() }).rpe).toBeNull()
  })
  it('per exercise, pain is what this exercise’s sets carry; per set, the previous set’s', () => {
    expect(prefill({ ...base, setNumber: 2, prescription: rx(), slotSets: [set({ painDuring: 3 })] }).pain).toBe(3)
    expect(prefill({ ...base, setNumber: 2, prescription: rx(), slotSets: [set({ painDuring: undefined })], painPerSet: true }).pain).toBeNull()
  })
  it('height, range and stage carry from the same exercise’s last set, else the prescription', () => {
    expect(prefill({ ...base, prescription: rx({ heightIn: 6 }) }).heightIn).toBe(6)
    expect(prefill({ ...base, setNumber: 2, prescription: rx({ heightIn: 6 }), slotSets: [set({ heightIn: 8 })] }).heightIn).toBe(8)
  })
})

describe('needsLoadPick', () => {
  it('blocks only a first-time load still at 0 on a loaded, upward exercise', () => {
    expect(needsLoadPick(rx({ load: null }), true, 'up', { load: 0 })).toBe(true)
    expect(needsLoadPick(rx({ load: null }), true, 'up', { load: 5 })).toBe(false)
    expect(needsLoadPick(rx({ load: 8 }), true, 'up', { load: 0 })).toBe(false)
    expect(needsLoadPick(rx({ load: null }), false, 'up', { load: 0 })).toBe(false)
    expect(needsLoadPick(rx({ load: null }), true, 'down', { load: 0 })).toBe(false)
  })
})

describe('pain helpers', () => {
  it('loggedPain is the newest rated pain', () => {
    expect(loggedPain([set({ painDuring: 2 }), set({ painDuring: 4, loggedAt: '2026-11-03T23:00:00.000Z' })])).toBe(4)
    expect(loggedPain([set({ painDuring: undefined })])).toBeNull()
  })
  it('a per-exercise rating may only overwrite unrated or uniform sets, never a climb logged per set', () => {
    expect(painRewriteAllowed([set({ painDuring: undefined }), set({ painDuring: undefined })])).toBe(true)
    expect(painRewriteAllowed([set({ painDuring: 2 }), set({ painDuring: 2 })])).toBe(true)
    expect(painRewriteAllowed([set({ painDuring: 1 }), set({ painDuring: 3 })])).toBe(false)
  })
})
