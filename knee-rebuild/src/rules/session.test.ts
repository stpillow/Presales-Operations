import { describe, expect, it } from 'vitest'
import { SessionTemplate, type Slot } from '../schema/index.ts'
import { phaseWeekOf, slotsForPhaseWeek } from './session.ts'

function slot(id: string, order: number, phaseWeeks?: [number, number | null]): Slot {
  return {
    id,
    order,
    label: String(order),
    exerciseId: 'leg-press',
    sets: 3,
    repsMin: 8,
    repsMax: 10,
    repUnit: 'reps',
    unilateral: false,
    injuredOnly: false,
    prescriptionText: '3 × 8–10',
    cues: [],
    progressionRule: 'double-progression',
    substitutionIds: [],
    optional: false,
    ...(phaseWeeks ? { phaseWeeks } : {}),
  }
}

const template = SessionTemplate.parse({
  id: 'fx-a',
  phase: 3,
  letter: 'A',
  slots: [slot('early', 1, [1, 2]), slot('mid', 2, [3, 4]), slot('late', 3, [5, null]), slot('always', 4)],
})

const ids = (phaseWeek: number) => slotsForPhaseWeek(template, phaseWeek).map((s) => s.id)

describe('slotsForPhaseWeek', () => {
  it('runs each band only in its weeks of the phase', () => {
    expect(ids(1)).toEqual(['early', 'always'])
    expect(ids(2)).toEqual(['early', 'always'])
    expect(ids(3)).toEqual(['mid', 'always'])
    expect(ids(4)).toEqual(['mid', 'always'])
  })
  it('keeps an open-ended band running however long the phase lasts', () => {
    expect(ids(5)).toEqual(['late', 'always'])
    expect(ids(9)).toEqual(['late', 'always'])
  })
})

describe('phaseWeekOf', () => {
  it('counts from the week the phase was entered', () => {
    expect(phaseWeekOf(8, 8)).toBe(1)
    expect(phaseWeekOf(13, 9)).toBe(5)
  })
  it('refuses a week before the phase began', () => {
    expect(() => phaseWeekOf(7, 8)).toThrow(RangeError)
  })
})
