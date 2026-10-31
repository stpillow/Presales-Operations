import type { SessionTemplate, Slot } from '../schema/index.ts'

/**
 * Which week of its phase a program week is, counting from the week the phase was entered.
 * Phases advance on gate confirmation, so this is state-driven, never the calendar alone.
 */
export function phaseWeekOf(week: number, phaseEnteredWeek: number): number {
  if (week < phaseEnteredWeek) throw new RangeError(`week ${week} is before the phase was entered in week ${phaseEnteredWeek}`)
  return week - phaseEnteredWeek + 1
}

/** The slots a template runs in a given week of its phase: banded slots (snap-downs, plyo blocks) only in their weeks. */
export function slotsForPhaseWeek(template: SessionTemplate, phaseWeek: number): Slot[] {
  return template.slots.filter((slot) => {
    if (!slot.phaseWeeks) return true
    const [from, to] = slot.phaseWeeks
    return phaseWeek >= from && (to === null || phaseWeek <= to)
  })
}
