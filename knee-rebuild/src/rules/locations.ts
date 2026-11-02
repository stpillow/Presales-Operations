import { PLANET_FITNESS_LOCATION_ID, type EquipmentId, type IsoDate, type Location, type Workout } from '../schema/index.ts'
import { normalizeTyped } from './equipment.ts'

/*
 * The gyms as stored (M4b, design sections 2 and 5): which one a workout ran at, the order the
 * lists show them in, and what each edit in the location editor, the runner and Today does to a
 * gym's row. Pure: src/db/repo.ts reads the row, asks these, parses the result and writes it.
 */

/** The gym a workout ran at: the one stamped at Start, or with none (every workout before M4b), Planet Fitness. */
export function locationIdOf(workout: Pick<Workout, 'locationId'>): string {
  return workout.locationId ?? PLANET_FITNESS_LOCATION_ID
}

/**
 * The stored gym with this id, archived or not (workouts point at archived gyms); for an id with no
 * row, or none given, Planet Fitness's row. Null only when neither is stored (before ensureLocations).
 */
export function locationOrHome(locations: readonly Location[], id: string | null | undefined): Location | null {
  return locations.find((l) => l.id === id) ?? locations.find((l) => l.id === PLANET_FITNESS_LOCATION_ID) ?? null
}

/** Every gym in the order the lists show them: Planet Fitness first, then by the day each was made, then by name. */
export function inListOrder(locations: readonly Location[]): Location[] {
  const home = (l: Location) => (l.id === PLANET_FITNESS_LOCATION_ID ? 0 : 1)
  return [...locations].sort((a, b) => home(a) - home(b) || a.createdOn.localeCompare(b.createdOn) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

/** The gyms a list offers (Today's Change, the runner's, Where you train): archived ones leave it, in list order. */
export function listedLocations(locations: readonly Location[]): Location[] {
  return inListOrder(locations.filter((l) => !l.archived))
}

/** A new gym's id: `loc-` and the lowest number not taken. Ids never come from the name, which can change. */
export function nextLocationId(taken: readonly string[]): string {
  let n = 1
  while (taken.includes(`loc-${n}`)) n += 1
  return `loc-${n}`
}

export interface NewLocationInput {
  name: string
  /** "Start from Planet Fitness's list" (preselected in the editor) or "Start empty". */
  startedFrom: Location['startedFrom']
  /** Heaviest dumbbell on the rack, in lb; 0 means none. */
  dumbbellMaxLb: number
  createdOn: IsoDate
}

/**
 * A gym as first saved: started from Planet Fitness's list it has that list and nothing more (no
 * 45° press assumed, PROGRAM-QUESTIONS 71; only the home gym adds Shawn's club's extras), started
 * empty it has nothing. Its list version is the program's, so items added later read as new to it.
 */
export function newLocation(id: string, input: NewLocationInput, lists: { planetFitness: readonly EquipmentId[]; equipmentListVersion: number }): Location {
  return {
    id,
    name: input.name.trim(),
    present: input.startedFrom === 'planet-fitness' ? [...new Set(lists.planetFitness)] : [],
    dumbbellMaxLb: input.dumbbellMaxLb,
    startedFrom: input.startedFrom,
    listVersion: lists.equipmentListVersion,
    extras: [],
    markedOff: [],
    createdOn: input.createdOn,
    archived: false,
  }
}

/**
 * The editor's Tap and the runner's "Mark … here": here adds the item (once, at the end); not here
 * removes it. Either way a mark-off of the item goes, so "here" means here (a mark-off beats the
 * list, PROGRAM-QUESTIONS 75) and "not here" leaves no "It's back" for an item the list no longer has.
 */
export function withPresent(location: Location, itemId: EquipmentId, here: boolean): Location {
  const present = location.present.filter((id) => id !== itemId)
  return {
    ...location,
    present: here ? [...present, itemId] : present,
    markedOff: location.markedOff.filter((m) => m.id !== itemId),
  }
}

/** "Smith machine isn't here: mark it": marked not here since `on`. Marked again, it keeps the first day. */
export function withMarkOff(location: Location, itemId: EquipmentId, on: IsoDate): Location {
  if (location.markedOff.some((m) => m.id === itemId)) return location
  return { ...location, markedOff: [...location.markedOff, { id: itemId, on }] }
}

/** "It's back": the mark-off goes and the gym's list says again whether the item is here. */
export function withoutMarkOff(location: Location, itemId: EquipmentId): Location {
  return { ...location, markedOff: location.markedOff.filter((m) => m.id !== itemId) }
}

export type Extra = Location['extras'][number]

/**
 * "Something else here?" kept as typed (design section 6): trimmed, with the next free id and the
 * day. Text that reads the same as one already kept (`normalizeTyped`: case, accents, punctuation)
 * is that one, so typing it twice keeps it once.
 */
export function withExtra(location: Location, text: string, addedOn: IsoDate): { location: Location; extra: Extra } {
  const typed = normalizeTyped(text)
  const kept = location.extras.find((e) => normalizeTyped(e.text) === typed)
  if (kept) return { location, extra: kept }
  const taken = new Set(location.extras.map((e) => e.id))
  let n = 1
  while (taken.has(`extra-${n}`)) n += 1
  const extra: Extra = { id: `extra-${n}`, text: text.trim(), addedOn }
  return { location: { ...location, extras: [...location.extras, extra] }, extra }
}

/** Archiving the active gym returns to Planet Fitness (design section 5); archiving another leaves the active one. */
export function activeAfterArchive(activeId: string, archivedId: string): string {
  return activeId === archivedId ? PLANET_FITNESS_LOCATION_ID : activeId
}

/** Planet Fitness is never archived: an unstamped workout and an archived active gym both fall back to it. */
export function canArchive(locationId: string): boolean {
  return locationId !== PLANET_FITNESS_LOCATION_ID
}

/** A session's gym can change only until its first set is logged (Shawn's Nov 1 answer 10), so logged loads never change gyms. */
export function gymLocked(setsLogged: number): boolean {
  return setsLogged > 0
}
