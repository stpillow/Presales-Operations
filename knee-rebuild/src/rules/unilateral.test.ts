import { describe, expect, it } from 'vitest'
import type { SetLog } from '../schema/index.ts'
import { bestOfTrials, healthySideTargets, meetsSymmetry, symmetryPercent } from './unilateral.ts'

const injuredSet = (setNumber: number, reps: number): SetLog => ({
  id: `i${setNumber}`, workoutId: 'w1', slotId: 'p2b-1', exerciseId: 'bulgarian-split-squat', setNumber, side: 'right', load: 20, loadUnit: 'lb', reps, stopped: false,
})

describe('healthySideTargets (rule 5)', () => {
  it('worked example: Bulgarian split squat, injured side completes 8, 8, 7; healthy side targets 8, 8, 7', () => {
    expect(healthySideTargets([injuredSet(1, 8), injuredSet(2, 8), injuredSet(3, 7)])).toEqual([8, 8, 7])
  })
  it('orders by set number whatever the input order', () => {
    expect(healthySideTargets([injuredSet(3, 7), injuredSet(1, 8), injuredSet(2, 8)])).toEqual([8, 8, 7])
  })
})

describe('symmetry', () => {
  it('worked example: hop test, injured best 56 in., other side 62 in., is 90.3% and passes the 90% line', () => {
    expect(symmetryPercent(56, 62)).toBe(90.3)
    expect(meetsSymmetry(56, 62, 0.9)).toBe(true)
  })
  it('fails just under the line and cannot be computed against a zero', () => {
    expect(meetsSymmetry(55, 62, 0.9)).toBe(false)
    expect(symmetryPercent(10, 0)).toBeNull()
    expect(meetsSymmetry(0, 0, 0.8)).toBe(false)
  })
  it('keeps the best of three trials', () => {
    expect(bestOfTrials([50, 56, 54])).toBe(56)
    expect(bestOfTrials([])).toBe(0)
  })
})
