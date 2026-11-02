import type { History } from '../db/repo.ts'
import { addDays, dateOf, dayOf, daysBetween, scheduledSession, weekOf } from '../rules/calendar.ts'
import { runSwapsHere, type Available, type RunSwapHere } from '../rules/equipment.ts'
import { swapCallAt, type SwapCall } from '../rules/gymDay.ts'
import { attachChecks, runReading, subjectReadings } from '../rules/history.ts'
import { isSwap } from '../rules/mileage.ts'
import { morningCheckApplies, morningReading } from '../rules/reading.ts'
import { progressionSuspended, stopMessage } from '../rules/redFlags.ts'
import { phaseWeekOf } from '../rules/session.ts'
import { runTypeFor, runsInWeek, suggestRun, weekMilesSummary, type RunSuggestion, type WeekMiles } from '../rules/weekPlan.ts'
import { Effort, Run, RunType, type Day, type DaySession, type IsoDate, type MorningCheck, type Program, type ReadingResult, type Settings } from '../schema/index.ts'
import { dateWords, noSwapMachineWords, runLabel, sessionLabel, shortDateWords } from './Today.helpers.ts'

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

/**
 * The dates a run can be logged for: this program week's Monday up to today and, on a Monday,
 * yesterday too, the last day of the week before, so a Sunday run logged the next morning keeps its
 * date and counts in the week it happened (PROGRAM-QUESTIONS 62). Empty before the program starts.
 */
export function dateChoices(today: IsoDate, startDate: IsoDate): IsoDate[] {
  const week = weekOf(today, startDate)
  if (week < 1) return []
  const monday = dateOf(startDate, week, 'mon')
  const thisWeek = Array.from({ length: daysBetween(monday, today) + 1 }, (_, i) => addDays(monday, i))
  return week > 1 && today === monday ? [addDays(today, -1), ...thisWeek] : thisWeek
}

/** The note under the day choices: which days can be logged. */
export function dayChoicesNote(today: IsoDate, startDate: IsoDate): string {
  const week = weekOf(today, startDate)
  return week > 1 && today === dateOf(startDate, week, 'mon')
    ? 'Yesterday, the last day of last week, can still be logged; later days cannot.'
    : 'Earlier days of this program week can be logged; later ones cannot.'
}

/**
 * The date the logger logs for: the one picked (pinned when the logger opened) while it is still a
 * choice, else today. The view's `date`, and the date a swap's gym is read for (`runSwapGym`).
 */
export function loggedDate(today: IsoDate, startDate: IsoDate, picked: IsoDate | null): IsoDate {
  return picked !== null && dateChoices(today, startDate).includes(picked) ? picked : today
}

/** Under the gym choice on an earlier day's log: where the swap is stored, and that another gym is a tap away. */
export function swapGymNote(date: IsoDate, gymName: string): string {
  return `A swap stores the gym it was done at: ${dateWords(date).split(',')[0] ?? 'that day'}’s is preset to ${gymName}. Tap another if it was elsewhere.`
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
      /** The date being logged: the one picked (pinned when the logger opened) when it is still a choice, else today. */
      date: IsoDate
      /**
       * The pinned date when it is no longer a choice (the week turned while the form was open): said
       * in words, and Save waits until a day is picked again. Never swapped for today silently.
       */
      dateLost: IsoDate | null
      dates: IsoDate[]
      scheduled: DaySession
      /** "Session A", "Run: MBR", "Off: Kona walk and mobility only". */
      scheduledLabel: string
      /** The type the day's scheduled session preselects (runTypeFor), or null on a lift or off day. */
      preselected: RunType | null
      /** The type being logged: the one picked, else the preselection. */
      type: RunType | null
      /**
       * suggestRun for the day's scheduled run (after moves), whatever type is picked: null on a lift
       * or off day, where a run still logs but the engine plans nothing (no long-run share, tempo or
       * strides, M4 review), and while the red-flag state suspends progression.
       */
      suggestion: RunSuggestion | null
      stop: { headline: string; items: string[] } | null
      /** That date's morning reading, from the check logged that morning; null when none was. */
      morning: ReadingResult | null
      /** The gym a swap is logged at, by name: the active one, or for an earlier day the one `runSwapGym` gives. */
      gym: string
      /** Both swaps in program.md's order, each here or not at that gym; both stay loggable (design section 7). */
      swaps: RunSwapHere[]
      /**
       * What a hold or back-off morning's swap call comes to at the gym: `take` names the first swap
       * here, elliptical then rower; `neither` means nothing is suggested and he picks (Shawn's
       * Nov 1 answer 7). Null when the engine calls for no swap.
       */
      swapCall: SwapCall | null
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
  /** The gym a swap is logged at (`runSwapGym`): its name and what is there (`availableAt`). */
  gym: { name: string; available: Available }
}): LoggerView {
  const { today, picked, settings, history, program, gym } = input
  const dates = dateChoices(today, settings.startDate)
  if (dates.length === 0) return { kind: 'before-start', line: `Week 1 starts ${shortDateWords(settings.startDate)}` }

  const dateLost = picked.date !== null && !dates.includes(picked.date) ? picked.date : null
  const date = loggedDate(today, settings.startDate, picked.date)
  const { week, session } = scheduledSession(date, settings.startDate, program.weeklyTemplate, history.sessionMoves)
  const scheduled: DaySession = session ?? 'off'
  const preselected = runTypeFor(scheduled)
  const type = picked.type ?? preselected

  const records = attachChecks(history.workouts, history.setLogs, history.morningChecks)
  const readings = subjectReadings(records, history.runs, history.morningChecks, settings.injuredSide)
  const summary = weekMilesSummary(program.mileagePlan, week, settings.startDate, history.runs, readings)
  const weekRuns = runsInWeek(history.runs, settings.startDate, week).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  const stop = stopMessage(settings.redFlag, program.redFlags)
  const morning = morningFor(date, history.morningChecks)
  const suggestion = progressionSuspended(settings.redFlag)
    ? null
    : suggestRun({
        session: scheduled,
        week,
        target: summary.target.target,
        milesSoFar: summary.miles,
        currentPhase: settings.currentPhase,
        phaseWeek: phaseWeekOf(Math.max(week, settings.phaseEnteredWeek), settings.phaseEnteredWeek),
        morning,
      })

  return {
    kind: 'form',
    week,
    date,
    dateLost,
    dates,
    scheduled,
    scheduledLabel: sessionLabel(scheduled, program.weeklyTemplateRows),
    preselected,
    type,
    suggestion,
    stop,
    morning,
    gym: gym.name,
    swaps: runSwapsHere(gym.available),
    swapCall: swapCallAt(suggestion, gym.available),
    summary,
    weekRuns,
  }
}

/** The screen's lead: the date being logged and what it holds, or, when the pinned date was lost, the ask. */
export function leadWords(view: { date: IsoDate; dateLost?: IsoDate | null; scheduledLabel: string }): string {
  if (view.dateLost) return 'Pick the day this run happened'
  return `${dateWords(view.date)} · ${view.scheduledLabel}`
}

/** What happened when the pinned date dropped out of the choices, and what to do. */
export function dateLostWords(lost: IsoDate): string {
  return `${shortDateWords(lost)}, the day this run was started for, can no longer be logged: runs log for this program week up to today, and on a Monday for yesterday too. Pick a day to save it.`
}

/** The Save button: it names the day when that is not today, since the date stays as the logger opened. */
export function saveWords(date: IsoDate, today: IsoDate): string {
  return date === today ? 'Save run' : `Save run for ${shortDateWords(date)}`
}

/** What the suggestion block says when there is no suggestion. */
export function noSuggestionWords(view: { date: IsoDate; scheduledLabel: string; type: RunType | null; stop: unknown }, today: IsoDate): string {
  if (view.stop) return 'No run is suggested while the red-flag state is on.'
  const day = view.date === today ? 'Today' : (dateWords(view.date).split(',')[0] ?? 'That day')
  const base = `${day} holds ${view.scheduledLabel}, not a run, so there is no suggestion.`
  return view.type === null ? `${base} Pick the type to log one anyway.` : `${base} It still logs, with what you enter.`
}

/** "Run: easy · 3 miles" or, outside the plan, the type alone: the run the engine plans. */
export function runPlanWords(suggestion: RunSuggestion): string {
  return suggestion.miles === null ? runLabel(suggestion.type) : `${runLabel(suggestion.type)} · ${milesWords(suggestion.miles)}`
}

/**
 * The head of the suggestion block: when the engine calls for a swap, the first one here
 * ("Elliptical swap", else "Rower swap"), or with neither here "No elliptical or rower at
 * Marriott Downtown"; else the run and its miles. The run's plan is still shown under a swap
 * head, for a run done anyway.
 */
export function suggestionHead(suggestion: RunSuggestion, at: { swapCall: SwapCall | null; gym: string }): string {
  if (!suggestion.swapSuggested || at.swapCall === null) return runPlanWords(suggestion)
  return at.swapCall.kind === 'take' ? runLabel(at.swapCall.type) : noSwapMachineWords(at.gym)
}

/** A swap choice's detail: "Here", or "Not at Marriott Downtown"; it logs either way. */
export function swapHereWords(here: boolean, gymName: string): string {
  return here ? 'Here' : `Not at ${gymName}`
}

/** The detail on a type choice: "scheduled" on the day's run, and on each swap whether its machine is at the gym. */
export function typeDetail(type: RunType, view: { preselected: RunType | null; swaps: readonly RunSwapHere[]; gym: string }): string | undefined {
  const swap = view.swaps.find((s) => s.type === type)
  if (swap) return swapHereWords(swap.here, view.gym)
  return type === view.preselected ? 'scheduled' : undefined
}

const ROWER_CUE_START = 'On the rower'

/**
 * program.md's rower cue, verbatim (design section 7): the sentence of its running rules that starts
 * "On the rower" ("On the rower, strap in, drive with the legs only through the pain-free range, and
 * keep the stroke rate around 22–24."). Null if the rules ever stop carrying one.
 */
export function rowerCue(rules: readonly string[]): string | null {
  for (const rule of rules) {
    const at = rule.indexOf(ROWER_CUE_START)
    if (at < 0) continue
    const rest = rule.slice(at)
    const end = rest.search(/[.!?](\s|$)/)
    return end < 0 ? rest : rest.slice(0, end + 1)
  }
  return null
}

/** The rower cue when the rower swap is the morning's call at this gym or the type picked; null otherwise. */
export function rowerCueFor(view: { type: RunType | null; swapCall: SwapCall | null }, cue: string | null): string | null {
  const rower = view.type === 'rower-swap' || (view.swapCall?.kind === 'take' && view.swapCall.type === 'rower-swap')
  return rower ? cue : null
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

/**
 * The form as typed. Null means "follow what the screen preselects or the engine suggests"; for the
 * date it means today, though the screen pins the date when the logger opens (openForm).
 */
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
  /** The gym picked for a swap logged for an earlier day, and that day; null follows `runSwapGym`'s preset. */
  gymPick: { date: IsoDate; locationId: string } | null
}

export function emptyForm(): RunForm {
  return { date: null, type: null, miles: null, minutes: 0, effort: 'easy', maxPain: null, strides: null, tempo: null, stravaUrl: '', notes: '', gymPick: null }
}

/**
 * The form as the logger opens it: dated today and pinned there, so a form left open past midnight
 * or into a new week keeps the day it was started for (M4 review). Another day is a tap away.
 */
export function openForm(today: IsoDate): RunForm {
  return { ...emptyForm(), date: today }
}

/** The form with every "follow" filled in: what the screen shows and what Save would log. */
export interface ResolvedForm {
  date: IsoDate
  /** The pinned date when it is no longer a choice: Save waits until a day is picked again. */
  dateLost: IsoDate | null
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
export function resolveForm(form: RunForm, view: { date: IsoDate; dateLost?: IsoDate | null; type: RunType | null; suggestion: RunSuggestion | null }): ResolvedForm {
  const swap = isSwapType(view.type)
  return {
    date: view.date,
    dateLost: view.dateLost ?? null,
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

/**
 * The Run that Save logs, or the words on the disabled Save button saying what is missing. A swap
 * (elliptical or rower) is done at a gym, so it stores `locationId`, the gym it was done at
 * (`runSwapGym`: the active one for today, the one picked or preset for an earlier day); a run
 * outside stores none.
 */
export function toRun(form: ResolvedForm, id: string, locationId: string): RunDraft {
  const { type, maxPain } = form
  if (form.dateLost !== null) return { ok: false, blocker: 'Pick the day first' }
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
      ...(form.swap ? { locationId } : {}),
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
