import type { RepUnit } from '../schema/index.ts'

/*
 * "I have 40 minutes": how much of a session fits the time he has. Shawn gives the minutes; this
 * estimates what each exercise takes (its sets, the work in each, the rest after it) and drops whole
 * exercises, never trims a set, until the rest fits. What goes first: the exercises he added, then
 * the ones program.md marks optional, then program.md's own from the end of the session backwards,
 * so the work the program leads with (the prep, the main lifts) is what stays. An exercise already
 * logged, and the session's first, are never dropped; a superset goes or stays as one. The estimate
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
}

/** The minutes as stored: whole minutes in range, or null for the full session. */
export function cleanWindow(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.round(value)
  return n >= WINDOW_MIN && n <= WINDOW_MAX ? n : null
}

/** The seconds of work in one set of a side, setting up and logging included. */
function setWorkSeconds(side: WindowSide): number {
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
  /** The slots left out, in the order they were dropped. */
  dropped: string[]
  /** The estimate for the full session and for what is kept, in minutes. */
  fullMinutes: number
  keptMinutes: number
  /** What is kept fits the minutes given. False only when the session's first exercise, or what is logged, is already past it. */
  fits: boolean
}

/** Which slots fit `minutes` (null: the full session). */
export function fitToWindow(slots: readonly WindowSlot[], minutes: number | null, restSeconds: number): Fit {
  const all = units(slots, restSeconds)
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
  const droppedIds = new Set(dropped)
  return {
    keep: slots.filter((s) => !droppedIds.has(s.slotId)).map((s) => s.slotId),
    dropped,
    fullMinutes: minutesOf(full),
    keptMinutes: minutesOf(total),
    fits: total <= limit,
  }
}
