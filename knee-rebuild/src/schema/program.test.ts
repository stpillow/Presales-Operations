import { describe, expect, it } from 'vitest'
import raw from '../../data/program.json'
import { program, templateFor } from '../program/program.ts'
import { DELOAD_WEEKS } from '../rules/calendar.ts'
import { Equipment, Exercise, Program, Requirement } from './program.ts'

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
        expect(slot.repsMax).toBeGreaterThanOrEqual(slot.repsMin)
      }
      expect(slotIds.size).toBe(template.slots.length)
      const groups = new Map<string, number>()
      for (const slot of template.slots) if (slot.groupId) groups.set(slot.groupId, (groups.get(slot.groupId) ?? 0) + 1)
      for (const [groupId, size] of groups) expect(size, `${template.id} group ${groupId}`).toBeGreaterThanOrEqual(2)
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

  it('mileage plan: the chart’s climb to 18 by week 11, held flat in deload weeks 4, 8 and 12 (Shawn, Nov 1)', () => {
    const miles = program.mileagePlan.map((w) => w.targetMiles)
    expect(miles).toEqual([10, 11, 12, 12, 13, 14, 15, 15, 16, 17, 18, 18])
    // Only climbs, never decreases (PROGRAM-QUESTIONS 1).
    for (let i = 1; i < miles.length; i++) expect(miles[i]).toBeGreaterThanOrEqual(miles[i - 1] ?? 0)
    expect(program.mileagePlan.filter((w) => w.isDown).map((w) => w.week)).toEqual([4, 8, 12])
    expect(program.mileagePlan.map((w) => w.week)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
  })

  it('selectorized machines log pounds in 5 lb steps, not plate numbers (Shawn, Nov 1)', () => {
    const stacks = program.exercises.filter((e) => e.loadType === 'stack')
    expect(stacks.length).toBeGreaterThan(0)
    for (const e of stacks) expect({ id: e.id, unit: e.loadUnit, step: e.increment }).toEqual({ id: e.id, unit: 'lb', step: 5 })
  })
  it('the mileage down weeks are the lifting deload weeks', () => {
    expect(program.mileagePlan.filter((w) => w.isDown).map((w) => w.week)).toEqual([...DELOAD_WEEKS])
  })

  it('bands: Phase 2 snap-downs from phase week 3, Phase 3 plyo blocks in phase weeks 1–2, 3–4, 5 on', () => {
    expect(templateFor(2, 'A').slots.find((s) => s.id === 'p2a-prep')?.phaseWeeks).toEqual([3, null])
    const bands = templateFor(3, 'C').slots.filter((s) => s.phaseWeeks).map((s) => s.phaseWeeks)
    expect(new Set(bands.map((b) => JSON.stringify(b)))).toEqual(new Set(['[1,2]', '[3,4]', '[5,null]']))
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

describe('equipment schema (M4b)', () => {
  const balance = {
    id: 'balance', name: 'Balance', pattern: 'balance', equipment: 'Folded mat or bosu', loadType: 'time', loadUnit: 's', increment: 5, unilateral: true,
    stages: ['folded mat', 'bosu'], requires: [{ anyOf: ['mats', 'bosu'] }], stageRequires: [['mats'], ['bosu']],
  } as const
  it('a requirement is one id, or anyOf two or more ids', () => {
    expect(Requirement.safeParse('mats').success).toBe(true)
    expect(Requirement.safeParse({ anyOf: ['mats', 'bosu'] }).success).toBe(true)
    expect(Requirement.safeParse({ anyOf: ['mats'] }).success).toBe(false)
    expect(Requirement.safeParse({ anyOf: ['mats', 'bosu'], allOf: [] }).success).toBe(false)
    expect(Requirement.safeParse('Folded mat').success).toBe(false)
  })
  it('exercises must say what they require, even when it is nothing', () => {
    expect(Exercise.safeParse(balance).success).toBe(true)
    expect(Exercise.safeParse({ ...balance, requires: [] }).success).toBe(true)
    const { requires: _requires, ...without } = balance
    expect(Exercise.safeParse(without).success).toBe(false)
  })
  it('stageRequires has one entry per stage, and needs stages', () => {
    expect(Exercise.safeParse({ ...balance, stageRequires: [['mats']] }).success).toBe(false)
    expect(Exercise.safeParse({ ...balance, stageRequires: [['mats'], ['bosu'], []] }).success).toBe(false)
    const { stages: _stages, ...noStages } = balance
    expect(Exercise.safeParse(noStages).success).toBe(false)
    const { stageRequires: _sr, ...noStageRequires } = balance
    expect(Exercise.safeParse(noStageRequires).success).toBe(true)
  })
  it('an equipment item is strict', () => {
    const mats = { id: 'mats', name: 'Mats', group: 'Balance and plyos', source: 'Mats', aliases: ['mat'], carried: false, hedged: false, addedIn: 1 }
    expect(Equipment.safeParse(mats).success).toBe(true)
    expect(Equipment.safeParse({ ...mats, addedIn: 0 }).success).toBe(false)
    expect(Equipment.safeParse({ ...mats, id: 'Mats' }).success).toBe(false)
    expect(Equipment.safeParse({ ...mats, weightLb: 2 }).success).toBe(false)
  })
})
