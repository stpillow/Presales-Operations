import { describe, expect, it } from 'vitest'
import type { MorningCheck, Run, SessionTemplate, SetLog, Settings, Workout } from '../schema/index.ts'
import {
  dateWords,
  newWorkoutId,
  openWorkouts,
  phaseName,
  runLabel,
  sessionLabel,
  sessionLetter,
  sessionNote,
  shortDateWords,
  todayView,
  todaysWorkout,
  workoutLabel,
  yesterdayReadings,
  type HistoryLike,
  type ProgramLike,
} from './Today.helpers.ts'

const START = '2026-11-02'

const template = (id: string, phase: number, letter: 'A' | 'B' | 'C'): SessionTemplate => ({ id, phase, letter, slots: [] })

/** Inline fixtures, not the live seed: these tests pin the screen's wiring, not the program's content. */
const PROGRAM: ProgramLike = {
  phases: [
    { number: 1, name: 'Foundation', weekStart: 1, weekEnd: 3, estimatedDates: 'Nov 2–22', summary: 'Base', notes: [], gateToLeave: 1 },
    { number: 2, name: 'Single-leg strength and balance', weekStart: 4, weekEnd: 7, estimatedDates: 'Nov 23–Dec 20', summary: 'Single leg', notes: [], gateToLeave: 2 },
    { number: 3, name: 'Power', weekStart: 8, weekEnd: 12, estimatedDates: 'Dec 21–Jan 24', summary: 'Power', notes: [], gateToLeave: 3 },
    { number: 4, name: 'Lacrosse', weekStart: 13, weekEnd: null, estimatedDates: 'Jan 25 on', summary: 'Sport', notes: [], gateToLeave: null },
  ],
  weeklyTemplate: { mon: 'run:mbr', tue: 'lift:A', wed: 'run:easy', thu: 'lift:B', fri: 'run:long', sat: 'lift:C', sun: 'off' },
  weeklyTemplateRows: [
    { day: 'Mon', session: 'Run: MBR', notes: 'Easy and conversational' },
    { day: 'Tue', session: 'Lift A', notes: '' },
    { day: 'Wed', session: 'Run: easy', notes: 'Flattest route you have' },
    { day: 'Thu', session: 'Lift B', notes: '' },
    { day: 'Fri', session: 'Run: long', notes: 'The week’s longest run' },
    { day: 'Sat', session: 'Lift C', notes: '' },
    { day: 'Sun', session: 'Off', notes: 'Kona walk and mobility only' },
  ],
  redFlags: [
    { id: 'locking', text: 'Locking or catching: a mechanical block to straightening or bending' },
    { id: 'numbness', text: 'Numbness or tingling below the knee' },
  ],
  templates: [template('p1-a', 1, 'A'), template('p1-b', 1, 'B'), template('p1-c', 1, 'C'), template('p2-a', 2, 'A')],
  mileagePlan: [10, 11, 12, 9, 13, 14, 15, 11, 16, 17, 18, 14].map((targetMiles, i) => ({ week: i + 1, targetMiles, isDown: [4, 8, 12].includes(i + 1) })),
}

const settings = (over: Partial<Settings> = {}): Settings => ({
  injuredSide: 'right',
  startDate: START,
  dumbbellMax: 80,
  restTimerSeconds: 60,
  painPerSet: false,
  currentPhase: 1,
  phaseEnteredWeek: 1,
  redFlag: { active: false, items: [] },
  ...over,
})
const history = (over: Partial<HistoryLike> = {}): HistoryLike => ({ workouts: [], setLogs: [], morningChecks: [], runs: [], sessionMoves: [], ...over })
const workout = (id: string, date: string, status: Workout['status'], templateId = 'p1-a', startedAt?: string): Workout => ({
  id,
  date,
  templateId,
  phase: 1,
  week: 1,
  isDeload: false,
  status,
  ...(startedAt ? { startedAt } : {}),
})
const set = (workoutId: string, setNumber: number, painDuring: number): SetLog => ({
  id: `${workoutId}:leg-press:both:${setNumber}`,
  workoutId,
  slotId: 'p1a-1',
  exerciseId: 'leg-press',
  setNumber,
  side: 'both',
  load: 8,
  loadUnit: 'plate',
  reps: 12,
  painDuring,
  stopped: false,
})
const check = (date: string, over: Partial<MorningCheck> = {}): MorningCheck => ({
  id: `m-${date}`,
  date,
  appliesTo: null,
  stiffnessUnder30Min: true,
  worseThanYesterday: false,
  visibleSwelling: false,
  warmth: false,
  painChangePoints: 0,
  redFlags: [],
  ...over,
})
const run = (id: string, date: string, maxPain: number): Run => ({ id, date, type: 'mbr', miles: 3, minutes: 30, effort: 'easy', maxPain, strides: false, tempo: false })

describe('date words', () => {
  it('spells the weekday, month and day', () => {
    expect(dateWords('2026-11-03')).toBe('Tuesday, November 3')
    expect(dateWords('2027-01-01')).toBe('Friday, January 1')
    expect(dateWords('2026-11-01')).toBe('Sunday, November 1')
  })
  it('has a short form for the start line', () => {
    expect(shortDateWords('2026-11-02')).toBe('Monday Nov 2')
    expect(shortDateWords('2027-01-25')).toBe('Monday Jan 25')
  })
  it('refuses a string that is not a date', () => {
    expect(() => dateWords('yesterday')).toThrow(RangeError)
    expect(() => shortDateWords('2026-13-01')).toThrow(RangeError)
  })
})

describe('session words', () => {
  it('names lifts, runs and the off day the way the brief does', () => {
    expect(sessionLabel('lift:A')).toBe('Session A')
    expect(sessionLabel('lift:C')).toBe('Session C')
    expect(sessionLabel('run:mbr')).toBe('Run: MBR')
    expect(sessionLabel('run:easy')).toBe('Run: easy')
    expect(sessionLabel('run:long')).toBe('Run: long')
    expect(sessionLabel('off', PROGRAM.weeklyTemplateRows)).toBe('Off: Kona walk and mobility only')
    expect(sessionLabel('off')).toBe('Off')
  })
  it('finds the program’s note for a session, and nothing for a lift', () => {
    expect(sessionNote('run:mbr', PROGRAM.weeklyTemplateRows)).toBe('Easy and conversational')
    expect(sessionNote('off', PROGRAM.weeklyTemplateRows)).toBe('Kona walk and mobility only')
    expect(sessionNote('lift:A', PROGRAM.weeklyTemplateRows)).toBeNull()
    expect(sessionNote('run:long', [])).toBeNull()
  })
  it('extracts the letter from lift days only', () => {
    expect(sessionLetter('lift:B')).toBe('B')
    expect(sessionLetter('run:easy')).toBeNull()
    expect(sessionLetter('off')).toBeNull()
  })
  it('labels runs and swaps', () => {
    expect(runLabel('long')).toBe('Run: long')
    expect(runLabel('elliptical-swap')).toBe('Elliptical swap')
    expect(runLabel('rower-swap')).toBe('Rower swap')
  })
  it('labels a stored workout from its template', () => {
    expect(workoutLabel({ templateId: 'p1-b' }, PROGRAM.templates)).toBe('Session B')
    expect(workoutLabel({ templateId: 'gone' }, PROGRAM.templates)).toBe('Session')
  })
  it('names the phase, with a fallback that still says which phase', () => {
    expect(phaseName(PROGRAM.phases, 1)).toBe('Foundation')
    expect(phaseName(PROGRAM.phases, 4)).toBe('Lacrosse')
    expect(phaseName([], 2)).toBe('Phase 2')
  })
})

describe('todaysWorkout', () => {
  it('prefers the open attempt, then the finished one, then an abandoned one', () => {
    const abandoned = workout('w1', '2026-11-03', 'abandoned', 'p1-a', '2026-11-03T08:00:00Z')
    const open = workout('w2', '2026-11-03', 'in-progress', 'p1-a', '2026-11-03T09:00:00Z')
    const finished = workout('w3', '2026-11-03', 'finished', 'p1-a', '2026-11-03T07:00:00Z')
    expect(todaysWorkout([abandoned, open, finished], '2026-11-03', 'p1-a')?.id).toBe('w2')
    expect(todaysWorkout([abandoned, finished], '2026-11-03', 'p1-a')?.id).toBe('w3')
    expect(todaysWorkout([abandoned], '2026-11-03', 'p1-a')?.id).toBe('w1')
  })
  it('matches the date and the template, or any template when none is known', () => {
    const a = workout('w1', '2026-11-03', 'finished', 'p1-a')
    expect(todaysWorkout([a], '2026-11-04', 'p1-a')).toBeNull()
    expect(todaysWorkout([a], '2026-11-03', 'p1-b')).toBeNull()
    expect(todaysWorkout([a], '2026-11-03', null)?.id).toBe('w1')
    expect(todaysWorkout([], '2026-11-03', 'p1-a')).toBeNull()
  })
  it('takes the most recently started of two with the same status', () => {
    const early = workout('w1', '2026-11-03', 'abandoned', 'p1-a', '2026-11-03T08:00:00Z')
    const late = workout('w2', '2026-11-03', 'abandoned', 'p1-a', '2026-11-03T10:00:00Z')
    expect(todaysWorkout([early, late], '2026-11-03', 'p1-a')?.id).toBe('w2')
  })
})

describe('newWorkoutId', () => {
  it('is the date and the template, with a suffix when that day already has an attempt', () => {
    expect(newWorkoutId('2026-11-03', 'p1-a', [])).toBe('2026-11-03-p1-a')
    expect(newWorkoutId('2026-11-03', 'p1-a', ['2026-11-03-p1-a'])).toBe('2026-11-03-p1-a-2')
    expect(newWorkoutId('2026-11-03', 'p1-a', ['2026-11-03-p1-a', '2026-11-03-p1-a-2'])).toBe('2026-11-03-p1-a-3')
  })
})

describe('yesterdayReadings', () => {
  const lifted = workout('w1', '2026-11-03', 'finished')
  const sets = [set('w1', 1, 2), set('w1', 2, 2), set('w1', 3, 2)]
  it('reads yesterday’s session through the engine, with the morning check attached', () => {
    const h = history({ workouts: [lifted], setLogs: sets, morningChecks: [check('2026-11-04')] })
    expect(yesterdayReadings('2026-11-04', h, PROGRAM.templates, 'right')).toEqual([{ label: 'Session A', result: 'clean', checkDone: true }])
  })
  it('reads hold with the check still to do, and says the check is not done', () => {
    const h = history({ workouts: [lifted], setLogs: sets })
    expect(yesterdayReadings('2026-11-04', h, PROGRAM.templates, 'right')).toEqual([{ label: 'Session A', result: 'hold', checkDone: false }])
  })
  it('includes a run, and nothing from other days', () => {
    const h = history({ workouts: [lifted], setLogs: sets, runs: [run('r1', '2026-11-02', 1)], morningChecks: [check('2026-11-03')] })
    expect(yesterdayReadings('2026-11-03', h, PROGRAM.templates, 'right')).toEqual([{ label: 'Run: MBR', result: 'clean', checkDone: true }])
    expect(yesterdayReadings('2026-11-05', h, PROGRAM.templates, 'right')).toEqual([])
  })
  it('is empty when nothing happened yesterday', () => {
    expect(yesterdayReadings('2026-11-04', history(), PROGRAM.templates, 'right')).toEqual([])
  })
  it('leaves out a session that was never finished; openWorkouts lists it instead', () => {
    const open = workout('w1', '2026-11-03', 'in-progress')
    const h = history({ workouts: [open], setLogs: sets })
    expect(yesterdayReadings('2026-11-04', h, PROGRAM.templates, 'right')).toEqual([])
    expect(openWorkouts(h.workouts, PROGRAM.templates)).toEqual([{ workoutId: 'w1', label: 'Session A', dateWords: 'Tuesday, November 3' }])
  })
})

describe('openWorkouts', () => {
  it('lists every open workout but the one Today resumes, oldest first, today’s included', () => {
    const stale = workout('w0', '2026-11-02', 'in-progress', 'p1-c')
    const resuming = workout('w1', '2026-11-03', 'in-progress', 'p1-a', '2026-11-03T18:00:00Z')
    const moved = workout('w2', '2026-11-03', 'in-progress', 'p1-b', '2026-11-03T17:00:00Z')
    const done = workout('w3', '2026-11-03', 'finished')
    expect(openWorkouts([resuming, done, stale, moved], PROGRAM.templates, 'w1')).toEqual([
      { workoutId: 'w0', label: 'Session C', dateWords: 'Monday, November 2' },
      { workoutId: 'w2', label: 'Session B', dateWords: 'Tuesday, November 3' },
    ])
    expect(openWorkouts([resuming], PROGRAM.templates, 'w1')).toEqual([])
    expect(openWorkouts([resuming], PROGRAM.templates)).toEqual([{ workoutId: 'w1', label: 'Session A', dateWords: 'Tuesday, November 3' }])
  })
})

describe('todayView', () => {
  const view = (today: string, s: Partial<Settings> = {}, h: Partial<HistoryLike> = {}) => todayView({ today, settings: settings(s), history: history(h), program: PROGRAM })

  it('before the start date: the start line, no week, Start disabled by the screen', () => {
    const v = view('2026-11-01')
    expect(v.body).toEqual({ kind: 'before-start', line: 'Week 1 starts Monday Nov 2' })
    expect(v.week).toBeNull()
    expect(v.deload).toBe(false)
    expect(v.dateWords).toBe('Sunday, November 1')
    expect(v.phaseName).toBe('Foundation')
  })
  it('a lift day: the session, its template, phase and week', () => {
    const v = view('2026-11-03')
    expect(v.week).toBe(1)
    expect(v.phaseNumber).toBe(1)
    expect(v.phaseHasSessions).toBe(true)
    expect(v.body).toMatchObject({ kind: 'lift', letter: 'A', label: 'Session A', week: 1, isDeload: false, workout: null, reading: null, checkDone: false })
    expect(v.body.kind === 'lift' && v.body.template?.id).toBe('p1-a')
    expect(v.yesterday).toEqual([])
  })
  it('a deload week says so and stamps the workout as deload', () => {
    const v = view('2026-11-24', { currentPhase: 2, phaseEnteredWeek: 4 })
    expect(v.week).toBe(4)
    expect(v.deload).toBe(true)
    expect(v.phaseName).toBe('Single-leg strength and balance')
    expect(v.body).toMatchObject({ kind: 'lift', letter: 'A', isDeload: true })
    expect(v.body.kind === 'lift' && v.body.template?.id).toBe('p2-a')
  })
  it('a run day points at the run logger with the program’s note; the off day carries its note', () => {
    expect(view('2026-11-02').body).toMatchObject({ kind: 'run', label: 'Run: MBR', note: 'Easy and conversational', target: 10, weekMiles: 0, loggedToday: [] })
    expect(view('2026-11-08').body).toEqual({ kind: 'off', label: 'Off: Kona walk and mobility only' })
  })
  it('follows a moved session', () => {
    const v = view('2026-11-03', {}, { sessionMoves: [{ id: 'mv1', week: 1, dayA: 'tue', dayB: 'wed' }] })
    expect(v.body).toMatchObject({ kind: 'run', label: 'Run: easy' })
  })
  it('the red-flag state replaces the day with the stop message', () => {
    const v = view('2026-11-03', { redFlag: { active: true, since: '2026-11-03', items: ['locking', 'numbness'] } })
    expect(v.body).toEqual({
      kind: 'stop',
      headline: 'Stop. Call the ortho or PT.',
      items: ['Locking or catching: a mechanical block to straightening or bending', 'Numbness or tingling below the knee'],
    })
  })
  it('Phase 4 has no template to start, and says so for every day of the week', () => {
    const stray = workout('w9', '2027-01-26', 'in-progress', 'p3-a')
    const v = view('2027-01-26', { currentPhase: 4, phaseEnteredWeek: 13 }, { workouts: [stray] })
    expect(v.week).toBe(13)
    expect(v.phaseName).toBe('Lacrosse')
    expect(v.phaseHasSessions).toBe(false)
    expect(v.body).toMatchObject({ kind: 'lift', letter: 'A', template: null, workout: null })
    expect(v.open).toEqual([{ workoutId: 'w9', label: 'Session', dateWords: 'Tuesday, January 26' }])
    expect(view('2027-01-27', { currentPhase: 4, phaseEnteredWeek: 13 }).phaseHasSessions).toBe(false)
  })
  it('an open workout today is handed back to resume, not listed as unfinished', () => {
    const open = workout('2026-11-03-p1-a', '2026-11-03', 'in-progress', 'p1-a', '2026-11-03T18:00:00Z')
    const v = view('2026-11-03', {}, { workouts: [open] })
    expect(v.body).toMatchObject({ kind: 'lift', workout: { id: '2026-11-03-p1-a', status: 'in-progress' }, reading: null })
    expect(v.open).toEqual([])
  })
  it('an open workout today for another session is listed as unfinished, not resumed', () => {
    const moved = workout('2026-11-03-p1-b', '2026-11-03', 'in-progress', 'p1-b', '2026-11-03T17:00:00Z')
    const v = view('2026-11-03', {}, { workouts: [moved] })
    expect(v.body).toMatchObject({ kind: 'lift', letter: 'A', workout: null })
    expect(v.open).toEqual([{ workoutId: '2026-11-03-p1-b', label: 'Session B', dateWords: 'Tuesday, November 3' }])
  })
  it('a finished workout today carries its reading in the engine’s words', () => {
    const done = workout('w1', '2026-11-03', 'finished')
    const v = view('2026-11-03', {}, { workouts: [done], setLogs: [set('w1', 1, 2), set('w1', 2, 2), set('w1', 3, 6)] })
    expect(v.body).toMatchObject({ kind: 'lift', workout: { id: 'w1', status: 'finished' }, reading: { result: 'back-off' }, checkDone: false })
    const withCheck = view('2026-11-03', {}, { workouts: [done], setLogs: [set('w1', 1, 2)], morningChecks: [check('2026-11-04')] })
    expect(withCheck.body).toMatchObject({ kind: 'lift', reading: { result: 'clean' }, checkDone: true })
  })
  it('yesterday’s reading and an unfinished session ride along with the day', () => {
    const lifted = workout('w1', '2026-11-03', 'finished')
    const stale = workout('w0', '2026-11-02', 'in-progress', 'p1-c')
    const v = view('2026-11-04', {}, { workouts: [lifted, stale], setLogs: [set('w1', 1, 4)], morningChecks: [check('2026-11-04')] })
    expect(v.body.kind).toBe('run')
    expect(v.yesterday).toEqual([{ label: 'Session A', result: 'hold', checkDone: true }])
    expect(v.open).toEqual([{ workoutId: 'w0', label: 'Session C', dateWords: 'Monday, November 2' }])
  })
})

describe('run days', () => {
  const view = (today: string, s: Partial<Settings> = {}, h: Partial<HistoryLike> = {}) => todayView({ today, settings: settings(s), history: history(h), program: PROGRAM })
  const run = (date: string, miles: number, type: Run['type'] = 'mbr'): Run => ({ id: `r-${date}`, date, type, miles, minutes: 30, effort: 'easy', maxPain: 1, strides: false, tempo: false })
  it('suggests the run’s share of the week, under the ceiling', () => {
    const v = view('2026-11-06', {}, { runs: [run('2026-11-02', 3), run('2026-11-04', 3, 'easy')] })
    expect(v.body).toMatchObject({ kind: 'run', weekMiles: 6, target: 10 })
    expect(v.body.kind === 'run' && v.body.suggestion?.miles).toBe(4)
  })
  it('shows what was already logged today', () => {
    const v = view('2026-11-02', {}, { runs: [run('2026-11-02', 3)] })
    expect(v.body.kind === 'run' && v.body.loggedToday.map((r: Run) => r.miles)).toEqual([3])
  })
  it('a hold morning suggests the swap', () => {
    const check = { id: 'm', date: '2026-11-04', appliesTo: null, stiffnessUnder30Min: true, worseThanYesterday: true, visibleSwelling: false, warmth: false, painChangePoints: 1, redFlags: [] }
    const v = view('2026-11-04', {}, { morningChecks: [check] })
    expect(v.body.kind === 'run' && v.body.suggestion?.swapSuggested).toBe(true)
  })
})
