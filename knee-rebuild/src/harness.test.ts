import { describe, expect, it } from 'vitest'

// M0: proves the Vitest harness runs. Replaced by the rules engine's tests in M2.
describe('vitest harness', () => {
  it('runs under node with strict TypeScript', () => {
    const weeks: readonly number[] = [4, 8, 12]
    expect(weeks.every((w) => w % 4 === 0)).toBe(true)
  })
})
