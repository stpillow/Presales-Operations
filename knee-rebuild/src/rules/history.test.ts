import { describe, expect, it } from 'vitest'
import type { MorningCheck, Run, SetLog, Workout } from '../schema/index.ts'
import { attachChecks, exerciseReadings, lastSetsBySide, lastSetsFor, recordsBefore, runReading, subjectReadings, workoutReading } from './history.ts'

const workout = (id: string, date: string, status: Workout['status'] = 'finished'): Workout => ({ id, date, templateId: 'p1-a', phase: 1, week: 1, isDeload: false, status })
const set = (workoutId: string, exerciseId: string, setNumber: number, painDuring: number, reps = 12): SetLog => ({ id: `${workoutId}-${exerciseId}-${setNumber}`, workoutId, slotId: 'x', exerciseId, setNumber, side: 'both', load: 8, loadUnit: 'plate', reps, painDuring, stopped: false })
const check = (date: string, over: Partial<MorningCheck> = {}): MorningCheck => ({ id: `m-${date}`, date, appliesTo: null, stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [], ...over })

describe('attachChecks', () => {
  it('links the next morning’s check to the workout, preferring an explicit link', () => {
    const w1 = workout('w1', '2026-11-03')
    const w2 = workout('w2', '2026-11-05')
    const linked = check('2026-11-06', { appliesTo: { kind: 'workout', id: 'w2' } })
    const records = attachChecks([w2, w1], [], [check('2026-11-04'), linked])
    expect(records.map((r) => r.workout.id)).toEqual(['w1', 'w2'])
    expect(records[0]?.morningCheck?.date).toBe('2026-11-04')
    expect(records[1]?.morningCheck).toBe(linked)
  })
})

describe('exerciseReadings and lastSetsFor', () => {
  const w1 = workout('w1', '2026-11-03')
  const w2 = workout('w2', '2026-11-10')
  const w3 = workout('w3', '2026-11-17', 'in-progress')
  const sets = [set('w1', 'leg-press', 1, 2), set('w1', 'leg-press', 2, 2), set('w2', 'leg-press', 1, 4), set('w2', 'leg-press', 2, 4), set('w3', 'leg-press', 1, 1)]
  const records = attachChecks([w1, w2, w3], sets, [check('2026-11-04'), check('2026-11-11')])
  it('lists combined readings most recent first, sessions that happened only', () => {
    expect(exerciseReadings(records, 'leg-press').map((r) => r.reading.result)).toEqual(['hold', 'clean'])
  })
  it('an abandoned session still counts: its sets and its stop feed the next prescription', () => {
    const w4 = workout('w4', '2026-11-24', 'abandoned')
    const stopped: SetLog = { ...set('w4', 'leg-press', 1, 6), stopped: true, stopReason: 'sharp-joint-line-pain' }
    const withAbandoned = attachChecks([w1, w2, w4], [...sets, stopped], [check('2026-11-04'), check('2026-11-11'), check('2026-11-25')])
    expect(exerciseReadings(withAbandoned, 'leg-press')[0]?.reading.result).toBe('back-off')
    expect(lastSetsFor(withAbandoned, 'leg-press').map((s) => s.id)).toEqual(['w4-leg-press-1'])
  })
  it('reads hold when the morning check is missing', () => {
    const noChecks = attachChecks([w1], sets, [])
    expect(exerciseReadings(noChecks, 'leg-press')[0]?.reading.result).toBe('hold')
  })
  it('takes the last finished workout’s sets', () => {
    expect(lastSetsFor(records, 'leg-press').map((s) => s.id)).toEqual(['w2-leg-press-1', 'w2-leg-press-2'])
    expect(lastSetsFor(records, 'db-rdl')).toEqual([])
  })
})

describe('workoutReading and runReading', () => {
  it('a workout reads as its worst exercise; nothing logged reads hold', () => {
    const w = workout('w1', '2026-11-03')
    const record = attachChecks([w], [set('w1', 'leg-press', 1, 2), set('w1', 'db-rdl', 1, 5)], [check('2026-11-04')])[0]
    expect(record && workoutReading(record).result).toBe('hold')
    expect(workoutReading({ workout: w, sets: [], morningCheck: check('2026-11-04') }).result).toBe('hold')
  })
  it('a run reads from its max pain and its morning check', () => {
    const run = (maxPain: number): Run => ({ id: 'r1', date: '2026-11-02', type: 'mbr', miles: 3, minutes: 30, effort: 'easy', maxPain, strides: false, tempo: false })
    expect(runReading(run(1), [check('2026-11-03')]).result).toBe('clean')
    expect(runReading(run(4), [check('2026-11-03')]).result).toBe('hold')
    expect(runReading(run(6), [check('2026-11-03')]).result).toBe('back-off')
    expect(runReading(run(1), []).result).toBe('hold')
    expect(runReading(run(1), [check('2026-11-03', { visibleSwelling: true })]).result).toBe('back-off')
  })
  it('subjectReadings dates every finished workout and run', () => {
    const w = workout('w1', '2026-11-03')
    const run: Run = { id: 'r1', date: '2026-11-02', type: 'mbr', miles: 3, minutes: 30, effort: 'easy', maxPain: 1, strides: false, tempo: false }
    const out = subjectReadings(attachChecks([w], [set('w1', 'leg-press', 1, 2)], [check('2026-11-03'), check('2026-11-04')]), [run], [check('2026-11-03'), check('2026-11-04')])
    expect(out).toEqual([
      { kind: 'run', id: 'r1', date: '2026-11-02', result: 'clean' },
      { kind: 'workout', id: 'w1', date: '2026-11-03', result: 'clean' },
    ])
  })
})

describe('a rack-capped workout in subjectReadings', () => {
  it('is marked when any of its sets was rack-capped, and reads the knee as before', () => {
    const capped = workout('w1', '2026-11-03')
    const plain = workout('w2', '2026-11-05')
    const sets = [set('w1', 'leg-press', 1, 2), { ...set('w1', 'db-rdl', 1, 2), rackCapped: true }, set('w2', 'leg-press', 1, 2), { ...set('w2', 'db-rdl', 1, 2), rackCapped: false }]
    const checks = [check('2026-11-04'), check('2026-11-06')]
    expect(subjectReadings(attachChecks([capped, plain], sets, checks), [], checks)).toEqual([
      { kind: 'workout', id: 'w1', date: '2026-11-03', result: 'clean', rackCapped: true },
      { kind: 'workout', id: 'w2', date: '2026-11-05', result: 'clean' },
    ])
  })
})

describe('recordsBefore and lastSetsBySide', () => {
  const side = (workoutId: string, s: SetLog['side'], n: number, reps: number): SetLog => ({ id: `${workoutId}-${s}-${n}`, workoutId, slotId: 'x', exerciseId: 'cable-hip-abduction', setNumber: n, side: s, load: 4, loadUnit: 'plate', reps, painDuring: 1, stopped: false })
  const w1 = workout('w1', '2026-11-07')
  const w2 = workout('w2', '2026-11-14', 'abandoned')
  const records = attachChecks([w1, w2], [side('w1', 'right', 1, 12), side('w1', 'left', 1, 12), { ...side('w2', 'right', 1, 4), stopped: true, stopReason: 'sharp-joint-line-pain' }], [])
  it('a side missing from the latest session falls back to its own last sets', () => {
    const got = lastSetsBySide(records, 'cable-hip-abduction')
    expect(got.map((s) => s.id).sort()).toEqual(['w1-left-1', 'w2-right-1'])
  })
  it('keeps only sessions dated before the day being planned', () => {
    expect(recordsBefore(records, '2026-11-14').map((r) => r.workout.id)).toEqual(['w1'])
    expect(recordsBefore(records, '2026-11-15').map((r) => r.workout.id)).toEqual(['w1', 'w2'])
  })
})
