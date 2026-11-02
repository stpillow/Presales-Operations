import { describe, expect, it } from 'vitest'
import { PLANET_FITNESS_LOCATION_ID, type Location, type Workout } from '../schema/index.ts'
import { liftGym, swapCallAt } from './gymDay.ts'

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
