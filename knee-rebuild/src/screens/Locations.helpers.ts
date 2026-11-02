import type { Available, ChecklistGroup } from '../rules/equipment.ts'
import { canArchive, listedLocations } from '../rules/locations.ts'
import { checklistNotHere } from '../rules/whereYouTrain.ts'
import type { Location } from '../schema/index.ts'

/*
 * Where you train (`#/locations`, M4b): each gym the lists offer in words. Wording only; what a
 * gym lacks comes from src/rules/whereYouTrain.ts, which gyms are listed and which can be archived
 * from src/rules/locations.ts.
 */

/** A gym's rack in words: "Dumbbells to 80 lb", or "No dumbbells" for a max of 0. */
export function rackWords(dumbbellMaxLb: number): string {
  return dumbbellMaxLb > 0 ? `Dumbbells to ${dumbbellMaxLb} lb` : 'No dumbbells'
}

/** How many of the checklist's items aren't here: "1 not here", "3 not here", or "everything here". */
export function notHereWords(count: number): string {
  return count === 0 ? 'everything here' : `${count} not here`
}

export interface LocationRow {
  id: string
  name: string
  active: boolean
  /** "Dumbbells to 80 lb · 3 not here". */
  summary: string
  /** Archive is offered: every gym but Planet Fitness, which unstamped workouts fall back to. */
  archivable: boolean
}

/**
 * One row per gym the lists offer (archived ones have left them), Planet Fitness first, the active
 * one marked. `availableOf` is what is here at a gym (its list, rack and the bag, less mark-offs);
 * the count is the checklist's items that aren't (`checklistNotHere`), which leaves the rack and the
 * bag to their own words.
 */
export function locationRows(
  locations: readonly Location[],
  activeId: string,
  checklist: readonly ChecklistGroup[],
  availableOf: (location: Location) => Available,
): LocationRow[] {
  return listedLocations(locations).map((l) => ({
    id: l.id,
    name: l.name,
    active: l.id === activeId,
    summary: `${rackWords(l.dumbbellMaxLb)} · ${notHereWords(checklistNotHere(checklist, availableOf(l)).length)}`,
    archivable: canArchive(l.id),
  }))
}

/** The first of Archive's two inline taps asks this; there is no delete, since workouts point at the gym. */
export function archiveAsk(name: string): string {
  return `Archive ${name}? It leaves the lists; its sessions keep pointing at it, and nothing is deleted.`
}

/** What archiving came to: archiving the active gym returns to Planet Fitness, and says so. */
export function archivedWords(name: string, activeMovedHome: boolean, homeName: string): string {
  return activeMovedHome ? `${name} is archived. It was the active gym, so ${homeName} is active again.` : `${name} is archived.`
}

/** A failed write in one sentence, with what the phone still holds. */
export function failedWords(what: string, error: unknown, still: string): string {
  const reason = error instanceof Error ? error.message : String(error)
  return `${what} did not save (${reason}); ${still}`
}
