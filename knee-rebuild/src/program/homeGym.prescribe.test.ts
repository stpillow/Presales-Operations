import { describe, expect, it } from 'vitest'
import { homeLocation } from '../db/migrations.ts'
import { effectiveSlot } from '../rules/effectiveSlot.ts'
import { availableEquipment } from '../rules/equipment.ts'
import { prescribe, type PrescriptionInput } from '../rules/prescription.ts'
import type { Exercise, ReadingResult, SetLog, SetSide, Slot } from '../schema/index.ts'
import { exerciseById, program } from './program.ts'

/*
 * The home gym on the live seed, past first sessions (the Planet Fitness snapshot covers first
 * sessions only): for every slot of all nine templates, on its own exercise and on each
 * substitution, under a few readings, loads and weeks, `prescribe` at the home gym (Planet
 * Fitness's list with Shawn's additions, an 80 lb rack) says exactly what it says with no gym
 * given. The one place the two part is the lying leg curl, which his club doesn't have (Shawn,
 * Nov 1): with no gym everything on a slot's list is here, so a move that lands on it there passes
 * over it at home.
 */

const home = availableEquipment(
  homeLocation(80, program.planetFitness, '2026-11-02', program.equipmentListVersion),
  program.equipment,
  program.planetFitness,
  program.equipment.filter((e) => e.carried).map((e) => e.id),
)

const READINGS: readonly ReadingResult[][] = [[], ['clean'], ['clean', 'clean'], ['hold'], ['hold', 'hold'], ['back-off']]
const LOADS = [0, 20, 60, 85] as const
const WEEKS = [3, 4] as const

function sidesFor(slot: Slot): SetSide[] {
  if (!slot.unilateral) return ['both']
  return slot.injuredOnly ? [program.injuredSide] : [program.injuredSide, program.injuredSide === 'right' ? 'left' : 'right']
}

/** Three sets per side at the top of the slot's range, as the exercise logs them. */
function lastSets(slot: Slot, exercise: Exercise, load: number): SetLog[] {
  const applied = effectiveSlot(slot, exercise)
  return sidesFor(applied).flatMap((side) =>
    [1, 2, 3].map((setNumber) => ({
      id: `${slot.id}-${exercise.id}-${side}-${setNumber}`,
      workoutId: 'w1',
      slotId: slot.id,
      exerciseId: exercise.id,
      setNumber,
      side,
      load,
      loadUnit: exercise.loadUnit,
      ...(applied.repUnit === 'seconds' ? { seconds: applied.repsMax } : { reps: applied.repsMax }),
      rpe: 7,
      painDuring: 2,
      stopped: false,
      ...(applied.heightIn !== undefined ? { heightIn: applied.heightIn } : {}),
      ...(applied.rangeStopDeg !== undefined ? { rangeStopDeg: applied.rangeStopDeg } : {}),
      ...(exercise.stages ? { stage: 1 } : {}),
    })),
  )
}

interface Case {
  label: string
  input: PrescriptionInput
}

function cases(): Case[] {
  const out: Case[] = []
  for (const template of program.templates) {
    for (const slot of template.slots) {
      const substitutions = slot.substitutionIds.map(exerciseById)
      for (const exercise of [exerciseById(slot.exerciseId), ...substitutions]) {
        for (const readings of READINGS) {
          for (const load of LOADS) {
            for (const week of WEEKS) {
              out.push({
                label: `${slot.id} on ${exercise.id}, ${readings.join(' ') || 'no reading'}, ${load} lb, week ${week}`,
                input: { slot, exercise, substitutions, readings, lastSets: lastSets(slot, exercise, load), week, injuredSide: program.injuredSide, dumbbellMax: 80, redFlagActive: false },
              })
            }
          }
        }
      }
    }
  }
  return out
}

describe('prescribe at the home gym equals prescribe with no gym, on the live seed', () => {
  const all = cases()
  const differences = all.flatMap(({ label, input }) => {
    const anywhere = prescribe(input)
    const atHome = prescribe({ ...input, gym: { available: home, dumbbellMaxLb: 80 } })
    return JSON.stringify(anywhere) === JSON.stringify(atHome) ? [] : [{ label, anywhere, atHome }]
  })

  it('covers every slot of all nine templates, on its own exercise and each substitution', () => {
    expect(program.templates).toHaveLength(9)
    const slots = program.templates.flatMap((t) => t.slots)
    const entries = slots.reduce((n, s) => n + 1 + s.substitutionIds.length, 0)
    expect(all).toHaveLength(entries * READINGS.length * LOADS.length * WEEKS.length)
  })

  it('differs only where a move with no gym lands on the lying leg curl, which his club lacks', () => {
    expect(differences.map((d) => d.label)).toEqual([
      'p1a-2 on seated-leg-curl, hold hold, 0 lb, week 3',
      'p1a-2 on seated-leg-curl, back-off, 0 lb, week 3',
      'p2a-2 on single-leg-seated-leg-curl, hold hold, 0 lb, week 3',
      'p2a-2 on single-leg-seated-leg-curl, back-off, 0 lb, week 3',
      'p3a-2 on seated-leg-curl, hold hold, 0 lb, week 3',
      'p3a-2 on seated-leg-curl, back-off, 0 lb, week 3',
    ])
    for (const { label, anywhere, atHome } of differences) {
      expect(anywhere.map((p) => p.exerciseId), label).toContain('lying-leg-curl')
      expect(atHome.map((p) => p.exerciseId), label).not.toContain('lying-leg-curl')
    }
  })
})
