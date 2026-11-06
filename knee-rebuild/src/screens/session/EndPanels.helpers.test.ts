import { describe, expect, it } from 'vitest'
import { lateStartedAt } from '../../rules/retro.ts'
import { minutesNote, minutesOpening, needsEffortOrMinutes, SESSION_RPE_ANCHORS, sessionEffortLine, sessionRpeNote } from './EndPanels.helpers.ts'

const sets = [
  { reps: 10, repUnit: 'reps' as const, loggedAt: '2026-11-10T10:10:00.000Z', rpe: 7 },
  { reps: 10, repUnit: 'reps' as const, loggedAt: '2026-11-10T10:13:00.000Z', rpe: 8 },
]

describe('the minutes Finish, End and the Summary open on, and the line under them', () => {
  it('a live session opens on the clock and says how it was read', () => {
    const preset = minutesOpening({ workout: { date: '2026-11-10', startedAt: '2026-11-10T10:00:00.000Z' }, sets, restSeconds: 60, warmUpMinutes: 10 })
    expect(preset).toEqual({ minutes: 14, source: 'clock' })
    expect(minutesNote(preset, false)).toBe('14 min by the clock: from Start to the last set and one rest, with long waits left out. Change it if that’s off.')
  })
  it('a late entry opens on an estimate, labelled one', () => {
    const preset = minutesOpening({ workout: { date: '2026-11-10', startedAt: lateStartedAt('2026-11-10') }, sets, restSeconds: 60, warmUpMinutes: 10 })
    expect(preset).toEqual({ minutes: 14, source: 'estimate' })
    expect(minutesNote(preset, true)).toBe('An estimate: entered after the day, so the clock can’t say. It counts the sets logged, a rest after each and the warm-up; set it to what the session took.')
  })
  it('a clock that can’t be this session is said so, and the estimate stands in', () => {
    expect(minutesNote({ minutes: 9, source: 'estimate' }, false)).toBe('An estimate: the clock reads under a minute or over 3 hours, which can’t be this session. It counts the sets logged, a rest after each and the warm-up; set it to what the session took.')
  })
})

describe('the session RPE picker’s line', () => {
  it('says the scale in words: the whole session, not a set’s reps in reserve', () => {
    expect(SESSION_RPE_ANCHORS).toBe('1–3 easy, 4–6 moderate, 7–10 hard, for the whole session (a set’s RPE is reps in reserve).')
  })
  it('unrated, says what training load reads instead: the sets’ average, or nothing', () => {
    expect(sessionRpeNote(null, sets)).toBe('Not rated: training load reads the sets’ average, RPE 8, until you rate it.')
    expect(sessionRpeNote(null, [{}])).toBe('Not rated, and no set has an RPE: this session’s training load stays unknown until it is rated, here or from its summary.')
    expect(sessionRpeNote(6, sets)).toBe('Rated 6 for the whole session.')
  })
})

describe('the Summary’s effort line', () => {
  it('says the RPE and where it came from, the minutes, and the training load or that it isn’t counted', () => {
    expect(sessionEffortLine({ sessionRpe: 7, durationMinutes: 48 }, sets)).toBe('Session RPE 7 · 48 min · training load 336.')
    expect(sessionEffortLine({ durationMinutes: 48 }, sets)).toBe('RPE 8, the sets’ average · 48 min · training load 384.')
    expect(sessionEffortLine({ sessionRpe: 7 }, sets)).toBe('Session RPE 7 · no minutes · training load not counted.')
    expect(sessionEffortLine({ durationMinutes: 200 }, [{}])).toBe('No RPE · 200 min · training load not counted.')
    expect(sessionEffortLine({ sessionRpe: 9, durationMinutes: 200 }, [])).toBe('Session RPE 9 · 200 min · training load 1,800.')
  })
  it('offers Add effort and minutes while either is not stored', () => {
    expect(needsEffortOrMinutes({ sessionRpe: 7, durationMinutes: 48 })).toBe(false)
    expect(needsEffortOrMinutes({ durationMinutes: 48 })).toBe(true)
    expect(needsEffortOrMinutes({ sessionRpe: 7 })).toBe(true)
  })
})
