/** Deload weeks, counted from startDate (PROMPT rule 6). Phase 4's schedule isn't written yet. */
export const DELOAD_WEEKS: readonly number[] = [4, 8, 12]

export function isDeloadWeek(week: number): boolean {
  return DELOAD_WEEKS.includes(week)
}
