import type { Day, IsoDate, Run, SessionMove, Workout } from '../schema/index.ts'
import { dateOf, daysBetween } from './calendar.ts'

/**
 * The limits on moving a session (PROMPT rule 10 says only "to another day in the same week";
 * PROGRAM-QUESTIONS 59 records the reading taken). A move swaps two days, so a day that already
 * holds something logged would hand its finished session to another day, and Today would offer it
 * a second time. Finished weeks stay as they happened.
 */

export type MoveVerdict = { allowed: true } | { allowed: false; reason: string }

const DAY_WORDS: Record<Day, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

/** Whether anything is logged on a date: a run, or a workout in any state but planned (one left open counts). */
export function loggedOn(date: IsoDate, runs: readonly Pick<Run, 'date'>[], workouts: readonly Pick<Workout, 'date' | 'status'>[]): boolean {
  return runs.some((r) => r.date === date) || workouts.some((w) => w.date === date && w.status !== 'planned')
}

export interface MoveContext {
  startDate: IsoDate
  /** The week the move is in. */
  week: number
  /** weekOf(today); 0 or less before the program starts. */
  currentWeek: number
  runs: readonly Pick<Run, 'date'>[]
  workouts: readonly Pick<Workout, 'date' | 'status'>[]
}

/** Whether one day of a week can take part in a move, on either end of it. */
export function dayMovable(ctx: MoveContext, day: Day): MoveVerdict {
  if (ctx.week < ctx.currentWeek) return { allowed: false, reason: 'That week is over; its days stay as they happened.' }
  if (loggedOn(dateOf(ctx.startDate, ctx.week, day), ctx.runs, ctx.workouts)) {
    return { allowed: false, reason: `Something is logged on ${DAY_WORDS[day]}, so its session stays there.` }
  }
  return { allowed: true }
}

/** Whether two days of a week can trade sessions. */
export function moveAllowed(ctx: MoveContext, dayA: Day, dayB: Day): MoveVerdict {
  if (dayA === dayB) return { allowed: false, reason: 'A day cannot trade with itself.' }
  const a = dayMovable(ctx, dayA)
  if (!a.allowed) return a
  return dayMovable(ctx, dayB)
}

/**
 * The one move of the week Undo may take back: the latest, since a move swaps days and taking back
 * an earlier one would change what every later move did. It stays only while its two days could
 * still trade, so an undo never moves a logged session either. Null when nothing can be undone.
 */
export function undoableMove(ctx: MoveContext, moves: readonly SessionMove[]): string | null {
  const own = moves.filter((m) => m.week === ctx.week && m.dayA !== m.dayB)
  const last = own.at(-1)
  if (!last) return null
  return moveAllowed(ctx, last.dayA, last.dayB).allowed ? last.id : null
}

export interface RebasedMoves {
  /** The moves that still fall in the program, in their original order, with their weeks renumbered. */
  moves: SessionMove[]
  /** How many moves landed before week 1 under the new start date and were dropped. */
  dropped: number
}

/**
 * Moves are stored by program week, so a new start date would carry each one onto other calendar
 * dates (onto days already logged, even). When the start date changes from one Monday to another,
 * shift each move's week by the whole weeks between them so it stays on the dates it was made for,
 * and drop any that would land before week 1. Throws when the two dates aren't whole weeks apart.
 */
export function rebaseMoves(moves: readonly SessionMove[], oldStart: IsoDate, newStart: IsoDate): RebasedMoves {
  const days = daysBetween(newStart, oldStart)
  if (days % 7 !== 0) throw new RangeError(`start dates ${oldStart} and ${newStart} are not whole weeks apart`)
  const shift = days / 7
  const kept = moves.map((m) => ({ ...m, week: m.week + shift })).filter((m) => m.week >= 1)
  return { moves: kept, dropped: moves.length - kept.length }
}
