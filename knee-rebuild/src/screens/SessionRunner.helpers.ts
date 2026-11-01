import { HELD_LOAD_INCREMENT_LB, RANGE_LADDER_DEG, type Prescription } from '../rules/prescription.ts'
import { stepKey } from '../rules/runOrder.ts'
import type { Exercise, LoadUnit, RepUnit, SessionTemplate, SetLog, SetSide, Side, Slot, StopReason, Workout } from '../schema/index.ts'

/**
 * Pure helpers for the Session runner: what to prefill, what to call things, how to say a set in
 * words. Nothing here decides a load, a reading or an order; those come from src/rules.
 */

export interface Draft {
  load: number
  count: number
  rpe: number | null
  pain: number | null
  heightIn?: number
  rangeStopDeg?: number
  stage?: number
}

export const STOP_REASONS: { value: StopReason; label: string }[] = [
  { value: 'sharp-joint-line-pain', label: 'Sharp joint-line pain' },
  { value: 'pain', label: 'Pain' },
  { value: 'form', label: 'Form' },
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'time', label: 'Time' },
  { value: 'other', label: 'Other' },
]

export function stopReasonLabel(reason: StopReason | undefined): string {
  return STOP_REASONS.find((r) => r.value === reason)?.label ?? 'no reason'
}

export function templateForWorkout(workout: Pick<Workout, 'templateId'>, templates: readonly SessionTemplate[]): SessionTemplate | null {
  return templates.find((t) => t.id === workout.templateId) ?? null
}

export function setStepKey(set: Pick<SetLog, 'slotId' | 'side' | 'setNumber'>): string {
  return stepKey(set.slotId, set.side, set.setNumber)
}

/** Seconds are logged as seconds; reps, minutes, yards and steps all go in reps. */
export function countField(repUnit: RepUnit): 'reps' | 'seconds' {
  return repUnit === 'seconds' ? 'seconds' : 'reps'
}

export function countLabel(repUnit: RepUnit): string {
  return { reps: 'Reps', seconds: 'Seconds', minutes: 'Minutes', yards: 'Yards', steps: 'Steps' }[repUnit]
}

export function countStep(repUnit: RepUnit): number {
  return repUnit === 'seconds' || repUnit === 'yards' ? 5 : 1
}

function unitWord(repUnit: RepUnit): string {
  return { reps: '', seconds: ' s', minutes: ' min', yards: ' yd', steps: ' steps' }[repUnit]
}

/** Whether the screen shows a load field: loaded exercises, and step-ups that hold dumbbells. */
export function showsLoad(exercise: Exercise): boolean {
  if (exercise.loadType === 'step-height') return exercise.holdsLoad !== undefined
  return !['bodyweight', 'time', 'band'].includes(exercise.loadType)
}

/** The unit a set's load is stored in. Step-ups store the dumbbells in their hands. */
export function logLoadUnit(exercise: Exercise): LoadUnit {
  return exercise.holdsLoad !== undefined ? 'lb' : exercise.loadUnit
}

export function loadStep(exercise: Exercise): number {
  if (exercise.holdsLoad !== undefined) return HELD_LOAD_INCREMENT_LB
  return exercise.increment > 0 ? exercise.increment : 1
}

/** The dumbbell rack caps the load field; nothing else does. */
export function loadMax(exercise: Exercise, dumbbellMax: number): number {
  const dumbbells = exercise.loadType === 'dumbbell-each' || exercise.loadType === 'dumbbell-single' || exercise.holdsLoad !== undefined
  return dumbbells ? dumbbellMax : 2000
}

export function loadLabel(exercise: Exercise): string {
  if (exercise.holdsLoad !== undefined || exercise.loadType === 'dumbbell-each') return 'Dumbbells (lb each)'
  if (exercise.loadType === 'dumbbell-single') return 'Dumbbell (lb)'
  if (exercise.loadType === 'stack') return exercise.loadDirection === 'down' ? 'Assist (plate)' : 'Plate'
  if (exercise.loadType === 'smith-plates') return 'Plates on the Smith (lb)'
  return 'Load (lb)'
}

/** A load in words: "plate 8", "20 lb each", "bodyweight". */
export function loadWords(load: number | null, exercise: Exercise): string {
  if (!showsLoad(exercise)) return 'bodyweight'
  if (load === null) return 'load to pick'
  if (exercise.holdsLoad !== undefined) return load > 0 ? `${load} lb each` : 'no dumbbells'
  switch (exercise.loadType) {
    case 'dumbbell-each':
      return `${load} lb each`
    case 'stack':
      return exercise.loadDirection === 'down' ? `assist ${load}` : `plate ${load}`
    default:
      return `${load} lb`
  }
}

/** The prescription in words: "3 × 10–12 · RPE 6→7 · plate 8". */
export function prescriptionWords(p: Prescription, slot: Slot, exercise: Exercise): string {
  const count = p.perSet && p.perSet.length > 0 ? p.perSet.map((s) => s.reps).join(', ') : `${p.repsTarget}`
  const reps = `${p.sets} × ${count}${unitWord(slot.repUnit)}`
  const rpe = slot.rpeTarget !== undefined ? ` · RPE ${slot.rpeTarget}${slot.rpeTargetEnd ? `→${slot.rpeTargetEnd}` : ''}` : ''
  const load = showsLoad(exercise) ? ` · ${loadWords(p.load, exercise)}` : ''
  const extra = [
    p.heightIn !== undefined ? `${p.heightIn} in. step` : '',
    p.rangeStopDeg !== undefined ? `90° to ${p.rangeStopDeg}°` : '',
    p.stage !== undefined && exercise.stages ? (exercise.stages[p.stage] ?? '') : '',
  ].filter(Boolean)
  return `${reps}${rpe}${load}${extra.length ? ` · ${extra.join(' · ')}` : ''}`
}

/** One logged set in words: "12 × plate 8 · RPE 7 · pain 2". */
export function setWords(set: SetLog, slot: Slot, exercise: Exercise): string {
  const count = set.seconds ?? set.reps ?? 0
  const parts = [`${count}${unitWord(slot.repUnit)}`]
  if (showsLoad(exercise)) parts[0] = `${parts[0]} × ${loadWords(set.load, exercise)}`
  if (set.heightIn !== undefined) parts.push(`${set.heightIn} in.`)
  if (set.rangeStopDeg !== undefined) parts.push(`to ${set.rangeStopDeg}°`)
  if (set.stage !== undefined && exercise.stages) parts.push(exercise.stages[set.stage] ?? '')
  if (set.rpe !== undefined) parts.push(`RPE ${set.rpe}`)
  parts.push(set.painDuring !== undefined ? `pain ${set.painDuring}` : 'pain not rated')
  if (set.stopped) parts.push(`stopped: ${stopReasonLabel(set.stopReason).toLowerCase()}`)
  return parts.filter(Boolean).join(' · ')
}

export function sideWords(side: SetSide, injuredSide: Side): string {
  if (side === 'both') return ''
  const name = side === 'left' ? 'Left' : 'Right'
  return side === injuredSide ? `${name} · injured` : name
}

/** Range stops the editor offers: the engine's ladder, never past the phase's stop. */
export function rangeStopOptions(phaseStopDeg: number | undefined): number[] {
  const stop = phaseStopDeg ?? 30
  return RANGE_LADDER_DEG.filter((deg) => deg < 90 && deg >= stop)
}

function newest(sets: readonly SetLog[]): SetLog | undefined {
  return [...sets].sort((a, b) => (a.loggedAt ?? '').localeCompare(b.loggedAt ?? '')).at(-1)
}

/** The most recent RPE logged for an exercise anywhere in history. */
export function lastRpeFor(exerciseId: string, sets: readonly SetLog[]): number | null {
  return newest(sets.filter((s) => s.exerciseId === exerciseId && s.rpe !== undefined))?.rpe ?? null
}

/** Pain stored on an exercise's sets this session (per-exercise mode writes the same value on each). */
export function loggedPain(slotSets: readonly SetLog[]): number | null {
  return newest(slotSets.filter((s) => s.painDuring !== undefined))?.painDuring ?? null
}

export interface PrefillInput {
  prescription: Prescription
  slot: Slot
  setNumber: number
  /** This slot's sets already logged this session, all sides. */
  slotSets: readonly SetLog[]
  /** The healthy side's per-set targets from the injured side's logged reps, or null on the injured side. */
  budget: number[] | null
  /** The last RPE logged for this exercise anywhere, for slots without a target. */
  historyRpe: number | null
  painPerSet: boolean
}

/**
 * What the editor shows before any tap. Load carries the last set logged on this slot and side (a
 * corrected pin carries forward), else the per-set repeat, else the prescription; a load to pick
 * shows 0. Count is the per-set repeat, else the healthy side's budget, else the target. RPE is the
 * slot's target, else the last logged; pain is never invented.
 */
export function prefill(input: PrefillInput): Draft {
  const { prescription: p, slot, setNumber, slotSets, budget } = input
  const sameSide = slotSets.filter((s) => s.side === p.side)
  const previous = newest(sameSide)
  const repeat = p.perSet?.[setNumber - 1]
  const load = previous?.load ?? repeat?.load ?? p.load ?? 0
  const budgeted = budget?.[setNumber - 1]
  const count = repeat?.reps ?? budgeted ?? p.repsTarget
  const rpe = slot.rpeTarget ?? (previous?.rpe ?? input.historyRpe)
  const pain = input.painPerSet ? (previous?.painDuring ?? null) : loggedPain(slotSets)
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

/** A draft from a set already logged, for editing it. */
export function draftFromSet(set: SetLog): Draft {
  return {
    load: set.load,
    count: set.seconds ?? set.reps ?? 0,
    rpe: set.rpe ?? null,
    pain: set.painDuring ?? null,
    ...(set.heightIn !== undefined ? { heightIn: set.heightIn } : {}),
    ...(set.rangeStopDeg !== undefined ? { rangeStopDeg: set.rangeStopDeg } : {}),
    ...(set.stage !== undefined ? { stage: set.stage } : {}),
  }
}

/** A first-time load still at 0 can't be logged: 0 would poison the history. */
export function needsLoadPick(prescription: Prescription, exercise: Exercise, draft: Draft): boolean {
  return prescription.load === null && showsLoad(exercise) && exercise.loadDirection !== 'down' && draft.load <= 0
}

/** The set as it will be stored. `loggedAt` is kept on corrections and stamped only on new sets. */
export function buildSet(input: {
  workoutId: string
  slot: Slot
  exercise: Exercise
  side: SetSide
  setNumber: number
  draft: Draft
  loggedAt: string
  stop?: StopReason
}): SetLog {
  const { slot, exercise, draft } = input
  const field = countField(slot.repUnit)
  return {
    id: '',
    workoutId: input.workoutId,
    slotId: slot.id,
    exerciseId: exercise.id,
    setNumber: input.setNumber,
    side: input.side,
    load: showsLoad(exercise) ? Math.max(0, draft.load) : 0,
    loadUnit: logLoadUnit(exercise),
    ...(field === 'seconds' ? { seconds: Math.max(0, draft.count) } : { reps: Math.max(0, Math.round(draft.count)) }),
    ...(draft.rpe !== null ? { rpe: draft.rpe } : {}),
    ...(draft.pain !== null ? { painDuring: draft.pain } : {}),
    stopped: input.stop !== undefined,
    ...(input.stop !== undefined ? { stopReason: input.stop } : {}),
    ...(draft.heightIn !== undefined ? { heightIn: draft.heightIn } : {}),
    ...(draft.rangeStopDeg !== undefined ? { rangeStopDeg: draft.rangeStopDeg } : {}),
    ...(draft.stage !== undefined ? { stage: draft.stage } : {}),
    loggedAt: input.loggedAt,
  }
}

/**
 * Swaps made in an earlier visit, recovered from the sets. An exercise id counts as a swap only when
 * it is neither the slot's own nor what the engine prescribed without a swap, so an engine move to an
 * easier version is never mistaken for a choice.
 */
export function swapsFromSets(
  plans: readonly { slot: Slot; prescriptions: readonly Pick<Prescription, 'exerciseId'>[] }[],
  sets: readonly SetLog[],
): Record<string, string> {
  const swaps: Record<string, string> = {}
  for (const { slot, prescriptions } of plans) {
    const last = newest(sets.filter((s) => s.slotId === slot.id))
    if (!last) continue
    const engine = new Set(prescriptions.map((p) => p.exerciseId))
    if (last.exerciseId !== slot.exerciseId && !engine.has(last.exerciseId)) swaps[slot.id] = last.exerciseId
  }
  return swaps
}

/** Stored swaps win over recovered ones; a stored null means "back to the slot's own exercise". */
export function mergeSwaps(fromSets: Record<string, string>, stored: Record<string, string | null>): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...fromSets }
  for (const [slotId, choice] of Object.entries(stored)) merged[slotId] = choice ?? undefined
  return merged
}

export function parseStoredSwaps(raw: string | null): Record<string, string | null> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string' || v === null) out[k] = v
    return out
  } catch {
    return {}
  }
}

export function loggedMaxPain(sets: readonly SetLog[]): number | null {
  const pains = sets.map((s) => s.painDuring).filter((p): p is number => p !== undefined)
  return pains.length ? Math.max(...pains) : null
}

/** "48 min" between two ISO instants, or null when either is missing. */
export function durationWords(startedAt: string | undefined, finishedAt: string | undefined): string | null {
  if (!startedAt || !finishedAt) return null
  const minutes = Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 60_000)
  if (!Number.isFinite(minutes) || minutes < 1) return null
  return minutes >= 90 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
}
