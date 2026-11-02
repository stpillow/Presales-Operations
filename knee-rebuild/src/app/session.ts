import { exerciseById, program, templateFor } from '../program/program.ts'
import { attachChecks, recordsBefore, type WorkoutRecord } from '../rules/history.ts'
import { prescribe, type Prescription } from '../rules/prescription.ts'
import { phaseWeekOf, slotsForPhaseWeek } from '../rules/session.ts'
import { sessionSlotExercise } from '../rules/slotExercise.ts'
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
  const morning = kneeMorning(history.morningChecks, history.workouts, input.before)
  return slotsForPhaseWeek(template, phaseWeek).map((slot) => {
    const substitutions = slot.substitutionIds.map(exerciseById)
    // A swap chosen for this session beats the slot's history (slotExercise.ts).
    const { exercise, readings, lastSets, placement } = sessionSlotExercise(
      { slot, own: exerciseById(slot.exerciseId), substitutions, records, injuredSide: settings.injuredSide },
      input.chosenExercise?.[slot.id],
    )
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
