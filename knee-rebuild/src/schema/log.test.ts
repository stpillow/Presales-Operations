import { describe, expect, it } from 'vitest'
import { IsoDate } from './enums.ts'
import { Run, SetLog } from './log.ts'

describe('IsoDate', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(IsoDate.safeParse('2026-11-02').success).toBe(true)
    expect(IsoDate.safeParse('2028-02-29').success).toBe(true)
    expect(IsoDate.safeParse('2026-13-45').success).toBe(false)
    expect(IsoDate.safeParse('2026-02-30').success).toBe(false)
    expect(IsoDate.safeParse('2026-11-2').success).toBe(false)
  })
})

describe('SetLog', () => {
  const base = { id: 's1', workoutId: 'w1', slotId: 'p1a-1', exerciseId: 'leg-press', setNumber: 1, side: 'both', load: 8, loadUnit: 'plate' } as const
  it('needs reps or seconds, exactly one', () => {
    expect(SetLog.safeParse({ ...base, reps: 12 }).success).toBe(true)
    expect(SetLog.safeParse({ ...base, seconds: 30 }).success).toBe(true)
    expect(SetLog.safeParse({ ...base }).success).toBe(false)
    expect(SetLog.safeParse({ ...base, reps: 12, seconds: 30 }).success).toBe(false)
  })
  it('rejects unknown keys so a typo cannot vanish silently', () => {
    expect(SetLog.safeParse({ ...base, reps: 12, pain: 2 }).success).toBe(false)
  })
})

describe('Run', () => {
  const base = { id: 'r1', date: '2026-11-02', type: 'mbr', miles: 3.1, minutes: 29, effort: 'easy', maxPain: 1 } as const
  it('only accepts https Strava links', () => {
    expect(Run.safeParse({ ...base, stravaUrl: 'https://www.strava.com/activities/1' }).success).toBe(true)
    expect(Run.safeParse({ ...base, stravaUrl: 'http://www.strava.com/activities/1' }).success).toBe(false)
    expect(Run.safeParse({ ...base, stravaUrl: 'javascript:alert(1)' }).success).toBe(false)
  })
})
