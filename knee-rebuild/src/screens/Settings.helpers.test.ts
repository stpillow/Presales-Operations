import { describe, expect, it } from 'vitest'
import type { SessionMove, Settings } from '../schema/index.ts'
import {
  DUMBBELL_PRESETS,
  DUMBBELL_STEP,
  REST_MIN,
  REST_STEP,
  SIDES,
  checkStartDate,
  clearedSettings,
  dateWords,
  deloadWeeksLine,
  droppedMovesWords,
  errorWords,
  mondaysAround,
  painWords,
  phaseWords,
  redFlagView,
  restTimerWords,
  sideWords,
  startDateChange,
  weekLine,
} from './Settings.helpers.ts'

const START = '2026-11-02'

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

/** Inline fixtures, not the live seed: these tests pin the screen's wiring, not the program's content. */
const catalog = [
  { id: 'locking', text: 'Locking or catching: a mechanical block to straightening or bending' },
  { id: 'numbness', text: 'Numbness or tingling below the knee' },
]
const phases = [
  { number: 1, name: 'Foundation' },
  { number: 2, name: 'Single-leg strength and balance' },
]

describe('dateWords', () => {
  it('says the weekday, month and day with no clock involved', () => {
    expect(dateWords('2026-11-02')).toBe('Monday Nov 2')
    expect(dateWords('2026-11-03')).toBe('Tuesday Nov 3')
    expect(dateWords('2027-01-24')).toBe('Sunday Jan 24')
  })
})

describe('sides and limits', () => {
  it('offers both knees, in words', () => {
    expect(SIDES).toEqual(['left', 'right'])
    expect(sideWords('left')).toBe('Left knee')
    expect(sideWords('right')).toBe('Right knee')
  })
  it('keeps the rack presets and the step sizes from the brief', () => {
    expect(DUMBBELL_PRESETS).toEqual([60, 75, 80])
    expect(DUMBBELL_STEP).toBe(5)
    expect(REST_STEP).toBe(15)
    expect(REST_MIN).toBe(15)
  })
})

describe('mondaysAround', () => {
  it('finds the Monday on or before a date and the Monday after it', () => {
    expect(mondaysAround('2026-11-03')).toEqual(['2026-11-02', '2026-11-09'])
    expect(mondaysAround('2026-11-08')).toEqual(['2026-11-02', '2026-11-09'])
    expect(mondaysAround('2026-11-02')).toEqual(['2026-11-02', '2026-11-09'])
  })
})

describe('checkStartDate', () => {
  it('accepts a Monday', () => {
    expect(checkStartDate('2026-11-02')).toEqual({ ok: true, date: '2026-11-02' })
    expect(checkStartDate(' 2026-11-09 ')).toEqual({ ok: true, date: '2026-11-09' })
  })
  it('refuses any other weekday in words and names the nearest Mondays', () => {
    expect(checkStartDate('2026-11-03')).toEqual({
      ok: false,
      message: 'Tuesday Nov 3 is not a Monday. Weeks start on Monday; the nearest are Monday Nov 2 and Monday Nov 9.',
      mondays: ['2026-11-02', '2026-11-09'],
    })
    expect(checkStartDate('2026-11-08')).toMatchObject({ ok: false, mondays: ['2026-11-02', '2026-11-09'] })
  })
  it('refuses an empty or impossible date without offering Mondays', () => {
    expect(checkStartDate('')).toEqual({ ok: false, message: 'Pick a date. Week 1 starts on it, and the deload weeks hang off it.', mondays: [] })
    expect(checkStartDate('2026-02-30')).toEqual({ ok: false, message: '"2026-02-30" is not a calendar date.', mondays: [] })
    expect(checkStartDate('nope')).toMatchObject({ ok: false, mondays: [] })
  })
})

describe('startDateChange', () => {
  const moves: SessionMove[] = [
    { id: 'move-000001', week: 1, dayA: 'mon', dayB: 'tue' },
    { id: 'move-000002', week: 2, dayA: 'thu', dayB: 'fri' },
    { id: 'move-000003', week: 3, dayA: 'wed', dayB: 'sat' },
  ]
  it('keeps each move on the dates it was made for, and says nothing when none is dropped (M4 review)', () => {
    // A start moved a week earlier renumbers every move one week later.
    expect(startDateChange(START, '2026-10-26', moves)).toEqual({ moves: moves.map((m) => ({ ...m, week: m.week + 1 })), dropped: 0, notice: null, phaseEnteredWeek: 2 })
    expect(startDateChange(START, START, moves)).toEqual({ moves, dropped: 0, notice: null, phaseEnteredWeek: 1 })
    expect(startDateChange(START, '2026-11-09', [])).toEqual({ moves: [], dropped: 0, notice: null, phaseEnteredWeek: 1 })
    // The week the current phase was entered stays on its calendar week too.
    expect(startDateChange(START, '2026-11-09', [], 4).phaseEnteredWeek).toBe(3)
  })
  it('drops a move that falls before the new week 1 and says how many', () => {
    const later = startDateChange(START, '2026-11-09', moves)
    expect(later.moves).toEqual([
      { id: 'move-000002', week: 1, dayA: 'thu', dayB: 'fri' },
      { id: 'move-000003', week: 2, dayA: 'wed', dayB: 'sat' },
    ])
    expect(later.dropped).toBe(1)
    expect(later.notice).toBe('1 session move was for a week before the new week 1, so it was dropped. The other 2 stay on the dates they were made for.')
    expect(startDateChange(START, '2026-11-23', moves)).toEqual({ moves: [], dropped: 3, notice: '3 session moves were for weeks before the new week 1, so they were dropped.', phaseEnteredWeek: 1 })
  })
  it('refuses start dates that are not whole weeks apart, as the rule does', () => {
    expect(() => startDateChange(START, '2026-11-10', moves)).toThrow(RangeError)
  })
})

describe('droppedMovesWords', () => {
  it('is silent when nothing was dropped, and counts the dropped and the kept otherwise', () => {
    expect(droppedMovesWords(0, 4)).toBeNull()
    expect(droppedMovesWords(1, 0)).toBe('1 session move was for a week before the new week 1, so it was dropped.')
    expect(droppedMovesWords(2, 1)).toBe('2 session moves were for weeks before the new week 1, so they were dropped. The other one stays on the dates it was made for.')
    expect(droppedMovesWords(1, 3)).toBe('1 session move was for a week before the new week 1, so it was dropped. The other 3 stay on the dates they were made for.')
  })
})

describe('weekLine', () => {
  it('says which week today is in, and names a deload week', () => {
    expect(weekLine('2026-11-02', START)).toBe('Today, Monday Nov 2, is in week 1.')
    expect(weekLine('2026-11-03', START)).toBe('Today, Tuesday Nov 3, is in week 1.')
    expect(weekLine('2026-11-23', START)).toBe('Today, Monday Nov 23, is in week 4, a deload week.')
  })
  it('counts down to week 1 before the program', () => {
    expect(weekLine('2026-11-01', START)).toBe('Week 1 starts Monday Nov 2, tomorrow.')
    expect(weekLine('2026-10-30', START)).toBe('Week 1 starts Monday Nov 2, in 3 days.')
  })
})

describe('deloadWeeksLine', () => {
  it('names the deload weeks from the rule, not by hand', () => {
    expect(deloadWeeksLine()).toBe('Deload weeks are 4, 8 and 12 from it.')
    expect(deloadWeeksLine([4, 8])).toBe('Deload weeks are 4 and 8 from it.')
    expect(deloadWeeksLine([6])).toBe('Deload weeks are 6 from it.')
    expect(deloadWeeksLine([])).toBe('There are no deload weeks.')
  })
})

describe('restTimerWords', () => {
  it('reads seconds under a minute, whole minutes, and the mix', () => {
    expect(restTimerWords(45)).toBe('45 s')
    expect(restTimerWords(60)).toBe('1 min')
    expect(restTimerWords(90)).toBe('1 min 30 s')
    expect(restTimerWords(120)).toBe('2 min')
  })
})

describe('painWords and phaseWords', () => {
  it('explains per-set and per-exercise pain logging', () => {
    expect(painWords(true)).toBe('Per set: a pain stepper on every set.')
    expect(painWords(false)).toBe('Per exercise: one pain number per exercise, written on each of its sets.')
  })
  it('names the phase and the week it was entered, falling back to the number', () => {
    expect(phaseWords(settings(), phases)).toEqual({ title: 'Phase 1: Foundation', entered: 'Entered in week 1.' })
    expect(phaseWords(settings({ currentPhase: 2, phaseEnteredWeek: 5 }), phases)).toEqual({ title: 'Phase 2: Single-leg strength and balance', entered: 'Entered in week 5.' })
    expect(phaseWords(settings({ currentPhase: 4, phaseEnteredWeek: 13 }), phases).title).toBe('Phase 4')
  })
})

describe('redFlagView', () => {
  it("spells out an active flag from the engine's stop message", () => {
    expect(redFlagView({ active: true, since: '2026-11-04', items: ['locking', 'made-up'] }, catalog)).toEqual({
      active: true,
      headline: 'Stop. Call the ortho or PT.',
      since: 'Flagged since Wednesday Nov 4.',
      items: ['Locking or catching: a mechanical block to straightening or bending', 'made-up'],
    })
    expect(redFlagView({ active: true, items: ['numbness'] }, catalog)).toMatchObject({ active: true, since: null })
  })
  it('says when nothing is set, and how it was last cleared', () => {
    expect(redFlagView({ active: false, items: [] }, catalog)).toEqual({ active: false, cleared: null })
    expect(redFlagView({ active: false, items: [], clearedOn: '2026-11-07', clearNote: 'PT saw it Nov 6' }, catalog)).toEqual({
      active: false,
      cleared: 'Last cleared Saturday Nov 7: “PT saw it Nov 6”.',
    })
    expect(redFlagView({ active: false, items: [], clearedOn: '2026-11-07' }, catalog)).toEqual({ active: false, cleared: 'Last cleared Saturday Nov 7.' })
  })
})

describe('clearedSettings', () => {
  const flagged = settings({ redFlag: { active: true, since: '2026-11-04', items: ['locking'] } })
  it('refuses an empty note in the rule’s words and leaves the settings alone', () => {
    expect(clearedSettings(flagged, '   ', '2026-11-07')).toEqual({ ok: false, refusal: 'Not cleared: clearing the red-flag state needs a note.' })
    expect(flagged.redFlag.active).toBe(true)
  })
  it('clears with a trimmed note, dated today, touching nothing else', () => {
    const result = clearedSettings(flagged, '  PT saw it Nov 6: cleared to train  ', '2026-11-07')
    expect(result).toEqual({
      ok: true,
      settings: { ...flagged, redFlag: { active: false, items: [], clearedOn: '2026-11-07', clearNote: 'PT saw it Nov 6: cleared to train' } },
    })
  })
})

describe('errorWords', () => {
  it('turns a rejected write into words', () => {
    expect(errorWords(new Error('QuotaExceededError: storage is full'))).toBe('QuotaExceededError: storage is full')
    expect(errorWords('nope')).toBe('nope')
    expect(errorWords(new Error('  '))).toBe('no reason was given')
  })
})
