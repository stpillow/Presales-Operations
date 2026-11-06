import type { RepUnit } from '../schema/index.ts'
import { EXTENSION_MAX } from './extensions.ts'

/*
 * "I have 40 minutes": how much of a session fits the time he has. Shawn gives the minutes; this
 * estimates what each exercise takes (its sets, the work in each, the rest after it) and drops whole
 * exercises, never trims a set, until the rest fits. What goes first: the exercises he added, then
 * the ones program.md marks optional, then program.md's own from the end of the session backwards,
 * so the work the program leads with (the prep, the main lifts) is what stays. An exercise already
 * logged, and the session's first, are never dropped; a superset goes or stays as one. With more
 * time than the session takes, it goes the other way: exercises from the pool in src/rules/extensions.ts
 * are added, in order, while the next one still fits (never more than EXTENSION_MAX, and only ones the
 * gym can run). The estimate
 * is a plain one (4 s a rep, 20 s to set up and log a set, the Settings rest after each); it is a
 * guide to what fits, not a promise.
 */

export const WINDOW_MIN = 15
export const WINDOW_MAX = 120
export const WINDOW_STEP = 5
/** Where the time stepper starts. */
export const WINDOW_DEFAULT = 45

const REP_SECONDS = 4
const SET_SECONDS = 20

/** One side of a slot as the plan prescribes it. */
export interface WindowSide {
  sets: number
  repsTarget: number
  repUnit: RepUnit
}

/** What the fit needs to know of a slot, in session order. */
export interface WindowSlot {
  slotId: string
  groupId?: string
  /** Shawn added it (`isAddedSlotId`). */
  added: boolean
  /** program.md marks it optional. */
  optional: boolean
  /** A set of it is already logged this session. */
  logged: boolean
  /** One per side, injured side first. */
  sides: readonly WindowSide[]
  /** Part of the pool for extra time, not the session: it runs only if added for the minutes. */
  extra?: boolean
  /** An extra the gym can run as it stands; one it can't is never added. Absent means it can. */
  eligible?: boolean
}

/** The minutes as stored: whole minutes in range, or null for the full session. */
export function cleanWindow(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.round(value)
  return n >= WINDOW_MIN && n <= WINDOW_MAX ? n : null
}

/** The seconds of work in one set of a side, setting up and logging included. Training load's estimate of a late session's minutes reads it too. */
export function setWorkSeconds(side: Pick<WindowSide, 'repsTarget' | 'repUnit'>): number {
  const count = side.repsTarget
  switch (side.repUnit) {
    case 'seconds':
      return count + SET_SECONDS
    case 'minutes':
      return count * 60 + SET_SECONDS
    case 'yards':
    case 'steps':
      return count * 2 + SET_SECONDS
    case 'reps':
      return count * REP_SECONDS + SET_SECONDS
  }
}

/** A slot's work in seconds, and its rounds (the sets across its sides, each followed by a rest). */
function slotWork(slot: WindowSlot): { work: number; rounds: number } {
  let work = 0
  let rounds = 0
  for (const side of slot.sides) {
    work += side.sets * setWorkSeconds(side)
    rounds += side.sets
  }
  return { work, rounds }
}

interface Unit {
  slots: WindowSlot[]
  seconds: number
  /** Position of the first slot in session order. */
  index: number
}

/** A superset's members share their rests: all the work, and one rest per round of the longest member. */
function units(slots: readonly WindowSlot[], restSeconds: number): Unit[] {
  const out: Unit[] = []
  const byGroup = new Map<string, Unit>()
  slots.forEach((slot, index) => {
    const existing = slot.groupId ? byGroup.get(slot.groupId) : undefined
    if (existing) {
      existing.slots.push(slot)
      return
    }
    const unit: Unit = { slots: [slot], seconds: 0, index }
    out.push(unit)
    if (slot.groupId) byGroup.set(slot.groupId, unit)
  })
  for (const unit of out) {
    const parts = unit.slots.map(slotWork)
    unit.seconds = parts.reduce((sum, p) => sum + p.work, 0) + Math.max(0, ...parts.map((p) => p.rounds)) * restSeconds
  }
  return out
}

/** Whole minutes, rounded up, so "40 minutes" never means 41. */
export function minutesOf(seconds: number): number {
  return Math.ceil(seconds / 60)
}

export interface Fit {
  /** The slots that run, in session order. */
  keep: string[]
  /** The extras added for the minutes, in the order they were taken. */
  added: string[]
  /** The slots left out, in the order they were dropped. */
  dropped: string[]
  /** The estimate for the full session and for what is kept, in minutes. */
  fullMinutes: number
  keptMinutes: number
  /** What is kept fits the minutes given. False only when the session's first exercise, or what is logged, is already past it. */
  fits: boolean
}

/** Which slots fit `minutes` (null: the full session): some left out, or, with time to spare, extras added. */
export function fitToWindow(slots: readonly WindowSlot[], minutes: number | null, restSeconds: number): Fit {
  const base = slots.filter((s) => !s.extra)
  const pool = slots.filter((s) => s.extra)
  const all = units(base, restSeconds)
  const full = all.reduce((sum, u) => sum + u.seconds, 0)
  const limit = minutes === null ? Infinity : minutes * 60
  const dropOrder = all
    .filter((u) => u.index !== 0 && !u.slots.some((s) => s.logged))
    .sort((a, b) => {
      const extra = (u: Unit) => (u.slots.every((s) => s.added) ? 0 : u.slots.every((s) => s.added || s.optional) ? 1 : 2)
      return extra(a) - extra(b) || b.index - a.index
    })
  let total = full
  const gone = new Set<Unit>()
  for (const unit of dropOrder) {
    if (total <= limit) break
    gone.add(unit)
    total -= unit.seconds
  }
  const dropped = [...gone].sort((a, b) => dropOrder.indexOf(a) - dropOrder.indexOf(b)).flatMap((u) => u.slots.map((s) => s.slotId))

  // An extra already logged stays, as any logged exercise does; with the session whole and time left, the pool is taken from the front.
  const added: string[] = []
  for (const slot of pool.filter((s) => s.logged)) {
    added.push(slot.slotId)
    total += slotWork(slot).work + slotWork(slot).rounds * restSeconds
  }
  if (minutes !== null && dropped.length === 0) {
    for (const slot of pool) {
      if (added.length >= EXTENSION_MAX) break
      if (slot.logged || slot.eligible === false) continue
      const { work, rounds } = slotWork(slot)
      const seconds = work + rounds * restSeconds
      if (total + seconds > limit) continue
      added.push(slot.slotId)
      total += seconds
    }
  }
  const out = new Set(dropped)
  const addedIds = new Set(added)
  return {
    keep: slots.filter((s) => (s.extra ? addedIds.has(s.slotId) : !out.has(s.slotId))).map((s) => s.slotId),
    added: slots.filter((s) => addedIds.has(s.slotId)).map((s) => s.slotId),
    dropped,
    fullMinutes: minutesOf(full),
    keptMinutes: minutesOf(total),
    fits: total <= limit,
  }
}
