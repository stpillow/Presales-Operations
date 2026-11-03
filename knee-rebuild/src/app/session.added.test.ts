import { describe, expect, it } from 'vitest'
import { homeLocation } from '../db/migrations.ts'
import type { History } from '../db/repo.ts'
import { program, templateFor } from '../program/program.ts'
import { DEFAULT_KIT, Settings, type AddedSlot } from '../schema/index.ts'
import { planSession, type Gym } from './session.ts'

// planSession with exercises Shawn added to a session (Dexie version 5): they run after the template's
// own slots, prescribe and log like any slot, and program.md's template is never written.

const home: Gym = { location: homeLocation(80, program.planetFitness, '2026-11-02', program.equipmentListVersion), kit: DEFAULT_KIT }
const settings = Settings.parse({ injuredSide: program.injuredSide, startDate: program.startDate, dumbbellMax: 80, restTimerSeconds: 60, painPerSet: false, currentPhase: 1, phaseEnteredWeek: 1 })
const historyOf = (over: Partial<History> = {}): History => ({ workouts: [], setLogs: [], morningChecks: [], runs: [], gateTests: [], sessionMoves: [], ...over })
const added = (over: Partial<AddedSlot> = {}): AddedSlot => ({ id: 'added-k1', templateId: 'p1-a', exerciseId: 'db-bench-press', sets: 3, repsMin: 8, repsMax: 10, addedOn: '2026-11-04', ...over })
const plan = (history: History, week = 2) => planSession({ template: templateFor(1, 'A'), week, settings, history, gym: home })

describe('planSession with added exercises', () => {
  it('runs them after the template’s own slots, as ordinary slots with a prescription of their own', () => {
    const own = plan(historyOf())
    const plans = plan(historyOf({ addedSlots: [added()] }))
    expect(plans.map((p) => p.slot.id)).toEqual([...own.map((p) => p.slot.id), 'added-k1'])
    const mine = plans.at(-1)
    expect(mine?.slot).toMatchObject({ label: '+1', exerciseId: 'db-bench-press', sets: 3, repsMin: 8, repsMax: 10, progressionRule: 'double-progression', optional: false })
    expect(mine?.exercise.id).toBe('db-bench-press')
    expect(mine?.prescriptions[0]).toMatchObject({ sets: 3, repUnit: 'reps' })
  })

  it('leaves the other slots’ plans exactly as they were, and never writes the seed template', () => {
    const before = structuredClone(templateFor(1, 'A'))
    const own = plan(historyOf())
    const plans = plan(historyOf({ addedSlots: [added()] }))
    expect(plans.slice(0, own.length)).toEqual(own)
    expect(templateFor(1, 'A')).toEqual(before)
  })

  it('an exercise added to another session does not show up here, and a history with none plans as written', () => {
    const own = plan(historyOf())
    expect(plan(historyOf({ addedSlots: [added({ templateId: 'p1-b' })] }))).toEqual(own)
    const { addedSlots: _none, ...bare } = historyOf()
    void _none
    expect(plan(bare)).toEqual(own)
  })

  it('a deload week takes fewer sets of an added exercise, as it does of every slot', () => {
    const deload = plan(historyOf({ addedSlots: [added({ sets: 3 })] }), 4)
    expect(deload.at(-1)?.prescriptions[0]?.sets).toBe(2)
  })
})
