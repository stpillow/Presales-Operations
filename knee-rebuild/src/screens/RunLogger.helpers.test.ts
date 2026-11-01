import { describe, expect, it } from 'vitest'
import { Run, type MorningCheck, type Settings } from '../schema/index.ts'
import {
  RUN_TYPES,
  dateChoices,
  dayChoiceWords,
  emptyForm,
  errorWords,
  isSwapType,
  leadWords,
  loggedWords,
  loggerView,
  milesWords,
  morningFor,
  newRunId,
  noSuggestionWords,
  reasonSentence,
  resolveForm,
  runPlanWords,
  runRow,
  stravaProblem,
  suggestionHead,
  suggestionSession,
  takeSwapWords,
  toRun,
  weekLine,
  type HistoryLike,
  type LoggerView,
  type ProgramLike,
  type ResolvedForm,
} from './RunLogger.helpers.ts'

const START = '2026-11-02'

/** Inline fixtures, not the live seed: these tests pin the screen's wiring, not the program's content. */
const PROGRAM: ProgramLike = {
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
  mileagePlan: [10, 11, 12, 9, 13, 14, 15, 11, 16, 17, 18, 14].map((targetMiles, i) => ({ week: i + 1, targetMiles, isDown: [4, 8, 12].includes(i + 1) })),
  redFlags: [{ id: 'locking', text: 'Locking or catching' }],
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
const run = (date: string, miles: number, type: Run['type'] = 'easy', maxPain = 1, id = `run-${date}`): Run => ({
  id,
  date,
  type,
  miles,
  minutes: 30,
  effort: 'easy',
  maxPain,
  strides: false,
  tempo: false,
})
const check = (date: string, over: Partial<MorningCheck> = {}): MorningCheck => ({
  id: `mc-${date}`,
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

function formView(input: Parameters<typeof loggerView>[0]): Extract<LoggerView, { kind: 'form' }> {
  const view = loggerView(input)
  if (view.kind !== 'form') throw new Error('expected the form view')
  return view
}

const base = { picked: { date: null, type: null }, settings: settings(), history: history(), program: PROGRAM }

describe('dateChoices', () => {
  it('is empty before the program starts', () => {
    expect(dateChoices('2026-11-01', START)).toEqual([])
  })
  it('runs from this program week’s Monday up to today', () => {
    expect(dateChoices('2026-11-02', START)).toEqual(['2026-11-02'])
    expect(dateChoices('2026-11-05', START)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'])
    expect(dateChoices('2026-11-11', START)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11'])
  })
  it('names each choice by its weekday, and today as Today', () => {
    expect(dayChoiceWords('2026-11-05', '2026-11-05')).toBe('Today')
    expect(dayChoiceWords('2026-11-02', '2026-11-05')).toBe('Mon')
  })
})

describe('suggestionSession', () => {
  it('asks for the run being logged when it is a run', () => {
    expect(suggestionSession('run:mbr', 'long')).toBe('run:long')
    expect(suggestionSession('lift:A', 'easy')).toBe('run:easy')
  })
  it('falls back to the day’s scheduled run for a swap or no pick, and to none off a run day', () => {
    expect(suggestionSession('run:easy', 'elliptical-swap')).toBe('run:easy')
    expect(suggestionSession('run:easy', null)).toBe('run:easy')
    expect(suggestionSession('lift:A', 'rower-swap')).toBeNull()
    expect(suggestionSession('off', null)).toBeNull()
  })
})

describe('morningFor', () => {
  it('reads the check logged that morning, or null', () => {
    expect(morningFor('2026-11-04', [check('2026-11-04', { worseThanYesterday: true })])).toBe('hold')
    expect(morningFor('2026-11-04', [check('2026-11-03')])).toBeNull()
  })
})

describe('loggerView', () => {
  it('says when week 1 starts before the program begins', () => {
    expect(loggerView({ ...base, today: '2026-11-01' })).toEqual({ kind: 'before-start', line: 'Week 1 starts Monday Nov 2' })
  })
  it('opens on today and preselects the type from today’s scheduled session', () => {
    const view = formView({ ...base, today: '2026-11-02' })
    expect(view).toMatchObject({ date: '2026-11-02', week: 1, scheduled: 'run:mbr', preselected: 'mbr', type: 'mbr', scheduledLabel: 'Run: MBR' })
    expect(view.suggestion).toMatchObject({ type: 'mbr', miles: 3 })
  })
  it('follows session moves', () => {
    const view = formView({ ...base, today: '2026-11-05', history: history({ sessionMoves: [{ id: 'm', week: 1, dayA: 'thu', dayB: 'fri' }] }) })
    expect(view).toMatchObject({ scheduled: 'run:long', preselected: 'long' })
  })
  it('preselects nothing on a lift day, and a picked type overrides the preselection', () => {
    const lift = formView({ ...base, today: '2026-11-03' })
    expect(lift).toMatchObject({ preselected: null, type: null, suggestion: null, scheduledLabel: 'Session A' })
    expect(formView({ ...base, today: '2026-11-03', picked: { date: null, type: 'easy' } }).suggestion?.type).toBe('easy')
    expect(formView({ ...base, today: '2026-11-02', picked: { date: null, type: 'long' } }).type).toBe('long')
  })
  it('logs for an earlier day this week, and falls back to today when the pick is outside it', () => {
    const earlier = formView({ ...base, today: '2026-11-05', picked: { date: '2026-11-04', type: null } })
    expect(earlier).toMatchObject({ date: '2026-11-04', preselected: 'easy' })
    expect(formView({ ...base, today: '2026-11-10', picked: { date: '2026-11-04', type: null } }).date).toBe('2026-11-10')
  })
  it('a hold morning suggests the swap without switching the type', () => {
    const view = formView({ ...base, today: '2026-11-04', history: history({ morningChecks: [check('2026-11-04', { worseThanYesterday: true })] }) })
    expect(view.type).toBe('easy')
    expect(view.suggestion?.swapSuggested).toBe(true)
    expect(view.suggestion?.reasons[0]).toContain('read hold')
  })
  it('counts the week’s miles against the target, capped by last week’s hold', () => {
    const runs = [run('2026-11-09', 3, 'mbr'), run('2026-11-11', 3), run('2026-11-13', 4.5, 'long', 4), run('2026-11-16', 2, 'mbr')]
    const view = formView({ ...base, today: '2026-11-18', history: history({ runs }) })
    expect(view.summary).toMatchObject({ miles: 2, target: { target: 10.5, capped: true } })
    expect(view.weekRuns.map((r) => r.date)).toEqual(['2026-11-16'])
    expect(view.suggestion?.type).toBe('easy')
  })
  it('suggests nothing while the red-flag state is on, and carries the stop message', () => {
    const view = formView({ ...base, today: '2026-11-02', settings: settings({ redFlag: { active: true, since: '2026-11-02', items: ['locking'] } }) })
    expect(view.suggestion).toBeNull()
    expect(view.stop).toEqual({ headline: 'Stop. Call the ortho or PT.', items: ['Locking or catching'] })
  })
  it('lists this week’s runs by date', () => {
    const runs = [run('2026-11-04', 3), run('2026-11-02', 3, 'mbr'), run('2026-10-30', 2)]
    expect(formView({ ...base, today: '2026-11-05', history: history({ runs }) }).weekRuns.map((r) => r.date)).toEqual(['2026-11-02', '2026-11-04'])
  })
})

describe('words for the view', () => {
  const view = formView({ ...base, today: '2026-11-02' })
  it('leads with the date and what it holds', () => {
    expect(leadWords(view)).toBe('Monday, November 2 · Run: MBR')
  })
  it('heads the suggestion with the type and miles', () => {
    expect(view.suggestion && suggestionHead(view.suggestion)).toBe('Run: MBR · 3 miles')
    expect(suggestionHead({ type: 'long', miles: null, strides: false, tempo: false, fasterAllowed: false, swapSuggested: false, reasons: [] })).toBe('Run: long')
  })
  it('heads with the swap when the engine calls for one, and keeps the run’s plan in words', () => {
    const swap = { type: 'easy' as const, miles: 3, strides: false, tempo: false, fasterAllowed: false, swapSuggested: true, reasons: [] }
    expect(suggestionHead(swap)).toBe('An elliptical or rower swap')
    expect(runPlanWords(swap)).toBe('Run: easy · 3 miles')
  })
  it('says why there is no suggestion', () => {
    expect(noSuggestionWords({ date: '2026-11-03', scheduledLabel: 'Session A', type: null, stop: null }, '2026-11-03')).toBe(
      'Today holds Session A, not a run, so there is no suggestion. Pick the type to log one anyway.',
    )
    expect(noSuggestionWords({ date: '2026-11-03', scheduledLabel: 'Session A', type: 'rower-swap', stop: null }, '2026-11-05')).toBe('Tuesday holds Session A, not a run, so there is no suggestion.')
    expect(noSuggestionWords({ date: '2026-11-02', scheduledLabel: 'Run: MBR', type: 'mbr', stop: { headline: 'x', items: [] } }, '2026-11-02')).toContain('red-flag state')
  })
  it('turns the engine’s fragments into sentences', () => {
    expect(reasonSentence('no morning check yet today')).toBe('No morning check yet today.')
    expect(reasonSentence('Already a sentence.')).toBe('Already a sentence.')
  })
  it('names the swaps', () => {
    expect(takeSwapWords('elliptical-swap')).toBe('Take the elliptical swap')
    expect(takeSwapWords('rower-swap')).toBe('Take the rower swap')
    expect(RUN_TYPES).toEqual(['mbr', 'easy', 'long', 'elliptical-swap', 'rower-swap'])
    expect(isSwapType('rower-swap')).toBe(true)
    expect(isSwapType('long')).toBe(false)
    expect(isSwapType(null)).toBe(false)
  })
})

describe('milesWords', () => {
  it('says miles without trailing zeros', () => {
    expect(milesWords(1)).toBe('1 mile')
    expect(milesWords(2.5)).toBe('2.5 miles')
    expect(milesWords(0.25)).toBe('0.25 miles')
    expect(milesWords(10)).toBe('10 miles')
  })
})

describe('weekLine', () => {
  const fromPlan = { miles: 3, target: { target: 10, capped: false, reason: 'from the plan' } }
  it('reads like the brief: miles against the target, with this run, and where the target came from', () => {
    expect(weekLine(fromPlan, { type: 'easy', miles: 3 })).toBe('This week: 3 of 10 miles · with this run 6 · target from the plan')
  })
  it('gives the rule’s reason when the target is capped', () => {
    const capped = { miles: 2, target: { target: 10.5, capped: true, reason: 'last week read hold: capped at last week’s 10.5 miles' } }
    expect(weekLine(capped, { type: 'mbr', miles: 2.25 })).toBe('This week: 2 of 10.5 miles · with this run 4.25 · last week read hold: capped at last week’s 10.5 miles')
  })
  it('says a swap adds no miles', () => {
    expect(weekLine(fromPlan, { type: 'elliptical-swap', miles: 0 })).toBe('This week: 3 of 10 miles · a swap adds no miles · target from the plan')
  })
  it('outside the plan, has no target to count against', () => {
    const outside = { miles: 4, target: { target: null, capped: false, reason: 'week 13 is outside the 12-week plan' } }
    expect(weekLine(outside, { type: 'easy', miles: 3 })).toBe('This week: 4 miles · with this run 7 · week 13 is outside the 12-week plan')
  })
  it('without a pending run, just the week', () => {
    expect(weekLine(fromPlan, null)).toBe('This week: 3 of 10 miles · target from the plan')
  })
})

describe('resolveForm', () => {
  const suggestion = { type: 'easy' as const, miles: 3.5, strides: true, tempo: false, fasterAllowed: false, swapSuggested: false, reasons: [] }
  it('follows the suggestion until a field is touched', () => {
    const resolved = resolveForm(emptyForm(), { date: '2026-11-04', type: 'easy', suggestion })
    expect(resolved).toMatchObject({ date: '2026-11-04', miles: 3.5, strides: true, tempo: false, swap: false, maxPain: null, effort: 'easy' })
    expect(resolveForm({ ...emptyForm(), miles: 4, strides: false }, { date: '2026-11-04', type: 'easy', suggestion })).toMatchObject({ miles: 4, strides: false })
  })
  it('logs a swap as 0 miles with no strides or tempo', () => {
    expect(resolveForm({ ...emptyForm(), miles: 4, strides: true }, { date: '2026-11-04', type: 'rower-swap', suggestion })).toMatchObject({ swap: true, miles: 0, strides: false, tempo: false })
  })
  it('starts at 0 miles with no suggestion', () => {
    expect(resolveForm(emptyForm(), { date: '2026-11-03', type: null, suggestion: null })).toMatchObject({ miles: 0, strides: false, tempo: false })
  })
})

describe('stravaProblem', () => {
  it('accepts an empty field and a strava.com https link', () => {
    expect(stravaProblem('')).toBeNull()
    expect(stravaProblem('  ')).toBeNull()
    expect(stravaProblem('https://www.strava.com/activities/123')).toBeNull()
    expect(stravaProblem('https://strava.com/activities/123')).toBeNull()
  })
  it('says the refusal in words for anything the schema refuses', () => {
    for (const link of ['http://www.strava.com/activities/1', 'https://strava.app.link/abc', 'strava.com/activities/1', 'https://evil.example/strava.com']) {
      expect(stravaProblem(link)).toContain('refused')
    }
  })
})

describe('toRun', () => {
  const ready: ResolvedForm = { date: '2026-11-04', type: 'easy', swap: false, miles: 3.25, minutes: 32, effort: 'easy', maxPain: 2, strides: true, tempo: false, stravaUrl: '', notes: '' }
  it('keeps Save disabled with words until max pain is rated and a type is picked', () => {
    expect(toRun({ ...ready, maxPain: null }, 'r')).toEqual({ ok: false, blocker: 'Rate max pain first' })
    expect(toRun({ ...ready, type: null }, 'r')).toEqual({ ok: false, blocker: 'Pick the type first' })
    expect(toRun({ ...ready, type: null, maxPain: null }, 'r')).toEqual({ ok: false, blocker: 'Pick the type and rate max pain first' })
  })
  it('a rated 0 is a rating, not a missing one', () => {
    expect(toRun({ ...ready, maxPain: 0 }, 'r').ok).toBe(true)
  })
  it('refuses to save a refused Strava link', () => {
    expect(toRun({ ...ready, stravaUrl: 'http://strava.com/x' }, 'r')).toEqual({ ok: false, blocker: 'Fix or clear the Strava link first' })
  })
  it('builds a run the schema accepts, leaving blank optional fields off', () => {
    const draft = toRun(ready, 'run-2026-11-04')
    expect(draft).toEqual({ ok: true, run: { id: 'run-2026-11-04', date: '2026-11-04', type: 'easy', miles: 3.25, minutes: 32, effort: 'easy', maxPain: 2, strides: true, tempo: false } })
    if (draft.ok) expect(Run.parse(draft.run)).toEqual(draft.run)
  })
  it('trims the link and the note', () => {
    const draft = toRun({ ...ready, stravaUrl: ' https://www.strava.com/activities/9 ', notes: '  windy  ' }, 'r')
    expect(draft.ok && draft.run).toMatchObject({ stravaUrl: 'https://www.strava.com/activities/9', notes: 'windy' })
    if (draft.ok) expect(() => Run.parse(draft.run)).not.toThrow()
  })
  it('a swap logs 0 miles', () => {
    const draft = toRun({ ...ready, type: 'elliptical-swap', swap: true, miles: 0, strides: false }, 'r')
    expect(draft.ok && draft.run).toMatchObject({ type: 'elliptical-swap', miles: 0, strides: false, tempo: false })
  })
})

describe('newRunId', () => {
  it('is readable and never collides with another run that day', () => {
    expect(newRunId('2026-11-04', [])).toBe('run-2026-11-04')
    expect(newRunId('2026-11-04', ['run-2026-11-04'])).toBe('run-2026-11-04-2')
    expect(newRunId('2026-11-04', ['run-2026-11-04', 'run-2026-11-04-2'])).toBe('run-2026-11-04-3')
  })
})

describe('loggedWords', () => {
  it('today’s run: tomorrow’s morning check reads it', () => {
    expect(loggedWords(run('2026-11-04', 3), '2026-11-04', [])).toBe('Logged. Tomorrow’s morning check reads it.')
  })
  it('an earlier run already covered by a check names that check', () => {
    expect(loggedWords(run('2026-11-02', 3), '2026-11-05', [check('2026-11-03')])).toBe('Logged for Monday Nov 2. The morning check from Tuesday Nov 3 reads it.')
  })
  it('yesterday’s run: this morning’s check reads it, or must be saved again when it was linked elsewhere', () => {
    expect(loggedWords(run('2026-11-04', 3), '2026-11-05', [])).toBe('Logged for yesterday, Wednesday Nov 4. This morning’s check reads it.')
    const linked = check('2026-11-05', { appliesTo: { kind: 'workout', id: 'w' } })
    expect(loggedWords(run('2026-11-04', 3), '2026-11-05', [linked])).toContain('save the check again')
  })
  it('an older run no check covers reads as the engine reads it without one', () => {
    expect(loggedWords(run('2026-11-02', 3), '2026-11-05', [])).toBe('Logged for Monday Nov 2. No morning check from the day after covers it, so it reads hold.')
    expect(loggedWords(run('2026-11-02', 3, 'easy', 7), '2026-11-05', [])).toContain('reads back off')
  })
})

describe('runRow', () => {
  it('gives date, type, miles and max pain in words', () => {
    expect(runRow(run('2026-11-02', 3, 'mbr', 2))).toEqual({ when: 'Monday Nov 2', what: 'Run: MBR', miles: '3 miles', pain: 'max pain 2' })
    expect(runRow(run('2026-11-04', 0, 'rower-swap'))).toMatchObject({ what: 'Rower swap', miles: 'no miles (swap)' })
  })
})

describe('errorWords', () => {
  it('says a rejected write in words', () => {
    expect(errorWords(new Error('quota exceeded'))).toBe('quota exceeded')
    expect(errorWords('')).toBe('no reason was given')
  })
})
