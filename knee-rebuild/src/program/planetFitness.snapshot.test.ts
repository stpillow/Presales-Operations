import { describe, expect, it } from 'vitest'
import { planSession, type Gym } from '../app/session.ts'
import { homeLocation } from '../db/migrations.ts'
import type { History } from '../db/repo.ts'
import { DEFAULT_KIT, Settings } from '../schema/index.ts'
import { program } from './program.ts'

/*
 * What planSession says at Planet Fitness before the gym-aware prescription (M4b, design section 3):
 * all nine templates, empty history, settings as a fresh install writes them (right knee, start
 * 2026-11-02, 80 lb rack), each template in the first week of its phase. Recorded before
 * prescription.ts or runOrder.ts changed and kept byte-identical after. With empty history every
 * prescription is a first session, so this pins first sessions only; homeGym.prescribe.test.ts
 * covers the rest, comparing `prescribe` at the home gym with no gym given under readings, loads
 * and a deload week.
 *
 * Since planSession takes a gym (M4b Part B), it plans here at the home gym every install starts
 * with (`homeLocation`: Planet Fitness's list, Shawn's additions, an 80 lb rack, both carried items),
 * and the snapshot stays byte-identical: every slot routes own there.
 *
 * The slot, the exercise and the substitutions are the seed's own objects handed back, so they are
 * recorded by id; every prescription is recorded in full.
 */

const home: Gym = { location: homeLocation(80, program.planetFitness, '2026-11-02', program.equipmentListVersion), kit: DEFAULT_KIT }

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
    const plans = planSession({ template, week: phase.weekStart, settings: settingsFor(phase.number, phase.weekStart), history: empty, gym: home })
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
