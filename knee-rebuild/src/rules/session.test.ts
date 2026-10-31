import { describe, expect, it } from 'vitest'
import { templateFor } from '../program/program.ts'
import { slotsForWeek } from './session.ts'

const ids = (template: Parameters<typeof slotsForWeek>[0], week: number) => slotsForWeek(template, week).map((s) => s.id)

describe('slotsForWeek', () => {
  it('adds snap-downs to Phase 2 A and C from week 6', () => {
    expect(ids(templateFor(2, 'A'), 5)).not.toContain('p2a-prep')
    expect(ids(templateFor(2, 'A'), 6)).toContain('p2a-prep')
    expect(ids(templateFor(2, 'C'), 7)).toContain('p2c-prep')
    expect(ids(templateFor(2, 'B'), 6)).toEqual(templateFor(2, 'B').slots.map((s) => s.id))
  })

  it('runs the right plyo block for each Phase 3 week band', () => {
    const plyos = (week: number) => ids(templateFor(3, 'A'), week).filter((id) => id.includes('plyo'))
    expect(plyos(8)).toEqual(['p3a-plyo-1', 'p3a-plyo-2', 'p3a-plyo-3'])
    expect(plyos(9)).toEqual(['p3a-plyo-1', 'p3a-plyo-2', 'p3a-plyo-3'])
    expect(plyos(10)).toEqual(['p3a-plyo-4', 'p3a-plyo-5', 'p3a-plyo-6', 'p3a-plyo-7'])
    expect(plyos(12)).toEqual(['p3a-plyo-8', 'p3a-plyo-9', 'p3a-plyo-10', 'p3a-plyo-11'])
  })

  it('keeps every unbanded slot in every week', () => {
    for (const week of [1, 2, 3]) {
      expect(ids(templateFor(1, 'A'), week)).toHaveLength(templateFor(1, 'A').slots.length)
    }
  })
})
