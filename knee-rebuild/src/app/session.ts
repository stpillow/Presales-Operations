import { exerciseById, program, templateFor } from '../program/program.ts'
import { attachChecks, exerciseReadings, lastSetsBySide, recordsBefore, type WorkoutRecord } from '../rules/history.ts'
import { prescribe, type Prescription } from '../rules/prescription.ts'
import { phaseWeekOf, slotsForPhaseWeek } from '../rules/session.ts'
import type { Exercise, IsoDate, SessionLetter, SessionTemplate, Settings, Slot } from '../schema/index.ts'
import type { History } from '../db/repo.ts'

export interface SlotPlan {
  slot: Slot
  /** The exercise the slot runs today: its own, or the substitution chosen for this session. */
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
  return slotsForPhaseWeek(template, phaseWeek).map((slot) => {
    const choice = input.chosenExercise?.[slot.id]
    const allowed = choice !== undefined && (choice === slot.exerciseId || slot.substitutionIds.includes(choice))
    const exercise = exerciseById(allowed ? choice : slot.exerciseId)
    const substitutions = slot.substitutionIds.map(exerciseById)
    const readings = exerciseReadings(records, exercise.id, settings.injuredSide).map((r) => r.reading.result)
    const prescriptions = prescribe({
      slot,
      exercise,
      substitutions,
      readings,
      lastSets: lastSetsBySide(records, exercise.id),
      week,
      injuredSide: settings.injuredSide,
      dumbbellMax: settings.dumbbellMax,
      redFlagActive: settings.redFlag.active,
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
