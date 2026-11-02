import { describe, expect, it } from 'vitest'
import type { BackupSummary } from '../rules/backup.ts'
import type { SessionMove, Settings } from '../schema/index.ts'
import {
  DUMBBELLS_LINE,
  IMPORT_CONFIRM,
  PHASE_NOTE,
  exportedOnWords,
  holdsLine,
  holdsWords,
  importedWords,
  lastExportWords,
  lostWords,
  migratedWords,
  rangeWords,
  shareFailure,
  shareRoute,
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
  resetWords,
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
  activeLocationId: 'planet-fitness',
  kit: ['ankle-strap', 'mini-band'],
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
  it('keeps the rest step sizes from the brief', () => {
    expect(REST_STEP).toBe(15)
    expect(REST_MIN).toBe(15)
  })
})

describe('dumbbells (M4b)', () => {
  it("points at Where you train, where each gym's rack is set", () => {
    expect(DUMBBELLS_LINE).toBe('Dumbbells are set per gym in Where you train.')
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
  it('says the phase is read-only here and that the Gates screen advances it, not a milestone still to come', () => {
    expect(PHASE_NOTE).toBe('Read-only here. The Gates screen advances the phase once every item of its gate passes and you confirm.')
    expect(PHASE_NOTE).not.toMatch(/\bM\d/)
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
  it('keeps the last export, the gym and the bag (M6: clearing is not a reset)', () => {
    const later = settings({ redFlag: { active: true, since: '2026-11-04', items: ['locking'] }, activeLocationId: 'loc-1', kit: ['ankle-strap'], lastExportedAt: '2026-11-05T23:00:00.000Z' })
    const result = clearedSettings(later, 'PT saw it Nov 6', '2026-11-07')
    expect(result).toMatchObject({ ok: true, settings: { activeLocationId: 'loc-1', kit: ['ankle-strap'], lastExportedAt: '2026-11-05T23:00:00.000Z', redFlag: { active: false } } })
  })
})

describe('errorWords', () => {
  it('turns a rejected write into words', () => {
    expect(errorWords(new Error('QuotaExceededError: storage is full'))).toBe('QuotaExceededError: storage is full')
    expect(errorWords('nope')).toBe('nope')
    expect(errorWords(new Error('  '))).toBe('no reason was given')
  })
})

describe('resetWords', () => {
  it('says what Reset all data came to in one sentence, for the Reset section where Yes was tapped, and whether it is a problem', () => {
    expect(resetWords({ kind: 'erased' })).toEqual({ text: 'Everything on this phone was erased. Settings are back to their defaults.', problem: false })
    expect(resetWords({ kind: 'not-erased', error: new Error('QuotaExceededError') })).toEqual({ text: 'Nothing was erased (QuotaExceededError); tap again to retry.', problem: true })
    expect(resetWords({ kind: 'not-seeded', error: new Error('  ') })).toEqual({
      text: 'Everything was erased, but the default settings did not save (no reason was given); reload the app to seed them again.',
      problem: true,
    })
  })
})

describe('backup words (M6)', () => {
  const summary = (over: Partial<BackupSummary> = {}): BackupSummary => ({
    counts: { workouts: 24, setLogs: 312, morningChecks: 30, runs: 41, gateTests: 2, sessionMoves: 1, locations: 3, programOverrides: 0 },
    archivedGyms: 0,
    first: '2026-11-02',
    last: '2026-12-20',
    ...over,
  })

  it('says when the last export was, in New York days', () => {
    expect(lastExportWords(undefined, '2026-11-20')).toBe('No export from this phone yet.')
    expect(lastExportWords('2026-11-20T15:00:00.000Z', '2026-11-20')).toBe('Last export: today.')
    // 10:30 pm on Nov 19 in New York: yesterday on the 20th, though it is the 20th in UTC.
    expect(lastExportWords('2026-11-20T03:30:00.000Z', '2026-11-20')).toBe('Last export: yesterday.')
    expect(lastExportWords('2026-11-11T15:00:00.000Z', '2026-11-20')).toBe('Last export: 9 days ago.')
    expect(exportedOnWords('2026-12-22T02:00:00.000Z')).toBe('Monday Dec 21')
  })

  it('says what a file holds as the brief has it, then the rest', () => {
    expect(holdsWords(summary())).toEqual({
      headline: '312 sets, 41 runs, 3 gyms, from Nov 2 to Dec 20',
      also: 'Also 24 sessions, 30 morning checks, 2 gate tests and 1 session move.',
    })
    const one = summary({ counts: { workouts: 1, setLogs: 1, morningChecks: 0, runs: 1, gateTests: 0, sessionMoves: 0, locations: 2, programOverrides: 3 }, archivedGyms: 1, first: '2026-11-03', last: '2026-11-03' })
    expect(holdsWords(one)).toEqual({ headline: '1 set, 1 run, 1 gym, on Nov 3', also: 'Also 1 session, 3 Program edits and 1 archived gym.' })
    const empty = summary({ counts: { workouts: 0, setLogs: 0, morningChecks: 0, runs: 0, gateTests: 0, sessionMoves: 0, locations: 1, programOverrides: 0 }, first: null, last: null })
    expect(holdsWords(empty)).toEqual({ headline: '0 sets, 0 runs, 1 gym; nothing logged yet', also: null })
  })

  it('says what a file holds as one sentence, and what an import did, by the file’s name', () => {
    expect(holdsLine(summary())).toBe('312 sets, 41 runs, 3 gyms, from Nov 2 to Dec 20. Also 24 sessions, 30 morning checks, 2 gate tests and 1 session move.')
    const empty = summary({ counts: { workouts: 0, setLogs: 0, morningChecks: 0, runs: 0, gateTests: 0, sessionMoves: 0, locations: 1, programOverrides: 0 }, first: null, last: null })
    expect(holdsLine(empty)).toBe('0 sets, 0 runs, 1 gym; nothing logged yet.')
    expect(importedWords('knee-rebuild-2026-12-20.json', summary())).toBe(
      'Imported knee-rebuild-2026-12-20.json. This phone now holds what the file holds: 312 sets, 41 runs, 3 gyms, from Nov 2 to Dec 20. Also 24 sessions, 30 morning checks, 2 gate tests and 1 session move.',
    )
  })

  it('names the years only when the range crosses one', () => {
    expect(rangeWords('2026-12-28', '2027-01-03')).toBe('from Dec 28, 2026 to Jan 3, 2027')
    expect(rangeWords('2026-11-02', '2026-11-02')).toBe('on Nov 2')
    expect(rangeWords(null, null)).toBeNull()
  })

  it('names what an import would erase, or nothing', () => {
    expect(lostWords([])).toBeNull()
    expect(lostWords([{ table: 'setLogs', count: 8 }])).toBe('It would erase 8 sets on this phone that the file doesn’t have.')
    expect(lostWords([{ table: 'workouts', count: 1 }, { table: 'setLogs', count: 8 }, { table: 'runs', count: 1 }])).toBe(
      'It would erase 1 session, 8 sets and 1 run on this phone that the file doesn’t have.',
    )
    expect(IMPORT_CONFIRM).toBe('Replace everything on this phone with this file?')
  })

  it('says when a file was read forward from an older version', () => {
    expect(migratedWords(null)).toBeNull()
    expect(migratedWords(2)).toBe('Written by an older version of the app (schema version 2); it was read forward to this one.')
  })

  it('shares through the share sheet only where it takes a file, else offers a download link', () => {
    const file = new File(['{}'], 'knee-rebuild-2026-12-20.json', { type: 'application/json' })
    expect(shareRoute(undefined, file)).toBe('download')
    expect(shareRoute({}, file)).toBe('download')
    // An older share sheet that shares links but no files.
    expect(shareRoute({ share: () => Promise.resolve() }, file)).toBe('download')
    expect(shareRoute({ share: () => Promise.resolve(), canShare: () => false }, file)).toBe('download')
    expect(shareRoute({ share: () => Promise.resolve(), canShare: () => { throw new TypeError('no') } }, file)).toBe('download')
    expect(shareRoute({ share: () => Promise.resolve(), canShare: (data) => data.files[0] === file }, file)).toBe('share')
  })

  it('tells a closed share sheet from one that wants a fresh tap or failed', () => {
    expect(shareFailure(new DOMException('cancelled', 'AbortError'))).toBe('closed')
    expect(shareFailure(new DOMException('no activation', 'NotAllowedError'))).toBe('needs-tap')
    expect(shareFailure(new DOMException('bad', 'DataError'))).toBe('failed')
    expect(shareFailure('nope')).toBe('failed')
  })
})
