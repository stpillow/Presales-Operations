import type { IsoDate, Location, Workout } from '../schema/index.ts'
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

/**
 * The gym a run swap (elliptical or rower) logged for `date` was done at, by id (M4b review). One
 * logged for today is at the active gym, the one Today names. One logged for an earlier day is at
 * the gym picked on the logger for that day, else the gym that day's lift was stamped with, else the
 * active gym: a preset he can change, since the app keeps no record of which gym was active that
 * day. A pick belongs to the day it was made for, so moving the logger to another day gives that
 * day its own preset. A pick or a lift at a gym the lists no longer offer (`listed`) falls back to
 * the active gym.
 */
export function runSwapGym(input: {
  date: IsoDate
  today: IsoDate
  activeId: string
  /** The gyms the lists offer (`listedLocations`). */
  listed: readonly Pick<Location, 'id'>[]
  workouts: readonly Pick<Workout, 'date' | 'locationId'>[]
  /** A gym picked on the logger, with the day it was picked for, or null. */
  picked: { date: IsoDate; locationId: string } | null
}): string {
  if (input.date === input.today) return input.activeId
  const offered = (id: string | null | undefined): id is string => id != null && input.listed.some((l) => l.id === id)
  const picked = input.picked?.date === input.date ? input.picked.locationId : null
  if (offered(picked)) return picked
  const lift = input.workouts.find((w) => w.date === input.date)
  const liftId = lift ? locationIdOf(lift) : null
  return offered(liftId) ? liftId : input.activeId
}
