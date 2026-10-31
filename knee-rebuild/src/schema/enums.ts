import { z } from 'zod'

/** The injured side and its opposite. */
export const Side = z.enum(['left', 'right'])
export type Side = z.infer<typeof Side>

/** Which side a set was logged for. `both` on bilateral slots. */
export const SetSide = z.enum(['left', 'right', 'both'])
export type SetSide = z.infer<typeof SetSide>

/**
 * Movement patterns from PROMPT section 3, plus `quad` (leg extension and wall sit are
 * knee-extension work, not a squat) and `cardio` (the optional elliptical finisher).
 */
export const Pattern = z.enum([
  'squat',
  'quad',
  'hinge',
  'single-leg',
  'hamstring',
  'hip',
  'calf',
  'balance',
  'plyo',
  'push',
  'pull',
  'core',
  'carry',
  'cardio',
])
export type Pattern = z.infer<typeof Pattern>

/**
 * How an exercise is loaded. PROMPT section 3's list plus `dumbbell-single` (goblet squats,
 * single-leg RDLs, suitcase carries hold one dumbbell) and `plates` (the 45° leg press is
 * plate-loaded, not a stack).
 */
export const LoadType = z.enum([
  'dumbbell-each',
  'dumbbell-single',
  'stack',
  'smith-plates',
  'plates',
  'bodyweight',
  'step-height',
  'band',
  'time',
])
export type LoadType = z.infer<typeof LoadType>

/** The unit a load is logged in. Stack machines are logged as the plate number on the pin. */
export const LoadUnit = z.enum(['lb', 'plate', 'in', 's', 'none'])
export type LoadUnit = z.infer<typeof LoadUnit>

/** What a slot's rep number counts. */
export const RepUnit = z.enum(['reps', 'seconds', 'minutes', 'yards', 'steps'])
export type RepUnit = z.infer<typeof RepUnit>

/**
 * PROMPT section 3's five rules plus `stage`: balance work has no load and progresses through
 * ordered stages (eyes open, eyes closed, folded mat, bosu).
 */
export const ProgressionRule = z.enum([
  'double-progression',
  'height-then-load',
  'range-then-load',
  'time',
  'fixed',
  'stage',
])
export type ProgressionRule = z.infer<typeof ProgressionRule>

export const SessionLetter = z.enum(['A', 'B', 'C'])
export type SessionLetter = z.infer<typeof SessionLetter>

export const RunType = z.enum(['mbr', 'easy', 'long', 'elliptical-swap', 'rower-swap'])
export type RunType = z.infer<typeof RunType>

export const Effort = z.enum(['easy', 'moderate', 'hard'])
export type Effort = z.infer<typeof Effort>

export const ReadingResult = z.enum(['clean', 'hold', 'back-off'])
export type ReadingResult = z.infer<typeof ReadingResult>

export const WorkoutStatus = z.enum(['planned', 'in-progress', 'finished', 'abandoned'])
export type WorkoutStatus = z.infer<typeof WorkoutStatus>

/** What a day of the weekly template holds. */
export const DaySession = z.enum(['run:mbr', 'lift:A', 'run:easy', 'lift:B', 'run:long', 'lift:C', 'off'])
export type DaySession = z.infer<typeof DaySession>

/** How a gate item is evaluated. `manual` items are toggles; the rest read logged data. */
export const GateEvaluator = z.enum([
  'manual',
  'clean-weeks',
  'symmetry',
  'calf-raises',
  'no-swelling',
  'run-no-reaction',
  'no-swelling-after-plyo',
])
export type GateEvaluator = z.infer<typeof GateEvaluator>

/** Calendar date in America/New_York, as YYYY-MM-DD, and a real date on the calendar. */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((text) => {
    const [y, m, d] = text.split('-').map(Number)
    if (y === undefined || m === undefined || d === undefined) return false
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  }, 'not a real calendar date')
export type IsoDate = z.infer<typeof IsoDate>

/** Instant, as an ISO 8601 timestamp with an offset. */
export const IsoDateTime = z.iso.datetime({ offset: true })
export type IsoDateTime = z.infer<typeof IsoDateTime>

export const Pain = z.number().int().min(0).max(10)
export const Rpe = z.number().min(1).max(10)
