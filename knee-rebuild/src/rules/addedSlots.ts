import { ADDED_SLOTS_MAX, Slot, type AddedSlot, type Exercise, type ProgressionRule, type RepUnit, type SessionTemplate } from '../schema/index.ts'

/*
 * Exercises Shawn adds to a session (Program screen, Dexie version 5). An added exercise is stored as
 * its choices only (which template, which exercise, sets, rep range); the Slot the engine runs is
 * made here, from the exercise as the catalog has it, and laid after the template's own slots, so
 * program.md's slots, cues and rules are never touched. It prescribes, logs and reads like any slot.
 * Choosing a progression rule, and keeping an add inside what program.md has used by the session's phase, is the conservative reading (PROGRAM-QUESTIONS 136): a loaded exercise
 * climbs by double progression, bodyweight, band and balance work repeat, a timed hold adds time.
 */

/** Every added slot's id starts here, so the engine and the screens can tell it from program.md's. */
export const ADDED_SLOT_PREFIX = 'added-'

export function isAddedSlotId(slotId: string): boolean {
  return slotId.startsWith(ADDED_SLOT_PREFIX)
}

/** A new added slot's id, from a token the caller makes unique (the clock, a counter). */
export function addedSlotId(token: string): string {
  return `${ADDED_SLOT_PREFIX}${token}`
}

/**
 * The exercises program.md has used by `phase`: a slot's own or one of its substitutions, in a
 * session of that phase or an earlier one. An added exercise stays inside this set, so adding never
 * brings forward what program.md holds for a later phase (PROGRAM-QUESTIONS 136).
 */
export function phaseExerciseIds(templates: readonly SessionTemplate[], phase: number): Set<string> {
  const ids = new Set<string>()
  for (const t of templates) {
    if (t.phase > phase) continue
    for (const s of t.slots) {
      ids.add(s.exerciseId)
      for (const id of s.substitutionIds) ids.add(id)
    }
  }
  return ids
}

export const NOT_YET_WORDS = 'program.md hasn’t used that exercise by this phase, so it stays for the phase that brings it in.'

/** Why an exercise can't be added, in a sentence; null when it can. A step-height exercise needs a starting height, a carry or cardio is counted in yards or minutes, jumping and landing work follows program.md's phases. */
export function notAddableReason(exercise: Pick<Exercise, 'name' | 'pattern' | 'loadType'>): string | null {
  if (exercise.pattern === 'plyo') return `${exercise.name} is jumping or landing work, which program.md brings back in its own phases, so it only runs where program.md puts it.`
  if (exercise.loadType === 'step-height') return `${exercise.name} starts at a step height program.md sets, so it can only run where program.md puts it.`
  if (exercise.pattern === 'carry' || exercise.pattern === 'cardio') return `${exercise.name} is counted in yards or minutes, so it can only run where program.md puts it.`
  return null
}

/** The unit an added exercise is counted in: seconds for a hold or a staged balance drill, reps for the rest. */
export function addedRepUnit(exercise: Pick<Exercise, 'loadType' | 'stages'>): RepUnit {
  return exercise.loadType === 'time' || exercise.stages !== undefined ? 'seconds' : 'reps'
}

/** The progression rule an added exercise runs on. */
export function addedRule(exercise: Pick<Exercise, 'loadType' | 'stages'>): ProgressionRule {
  if (exercise.stages !== undefined) return 'stage'
  if (exercise.loadType === 'time') return 'time'
  if (exercise.loadType === 'bodyweight' || exercise.loadType === 'band') return 'fixed'
  return 'double-progression'
}

/** What is wrong with an add, in a sentence; null when it can be written. `already` is how many are on the template. */
export function addedSlotProblem(added: AddedSlot, exercise: Exercise | undefined, already: number, inPhase: ReadonlySet<string>): string | null {
  if (!exercise) return 'That exercise isn’t in the catalog.'
  const reason = notAddableReason(exercise)
  if (reason) return reason
  if (!inPhase.has(exercise.id)) return NOT_YET_WORDS
  if (already >= ADDED_SLOTS_MAX) return `A session takes ${ADDED_SLOTS_MAX} added exercises; remove one first.`
  if (added.repsMax < added.repsMin) return 'The top of the range is below the bottom.'
  return null
}

/** "3 × 8–10", "2 × 30–45 s", with the side words for a one-leg exercise. */
export function addedPrescriptionText(added: Pick<AddedSlot, 'sets' | 'repsMin' | 'repsMax'>, exercise: Pick<Exercise, 'loadType' | 'stages' | 'unilateral'>): string {
  const range = added.repsMax > added.repsMin ? `${added.repsMin}–${added.repsMax}` : `${added.repsMin}`
  const unit = addedRepUnit(exercise) === 'seconds' ? ' s' : ''
  return `${added.sets} × ${range}${unit}${exercise.unilateral ? ' each leg' : ''}`
}

/** The slot an added exercise becomes, `position` (1-based) among the template's added slots and `order` after the template's own. */
export function slotFromAdded(added: Pick<AddedSlot, 'id' | 'sets' | 'repsMin' | 'repsMax'>, exercise: Exercise, position: number, order: number, label: string = `+${position}`): Slot {
  return Slot.parse({
    id: added.id,
    order,
    label,
    exerciseId: exercise.id,
    sets: added.sets,
    repsMin: added.repsMin,
    repsMax: added.repsMax,
    repUnit: addedRepUnit(exercise),
    ...(exercise.unilateral ? { perSideLabel: 'each leg' } : {}),
    unilateral: exercise.unilateral,
    prescriptionText: addedPrescriptionText(added, exercise),
    cues: [],
    progressionRule: addedRule(exercise),
    substitutionIds: [],
  })
}

/** The added slots of one template, in the order they were added; a row the catalog can no longer run is left out. */
export function addedFor(templateId: string, added: readonly AddedSlot[], catalog: ReadonlyMap<string, Exercise>, inPhase: ReadonlySet<string>): AddedSlot[] {
  return added
    .filter((a) => a.templateId === templateId)
    .filter((a) => {
      const exercise = catalog.get(a.exerciseId)
      return exercise !== undefined && notAddableReason(exercise) === null && inPhase.has(exercise.id)
    })
    .sort((a, b) => (a.addedOn === b.addedOn ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.addedOn < b.addedOn ? -1 : 1))
}

/** The template with Shawn's added slots after its own; the template as written is left alone. */
export function withAddedSlots(template: SessionTemplate, added: readonly AddedSlot[], catalog: ReadonlyMap<string, Exercise>, templates: readonly SessionTemplate[]): SessionTemplate {
  const mine = addedFor(template.id, added, catalog, phaseExerciseIds(templates, template.phase)).slice(0, ADDED_SLOTS_MAX)
  if (mine.length === 0) return template
  const top = Math.max(...template.slots.map((s) => s.order))
  const slots = mine.flatMap((a, i) => {
    const exercise = catalog.get(a.exerciseId)
    return exercise ? [slotFromAdded(a, exercise, i + 1, top + i + 1)] : []
  })
  return { ...template, slots: [...template.slots, ...slots] }
}

/** The catalog's exercises that can be added to a session of `phase`, by name, for the picker. */
export function addableExercises(catalog: readonly Exercise[], templates: readonly SessionTemplate[], phase: number): Exercise[] {
  const inPhase = phaseExerciseIds(templates, phase)
  return catalog.filter((e) => notAddableReason(e) === null && inPhase.has(e.id)).sort((a, b) => a.name.localeCompare(b.name))
}

/** Where the sets and range start when an exercise is picked: 3 sets of 8–12 reps, or of 30–45 seconds for a hold. */
export function addedDefaults(exercise: Pick<Exercise, 'loadType' | 'stages'>): { sets: number; repsMin: number; repsMax: number } {
  return addedRepUnit(exercise) === 'seconds' ? { sets: 3, repsMin: 30, repsMax: 45 } : { sets: 3, repsMin: 8, repsMax: 12 }
}
