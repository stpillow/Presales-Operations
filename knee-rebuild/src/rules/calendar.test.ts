import { describe, expect, it } from 'vitest'
import { isDeloadWeek } from './calendar.ts'

describe('isDeloadWeek', () => {
  it('is true for weeks 4, 8 and 12 only', () => {
    const deloads = Array.from({ length: 16 }, (_, i) => i + 1).filter(isDeloadWeek)
    expect(deloads).toEqual([4, 8, 12])
  })
})
