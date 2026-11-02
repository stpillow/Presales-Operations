import { describe, expect, it } from 'vitest'
import { program } from '../program/program.ts'
import { availableEquipment } from '../rules/equipment.ts'
import type { RunSuggestion } from '../rules/weekPlan.ts'
import type { Location, MorningCheck, Run, SessionTemplate, SetLog, Settings, Workout } from '../schema/index.ts'
import {
  NEW_LOCATION_HASH,
  atGymWords,
  dateWords,
  gymRows,
  itemWords,
  lackWords,
  liftGym,
  liftMoves,
  markOffLines,
  monthDayWords,
  movesHeading,
  noSwapMachineWords,
  noSwapSuggestedWords,
  runSuggestionAtGym,
  startWords,
  newWorkout,
  newWorkoutId,
  openWorkouts,
  phaseName,
  runLabel,
  runWeekWords,
  suggestionWords,
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
  activeLocationId: 'planet-fitness',
  kit: ['ankle-strap', 'mini-band'],
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

describe('newWorkout', () => {
  it('is the session Start writes: in progress, stamped with the time and the active gym (M4b)', () => {
    const workout = newWorkout({ id: '2026-11-10-p1-a', date: '2026-11-10', templateId: 'p1-a', phase: 1, week: 2, isDeload: false, startedAt: '2026-11-10T11:00:00.000Z', locationId: 'loc-1' })
    expect(workout).toEqual({
      id: '2026-11-10-p1-a',
      date: '2026-11-10',
      templateId: 'p1-a',
      phase: 1,
      week: 2,
      isDeload: false,
      startedAt: '2026-11-10T11:00:00.000Z',
      status: 'in-progress',
      locationId: 'loc-1',
    })
  })
  it('stamps Planet Fitness too, rather than leaving it to the absent-means-Planet-Fitness reading', () => {
    expect(newWorkout({ id: 'w', date: '2026-11-10', templateId: 'p1-a', phase: 1, week: 2, isDeload: false, startedAt: '2026-11-10T11:00:00.000Z', locationId: 'planet-fitness' }).locationId).toBe('planet-fitness')
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
  it('shows the cap’s reason only when the rule capped the week (M4 review)', () => {
    // Week 3 (plan 12) logs 12 miles and one run reads hold; week 4 is the down week, plan 9.
    const weekThree = [run('2026-11-16', 3.5), { ...run('2026-11-18', 3.5, 'easy'), maxPain: 4 }, run('2026-11-20', 5, 'long')]
    const checks = ['2026-11-17', '2026-11-19', '2026-11-21'].map((date) => check(date))
    const deload = view('2026-11-23', {}, { runs: weekThree, morningChecks: checks })
    expect(deload.body).toMatchObject({ kind: 'run', target: 9, capped: false })
    expect(deload.body.kind === 'run' && runWeekWords(deload.body)).toBe('This week: 0 of 9 miles')
    // Week 1 logs 6 of 10 with a hold, so week 2 (plan 11) is capped at 6.
    const weekOne = [run('2026-11-02', 3), { ...run('2026-11-04', 3, 'easy'), maxPain: 4 }]
    const capped = view('2026-11-09', {}, { runs: weekOne, morningChecks: [check('2026-11-03'), check('2026-11-05')] })
    expect(capped.body).toMatchObject({ kind: 'run', target: 6, capped: true })
    expect(capped.body.kind === 'run' && runWeekWords(capped.body)).toBe('This week: 0 of 6 miles · last week read hold: capped at last week’s 6 miles')
  })
  it('names no target outside the plan', () => {
    const v = view('2027-01-25', { currentPhase: 3, phaseEnteredWeek: 8 }, { runs: [run('2027-01-25', 2)] })
    expect(v.body).toMatchObject({ kind: 'run', target: null, capped: false })
    expect(v.body.kind === 'run' && runWeekWords(v.body)).toBe('This week: 2 miles')
  })
  it('a hold morning suggests the swap', () => {
    const check = { id: 'm', date: '2026-11-04', appliesTo: null, stiffnessUnder30Min: true, worseThanYesterday: true, visibleSwelling: false, warmth: false, painChangePoints: 1, redFlags: [] }
    const v = view('2026-11-04', {}, { morningChecks: [check] })
    expect(v.body.kind === 'run' && v.body.suggestion?.swapSuggested).toBe(true)
    expect(v.body.kind === 'run' && v.body.suggestion && suggestionWords(v.body.suggestion).headline).toBe('Suggested: a 30 to 40 minute elliptical or rower swap')
  })
  it('prints the engine’s headline and its reasons as sentences, writing no prescription of its own (M4 review)', () => {
    const clean = check('2026-11-06')
    const v = view('2026-11-06', {}, { runs: [run('2026-11-02', 3), run('2026-11-04', 3, 'easy')], morningChecks: [clean] })
    if (v.body.kind !== 'run' || !v.body.suggestion) throw new Error('expected a run suggestion')
    expect(suggestionWords(v.body.suggestion)).toEqual({ headline: `Suggested: ${v.body.suggestion.headline}`, reasons: [] })
    expect(suggestionWords(v.body.suggestion).headline).toBe('Suggested: 4 miles')
    // Outside the plan the engine has no miles; whatever it says is what the screen prints.
    const late = view('2027-01-29', { currentPhase: 3, phaseEnteredWeek: 8 }, { morningChecks: [check('2027-01-29')] })
    if (late.body.kind !== 'run' || !late.body.suggestion) throw new Error('expected a run suggestion')
    expect(suggestionWords(late.body.suggestion).headline).toBe(`Suggested: ${late.body.suggestion.headline}`)
    expect(suggestionWords(late.body.suggestion).reasons).toEqual(late.body.suggestion.reasons.map((r) => `${r.charAt(0).toUpperCase()}${r.slice(1)}.`))
    expect(suggestionWords(late.body.suggestion).reasons).toContain('Carry a 2 × 5 min comfortably-hard segment with 3 min easy between.')
    // ...and the headline over that tempo does not say easy.
    expect(suggestionWords(late.body.suggestion).headline).toBe('Suggested: distance by feel')
  })
})

// ---- Where you train, on Today (M4b Part C) ----

const gym = (id: string, name: string, over: Partial<Location> = {}): Location => ({
  id,
  name,
  present: [],
  dumbbellMaxLb: 0,
  startedFrom: 'empty',
  listVersion: 1,
  extras: [],
  markedOff: [],
  createdOn: '2026-11-02',
  archived: false,
  ...over,
})
const HOME = gym('planet-fitness', 'Planet Fitness', { startedFrom: 'planet-fitness', dumbbellMaxLb: 80, createdOn: '2026-11-01' })
const MARRIOTT = gym('loc-1', 'Marriott Downtown', { dumbbellMaxLb: 25, createdOn: '2026-11-09' })
const OLD_HOTEL = gym('loc-2', 'Old hotel', { createdOn: '2026-11-03', archived: true })
const ITEMS = [
  { id: 'smith-machine', name: 'Smith machine', carried: false },
  { id: 'seated-leg-press', name: 'Seated leg press', carried: false },
  { id: 'leg-press-45', name: '45° leg press', carried: false },
  { id: 'step-platforms', name: 'Step platforms', carried: false },
  { id: 'stair', name: 'Stair', carried: false },
  { id: 'bosu', name: 'Bosu or balance pad', carried: false },
  { id: 'ankle-strap', name: 'Cable ankle strap', carried: true },
]

describe('the gym line and Change', () => {
  it('names the gym Today plans for', () => {
    expect(atGymWords(HOME)).toBe('At Planet Fitness')
    expect(atGymWords(MARRIOTT)).toBe('At Marriott Downtown')
  })
  it('lists every gym that is not archived, Planet Fitness first, with the active one marked', () => {
    expect(gymRows([MARRIOTT, OLD_HOTEL, HOME], 'loc-1')).toEqual([
      { id: 'planet-fitness', name: 'Planet Fitness', active: false, mark: 'Use here' },
      { id: 'loc-1', name: 'Marriott Downtown', active: true, mark: '✓ Active' },
    ])
    expect(gymRows([HOME], 'planet-fitness')).toEqual([{ id: 'planet-fitness', name: 'Planet Fitness', active: true, mark: '✓ Active' }])
  })
  it('ends with New location, which opens the editor on a new gym', () => {
    expect(NEW_LOCATION_HASH).toBe('#/location/new')
  })
})

describe('the gym a lift runs at', () => {
  const at = (status: Workout['status'], locationId?: string): Workout => ({ ...workout('w', '2026-11-03', status), ...(locationId ? { locationId } : {}) })
  it('an open or abandoned session keeps the gym it was started at', () => {
    expect(liftGym(at('in-progress', 'loc-1'), HOME, [HOME, MARRIOTT]).id).toBe('loc-1')
    expect(liftGym(at('abandoned', 'loc-1'), HOME, [HOME, MARRIOTT]).id).toBe('loc-1')
    // Archived since: the session still ran there.
    expect(liftGym(at('in-progress', 'loc-2'), HOME, [HOME, OLD_HOTEL]).id).toBe('loc-2')
  })
  it('a session stamped with no gym ran at Planet Fitness', () => {
    expect(liftGym(at('in-progress'), MARRIOTT, [HOME, MARRIOTT]).id).toBe('planet-fitness')
  })
  it('a session still to start, or one finished, plans at the active gym', () => {
    expect(liftGym(null, MARRIOTT, [HOME, MARRIOTT]).id).toBe('loc-1')
    expect(liftGym(at('finished', 'planet-fitness'), MARRIOTT, [HOME, MARRIOTT]).id).toBe('loc-1')
  })
  it('Start names the session; Resume names the gym only when it is not the active one', () => {
    expect(startWords('Session A', null, HOME, HOME)).toBe('Start Session A')
    expect(startWords('Session A', { status: 'in-progress' }, HOME, HOME)).toBe('Resume Session A')
    expect(startWords('Session A', { status: 'in-progress' }, MARRIOTT, HOME)).toBe('Resume Session A at Marriott Downtown')
    expect(startWords('Session A', { status: 'abandoned' }, MARRIOTT, HOME)).toBe('Resume Session A at Marriott Downtown')
  })
})

describe('equipment in words', () => {
  it('lowercases a list name inside a sentence, but not the Smith machine', () => {
    expect(itemWords('Seated leg press')).toBe('seated leg press')
    expect(itemWords('Smith machine')).toBe('Smith machine')
    expect(itemWords('45° leg press')).toBe('45° leg press')
  })
  it('says what is missing, with carried items as not in the bag', () => {
    expect(lackWords(['smith-machine'], ITEMS)).toBe('no Smith machine')
    expect(lackWords(['ankle-strap'], ITEMS)).toBe('no cable ankle strap in your bag')
    expect(lackWords([{ anyOf: ['step-platforms', 'stair'] }], ITEMS)).toBe('no step platforms, no stair')
    expect(lackWords(['seated-leg-press', 'leg-press-45'], ITEMS)).toBe('no seated leg press, no 45° leg press')
  })
  it('names an item the list does not carry from its id', () => {
    expect(lackWords(['kettlebell-rack'], ITEMS)).toBe('no kettlebell rack')
  })
  it('a mark-off says since when', () => {
    expect(monthDayWords('2026-11-10')).toBe('Nov 10')
    expect(monthDayWords('2027-01-04')).toBe('Jan 4')
    const marked = { ...MARRIOTT, markedOff: [{ id: 'seated-leg-press', on: '2026-11-10' }, { id: 'smith-machine', on: '2026-11-12' }] }
    expect(markOffLines(marked, ITEMS)).toEqual([
      { itemId: 'seated-leg-press', words: 'Seated leg press marked not here since Nov 10' },
      { itemId: 'smith-machine', words: 'Smith machine marked not here since Nov 12' },
    ])
    expect(markOffLines(HOME, ITEMS)).toEqual([])
  })
})

describe('what moves at a gym (live seed)', () => {
  const byId = new Map(program.exercises.map((e) => [e.id, e]))
  const at = (location: Location, kit: readonly string[] = ['ankle-strap', 'mini-band']) => availableEquipment(location, program.equipment, program.planetFitness, kit)
  const template = (id: string) => {
    const t = program.templates.find((x) => x.id === id)
    if (!t) throw new Error(`no template ${id}`)
    return t
  }
  const home = { ...HOME, present: [...program.planetFitness, 'leg-press-45', 'rower'] }
  it('nothing moves at the home gym', () => {
    for (const t of program.templates) {
      expect(liftMoves({ template: t, phaseWeek: 1, byId, available: at(home), items: program.equipment }), t.id).toEqual([])
    }
  })
  it('a slot moves for want of a carried item, said as not in the bag', () => {
    const moves = liftMoves({ template: template('p1-c'), phaseWeek: 1, byId, available: at(home, ['mini-band']), items: program.equipment })
    expect(moves).toEqual(['Cable hip abduction, ankle strap → Lateral band walk (no cable ankle strap in your bag)'])
  })
  it('a gym with a few things moves each slot to the first one there, saying what the own exercise lacks', () => {
    const hotel = { ...MARRIOTT, present: ['flat-bench', 'cable-station', 'mats'] }
    const moves = liftMoves({ template: template('p1-a'), phaseWeek: 1, byId, available: at(hotel), items: program.equipment })
    expect(moves).toContain('Leg press, both legs → Goblet squat to a bench (no seated leg press)')
    expect(moves).toContain('Hip abductor machine → Cable hip abduction, ankle strap (no hip abductor machine)')
    expect(moves).toContain('Lat pulldown → Single-arm cable pulldown (no lat pulldown)')
  })
  it('a slot with nothing on its list here says so', () => {
    const bare = { ...MARRIOTT, present: [] }
    const moves = liftMoves({ template: template('p3-a'), phaseWeek: 1, byId, available: at(bare), items: program.equipment })
    expect(moves).toContain('Nothing here for Step-off landing from a 6–8 in. step, stuck for 2 s (no step platforms)')
  })
  it('a mark-off moves the slot like a missing item', () => {
    const marked = { ...home, markedOff: [{ id: 'seated-leg-press', on: '2026-11-10' }] }
    const moves = liftMoves({ template: template('p1-a'), phaseWeek: 1, byId, available: at(marked), items: program.equipment })
    expect(moves).toEqual(['Leg press, both legs → 45° leg press (no seated leg press)'])
  })
  it('says how many slots move, or that none does', () => {
    expect(movesHeading('Marriott Downtown', 'Session A', 3)).toBe('3 slots of Session A move at Marriott Downtown:')
    expect(movesHeading('Marriott Downtown', 'Session A', 1)).toBe('1 slot of Session A moves at Marriott Downtown:')
    expect(movesHeading('Planet Fitness', 'Session A', 0)).toBe('Nothing in Session A moves at Planet Fitness.')
  })
})

describe('a Hold run day at a gym', () => {
  const swapDay: Pick<RunSuggestion, 'headline' | 'reasons' | 'swapSuggested'> = {
    headline: 'a 30 to 40 minute elliptical or rower swap',
    reasons: ['this morning read hold: an elliptical or rower swap at the same effort is the call'],
    swapSuggested: true,
  }
  it('with a swap machine here, prints the engine’s suggestion', () => {
    expect(runSuggestionAtGym(swapDay, { available: new Set(['rower']), gymName: 'Marriott Downtown', morning: 'hold' })).toEqual(suggestionWords(swapDay))
  })
  it('with neither machine here, suggests nothing and says neither is here (Shawn’s Nov 1 answer 7)', () => {
    expect(noSwapMachineWords('Marriott Downtown')).toBe('No elliptical or rower at Marriott Downtown')
    expect(runSuggestionAtGym(swapDay, { available: new Set(['treadmill']), gymName: 'Marriott Downtown', morning: 'hold' })).toEqual({
      headline: 'No elliptical or rower at Marriott Downtown',
      reasons: ['This morning read hold, and program.md names no swap but those two, so nothing is suggested: pick what you did.'],
    })
    expect(noSwapSuggestedWords('back-off')).toBe('This morning read back off, and program.md names no swap but those two, so nothing is suggested: pick what you did.')
  })
  it('a run with no swap called is the engine’s run, whatever the gym has', () => {
    const run = { headline: '4 miles', reasons: [], swapSuggested: false }
    expect(runSuggestionAtGym(run, { available: new Set(), gymName: 'Marriott Downtown', morning: 'clean' })).toEqual(suggestionWords(run))
  })
  it('todayView carries the morning’s reading on a run day, and the phase week on a lift day', () => {
    const hold = check('2026-11-04', { worseThanYesterday: true })
    const runDay = todayView({ today: '2026-11-04', settings: settings(), history: history({ morningChecks: [hold] }), program: PROGRAM })
    expect(runDay.body).toMatchObject({ kind: 'run', morning: 'hold' })
    const noCheck = todayView({ today: '2026-11-02', settings: settings(), history: history(), program: PROGRAM })
    expect(noCheck.body).toMatchObject({ kind: 'run', morning: null })
    const lift = todayView({ today: '2026-11-24', settings: settings({ currentPhase: 2, phaseEnteredWeek: 4 }), history: history(), program: PROGRAM })
    expect(lift.body).toMatchObject({ kind: 'lift', week: 4, phaseWeek: 1 })
  })
})
