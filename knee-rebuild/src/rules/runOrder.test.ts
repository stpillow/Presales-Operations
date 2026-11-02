import { describe, expect, it } from 'vitest'
import { firstOpenStepOf, nextStep, openStepForSide, restAfter, sessionSteps, stepKey, type StepSlot } from './runOrder.ts'

// Session A, Phase 1, right knee: 1 leg press (3), 5 abductor (2), 6 calf (3), 7 balance (3, right only), 9 elliptical (1, optional).
const slots: StepSlot[] = [
  { slotId: 'a1', optional: false, sides: [{ side: 'both', sets: 3 }] },
  { slotId: 'a5', groupId: 'g', optional: false, sides: [{ side: 'both', sets: 2 }] },
  { slotId: 'a6', groupId: 'g', optional: false, sides: [{ side: 'both', sets: 3 }] },
  { slotId: 'a7', groupId: 'g', optional: false, sides: [{ side: 'right', sets: 3 }] },
  { slotId: 'a9', optional: true, sides: [{ side: 'both', sets: 1 }] },
]
const uni: StepSlot[] = [{ slotId: 'b1', optional: false, sides: [{ side: 'right', sets: 2 }, { side: 'left', sets: 2 }] }]
const steps = sessionSteps(slots)
const keys = (xs: { key: string }[]) => xs.map((s) => s.key)
const none = new Set<string>()

describe('sessionSteps', () => {
  it('runs a superset round-robin by set number: A5.1, A6.1, A7.1, A5.2, A6.2, A7.2, A6.3, A7.3', () => {
    expect(keys(steps.filter((s) => s.unit === 'g'))).toEqual([
      'a5:both:1', 'a6:both:1', 'a7:right:1', 'a5:both:2', 'a6:both:2', 'a7:right:2', 'a6:both:3', 'a7:right:3',
    ])
  })
  it('alternates sides inside each set number, injured side first', () => {
    expect(keys(sessionSteps(uni))).toEqual(['b1:right:1', 'b1:left:1', 'b1:right:2', 'b1:left:2'])
  })
  it('keeps slot order between units', () => {
    expect(steps[0]?.key).toBe('a1:both:1')
    expect(steps.at(-1)?.key).toBe('a9:both:1')
  })
})

describe('nextStep', () => {
  it('starts at the first required step', () => {
    expect(nextStep(steps, none, none, null)?.key).toBe('a1:both:1')
  })
  it('stays inside the unit after a logged step, then moves on in session order', () => {
    const done = new Set(['a1:both:1', 'a1:both:2', 'a1:both:3'])
    expect(nextStep(steps, done, none, 'a1:both:3')?.key).toBe('a5:both:1')
    const jumped = new Set([...done, 'a6:both:1'])
    // Jumped to the calf raise first: the round continues with the first open member.
    expect(nextStep(steps, jumped, none, 'a6:both:1')?.key).toBe('a5:both:1')
  })
  it('never picks an optional slot on its own, but continues one that was started', () => {
    const allRequired = new Set(steps.filter((s) => !s.optional).map((s) => s.key))
    expect(nextStep(steps, allRequired, none, 'a7:right:3')).toBeNull()
    const twoSets: StepSlot[] = [{ slotId: 'up', optional: true, sides: [{ side: 'both', sets: 2 }] }]
    const s = sessionSteps(twoSets)
    expect(nextStep(s, new Set(['up:both:1']), none, 'up:both:1')?.key).toBe('up:both:2')
  })
  it('skips a stopped slot entirely, both sides', () => {
    const u = sessionSteps(uni)
    expect(nextStep(u, new Set(['b1:right:1']), new Set(['b1']), 'b1:right:1')).toBeNull()
    expect(nextStep(steps, none, new Set(['a1']), null)?.key).toBe('a5:both:1')
  })
  it('a tap on a row lands on that slot’s first open step', () => {
    expect(firstOpenStepOf(steps, 'a6', new Set(['a6:both:1']), none)?.key).toBe('a6:both:2')
    expect(firstOpenStepOf(steps, 'a9', none, none)?.key).toBe('a9:both:1')
    expect(firstOpenStepOf(steps, 'a1', none, new Set(['a1']))).toBeNull()
  })
})

describe('restAfter', () => {
  it('rests after each set of a single bilateral slot, and after its last', () => {
    expect(restAfter(steps, 'a1:both:1', new Set(['a1:both:1']), none)).toBe(true)
    expect(restAfter(steps, 'a1:both:3', new Set(['a1:both:1', 'a1:both:2', 'a1:both:3']), none)).toBe(true)
  })
  it('runs both sides of a set back to back, resting after the healthy side', () => {
    const u = sessionSteps(uni)
    expect(restAfter(u, 'b1:right:1', new Set(['b1:right:1']), none)).toBe(false)
    expect(restAfter(u, 'b1:left:1', new Set(['b1:right:1', 'b1:left:1']), none)).toBe(true)
  })
  it('rests only after the last member of a superset round', () => {
    expect(restAfter(steps, 'a5:both:1', new Set(['a5:both:1']), none)).toBe(false)
    expect(restAfter(steps, 'a6:both:1', new Set(['a5:both:1', 'a6:both:1']), none)).toBe(false)
    expect(restAfter(steps, 'a7:right:1', new Set(['a5:both:1', 'a6:both:1', 'a7:right:1']), none)).toBe(true)
  })
  it('a stopped member ends the round early', () => {
    const done = new Set(['a5:both:1', 'a5:both:2', 'a6:both:1', 'a6:both:2', 'a7:right:1', 'a7:right:2', 'a6:both:3'])
    expect(restAfter(steps, 'a6:both:3', done, new Set(['a7']))).toBe(true)
  })
  it('builds keys from slot, side and set number', () => {
    expect(stepKey('a1', 'both', 2)).toBe('a1:both:2')
  })
})

describe('openStepForSide', () => {
  it('lands on the lowest open set of the chosen side', () => {
    const u = sessionSteps(uni)
    expect(openStepForSide(u, 'b1', 'left', none, none)?.key).toBe('b1:left:1')
    expect(openStepForSide(u, 'b1', 'left', new Set(['b1:left:1']), none)?.key).toBe('b1:left:2')
    expect(openStepForSide(u, 'b1', 'left', none, new Set(['b1']))).toBeNull()
  })
})

describe('a slot with nothing here (routed none at this gym)', () => {
  it('is never the automatic next step, at the start or between units', () => {
    expect(nextStep(steps, none, none, null, new Set(['a1']))?.key).toBe('a5:both:1')
    const a1 = new Set(['a1:both:1', 'a1:both:2', 'a1:both:3'])
    expect(nextStep(steps, a1, none, 'a1:both:3', new Set(['a5']))?.key).toBe('a6:both:1')
  })
  it('is passed over inside a superset round', () => {
    expect(nextStep(steps, new Set(['a5:both:1']), none, 'a5:both:1', new Set(['a6']))?.key).toBe('a7:right:1')
    expect(nextStep(steps, new Set(['a5:both:1', 'a7:right:1']), none, 'a7:right:1', new Set(['a6']))?.key).toBe('a5:both:2')
  })
  it('leaves nothing required when it is all that is left', () => {
    const allButA1 = new Set(steps.filter((s) => !s.optional && s.slotId !== 'a1').map((s) => s.key))
    expect(nextStep(steps, allButA1, none, 'a7:right:3', new Set(['a1']))).toBeNull()
    expect(nextStep(steps, allButA1, none, 'a7:right:3')?.key).toBe('a1:both:1')
  })
  it('still takes a tap on its row, for Skip or Do it anyway', () => {
    expect(firstOpenStepOf(steps, 'a6', none, none)?.key).toBe('a6:both:1')
  })
  it('ends a superset round without it, so the rest comes after the last member that runs', () => {
    expect(restAfter(steps, 'a6:both:1', new Set(['a5:both:1', 'a6:both:1']), none, new Set(['a7']))).toBe(true)
    expect(restAfter(steps, 'a6:both:1', new Set(['a5:both:1', 'a6:both:1']), none)).toBe(false)
  })
})
