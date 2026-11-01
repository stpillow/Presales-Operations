import type { SlotPlan } from '../../app/session.ts'
import type { Step } from '../../rules/runOrder.ts'

export interface SlotStatus {
  word: string
  mark: string
}

/** A slot's status in words with a mark: what's done, what's current, what's optional. */
export function slotStatus(plan: SlotPlan, steps: readonly Step[], done: ReadonlySet<string>, stopped: ReadonlySet<string>, currentSlotId: string | null): SlotStatus {
  const own = steps.filter((s) => s.slotId === plan.slot.id)
  const doneCount = own.filter((s) => done.has(s.key)).length
  if (stopped.has(plan.slot.id)) return { mark: '–', word: 'Stopped' }
  if (plan.slot.id === currentSlotId) return { mark: '●', word: 'Now' }
  if (own.length > 0 && doneCount >= own.length) return { mark: '✓', word: 'Done' }
  if (doneCount > 0) return { mark: '◐', word: `${doneCount} of ${own.length}` }
  if (plan.slot.optional) return { mark: '○', word: 'Optional' }
  return { mark: '', word: '' }
}

/** Every slot in order, its first cue visible, supersets under one line. A tap makes a slot current. */
export function SlotList({
  plans,
  steps,
  done,
  stopped,
  currentSlotId,
  onPick,
}: {
  plans: readonly SlotPlan[]
  steps: readonly Step[]
  done: ReadonlySet<string>
  stopped: ReadonlySet<string>
  currentSlotId: string | null
  onPick: (slotId: string) => void
}) {
  const groupLabels = new Map<string, string>()
  for (const p of plans) {
    if (!p.slot.groupId) continue
    const members = plans.filter((q) => q.slot.groupId === p.slot.groupId).map((q) => q.slot.label)
    groupLabels.set(p.slot.groupId, `Superset ${members.join(' · ')}`)
  }
  const seenGroups = new Set<string>()
  return (
    <section aria-label="Slots" className="flex flex-col gap-2">
      <h2 className="font-sans text-lead font-semibold text-on-dark">This session</h2>
      <ol className="flex flex-col">
        {plans.map((plan) => {
          const status = slotStatus(plan, steps, done, stopped, currentSlotId)
          const groupId = plan.slot.groupId
          const header = groupId && !seenGroups.has(groupId) ? groupLabels.get(groupId) : undefined
          if (groupId) seenGroups.add(groupId)
          const cue = plan.slot.cues[0]
          return (
            <li key={plan.slot.id} className={groupId ? 'border-l border-on-dark-faint pl-3' : ''}>
              {header ? <p className="pt-3 font-mono text-label uppercase tracking-[0.22em] text-on-dark-muted">{header}</p> : null}
              <button
                type="button"
                aria-label={`Slot ${plan.slot.label}: ${plan.exercise.name}${status.word ? `, ${status.word}` : ''}`}
                aria-current={plan.slot.id === currentSlotId ? 'step' : undefined}
                onClick={() => onPick(plan.slot.id)}
                className="tap flex w-full flex-col gap-1 border-b border-on-dark-faint py-3 text-left"
              >
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="text-body text-on-dark">
                    <span className="font-mono text-small text-on-dark-muted">{plan.slot.label}</span> {plan.exercise.name}
                    <span className="text-on-dark-muted"> · {plan.slot.prescriptionText}</span>
                  </span>
                  {status.word ? (
                    <span className="shrink-0 font-mono text-small uppercase tracking-[0.22em] text-on-dark">
                      <span aria-hidden="true">{status.mark}</span> {status.word}
                    </span>
                  ) : null}
                </span>
                {cue ? <span className="text-small text-on-dark-muted">{cue}</span> : null}
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
