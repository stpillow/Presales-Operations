import type { SetLog, Slot } from '../schema/index.ts'
import type { Prescription } from './prescription.ts'

/** What the editor shows for one set before any tap. Pain and RPE may be unrated (null). */
export interface Draft {
  load: number
  count: number
  rpe: number | null
  pain: number | null
  heightIn?: number
  rangeStopDeg?: number
  stage?: number
}

function newest(sets: readonly SetLog[]): SetLog | undefined {
  return [...sets].sort((a, b) => (a.loggedAt ?? '').localeCompare(b.loggedAt ?? '')).at(-1)
}

/** Pain stored on this exercise's sets this session (per-exercise mode writes the same value on each). */
export function loggedPain(sets: readonly SetLog[]): number | null {
  return newest(sets.filter((s) => s.painDuring !== undefined))?.painDuring ?? null
}

export interface PrefillInput {
  prescription: Prescription
  /** The slot as it applies to the exercise being done (effectiveSlot). */
  slot: Slot
  setNumber: number
  /** This slot's sets already logged this session, every side and every exercise. */
  slotSets: readonly SetLog[]
  /** The healthy side's per-set targets from the injured side's logged reps; null on the injured or both side. */
  budget: number[] | null
  historyRpe: number | null
  painPerSet: boolean
}

/**
 * What a set starts at. Only sets of the same exercise carry over: a swap starts from the
 * substitution's own prescription, so a first-time load still reads "pick". Load carries the last
 * set on this side (a corrected pin carries forward), else the per-set repeat, else the
 * prescription; a load to pick shows 0. On the healthy side the injured side's reps win (rule 5),
 * then the per-set repeat, then the target. RPE is the slot's target, else the last logged. Pain is
 * never invented: per exercise it is what this exercise's sets carry, per set the previous set's.
 */
export function prefill(input: PrefillInput): Draft {
  const { prescription: p, slot, setNumber, budget } = input
  const sameExercise = input.slotSets.filter((s) => s.exerciseId === p.exerciseId)
  const previous = newest(sameExercise.filter((s) => s.side === p.side))
  const repeat = p.perSet?.[setNumber - 1]
  const load = previous?.load ?? repeat?.load ?? p.load ?? 0
  const count = budget?.[setNumber - 1] ?? repeat?.reps ?? p.repsTarget
  const rpe = slot.rpeTarget ?? previous?.rpe ?? input.historyRpe
  const pain = input.painPerSet ? (previous?.painDuring ?? null) : loggedPain(sameExercise)
  return {
    load,
    count,
    rpe: rpe ?? null,
    pain,
    ...(p.heightIn !== undefined ? { heightIn: previous?.heightIn ?? p.heightIn } : {}),
    ...(p.rangeStopDeg !== undefined ? { rangeStopDeg: previous?.rangeStopDeg ?? p.rangeStopDeg } : {}),
    ...(p.stage !== undefined ? { stage: previous?.stage ?? p.stage } : {}),
  }
}

/** A first-time load still at 0 can't be logged: 0 would poison the history. */
export function needsLoadPick(prescription: Prescription, showsLoad: boolean, loadDirection: 'up' | 'down', draft: Pick<Draft, 'load'>): boolean {
  return prescription.load === null && showsLoad && loadDirection !== 'down' && draft.load <= 0
}

/**
 * Whether a per-exercise pain rating may be written onto the exercise's logged sets: only when they
 * carry no pain or one shared value. Sets logged per set with differing pains keep them, so a later
 * switch to per-exercise mode can't flatten a climb.
 */
export function painRewriteAllowed(sets: readonly SetLog[]): boolean {
  const pains = new Set(sets.map((s) => s.painDuring).filter((p) => p !== undefined))
  return pains.size <= 1
}
