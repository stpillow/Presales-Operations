import type { Location, Workout } from '../schema/index.ts'
import { suggestedRunSwap, type Available, type RunSwapType } from './equipment.ts'
import { locationIdOf, locationOrHome } from './locations.ts'

/*
 * Where the day's training happens (M4b, design sections 5 and 7): the gym the day's lift runs at,
 * and what a hold or back-off morning's swap call comes to at a gym. Today and the run logger ask
 * these; nothing on screen decides either.
 */

/**
 * The gym the day's lift runs at: a session already started (open, or left early and resumable)
 * stays at the gym stamped at Start (`locationIdOf`: none means Planet Fitness), archived or not;
 * one still to start, or finished, is the active gym's (Shawn's Nov 1 answer 9: an away gym stays
 * active until he changes it). The runner plans at the same stamped gym.
 */
export function liftGym(workout: Pick<Workout, 'status' | 'locationId'> | null, active: Location, locations: readonly Location[]): Location {
  if (workout && (workout.status === 'in-progress' || workout.status === 'abandoned')) return locationOrHome(locations, locationIdOf(workout)) ?? active
  return active
}

export type SwapCall = { kind: 'take'; type: RunSwapType } | { kind: 'neither' }

/**
 * What a hold or back-off morning's swap call comes to at a gym: `take` the first swap whose machine
 * is here, elliptical then rower (`suggestedRunSwap`), or `neither`, when nothing is suggested and
 * he picks (Shawn's Nov 1 answer 7). Null when the engine calls for no swap.
 */
export function swapCallAt(suggestion: { swapSuggested: boolean } | null, available: Available): SwapCall | null {
  if (!suggestion?.swapSuggested) return null
  const type = suggestedRunSwap(available)
  return type ? { kind: 'take', type } : { kind: 'neither' }
}
