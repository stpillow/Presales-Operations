import type { Requirement } from '../schema/index.ts'
import type { SlotRoute } from './equipment.ts'
import type { Prescription } from './prescription.ts'

/*
 * What a gym changes in a planned session (M4b, design section 5), for Today's list: read off the
 * plan the runner runs (`planSession`), so Today and the runner never disagree about the same gym.
 * The plan's route already starts from where the slot's history put it (PROGRAM-QUESTIONS 86), and
 * its prescriptions already meet the rack (questions 79 and 80); this only says which slots changed
 * and why. Pure: the plans come in as arguments.
 */

/** A planned slot as Today reads it: `SlotPlan`'s slot id, exercise, route and prescriptions. */
export interface PlannedSlot {
  slotId: string
  /** The exercise the plan puts the slot on (`SlotPlan.exercise`): the gym's pick, from where the history put the slot. */
  exerciseId: string
  route: SlotRoute
  prescriptions: readonly Pick<Prescription, 'exerciseId' | 'rackCapped' | 'rackMoved'>[]
}

export interface GymChange {
  slotId: string
  /** `moved`: another exercise runs. `none`: nothing from the slot's place on its list is here. `capped`: it runs, rack-capped. */
  kind: 'moved' | 'none' | 'capped'
  /** The exercise the gym took the slot off: where the history put it (its own, or its easier version). */
  from: string
  /** What runs: the gym's pick, then wherever the rack moved it on; on `none` and `capped`, `from` again. */
  to: string
  /** What the gym lacks for `from`; empty when only the rack changed the slot. */
  missing: Requirement[]
  /** The load was past this gym's heaviest dumbbell, so the slot moved on down its list. */
  pastRack: boolean
  /** A side runs at the gym's heaviest dumbbell, rack-capped: the session won't count as clean. */
  rackCapped: boolean
}

/**
 * The slots a gym changes, in session order: those the gym routes `moved` or `none`, and those the
 * rack moves or caps (`Prescription.rackMoved`, `rackCapped`). A slot that runs where its history
 * put it, uncapped, isn't listed, nor is a move the engine makes at any gym (a back-off to the
 * easier version), which the runner says on the card.
 */
export function gymChanges(plans: readonly PlannedSlot[]): GymChange[] {
  return plans.flatMap((plan): GymChange[] => {
    const { route } = plan
    const pastRack = plan.prescriptions.some((p) => p.rackMoved === true)
    const rackCapped = plan.prescriptions.some((p) => p.rackCapped === true)
    const card = plan.prescriptions[0]?.exerciseId ?? plan.exerciseId
    const missing = route.passedOver[0]?.missing ?? []
    if (route.kind === 'none') return [{ slotId: plan.slotId, kind: 'none', from: route.exerciseId, to: route.exerciseId, missing, pastRack: false, rackCapped: false }]
    if (route.kind === 'moved') {
      const from = route.passedOver[0]?.exerciseId ?? plan.exerciseId
      return [{ slotId: plan.slotId, kind: 'moved', from, to: pastRack ? card : route.exerciseId, missing, pastRack, rackCapped }]
    }
    if (pastRack) return [{ slotId: plan.slotId, kind: 'moved', from: plan.exerciseId, to: card, missing: [], pastRack, rackCapped }]
    if (rackCapped) return [{ slotId: plan.slotId, kind: 'capped', from: card, to: card, missing: [], pastRack: false, rackCapped }]
    return []
  })
}
