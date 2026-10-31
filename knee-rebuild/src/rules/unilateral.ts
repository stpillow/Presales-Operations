import type { SetLog } from '../schema/index.ts'

/**
 * Rule 5: the healthy side's target for each set equals the injured side's completed reps (or
 * seconds) for that set number. Its load may match or exceed; that is decided per side in prescribe.
 */
export function healthySideTargets(injuredSets: readonly SetLog[]): number[] {
  return [...injuredSets]
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((s) => s.reps ?? s.seconds ?? 0)
}

/** Symmetry is the injured value over the other side's value, as a percent to one decimal. Null when it can't be computed. */
export function symmetryPercent(injured: number, other: number): number | null {
  if (!(other > 0) || injured < 0) return null
  return Math.round((injured / other) * 1000) / 10
}

/** Whether the injured side reaches the gate's line (0.8 for gate 1, 0.9 for gates 2 and 3). */
export function meetsSymmetry(injured: number, other: number, threshold: number): boolean {
  const pct = symmetryPercent(injured, other)
  return pct !== null && pct >= threshold * 100
}

/** Hop tests store three trials per side and keep the best. */
export function bestOfTrials(trials: readonly number[]): number {
  if (trials.length === 0) return 0
  return Math.max(...trials)
}
