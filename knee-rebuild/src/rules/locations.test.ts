import { describe, expect, it } from 'vitest'
import { Location, PLANET_FITNESS_LOCATION_ID } from '../schema/index.ts'
import {
  activeAfterArchive,
  canArchive,
  gymLocked,
  inListOrder,
  listedLocations,
  locationIdOf,
  locationOrHome,
  newLocation,
  nextLocationId,
  withExtra,
  withMarkOff,
  withoutMarkOff,
  withPresent,
} from './locations.ts'

const home: Location = {
  id: PLANET_FITNESS_LOCATION_ID,
  name: 'Planet Fitness',
  present: ['smith-machine', 'seated-leg-press', 'mats'],
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
const lists = { planetFitness: ['smith-machine', 'seated-leg-press', 'mats', 'rower'], equipmentListVersion: 1 }

describe('which gym', () => {
  it('a workout with no gym stamped ran at Planet Fitness (every workout before M4b)', () => {
    expect(locationIdOf({})).toBe(PLANET_FITNESS_LOCATION_ID)
    expect(locationIdOf({ locationId: 'loc-1' })).toBe('loc-1')
  })

  it('finds a gym by id, archived or not, and falls back to Planet Fitness for an id with no row', () => {
    const all = [home, hotel, cabin]
    expect(locationOrHome(all, 'loc-1')).toBe(hotel)
    expect(locationOrHome(all, 'loc-2')).toBe(cabin)
    expect(locationOrHome(all, 'loc-9')).toBe(home)
    expect(locationOrHome(all, undefined)).toBe(home)
    expect(locationOrHome([hotel], 'loc-9')).toBeNull()
    expect(locationOrHome([], null)).toBeNull()
  })

  it('lists Planet Fitness first, then by the day each gym was made; the lists leave archived gyms out', () => {
    const later = { ...hotel, id: 'loc-3', name: 'Airport', createdOn: '2026-11-10' }
    expect(inListOrder([hotel, cabin, later, home]).map((l) => l.id)).toEqual(['planet-fitness', 'loc-2', 'loc-3', 'loc-1'])
    expect(listedLocations([hotel, cabin, later, home]).map((l) => l.id)).toEqual(['planet-fitness', 'loc-3', 'loc-1'])
  })
})

describe('a new gym', () => {
  it('takes the next free id', () => {
    expect(nextLocationId([])).toBe('loc-1')
    expect(nextLocationId(['planet-fitness', 'loc-1', 'loc-3'])).toBe('loc-2')
  })

  it('started from Planet Fitness’s list has that list and nothing added; started empty has nothing', () => {
    const fromList = newLocation('loc-1', { name: '  Marriott Downtown ', startedFrom: 'planet-fitness', dumbbellMaxLb: 25, createdOn: '2026-11-10' }, lists)
    expect(Location.parse(fromList)).toEqual({ ...fromList, name: 'Marriott Downtown' })
    expect(fromList).toMatchObject({ id: 'loc-1', present: lists.planetFitness, dumbbellMaxLb: 25, startedFrom: 'planet-fitness', listVersion: 1, extras: [], markedOff: [], createdOn: '2026-11-10', archived: false })
    expect(fromList.present).not.toBe(lists.planetFitness)
    expect(newLocation('loc-2', { name: 'Cabin', startedFrom: 'empty', dumbbellMaxLb: 0, createdOn: '2026-11-10' }, lists).present).toEqual([])
  })
})

describe('marking what is here', () => {
  it('here adds the item once, at the end, and clears a mark-off of it', () => {
    const marked = { ...hotel, markedOff: [{ id: 'flat-bench', on: '2026-11-12' }] }
    expect(withPresent(hotel, 'smith-machine', true).present).toEqual(['flat-bench', 'smith-machine'])
    expect(withPresent(hotel, 'flat-bench', true)).toEqual(hotel)
    expect(withPresent(marked, 'flat-bench', true)).toEqual(hotel)
  })

  it('not here removes the item and any mark-off of it, so no “It’s back” is left for an item the list lacks', () => {
    const marked = { ...hotel, markedOff: [{ id: 'flat-bench', on: '2026-11-12' }] }
    expect(withPresent(marked, 'flat-bench', false)).toMatchObject({ present: [], markedOff: [] })
    expect(withPresent(hotel, 'smith-machine', false)).toEqual(hotel)
  })

  it('a mark-off keeps the day it was first made, and “It’s back” clears it', () => {
    const once = withMarkOff(home, 'seated-leg-press', '2026-11-10')
    expect(once.markedOff).toEqual([{ id: 'seated-leg-press', on: '2026-11-10' }])
    expect(once.present).toEqual(home.present)
    expect(withMarkOff(once, 'seated-leg-press', '2026-11-12')).toEqual(once)
    expect(withoutMarkOff(once, 'seated-leg-press')).toEqual(home)
    expect(withoutMarkOff(home, 'mats')).toEqual(home)
  })

  it('does not change the gym it was given', () => {
    const copy = structuredClone(hotel)
    withPresent(hotel, 'smith-machine', true)
    withMarkOff(hotel, 'flat-bench', '2026-11-12')
    withExtra(hotel, 'kettlebells', '2026-11-12')
    expect(hotel).toEqual(copy)
  })
})

describe('something else here', () => {
  it('keeps typed text as an extra, trimmed, with the next free id and the day', () => {
    const one = withExtra(hotel, '  Kettlebells ', '2026-11-12')
    expect(one.extra).toEqual({ id: 'extra-1', text: 'Kettlebells', addedOn: '2026-11-12' })
    expect(one.location.extras).toEqual([one.extra])
    const two = withExtra(one.location, 'Battle ropes', '2026-11-13')
    expect(two.location.extras.map((e) => e.id)).toEqual(['extra-1', 'extra-2'])
  })

  it('the same thing typed again, in any case or punctuation, is the one already kept', () => {
    const one = withExtra(hotel, 'Kettlebells', '2026-11-12')
    const again = withExtra(one.location, ' KETTLEBELLS! ', '2026-11-20')
    expect(again.location).toEqual(one.location)
    expect(again.extra).toEqual(one.extra)
    expect(withExtra(one.location, 'kettle bells', '2026-11-20').location.extras).toHaveLength(2)
  })
})

describe('archiving and the active gym', () => {
  it('archiving the active gym makes Planet Fitness active; archiving another leaves the active one', () => {
    expect(activeAfterArchive('loc-1', 'loc-1')).toBe(PLANET_FITNESS_LOCATION_ID)
    expect(activeAfterArchive('loc-1', 'loc-2')).toBe('loc-1')
    expect(activeAfterArchive(PLANET_FITNESS_LOCATION_ID, 'loc-2')).toBe(PLANET_FITNESS_LOCATION_ID)
  })

  it('Planet Fitness is never archived: it is where everything falls back to', () => {
    expect(canArchive(PLANET_FITNESS_LOCATION_ID)).toBe(false)
    expect(canArchive('loc-1')).toBe(true)
  })

  it('a session’s gym locks at its first set (Shawn’s Nov 1 answer 10)', () => {
    expect(gymLocked(0)).toBe(false)
    expect(gymLocked(1)).toBe(true)
  })
})
