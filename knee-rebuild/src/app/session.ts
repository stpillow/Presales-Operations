import { exerciseById, program, templateFor } from '../program/program.ts'
import { availableEquipment, type Available, type SlotRoute } from '../rules/equipment.ts'
import { attachChecks, recordsBefore, type WorkoutRecord } from '../rules/history.ts'
import { prescribe, type GymHere, type Prescription } from '../rules/prescription.ts'
import { phaseWeekOf, slotsForPhaseWeek } from '../rules/session.ts'
import { slotAtGym } from '../rules/slotExercise.ts'
import { kneeMorning, wholeKneeFor } from '../rules/wholeKnee.ts'
import type { EquipmentId, Exercise, IsoDate, Location, SessionLetter, SessionTemplate, Settings, Slot } from '../schema/index.ts'
import type { History } from '../db/repo.ts'

export interface SlotPlan {
  slot: Slot
  /** The exercise the slot runs today: its own, the substitution chosen for this session, or the easier version its history put it on. */
  exercise: Exercise
  substitutions: Exercise[]
  /** One per side, injured side first. */
  prescriptions: Prescription[]
  /**
   * What the gym does to the slot without a swap (`slotAtGym`, src/rules/slotExercise.ts), from
   * where its history put it: `own`, that exercise runs here; `moved`, it isn't here and
   * `route.exerciseId` runs, each exercise passed over with what is missing; `none`, nothing from
   * it on is here, so the slot keeps it for Skip or Do it anyway. With a swap chosen, `exercise` is
   * the swap and `route` still says what the gym would have done.
   */
  route: SlotRoute
}

/** Where a session runs (M4b): the gym, and the bag Shawn carries to every gym (`Settings.kit`). */
export interface Gym {
  location: Location
  kit: readonly EquipmentId[]
}

const EQUIPMENT_NAMES: ReadonlyMap<EquipmentId, string> = new Map(program.equipment.map((e) => [e.id, e.name]))

/** What is here at a gym: its list (the program's list as of the gym's version), its dumbbells and the bag, less what is marked off. */
export function availableAt(gym: Gym): Available {
  return availableEquipment(gym.location, program.equipment, program.planetFitness, gym.kit)
}

/** The gym as `prescribe` reads it: what is here, the rack, and the program's names for the notes. */
export function gymHere(gym: Gym): GymHere {
  return { available: availableAt(gym), dumbbellMaxLb: gym.location.dumbbellMaxLb, names: EQUIPMENT_NAMES }
}

/**
 * Assembles the engine's inputs from stored history and the gym, and asks it for every slot's
 * prescription. Composition only: which slots run, what the last session was, what the readings
 * were, what is here. Every decision inside comes from src/rules.
 */
export function planSession(input: {
  template: SessionTemplate
  week: number
  settings: Settings
  history: History
  /** The gym it runs at: Today and the Morning check plan at the active gym, the runner at the workout's own. */
  gym: Gym
  /** A swap made for this session, by slot id. */
  chosenExercise?: Record<string, string | undefined>
  /** Plan only from sessions dated before this day: the session being run, and any earlier attempt that day, never plan it. */
  before?: IsoDate
}): SlotPlan[] {
  const { template, week, settings, history } = input
  const all: WorkoutRecord[] = attachChecks(history.workouts, history.setLogs, history.morningChecks)
  const records = input.before ? recordsBefore(all, input.before) : all
  const phaseWeek = phaseWeekOf(Math.max(week, settings.phaseEnteredWeek), settings.phaseEnteredWeek)
  const morning = kneeMorning(history.morningChecks, history.workouts, input.before)
  const gym = gymHere(input.gym)
  return slotsForPhaseWeek(template, phaseWeek).map((slot) => {
    const own = exerciseById(slot.exerciseId)
    const substitutions = slot.substitutionIds.map(exerciseById)
    // A swap chosen for this session beats the gym and the slot's history; the gym routes forward from the history (slotExercise.ts).
    const { exercise, readings, lastSets, placement, route } = slotAtGym(
      { slot, own, substitutions, records, injuredSide: settings.injuredSide },
      input.chosenExercise?.[slot.id],
      gym.available,
    )
    const wholeKnee = wholeKneeFor({ morning, own, exerciseId: exercise.id, phase: template.phase, records })
    const prescriptions = prescribe({
      slot,
      exercise,
      substitutions,
      readings,
      lastSets,
      week,
      injuredSide: settings.injuredSide,
      // The gym's rack; prescribe reads `gym.dumbbellMaxLb`, and Settings' frozen max is never read outside src/db.
      dumbbellMax: gym.dumbbellMaxLb,
      redFlagActive: settings.redFlag.active,
      gym,
      ...(placement ? { placement } : {}),
      ...(wholeKnee ? { wholeKnee } : {}),
    })
    return { slot, exercise, substitutions, prescriptions, route }
  })
}

/** The template for a session letter in the phase the app is currently in. */
export function currentTemplate(settings: Settings, letter: SessionLetter): SessionTemplate | null {
  if (settings.currentPhase > 3) return null
  return templateFor(settings.currentPhase, letter)
}

export const PROGRAM = program
