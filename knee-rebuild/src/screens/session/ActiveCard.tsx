import { useState, type ReactNode } from 'react'
import type { SlotPlan } from '../../app/session.ts'
import { Button } from '../../components/Button.tsx'
import { PAIN_SCALE, RPE_SCALE, ScalePicker } from '../../components/ScalePicker.tsx'
import { Stepper } from '../../components/Stepper.tsx'
import { exerciseById } from '../../program/program.ts'
import { progressionNeedsRpe } from '../../rules/prescription.ts'
import type { Step } from '../../rules/runOrder.ts'
import type { SetLog, Side, StopReason } from '../../schema/index.ts'
import {
  STOP_REASONS,
  countLabel,
  countStep,
  draftFromSet,
  loadLabel,
  loadMax,
  loadStep,
  needsLoadPick,
  prefill,
  prescriptionWords,
  rangeStopOptions,
  setWords,
  showsLoad,
  sideWords,
  type Draft,
} from '../SessionRunner.helpers.ts'
import { DoneBar } from './DoneBar.tsx'

export interface ActiveCardProps {
  plan: SlotPlan
  /** The open step to log in this slot, or null when the slot is only being looked at. */
  step: Step | null
  /** A logged set being corrected, or null. */
  editing: SetLog | null
  slotSets: SetLog[]
  /** Sets prescribed for each side, for "set 2 of 3". */
  setsBySide: Record<string, number>
  injuredSide: Side
  painPerSet: boolean
  dumbbellMax: number
  historyRpe: number | null
  budget: number[] | null
  /** Pain for the whole exercise when pain is logged once per exercise. */
  exercisePain: number | null
  onExercisePain: (value: number) => void
  swapped: boolean
  busy: boolean
  error: string | null
  timer: ReactNode
  /** What the bar offers when this slot has nothing open. */
  idleBar: { line: string; label: string; onPress: () => void }
  onLog: (draft: Draft, stop?: StopReason) => void
  onSave: (set: SetLog, draft: Draft) => void
  onRemove: (set: SetLog) => void
  onEdit: (set: SetLog | null) => void
  onSwap: (exerciseId: string | null) => void
}

const sideOrder = (side: string, injured: Side) => (side === 'both' || side === injured ? 0 : 1)

/**
 * The Now card and the Done bar for one step. Keyed by step (and exercise) by its parent, so a new
 * step remounts it with a fresh prefill: the draft never leaks from one set into the next.
 */
export function ActiveCard(props: ActiveCardProps) {
  const { plan, step, editing, slotSets, injuredSide } = props
  const { slot, substitutions } = plan
  const prescription = plan.prescriptions.find((p) => p.side === (editing?.side ?? step?.side)) ?? plan.prescriptions[0]
  const exercise = exerciseById(editing?.exerciseId ?? prescription?.exerciseId ?? plan.exercise.id)
  const [draft, setDraft] = useState<Draft | null>(() => {
    if (editing) return draftFromSet(editing)
    if (step && prescription) {
      return prefill({ prescription, slot, setNumber: step.setNumber, slotSets, budget: step.side !== injuredSide && step.side !== 'both' ? props.budget : null, historyRpe: props.historyRpe, painPerSet: props.painPerSet })
    }
    return null
  })
  const [panel, setPanel] = useState<'swap' | 'stop' | null>(null)
  const [change, setChange] = useState<'height' | 'range' | 'stage' | null>(null)
  const [showCues, setShowCues] = useState(slotSets.length === 0)
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  if (!prescription) return null
  const groupLabel = slot.groupId ? `Superset · slot ${slot.label}` : `Slot ${slot.label}`
  const doneRows = [...slotSets].sort((a, b) => a.setNumber - b.setNumber || sideOrder(a.side, injuredSide) - sideOrder(b.side, injuredSide))
  const activeSide = editing?.side ?? step?.side
  const totalForSide = activeSide ? (props.setsBySide[activeSide] ?? prescription.sets) : prescription.sets
  const setNumber = editing?.setNumber ?? step?.setNumber
  const needsRpe = progressionNeedsRpe(slot)
  const showRpe = slot.rpeTarget !== undefined || needsRpe
  const blockedOnLoad = !editing && draft !== null && needsLoadPick(prescription, exercise, draft)
  const moved = prescription.exerciseId !== slot.exerciseId && !props.swapped
  const bothForUnilateral = !slot.unilateral && exercise.unilateral
  const budgetLine =
    step && step.side !== 'both' && step.side !== injuredSide
      ? props.budget && props.budget[step.setNumber - 1] !== undefined
        ? `Budget ${props.budget[step.setNumber - 1]}: the injured side did that on set ${step.setNumber}.`
        : 'Budget: log the injured side first.'
      : null

  const sideText = activeSide ? sideWords(activeSide, injuredSide) : ''
  const draftLine = draft
    ? [
        `${exercise.name}`,
        setNumber ? `set ${setNumber} of ${totalForSide}` : '',
        sideText,
        showsLoad(exercise) ? `load ${draft.load}` : '',
        `${draft.count} ${countLabel(slot.repUnit).toLowerCase()}`,
        draft.rpe !== null ? `RPE ${draft.rpe}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : props.idleBar.line

  let barLabel = props.idleBar.label
  let barPress = props.idleBar.onPress
  if (editing && draft) {
    barLabel = `Save set ${editing.setNumber}`
    barPress = () => props.onSave(editing, draft)
  } else if (step && draft) {
    barLabel = blockedOnLoad ? 'Pick a load first' : `Done: set ${step.setNumber} of ${totalForSide}${sideText ? `, ${sideText.split(' · ')[0]?.toLowerCase()}` : ''}`
    barPress = () => props.onLog(draft)
  }

  return (
    <>
      <section aria-label="Now" className="flex flex-col gap-4 rounded-md bg-navy-lift p-4">
        <header className="flex flex-col gap-1">
          <p className="font-mono text-label uppercase tracking-[0.22em] text-on-dark-muted">{groupLabel}</p>
          <h2 className="font-sans text-h3 font-semibold text-on-dark">{exercise.name}</h2>
          <p className="text-body text-on-dark-dim">{prescriptionWords(prescription, slot, exercise)}</p>
          {prescription.note ? <p className="text-small text-on-dark-dim">{prescription.note}</p> : null}
          {moved ? <p className="text-small text-on-dark">Moved to {exercise.name} by the engine.</p> : null}
          {bothForUnilateral ? <p className="text-small text-on-dark-dim">Logs as both sides: this slot is two-legged in the program.</p> : null}
          {exercise.sideMeaning ? <p className="text-small text-on-dark-dim">{exercise.sideMeaning}</p> : null}
        </header>

        {slot.cues.length > 0 ? (
          showCues ? (
            <ul className="flex flex-col gap-1">
              {slot.cues.map((cue) => (
                <li key={cue} className="text-small text-on-dark">
                  {cue}
                </li>
              ))}
            </ul>
          ) : (
            <Button variant="quiet" onClick={() => setShowCues(true)}>
              Show cues
            </Button>
          )
        ) : null}

        {!props.painPerSet ? (
          <ScalePicker label="Pain, this exercise" value={props.exercisePain} options={PAIN_SCALE} onChange={props.onExercisePain} ariaLabel="Pain this exercise" />
        ) : null}

        {doneRows.length > 0 ? (
          <ul aria-label="Logged sets" className="flex flex-col">
            {doneRows.map((s) => {
              const side = sideWords(s.side, injuredSide)
              const isEditing = editing?.id === s.id
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={isEditing}
                    onClick={() => props.onEdit(isEditing ? null : s)}
                    className={`tap w-full border-b border-on-dark-faint py-2 text-left text-small ${isEditing ? 'text-on-dark underline underline-offset-4' : 'text-on-dark-dim'}`}
                  >
                    <span aria-hidden="true">{s.stopped ? '– ' : '✓ '}</span>
                    Set {s.setNumber}
                    {side ? ` · ${side}` : ''} · {setWords(s, slot, exercise)}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}

        {draft && (step || editing) ? (
          <div aria-label={editing ? `Editing set ${editing.setNumber}` : 'Next set'} className="flex flex-col gap-4">
            <p className="font-mono text-label uppercase tracking-[0.22em] text-on-dark">
              {editing ? `Editing set ${editing.setNumber}` : `Set ${step?.setNumber} of ${totalForSide}`}
              {sideText ? ` · ${sideText}` : ''}
            </p>
            {slot.injuredOnly ? <p className="text-small text-on-dark-dim">{injuredSide === 'left' ? 'Left' : 'Right'} (injured) only.</p> : null}
            {budgetLine ? <p className="text-small text-on-dark">{budgetLine}</p> : null}

            {draft.heightIn !== undefined ? (
              <div className="flex flex-col gap-2">
                <p className="flex items-center justify-between gap-3 text-body text-on-dark">
                  Step: {draft.heightIn} in.
                  <Button variant="quiet" onClick={() => setChange(change === 'height' ? null : 'height')}>{change === 'height' ? 'Done' : 'Change'}</Button>
                </p>
                {change === 'height' ? (
                  <Stepper label="Step height" unit="in" value={draft.heightIn} step={exercise.heightIncrementIn ?? 2} min={2} max={slot.heightMaxIn ?? 24} onChange={(v) => set({ heightIn: v })} />
                ) : null}
              </div>
            ) : null}

            {draft.rangeStopDeg !== undefined ? (
              <div className="flex flex-col gap-2">
                <p className="flex items-center justify-between gap-3 text-body text-on-dark">
                  Range: 90° to {draft.rangeStopDeg}°
                  <Button variant="quiet" onClick={() => setChange(change === 'range' ? null : 'range')}>{change === 'range' ? 'Done' : 'Change'}</Button>
                </p>
                {change === 'range' ? (
                  <div className="flex gap-2">
                    {rangeStopOptions(slot.rangeStopDeg).map((deg) => (
                      <Button key={deg} variant={draft.rangeStopDeg === deg ? 'primary' : 'secondary'} aria-pressed={draft.rangeStopDeg === deg} onClick={() => set({ rangeStopDeg: deg })}>
                        to {deg}°
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {draft.stage !== undefined && exercise.stages ? (
              <div className="flex flex-col gap-2">
                <p className="flex items-center justify-between gap-3 text-body text-on-dark">
                  Stage: {exercise.stages[draft.stage] ?? 'first'}
                  <Button variant="quiet" onClick={() => setChange(change === 'stage' ? null : 'stage')}>{change === 'stage' ? 'Done' : 'Change'}</Button>
                </p>
                {change === 'stage' ? (
                  <div className="flex flex-col gap-2">
                    {exercise.stages.map((name, i) => (
                      <Button key={name} wide variant={draft.stage === i ? 'primary' : 'secondary'} aria-pressed={draft.stage === i} onClick={() => set({ stage: i })}>
                        {draft.stage === i ? '✓ ' : ''}
                        {name}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {showsLoad(exercise) ? (
              <Stepper label={loadLabel(exercise)} value={draft.load} step={loadStep(exercise)} min={0} max={loadMax(exercise, props.dumbbellMax)} onChange={(v) => set({ load: v })} />
            ) : null}
            {blockedOnLoad ? <p className="text-small text-on-dark">First time on this exercise: pick a load that lands at the target RPE.</p> : null}

            <Stepper label={countLabel(slot.repUnit)} value={draft.count} step={countStep(slot.repUnit)} min={0} max={600} onChange={(v) => set({ count: v })} />

            {showRpe ? (
              <>
                <ScalePicker label="RPE" value={draft.rpe} options={RPE_SCALE} onChange={(v) => set({ rpe: v })} />
                {draft.rpe === null && needsRpe ? <p className="text-small text-on-dark">RPE not rated: the load can&apos;t step up until it is.</p> : null}
              </>
            ) : null}

            {props.painPerSet ? <ScalePicker label="Pain, this set" value={draft.pain} options={PAIN_SCALE} onChange={(v) => set({ pain: v })} /> : null}
            {draft.pain === null && props.painPerSet ? <p className="text-small text-on-dark-dim">Unrated pain reads hold: unknown is not clean.</p> : null}

            {editing ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="quiet" onClick={() => props.onEdit(null)}>
                  Back
                </Button>
                <Button variant="quiet" onClick={() => props.onRemove(editing)}>
                  Remove this set
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!editing && step && draft ? (
          panel === 'stop' ? (
            <div aria-label="Stop this exercise" className="flex flex-col gap-2">
              <p className="text-body text-on-dark">Why stop? The set logs with the count above, then this exercise is done for today.</p>
              {STOP_REASONS.map((r) => (
                <Button key={r.value} wide onClick={() => props.onLog(draft, r.value)} disabled={props.busy}>
                  {r.label}
                </Button>
              ))}
              <Button variant="quiet" onClick={() => setPanel(null)}>
                Back
              </Button>
            </div>
          ) : panel === 'swap' ? (
            <div aria-label="Swap" className="flex flex-col gap-2">
              <p className="text-body text-on-dark">Swap for this session. The slot&apos;s job stays the same.</p>
              {substitutions.map((sub) => (
                <Button key={sub.id} wide onClick={() => { props.onSwap(sub.id); setPanel(null) }} aria-pressed={exercise.id === sub.id}>
                  {exercise.id === sub.id ? '✓ ' : ''}
                  {sub.name}
                </Button>
              ))}
              {props.swapped ? (
                <Button wide onClick={() => { props.onSwap(null); setPanel(null) }}>
                  Back to {plan.slot.exerciseId === exercise.id ? exercise.name : exerciseById(slot.exerciseId).name}
                </Button>
              ) : null}
              <Button variant="quiet" onClick={() => setPanel(null)}>
                Back
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {substitutions.length > 0 ? <Button variant="quiet" onClick={() => setPanel('swap')}>Swap</Button> : null}
              <Button variant="quiet" onClick={() => setPanel('stop')}>Stop this exercise</Button>
            </div>
          )
        ) : null}

        {props.error ? (
          <p role="alert" className="text-body text-on-dark">
            {props.error}
          </p>
        ) : null}
      </section>
      <DoneBar timer={props.timer} line={draftLine} label={barLabel} disabled={props.busy || blockedOnLoad} onPress={barPress} />
    </>
  )
}
