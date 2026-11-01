import { describe, expect, it } from 'vitest'
import type { Run, Workout } from '../schema/index.ts'
import { attachChecks, exerciseReadings } from './history.ts'
import { checkLink } from './morningLink.ts'

const workout = (id: string, over: Partial<Workout> = {}): Workout => ({ id, date: '2026-11-03', templateId: 'p1-a', phase: 1, week: 1, isDeload: false, status: 'finished', ...over })
const run = (id: string): Run => ({ id, date: '2026-11-03', type: 'easy', miles: 3, minutes: 30, effort: 'easy', maxPain: 1, strides: false, tempo: false })

describe('checkLink', () => {
  it('links the one session of the day', () => {
    expect(checkLink([workout('w1')], [], '2026-11-03')).toEqual({ kind: 'workout', id: 'w1' })
    expect(checkLink([], [run('r1')], '2026-11-03')).toEqual({ kind: 'run', id: 'r1' })
  })
  it('leaves the link off when more than one session happened, so every one gets the check', () => {
    expect(checkLink([workout('w1', { status: 'abandoned' }), workout('w2')], [], '2026-11-03')).toBeNull()
    expect(checkLink([workout('w1')], [run('r1')], '2026-11-03')).toBeNull()
  })
  it('ignores planned workouts and other days', () => {
    expect(checkLink([workout('w1', { status: 'planned' }), workout('w2', { date: '2026-11-02' })], [run('r1')], '2026-11-03')).toEqual({ kind: 'run', id: 'r1' })
    expect(checkLink([], [], '2026-11-03')).toBeNull()
  })
  it('with no link, both attempts of the day read from the next morning’s check', () => {
    const a = workout('w1', { status: 'abandoned' })
    const b = workout('w2')
    const set = (workoutId: string) => ({ id: `${workoutId}-1`, workoutId, slotId: 'x', exerciseId: 'leg-press', setNumber: 1, side: 'both' as const, load: 8, loadUnit: 'plate' as const, reps: 10, painDuring: 1, stopped: false })
    const check = { id: 'm', date: '2026-11-04', appliesTo: checkLink([a, b], [], '2026-11-03'), stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [] }
    const readings = exerciseReadings(attachChecks([a, b], [set('w1'), set('w2')], [check]), 'leg-press')
    expect(readings.map((r) => r.reading.result)).toEqual(['clean', 'clean'])
  })
})
