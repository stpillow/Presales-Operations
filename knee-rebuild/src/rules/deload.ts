import { isDeloadWeek } from './calendar.ts'

/** Deload: sets × two-thirds rounded down, minimum 2 (PROMPT rule 6). Loads are unchanged. */
export function deloadSets(sets: number): number {
  return Math.max(2, Math.floor((sets * 2) / 3))
}

/** The set count to prescribe for a slot in a given program week. */
export function prescribedSets(sets: number, week: number): number {
  return isDeloadWeek(week) ? deloadSets(sets) : sets
}
