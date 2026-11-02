import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { navigate } from '../app/router.ts'
import { planSession, PROGRAM, type Gym, type SlotPlan } from '../app/session.ts'
import { useToday } from '../app/today.ts'
import { Button } from '../components/Button.tsx'
import { RestTimer } from '../components/RestTimer.tsx'
import { Screen } from '../components/Screen.tsx'
import { useHistory, useLocation, useSetsFor, useSettings, useWorkout } from '../db/hooks.ts'
import { deleteSet, deleteWorkout, SWAP_KEY_PREFIX, updateWorkout, upsertSet, type History } from '../db/repo.ts'
import { exerciseById } from '../program/program.ts'
import { effectiveSlot } from '../rules/effectiveSlot.ts'
import { locationIdOf } from '../rules/locations.ts'
import { loggedPain, painRewriteAllowed, type Draft } from '../rules/prefill.ts'
import { firstOpenStepOf, nextStep, openStepForSide, restAfter, sessionSteps, type Step } from '../rules/runOrder.ts'
import { healthySideTargets } from '../rules/unilateral.ts'
import type { IsoDate, Location, SessionTemplate, SetLog, SetSide, Settings, StopReason, Workout } from '../schema/index.ts'
import { ActiveCard } from './session/ActiveCard.tsx'
import { DoneBar } from './session/DoneBar.tsx'
import { EndPanel, FinishPanel } from './session/EndPanels.tsx'
import { SlotList } from './session/SlotList.tsx'
import { Summary } from './session/Summary.tsx'
import { buildSet, lastRpeFor, loggedMaxPain, mergeSwaps, parseStoredSwaps, setStepKey, stopReasonLabel, swapsFromSets, templateForWorkout } from './SessionRunner.helpers.ts'
import { shortDateWords } from './Today.helpers.ts'

const COOL_DOWN_MS = 800
const SHOW_GO_FOR_SECONDS = 300

function readStoredSwaps(key: string): Record<string, string | null> {
  try {
    return parseStoredSwaps(window.localStorage.getItem(key))
  } catch {
    return {}
  }
}

function writeStoredSwaps(key: string, value: Record<string, string | null> | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing: the swap still holds for this visit and is recovered from the sets once one is logged.
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function newest(sets: readonly SetLog[]): SetLog | undefined {
  return [...sets].sort((a, b) => (a.loggedAt ?? '').localeCompare(b.loggedAt ?? '')).at(-1)
}

/** The Session runner (PROMPT section 5, row 2). The design is docs/session-runner-design.md. */
export function SessionRunner({ workoutId }: { workoutId: string }) {
  const workout = useWorkout(workoutId)
  const sets = useSetsFor(workoutId)
  const settings = useSettings()
  const history = useHistory()
  const today = useToday()

  if (workout === undefined || sets === undefined || settings === undefined || history === undefined) {
    return <Screen title="Session" lead="Opening storage…">{null}</Screen>
  }
  if (workout === null || settings === null) {
    return (
      <Screen title="Session" lead="This session isn't in storage.">
        <Button variant="primary" wide onClick={() => navigate({ name: 'today' })}>
          Back to Today
        </Button>
      </Screen>
    )
  }
  const template = templateForWorkout(workout, PROGRAM.templates)
  const lead = `Phase ${workout.phase} · Week ${workout.week} · ${shortDateWords(workout.date)}`
  if (!template) {
    return (
      <Screen title="Session" lead={lead}>
        <p className="text-body text-on-dark-dim">The sessions for this phase are not written yet.</p>
        <Button variant="primary" wide onClick={() => navigate({ name: 'today' })}>
          Back to Today
        </Button>
      </Screen>
    )
  }
  if (workout.status === 'finished' || workout.status === 'abandoned') {
    return (
      <Screen title={`Session ${template.letter}`} lead={lead}>
        <Summary workout={workout} template={template} sets={sets} injuredSide={settings.injuredSide} />
      </Screen>
    )
  }
  return <RunnerAtGym workout={workout} template={template} sets={sets} settings={settings} history={history} today={today} lead={lead} />
}

type RunnerProps = { workout: Workout; template: SessionTemplate; sets: SetLog[]; settings: Settings; history: History; today: IsoDate; lead: string }

/** The runner plans at the workout's own gym, stamped at Start (absent means Planet Fitness), not the active one. */
function RunnerAtGym(props: RunnerProps) {
  const location = useLocation(locationIdOf(props.workout))
  if (location === undefined || location === null) {
    return <Screen title={`Session ${props.template.letter}`} lead="Opening storage…">{null}</Screen>
  }
  return <Runner {...props} location={location} />
}

function Runner({ workout, template, sets, settings, history, today, lead, location }: RunnerProps & { location: Location }) {
  const storageKey = `${SWAP_KEY_PREFIX}${workout.id}`
  const [stored, setStored] = useState<Record<string, string | null>>(() => readStoredSwaps(storageKey))
  const [focusSlot, setFocusSlot] = useState<string | null>(null)
  const [pinnedKey, setPinnedKey] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  /** Pain picked per exercise, keyed `${slotId}:${exerciseId}`: a swap never carries one exercise's pain to another. */
  const [painPicked, setPainPicked] = useState<Record<string, number>>({})
  const [panel, setPanel] = useState<'finish' | 'end' | null>(null)
  const [saving, setSaving] = useState(false)
  const [cooling, setCooling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skippedRest, setSkippedRest] = useState<number | null>(null)
  const [showWarmUp, setShowWarmUp] = useState(false)
  const topRef = useRef<HTMLDivElement | null>(null)
  const [scrollTick, setScrollTick] = useState(0)

  useEffect(() => {
    if (!cooling) return
    const t = window.setTimeout(() => setCooling(false), COOL_DOWN_MS)
    return () => window.clearTimeout(t)
  }, [cooling])

  // A tap far down the page (a slot row, Finish, End) changes the card at the top: bring it into view.
  useEffect(() => {
    if (scrollTick === 0) return
    topRef.current?.scrollIntoView({ block: 'start' })
  }, [scrollTick])
  const bringToTop = () => setScrollTick((n) => n + 1)

  const gym = useMemo<Gym>(() => ({ location, kit: settings.kit }), [location, settings.kit])
  const planInput = { template, week: workout.week, settings, history, gym, before: workout.date }
  const unswapped = useMemo(() => planSession(planInput), [template, workout.week, workout.date, settings, history, gym])
  const chosen = useMemo(() => mergeSwaps(swapsFromSets(unswapped, sets), stored), [unswapped, sets, stored])
  const plans = useMemo(() => planSession({ ...planInput, chosenExercise: chosen }), [template, workout.week, workout.date, settings, history, gym, chosen])
  const steps = useMemo(
    () => sessionSteps(plans.map((p) => ({ slotId: p.slot.id, ...(p.slot.groupId ? { groupId: p.slot.groupId } : {}), optional: p.slot.optional, sides: p.prescriptions.map((x) => ({ side: x.side, sets: x.sets })) }))),
    [plans],
  )
  const done = useMemo(() => new Set(sets.map(setStepKey)), [sets])
  const stopped = useMemo(() => new Set(sets.filter((s) => s.stopped).map((s) => s.slotId)), [sets])
  const last = newest(sets)
  const editing = editingId ? (sets.find((s) => s.id === editingId) ?? null) : null

  const pinned = pinnedKey ? (steps.find((s) => s.key === pinnedKey && !done.has(s.key) && !stopped.has(s.slotId)) ?? null) : null
  const focused = focusSlot ? firstOpenStepOf(steps, focusSlot, done, stopped) : null
  const current: Step | null = pinned ?? focused ?? (focusSlot ? null : nextStep(steps, done, stopped, last ? setStepKey(last) : null))
  const activeSlotId = editing?.slotId ?? pinned?.slotId ?? focusSlot ?? current?.slotId ?? null
  const activePlan: SlotPlan | undefined = plans.find((p) => p.slot.id === activeSlotId)
  const fallback = nextStep(steps, done, stopped, last ? setStepKey(last) : null)

  const restStart = last?.loggedAt && restAfter(steps, setStepKey(last), done, stopped) ? Date.parse(last.loggedAt) : null
  const timer: ReactNode =
    restStart !== null && restStart !== skippedRest ? (
      <RestTimer startedAt={restStart} seconds={settings.restTimerSeconds} hideAfterSeconds={SHOW_GO_FOR_SECONDS} onSkip={() => setSkippedRest(restStart)} />
    ) : null

  async function write(action: () => Promise<void>, after?: () => void) {
    setSaving(true)
    setError(null)
    try {
      await action()
      after?.()
      setCooling(true)
    } catch (e) {
      setError(`Not saved: ${message(e)}. Tap again.`)
    } finally {
      setSaving(false)
    }
  }

  const slotSetsOf = (slotId: string) => sets.filter((s) => s.slotId === slotId)
  const painKey = (slotId: string, exerciseId: string) => `${slotId}:${exerciseId}`
  function exercisePain(slotId: string, exerciseId: string): number | null {
    return painPicked[painKey(slotId, exerciseId)] ?? loggedPain(slotSetsOf(slotId).filter((s) => s.exerciseId === exerciseId))
  }

  function prescriptionFor(plan: SlotPlan, side: SetSide) {
    return plan.prescriptions.find((p) => p.side === side) ?? plan.prescriptions[0]
  }

  function logStep(step: Step, plan: SlotPlan, draft: Draft, stop?: StopReason) {
    const prescription = prescriptionFor(plan, step.side)
    if (!prescription) return
    const exercise = exerciseById(prescription.exerciseId)
    const pain = settings.painPerSet ? draft.pain : exercisePain(plan.slot.id, exercise.id)
    const set = buildSet({
      workoutId: workout.id,
      slot: plan.slot,
      exercise,
      repUnit: prescription.repUnit,
      side: step.side,
      setNumber: step.setNumber,
      draft: { ...draft, pain },
      loggedAt: new Date().toISOString(),
      ...(stop ? { stop } : {}),
    })
    void write(
      () => upsertSet(set),
      () => {
        setFocusSlot(null)
        setPinnedKey(null)
      },
    )
  }

  function saveEdit(original: SetLog, plan: SlotPlan, draft: Draft) {
    const exercise = exerciseById(original.exerciseId)
    const unit = effectiveSlot(plan.slot, exercise).repUnit
    const pain = settings.painPerSet ? draft.pain : (painPicked[painKey(plan.slot.id, exercise.id)] ?? original.painDuring ?? null)
    const set = buildSet({
      workoutId: workout.id,
      slot: plan.slot,
      exercise,
      // A correction keeps the field the set was stored in.
      repUnit: original.seconds !== undefined ? 'seconds' : unit === 'seconds' ? 'reps' : unit,
      side: original.side,
      setNumber: original.setNumber,
      draft: { ...draft, pain },
      // A correction keeps its time stamp: a fresh one would restart the rest timer and reorder sets for the climbing check.
      loggedAt: original.loggedAt ?? new Date().toISOString(),
      ...(original.stopped ? { stop: original.stopReason ?? 'other' } : {}),
    })
    void write(() => upsertSet(set), () => setEditingId(null))
  }

  function setExercisePain(slotId: string, exerciseId: string, value: number) {
    setPainPicked((p) => ({ ...p, [painKey(slotId, exerciseId)]: value }))
    if (settings.painPerSet) return
    const own = slotSetsOf(slotId).filter((s) => s.exerciseId === exerciseId)
    // Only sets logged per exercise (unrated, or one shared value) take the new rating; a climb logged per set stays.
    if (own.length === 0 || !painRewriteAllowed(own)) return
    void write(async () => {
      for (const s of own) await upsertSet({ ...s, painDuring: value })
    })
  }

  function swap(slotId: string, exerciseId: string | null) {
    const next = { ...stored, [slotId]: exerciseId }
    setStored(next)
    writeStoredSwaps(storageKey, next)
  }

  function pickSide(slotId: string, side: SetSide) {
    const step = openStepForSide(steps, slotId, side, done, stopped)
    if (step) setPinnedKey(step.key)
  }

  /** A session with nothing logged didn't happen: it is discarded, never kept as an empty abandoned or finished one. */
  function discard() {
    void write(
      async () => {
        await deleteWorkout(workout.id)
        writeStoredSwaps(storageKey, null)
      },
      () => navigate({ name: 'today' }),
    )
  }

  function finish(maxPain: number | null) {
    if (sets.length === 0) return discard()
    void write(async () => {
      await updateWorkout(workout.id, { ...(maxPain !== null ? { maxPainDuring: maxPain } : {}), finishedAt: new Date().toISOString(), status: 'finished' })
      writeStoredSwaps(storageKey, null)
    })
  }

  function end() {
    if (sets.length === 0) return discard()
    void write(
      async () => {
        await updateWorkout(workout.id, { finishedAt: new Date().toISOString(), status: 'abandoned' })
        writeStoredSwaps(storageKey, null)
      },
      () => navigate({ name: 'today' }),
    )
  }

  function openPanel(which: 'finish' | 'end') {
    setPanel(which)
    bringToTop()
  }

  const notLogged = plans.filter((p) => !p.slot.optional && !stopped.has(p.slot.id) && steps.some((s) => s.slotId === p.slot.id && !done.has(s.key))).map((p) => `${p.slot.label} ${p.exercise.name}`)
  const staleDay = workout.date < today
  const busy = saving || cooling
  const lift = PROGRAM.warmUp.lift
  const circuitMinutes = lift.circuitMinutesByPhase[String(workout.phase)]

  const stopOfActive = activePlan && stopped.has(activePlan.slot.id) ? slotSetsOf(activePlan.slot.id).find((s) => s.stopped) : undefined
  const nextName = fallback ? (plans.find((p) => p.slot.id === fallback.slotId)?.exercise.name ?? 'the next slot') : null
  const idleBar = fallback
    ? {
        line: stopOfActive ? `Stopped: ${stopReasonLabel(stopOfActive.stopReason).toLowerCase()}. This exercise is done for today.` : 'All sets for this slot are logged.',
        label: `Next: ${nextName}`,
        onPress: () => {
          setFocusSlot(null)
          setPinnedKey(null)
          setEditingId(null)
        },
      }
    : { line: 'Every required set is logged.', label: 'Finish session', onPress: () => openPanel('finish') }

  const sidesFor = (plan: SlotPlan) =>
    plan.slot.unilateral && !plan.slot.injuredOnly ? plan.prescriptions.map((p) => ({ side: p.side, open: openStepForSide(steps, plan.slot.id, p.side, done, stopped) !== null })) : []

  return (
    <Screen title={`Session ${template.letter}`} lead={lead}>
      <div className="-mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="quiet" onClick={() => navigate({ name: 'today' })}>
          Today
        </Button>
        {workout.isDeload ? <span className="font-mono text-small uppercase tracking-[0.22em] text-on-dark">Deload week: fewer sets, same loads</span> : null}
      </div>
      {settings.redFlag.active ? <p className="text-body text-on-dark">Red-flag state: progression is suspended; loads repeat the last session.</p> : null}
      {staleDay ? (
        <div className="flex flex-col gap-2">
          <p className="text-body text-on-dark">Started {shortDateWords(workout.date)}. Finish it or end it.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => openPanel('finish')}>Finish session</Button>
            <Button variant="quiet" onClick={() => openPanel('end')}>
              End without finishing
            </Button>
          </div>
        </div>
      ) : null}

      {sets.length === 0 || showWarmUp ? (
        <section aria-label="Warm-up" className="flex flex-col gap-2">
          <p className="flex items-center justify-between gap-3 text-body text-on-dark">
            Warm-up · bike 5 min · knee circuit {circuitMinutes ?? 5} min
            <Button variant="quiet" onClick={() => setShowWarmUp((v) => !v)}>
              {showWarmUp ? 'Hide' : 'Show'}
            </Button>
          </p>
          {showWarmUp ? (
            <ol className="flex flex-col gap-1">
              <li className="text-small text-on-dark-dim">{lift.bike}</li>
              {lift.circuit.map((item) => (
                <li key={item} className="text-small text-on-dark-dim">
                  {item}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      <div ref={topRef} className="scroll-mt-4">
        {panel === 'finish' ? (
          <FinishPanel notLogged={notLogged} loggedCount={sets.length} loggedMax={loggedMaxPain(sets)} busy={busy} onFinish={finish} onBack={() => setPanel(null)} />
        ) : panel === 'end' ? (
          <EndPanel loggedCount={sets.length} busy={busy} onEnd={end} onBack={() => setPanel(null)} />
        ) : activePlan ? (
          <ActiveCard
            key={`${editing ? `edit:${editing.id}` : (current?.slotId === activePlan.slot.id ? current.key : `view:${activePlan.slot.id}`)}:${activePlan.prescriptions[0]?.exerciseId ?? ''}`}
            plan={activePlan}
            step={editing ? null : current && current.slotId === activePlan.slot.id ? current : null}
            editing={editing}
            slotSets={slotSetsOf(activePlan.slot.id)}
            setsBySide={Object.fromEntries(activePlan.prescriptions.map((p) => [p.side, p.sets]))}
            sides={sidesFor(activePlan)}
            injuredSide={settings.injuredSide}
            painPerSet={settings.painPerSet}
            rackLb={location.dumbbellMaxLb}
            historyRpe={lastRpeFor(activePlan.prescriptions[0]?.exerciseId ?? activePlan.exercise.id, history.setLogs)}
            budget={healthySideTargets(slotSetsOf(activePlan.slot.id).filter((s) => s.side === settings.injuredSide && s.exerciseId === (activePlan.prescriptions[0]?.exerciseId ?? activePlan.exercise.id)))}
            exercisePain={exercisePain(activePlan.slot.id, editing?.exerciseId ?? activePlan.prescriptions[0]?.exerciseId ?? activePlan.exercise.id)}
            onExercisePain={(v) => setExercisePain(activePlan.slot.id, editing?.exerciseId ?? activePlan.prescriptions[0]?.exerciseId ?? activePlan.exercise.id, v)}
            swapped={chosen[activePlan.slot.id] !== undefined}
            busy={busy}
            error={error}
            timer={timer}
            idleBar={idleBar}
            onLog={(draft, stop) => current && logStep(current, activePlan, draft, stop)}
            onSave={(set, draft) => saveEdit(set, activePlan, draft)}
            onRemove={(set) => void write(() => deleteSet(set.id), () => setEditingId(null))}
            onEdit={(set) => setEditingId(set ? set.id : null)}
            onSwap={(id) => swap(activePlan.slot.id, id)}
            onPickSide={(side) => pickSide(activePlan.slot.id, side)}
          />
        ) : (
          <>
            <section aria-label="Now" className="flex flex-col gap-2 rounded-md bg-navy-lift p-4">
              <h2 className="font-sans text-h3 font-semibold text-on-dark">Every required set is logged</h2>
              <p className="text-body text-on-dark-dim">Optional slots are still open below. Finish when you&apos;re done.</p>
            </section>
            <DoneBar timer={timer} line={idleBar.line} label={idleBar.label} disabled={busy} onPress={idleBar.onPress} />
          </>
        )}
      </div>

      <SlotList
        plans={plans}
        steps={steps}
        done={done}
        stopped={stopped}
        currentSlotId={activeSlotId}
        onPick={(slotId) => {
          setEditingId(null)
          setPanel(null)
          setPinnedKey(null)
          setFocusSlot(slotId)
          bringToTop()
        }}
      />

      <div className="flex flex-col gap-2">
        <Button wide onClick={() => openPanel('finish')}>
          Finish session
        </Button>
        <Button variant="quiet" onClick={() => openPanel('end')}>
          End without finishing
        </Button>
      </div>
      <div aria-hidden="true" className="h-56" />
    </Screen>
  )
}
