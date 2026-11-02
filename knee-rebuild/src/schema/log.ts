import { z } from 'zod'
import { Day, Effort, IsoDate, IsoDateTime, LoadUnit, Pain, ReadingResult, Rpe, RunType, SetSide, Side, StopReason, WorkoutStatus } from './enums.ts'
import { EquipmentId } from './program.ts'

const id = z.string().min(1)

/** The gym every install starts at, and where a workout with no `locationId` happened (M4b). */
export const PLANET_FITNESS_LOCATION_ID = 'planet-fitness'

/** The two items program.md says to bring (its "Bring" row); a seed test keeps this in step with the list. */
export const DEFAULT_KIT: readonly EquipmentId[] = ['ankle-strap', 'mini-band']

const uniqueIds = (ids: readonly string[]) => new Set(ids).size === ids.length

/** One row, held in Dexie. Also carries the export and import controls' state. */
export const Settings = z.strictObject({
  injuredSide: Side,
  startDate: IsoDate,
  /**
   * Heaviest dumbbell on the rack. Presets 60, 75, 80. Frozen from M4b: each gym's own
   * `Location.dumbbellMaxLb` takes over, and the home gym is first written from this value.
   */
  dumbbellMax: z.number().int().positive(),
  restTimerSeconds: z.number().int().positive(),
  /** Pain per set when true; once per exercise when false. */
  painPerSet: z.boolean(),
  /** The phase the app is in. Advances only when Shawn confirms a gate, never by the calendar. */
  currentPhase: z.number().int().min(1).max(4).default(1),
  /** The program week the current phase was entered in; week-banded slots count from it. */
  phaseEnteredWeek: z.number().int().min(1).default(1),
  /** Set by any ticked red flag on a morning check; cleared from Settings with a note. */
  redFlag: z
    .strictObject({
      active: z.boolean(),
      since: IsoDate.optional(),
      items: z.array(id),
      clearedOn: IsoDate.optional(),
      clearNote: z.string().optional(),
    })
    .default({ active: false, items: [] }),
  /** The gym Today plans for; it stays until Shawn changes it (M4b). */
  activeLocationId: id.default(PLANET_FITNESS_LOCATION_ID),
  /** What Shawn carries to every gym, as equipment ids. */
  kit: z.array(EquipmentId).refine(uniqueIds, 'kit lists each item once').default(() => [...DEFAULT_KIT]),
})
export type Settings = z.infer<typeof Settings>

/**
 * A gym Shawn trains at (M4b, design section 2). `present` holds what is there; dumbbells are the
 * max, not an item (0 means none); things typed that program.md doesn't name are `extras`, kept
 * as text for the next program update and never treated as equipment.
 */
export const Location = z.strictObject({
  id,
  name: z.string().trim().min(1).max(60),
  present: z.array(EquipmentId).refine(uniqueIds, 'present lists each item once'),
  /** Heaviest dumbbell on the rack, in pounds; 0 means no dumbbells. */
  dumbbellMaxLb: z.number().int().nonnegative(),
  startedFrom: z.enum(['planet-fitness', 'empty']),
  /** Program.equipmentListVersion when this gym's list was made; items added to the program's list later are new to it. */
  listVersion: z.number().int().positive(),
  extras: z.array(z.strictObject({ id, text: z.string().trim().min(1), addedOn: IsoDate })),
  /** Items marked not here from the runner or Today, and since when. */
  markedOff: z.array(z.strictObject({ id: EquipmentId, on: IsoDate })),
  createdOn: IsoDate,
  /** Archived gyms leave the list but stay stored: workouts point at them. */
  archived: z.boolean(),
})
export type Location = z.infer<typeof Location>

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
  /** The gym, stamped at Start. Absent means Planet Fitness: every workout before M4b was there. */
  locationId: id.optional(),
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
  stopReason: StopReason.optional(),
  heightIn: z.number().positive().optional(),
  rangeStopDeg: z.number().positive().optional(),
  /** Index into the exercise's stages for the `stage` rule. */
  stage: z.number().int().nonnegative().optional(),
  /** The gym's rack stopped the load short of the prescription; such a set never counts as clean. */
  rackCapped: z.boolean().optional(),
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
    .strictObject({ kind: z.enum(['workout', 'run']), id })
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
  /** https and strava.com only: this gets rendered as a link. */
  stravaUrl: z.url({ protocol: /^https$/, hostname: /^(www\.)?strava\.com$/ }).optional(),
  notes: z.string().optional(),
  /** Where a swap (elliptical or rower) was done. Absent means Planet Fitness, or a run outside. */
  locationId: id.optional(),
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

/** A session moved within its week: the two days swap what they hold (PROMPT rule 10). */
export const SessionMove = z.strictObject({
  id,
  week: z.number().int().positive(),
  dayA: Day,
  dayB: Day,
})
export type SessionMove = z.infer<typeof SessionMove>
