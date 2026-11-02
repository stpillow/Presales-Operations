import type { EquipmentId, Exercise, Requirement } from '../schema/index.ts'
import { DUMBBELLS, missingHere, type Available, type SlotRoute } from './equipment.ts'
import type { Prescription } from './prescription.ts'

/*
 * What the Session runner does with the gym it runs at (M4b, design section 4): which slots the
 * run order leaves for Skip or Do it anyway, and what a Swap pick or Do it anyway offers to mark at
 * the gym. Pure: the routes, what is here and the carried items come in as arguments; the runner shows the
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

type Needs = Pick<Exercise, 'requires' | 'stages' | 'stageRequires'>

const lacking = (exercise: Needs, available: Available): EquipmentId[] => once(missingHere(exercise, available).flatMap(optionsOf))

/**
 * "Mark step platforms here": what the exercise lacks at this gym (`missingHere`, so a ladder's
 * first stage counts), each option of an either-or, in the exercise's order, once each. Never
 * dumbbells, which the gym's dumbbell max decides, and never an item carried in the bag
 * (`carried`, the list's carried items), which is Settings' kit at every gym, not a mark at one
 * (PROGRAM-QUESTIONS 75).
 */
export function markHereItems(exercise: Needs, available: Available, carried: readonly EquipmentId[]): EquipmentId[] {
  return lacking(exercise, available).filter((id) => id !== DUMBBELLS && !carried.includes(id))
}

/** Whether the exercise lacks dumbbells here: the way to add them is the gym's dumbbell max in Where you train. */
export function lacksDumbbells(exercise: Needs, available: Available): boolean {
  return lacking(exercise, available).includes(DUMBBELLS)
}

/**
 * Whether the card asks for this gym's heaviest dumbbell (M4b review): the exercise it runs needs
 * dumbbells and the gym has none (its dumbbell max is 0), and the slot runs anyway (Do it anyway, a
 * swap, a set logged; not `held` for Skip or Do it anyway). Its load field stops at the rack, so
 * without a rack no load could be logged. An exercise that only holds dumbbells is bodyweight there
 * (PROGRAM-QUESTIONS 91) and never asks.
 */
export function asksForRack(exercise: Needs, available: Available, held: boolean): boolean {
  return !held && lacksDumbbells(exercise, available)
}

/**
 * Whether Skip takes back Do it anyway on a slot: while nothing on its list is here (routed `none`)
 * and until a set is logged on it, so the slot is nothing here again and the run order passes it
 * (PROGRAM-QUESTIONS 83). Once a set is logged it ran; once something is here it runs anyway.
 */
export function skipTakesBack(slot: RunnerSlot, runAnyway: ReadonlySet<string>, logged: ReadonlySet<string>): boolean {
  return slot.route.kind === 'none' && runAnyway.has(slot.slotId) && !logged.has(slot.slotId)
}

/**
 * Why the exercise the plan runs without a swap (`engineId`) isn't the one on the card: `rack`, its
 * load is past this gym's heaviest dumbbell (`rackMoved`); `engine`, the engine moved it (a back-off
 * to the easier version). Null when the card runs it, or a swap chose. A Swap pick of `engineId`
 * stores no swap (`swapPick`), so the card stays where it is, and Swap says why rather than a plain Here.
 */
export function cardHoldsOff(engineId: string, prescriptions: readonly Pick<Prescription, 'exerciseId' | 'rackMoved'>[], swapped: boolean): 'rack' | 'engine' | null {
  const card = prescriptions[0]?.exerciseId ?? engineId
  if (swapped || card === engineId) return null
  return prescriptions.some((p) => p.rackMoved === true) ? 'rack' : 'engine'
}

/** The carried items the exercise lacks: not in the bag (Settings' kit), so no mark at a gym adds them. */
export function lacksFromBag(exercise: Needs, available: Available, carried: readonly EquipmentId[]): EquipmentId[] {
  return lacking(exercise, available).filter((id) => carried.includes(id))
}

/** Every item an exercise uses: what it requires, then what its stages stand on, each option of an either-or. */
function usesItems(exercise: Pick<Exercise, 'requires' | 'stageRequires'>): EquipmentId[] {
  return once([...exercise.requires, ...(exercise.stageRequires ?? []).flat()].flatMap(optionsOf))
}

/**
 * "Smith machine isn't here: mark it", after a Swap pick that is here: the items the exercise
 * swapped away from uses that the gym's list says are here and the pick doesn't use (the goblet
 * squat still needs the bench the Smith box squat sat on). Never a carried item, which is in the
 * bag at every gym, and never dumbbells, which follow the dumbbell max (PROGRAM-QUESTIONS 75).
 */
export function markOffItems(
  left: Pick<Exercise, 'requires' | 'stageRequires'>,
  pick: Pick<Exercise, 'requires' | 'stageRequires'>,
  available: Available,
  carried: readonly EquipmentId[],
): EquipmentId[] {
  const pickUses = new Set(usesItems(pick))
  return usesItems(left).filter((id) => available.has(id) && id !== DUMBBELLS && !carried.includes(id) && !pickUses.has(id))
}

export type SwapOffer =
  /**
   * The pick isn't here: mark what it lacks here (`items`); `dumbbells` when it lacks them, which
   * only the dumbbell max adds; `bag`, the carried items it lacks, which only Settings' kit adds.
   */
  | { kind: 'mark-here'; items: EquipmentId[]; dumbbells: boolean; bag: EquipmentId[] }
  /** The pick is here: mark off what the exercise it replaced needed. */
  | { kind: 'mark-off'; items: EquipmentId[] }

/**
 * What a Swap pick offers (design section 4): a pick that isn't here offers "Mark Smith machine
 * here" for what it lacks; a pick that is here offers "Smith machine isn't here: mark it" for what
 * the exercise it replaced (`left`, the one on the card) needed. Null when the pick is here and
 * there is nothing to mark off; a pick that isn't here always says what it lacks.
 */
export function swapOffer(
  left: Pick<Exercise, 'id'> & Needs,
  pick: Pick<Exercise, 'id'> & Needs,
  available: Available,
  carried: readonly EquipmentId[],
): SwapOffer | null {
  if (missingHere(pick, available).length > 0) {
    return { kind: 'mark-here', items: markHereItems(pick, available, carried), dumbbells: lacksDumbbells(pick, available), bag: lacksFromBag(pick, available, carried) }
  }
  if (left.id === pick.id) return null
  const items = markOffItems(left, pick, available, carried)
  return items.length > 0 ? { kind: 'mark-off', items } : null
}
