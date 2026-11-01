import { describe, expect, it } from 'vitest'
import type { SlotPlan } from '../app/session.ts'
import type { History } from '../db/repo.ts'
import type { Prescription } from '../rules/prescription.ts'
import type { Exercise, MorningCheck, Run, Settings, Slot, Workout } from '../schema/index.ts'
import {
  appliesTo,
  buildCheck,
  checkId,
  dateWords,
  emptyForm,
  errorWords,
  exerciseSentences,
  formFromCheck,
  nextWeekFor,
  runWords,
  sessionName,
  settingsAfter,
  sideWords,
  subjectFor,
  subjectWords,
  toggleFlag,
  withCheck,
} from './MorningCheck.helpers.ts'

const templates = [
  { id: 'p1-a', letter: 'A' as const },
  { id: 'p1-b', letter: 'B' as const },
  { id: 'p1-c', letter: 'C' as const },
]

const workout = (id: string, over: Partial<Workout> = {}): Workout => ({
  id, date: '2026-11-03', templateId: 'p1-a', phase: 1, week: 1, isDeload: false, startedAt: '2026-11-03T22:00:00.000Z', status: 'finished', ...over,
})
const run = (id: string, over: Partial<Run> = {}): Run => ({
  id, date: '2026-11-03', type: 'mbr', miles: 3, minutes: 30, effort: 'easy', maxPain: 1, strides: false, tempo: false, ...over,
})
const check = (over: Partial<MorningCheck> = {}): MorningCheck => ({
  id: 'mc-2026-11-04', date: '2026-11-04', appliesTo: null, stiffnessUnder30Min: true, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [], ...over,
})
const settings = (over: Partial<Settings> = {}): Settings => ({
  injuredSide: 'right', startDate: '2026-11-02', dumbbellMax: 80, restTimerSeconds: 60, painPerSet: false, currentPhase: 1, phaseEnteredWeek: 1, redFlag: { active: false, items: [] }, ...over,
})
const catalog = [
  { id: 'swelling-48h', text: 'Swelling that is not gone in 48 hours' },
  { id: 'giving-way', text: 'The knee giving way' },
  { id: 'locking', text: 'Locking or catching' },
]

describe('dateWords', () => {
  it('says the weekday, month and day with no clock involved', () => {
    expect(dateWords('2026-11-03')).toBe('Tuesday Nov 3')
    expect(dateWords('2026-11-02')).toBe('Monday Nov 2')
    expect(dateWords('2027-01-24')).toBe('Sunday Jan 24')
  })
})

describe('subjectFor', () => {
  it('is null when nothing is dated that day', () => {
    expect(subjectFor([workout('w1', { date: '2026-11-02' })], [run('r1', { date: '2026-11-02' })], '2026-11-03')).toBeNull()
  })
  it('takes the latest-started workout of the day and skips planned ones', () => {
    const early = workout('early', { startedAt: '2026-11-03T12:00:00.000Z' })
    const late = workout('late', { startedAt: '2026-11-03T20:00:00.000Z', status: 'abandoned' })
    const planned = workout('planned', { startedAt: '2026-11-03T23:00:00.000Z', status: 'planned' })
    expect(subjectFor([early, planned, late], [], '2026-11-03')).toEqual({ kind: 'workout', workout: late })
    expect(subjectFor([planned], [], '2026-11-03')).toBeNull()
  })
  it('prefers a workout over a run on a stacked day, and takes the last run otherwise', () => {
    expect(subjectFor([workout('w1')], [run('r1')], '2026-11-03')).toEqual({ kind: 'workout', workout: workout('w1') })
    expect(subjectFor([], [run('r1'), run('r2', { type: 'easy' })], '2026-11-03')).toEqual({ kind: 'run', run: run('r2', { type: 'easy' }) })
  })
  it('still finds a workout that carries no instants', () => {
    const bare = workout('bare', { startedAt: undefined })
    expect(subjectFor([bare], [], '2026-11-03')?.kind).toBe('workout')
  })
})

describe('appliesTo and words', () => {
  it('links the check to the subject by kind and id', () => {
    expect(appliesTo(null)).toBeNull()
    expect(appliesTo({ kind: 'workout', workout: workout('w1') })).toEqual({ kind: 'workout', id: 'w1' })
    expect(appliesTo({ kind: 'run', run: run('r1') })).toEqual({ kind: 'run', id: 'r1' })
  })
  it('names a session by its template letter, falling back to the id', () => {
    expect(sessionName('p1-b', templates)).toBe('Session B')
    expect(sessionName('p9-z', templates)).toBe('p9-z')
  })
  it('names runs in words', () => {
    expect(runWords('mbr')).toBe('MBR run')
    expect(runWords('elliptical-swap')).toBe('elliptical swap')
  })
  it('says in words which session the check is for', () => {
    expect(subjectWords(null, '2026-11-03', templates)).toBe('No session was logged for yesterday, Tuesday Nov 3. This check stands on its own.')
    expect(subjectWords({ kind: 'workout', workout: workout('w1') }, '2026-11-03', templates)).toBe("For yesterday's Session A, Tuesday Nov 3.")
    expect(subjectWords({ kind: 'workout', workout: workout('w1', { status: 'abandoned' }) }, '2026-11-03', templates)).toBe("For yesterday's Session A (stopped early), Tuesday Nov 3.")
    expect(subjectWords({ kind: 'workout', workout: workout('w1', { status: 'in-progress' }) }, '2026-11-03', templates)).toBe("For yesterday's Session A (never finished), Tuesday Nov 3.")
    expect(subjectWords({ kind: 'run', run: run('r1', { type: 'long', date: '2026-11-06' }) }, '2026-11-06', templates)).toBe("For yesterday's long run, Friday Nov 6.")
  })
})

describe('the form', () => {
  it('starts with everything off, so an untouched save cannot read clean', () => {
    expect(emptyForm()).toEqual({ stiffnessUnder30Min: false, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [], notes: '' })
  })
  it('prefills from a saved check', () => {
    const saved = check({ worseThanYesterday: true, painChangePoints: -1, redFlags: ['locking'], notes: 'tight' })
    expect(formFromCheck(saved)).toEqual({ stiffnessUnder30Min: true, worseThanYesterday: true, visibleSwelling: false, warmth: false, painChangePoints: -1, redFlags: ['locking'], notes: 'tight' })
    expect(formFromCheck(check()).notes).toBe('')
  })
  it('toggles a flag on and off without touching the others', () => {
    expect(toggleFlag([], 'locking')).toEqual(['locking'])
    expect(toggleFlag(['locking', 'numbness'], 'locking')).toEqual(['numbness'])
  })
})

describe('buildCheck', () => {
  it('keys the check on the date, links the subject, orders flags as the program lists them, drops a blank note', () => {
    const form = { ...emptyForm(), stiffnessUnder30Min: true, painChangePoints: 2, redFlags: ['locking', 'swelling-48h'], notes: '   ' }
    const built = buildCheck({ today: '2026-11-04', subject: { kind: 'workout', workout: workout('w1') }, form, catalog })
    expect(built).toEqual({
      id: 'mc-2026-11-04',
      date: '2026-11-04',
      appliesTo: { kind: 'workout', id: 'w1' },
      stiffnessUnder30Min: true,
      worseThanYesterday: false,
      visibleSwelling: false,
      warmth: false,
      painChangePoints: 2,
      redFlags: ['swelling-48h', 'locking'],
    })
    expect(checkId('2026-11-04')).toBe('mc-2026-11-04')
  })
  it('keeps a trimmed note and a null subject', () => {
    const built = buildCheck({ today: '2026-11-04', subject: null, form: { ...emptyForm(), notes: '  stairs fine  ' }, catalog })
    expect(built.appliesTo).toBeNull()
    expect(built.notes).toBe('stairs fine')
  })
  it('ignores a ticked id that is not in the catalog', () => {
    expect(buildCheck({ today: '2026-11-04', subject: null, form: { ...emptyForm(), redFlags: ['made-up'] }, catalog }).redFlags).toEqual([])
  })
})

describe('settingsAfter and withCheck', () => {
  it('leaves settings untouched (same object) when nothing is flagged', () => {
    const s = settings()
    expect(settingsAfter(s, check())).toBe(s)
  })
  it('turns the red-flag state on when a flag is ticked (rule 9)', () => {
    expect(settingsAfter(settings(), check({ redFlags: ['locking'] })).redFlag).toEqual({ active: true, since: '2026-11-04', items: ['locking'] })
  })
  it('adds the check to the history, replacing a same-id save', () => {
    const history: History = { workouts: [], setLogs: [], morningChecks: [check({ painChangePoints: 5 })], runs: [], gateTests: [], sessionMoves: [] }
    const amended = check({ painChangePoints: 1 })
    const next = withCheck(history, amended)
    expect(next.morningChecks).toEqual([amended])
    expect(history.morningChecks[0]?.painChangePoints).toBe(5)
    expect(withCheck(history, check({ id: 'mc-2026-11-05', date: '2026-11-05' })).morningChecks).toHaveLength(2)
  })
})

describe('next time', () => {
  const exercise = (over: Partial<Exercise> = {}): Exercise => ({
    id: 'leg-press', name: 'Leg press', pattern: 'squat', equipment: 'seated leg press', loadType: 'stack', loadUnit: 'plate', increment: 1, loadDirection: 'up', unilateral: false, ...over,
  })
  const slot = (over: Partial<Slot> = {}): Slot => ({
    id: 'p1a-1', order: 1, label: '1', exerciseId: 'leg-press', sets: 3, repsMin: 10, repsMax: 12, repUnit: 'reps', unilateral: false, injuredOnly: false,
    prescriptionText: '3 × 10–12', cues: [], progressionRule: 'double-progression', substitutionIds: [], optional: false, ...over,
  })
  const prescription = (over: Partial<Prescription> = {}): Prescription => ({
    exerciseId: 'leg-press', side: 'both', sets: 3, load: 8, loadUnit: 'plate', repsTarget: 10, repUnit: 'reps', basis: 'same', note: 'Clean once: same load, same target; clean again to progress.', ...over,
  })
  const plan = (over: Partial<SlotPlan> = {}): SlotPlan => ({ slot: slot(), exercise: exercise(), substitutions: [], prescriptions: [prescription()], ...over })

  it('the next time a session comes round is next week', () => {
    expect(nextWeekFor({ week: 1 })).toBe(2)
    expect(nextWeekFor({ week: 3 })).toBe(4)
  })
  it('one sentence per exercise, from the prescription note', () => {
    expect(exerciseSentences([plan()], 'right')).toEqual([{ slotId: 'p1a-1', name: 'Leg press', optional: false, lines: ['Clean once: same load, same target; clean again to progress.'] }])
  })
  it('one line per side when the sides get different notes, injured side first', () => {
    const uni = plan({
      slot: slot({ id: 'p2b-1', exerciseId: 'bulgarian-split-squat', unilateral: true }),
      exercise: exercise({ id: 'bulgarian-split-squat', name: 'Bulgarian split squat', unilateral: true }),
      prescriptions: [prescription({ side: 'right', note: 'Hold: repeat the last session’s loads and reps exactly.' }), prescription({ side: 'left', note: 'Clean twice: same load, every set to 12 reps.' })],
    })
    expect(exerciseSentences([uni], 'right')[0]?.lines).toEqual(['Right (injured): Hold: repeat the last session’s loads and reps exactly.', 'Left: Clean twice: same load, every set to 12 reps.'])
  })
  it('collapses identical side notes to one sentence and marks optional slots', () => {
    const same = plan({ slot: slot({ optional: true, unilateral: true }), prescriptions: [prescription({ side: 'right' }), prescription({ side: 'left' })] })
    expect(exerciseSentences([same], 'right')[0]).toMatchObject({ optional: true, lines: ['Clean once: same load, same target; clean again to progress.'] })
    expect(exerciseSentences([plan({ prescriptions: [] })], 'right')[0]?.lines).toEqual(['Nothing is written for this slot.'])
  })
  it('names sides in words with the injured one marked', () => {
    expect(sideWords('right', 'right')).toBe('Right (injured)')
    expect(sideWords('left', 'right')).toBe('Left')
    expect(sideWords('both', 'right')).toBe('Both')
  })
})

describe('errorWords', () => {
  it('turns a rejected write into words', () => {
    expect(errorWords(new Error('QuotaExceededError: storage is full'))).toBe('QuotaExceededError: storage is full')
    expect(errorWords('nope')).toBe('nope')
    expect(errorWords(new Error('  '))).toBe('no reason was given')
  })
})
