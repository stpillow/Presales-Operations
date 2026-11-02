import { describe, expect, it } from 'vitest'
import type { MileageWeek, Run } from '../schema/index.ts'
import { isSwap, runSplit, weekMiles, weekSessions, weekTarget } from './mileage.ts'

const plan: MileageWeek[] = [10, 11, 12, 9, 13, 14, 15, 11, 16, 17, 18, 14].map((targetMiles, i) => ({ week: i + 1, targetMiles, isDown: [4, 8, 12].includes(i + 1) }))
const run = (type: Run['type'], miles: number): Run => ({ id: `${type}-${miles}`, date: '2026-11-09', type, miles, minutes: 30, effort: 'easy', maxPain: 1, strides: false, tempo: false })

describe('weekTarget (rule 7)', () => {
  it("worked example: week 2's Friday run reads hold; week 3's target becomes week 2's actual miles, not 12", () => {
    const t = weekTarget(plan, 3, { readings: ['clean', 'clean', 'hold'], actualMiles: 10.5 })
    expect(t).toMatchObject({ target: 10.5, capped: true })
  })
  it('a clean week takes the plan', () => {
    expect(weekTarget(plan, 3, { readings: ['clean', 'clean', 'clean'], actualMiles: 11 })).toMatchObject({ target: 12, capped: false })
    expect(weekTarget(plan, 1, null)).toMatchObject({ target: 10, capped: false })
  })
  it('the cap never raises the target above the plan', () => {
    expect(weekTarget(plan, 4, { readings: ['hold'], actualMiles: 12 })).toMatchObject({ target: 9, capped: false })
  })
  it('a cap at or above the plan’s number is not a cap: the reason says the plan (M4 review)', () => {
    expect(weekTarget(plan, 4, { readings: ['hold'], actualMiles: 12 })).toEqual({ target: 9, capped: false, reason: 'from the plan' })
    expect(weekTarget(plan, 4, { readings: ['clean', 'back-off'], actualMiles: 9 })).toEqual({ target: 9, capped: false, reason: 'from the plan' })
    expect(weekTarget(plan, 4, { readings: ['back-off'], actualMiles: 8.5 })).toEqual({ target: 8.5, capped: true, reason: 'last week read back-off: capped at last week’s 8.5 miles' })
  })
  it('is null outside the 12 weeks', () => {
    expect(weekTarget(plan, 13, null).target).toBeNull()
  })
})

describe('miles and sessions', () => {
  it('swaps count as sessions and add no miles', () => {
    const runs = [run('mbr', 3), run('elliptical-swap', 3), run('long', 4)]
    expect(weekMiles(runs)).toBe(7)
    expect(weekSessions(runs)).toBe(3)
    expect(isSwap(run('rower-swap', 0))).toBe(true)
    expect(isSwap(run('easy', 3))).toBe(false)
  })
})

describe('runSplit', () => {
  it('long run is 40% rounded to the nearest half mile; the other two split the rest', () => {
    expect(runSplit(10)).toEqual({ long: 4, others: 3 })
    expect(runSplit(11)).toEqual({ long: 4.5, others: 3.25 })
    expect(runSplit(18)).toEqual({ long: 7, others: 5.5 })
    expect(runSplit(9)).toEqual({ long: 3.5, others: 2.75 })
  })
})
