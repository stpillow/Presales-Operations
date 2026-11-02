import { describe, expect, it } from 'vitest'
import { homeLocation } from '../db/migrations.ts'
import type { History } from '../db/repo.ts'
import { program, templateFor } from '../program/program.ts'
import { DEFAULT_KIT, Settings, type Location, type MorningCheck, type ProgramOverride, type SetLog, type Workout } from '../schema/index.ts'
import { planSession, type Gym } from './session.ts'

// planSession with the Program screen's edits (M6, brief section 1): the engine runs the edited slot,
// so its cues, its Swap list, the gym's routing and a back-off's move follow the edit exactly as if
// program.md had written it that way. program.md's slot is never written.

const home: Gym = { location: homeLocation(80, program.planetFitness, '2026-11-02', program.equipmentListVersion), kit: DEFAULT_KIT }
const settingsIn = (phase: number, phaseEnteredWeek: number): Settings =>
  Settings.parse({ injuredSide: program.injuredSide, startDate: program.startDate, dumbbellMax: 80, restTimerSeconds: 60, painPerSet: false, currentPhase: phase, phaseEnteredWeek })
const historyOf = (over: Partial<History> = {}): History => ({ workouts: [], setLogs: [], morningChecks: [], runs: [], gateTests: [], sessionMoves: [], ...over })
const edit = (over: Partial<ProgramOverride>): ProgramOverride => ({ slotId: 'p1a-1', editedOn: '2026-11-16', ...over }) as ProgramOverride

const phaseOneA = (history: History, gym: Gym = home, chosenExercise?: Record<string, string>) =>
  planSession({ template: templateFor(1, 'A'), week: 2, settings: settingsIn(1, 1), history, gym, ...(chosenExercise ? { chosenExercise } : {}) })
const slot = <T extends { slot: { id: string } }>(plans: T[], id: string): T => {
  const plan = plans.find((p) => p.slot.id === id)
  if (!plan) throw new Error(`no slot ${id}`)
  return plan
}

describe('cues', () => {
  it('the runner gets the edited cues; the other slots keep program.md’s', () => {
    const plans = phaseOneA(historyOf({ programOverrides: [edit({ cues: ['Feet high', 'Lower for 3 s'] })] }))
    expect(slot(plans, 'p1a-1').slot.cues).toEqual(['Feet high', 'Lower for 3 s'])
    expect(slot(plans, 'p1a-2').slot.cues).toEqual(templateFor(1, 'A').slots[1]?.cues)
  })

  it('a history with no edits, or none for this slot, plans as program.md writes it', () => {
    const written = phaseOneA(historyOf())
    const { programOverrides: _none, ...bare } = historyOf()
    void _none
    expect(phaseOneA(bare)).toEqual(written)
    expect(phaseOneA(historyOf({ programOverrides: [edit({ slotId: 'p2a-1', cues: [] })] }))).toEqual(written)
  })

  it('never writes program.md’s slot', () => {
    const before = structuredClone(templateFor(1, 'A'))
    phaseOneA(historyOf({ programOverrides: [edit({ cues: [], substitutionIds: [] })] }))
    expect(templateFor(1, 'A')).toEqual(before)
  })
})

describe('substitutions: the Swap list and the gym’s routing', () => {
  const reordered = edit({ substitutionIds: ['goblet-squat-bench', 'smith-box-squat', 'leg-press-45'] })

  it('the Swap list runs in the edited order, without what was removed, with what was added', () => {
    expect(slot(phaseOneA(historyOf({ programOverrides: [reordered] })), 'p1a-1').substitutions.map((e) => e.id)).toEqual(['goblet-squat-bench', 'smith-box-squat', 'leg-press-45'])
    const added = edit({ substitutionIds: ['smith-box-squat', 'single-leg-leg-press'] })
    expect(slot(phaseOneA(historyOf({ programOverrides: [added] })), 'p1a-1').substitutions.map((e) => e.id)).toEqual(['smith-box-squat', 'single-leg-leg-press'])
  })

  // A gym with a Smith machine, a bench and dumbbells, and neither leg press.
  const noPresses: Location = { ...home.location, id: 'loc-1', name: 'Hotel', present: ['smith-machine', 'flat-bench'], dumbbellMaxLb: 50, startedFrom: 'empty' }
  const gym: Gym = { location: noPresses, kit: DEFAULT_KIT }

  it('a gym without the leg press moves the slot to the first exercise on the edited list that it has', () => {
    const written = slot(phaseOneA(historyOf(), gym), 'p1a-1')
    expect(written.route).toMatchObject({ kind: 'moved', exerciseId: 'smith-box-squat' })
    const edited = slot(phaseOneA(historyOf({ programOverrides: [reordered] }), gym), 'p1a-1')
    expect(edited.route).toMatchObject({ kind: 'moved', exerciseId: 'goblet-squat-bench' })
    expect(edited.exercise.id).toBe('goblet-squat-bench')
  })

  it('with every substitution removed, nothing here runs the slot: it stays for Skip or Do it anyway', () => {
    const plan = slot(phaseOneA(historyOf({ programOverrides: [edit({ substitutionIds: [] })] }), gym), 'p1a-1')
    expect(plan.route.kind).toBe('none')
    expect(plan.exercise.id).toBe('leg-press')
  })

  it('a Swap chosen for the session must be on the edited list', () => {
    const removed = edit({ substitutionIds: ['goblet-squat-bench'] })
    expect(slot(phaseOneA(historyOf({ programOverrides: [removed] }), home, { 'p1a-1': 'goblet-squat-bench' }), 'p1a-1').exercise.id).toBe('goblet-squat-bench')
    expect(slot(phaseOneA(historyOf({ programOverrides: [removed] }), home, { 'p1a-1': 'smith-box-squat' }), 'p1a-1').exercise.id).toBe('leg-press')
  })

  it('an id the catalog no longer has is dropped, not looked up', () => {
    const stale = { slotId: 'p1a-1', substitutionIds: ['retired-press', 'smith-box-squat'], editedOn: '2026-11-16' }
    expect(slot(phaseOneA(historyOf({ programOverrides: [stale] })), 'p1a-1').substitutions.map((e) => e.id)).toEqual(['smith-box-squat'])
  })
})

describe('a back-off on bodyweight work moves to the first substitution on the edited list (PROGRAM-QUESTIONS 49)', () => {
  // Phase 3 A, slot 2: Nordic negatives at pain 6, a clean morning after. program.md backs them off to the single-leg seated leg curl.
  const template = templateFor(3, 'A')
  const settings = settingsIn(3, 8)
  const workout: Workout = { id: 'w1', date: '2026-12-29', templateId: 'p3-a', phase: 3, week: 9, isDeload: false, status: 'finished' }
  const sets: SetLog[] = [1, 2, 3].map((n) => ({ id: `w1-${n}`, workoutId: 'w1', slotId: 'p3a-2', exerciseId: 'nordic-negatives', setNumber: n, side: 'both', load: 0, loadUnit: 'none', reps: 3, painDuring: 6, stopped: false }))
  const check: MorningCheck = { id: 'm1', date: '2026-12-30', appliesTo: null, stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [] }
  const nordics = (programOverrides: ProgramOverride[]) => {
    const plans = planSession({ template, week: 10, settings, history: historyOf({ workouts: [workout], setLogs: sets, morningChecks: [check], programOverrides }), gym: home, before: '2027-01-05' })
    return slot(plans, 'p3a-2')
  }

  it('as program.md writes it, to the single-leg seated leg curl', () => {
    expect(nordics([]).prescriptions[0]).toMatchObject({ exerciseId: 'single-leg-seated-leg-curl', basis: 'back-off' })
  })

  it('with the two-leg seated leg curl moved first, to the seated leg curl', () => {
    const plan = nordics([edit({ slotId: 'p3a-2', substitutionIds: ['seated-leg-curl', 'single-leg-seated-leg-curl', 'lying-leg-curl'] })])
    expect(plan.prescriptions[0]).toMatchObject({ exerciseId: 'seated-leg-curl', basis: 'back-off', note: 'Back off: the easier version, Seated leg curl.' })
  })

  it('the gym still passes over what it lacks on the edited list: Planet Fitness has no lying leg curl', () => {
    const plan = nordics([edit({ slotId: 'p3a-2', substitutionIds: ['lying-leg-curl', 'seated-leg-curl', 'single-leg-seated-leg-curl'] })])
    expect(plan.prescriptions[0]).toMatchObject({ exerciseId: 'seated-leg-curl', basis: 'back-off' })
  })

  describe('once the slot is on the easier version (PROGRAM-QUESTIONS 55 and 120)', () => {
    const curl: Workout = { id: 'w2', date: '2027-01-05', templateId: 'p3-a', phase: 3, week: 10, isDeload: false, status: 'finished' }
    const curlSets: SetLog[] = [1, 2, 3].map((n) => ({ id: `w2-${n}`, workoutId: 'w2', slotId: 'p3a-2', exerciseId: 'single-leg-seated-leg-curl', setNumber: n, side: 'both', load: 40, loadUnit: 'lb', reps: 10, painDuring: 2, stopped: false }))
    const curlCheck: MorningCheck = { ...check, id: 'm2', date: '2027-01-06' }
    const onCurl = (programOverrides: ProgramOverride[]) => {
      const history = historyOf({ workouts: [workout, curl], setLogs: [...sets, ...curlSets], morningChecks: [check, curlCheck], programOverrides })
      return slot(planSession({ template, week: 11, settings, history, gym: home, before: '2027-01-12' }), 'p3a-2')
    }

    it('as program.md writes it, the slot stays on the leg curl', () => {
      expect(onCurl([]).exercise.id).toBe('single-leg-seated-leg-curl')
    })

    it('moving the leg curl down the list, past nothing this gym has, leaves the slot on it', () => {
      const plan = onCurl([edit({ slotId: 'p3a-2', substitutionIds: ['lying-leg-curl', 'single-leg-seated-leg-curl', 'seated-leg-curl'] })])
      expect(plan.exercise.id).toBe('single-leg-seated-leg-curl')
    })

    it('moving one this gym has above it puts the slot on that one, still backed off from Nordics, as if program.md wrote it first (question 89)', () => {
      const plan = onCurl([edit({ slotId: 'p3a-2', substitutionIds: ['seated-leg-curl', 'lying-leg-curl', 'single-leg-seated-leg-curl'] })])
      expect(plan.exercise.id).toBe('seated-leg-curl')
      expect(plan.prescriptions[0]?.note).toMatch(/^On Seated leg curl since Nordic hamstring negatives backed off/)
    })

    it('removing the leg curl puts the slot back on Nordics, whose back-off is served again on the edited list’s first substitution', () => {
      const plan = onCurl([edit({ slotId: 'p3a-2', substitutionIds: ['seated-leg-curl', 'lying-leg-curl'] })])
      expect(plan.exercise.id).toBe('nordic-negatives')
      expect(plan.prescriptions[0]).toMatchObject({ exerciseId: 'seated-leg-curl', basis: 'back-off' })
    })
  })

  it('with every substitution removed, it backs off where nothing is written (one set fewer), as snap-downs do', () => {
    const edited = nordics([edit({ slotId: 'p3a-2', substitutionIds: [] })]).prescriptions[0]
    expect(edited).toMatchObject({ exerciseId: 'nordic-negatives', basis: 'back-off' })
    expect(edited?.sets).toBe((template.slots.find((s) => s.id === 'p3a-2')?.sets ?? 0) - 1)
  })
})
