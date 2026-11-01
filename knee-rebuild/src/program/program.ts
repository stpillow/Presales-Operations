import raw from '../../data/program.json'
import { Program, type Exercise, type Phase, type SessionLetter, type SessionTemplate } from '../schema/index.ts'

/**
 * The seed program, validated once at import. Transcribed by hand from docs/program.md in M1;
 * never parsed from the Markdown at runtime, never "improved" here.
 */
const parsed = Program.safeParse(raw)

/** Null when the seed validates; otherwise the reason, for a readable error screen instead of a blank one. */
export const programError: string | null = parsed.success ? null : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')

export const program: Program = parsed.success ? parsed.data : (() => { throw new Error(`data/program.json failed validation: ${programError}`) })()

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
