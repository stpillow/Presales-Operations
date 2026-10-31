import { describe, expect, it } from 'vitest'
import { deloadSets, prescribedSets } from './deload.ts'

describe('deloadSets', () => {
  it('takes two-thirds, rounded down, never below 2', () => {
    expect(deloadSets(3)).toBe(2)
    expect(deloadSets(4)).toBe(2)
    expect(deloadSets(2)).toBe(2)
    expect(deloadSets(1)).toBe(2)
    expect(deloadSets(6)).toBe(4)
  })
})

describe('prescribedSets', () => {
  it('worked example: week 4, a 3 × 10 slot is prescribed as 2 × 10', () => {
    expect(prescribedSets(3, 4)).toBe(2)
  })
  it('leaves non-deload weeks alone', () => {
    expect(prescribedSets(3, 5)).toBe(3)
    expect(prescribedSets(4, 9)).toBe(4)
  })
})
