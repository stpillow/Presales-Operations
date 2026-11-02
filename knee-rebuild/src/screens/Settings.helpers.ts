import { DAYS, DELOAD_WEEKS, addDays, dayOf, daysBetween, isDeloadWeek, isMonday, weekOf } from '../rules/calendar.ts'
import { rebaseMoves, rebaseWeekNumber } from '../rules/moves.ts'
import { clearRedFlag, stopMessage, type RedFlagState } from '../rules/redFlags.ts'
import { IsoDate, type Day, type Phase, type RedFlag, type SessionMove, type Settings, type Side } from '../schema/index.ts'

/**
 * Pure helpers for the Settings screen: words for dates, the start-date check, the red-flag state
 * in words, and the limits of each input. Nothing here decides anything about the knee: whether a
 * date is a Monday, what week today is, and whether a red flag may be cleared all come from
 * src/rules; this file names and composes their answers.
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

/** A YYYY-MM-DD date in words, "Monday Nov 2", with no clock or time zone involved. */
export function dateWords(date: IsoDate): string {
  const [, month, day] = date.split('-').map(Number)
  const monthWord = month === undefined ? '' : (MONTH_WORDS[month - 1] ?? '')
  return `${DAY_WORDS[dayOf(date)]} ${monthWord} ${day ?? ''}`.replace(/\s+/g, ' ').trim()
}

export const SIDES: readonly Side[] = ['left', 'right']

export function sideWords(side: Side): string {
  return side === 'left' ? 'Left knee' : 'Right knee'
}

/** The rack presets from the brief, and the stepper's limits: any heavier dumbbell is still a whole number of pounds. */
export const DUMBBELL_PRESETS: readonly number[] = [60, 75, 80]
export const DUMBBELL_STEP = 5
export const DUMBBELL_MIN = 5
export const DUMBBELL_MAX = 200

/** Rest in 15 s steps, from a quarter minute to ten minutes. */
export const REST_STEP = 15
export const REST_MIN = 15
export const REST_MAX = 600

/** The Monday on or before a date and the Monday after it: the two a start date can snap to. */
export function mondaysAround(date: IsoDate): [IsoDate, IsoDate] {
  const before = addDays(date, -DAYS.indexOf(dayOf(date)))
  return [before, addDays(before, 7)]
}

export type StartDateCheck = { ok: true; date: IsoDate } | { ok: false; message: string; mondays: IsoDate[] }

/** A date input's value, checked: a real calendar date that is a Monday (PROMPT rule 10: weeks start Monday). */
export function checkStartDate(value: string): StartDateCheck {
  const text = value.trim()
  if (text === '') return { ok: false, message: 'Pick a date. Week 1 starts on it, and the deload weeks hang off it.', mondays: [] }
  const parsed = IsoDate.safeParse(text)
  if (!parsed.success) return { ok: false, message: `"${text}" is not a calendar date.`, mondays: [] }
  const date = parsed.data
  if (isMonday(date)) return { ok: true, date }
  const [before, after] = mondaysAround(date)
  return {
    ok: false,
    message: `${dateWords(date)} is not a Monday. Weeks start on Monday; the nearest are ${dateWords(before)} and ${dateWords(after)}.`,
    mondays: [before, after],
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Where today falls against the start date, in words, so a changed date can be sanity-checked at once. */
export function weekLine(today: IsoDate, startDate: IsoDate): string {
  const week = weekOf(today, startDate)
  if (week >= 1) return `Today, ${dateWords(today)}, is in week ${week}${isDeloadWeek(week) ? ', a deload week' : ''}.`
  const days = daysBetween(today, startDate)
  return `Week 1 starts ${dateWords(startDate)}, ${days === 1 ? 'tomorrow' : `in ${plural(days, 'day')}`}.`
}

export interface StartDateChange {
  /** The stored moves to keep, renumbered so each stays on the dates it was made for. */
  moves: SessionMove[]
  dropped: number
  /** How many moves were dropped, in words; null when none was. */
  notice: string | null
  /** The week the current phase was entered, kept on its calendar week (PROGRAM-QUESTIONS 61). */
  phaseEnteredWeek: number
}

/**
 * What a new start date does to the stored session moves: the rule (src/rules/moves) renumbers
 * each one so it stays on its calendar dates and drops any that now fall before week 1; this names
 * how many were dropped. Throws, as the rule does, when the dates are not whole weeks apart.
 */
export function startDateChange(oldStart: IsoDate, newStart: IsoDate, moves: readonly SessionMove[], phaseEnteredWeek = 1): StartDateChange {
  const rebased = rebaseMoves(moves, oldStart, newStart)
  return {
    ...rebased,
    notice: droppedMovesWords(rebased.dropped, rebased.moves.length),
    phaseEnteredWeek: rebaseWeekNumber(phaseEnteredWeek, oldStart, newStart),
  }
}

/** "1 session move was for a week before the new week 1, so it was dropped. The other 2 stay on the dates they were made for." */
export function droppedMovesWords(dropped: number, kept: number): string | null {
  if (dropped === 0) return null
  const lead =
    dropped === 1
      ? '1 session move was for a week before the new week 1, so it was dropped.'
      : `${dropped} session moves were for weeks before the new week 1, so they were dropped.`
  if (kept === 0) return lead
  return kept === 1 ? `${lead} The other one stays on the dates it was made for.` : `${lead} The other ${kept} stay on the dates they were made for.`
}

/** "Deload weeks are 4, 8 and 12 from it.", read from the rule's own list so the screen never restates it by hand. */
export function deloadWeeksLine(weeks: readonly number[] = DELOAD_WEEKS): string {
  const words = weeks.map(String)
  const last = words.pop()
  if (last === undefined) return 'There are no deload weeks.'
  const list = words.length === 0 ? last : `${words.join(', ')} and ${last}`
  return `Deload weeks are ${list} from it.`
}

/** "45 s", "1 min", "1 min 30 s". */
export function restTimerWords(seconds: number): string {
  const min = Math.floor(seconds / 60)
  const s = seconds % 60
  if (min === 0) return `${s} s`
  return s === 0 ? `${min} min` : `${min} min ${s} s`
}

export function painWords(painPerSet: boolean): string {
  return painPerSet ? 'Per set: a pain stepper on every set.' : 'Per exercise: one pain number per exercise, written on each of its sets.'
}

/** "Phase 1: Foundation" and the week it was entered. Read-only on this screen; Gates advances it. */
export function phaseWords(
  settings: Pick<Settings, 'currentPhase' | 'phaseEnteredWeek'>,
  phases: readonly Pick<Phase, 'number' | 'name'>[],
): { title: string; entered: string } {
  const name = phases.find((p) => p.number === settings.currentPhase)?.name
  return {
    title: name ? `Phase ${settings.currentPhase}: ${name}` : `Phase ${settings.currentPhase}`,
    entered: `Entered in week ${settings.phaseEnteredWeek}.`,
  }
}

export type RedFlagView = { active: true; headline: string; since: string | null; items: string[] } | { active: false; cleared: string | null }

/** The red-flag state in words, from the engine's stop message; when off, how it was last cleared. */
export function redFlagView(state: RedFlagState, catalog: readonly RedFlag[]): RedFlagView {
  const stop = stopMessage(state, catalog)
  if (stop) {
    return { active: true, headline: stop.headline, since: state.since ? `Flagged since ${dateWords(state.since)}.` : null, items: stop.items }
  }
  if (!state.clearedOn) return { active: false, cleared: null }
  const note = state.clearNote ? `: “${state.clearNote}”` : ''
  return { active: false, cleared: `Last cleared ${dateWords(state.clearedOn)}${note}.` }
}

export type ClearResult = { ok: true; settings: Settings } | { ok: false; refusal: string }

/** The settings with the red-flag state cleared on `today`, or the rule's refusal (an empty note) in words. */
export function clearedSettings(settings: Settings, note: string, today: IsoDate): ClearResult {
  try {
    return { ok: true, settings: { ...settings, redFlag: clearRedFlag(settings.redFlag, note, today) } }
  } catch (e) {
    return { ok: false, refusal: `Not cleared: ${errorWords(e)}.` }
  }
}

/** A rejected write, in words. */
export function errorWords(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.trim().length > 0 ? text.trim() : 'no reason was given'
}
