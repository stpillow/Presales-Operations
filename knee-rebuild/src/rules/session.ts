import type { SessionTemplate, Slot } from '../schema/index.ts'

/** The slots a template runs in a given program week: week-banded slots (snap-downs, plyo blocks) only in their weeks. */
export function slotsForWeek(template: SessionTemplate, week: number): Slot[] {
  return template.slots.filter((slot) => {
    if (!slot.weeks) return true
    const [from, to] = slot.weeks
    return week >= from && week <= to
  })
}
