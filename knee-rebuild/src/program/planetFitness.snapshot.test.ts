import { describe, expect, it } from 'vitest'
import { planSession } from '../app/session.ts'
import type { History } from '../db/repo.ts'
import { Settings } from '../schema/index.ts'
import { program } from './program.ts'

/*
 * What planSession says at Planet Fitness before the gym-aware prescription (M4b, design section 3):
 * all nine templates, empty history, settings as a fresh install writes them (right knee, start
 * 2026-11-02, 80 lb rack), each template in the first week of its phase. Recorded before
 * prescription.ts or runOrder.ts changed and kept byte-identical after: at Shawn's club, where every
 * slot runs its own exercise and every balance stage is here, the equipment rules change nothing.
 *
 * The slot, the exercise and the substitutions are the seed's own objects handed back, so they are
 * recorded by id; every prescription is recorded in full.
 */

const empty: History = { workouts: [], setLogs: [], morningChecks: [], runs: [], gateTests: [], sessionMoves: [] }

function settingsFor(phase: number, weekStart: number): Settings {
  return Settings.parse({
    injuredSide: program.injuredSide,
    startDate: program.startDate,
    dumbbellMax: 80,
    restTimerSeconds: 60,
    painPerSet: false,
    currentPhase: phase,
    phaseEnteredWeek: weekStart,
  })
}

function planetFitnessToday() {
  return program.templates.map((template) => {
    const phase = program.phases.find((p) => p.number === template.phase)
    if (!phase) throw new Error(`no phase ${template.phase}`)
    const plans = planSession({ template, week: phase.weekStart, settings: settingsFor(phase.number, phase.weekStart), history: empty })
    return {
      templateId: template.id,
      week: phase.weekStart,
      slots: plans.map((plan) => ({
        slotId: plan.slot.id,
        exerciseId: plan.exercise.id,
        substitutionIds: plan.substitutions.map((s) => s.id),
        prescriptions: plan.prescriptions,
      })),
    }
  })
}

describe('Planet Fitness today, empty history', () => {
  it('starts from the seed the snapshot was taken on', () => {
    expect(program.startDate).toBe('2026-11-02')
    expect(program.injuredSide).toBe('right')
    expect(program.templates.map((t) => t.id)).toEqual(['p1-a', 'p1-b', 'p1-c', 'p2-a', 'p2-b', 'p2-c', 'p3-a', 'p3-b', 'p3-c'])
  })

  it('plans all nine templates exactly as before the equipment rules', async () => {
    await expect(`${JSON.stringify(planetFitnessToday(), null, 2)}\n`).toMatchFileSnapshot('./__snapshots__/planetFitness.planSession.json')
  })
})
