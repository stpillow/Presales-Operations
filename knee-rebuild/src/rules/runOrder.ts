import type { SetSide } from '../schema/index.ts'

/** What the run order needs to know about a slot: its group, whether it is optional, and its sides' set counts, injured side first. */
export interface StepSlot {
  slotId: string
  groupId?: string
  optional: boolean
  sides: { side: SetSide; sets: number }[]
}

/** One set on one side of one slot: the unit the Done button logs. */
export interface Step {
  key: string
  slotId: string
  side: SetSide
  setNumber: number
  /** The superset group, or the slot itself when it stands alone. */
  unit: string
  optional: boolean
}

export function stepKey(slotId: string, side: SetSide, setNumber: number): string {
  return `${slotId}:${side}:${setNumber}`
}

/**
 * The session's steps in run order. Slots sharing a groupId run round-robin by set number in slot
 * order (A5.1, A6.1, A7.1, A5.2, …); inside each set number the injured side comes first.
 */
export function sessionSteps(slots: readonly StepSlot[]): Step[] {
  const units: { unit: string; members: StepSlot[] }[] = []
  for (const slot of slots) {
    const unit = slot.groupId ?? slot.slotId
    const existing = units.find((u) => u.unit === unit)
    if (existing) existing.members.push(slot)
    else units.push({ unit, members: [slot] })
  }
  const steps: Step[] = []
  for (const { unit, members } of units) {
    const rounds = Math.max(0, ...members.flatMap((m) => m.sides.map((s) => s.sets)))
    for (let n = 1; n <= rounds; n++) {
      for (const member of members) {
        for (const { side, sets } of member.sides) {
          if (n <= sets) steps.push({ key: stepKey(member.slotId, side, n), slotId: member.slotId, side, setNumber: n, unit, optional: member.optional })
        }
      }
    }
  }
  return steps
}

function open(step: Step, done: ReadonlySet<string>, stopped: ReadonlySet<string>): boolean {
  return !done.has(step.key) && !stopped.has(step.slotId)
}

/**
 * The step to do next. After a logged step, stay in its unit (the rest of the superset round, the
 * other side, the next set) while it has open steps; otherwise the first open step of a required
 * slot in session order. Optional slots are never chosen automatically. Null when nothing required is left.
 */
export function nextStep(steps: readonly Step[], done: ReadonlySet<string>, stopped: ReadonlySet<string>, lastKey: string | null): Step | null {
  const last = lastKey ? steps.find((s) => s.key === lastKey) : undefined
  if (last) {
    const inUnit = steps.find((s) => s.unit === last.unit && open(s, done, stopped))
    if (inUnit) return inUnit
  }
  return steps.find((s) => !s.optional && open(s, done, stopped)) ?? null
}

/** The first open step of one slot: where a tap on the slot's row lands. */
export function firstOpenStepOf(steps: readonly Step[], slotId: string, done: ReadonlySet<string>, stopped: ReadonlySet<string>): Step | null {
  return steps.find((s) => s.slotId === slotId && open(s, done, stopped)) ?? null
}

/**
 * Whether a rest is due after a step: it ends its round, meaning the next open step of its unit
 * (in run order, after it) has a later set number, or there is none. Both sides of a set and every
 * member of a superset round run back to back; the rest comes after the round.
 */
export function restAfter(steps: readonly Step[], key: string, done: ReadonlySet<string>, stopped: ReadonlySet<string>): boolean {
  const index = steps.findIndex((s) => s.key === key)
  const step = steps[index]
  if (!step) return true
  const following = steps.slice(index + 1).find((s) => s.unit === step.unit && open(s, done, stopped))
  return !following || following.setNumber > step.setNumber
}
