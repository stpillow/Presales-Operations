import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db.ts'
import { getLocations, getSettings, loadHistory, type History } from './repo.ts'
import { locationOrHome } from '../rules/locations.ts'
import type { Location, SetLog, Settings, Workout } from '../schema/index.ts'

/** Undefined while loading; null when no settings row exists yet. */
export function useSettings(): Settings | null | undefined {
  return useLiveQuery(async () => (await getSettings()) ?? null, [])
}

export function useWorkout(id: string | null): Workout | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.workouts.get(id)) ?? null) : null), [id])
}

export function useSetsFor(workoutId: string | null): SetLog[] | undefined {
  return useLiveQuery(async () => (workoutId ? db.setLogs.where('workoutId').equals(workoutId).toArray() : []), [workoutId])
}

/** The whole history, re-read whenever any table changes. */
export function useHistory(): History | undefined {
  return useLiveQuery(() => loadHistory(), [])
}

/** Every stored gym, archived ones included, Planet Fitness first; `listedLocations` (src/rules/locations.ts) gives the ones a list offers. Undefined while loading. */
export function useLocations(): Location[] | undefined {
  return useLiveQuery(() => getLocations(), [])
}

/**
 * The gym with this id, archived or not, or Planet Fitness's row for an id with no row (or none
 * given): the runner reads a workout's gym with `locationIdOf(workout)`. Undefined while loading;
 * null when not even Planet Fitness is stored yet.
 */
export function useLocation(id: string | null | undefined): Location | null | undefined {
  return useLiveQuery(async () => locationOrHome(await getLocations(), id), [id])
}

/** The gym Today plans for (`Settings.activeLocationId`, falling back to Planet Fitness). Undefined while loading; null before the home gym is stored. */
export function useActiveLocation(): Location | null | undefined {
  return useLiveQuery(async () => {
    const [settings, locations] = await Promise.all([getSettings(), getLocations()])
    return settings ? locationOrHome(locations, settings.activeLocationId) : null
  }, [])
}
