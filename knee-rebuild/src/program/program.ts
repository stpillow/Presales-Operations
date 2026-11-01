import { Program, type Exercise, type Phase, type SessionLetter, type SessionTemplate } from '../schema/index.ts'
import { seedError, seedProgram } from './seed.ts'

/**
 * The seed program, validated once at import. Transcribed by hand from docs/program.md in M1;
 * never parsed from the Markdown at runtime, never "improved" here. Modules that import this only
 * load after main.tsx has checked seedError, so the throw below is a guard, not the error path.
 */
export const programError: string | null = seedError

function requireProgram(): Program {
  if (!seedProgram) throw new Error(`data/program.json failed validation: ${seedError ?? 'unknown error'}`)
  return seedProgram
}

export const program: Program = requireProgram()

const exercisesById = new Map(program.exercises.map((e) => [e.id, e]))

export function exerciseById(id: string): Exercise {
  const exercise = exercisesById.get(id)
  if (!exercise) throw new Error(`unknown exercise: ${id}`)
  return exercise
}

/**
 * The phase program.md schedules for a program week. This is the nominal plan only: the app's
 * current phase is state, advanced when Shawn confirms a gate, never by the calendar.
 */
export function nominalPhaseForWeek(week: number): Phase {
  const phase = program.phases.find((p) => week >= p.weekStart && (p.weekEnd === null || week <= p.weekEnd))
  if (!phase) throw new Error(`no phase for week ${week}`)
  return phase
}

export function templateFor(phase: number, letter: SessionLetter): SessionTemplate {
  const template = program.templates.find((t) => t.phase === phase && t.letter === letter)
  if (!template) throw new Error(`no template for phase ${phase} session ${letter}`)
  return template
}
