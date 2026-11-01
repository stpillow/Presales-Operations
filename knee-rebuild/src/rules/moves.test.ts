import { describe, expect, it } from 'vitest'
import type { SessionMove } from '../schema/index.ts'
import { dayMovable, loggedOn, moveAllowed, undoableMove, type MoveContext } from './moves.ts'

// Start Monday Nov 2 2026: week 1 runs Nov 2 (Mon) to Nov 8 (Sun).
const base: MoveContext = { startDate: '2026-11-02', week: 1, currentWeek: 1, runs: [], workouts: [] }

describe('loggedOn', () => {
  it('counts runs and any workout that was started', () => {
    expect(loggedOn('2026-11-03', [{ date: '2026-11-03' }], [])).toBe(true)
    expect(loggedOn('2026-11-03', [], [{ date: '2026-11-03', status: 'finished' }])).toBe(true)
    expect(loggedOn('2026-11-03', [], [{ date: '2026-11-03', status: 'abandoned' }])).toBe(true)
    expect(loggedOn('2026-11-03', [], [{ date: '2026-11-03', status: 'in-progress' }])).toBe(true)
  })
  it('ignores planned workouts and other dates', () => {
    expect(loggedOn('2026-11-03', [{ date: '2026-11-04' }], [{ date: '2026-11-03', status: 'planned' }])).toBe(false)
  })
})

describe('dayMovable', () => {
  it('allows an empty day in the current or a later week', () => {
    expect(dayMovable(base, 'tue')).toEqual({ allowed: true })
    expect(dayMovable({ ...base, week: 3 }, 'tue')).toEqual({ allowed: true })
  })
  it('allows a missed day with nothing logged, so a missed session can be made up', () => {
    expect(dayMovable({ ...base, currentWeek: 1 }, 'mon')).toEqual({ allowed: true })
  })
  it('refuses a day with a finished session, so Today never offers it twice', () => {
    const ctx = { ...base, workouts: [{ date: '2026-11-03', status: 'finished' as const }] }
    const v = dayMovable(ctx, 'tue')
    expect(v.allowed).toBe(false)
    expect(v.allowed ? '' : v.reason).toContain('Tuesday')
  })
  it('refuses a day with a session still open', () => {
    expect(dayMovable({ ...base, workouts: [{ date: '2026-11-05', status: 'in-progress' }] }, 'thu').allowed).toBe(false)
  })
  it('refuses a day with a run logged', () => {
    expect(dayMovable({ ...base, runs: [{ date: '2026-11-08' }] }, 'sun').allowed).toBe(false)
  })
  it('refuses every day of a finished week', () => {
    const v = dayMovable({ ...base, week: 1, currentWeek: 2 }, 'sat')
    expect(v).toEqual({ allowed: false, reason: 'That week is over; its days stay as they happened.' })
  })
  it('allows moves before the program starts', () => {
    expect(dayMovable({ ...base, currentWeek: 0 }, 'tue')).toEqual({ allowed: true })
  })
})

describe('moveAllowed', () => {
  it('needs two different days', () => {
    expect(moveAllowed(base, 'tue', 'tue').allowed).toBe(false)
  })
  it('needs both days free', () => {
    const ctx = { ...base, workouts: [{ date: '2026-11-03', status: 'finished' as const }] }
    expect(moveAllowed(ctx, 'tue', 'thu').allowed).toBe(false)
    expect(moveAllowed(ctx, 'thu', 'tue').allowed).toBe(false)
    expect(moveAllowed(ctx, 'thu', 'sat')).toEqual({ allowed: true })
  })
})

describe('undoableMove', () => {
  const moves: SessionMove[] = [
    { id: 'move-000001', week: 1, dayA: 'tue', dayB: 'wed' },
    { id: 'move-000002', week: 1, dayA: 'thu', dayB: 'sat' },
    { id: 'move-000003', week: 2, dayA: 'tue', dayB: 'thu' },
  ]
  it('offers only the latest move of the week', () => {
    expect(undoableMove(base, moves)).toBe('move-000002')
    expect(undoableMove({ ...base, week: 2 }, moves)).toBe('move-000003')
  })
  it('skips moves of a day onto itself', () => {
    expect(undoableMove(base, [...moves, { id: 'move-000004', week: 1, dayA: 'fri', dayB: 'fri' }])).toBe('move-000002')
  })
  it('offers nothing once either day of the latest move has something logged', () => {
    expect(undoableMove({ ...base, workouts: [{ date: '2026-11-07', status: 'finished' }] }, moves)).toBeNull()
  })
  it('offers nothing in a finished week or a week without moves', () => {
    expect(undoableMove({ ...base, currentWeek: 2 }, moves)).toBeNull()
    expect(undoableMove({ ...base, week: 5 }, moves)).toBeNull()
  })
})
