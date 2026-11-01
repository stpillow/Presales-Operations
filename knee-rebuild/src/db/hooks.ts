import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db.ts'
import { getSettings, loadHistory, type History } from './repo.ts'
import type { SetLog, Settings, Workout } from '../schema/index.ts'

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
