import { describe, expect, it } from 'vitest'
import { ADDED_SLOTS_MAX, AddedSlot, type Exercise, type SessionTemplate, type Slot } from '../schema/index.ts'
import { ADDED_SLOT_PREFIX, NOT_YET_WORDS, addableExercises, addedDefaults, addedFor, addedPrescriptionText, addedRepUnit, addedRule, addedSlotId, addedSlotProblem, isAddedSlotId, notAddableReason, phaseExerciseIds, slotFromAdded, withAddedSlots } from './addedSlots.ts'

const ex = (over: Partial<Exercise> & { id: string }): Exercise => ({
  name: over.id,
  pattern: 'quad',
  equipment: 'dumbbells',
  loadType: 'dumbbell-each',
  loadUnit: 'lb',
  increment: 5,
  loadDirection: 'up',
  unilateral: false,
  requires: [],
  ...over,
})

const CURL = ex({ id: 'curl', pattern: 'pull' })
const PLANK = ex({ id: 'plank', pattern: 'core', loadType: 'time', loadUnit: 's', increment: 5 })
const BRIDGE = ex({ id: 'bridge', pattern: 'hip', loadType: 'bodyweight', loadUnit: 'none', increment: 0 })
const BAND = ex({ id: 'band-walk', pattern: 'hip', loadType: 'band', loadUnit: 'none', increment: 0 })
const BALANCE = ex({ id: 'balance', pattern: 'balance', loadType: 'bodyweight', loadUnit: 'none', increment: 0, stages: ['eyes open', 'eyes closed'], requires: [], unilateral: true })
const STEP = ex({ id: 'step-up', loadType: 'step-height', loadUnit: 'in', increment: 2 })
const CARRY = ex({ id: 'carry', pattern: 'carry' })
const SPLIT = ex({ id: 'split', unilateral: true })
const LATE = ex({ id: 'late-lift' })
const JUMP = ex({ id: 'jump', pattern: 'plyo', loadType: 'bodyweight', loadUnit: 'none', increment: 0 })
const CATALOG = new Map([CURL, PLANK, BRIDGE, BAND, BALANCE, STEP, CARRY, SPLIT, LATE, JUMP].map((e) => [e.id, e]))

const slot = (order: number): Slot => ({
  id: `p1a-${order}`,
  order,
  label: String(order),
  exerciseId: 'bridge',
  sets: 3,
  repsMin: 8,
  repsMax: 10,
  repUnit: 'reps',
  unilateral: false,
  injuredOnly: false,
  prescriptionText: '3 × 8–10',
  cues: [],
  progressionRule: 'fixed',
  substitutionIds: [],
  optional: false,
})
// Phase 1 uses bridge, band-walk and, as substitutions, curl, plank, balance, split, step-up and carry; late-lift and jump are phase 2's.
const TEMPLATE: SessionTemplate = {
  id: 'p1-a',
  phase: 1,
  letter: 'A',
  slots: [
    { ...slot(1), substitutionIds: ['curl', 'plank'] },
    { ...slot(2), exerciseId: 'band-walk', substitutionIds: ['balance', 'split', 'step-up', 'carry'] },
    slot(3),
  ],
}
const LATER: SessionTemplate = { id: 'p2-a', phase: 2, letter: 'A', slots: [{ ...slot(1), id: 'p2a-1', exerciseId: 'late-lift', substitutionIds: ['jump'] }] }
const TEMPLATES = [TEMPLATE, LATER]
const IN_PHASE_1 = phaseExerciseIds(TEMPLATES, 1)
const add = (id: string, exerciseId: string, over: Partial<AddedSlot> = {}): AddedSlot => ({
  id: addedSlotId(id),
  templateId: 'p1-a',
  exerciseId,
  sets: 3,
  repsMin: 8,
  repsMax: 10,
  addedOn: '2026-11-04',
  ...over,
})

describe('what can be added, and how it runs', () => {
  it('marks its ids with a prefix the engine can tell from program.md’s', () => {
    expect(addedSlotId('k3')).toBe(`${ADDED_SLOT_PREFIX}k3`)
    expect(isAddedSlotId('added-k3')).toBe(true)
    expect(isAddedSlotId('p1a-3')).toBe(false)
  })

  it('refuses a step-height exercise and a carry, in words, and takes the rest', () => {
    expect(notAddableReason(STEP)).toMatch(/step height/)
    expect(notAddableReason(CARRY)).toMatch(/yards or minutes/)
    expect(notAddableReason({ name: 'Row', pattern: 'cardio', loadType: 'stack' })).toMatch(/yards or minutes/)
    expect(notAddableReason(JUMP)).toMatch(/jumping or landing/)
    for (const e of [CURL, PLANK, BRIDGE, BAND, BALANCE, SPLIT, LATE]) expect(notAddableReason(e)).toBeNull()
  })

  it('counts holds and staged balance work in seconds, everything else in reps', () => {
    expect(addedRepUnit(PLANK)).toBe('seconds')
    expect(addedRepUnit(BALANCE)).toBe('seconds')
    expect(addedRepUnit(CURL)).toBe('reps')
  })

  it('takes the conservative rule: loaded climbs, bodyweight and band repeat, a hold adds time, staged work steps', () => {
    expect(addedRule(CURL)).toBe('double-progression')
    expect(addedRule(BRIDGE)).toBe('fixed')
    expect(addedRule(BAND)).toBe('fixed')
    expect(addedRule(PLANK)).toBe('time')
    expect(addedRule(BALANCE)).toBe('stage')
  })

  it('writes the prescription as program.md would: sets × range, seconds, each leg', () => {
    expect(addedPrescriptionText({ sets: 3, repsMin: 8, repsMax: 10 }, CURL)).toBe('3 × 8–10')
    expect(addedPrescriptionText({ sets: 2, repsMin: 30, repsMax: 45 }, PLANK)).toBe('2 × 30–45 s')
    expect(addedPrescriptionText({ sets: 3, repsMin: 10, repsMax: 10 }, SPLIT)).toBe('3 × 10 each leg')
  })
})

describe('addedSlotProblem', () => {
  it('is null for an exercise that can be added', () => {
    expect(addedSlotProblem(add('a', 'curl'), CURL, 0, IN_PHASE_1)).toBeNull()
  })
  it('says why not: no such exercise, one that can’t be added, a full session', () => {
    expect(addedSlotProblem(add('a', 'nope'), undefined, 0, IN_PHASE_1)).toMatch(/isn’t in the catalog/)
    expect(addedSlotProblem(add('a', 'step-up'), STEP, 0, IN_PHASE_1)).toMatch(/step height/)
    expect(addedSlotProblem(add('a', 'curl'), CURL, ADDED_SLOTS_MAX, IN_PHASE_1)).toMatch(/remove one first/)
  })
})

describe('slotFromAdded', () => {
  it('makes a slot that passes the program’s own schema, after the template’s, labelled +n', () => {
    const made = slotFromAdded(add('a', 'split'), SPLIT, 1, 4)
    expect(made).toMatchObject({ id: 'added-a', order: 4, label: '+1', exerciseId: 'split', sets: 3, repsMin: 8, repsMax: 10, repUnit: 'reps', unilateral: true, injuredOnly: false, optional: false, progressionRule: 'double-progression', perSideLabel: 'each leg', substitutionIds: [], cues: [] })
    expect(made.prescriptionText).toBe('3 × 8–10 each leg')
  })
})

describe('withAddedSlots', () => {
  it('leaves a template with nothing added exactly as written', () => {
    expect(withAddedSlots(TEMPLATE, [], CATALOG, TEMPLATES)).toBe(TEMPLATE)
    expect(withAddedSlots(TEMPLATE, [add('x', 'curl', { templateId: 'p1-b' })], CATALOG, TEMPLATES)).toBe(TEMPLATE)
  })

  it('lays the added slots after the template’s own, in the order they were added, without touching the template', () => {
    const rows = [add('b', 'plank', { addedOn: '2026-11-05' }), add('a', 'curl')]
    const out = withAddedSlots(TEMPLATE, rows, CATALOG, TEMPLATES)
    expect(out.slots.map((s) => s.id)).toEqual(['p1a-1', 'p1a-2', 'p1a-3', 'added-a', 'added-b'])
    expect(out.slots.map((s) => s.order)).toEqual([1, 2, 3, 4, 5])
    expect(out.slots.slice(3).map((s) => s.label)).toEqual(['+1', '+2'])
    expect(TEMPLATE.slots).toHaveLength(3)
  })

  it('drops a row whose exercise the catalog no longer runs, and never reads another template’s rows', () => {
    const rows = [add('a', 'gone'), add('b', 'step-up'), add('c', 'curl'), add('d', 'curl', { templateId: 'p2-a' })]
    expect(addedFor('p1-a', rows, CATALOG, IN_PHASE_1).map((a) => a.id)).toEqual(['added-c'])
    expect(withAddedSlots(TEMPLATE, rows, CATALOG, TEMPLATES).slots.map((s) => s.id)).toEqual(['p1a-1', 'p1a-2', 'p1a-3', 'added-c'])
  })

  it('stops at the most a session takes', () => {
    const rows = Array.from({ length: ADDED_SLOTS_MAX + 2 }, (_, i) => add(`r${i}`, 'curl', { addedOn: `2026-11-${String(10 + i).padStart(2, '0')}` }))
    expect(withAddedSlots(TEMPLATE, rows, CATALOG, TEMPLATES).slots).toHaveLength(3 + ADDED_SLOTS_MAX)
  })
})

describe('AddedSlot', () => {
  it('holds the choices only, and refuses a range that runs backwards or too many sets', () => {
    expect(AddedSlot.safeParse(add('a', 'curl')).success).toBe(true)
    expect(AddedSlot.safeParse(add('a', 'curl', { repsMin: 10, repsMax: 8 })).success).toBe(false)
    expect(AddedSlot.safeParse(add('a', 'curl', { sets: 7 })).success).toBe(false)
    expect(AddedSlot.safeParse({ ...add('a', 'curl'), extra: 1 }).success).toBe(false)
  })
})

describe('the picker', () => {
  it('lists what can be added, by name, and leaves out what can’t', () => {
    const names = addableExercises([...CATALOG.values()].map((e) => ({ ...e, name: e.id })), TEMPLATES, 1).map((e) => e.name)
    expect(names).toEqual(['balance', 'band-walk', 'bridge', 'curl', 'plank', 'split'])
  })

  it('starts a lift at 3 × 8–12 and a hold at 3 × 30–45 seconds', () => {
    expect(addedDefaults(CURL)).toEqual({ sets: 3, repsMin: 8, repsMax: 12 })
    expect(addedDefaults(PLANK)).toEqual({ sets: 3, repsMin: 30, repsMax: 45 })
    expect(addedDefaults(BALANCE)).toEqual({ sets: 3, repsMin: 30, repsMax: 45 })
  })
})

describe('staying inside the program', () => {
  it('knows what program.md has used by a phase: a slot’s own exercise and its substitutions, in that phase or an earlier one', () => {
    expect([...phaseExerciseIds(TEMPLATES, 1)].sort()).toEqual(['balance', 'band-walk', 'bridge', 'carry', 'curl', 'plank', 'split', 'step-up'])
    expect([...phaseExerciseIds(TEMPLATES, 2)]).toEqual(expect.arrayContaining(['late-lift', 'jump', 'bridge']))
  })

  it('refuses, in words, an exercise program.md holds for a later phase', () => {
    expect(addedSlotProblem(add('a', 'late-lift'), LATE, 0, IN_PHASE_1)).toBe(NOT_YET_WORDS)
    expect(addedSlotProblem(add('a', 'late-lift'), LATE, 0, phaseExerciseIds(TEMPLATES, 2))).toBeNull()
  })

  it('leaves a later phase’s exercise, and any jumping work, out of the picker, and out of a session an imported file put it on', () => {
    expect(addableExercises([...CATALOG.values()], TEMPLATES, 1).map((e) => e.id)).not.toContain('late-lift')
    expect(addableExercises([...CATALOG.values()], TEMPLATES, 2).map((e) => e.id)).toContain('late-lift')
    expect(addableExercises([...CATALOG.values()], TEMPLATES, 2).map((e) => e.id)).not.toContain('jump')
    const rows = [add('a', 'late-lift'), add('b', 'jump'), add('c', 'curl')]
    expect(withAddedSlots(TEMPLATE, rows, CATALOG, TEMPLATES).slots.map((s) => s.id)).toEqual(['p1a-1', 'p1a-2', 'p1a-3', 'added-c'])
  })
})
