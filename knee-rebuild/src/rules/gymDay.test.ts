import { describe, expect, it } from 'vitest'
import { PLANET_FITNESS_LOCATION_ID, type Location, type Workout } from '../schema/index.ts'
import { liftGym, runSwapGym, swapCallAt } from './gymDay.ts'

const home: Location = {
  id: PLANET_FITNESS_LOCATION_ID,
  name: 'Planet Fitness',
  present: ['smith-machine', 'seated-leg-press', 'elliptical', 'rower'],
  dumbbellMaxLb: 80,
  startedFrom: 'planet-fitness',
  listVersion: 1,
  extras: [],
  markedOff: [],
  createdOn: '2026-11-02',
  archived: false,
}
const hotel: Location = { ...home, id: 'loc-1', name: 'Marriott Downtown', present: ['flat-bench'], dumbbellMaxLb: 25, startedFrom: 'empty', createdOn: '2026-11-10' }
const cabin: Location = { ...home, id: 'loc-2', name: 'Cabin', present: [], dumbbellMaxLb: 0, startedFrom: 'empty', createdOn: '2026-11-08', archived: true }

const session = (status: Workout['status'], locationId?: string): Pick<Workout, 'status' | 'locationId'> => ({ status, ...(locationId ? { locationId } : {}) })

describe('the gym a day’s lift runs at', () => {
  it('a session started (open, or left early and resumable) stays at the gym stamped at Start', () => {
    expect(liftGym(session('in-progress', 'loc-1'), home, [home, hotel]).id).toBe('loc-1')
    expect(liftGym(session('abandoned', 'loc-1'), home, [home, hotel]).id).toBe('loc-1')
  })
  it('an archived gym is still where its session ran', () => {
    expect(liftGym(session('in-progress', 'loc-2'), home, [home, cabin]).id).toBe('loc-2')
  })
  it('a session stamped with no gym (every workout before M4b) ran at Planet Fitness, whatever is active now', () => {
    expect(liftGym(session('in-progress'), hotel, [home, hotel]).id).toBe(PLANET_FITNESS_LOCATION_ID)
  })
  it('a session still to start, or finished, is the active gym’s (Shawn’s Nov 1 answer 9)', () => {
    expect(liftGym(null, hotel, [home, hotel]).id).toBe('loc-1')
    expect(liftGym(session('finished', PLANET_FITNESS_LOCATION_ID), hotel, [home, hotel]).id).toBe('loc-1')
    expect(liftGym(session('planned', PLANET_FITNESS_LOCATION_ID), hotel, [home, hotel]).id).toBe('loc-1')
  })
  it('a stamped gym with no row and no Planet Fitness row falls back to the active gym', () => {
    expect(liftGym(session('in-progress', 'loc-9'), hotel, [hotel]).id).toBe('loc-1')
  })
})

describe('a hold or back-off morning’s swap call at a gym', () => {
  const swap = { swapSuggested: true }
  it('takes the first swap whose machine is here: the elliptical, then the rower', () => {
    expect(swapCallAt(swap, new Set(['elliptical', 'rower']))).toEqual({ kind: 'take', type: 'elliptical-swap' })
    expect(swapCallAt(swap, new Set(['rower']))).toEqual({ kind: 'take', type: 'rower-swap' })
  })
  it('with neither machine here, suggests nothing: he picks (Shawn’s Nov 1 answer 7)', () => {
    expect(swapCallAt(swap, new Set(['treadmill']))).toEqual({ kind: 'neither' })
  })
  it('no call when the engine suggests no swap, or nothing at all', () => {
    expect(swapCallAt({ swapSuggested: false }, new Set(['elliptical']))).toBeNull()
    expect(swapCallAt(null, new Set(['elliptical']))).toBeNull()
  })
})

describe('the gym a run swap was done at (M4b review)', () => {
  const lift = (date: string, locationId?: string): Pick<Workout, 'date' | 'locationId'> => ({ date, ...(locationId ? { locationId } : {}) })
  const base = { today: '2026-11-10', activeId: PLANET_FITNESS_LOCATION_ID, listed: [home, hotel], picked: null }

  it('a swap logged for today is at the active gym, the one Today names', () => {
    expect(runSwapGym({ ...base, date: '2026-11-10', workouts: [lift('2026-11-10', 'loc-1')] })).toBe(PLANET_FITNESS_LOCATION_ID)
    // A gym picked for another day doesn't follow the form back to today.
    expect(runSwapGym({ ...base, date: '2026-11-10', workouts: [], picked: { date: '2026-11-09', locationId: 'loc-1' } })).toBe(PLANET_FITNESS_LOCATION_ID)
  })
  it('a back-dated swap on a day whose lift ran at another gym is preset to that gym', () => {
    expect(runSwapGym({ ...base, date: '2026-11-09', workouts: [lift('2026-11-08'), lift('2026-11-09', 'loc-1')] })).toBe('loc-1')
  })
  it('a back-dated swap on a day with no lift is preset to the active gym; a gym picked on the logger wins either way', () => {
    expect(runSwapGym({ ...base, date: '2026-11-09', workouts: [lift('2026-11-10', 'loc-1')] })).toBe(PLANET_FITNESS_LOCATION_ID)
    expect(runSwapGym({ ...base, date: '2026-11-09', workouts: [], picked: { date: '2026-11-09', locationId: 'loc-1' } })).toBe('loc-1')
    expect(runSwapGym({ ...base, date: '2026-11-09', workouts: [lift('2026-11-09', 'loc-1')], picked: { date: '2026-11-09', locationId: PLANET_FITNESS_LOCATION_ID } })).toBe(PLANET_FITNESS_LOCATION_ID)
  })
  it('a gym picked for one earlier day stays with that day: another day the logger moves to gets its own preset', () => {
    // Planet Fitness tapped for Sunday, then the logger moved to Monday, whose lift ran at the hotel.
    expect(runSwapGym({ ...base, date: '2026-11-09', workouts: [lift('2026-11-09', 'loc-1')], picked: { date: '2026-11-08', locationId: PLANET_FITNESS_LOCATION_ID } })).toBe('loc-1')
    // And back on Sunday, the tap stands.
    expect(runSwapGym({ ...base, date: '2026-11-08', workouts: [lift('2026-11-08', 'loc-1')], picked: { date: '2026-11-08', locationId: PLANET_FITNESS_LOCATION_ID } })).toBe(PLANET_FITNESS_LOCATION_ID)
  })
  it('a pick or a lift at a gym the lists no longer offer (archived) falls back to the active gym', () => {
    expect(runSwapGym({ ...base, date: '2026-11-09', workouts: [lift('2026-11-09', 'loc-2')] })).toBe(PLANET_FITNESS_LOCATION_ID)
    expect(runSwapGym({ ...base, date: '2026-11-09', workouts: [], picked: { date: '2026-11-09', locationId: 'loc-2' } })).toBe(PLANET_FITNESS_LOCATION_ID)
  })
})
