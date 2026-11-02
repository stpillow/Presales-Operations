import type { EquipmentId, Exercise, Requirement } from '../schema/index.ts'
import { DUMBBELLS, missingHere, type Available, type SlotRoute } from './equipment.ts'

/*
 * What the Session runner does with the gym it runs at (M4b, design section 4): which slots the
 * run order leaves for Skip or Do it anyway, and what a Swap pick or Do it anyway offers to mark at
 * the gym. Pure: the routes, what is here and the kit come in as arguments; the runner shows the
 * offers and src/db/repo.ts writes the marks (`setPresent`, `markOff`).
 */

/** A planned slot as the run order sees the gym: what the gym did to it without a swap. */
export interface RunnerSlot {
  slotId: string
  route: Pick<SlotRoute, 'kind'>
}

/**
 * The slots the run order leaves out (runOrder.ts `notHere`, PROGRAM-QUESTIONS 83): those routed
 * `none`, nothing on the slot's list being here. A slot leaves the set once Shawn picks Do it
 * anyway on it, chooses a swap for it this session, or has a set logged on it (a set logged means
 * it runs), and then it runs like any other.
 */
export function notHereSlots(
  slots: readonly RunnerSlot[],
  runAnyway: ReadonlySet<string>,
  swapped: ReadonlySet<string>,
  logged: ReadonlySet<string>,
): Set<string> {
  return new Set(
    slots.filter((s) => s.route.kind === 'none' && !runAnyway.has(s.slotId) && !swapped.has(s.slotId) && !logged.has(s.slotId)).map((s) => s.slotId),
  )
}

const optionsOf = (requirement: Requirement): EquipmentId[] => (typeof requirement === 'string' ? [requirement] : requirement.anyOf)

const once = (ids: readonly EquipmentId[]): EquipmentId[] => [...new Set(ids)]

/**
 * "Mark step platforms here": what the exercise lacks at this gym (`missingHere`, so a ladder's
 * first stage counts), each option of an either-or, in the exercise's order, once each. Dumbbells
 * are never offered: the gym's dumbbell max decides them, not a mark (PROGRAM-QUESTIONS 75).
 */
export function markHereItems(exercise: Pick<Exercise, 'requires' | 'stages' | 'stageRequires'>, available: Available): EquipmentId[] {
  return once(missingHere(exercise, available).flatMap(optionsOf)).filter((id) => id !== DUMBBELLS)
}

/** Whether the exercise lacks dumbbells here: the way to add them is the gym's dumbbell max in Where you train. */
export function lacksDumbbells(exercise: Pick<Exercise, 'requires' | 'stages' | 'stageRequires'>, available: Available): boolean {
  return missingHere(exercise, available).some((r) => optionsOf(r).includes(DUMBBELLS))
}

/** Every item an exercise uses: what it requires, then what its stages stand on, each option of an either-or. */
function usesItems(exercise: Pick<Exercise, 'requires' | 'stageRequires'>): EquipmentId[] {
  return once([...exercise.requires, ...(exercise.stageRequires ?? []).flat()].flatMap(optionsOf))
}

/**
 * "Smith machine isn't here: mark it", after a Swap pick that is here: the items the exercise
 * swapped away from uses that the gym's list says are here and the pick doesn't use (the goblet
 * squat still needs the bench the Smith box squat sat on). Never the kit, which is in the bag at
 * every gym, and never dumbbells, which follow the dumbbell max (PROGRAM-QUESTIONS 75).
 */
export function markOffItems(
  left: Pick<Exercise, 'requires' | 'stageRequires'>,
  pick: Pick<Exercise, 'requires' | 'stageRequires'>,
  available: Available,
  kit: readonly EquipmentId[],
): EquipmentId[] {
  const pickUses = new Set(usesItems(pick))
  return usesItems(left).filter((id) => available.has(id) && id !== DUMBBELLS && !kit.includes(id) && !pickUses.has(id))
}

export type SwapOffer =
  /** The pick isn't here: mark what it lacks here; `dumbbells` when it lacks them, which only the dumbbell max adds. */
  | { kind: 'mark-here'; items: EquipmentId[]; dumbbells: boolean }
  /** The pick is here: mark off what the exercise it replaced needed. */
  | { kind: 'mark-off'; items: EquipmentId[] }

/**
 * What a Swap pick offers (design section 4): a pick that isn't here offers "Mark Smith machine
 * here" for what it lacks; a pick that is here offers "Smith machine isn't here: mark it" for what
 * the exercise it replaced (`left`, the one on the card) needed. Null when there is nothing to offer.
 */
export function swapOffer(
  left: Pick<Exercise, 'id' | 'requires' | 'stages' | 'stageRequires'>,
  pick: Pick<Exercise, 'id' | 'requires' | 'stages' | 'stageRequires'>,
  available: Available,
  kit: readonly EquipmentId[],
): SwapOffer | null {
  if (missingHere(pick, available).length > 0) {
    const items = markHereItems(pick, available)
    const dumbbells = lacksDumbbells(pick, available)
    return items.length > 0 || dumbbells ? { kind: 'mark-here', items, dumbbells } : null
  }
  if (left.id === pick.id) return null
  const items = markOffItems(left, pick, available, kit)
  return items.length > 0 ? { kind: 'mark-off', items } : null
}
