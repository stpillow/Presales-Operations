import type { Exercise, SessionTemplate, Slot } from '../schema/index.ts'
import { addedDefaults, notAddableReason, slotFromAdded } from './addedSlots.ts'
import { slotsForPhaseWeek } from './session.ts'

/*
 * "I have more time than the session takes": what the app adds. The pool is built here, in order,
 * and `fitToWindow` takes from the front of it while there is time (src/rules/fitWindow.ts):
 *   1. the exercises of the phase's other sessions that this one doesn't run, the next session
 *      first (A borrows from B, then C), each as that session writes it, so program.md's own
 *      prescription and rule come with it. Jumping and landing work, step-height exercises, carries
 *      and cardio are left out, as for an added exercise (`notAddableReason`);
 *   2. then upper-body work from the catalog, pulls and pushes taking turns. Shawn has no upper-body
 *      limit (Nov 3), so this is the fallback and is not held to the phase; it starts as 3 sets of
 *      8 to 12, the load his to choose the first time.
 * Nothing here is stored: it is worked out again from the same inputs each time, so the same minutes
 * give the same session.
 */

/** The most exercises added for extra time. */
export const EXTENSION_MAX = 6

/** Ids of the exercises added for extra time start here, apart from `added-` (Shawn's own adds) and program.md's. */
export const EXTRA_PREFIX = 'extra-'

export function isExtraSlotId(slotId: string): boolean {
  return slotId.startsWith(EXTRA_PREFIX)
}

const LETTERS = ['A', 'B', 'C'] as const

/** The phase's other sessions, the one after this letter first and wrapping: A reads B then C, B reads C then A. */
function otherSessions(template: SessionTemplate, templates: readonly SessionTemplate[]): SessionTemplate[] {
  const at = LETTERS.indexOf(template.letter)
  const rank = (t: SessionTemplate) => (LETTERS.indexOf(t.letter) - at + LETTERS.length) % LETTERS.length
  return templates.filter((t) => t.phase === template.phase && t.id !== template.id).sort((a, b) => rank(a) - rank(b))
}

/** Upper-body work: the catalog's pulls and pushes, in catalog order. */
function upperBody(catalog: ReadonlyMap<string, Exercise>): Exercise[] {
  const fits = (pattern: Exercise['pattern']) => [...catalog.values()].filter((e) => e.pattern === pattern && notAddableReason(e) === null)
  const pulls = fits('pull')
  const pushes = fits('push')
  const turns: Exercise[] = []
  for (let i = 0; i < Math.max(pulls.length, pushes.length); i++) {
    const pull = pulls[i]
    const push = pushes[i]
    if (pull) turns.push(pull)
    if (push) turns.push(push)
  }
  return turns
}

/**
 * The slots that can be added for extra time, in the order they are taken. `template` is the session as
 * it runs (with Shawn's added exercises); an exercise it already runs is never offered again.
 */
export function extensionPool(input: { template: SessionTemplate; templates: readonly SessionTemplate[]; phaseWeek: number; catalog: ReadonlyMap<string, Exercise> }): Slot[] {
  const { template, templates, phaseWeek, catalog } = input
  const seen = new Set(template.slots.map((s) => s.exerciseId))
  const top = Math.max(...template.slots.map((s) => s.order))
  const pool: Slot[] = []
  const next = () => top + pool.length + 1

  for (const other of otherSessions(template, templates)) {
    for (const slot of slotsForPhaseWeek(other, phaseWeek)) {
      const exercise = catalog.get(slot.exerciseId)
      if (!exercise || slot.optional || seen.has(slot.exerciseId) || notAddableReason(exercise) !== null) continue
      seen.add(slot.exerciseId)
      const { groupId: _group, phaseWeeks: _weeks, ...rest } = slot
      void _group
      void _weeks
      pool.push({ ...rest, id: `${EXTRA_PREFIX}${slot.id}`, order: next(), label: `+${other.letter}${slot.label}`, optional: false })
    }
  }

  let upper = 0
  for (const exercise of upperBody(catalog)) {
    if (seen.has(exercise.id)) continue
    seen.add(exercise.id)
    upper += 1
    pool.push(slotFromAdded({ id: `${EXTRA_PREFIX}${exercise.id}`, ...addedDefaults(exercise) }, exercise, upper, next(), `+U${upper}`))
  }
  return pool
}
