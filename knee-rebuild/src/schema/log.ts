import { z } from 'zod'
import { Effort, IsoDate, IsoDateTime, LoadUnit, Pain, ReadingResult, Rpe, RunType, SetSide, Side, WorkoutStatus } from './enums.ts'

const id = z.string().min(1)

/** One row, held in Dexie. Also carries the export and import controls' state. */
export const Settings = z.strictObject({
  injuredSide: Side,
  startDate: IsoDate,
  /** Heaviest dumbbell on the rack. Presets 60, 75, 80. */
  dumbbellMax: z.number().int().positive(),
  restTimerSeconds: z.number().int().positive(),
  /** Pain per set when true; once per exercise when false. */
  painPerSet: z.boolean(),
  /** Set by any ticked red flag on a morning check; cleared from Settings with a note. */
  redFlag: z
    .object({
      active: z.boolean(),
      since: IsoDate.optional(),
      items: z.array(id),
      clearedOn: IsoDate.optional(),
      clearNote: z.string().optional(),
    })
    .default({ active: false, items: [] }),
})
export type Settings = z.infer<typeof Settings>

/** One per lift day. */
export const Workout = z.strictObject({
  id,
  date: IsoDate,
  templateId: id,
  phase: z.number().int().min(1).max(4),
  week: z.number().int().min(1),
  isDeload: z.boolean(),
  startedAt: IsoDateTime.optional(),
  finishedAt: IsoDateTime.optional(),
  maxPainDuring: Pain.optional(),
  notes: z.string().optional(),
  status: WorkoutStatus,
})
export type Workout = z.infer<typeof Workout>

/** One logged set. `exerciseId` is stored because a swap changes which exercise the slot ran. */
export const SetLog = z.strictObject({
  id,
  workoutId: id,
  slotId: id,
  exerciseId: id,
  setNumber: z.number().int().positive(),
  /** Required on unilateral slots; the injured side is logged first. */
  side: SetSide,
  load: z.number().nonnegative(),
  loadUnit: LoadUnit,
  reps: z.number().int().nonnegative().optional(),
  seconds: z.number().nonnegative().optional(),
  rpe: Rpe.optional(),
  painDuring: Pain.optional(),
  stopped: z.boolean().default(false),
  stopReason: z.string().optional(),
  heightIn: z.number().positive().optional(),
  rangeStopDeg: z.number().positive().optional(),
  /** Index into the exercise's stages for the `stage` rule. */
  stage: z.number().int().nonnegative().optional(),
  loggedAt: IsoDateTime.optional(),
}).refine((set) => (set.reps === undefined) !== (set.seconds === undefined), {
  message: 'a set logs reps or seconds, exactly one of them',
})
export type SetLog = z.infer<typeof SetLog>

/** Four taps plus an optional note, the morning after a session. */
export const MorningCheck = z.strictObject({
  id,
  date: IsoDate,
  appliesTo: z
    .object({ kind: z.enum(['workout', 'run']), id })
    .nullable(),
  stiffnessUnder30Min: z.boolean(),
  worseThanYesterday: z.boolean(),
  visibleSwelling: z.boolean(),
  warmth: z.boolean(),
  /** Pain change versus the day before, in points. */
  painChangePoints: z.number().int().min(-10).max(10),
  /** Red flag ids ticked. Any entry puts the app in the red-flag state. */
  redFlags: z.array(id),
  notes: z.string().optional(),
})
export type MorningCheck = z.infer<typeof MorningCheck>

/** Swaps count as the week's session but add no miles. */
export const Run = z.strictObject({
  id,
  date: IsoDate,
  type: RunType,
  miles: z.number().nonnegative(),
  minutes: z.number().nonnegative(),
  effort: Effort,
  maxPain: Pain,
  strides: z.boolean().default(false),
  tempo: z.boolean().default(false),
  /** https only: this gets rendered as a link. */
  stravaUrl: z.url({ protocol: /^https$/ }).optional(),
  notes: z.string().optional(),
})
export type Run = z.infer<typeof Run>

/** A gate test entry. Hop tests store three trials per side and keep the best. */
export const GateTest = z.strictObject({
  id,
  date: IsoDate,
  gate: z.number().int().min(1).max(3),
  item: id,
  valueInjured: z.number().nonnegative(),
  valueOther: z.number().nonnegative(),
  trialsInjured: z.array(z.number().nonnegative()).optional(),
  trialsOther: z.array(z.number().nonnegative()).optional(),
  pass: z.boolean(),
  manual: z.boolean(),
  notes: z.string().optional(),
})
export type GateTest = z.infer<typeof GateTest>

/** Computed, never stored. */
export const Reading = z.strictObject({
  subject: z.strictObject({ kind: z.enum(['workout', 'run', 'exercise']), id }),
  result: ReadingResult,
  reasons: z.array(z.string()),
})
export type Reading = z.infer<typeof Reading>
