import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { program } from '../program/program.ts'
import { PLANET_FITNESS_LOCATION_ID, type Location } from '../schema/index.ts'
import { db } from './db.ts'
import {
  addExtra,
  addLocation,
  archiveLocation,
  clearMarkOff,
  defaultSettings,
  ensureLocations,
  ensureSettings,
  getLocation,
  getLocations,
  getSettings,
  markOff,
  putWorkout,
  renameLocation,
  setActiveLocation,
  setDumbbellMax,
  setKit,
  setPresent,
  setWorkoutLocation,
  upsertSet,
} from './repo.ts'

// The gyms' writes (M4b): each one parses the row with Zod before it reaches IndexedDB.

beforeEach(async () => {
  await db.delete({ disableAutoOpen: false })
  await ensureSettings(defaultSettings(program))
  await ensureLocations(program, '2026-11-02')
})

async function hotel(startedFrom: Location['startedFrom'] = 'empty'): Promise<Location> {
  return addLocation({ name: 'Marriott Downtown', startedFrom, dumbbellMaxLb: 25, createdOn: '2026-11-10' }, program)
}

describe('adding and naming a gym', () => {
  it('adds a gym started empty or from Planet Fitness’s list, each with its own id', async () => {
    const empty = await hotel()
    expect(empty).toMatchObject({ id: 'loc-1', name: 'Marriott Downtown', present: [], dumbbellMaxLb: 25, startedFrom: 'empty', listVersion: program.equipmentListVersion, archived: false })
    const listed = await addLocation({ name: 'Airport hotel', startedFrom: 'planet-fitness', dumbbellMaxLb: 50, createdOn: '2026-11-11' }, program)
    expect(listed).toMatchObject({ id: 'loc-2', present: program.planetFitness })
    expect((await getLocations()).map((l) => l.id)).toEqual([PLANET_FITNESS_LOCATION_ID, 'loc-1', 'loc-2'])
  })

  it('refuses a name that is blank or over 60 characters, writing nothing', async () => {
    await expect(addLocation({ name: '   ', startedFrom: 'empty', dumbbellMaxLb: 0, createdOn: '2026-11-10' }, program)).rejects.toThrow()
    await expect(addLocation({ name: 'x'.repeat(61), startedFrom: 'empty', dumbbellMaxLb: 0, createdOn: '2026-11-10' }, program)).rejects.toThrow()
    expect(await db.locations.count()).toBe(1)
  })

  it('renames, trimmed; a blank name is refused and the old one kept', async () => {
    const gym = await hotel()
    expect(await renameLocation(gym.id, '  Marriott, 5th St  ')).toMatchObject({ name: 'Marriott, 5th St' })
    await expect(renameLocation(gym.id, ' ')).rejects.toThrow()
    expect((await getLocation(gym.id))?.name).toBe('Marriott, 5th St')
    await expect(renameLocation('loc-9', 'Nowhere')).rejects.toThrow('no location loc-9')
  })
})

describe('what is here', () => {
  it('marks items here and not here, and the dumbbell max', async () => {
    const gym = await hotel()
    await setPresent(gym.id, 'flat-bench', true)
    await setPresent(gym.id, 'smith-machine', true)
    await setPresent(gym.id, 'flat-bench', false)
    await setDumbbellMax(gym.id, 50)
    expect(await getLocation(gym.id)).toMatchObject({ present: ['smith-machine'], dumbbellMaxLb: 50 })
    await expect(setDumbbellMax(gym.id, -5)).rejects.toThrow()
    await expect(setDumbbellMax(gym.id, 52.5)).rejects.toThrow()
    expect((await getLocation(gym.id))?.dumbbellMaxLb).toBe(50)
  })

  it('a mark-off keeps its first day until “It’s back” clears it', async () => {
    await markOff(PLANET_FITNESS_LOCATION_ID, 'seated-leg-press', '2026-11-10')
    await markOff(PLANET_FITNESS_LOCATION_ID, 'seated-leg-press', '2026-11-12')
    expect((await getLocation(PLANET_FITNESS_LOCATION_ID))?.markedOff).toEqual([{ id: 'seated-leg-press', on: '2026-11-10' }])
    await clearMarkOff(PLANET_FITNESS_LOCATION_ID, 'seated-leg-press')
    expect((await getLocation(PLANET_FITNESS_LOCATION_ID))?.markedOff).toEqual([])
  })

  it('keeps typed extras once each, and refuses blank text', async () => {
    const gym = await hotel()
    expect(await addExtra(gym.id, ' Kettlebells ', '2026-11-12')).toEqual({ id: 'extra-1', text: 'Kettlebells', addedOn: '2026-11-12' })
    expect(await addExtra(gym.id, 'kettlebells', '2026-11-13')).toEqual({ id: 'extra-1', text: 'Kettlebells', addedOn: '2026-11-12' })
    await expect(addExtra(gym.id, '  ', '2026-11-13')).rejects.toThrow()
    expect((await getLocation(gym.id))?.extras).toHaveLength(1)
  })
})

describe('the active gym and the bag', () => {
  it('switches the active gym, refusing one that is not stored or is archived', async () => {
    const gym = await hotel()
    await setActiveLocation(gym.id)
    expect((await getSettings())?.activeLocationId).toBe(gym.id)
    await expect(setActiveLocation('loc-9')).rejects.toThrow()
    await archiveLocation(gym.id)
    await expect(setActiveLocation(gym.id)).rejects.toThrow()
    expect((await getSettings())?.activeLocationId).toBe(PLANET_FITNESS_LOCATION_ID)
  })

  it('archiving the active gym makes Planet Fitness active in the same write, and says it did', async () => {
    const gym = await hotel()
    const other = await addLocation({ name: 'Cabin', startedFrom: 'empty', dumbbellMaxLb: 0, createdOn: '2026-11-11' }, program)
    await setActiveLocation(gym.id)
    expect(await archiveLocation(other.id)).toEqual({ activeMovedHome: false })
    expect((await getSettings())?.activeLocationId).toBe(gym.id)
    expect(await archiveLocation(gym.id)).toEqual({ activeMovedHome: true })
    expect((await getSettings())?.activeLocationId).toBe(PLANET_FITNESS_LOCATION_ID)
    expect((await getLocation(gym.id))?.archived).toBe(true)
  })

  it('never archives Planet Fitness', async () => {
    await expect(archiveLocation(PLANET_FITNESS_LOCATION_ID)).rejects.toThrow()
    expect((await getLocation(PLANET_FITNESS_LOCATION_ID))?.archived).toBe(false)
  })

  it('sets the kit, each item once', async () => {
    await setKit(['mini-band'])
    expect((await getSettings())?.kit).toEqual(['mini-band'])
    await expect(setKit(['mini-band', 'mini-band'])).rejects.toThrow()
    expect((await getSettings())?.kit).toEqual(['mini-band'])
  })
})

describe('a session’s gym', () => {
  const workout = { id: '2026-11-10-p1-a', date: '2026-11-10', templateId: 'p1-a', phase: 1, week: 2, isDeload: false, status: 'in-progress' as const, locationId: PLANET_FITNESS_LOCATION_ID }

  it('changes until the first set is logged, then is locked', async () => {
    const gym = await hotel()
    await putWorkout(workout)
    await setWorkoutLocation(workout.id, gym.id)
    expect((await db.workouts.get(workout.id))?.locationId).toBe(gym.id)
    await upsertSet({ id: '', workoutId: workout.id, slotId: 'p1a-1', exerciseId: 'goblet-squat-bench', setNumber: 1, side: 'both', load: 25, loadUnit: 'lb', reps: 10, stopped: false })
    await expect(setWorkoutLocation(workout.id, PLANET_FITNESS_LOCATION_ID)).rejects.toThrow()
    expect((await db.workouts.get(workout.id))?.locationId).toBe(gym.id)
  })

  it('refuses a gym that is not stored or is archived', async () => {
    const gym = await hotel()
    await putWorkout(workout)
    await expect(setWorkoutLocation(workout.id, 'loc-9')).rejects.toThrow()
    await archiveLocation(gym.id)
    await expect(setWorkoutLocation(workout.id, gym.id)).rejects.toThrow()
    expect((await db.workouts.get(workout.id))?.locationId).toBe(PLANET_FITNESS_LOCATION_ID)
  })
})
