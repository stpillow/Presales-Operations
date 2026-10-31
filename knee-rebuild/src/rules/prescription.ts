import type { Exercise, LoadUnit, ReadingResult, RepUnit, SetLog, SetSide, Side, Slot } from '../schema/index.ts'
import { isDeloadWeek } from './calendar.ts'
import { prescribedSets } from './deload.ts'

/** Why the prescription is what it is. Every basis has a one-sentence note for the screen. */
export type Basis =
  | 'first'
  | 'deload'
  | 'suspended'
  | 'progress-load'
  | 'progress-reps'
  | 'progress-height'
  | 'progress-range'
  | 'progress-stage'
  | 'same'
  | 'repeat'
  | 'back-off'
  | 'at-top'

export interface Prescription {
  /** The exercise to run: the slot's current one, or a substitution the rules moved it to. */
  exerciseId: string
  side: SetSide
  sets: number
  /** Null means "choose": a first session with nothing to go on. */
  load: number | null
  loadUnit: LoadUnit
  /** Target reps, seconds, yards or steps per set, in `repUnit`. */
  repsTarget: number
  repUnit: RepUnit
  /** When a session is repeated exactly: each set's load and reps from last time. */
  perSet?: { load: number; reps: number }[]
  heightIn?: number
  rangeStopDeg?: number
  stage?: number
  /** Healthy side: its per-set rep targets come from what the injured side just did (rule 5). */
  budgetFromInjured?: boolean
  basis: Basis
  note: string
}

export interface PrescriptionInput {
  slot: Slot
  /** The exercise the slot currently runs: its own, or a substitution. */
  exercise: Exercise
  /** The slot's substitutions, resolved, in order. */
  substitutions: Exercise[]
  /** Combined readings for this exercise, most recent first. */
  readings: ReadingResult[]
  /** The last session's sets for this exercise, both sides. */
  lastSets: SetLog[]
  week: number
  injuredSide: Side
  dumbbellMax: number
  redFlagActive: boolean
}

export type Effective = 'none' | 'clean-twice' | 'clean-once' | 'hold' | 'back-off'

/**
 * What the last two combined readings add up to. Two holds in a row read back-off
 * (PROGRAM-QUESTIONS 4, from program.md's "two off sessions in a row").
 */
export function effectiveReading(readings: readonly ReadingResult[]): Effective {
  const [r1, r2] = readings
  if (r1 === undefined) return 'none'
  if (r1 === 'back-off') return 'back-off'
  if (r1 === 'hold') return r2 === 'hold' ? 'back-off' : 'hold'
  return r2 === 'clean' ? 'clean-twice' : 'clean-once'
}

/** Back-off: load × 0.75 rounded down to the increment (rule 4). */
export function backOffLoad(load: number, increment: number): number {
  if (increment <= 0) return Math.floor(load * 0.75)
  return Math.floor((load * 0.75) / increment) * increment
}

export const RPE_CEILING = 8
export const RANGE_LADDER_DEG: readonly number[] = [90, 45, 30]
/** Dumbbells held on a step-height exercise move in 5 lb steps (program.md loading rules). */
export const HELD_LOAD_INCREMENT_LB = 5
const DUMBBELL_TYPES = new Set(['dumbbell-each', 'dumbbell-single'])
const LOAD_RULES = new Set(['double-progression', 'height-then-load', 'range-then-load'])

const value = (s: SetLog) => s.reps ?? s.seconds ?? 0
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function sidesFor(slot: Slot, injuredSide: Side): SetSide[] {
  if (!slot.unilateral) return ['both']
  const other: Side = injuredSide === 'left' ? 'right' : 'left'
  return slot.injuredOnly ? [injuredSide] : [injuredSide, other]
}

function startLoad(exercise: Exercise): number | null {
  switch (exercise.loadType) {
    case 'bodyweight':
    case 'time':
    case 'band':
    case 'step-height':
      return 0
    default:
      return null
  }
}

function hitTop(sets: readonly SetLog[], slot: Slot): boolean {
  if (sets.length === 0) return false
  const needsRpe = LOAD_RULES.has(slot.progressionRule)
  return sets.every((s) => !s.stopped && value(s) >= slot.repsMax && (!needsRpe || (s.rpe !== undefined && s.rpe <= RPE_CEILING)))
}

/** Rule 4: the next prescription for one slot, per side, injured side first. */
export function prescribe(input: PrescriptionInput): Prescription[] {
  const sides = sidesFor(input.slot, input.injuredSide)
  const out: Prescription[] = []
  let injuredTarget: number | undefined
  for (const side of sides) {
    const p = prescribeSide(input, side)
    if (side !== 'both' && side !== input.injuredSide && injuredTarget !== undefined) {
      p.repsTarget = injuredTarget
      p.budgetFromInjured = true
    }
    if (side === input.injuredSide) injuredTarget = p.repsTarget
    out.push(p)
  }
  return out
}

function prescribeSide(input: PrescriptionInput, side: SetSide): Prescription {
  const { slot, exercise, week } = input
  const sets = prescribedSets(slot.sets, week)
  const deload = isDeloadWeek(week)
  const last = input.lastSets.filter((s) => s.side === side).sort((a, b) => a.setNumber - b.setNumber)
  const base = {
    exerciseId: exercise.id,
    side,
    sets,
    loadUnit: exercise.loadUnit,
    repUnit: slot.repUnit,
    ...(slot.heightIn !== undefined ? { heightIn: slot.heightIn } : {}),
    ...(slot.rangeStopDeg !== undefined ? { rangeStopDeg: slot.rangeStopDeg } : {}),
    ...(exercise.stages ? { stage: 0 } : {}),
  }

  if (last.length === 0) {
    const load = startLoad(exercise)
    const rpe = slot.rpeTarget === undefined ? '' : ` that lands at RPE ${slot.rpeTarget}`
    return {
      ...base,
      load,
      repsTarget: slot.repsMin,
      basis: 'first',
      note: deload
        ? `First time in a deload week: the lightest version, ${sets} sets, perfect reps.`
        : load === null
          ? `First time: pick a load${rpe} and start at ${slot.repsMin} ${slot.repUnit}.`
          : `First time: start at ${slot.repsMin} ${slot.repUnit}.`,
    }
  }

  const first = last[0]
  const lastLoad = first?.load ?? 0
  const lastHeight = first?.heightIn ?? slot.heightIn
  const lastStop = first?.rangeStopDeg ?? slot.rangeStopDeg
  const lastStage = first?.stage ?? 0
  const lastTarget = clamp(Math.max(...last.map(value)), slot.repsMin, slot.repsMax)
  const carried = {
    ...base,
    ...(lastHeight !== undefined ? { heightIn: lastHeight } : {}),
    ...(lastStop !== undefined ? { rangeStopDeg: lastStop } : {}),
    ...(exercise.stages ? { stage: lastStage } : {}),
  }
  const perSet = last.slice(0, sets).map((s) => ({ load: s.load, reps: value(s) }))
  const repeat = (basis: Basis, note: string): Prescription => ({ ...carried, load: lastLoad, repsTarget: lastTarget, perSet, basis, note })

  if (deload) return repeat('deload', `Deload week: ${sets} sets instead of ${slot.sets}, same loads and reps, no progression.`)
  if (input.redFlagActive) return repeat('suspended', 'Red-flag state: progression is suspended; repeat the last session exactly.')

  switch (effectiveReading(input.readings)) {
    case 'none':
      return repeat('repeat', 'No reading for the last session, and unknown is not clean: repeat it exactly.')
    case 'hold':
      return repeat('repeat', 'Hold: repeat the last session’s loads and reps exactly.')
    case 'back-off':
      return capDumbbells(input, backOff(input, carried, lastLoad, lastHeight, lastStage, lastTarget, sets))
    case 'clean-once':
      return { ...carried, load: lastLoad, repsTarget: lastTarget, basis: 'same', note: 'Clean once: same load, same target; clean again to progress.' }
    case 'clean-twice':
      break
  }

  if (!hitTop(last, slot)) {
    const needsRpe = LOAD_RULES.has(slot.progressionRule) ? ` at RPE ${RPE_CEILING} or under` : ''
    return {
      ...carried,
      load: lastLoad,
      repsTarget: slot.repsMax,
      basis: 'progress-reps',
      note: `Clean twice: same load, every set to ${slot.repsMax} ${slot.repUnit}${needsRpe}, then the load moves.`,
    }
  }
  return capDumbbells(input, progress(input, carried, lastLoad, lastHeight, lastStop, lastStage, lastTarget))
}

function progress(
  input: PrescriptionInput,
  carried: Omit<Prescription, 'load' | 'repsTarget' | 'basis' | 'note'>,
  lastLoad: number,
  lastHeight: number | undefined,
  lastStop: number | undefined,
  lastStage: number,
  lastTarget: number,
): Prescription {
  const { slot, exercise } = input
  const inc = exercise.increment
  const up = (load: number, note: string): Prescription => ({ ...carried, load, repsTarget: slot.repsMin, basis: 'progress-load', note })
  const stay = (note: string): Prescription => ({ ...carried, load: lastLoad, repsTarget: lastTarget, basis: 'at-top', note })

  switch (slot.progressionRule) {
    case 'double-progression': {
      if (exercise.loadDirection === 'down') {
        return up(Math.max(0, lastLoad - inc), `Clean twice at the top of the range: one plate less assist, back to ${slot.repsMin}.`)
      }
      return up(lastLoad + inc, `Clean twice at the top of the range: load up one step (${inc} ${exercise.loadUnit}), back to ${slot.repsMin} ${slot.repUnit}.`)
    }
    case 'height-then-load': {
      const height = lastHeight ?? 0
      const heightInc = exercise.heightIncrementIn ?? inc
      const holds = exercise.holdsLoad !== undefined
      if (holds && slot.loadBeforeHeightLb !== undefined && lastLoad < slot.loadBeforeHeightLb) {
        return up(lastLoad + HELD_LOAD_INCREMENT_LB, `Clean twice: ${HELD_LOAD_INCREMENT_LB} lb more in the hands; height moves once the dumbbells reach ${slot.loadBeforeHeightLb} lb.`)
      }
      if (slot.heightMaxIn === undefined || height + heightInc <= slot.heightMaxIn) {
        return { ...carried, heightIn: height + heightInc, load: lastLoad, repsTarget: slot.repsMin, basis: 'progress-height', note: `Clean twice: step up ${heightInc} in. to ${height + heightInc} in., same load; height before load.` }
      }
      if (holds) return up(lastLoad + HELD_LOAD_INCREMENT_LB, `At the phase’s top height (${slot.heightMaxIn} in.): ${HELD_LOAD_INCREMENT_LB} lb more in the hands.`)
      return stay(`At the phase’s top height (${slot.heightMaxIn} in.); nothing more to add here.`)
    }
    case 'range-then-load': {
      const phaseStop = slot.rangeStopDeg ?? RANGE_LADDER_DEG[RANGE_LADDER_DEG.length - 1] ?? 30
      const current = lastStop ?? RANGE_LADDER_DEG[0] ?? 90
      if (current > phaseStop) {
        const next = RANGE_LADDER_DEG.find((deg) => deg < current && deg >= phaseStop) ?? phaseStop
        return { ...carried, rangeStopDeg: next, load: lastLoad, repsTarget: slot.repsMin, basis: 'progress-range', note: `Clean twice: range stop moves from ${current}° to ${next}°, same load; range before load.` }
      }
      return up(lastLoad + inc, `Clean twice at the phase’s range (to ${phaseStop}°): load up one plate, back to ${slot.repsMin}.`)
    }
    case 'stage': {
      const stages = exercise.stages ?? []
      if (lastStage + 1 < stages.length) {
        return { ...carried, stage: lastStage + 1, load: lastLoad, repsTarget: slot.repsMax, basis: 'progress-stage', note: `Clean twice: next stage, ${stages[lastStage + 1]}.` }
      }
      return stay(`At the last stage (${stages[lastStage] ?? 'top'}); nothing further is written.`)
    }
    case 'time':
      return stay(`Clean twice at ${slot.repsMax} s: the next notch is the version written for the next phase.`)
    case 'fixed':
      return stay('Fixed prescription: reps stay in range, nothing is loaded.')
  }
}

function backOff(
  input: PrescriptionInput,
  carried: Omit<Prescription, 'load' | 'repsTarget' | 'basis' | 'note'>,
  lastLoad: number,
  lastHeight: number | undefined,
  lastStage: number,
  lastTarget: number,
  sets: number,
): Prescription {
  const { slot, exercise } = input
  const inc = exercise.increment
  const result = (p: Partial<Prescription> & { note: string }): Prescription => ({ ...carried, load: lastLoad, repsTarget: lastTarget, basis: 'back-off', ...p })

  if (exercise.loadDirection === 'down') {
    return result({ load: lastLoad + inc, note: 'Back off: one plate more assist.' })
  }
  if (slot.progressionRule === 'stage') {
    const stages = exercise.stages ?? []
    const stage = Math.max(0, lastStage - 1)
    return result({ stage, note: `Back off: back a stage, to ${stages[stage] ?? 'the start'}.` })
  }
  if (slot.progressionRule === 'time') {
    return result({ repsTarget: Math.max(slot.repsMin, lastTarget - 5), note: 'Back off: 5 s less per set.' })
  }
  if (exercise.loadType === 'step-height') {
    const floor = slot.heightIn ?? 0
    const heightInc = exercise.heightIncrementIn ?? inc
    if (lastHeight !== undefined && lastHeight - heightInc >= floor) {
      return result({ heightIn: lastHeight - heightInc, note: `Back off: step down ${heightInc} in. to ${lastHeight - heightInc} in., same load.` })
    }
    if (lastLoad > 0) {
      const load = backOffLoad(lastLoad, HELD_LOAD_INCREMENT_LB)
      return result({ load, note: `Back off: ${load} lb in the hands at the starting height.` })
    }
  }
  if (exercise.loadType === 'bodyweight' || exercise.loadType === 'step-height' || lastLoad <= 0) {
    const sub = input.substitutions[0]
    if (sub) return result({ exerciseId: sub.id, load: startLoad(sub), note: `Back off: the easier version, ${sub.name}.` })
    const fewer = Math.max(1, Math.floor(sets * 0.75))
    return result({ sets: fewer, note: `Back off: ${fewer} sets instead of ${sets}; nothing lighter is written.` })
  }
  const load = backOffLoad(lastLoad, inc)
  return result({ load, note: `Back off: load × 0.75, rounded down to ${load} ${exercise.loadUnit}.` })
}

/** The dumbbell cap (PROGRAM-QUESTIONS 9): past the rack, the slot moves to its next substitution. */
function capDumbbells(input: PrescriptionInput, p: Prescription): Prescription {
  const { exercise } = input
  const holdsDumbbells = DUMBBELL_TYPES.has(exercise.loadType) || (exercise.holdsLoad !== undefined && DUMBBELL_TYPES.has(exercise.holdsLoad))
  if (!holdsDumbbells || p.load === null || p.load <= input.dumbbellMax || p.exerciseId !== exercise.id) return p
  const sub = input.substitutions[0]
  if (!sub) return { ...p, load: input.dumbbellMax, note: `${p.note} The rack stops at ${input.dumbbellMax} lb and nothing is written to swap to.` }
  return { ...p, exerciseId: sub.id, load: null, note: `${p.note} That is past the rack’s ${input.dumbbellMax} lb dumbbells: swap to ${sub.name} and pick its load.` }
}
