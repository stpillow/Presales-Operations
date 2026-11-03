import { describe, expect, it } from 'vitest'
import { WINDOW_MAX, WINDOW_MIN, cleanWindow, fitToWindow, minutesOf, type WindowSlot } from './fitWindow.ts'

const REST = 60
// 3 sets of 10 reps: 3 × (10 × 4 + 20) = 180 s of work + 3 × 60 s rest = 360 s = 6 min.
const lift = (slotId: string, over: Partial<WindowSlot> = {}): WindowSlot => ({
  slotId,
  added: false,
  optional: false,
  logged: false,
  sides: [{ sets: 3, repsTarget: 10, repUnit: 'reps' }],
  ...over,
})

describe('the estimate', () => {
  it('counts a rep as 4 s, 20 s to set up and log each set, and the rest after every set', () => {
    const fit = fitToWindow([lift('a')], null, REST)
    expect(fit.fullMinutes).toBe(6)
    expect(fit.keptMinutes).toBe(6)
  })

  it('counts both sides of a one-leg exercise, seconds as seconds and minutes as minutes', () => {
    const both = lift('a', { sides: [{ sets: 2, repsTarget: 10, repUnit: 'reps' }, { sets: 2, repsTarget: 10, repUnit: 'reps' }] })
    expect(fitToWindow([both], null, REST).fullMinutes).toBe(8)
    const hold = lift('b', { sides: [{ sets: 2, repsTarget: 30, repUnit: 'seconds' }] })
    expect(fitToWindow([hold], null, 30).fullMinutes).toBe(3)
    const bike = lift('c', { sides: [{ sets: 1, repsTarget: 5, repUnit: 'minutes' }] })
    expect(fitToWindow([bike], null, REST).fullMinutes).toBe(7)
  })

  it('counts a superset’s rests once per round, not once per member', () => {
    const pair = [lift('a', { groupId: 'g' }), lift('b', { groupId: 'g' })]
    // 2 × 180 s work + 3 rounds × 60 s = 540 s = 9 min; apart they would be 12.
    expect(fitToWindow(pair, null, REST).fullMinutes).toBe(9)
  })

  it('rounds minutes up', () => {
    expect(minutesOf(60)).toBe(1)
    expect(minutesOf(61)).toBe(2)
  })
})

describe('fitToWindow', () => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => lift(id))

  it('keeps everything with no window, or one the session fits', () => {
    expect(fitToWindow(six, null, REST)).toMatchObject({ dropped: [], keep: ['a', 'b', 'c', 'd', 'e', 'f'], fullMinutes: 36, fits: true })
    expect(fitToWindow(six, 36, REST).dropped).toEqual([])
  })

  it('drops program.md’s own exercises from the end backwards until the rest fits', () => {
    const fit = fitToWindow(six, 20, REST)
    expect(fit.keep).toEqual(['a', 'b', 'c'])
    expect(fit.dropped).toEqual(['f', 'e', 'd'])
    expect(fit.keptMinutes).toBe(18)
    expect(fit.fits).toBe(true)
  })

  it('drops what Shawn added first, then the optional ones, then the program’s own', () => {
    const slots = [lift('a'), lift('b', { optional: true }), lift('c'), lift('x', { added: true })]
    expect(fitToWindow(slots, 18, REST).dropped).toEqual(['x'])
    expect(fitToWindow(slots, 12, REST).dropped).toEqual(['x', 'b'])
    expect(fitToWindow(slots, 6, REST).dropped).toEqual(['x', 'b', 'c'])
  })

  it('never drops the first exercise or one already logged, and says when that is already past the window', () => {
    const slots = [lift('a'), lift('b', { logged: true }), lift('c')]
    const fit = fitToWindow(slots, 5, REST)
    expect(fit.keep).toEqual(['a', 'b'])
    expect(fit.dropped).toEqual(['c'])
    expect(fit.fits).toBe(false)
  })

  it('drops a superset whole, never one member', () => {
    const slots = [lift('a'), lift('b', { groupId: 'g' }), lift('c', { groupId: 'g' })]
    const fit = fitToWindow(slots, 8, REST)
    expect(fit.dropped).toEqual(['b', 'c'])
    expect(fit.keep).toEqual(['a'])
  })

  it('keeps a superset that holds anything logged', () => {
    const slots = [lift('a'), lift('b', { groupId: 'g' }), lift('c', { groupId: 'g', logged: true })]
    expect(fitToWindow(slots, 8, REST).dropped).toEqual([])
  })
})

describe('cleanWindow', () => {
  it('keeps whole minutes in range and treats anything else as the full session', () => {
    expect(cleanWindow(40)).toBe(40)
    expect(cleanWindow(40.4)).toBe(40)
    expect(cleanWindow(WINDOW_MIN)).toBe(WINDOW_MIN)
    expect(cleanWindow(WINDOW_MAX)).toBe(WINDOW_MAX)
    for (const bad of [WINDOW_MIN - 1, WINDOW_MAX + 1, NaN, Infinity, '40', null, undefined]) expect(cleanWindow(bad)).toBeNull()
  })
})

describe('more time than the session takes', () => {
  const own = ['a', 'b'].map((id) => lift(id)) // 6 min each: 12 min
  const extras = (ids: string[], over: Partial<WindowSlot> = {}) => ids.map((id) => lift(id, { extra: true, ...over }))

  it('adds from the front of the pool while the next one still fits, and counts only the session’s own as the full session', () => {
    const fit = fitToWindow([...own, ...extras(['x', 'y', 'z'])], 26, REST)
    expect(fit.added).toEqual(['x', 'y'])
    expect(fit.keep).toEqual(['a', 'b', 'x', 'y'])
    expect(fit.fullMinutes).toBe(12)
    expect(fit.keptMinutes).toBe(24)
    expect(fit.dropped).toEqual([])
    expect(fit.fits).toBe(true)
  })

  it('skips one that is too long and takes a shorter one behind it, to use the time', () => {
    const long = lift('long', { extra: true, sides: [{ sets: 6, repsTarget: 20, repUnit: 'reps' }] })
    const fit = fitToWindow([...own, long, ...extras(['short'])], 20, REST)
    expect(fit.added).toEqual(['short'])
  })

  it('adds nothing for the full session, for exactly the time it takes, or when the session had to be cut', () => {
    expect(fitToWindow([...own, ...extras(['x'])], null, REST).added).toEqual([])
    expect(fitToWindow([...own, ...extras(['x'])], 12, REST).added).toEqual([])
    expect(fitToWindow([...own, ...extras(['x'])], 8, REST)).toMatchObject({ added: [], dropped: ['b'] })
  })

  it('never adds more than the most extras take, nor one the gym can’t run', () => {
    const many = extras(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'])
    expect(fitToWindow([...own, ...many], 120, REST).added).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6'])
    const gym = [lift('x', { extra: true, eligible: false }), lift('y', { extra: true })]
    expect(fitToWindow([...own, ...gym], 30, REST).added).toEqual(['y'])
  })

  it('keeps an extra that is already logged, even where the minutes would not have added it', () => {
    const fit = fitToWindow([...own, ...extras(['x']), lift('y', { extra: true, logged: true })], 12, REST)
    expect(fit.added).toEqual(['y'])
    expect(fit.keep).toEqual(['a', 'b', 'y'])
  })
})
