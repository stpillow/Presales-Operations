import { exerciseById, program, templateFor } from '../program/program.ts'
import { exerciseHistory } from '../rules/gymLoads.ts'
import { attachChecks, recordsBefore, type WorkoutRecord } from '../rules/history.ts'
import { prescribe, type Prescription } from '../rules/prescription.ts'
import { phaseWeekOf, slotsForPhaseWeek } from '../rules/session.ts'
import { slotExercise, type SlotExercise } from '../rules/slotExercise.ts'
import { kneeMorning, wholeKneeFor } from '../rules/wholeKnee.ts'
import type { Exercise, IsoDate, SessionLetter, SessionTemplate, Settings, Slot } from '../schema/index.ts'
import type { History } from '../db/repo.ts'

export interface SlotPlan {
  slot: Slot
  /** The exercise the slot runs today: its own, the substitution chosen for this session, or the easier version its history put it on. */
  exercise: Exercise
  substitutions: Exercise[]
  /** One per side, injured side first. */
  prescriptions: Prescription[]
}

/**
 * Assembles the engine's inputs from stored history and asks it for every slot's prescription.
 * Composition only: which slots run, what the last session was, what the readings were. Every
 * decision inside comes from src/rules.
 */
export function planSession(input: {
  template: SessionTemplate
  week: number
  settings: Settings
  history: History
  /** A swap made for this session, by slot id. */
  chosenExercise?: Record<string, string | undefined>
  /** Plan only from sessions dated before this day: the session being run, and any earlier attempt that day, never plan it. */
  before?: IsoDate
}): SlotPlan[] {
  const { template, week, settings, history } = input
  const all: WorkoutRecord[] = attachChecks(history.workouts, history.setLogs, history.morningChecks)
  const records = input.before ? recordsBefore(all, input.before) : all
  const phaseWeek = phaseWeekOf(Math.max(week, settings.phaseEnteredWeek), settings.phaseEnteredWeek)
  // A morning since the last lift that read back-off makes this the next lift (wholeKnee.ts); only a dated session is one.
  const morning = input.before ? kneeMorning(history.morningChecks, history.workouts, input.before) : null
  return slotsForPhaseWeek(template, phaseWeek).map((slot) => {
    const choice = input.chosenExercise?.[slot.id]
    const allowed = choice !== undefined && (choice === slot.exerciseId || slot.substitutionIds.includes(choice))
    const substitutions = slot.substitutionIds.map(exerciseById)
    // A swap chosen for this session wins. Otherwise the slot's history says which exercise it runs: its
    // own, or the easier version a back-off moved it to until that reads clean twice (slotExercise.ts).
    // Either way rack-capped sessions read hold at best and never set the baseline (gymLoads.ts).
    const placed: SlotExercise = allowed
      ? { exercise: exerciseById(choice), ...exerciseHistory(records, choice, settings.injuredSide) }
      : slotExercise({ slot, own: exerciseById(slot.exerciseId), substitutions, records, injuredSide: settings.injuredSide })
    const { exercise, readings, lastSets, placement } = placed
    const wholeKnee = wholeKneeFor({ morning, own: exerciseById(slot.exerciseId), exerciseId: exercise.id, phase: template.phase, records })
    const prescriptions = prescribe({
      slot,
      exercise,
      substitutions,
      readings,
      lastSets,
      week,
      injuredSide: settings.injuredSide,
      dumbbellMax: settings.dumbbellMax,
      redFlagActive: settings.redFlag.active,
      ...(placement ? { placement } : {}),
      ...(wholeKnee ? { wholeKnee } : {}),
    })
    return { slot, exercise, substitutions, prescriptions }
  })
}

/** The template for a session letter in the phase the app is currently in. */
export function currentTemplate(settings: Settings, letter: SessionLetter): SessionTemplate | null {
  if (settings.currentPhase > 3) return null
  return templateFor(settings.currentPhase, letter)
}

export const PROGRAM = program
