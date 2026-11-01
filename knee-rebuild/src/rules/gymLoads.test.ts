import { describe, expect, it } from 'vitest'
import type { Exercise, MorningCheck, SetLog, Slot, Workout } from '../schema/index.ts'
import { baselineRecords, cappedExerciseReadings, capReading, exerciseHistory, isRackCapped, withoutRackCapped } from './gymLoads.ts'
import { attachChecks, exerciseReadings, lastSetsBySide, lastSetsFor } from './history.ts'
import { prescribe } from './prescription.ts'

const workout = (id: string, date: string, over: Partial<Workout> = {}): Workout => ({ id, date, templateId: 'p1-a', phase: 1, week: 2, isDeload: false, status: 'finished', ...over })
const set = (workoutId: string, exerciseId: string, setNumber: number, over: Partial<SetLog> = {}): SetLog => ({
  id: `${workoutId}-${exerciseId}-${over.side ?? 'both'}-${setNumber}`, workoutId, slotId: 'p1a-3', exerciseId, setNumber, side: 'both', load: 60, loadUnit: 'lb', reps: 10, rpe: 7, painDuring: 2, stopped: false, ...over,
})
const three = (workoutId: string, exerciseId: string, over: Partial<SetLog> = {}) => [1, 2, 3].map((n) => set(workoutId, exerciseId, n, over))
const check = (date: string, over: Partial<MorningCheck> = {}): MorningCheck => ({ id: `m-${date}`, date, appliesTo: null, stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [], ...over })
const ids = (sets: readonly SetLog[]) => sets.map((s) => s.id).sort()

// Two clean RDL sessions at 60 lb at home, then a hotel with a 25 lb rack and nothing to swap to.
const home1 = workout('w1', '2026-11-02')
const home2 = workout('w2', '2026-11-05')
const hotel = workout('w3', '2026-11-09', { locationId: 'hotel' })
const homeSets = [...three('w1', 'db-rdl'), ...three('w2', 'db-rdl')]
const hotelRdl = three('w3', 'db-rdl', { load: 25, rackCapped: true })
const hotelSplit = three('w3', 'split-squat', { load: 20 })
const checks = [check('2026-11-03'), check('2026-11-06'), check('2026-11-10')]
const records = attachChecks([home1, home2, hotel], [...homeSets, ...hotelRdl, ...hotelSplit], checks)

describe('isRackCapped and withoutRackCapped', () => {
  it('a set is capped only when it says so', () => {
    expect(isRackCapped(set('w1', 'db-rdl', 1))).toBe(false)
    expect(isRackCapped(set('w1', 'db-rdl', 1, { rackCapped: false }))).toBe(false)
    expect(isRackCapped(set('w1', 'db-rdl', 1, { rackCapped: true }))).toBe(true)
  })
  it('one capped set drops every set of that exercise in that session, and nothing else', () => {
    const partial = [set('w3', 'db-rdl', 1, { load: 25 }), set('w3', 'db-rdl', 2, { load: 25 }), set('w3', 'db-rdl', 3, { load: 25, rackCapped: true })]
    const got = withoutRackCapped([...three('w2', 'db-rdl'), ...partial, ...hotelSplit])
    expect(ids(got)).toEqual(ids([...three('w2', 'db-rdl'), ...hotelSplit]))
  })
  it('a log with nothing capped comes back whole, in order', () => {
    const sets = [...homeSets, ...hotelSplit, set('w3', 'db-rdl', 1, { rackCapped: false })]
    expect(withoutRackCapped(sets)).toEqual(sets)
  })
})

describe('a capped session is skipped as the baseline', () => {
  it('the last sets fall back to the last uncapped session of the exercise', () => {
    expect(ids(lastSetsBySide(records, 'db-rdl'))).toEqual(ids(hotelRdl))
    expect(ids(exerciseHistory(records, 'db-rdl').lastSets)).toEqual(ids(three('w2', 'db-rdl')))
    expect(ids(lastSetsFor(baselineRecords(records), 'db-rdl'))).toEqual(ids(three('w2', 'db-rdl')))
  })
  it('the uncapped exercise in the same session is still its own baseline', () => {
    expect(ids(exerciseHistory(records, 'split-squat').lastSets)).toEqual(ids(hotelSplit))
  })
  it('a capped injured side drops both sides of that session; each falls back to its last uncapped sets', () => {
    const side = (workoutId: string, s: 'left' | 'right', over: Partial<SetLog> = {}) => three(workoutId, 'single-leg-rdl', { side: s, load: 30, ...over })
    const sided = attachChecks(
      [home2, hotel],
      [...side('w2', 'right'), ...side('w2', 'left'), ...side('w3', 'right', { load: 25, rackCapped: true }), ...side('w3', 'left', { load: 25 })],
      checks,
    )
    expect(ids(exerciseHistory(sided, 'single-leg-rdl', 'right').lastSets)).toEqual(ids([...side('w2', 'right'), ...side('w2', 'left')]))
  })
  it('with every session capped there is no baseline: the next one is a first time', () => {
    const capped = attachChecks([hotel], hotelRdl, checks)
    expect(exerciseHistory(capped, 'db-rdl').lastSets).toEqual([])
  })
  it('the gym itself changes nothing: an uncapped hotel session at 25 lb is the baseline, pounds are pounds', () => {
    const uncapped = attachChecks([home1, home2, hotel], [...homeSets, ...three('w3', 'db-rdl', { load: 25 })], checks)
    expect(ids(exerciseHistory(uncapped, 'db-rdl').lastSets)).toEqual(ids(three('w3', 'db-rdl')))
  })
})

describe('a capped clean reads hold', () => {
  it('capReading turns clean into hold with the reason, and leaves hold and back-off alone', () => {
    const clean = { result: 'clean' as const, reasons: ['pain stayed at 2 or under and did not climb'] }
    const capped = capReading(clean, hotelRdl)
    expect(capped.result).toBe('hold')
    expect(capped.reasons).toEqual([...clean.reasons, 'the rack stopped the load at 25 lb; a rack-capped session is not counted as clean'])
    const hold = { result: 'hold' as const, reasons: ['pain reached 4'] }
    const backOff = { result: 'back-off' as const, reasons: ['pain reached 6'] }
    expect(capReading(hold, hotelRdl)).toBe(hold)
    expect(capReading(backOff, hotelRdl)).toBe(backOff)
    expect(capReading(clean, three('w2', 'db-rdl'))).toBe(clean)
  })
  it('the capped session reads hold for its exercise, most recent first, and the home sessions keep their cleans', () => {
    expect(exerciseReadings(records, 'db-rdl').map((r) => r.reading.result)).toEqual(['clean', 'clean', 'clean'])
    const got = cappedExerciseReadings(records, 'db-rdl')
    expect(got.map((r) => [r.date, r.reading.result])).toEqual([['2026-11-09', 'hold'], ['2026-11-05', 'clean'], ['2026-11-02', 'clean']])
    expect(exerciseHistory(records, 'db-rdl').readings).toEqual(['hold', 'clean', 'clean'])
  })
  it('only the capped exercise is capped: the split squat beside it still reads clean', () => {
    expect(exerciseHistory(records, 'split-squat').readings).toEqual(['clean'])
  })
  it('a capped session that hurt still reads back-off', () => {
    const hurt = attachChecks([hotel], three('w3', 'db-rdl', { load: 25, rackCapped: true, painDuring: 6 }), checks)
    expect(exerciseHistory(hurt, 'db-rdl').readings).toEqual(['back-off'])
  })
  it('a capped session that is still in progress reads nothing, as today', () => {
    const open = attachChecks([home2, { ...hotel, status: 'in-progress' }], [...three('w2', 'db-rdl'), ...hotelRdl], checks)
    expect(exerciseHistory(open, 'db-rdl')).toEqual({ readings: ['clean'], lastSets: three('w2', 'db-rdl') })
  })
})

describe('without the field, history behaves as today', () => {
  const plain = attachChecks([home1, home2, hotel], [...homeSets, ...three('w3', 'db-rdl', { load: 25 }), ...hotelSplit], checks)
  it('readings and last sets match history.ts exactly', () => {
    for (const exerciseId of ['db-rdl', 'split-squat', 'leg-press']) {
      expect(cappedExerciseReadings(plain, exerciseId, 'right')).toEqual(exerciseReadings(plain, exerciseId, 'right'))
      expect(exerciseHistory(plain, exerciseId, 'right')).toEqual({
        readings: exerciseReadings(plain, exerciseId, 'right').map((r) => r.reading.result),
        lastSets: lastSetsBySide(plain, exerciseId),
      })
    }
  })
  it('a missing morning check still reads hold, capped or not', () => {
    const noCheck = attachChecks([home2], three('w2', 'db-rdl'), [])
    expect(exerciseHistory(noCheck, 'db-rdl').readings).toEqual(['hold'])
  })
})

describe('feeding prescribe', () => {
  const rdl: Exercise = { id: 'db-rdl', name: 'Dumbbell RDL', pattern: 'hinge', equipment: 'dumbbells', loadType: 'dumbbell-each', loadUnit: 'lb', increment: 5, loadDirection: 'up', unilateral: false, requires: [] }
  const slot: Slot = {
    id: 'p1a-3', order: 3, label: '3', exerciseId: 'db-rdl', sets: 3, repsMin: 8, repsMax: 10, repUnit: 'reps', unilateral: false, injuredOnly: false,
    prescriptionText: '3 × 8–10', cues: [], progressionRule: 'double-progression', substitutionIds: [], optional: false,
  }
  const next = (history: { readings: ('clean' | 'hold' | 'back-off')[]; lastSets: SetLog[] }) =>
    prescribe({ slot, exercise: rdl, substitutions: [], ...history, week: 3, injuredSide: 'right', dumbbellMax: 80, redFlagActive: false })[0]
  it('back home after a capped clean at the hotel: repeat 60 lb, neither 25 lb nor a step up', () => {
    expect(next(exerciseHistory(records, 'db-rdl'))).toMatchObject({ load: 60, basis: 'repeat' })
  })
  it('without the cap the hotel session would have been the baseline, and clean enough to progress from', () => {
    const raw = { readings: exerciseReadings(records, 'db-rdl').map((r) => r.reading.result), lastSets: lastSetsBySide(records, 'db-rdl') }
    expect(next(raw)).toMatchObject({ load: 30, basis: 'progress-load' })
  })
})
