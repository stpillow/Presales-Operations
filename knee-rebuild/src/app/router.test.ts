import { describe, expect, it } from 'vitest'
import { parseHash, routeHash } from './router.ts'

describe('parseHash', () => {
  it('reads routes and session ids', () => {
    expect(parseHash('#/week')).toEqual({ name: 'week' })
    expect(parseHash('#/session/2026-11-03-p1-a')).toEqual({ name: 'session', workoutId: '2026-11-03-p1-a' })
    expect(parseHash('')).toEqual({ name: 'today' })
    expect(parseHash('#/nonsense')).toEqual({ name: 'today' })
  })
  it('lands on Today for a malformed escape instead of throwing', () => {
    expect(parseHash('#/session/%E0%A4%A')).toEqual({ name: 'today' })
    expect(parseHash('#/session/%')).toEqual({ name: 'today' })
  })
  it('round-trips a session route', () => {
    expect(parseHash(routeHash({ name: 'session', workoutId: 'a b/c' }))).toEqual({ name: 'session', workoutId: 'a b/c' })
  })
})
