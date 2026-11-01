import type { SlotPlan } from '../app/session.ts'
import type { History } from '../db/repo.ts'
import { dayOf } from '../rules/calendar.ts'
import { afterMorningCheck } from '../rules/redFlags.ts'
import type { Day, IsoDate, MorningCheck, RedFlag, Run, RunType, SessionTemplate, SetSide, Settings, Side, Workout } from '../schema/index.ts'

/**
 * Pure helpers for the Morning check screen: words for dates and sessions, the form's state,
 * the check record it saves, and the grouping of the engine's notes. Nothing here decides anything
 * about the knee; readings and prescriptions come from src/rules through the screen.
 */

const DAY_WORDS: Record<Day, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

const MONTH_WORDS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** A YYYY-MM-DD date in words, "Tuesday Nov 3", with no clock or time zone involved. */
export function dateWords(date: IsoDate): string {
  const [, month, day] = date.split('-').map(Number)
  const monthWord = month === undefined ? '' : (MONTH_WORDS[month - 1] ?? '')
  return `${DAY_WORDS[dayOf(date)]} ${monthWord} ${day ?? ''}`.replace(/\s+/g, ' ').trim()
}

/** What a morning check is about: yesterday's lift or run. */
export type CheckSubject = { kind: 'workout'; workout: Workout } | { kind: 'run'; run: Run }

/** When a workout began, as a number for sorting; a workout with no instants sorts first. */
function startedInstant(workout: Workout): number {
  const text = workout.startedAt ?? workout.finishedAt
  if (text === undefined) return Number.NEGATIVE_INFINITY
  const instant = Date.parse(text)
  return Number.isNaN(instant) ? Number.NEGATIVE_INFINITY : instant
}

/**
 * The most recent workout or run dated `date`, else null. Workouts that were never started
 * (`planned`) did not happen, so they are skipped. Workouts carry instants and runs do not, so
 * when both share the day the latest-started workout is taken: its reading drives the next lift's
 * prescriptions, which is this screen's job. Among runs the last stored one is taken.
 */
export function subjectFor(workouts: readonly Workout[], runs: readonly Run[], date: IsoDate): CheckSubject | null {
  const happened = workouts.filter((w) => w.date === date && w.status !== 'planned')
  const latest = [...happened].sort((a, b) => startedInstant(b) - startedInstant(a))[0]
  if (latest) return { kind: 'workout', workout: latest }
  const run = runs.filter((r) => r.date === date).at(-1)
  return run ? { kind: 'run', run } : null
}

/** The explicit link stored on the check (PROMPT section 3: workoutId or runId). */
export function appliesTo(subject: CheckSubject | null): MorningCheck['appliesTo'] {
  if (!subject) return null
  return subject.kind === 'workout' ? { kind: 'workout', id: subject.workout.id } : { kind: 'run', id: subject.run.id }
}

/** "Session A" from a template id, or the id itself when the template is not in the program. */
export function sessionName(templateId: string, templates: readonly Pick<SessionTemplate, 'id' | 'letter'>[]): string {
  const template = templates.find((t) => t.id === templateId)
  return template ? `Session ${template.letter}` : templateId
}

const RUN_WORDS: Record<RunType, string> = {
  mbr: 'MBR run',
  easy: 'easy run',
  long: 'long run',
  'elliptical-swap': 'elliptical swap',
  'rower-swap': 'rower swap',
}

export function runWords(type: RunType): string {
  return RUN_WORDS[type]
}

const STATUS_WORDS: Partial<Record<Workout['status'], string>> = {
  abandoned: ' (stopped early)',
  'in-progress': ' (never finished)',
}

/** One sentence saying which session the check is for, with yesterday's date in words. */
export function subjectWords(subject: CheckSubject | null, yesterday: IsoDate, templates: readonly Pick<SessionTemplate, 'id' | 'letter'>[]): string {
  const when = dateWords(yesterday)
  if (!subject) return `No session was logged for yesterday, ${when}. This check stands on its own.`
  if (subject.kind === 'run') return `For yesterday's ${runWords(subject.run.type)}, ${when}.`
  const status = STATUS_WORDS[subject.workout.status] ?? ''
  return `For yesterday's ${sessionName(subject.workout.templateId, templates)}${status}, ${when}.`
}

/** The form's state: the four taps, the pain change, the ticked flags and the note. */
export interface CheckForm {
  stiffnessUnder30Min: boolean
  worseThanYesterday: boolean
  visibleSwelling: boolean
  warmth: boolean
  painChangePoints: number
  redFlags: string[]
  notes: string
}

/** Everything off: an untouched save reads hold, never clean (unknown is not clean). */
export function emptyForm(): CheckForm {
  return { stiffnessUnder30Min: false, worseThanYesterday: false, visibleSwelling: false, warmth: false, painChangePoints: 0, redFlags: [], notes: '' }
}

/** The form prefilled from a check already saved this morning, so a second save amends it. */
export function formFromCheck(check: MorningCheck): CheckForm {
  return {
    stiffnessUnder30Min: check.stiffnessUnder30Min,
    worseThanYesterday: check.worseThanYesterday,
    visibleSwelling: check.visibleSwelling,
    warmth: check.warmth,
    painChangePoints: check.painChangePoints,
    redFlags: [...check.redFlags],
    notes: check.notes ?? '',
  }
}

export function toggleFlag(flags: readonly string[], id: string): string[] {
  return flags.includes(id) ? flags.filter((f) => f !== id) : [...flags, id]
}

export const PAIN_CHANGE_MIN = -10
export const PAIN_CHANGE_MAX = 10

/** One check per morning: the id is the date, so saving twice replaces instead of duplicating. */
export function checkId(date: IsoDate): string {
  return `mc-${date}`
}

/** The record to save. Flags are stored in the program's order; a blank note is left off. */
export function buildCheck(input: { today: IsoDate; subject: CheckSubject | null; form: CheckForm; catalog: readonly RedFlag[] }): MorningCheck {
  const { today, subject, form, catalog } = input
  const notes = form.notes.trim()
  return {
    id: checkId(today),
    date: today,
    appliesTo: appliesTo(subject),
    stiffnessUnder30Min: form.stiffnessUnder30Min,
    worseThanYesterday: form.worseThanYesterday,
    visibleSwelling: form.visibleSwelling,
    warmth: form.warmth,
    painChangePoints: form.painChangePoints,
    redFlags: catalog.map((f) => f.id).filter((id) => form.redFlags.includes(id)),
    ...(notes.length > 0 ? { notes } : {}),
  }
}

/** The settings after the check: unchanged (same object) without a flag, the red-flag state otherwise (rule 9). */
export function settingsAfter(settings: Settings, check: MorningCheck): Settings {
  if (check.redFlags.length === 0) return settings
  return { ...settings, redFlag: afterMorningCheck(settings.redFlag, check) }
}

/** The history with the check in it, replacing an earlier save with the same id. */
export function withCheck(history: History, check: MorningCheck): History {
  return { ...history, morningChecks: [...history.morningChecks.filter((c) => c.id !== check.id), check] }
}

/** Each session letter runs once a week, so the next time this session comes round is next week. */
export function nextWeekFor(workout: Pick<Workout, 'week'>): number {
  return workout.week + 1
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

export function sideWords(side: SetSide, injuredSide: Side): string {
  if (side === 'both') return 'Both'
  return side === injuredSide ? `${capitalise(side)} (injured)` : capitalise(side)
}

export interface ExerciseSentence {
  slotId: string
  name: string
  optional: boolean
  /** One sentence, or one per side when the engine's notes differ between sides. */
  lines: string[]
}

/** One sentence per exercise of what changes next time, from each prescription's note. */
export function exerciseSentences(plans: readonly SlotPlan[], injuredSide: Side): ExerciseSentence[] {
  return plans.map((plan) => {
    const [first, ...rest] = plan.prescriptions
    let lines: string[]
    if (first === undefined) lines = ['Nothing is written for this slot.']
    else if (rest.some((p) => p.note !== first.note)) lines = plan.prescriptions.map((p) => `${sideWords(p.side, injuredSide)}: ${p.note}`)
    else lines = [first.note]
    return { slotId: plan.slot.id, name: plan.exercise.name, optional: plan.slot.optional, lines }
  })
}

/** A rejected write, in words. */
export function errorWords(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.trim().length > 0 ? text.trim() : 'no reason was given'
}
