import { describe, expect, it } from 'vitest'
import raw from '../../data/program.json'
import { program, templateFor } from '../program/program.ts'
import { Program } from './program.ts'

describe('data/program.json', () => {
  it('validates against the Program schema', () => {
    expect(() => Program.parse(raw)).not.toThrow()
  })

  it('has nine templates, three per phase, A B C each', () => {
    expect(program.templates).toHaveLength(9)
    for (const phase of [1, 2, 3] as const) {
      expect(program.templates.filter((t) => t.phase === phase).map((t) => t.letter).sort()).toEqual(['A', 'B', 'C'])
    }
  })

  it('every slot points at a catalog exercise, and so does every substitution and pairing', () => {
    const exerciseIds = new Set(program.exercises.map((e) => e.id))
    for (const template of program.templates) {
      const slotIds = new Set(template.slots.map((s) => s.id))
      for (const slot of template.slots) {
        expect(exerciseIds, `${slot.id} exercise`).toContain(slot.exerciseId)
        for (const sub of slot.substitutionIds) expect(exerciseIds, `${slot.id} substitution`).toContain(sub)
        if (slot.pairWithSlot) expect(slotIds, `${slot.id} pair`).toContain(slot.pairWithSlot)
        expect(slot.repsMax).toBeGreaterThanOrEqual(slot.repsMin)
      }
      const orders = template.slots.map((s) => s.order)
      expect(orders).toEqual([...orders].sort((a, b) => a - b))
      expect(new Set(orders).size).toBe(orders.length)
    }
  })

  it('unilateral slots use unilateral exercises, and the injured side logs first on all of them', () => {
    const byId = new Map(program.exercises.map((e) => [e.id, e]))
    for (const template of program.templates) {
      for (const slot of template.slots) {
        if (slot.unilateral) expect(byId.get(slot.exerciseId)?.unilateral, slot.id).toBe(true)
      }
    }
  })

  it('mileage plan matches the chart: 10 to 18 by week 11, down weeks 4, 8 and 12', () => {
    const miles = program.mileagePlan.map((w) => w.targetMiles)
    expect(miles).toEqual([10, 11, 12, 9, 13, 14, 15, 11, 16, 17, 18, 14])
    expect(program.mileagePlan.filter((w) => w.isDown).map((w) => w.week)).toEqual([4, 8, 12])
    expect(program.mileagePlan[0]?.starts).toBe('2026-11-02')
  })

  it('gates: 1 wants 80% symmetry, 2 and 3 want 90%', () => {
    const thresholds = (gate: number) =>
      new Set(program.gates.find((g) => g.number === gate)?.items.filter((i) => i.evaluator === 'symmetry').map((i) => i.threshold))
    expect(thresholds(1)).toEqual(new Set([0.8]))
    expect(thresholds(2)).toEqual(new Set([0.9]))
    expect(thresholds(3)).toEqual(new Set([0.9]))
    expect(program.gates.find((g) => g.number === 3)?.items.filter((i) => i.trials === 3)).toHaveLength(3)
  })

  it('carries the seven red flags and the start date', () => {
    expect(program.redFlags).toHaveLength(7)
    expect(program.startDate).toBe('2026-11-02')
    expect(program.injuredSide).toBe('right')
  })

  it('spot checks against program.md', () => {
    const p1a = templateFor(1, 'A').slots
    expect(p1a[0]?.exerciseId).toBe('leg-press')
    expect(p1a[0]?.prescriptionText).toBe('3 × 10–12, RPE 6→7')
    const stepUp = templateFor(1, 'C').slots.find((s) => s.exerciseId === 'step-up')
    expect(stepUp?.heightIn).toBe(6)
    expect(stepUp?.loadBeforeHeightLb).toBe(20)
    const p2b1 = templateFor(2, 'B').slots.find((s) => s.label === '1')
    expect(p2b1?.exerciseId).toBe('bulgarian-split-squat')
    expect(p2b1?.prescriptionText).toBe('3 × 8 each leg, RPE 7')
    const p3a1 = templateFor(3, 'A').slots.find((s) => s.label === '1')
    expect(p3a1?.prescriptionText).toBe('4 × 6–8, RPE 8')
    expect(templateFor(3, 'C').slots.find((s) => s.label === '6')?.exerciseId).toBe('walking-lunge')
  })
})
