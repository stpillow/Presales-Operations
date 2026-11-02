import type { History } from '../db/repo.ts'
import { addDays, dateOf, dayOf, daysBetween, scheduledSession, weekOf } from '../rules/calendar.ts'
import { attachChecks, runReading, subjectReadings } from '../rules/history.ts'
import { isSwap } from '../rules/mileage.ts'
import { morningCheckApplies, morningReading } from '../rules/reading.ts'
import { progressionSuspended, stopMessage } from '../rules/redFlags.ts'
import { phaseWeekOf } from '../rules/session.ts'
import { runTypeFor, runsInWeek, suggestRun, weekMilesSummary, type RunSuggestion, type WeekMiles } from '../rules/weekPlan.ts'
import { Effort, Run, RunType, type Day, type DaySession, type IsoDate, type MorningCheck, type Program, type ReadingResult, type Settings } from '../schema/index.ts'
import { dateWords, runLabel, sessionLabel, shortDateWords } from './Today.helpers.ts'

/**
 * Pure helpers for the Run logger: which dates a run can be logged for, the view the screen renders,
 * the form's state and the Run it saves, and the words for all of it. Every knee and mileage
 * decision (the week's target and its cap, the suggested run, the swap call, readings, the red-flag
 * state) is asked of src/rules; this file composes the answers and names things.
 */

export type HistoryLike = Pick<History, 'workouts' | 'setLogs' | 'morningChecks' | 'runs' | 'sessionMoves'>
export type ProgramLike = Pick<Program, 'weeklyTemplate' | 'weeklyTemplateRows' | 'mileagePlan' | 'redFlags'>

/** The five types, in the order the screen offers them. */
export const RUN_TYPES: readonly RunType[] = RunType.options
/** The two swaps the suggestion can offer, elliptical first as the weekly template's Wednesday note has it. */
export const SWAP_TYPES: readonly RunType[] = ['elliptical-swap', 'rower-swap']
export const EFFORTS: readonly Effort[] = Effort.options

export const MILES_STEP = 0.25
/** One run's ceiling: far over any run in the plan, low enough that a stray extra digit can't save as typed. */
export const MILES_MAX = 30
export const MINUTES_STEP = 5
export const MINUTES_MAX = 600

const EFFORT_WORDS: Record<Effort, string> = { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' }

export function effortWords(effort: Effort): string {
  return EFFORT_WORDS[effort]
}

const SHORT_DAY: Record<Day, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }

/** "Today", else the weekday ("Mon"): inside one program week the weekday names the date. */
export function dayChoiceWords(date: IsoDate, today: IsoDate): string {
  return date === today ? 'Today' : SHORT_DAY[dayOf(date)]
}

/** The dates a run can be logged for: this program week's Monday up to today. Empty before the program starts. */
export function dateChoices(today: IsoDate, startDate: IsoDate): IsoDate[] {
  const week = weekOf(today, startDate)
  if (week < 1) return []
  const monday = dateOf(startDate, week, 'mon')
  return Array.from({ length: daysBetween(monday, today) + 1 }, (_, i) => addDays(monday, i))
}

const SESSION_FOR: Partial<Record<RunType, DaySession>> = { mbr: 'run:mbr', easy: 'run:easy', long: 'run:long' }

/**
 * Which run the engine is asked to suggest: the run being logged when its type is a run, else the
 * day's scheduled run (so a swap taken on a run day still shows that run's suggestion), else none.
 */
export function suggestionSession(scheduled: DaySession, type: RunType | null): DaySession | null {
  const own = type === null ? undefined : SESSION_FOR[type]
  if (own) return own
  return runTypeFor(scheduled) ? scheduled : null
}

/** That date's morning reading, from the check logged that morning, or null when none was. */
export function morningFor(date: IsoDate, checks: readonly MorningCheck[]): ReadingResult | null {
  const check = checks.find((c) => c.date === date)
  return check ? morningReading(check).result : null
}

export type LoggerView =
  | { kind: 'before-start'; line: string }
  | {
      kind: 'form'
      week: number
      /** The date being logged: the one picked when it is still a choice, else today. */
      date: IsoDate
      dates: IsoDate[]
      scheduled: DaySession
      /** "Session A", "Run: MBR", "Off: Kona walk and mobility only". */
      scheduledLabel: string
      /** The type the day's scheduled session preselects (runTypeFor), or null on a lift or off day. */
      preselected: RunType | null
      /** The type being logged: the one picked, else the preselection. */
      type: RunType | null
      /** Null when no run is scheduled or picked, or while the red-flag state suspends progression. */
      suggestion: RunSuggestion | null
      stop: { headline: string; items: string[] } | null
      summary: WeekMiles
      /** This program week's runs, by date. */
      weekRuns: Run[]
    }

/** Everything the Run logger renders, from today, what was picked, the settings, the stored history and the program. */
export function loggerView(input: {
  today: IsoDate
  picked: { date: IsoDate | null; type: RunType | null }
  settings: Settings
  history: HistoryLike
  program: ProgramLike
}): LoggerView {
  const { today, picked, settings, history, program } = input
  const dates = dateChoices(today, settings.startDate)
  if (dates.length === 0) return { kind: 'before-start', line: `Week 1 starts ${shortDateWords(settings.startDate)}` }

  const date = picked.date !== null && dates.includes(picked.date) ? picked.date : today
  const { week, session } = scheduledSession(date, settings.startDate, program.weeklyTemplate, history.sessionMoves)
  const scheduled: DaySession = session ?? 'off'
  const preselected = runTypeFor(scheduled)
  const type = picked.type ?? preselected

  const records = attachChecks(history.workouts, history.setLogs, history.morningChecks)
  const readings = subjectReadings(records, history.runs, history.morningChecks, settings.injuredSide)
  const summary = weekMilesSummary(program.mileagePlan, week, settings.startDate, history.runs, readings)
  const weekRuns = runsInWeek(history.runs, settings.startDate, week).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  const stop = stopMessage(settings.redFlag, program.redFlags)
  const suggestFor = suggestionSession(scheduled, type)
  const suggestion =
    progressionSuspended(settings.redFlag) || suggestFor === null
      ? null
      : suggestRun({
          session: suggestFor,
          week,
          target: summary.target.target,
          milesSoFar: summary.miles,
          currentPhase: settings.currentPhase,
          phaseWeek: phaseWeekOf(Math.max(week, settings.phaseEnteredWeek), settings.phaseEnteredWeek),
          morning: morningFor(date, history.morningChecks),
        })

  return {
    kind: 'form',
    week,
    date,
    dates,
    scheduled,
    scheduledLabel: sessionLabel(scheduled, program.weeklyTemplateRows),
    preselected,
    type,
    suggestion,
    stop,
    summary,
    weekRuns,
  }
}

/** The screen's lead: the date being logged and what it holds. */
export function leadWords(view: { date: IsoDate; scheduledLabel: string }): string {
  return `${dateWords(view.date)} · ${view.scheduledLabel}`
}

/** What the suggestion block says when there is no suggestion. */
export function noSuggestionWords(view: { date: IsoDate; scheduledLabel: string; type: RunType | null; stop: unknown }, today: IsoDate): string {
  if (view.stop) return 'No run is suggested while the red-flag state is on.'
  const day = view.date === today ? 'Today' : (dateWords(view.date).split(',')[0] ?? 'That day')
  const base = `${day} holds ${view.scheduledLabel}, not a run, so there is no suggestion.`
  return view.type === null ? `${base} Pick the type to log one anyway.` : base
}

/** "Run: easy · 3 miles" or, outside the plan, the type alone: the run the engine plans. */
export function runPlanWords(suggestion: RunSuggestion): string {
  return suggestion.miles === null ? runLabel(suggestion.type) : `${runLabel(suggestion.type)} · ${milesWords(suggestion.miles)}`
}

/**
 * The head of the suggestion block: the swap when the engine calls for one (as Today says it), else
 * the run and its miles. The run's plan is still shown under a swap head, for a run done anyway.
 */
export function suggestionHead(suggestion: RunSuggestion): string {
  return suggestion.swapSuggested ? 'An elliptical or rower swap' : runPlanWords(suggestion)
}

/** The engine's reasons are lowercase fragments; on screen each is a sentence. */
export function reasonSentence(reason: string): string {
  const text = reason.trim()
  if (text.length === 0) return text
  const capital = text.charAt(0).toUpperCase() + text.slice(1)
  return /[.!?]$/.test(capital) ? capital : `${capital}.`
}

/** "Take the elliptical swap". */
export function takeSwapWords(type: RunType): string {
  return `Take the ${runLabel(type).toLowerCase()}`
}

/** Whether a type is a swap: asked of the mileage rules, which own what counts as miles. */
export function isSwapType(type: RunType | null): boolean {
  return type !== null && isSwap({ type })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 3 → "3", 2.5 → "2.5", 2.25 → "2.25". */
export function milesNumber(miles: number): string {
  return String(round2(miles))
}

/** "1 mile", "2.5 miles". */
export function milesWords(miles: number): string {
  return `${milesNumber(miles)} ${round2(miles) === 1 ? 'mile' : 'miles'}`
}

/**
 * The line that updates as you type: "This week: 3 of 10 miles · with this run 6 · target from the
 * plan", with the rule's own reason in place of "target from the plan" when the target is capped
 * or outside the plan. A swap adds no miles, and the line says so instead of a sum.
 */
export function weekLine(summary: Pick<WeekMiles, 'miles' | 'target'>, pending: { type: RunType | null; miles: number } | null): string {
  const { target, miles } = summary
  const parts = [target.target === null ? `This week: ${milesWords(miles)}` : `This week: ${milesNumber(miles)} of ${milesWords(target.target)}`]
  if (pending) parts.push(isSwapType(pending.type) ? 'a swap adds no miles' : `with this run ${milesNumber(miles + pending.miles)}`)
  parts.push(target.target === null || target.capped ? target.reason : 'target from the plan')
  return parts.join(' · ')
}

/** The form as typed. Null means "follow what the screen preselects or the engine suggests". */
export interface RunForm {
  date: IsoDate | null
  type: RunType | null
  miles: number | null
  minutes: number
  effort: Effort
  /** Null until rated: max pain is required, and unknown is not clean. */
  maxPain: number | null
  strides: boolean | null
  tempo: boolean | null
  stravaUrl: string
  notes: string
}

export function emptyForm(): RunForm {
  return { date: null, type: null, miles: null, minutes: 0, effort: 'easy', maxPain: null, strides: null, tempo: null, stravaUrl: '', notes: '' }
}

/** The form with every "follow" filled in: what the screen shows and what Save would log. */
export interface ResolvedForm {
  date: IsoDate
  type: RunType | null
  swap: boolean
  miles: number
  minutes: number
  effort: Effort
  maxPain: number | null
  strides: boolean
  tempo: boolean
  stravaUrl: string
  notes: string
}

/** Miles, strides and tempo follow the suggestion until touched; a swap logs 0 miles and neither strides nor tempo. */
export function resolveForm(form: RunForm, view: { date: IsoDate; type: RunType | null; suggestion: RunSuggestion | null }): ResolvedForm {
  const swap = isSwapType(view.type)
  return {
    date: view.date,
    type: view.type,
    swap,
    miles: swap ? 0 : (form.miles ?? view.suggestion?.miles ?? 0),
    minutes: form.minutes,
    effort: form.effort,
    maxPain: form.maxPain,
    strides: swap ? false : (form.strides ?? view.suggestion?.strides ?? false),
    tempo: swap ? false : (form.tempo ?? view.suggestion?.tempo ?? false),
    stravaUrl: form.stravaUrl,
    notes: form.notes,
  }
}

/** The schema's refusal of a Strava link, in words; null for an empty field or a link it accepts. */
export function stravaProblem(text: string): string | null {
  const link = text.trim()
  if (link.length === 0) return null
  if (Run.shape.stravaUrl.safeParse(link).success) return null
  return 'That Strava link was refused: it has to be an https address on strava.com, like https://www.strava.com/activities/123. Fix it or clear it to save.'
}

export type RunDraft = { ok: true; run: Run } | { ok: false; blocker: string }

/** The Run that Save logs, or the words on the disabled Save button saying what is missing. */
export function toRun(form: ResolvedForm, id: string): RunDraft {
  const { type, maxPain } = form
  if (type === null && maxPain === null) return { ok: false, blocker: 'Pick the type and rate max pain first' }
  if (maxPain === null) return { ok: false, blocker: 'Rate max pain first' }
  if (type === null) return { ok: false, blocker: 'Pick the type first' }
  // A swap logs no miles, so its minutes are all it measures: an untouched 0 would store a session as nothing.
  if (form.swap && form.minutes === 0) return { ok: false, blocker: 'Set the minutes first' }
  if (stravaProblem(form.stravaUrl)) return { ok: false, blocker: 'Fix or clear the Strava link first' }
  const link = form.stravaUrl.trim()
  const notes = form.notes.trim()
  return {
    ok: true,
    run: {
      id,
      date: form.date,
      type,
      miles: form.swap ? 0 : round2(form.miles),
      minutes: form.minutes,
      effort: form.effort,
      maxPain,
      strides: form.swap ? false : form.strides,
      tempo: form.swap ? false : form.tempo,
      ...(link.length > 0 ? { stravaUrl: link } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    },
  }
}

/** A readable run id that cannot collide with another run that day. */
export function newRunId(date: IsoDate, taken: readonly string[]): string {
  const base = `run-${date}`
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

const READING_WORDS: Record<ReadingResult, string> = { clean: 'clean', hold: 'hold', 'back-off': 'back off' }

/**
 * What saving means for the reading. Today's run: tomorrow's morning check reads it. An earlier
 * day's run: the check that already covers it (rule 3's link or date), this morning's check, or,
 * when none ever will, what the engine reads it as without one.
 */
export function loggedWords(run: Run, today: IsoDate, checks: readonly MorningCheck[]): string {
  if (run.date === today) return 'Logged. Tomorrow’s morning check reads it.'
  const subject = { kind: 'run' as const, id: run.id, date: run.date }
  const covering = checks.find((c) => morningCheckApplies(c, subject))
  const when = shortDateWords(run.date)
  if (covering) return `Logged for ${when}. The morning check from ${shortDateWords(covering.date)} reads it.`
  // A check dated the day after always covers the run (rule 3's date), so here none exists yet.
  if (addDays(run.date, 1) === today) return `Logged for yesterday, ${when}. This morning’s check reads it.`
  return `Logged for ${when}. No morning check from the day after covers it, so it reads ${READING_WORDS[runReading(run, checks).result]}.`
}

export interface RunRow {
  when: string
  what: string
  miles: string
  pain: string
}

/** One of this week's runs, in words: date, type, miles, max pain. */
export function runRow(run: Run): RunRow {
  return {
    when: shortDateWords(run.date),
    what: runLabel(run.type),
    miles: isSwap(run) ? 'no miles (swap)' : milesWords(run.miles),
    pain: `max pain ${run.maxPain}`,
  }
}

/** A rejected write, in words. */
export function errorWords(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.trim().length > 0 ? text.trim() : 'no reason was given'
}
