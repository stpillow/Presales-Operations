import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { navigate } from '../app/router.ts'
import { availableAt, planSession, PROGRAM, type Gym, type SlotPlan } from '../app/session.ts'
import { useToday } from '../app/today.ts'
import { Button } from '../components/Button.tsx'
import { RestTimer } from '../components/RestTimer.tsx'
import { Screen } from '../components/Screen.tsx'
import { useHistory, useLocation, useLocations, useSetsFor, useSettings, useWorkout } from '../db/hooks.ts'
import { deleteSet, deleteWorkout, markOff, setDumbbellMax, setPresent, setWorkoutLocation, SWAP_KEY_PREFIX, updateWorkout, upsertSet, type History } from '../db/repo.ts'
import { exerciseById } from '../program/program.ts'
import { effectiveSlot } from '../rules/effectiveSlot.ts'
import { WARM_UP_BIKE } from '../rules/equipment.ts'
import { gymLocked, listedLocations, locationIdOf } from '../rules/locations.ts'
import { loggedPain, painRewriteAllowed, type Draft } from '../rules/prefill.ts'
import { firstOpenStepOf, nextStep, openStepForSide, restAfter, sessionSteps, type Step } from '../rules/runOrder.ts'
import { asksForRack, notHereSlots, skipTakesBack, swapOffer, type SwapOffer } from '../rules/runnerGym.ts'
import { healthySideTargets } from '../rules/unilateral.ts'
import type { IsoDate, Location, SessionTemplate, SetLog, SetSide, Settings, StopReason, Workout } from '../schema/index.ts'
import { ActiveCard } from './session/ActiveCard.tsx'
import { DoneBar } from './session/DoneBar.tsx'
import { EndPanel, FinishPanel } from './session/EndPanels.tsx'
import { GymLine } from './session/GymLine.tsx'
import type { GymAction, RackAsk } from './session/GymNotes.tsx'
import { SlotList } from './session/SlotList.tsx'
import { Summary } from './session/Summary.tsx'
import {
  buildSet,
  doneWords,
  heldBarWords,
  lastRpeFor,
  loggedMaxPain,
  markedWords,
  mergeSwaps,
  NO_DUMBBELLS_WORDS,
  notHereEntries,
  notHereWords,
  notLoggedLabels,
  notLoggedWords,
  offerNotes,
  parseStoredSlotIds,
  parseStoredSwaps,
  pickNotHereWords,
  RACK_ASK_LB,
  rackAskWords,
  rackSetWords,
  routeLines,
  setStepKey,
  standingMarkFor,
  stopReasonLabel,
  swapChoices,
  swapPick,
  swapsFromSets,
  templateForWorkout,
  warmUpWords,
  withoutEnginePicks,
  type GymMark,
} from './SessionRunner.helpers.ts'
import { shortDateWords } from './Today.helpers.ts'

const COOL_DOWN_MS = 800
const SHOW_GO_FOR_SECONDS = 300
const ITEMS = PROGRAM.equipment
/** The items in the bag (`carried`): Settings' kit at every gym, never a mark at one (PROGRAM-QUESTIONS 75). */
const CARRIED = ITEMS.filter((item) => item.carried).map((item) => item.id)
const nameOf = (exerciseId: string) => exerciseById(exerciseId).name

function readStoredSwaps(key: string): Record<string, string | null> {
  try {
    return parseStoredSwaps(window.localStorage.getItem(key))
  } catch {
    return {}
  }
}

function readStoredSlotIds(key: string): string[] {
  try {
    return parseStoredSlotIds(window.localStorage.getItem(key))
  } catch {
    return []
  }
}

/** Swaps and Do it anyway, per workout, under SWAP_KEY_PREFIX (so Reset clears both); null removes the key. */
function writeStored(key: string, value: Record<string, string | null> | readonly string[] | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing: the choice still holds for this visit, and a swap is recovered from the sets once one is logged.
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

/**
 * The runner plans at the workout's own gym, stamped at Start (absent means Planet Fitness), not the
 * active one. A Change of gym (before the first set) starts the runner afresh there: offers and marks
 * made at the old gym don't follow it.
 */
function RunnerAtGym(props: RunnerProps) {
  const location = useLocation(locationIdOf(props.workout))
  if (location === undefined || location === null) {
    return <Screen title={`Session ${props.template.letter}`} lead="Opening storage…">{null}</Screen>
  }
  return <Runner key={location.id} {...props} location={location} />
}

function Runner({ workout, template, sets, settings, history, today, lead, location }: RunnerProps & { location: Location }) {
  const storageKey = `${SWAP_KEY_PREFIX}${workout.id}`
  const anywayKey = `${storageKey}:anyway`
  const locations = useLocations()
  const [stored, setStored] = useState<Record<string, string | null>>(() => readStoredSwaps(storageKey))
  /** Slots Shawn picked Do it anyway on: nothing on their list is here, and they run regardless. */
  const [runAnyway, setRunAnyway] = useState<string[]>(() => readStoredSlotIds(anywayKey))
  /** What the last Swap pick offers to mark at this gym, for its slot (`swapOffer`, made at the pick, read against what is here now). */
  const [offer, setOffer] = useState<{ slotId: string; offer: SwapOffer } | null>(null)
  /** The line after a mark is saved, on the slot it was made from. */
  const [marked, setMarked] = useState<{ slotId: string; text: string } | null>(null)
  const [focusSlot, setFocusSlot] = useState<string | null>(null)
  const [pinnedKey, setPinnedKey] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  /** Pain picked per exercise, keyed `${slotId}:${exerciseId}`: a swap never carries one exercise's pain to another. */
  const [painPicked, setPainPicked] = useState<Record<string, number>>({})
  const [panel, setPanel] = useState<'finish' | 'end' | null>(null)
  const [saving, setSaving] = useState(false)
  const [cooling, setCooling] = useState(false)
  /** A write that failed, in a sentence, where it was asked for: under the gym line, or in whatever the card's place shows (the card, Finish, End). */
  const [error, setError] = useState<{ at: 'gym' | 'session'; text: string } | null>(null)
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
  const available = useMemo(() => availableAt(gym), [gym])
  const planInput = { template, week: workout.week, settings, history, gym, before: workout.date }
  const unswapped = useMemo(() => planSession(planInput), [template, workout.week, workout.date, settings, history, gym])
  const engineBySlot = useMemo(() => new Map(unswapped.map((p) => [p.slot.id, p.exercise.id])), [unswapped])
  const chosen = useMemo(() => withoutEnginePicks(mergeSwaps(swapsFromSets(unswapped, sets), stored), engineBySlot), [unswapped, sets, stored, engineBySlot])
  const plans = useMemo(() => planSession({ ...planInput, chosenExercise: chosen }), [template, workout.week, workout.date, settings, history, gym, chosen])
  const steps = useMemo(
    () => sessionSteps(plans.map((p) => ({ slotId: p.slot.id, ...(p.slot.groupId ? { groupId: p.slot.groupId } : {}), optional: p.slot.optional, sides: p.prescriptions.map((x) => ({ side: x.side, sets: x.sets })) }))),
    [plans],
  )
  const done = useMemo(() => new Set(sets.map(setStepKey)), [sets])
  const stopped = useMemo(() => new Set(sets.filter((s) => s.stopped).map((s) => s.slotId)), [sets])
  const loggedSlots = useMemo(() => new Set(sets.map((s) => s.slotId)), [sets])
  // Slots nothing here runs, left for Skip, Do it anyway or Swap: never the run order's automatic next step (PROGRAM-QUESTIONS 83).
  const notHere = useMemo(
    () =>
      notHereSlots(
        plans.map((p) => ({ slotId: p.slot.id, route: p.route })),
        new Set(runAnyway),
        new Set(Object.keys(chosen).filter((slotId) => chosen[slotId] !== undefined)),
        loggedSlots,
      ),
    [plans, runAnyway, chosen, loggedSlots],
  )
  const last = newest(sets)
  const editing = editingId ? (sets.find((s) => s.id === editingId) ?? null) : null

  const pinned = pinnedKey ? (steps.find((s) => s.key === pinnedKey && !done.has(s.key) && !stopped.has(s.slotId) && !notHere.has(s.slotId)) ?? null) : null
  // A tap on a slot with nothing here lands on it without a set to log, until Do it anyway.
  const focused = focusSlot && !notHere.has(focusSlot) ? firstOpenStepOf(steps, focusSlot, done, stopped) : null
  const current: Step | null = pinned ?? focused ?? (focusSlot ? null : nextStep(steps, done, stopped, last ? setStepKey(last) : null, notHere))
  const activeSlotId = editing?.slotId ?? pinned?.slotId ?? focusSlot ?? current?.slotId ?? null
  const activePlan: SlotPlan | undefined = plans.find((p) => p.slot.id === activeSlotId)
  const held = activePlan !== undefined && editing === null && notHere.has(activePlan.slot.id)
  const fallback = nextStep(steps, done, stopped, last ? setStepKey(last) : null, notHere)

  const restStart = last?.loggedAt && restAfter(steps, setStepKey(last), done, stopped, notHere) ? Date.parse(last.loggedAt) : null
  const timer: ReactNode =
    restStart !== null && restStart !== skippedRest ? (
      <RestTimer startedAt={restStart} seconds={settings.restTimerSeconds} hideAfterSeconds={SHOW_GO_FOR_SECONDS} onSkip={() => setSkippedRest(restStart)} />
    ) : null

  async function write(action: () => Promise<void>, after?: () => void, at: 'gym' | 'session' = 'session') {
    setSaving(true)
    setError(null)
    try {
      await action()
      after?.()
      setCooling(true)
    } catch (e) {
      setError({ at, text: `Not saved: ${message(e)}. Tap again.` })
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
      rackCapped: prescription.rackCapped === true,
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
      // A correction keeps the stamp it was logged with: the rack it ran at doesn't change after the fact.
      rackCapped: original.rackCapped === true,
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

  /** Skip: leave a slot with nothing here and go on in the run order; Finish names it. */
  function skip() {
    setFocusSlot(null)
    setPinnedKey(null)
    setEditingId(null)
  }

  /** Skip on a slot run anyway with nothing logged (`skipTakesBack`): Do it anyway is taken back, so the run order passes it again. */
  function takeBack(slotId: string) {
    const next = runAnyway.filter((id) => id !== slotId)
    setRunAnyway(next)
    writeStored(anywayKey, next)
    skip()
  }

  /** A rack tapped on the card (`asksForRack`): this session's gym's heaviest dumbbell, as Where you train sets it. */
  function setRack(slotId: string, lb: number) {
    void write(
      async () => {
        await setDumbbellMax(location.id, lb)
      },
      () => setMarked({ slotId, text: rackSetWords(location.name, lb) }),
    )
  }

  /** Do it anyway: the slot runs like any other, and the card offers to mark what it lacks here. */
  function doAnyway(slotId: string) {
    const next = [...new Set([...runAnyway, slotId])]
    setRunAnyway(next)
    writeStored(anywayKey, next)
    setPinnedKey(null)
    setFocusSlot(slotId)
  }

  /**
   * A Swap pick (`swapPick`): the swap it stores, Do it anyway when it is the gym's own pick on a
   * slot with nothing here, and otherwise what it offers to mark (`swapOffer`): what a pick that
   * isn't here lacks, or what the exercise on the card needed that a pick that is here doesn't.
   */
  function swap(plan: SlotPlan, exerciseId: string | null) {
    const slotId = plan.slot.id
    const cardId = plan.prescriptions[0]?.exerciseId ?? plan.exercise.id
    const pick = swapPick({ pickId: exerciseId, engineId: engineBySlot.get(slotId) ?? plan.slot.exerciseId, cardId, routeKind: plan.route.kind })
    const next = { ...stored, [slotId]: pick.value }
    setStored(next)
    writeStored(storageKey, next)
    setMarked(null)
    if (pick.anyway) {
      setOffer(null)
      doAnyway(slotId)
      return
    }
    const pending = pick.offers && exerciseId !== null ? swapOffer(exerciseById(cardId), exerciseById(exerciseId), available, CARRIED) : null
    setOffer(pending ? { slotId, offer: pending } : null)
  }

  /** "Mark Smith machine here" or "Smith machine isn't here: mark it", at this session's gym. */
  function mark(slotId: string, m: GymMark) {
    void write(
      async () => {
        if (m.here) await setPresent(location.id, m.id, true)
        else await markOff(location.id, m.id, today)
      },
      () => setMarked({ slotId, text: markedWords(m.here, m.id, location.name, ITEMS) }),
    )
  }

  /**
   * What the card says the gym does to a slot, and the taps it offers: Skip and Do it anyway, then the
   * marks. A slot run anyway, or swapped to a pick that isn't here, keeps offering to mark what it
   * lacks (`standingMarkFor`, read from what is stored, so a reload keeps it) and says what the gym
   * lacks for a pick in words; otherwise the last pick's offer stands.
   */
  function gymFor(plan: SlotPlan): { lines: string[]; actions: GymAction[]; rack: RackAsk | null } {
    const slotId = plan.slot.id
    const swapped = chosen[slotId] !== undefined
    const cardId = plan.prescriptions[0]?.exerciseId ?? plan.exercise.id
    const lines = routeLines({ route: plan.route, swapped, gymName: location.name, items: ITEMS, nameOf })
    const pickLine = swapped ? pickNotHereWords(exerciseById(cardId), available, location.name, ITEMS) : null
    const standingId = standingMarkFor({ routeKind: plan.route.kind, routeExerciseId: plan.route.exerciseId, swapped, cardId, held: notHere.has(slotId) })
    const standing = standingId ? swapOffer(exerciseById(standingId), exerciseById(standingId), available, CARRIED) : null
    const pending = standing ?? (offer?.slotId === slotId ? offer.offer : null)
    const notes = offerNotes(pending, available, ITEMS)
    // Dumbbell work at a gym with none set: the load field stops at 0, so the card asks for the rack instead of only naming Where you train.
    const askRack = asksForRack(exerciseById(cardId), available, notHere.has(slotId))
    const actions: GymAction[] = notHere.has(slotId)
      ? [
          { label: 'Skip', onPress: skip },
          { label: 'Do it anyway', onPress: () => doAnyway(slotId) },
        ]
      : skipTakesBack({ slotId, route: plan.route }, new Set(runAnyway), loggedSlots)
        ? [{ label: 'Skip', onPress: () => takeBack(slotId) }]
        : []
    for (const m of notes.marks) actions.push({ label: m.label, onPress: () => mark(slotId, m) })
    const rack = askRack ? { words: rackAskWords(location.name), choices: RACK_ASK_LB.map((lb) => ({ label: `${lb} lb`, onPress: () => setRack(slotId, lb) })) } : null
    const noteLines = askRack ? notes.lines.filter((line) => line !== NO_DUMBBELLS_WORDS) : notes.lines
    return { lines: [...lines, ...(pickLine ? [pickLine] : []), ...noteLines, ...(marked?.slotId === slotId ? [marked.text] : [])], actions, rack }
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
        writeStored(storageKey, null)
        writeStored(anywayKey, null)
      },
      () => navigate({ name: 'today' }),
    )
  }

  function finish(maxPain: number | null) {
    if (sets.length === 0) return discard()
    void write(async () => {
      await updateWorkout(workout.id, { ...(maxPain !== null ? { maxPainDuring: maxPain } : {}), finishedAt: new Date().toISOString(), status: 'finished' })
      writeStored(storageKey, null)
      writeStored(anywayKey, null)
    })
  }

  function end() {
    if (sets.length === 0) return discard()
    void write(
      async () => {
        await updateWorkout(workout.id, { finishedAt: new Date().toISOString(), status: 'abandoned' })
        writeStored(storageKey, null)
        writeStored(anywayKey, null)
      },
      () => navigate({ name: 'today' }),
    )
  }

  function openPanel(which: 'finish' | 'end') {
    setPanel(which)
    setError(null)
    bringToTop()
  }

  /**
   * Change, before the first set: the session plans at the gym picked. Do it anyway answered "nothing
   * here" at the old gym, so it doesn't follow the session to the new one (the runner starts afresh
   * there, keyed by the gym); a swap is the session's own and stays.
   */
  function changeGym(locationId: string) {
    void write(
      async () => {
        await setWorkoutLocation(workout.id, locationId)
        writeStored(anywayKey, null)
      },
      undefined,
      'gym',
    )
  }

  const sessionError = error?.at === 'session' ? error.text : null

  const notHereLine = notHereWords(location.name, notHereEntries(plans, loggedSlots, nameOf))
  const notLogged = notLoggedWords(notLoggedLabels(plans, steps, done, stopped, notHere), notHereLine !== null)
  const finished = doneWords(
    location.name,
    plans.filter((p) => !p.slot.optional && notHere.has(p.slot.id)).map((p) => `${p.slot.label} ${p.exercise.name}`),
  )
  const staleDay = workout.date < today
  const busy = saving || cooling
  const lift = PROGRAM.warmUp.lift
  const warmUp = warmUpWords(lift.circuitMinutesByPhase[String(workout.phase)], available.has(WARM_UP_BIKE))

  const stopOfActive = activePlan && stopped.has(activePlan.slot.id) ? slotSetsOf(activePlan.slot.id).find((s) => s.stopped) : undefined
  const nextName = fallback ? (plans.find((p) => p.slot.id === fallback.slotId)?.exercise.name ?? 'the next slot') : null
  const idleBar = fallback
    ? {
        line: held
          ? heldBarWords(location.name)
          : stopOfActive
            ? `Stopped: ${stopReasonLabel(stopOfActive.stopReason).toLowerCase()}. This exercise is done for today.`
            : 'All sets for this slot are logged.',
        label: `Next: ${nextName}`,
        onPress: skip,
      }
    : { line: held ? heldBarWords(location.name) : finished.bar, label: 'Finish session', onPress: () => openPanel('finish') }

  const sidesFor = (plan: SlotPlan) =>
    plan.slot.unilateral && !plan.slot.injuredOnly && !notHere.has(plan.slot.id)
      ? plan.prescriptions.map((p) => ({ side: p.side, open: openStepForSide(steps, plan.slot.id, p.side, done, stopped) !== null }))
      : []

  return (
    <Screen title={`Session ${template.letter}`} lead={lead}>
      <GymLine
        location={location}
        locations={locations ? listedLocations(locations) : undefined}
        locked={gymLocked(sets.length)}
        busy={busy}
        error={error?.at === 'gym' ? error.text : null}
        onPick={changeGym}
      />
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
            {warmUp.line}
            <Button variant="quiet" onClick={() => setShowWarmUp((v) => !v)}>
              {showWarmUp ? 'Hide' : 'Show'}
            </Button>
          </p>
          {warmUp.noBike ? <p className="text-small text-on-dark">{warmUp.noBike}</p> : null}
          {showWarmUp ? (
            <ol className="flex flex-col gap-1">
              {warmUp.noBike ? null : <li className="text-small text-on-dark-dim">{lift.bike}</li>}
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
          <FinishPanel notHere={notHereLine} notLogged={notLogged} loggedCount={sets.length} loggedMax={loggedMaxPain(sets)} busy={busy} error={sessionError} onFinish={finish} onBack={() => setPanel(null)} />
        ) : panel === 'end' ? (
          <EndPanel loggedCount={sets.length} busy={busy} error={sessionError} onEnd={end} onBack={() => setPanel(null)} />
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
            choices={swapChoices(exerciseById(activePlan.slot.exerciseId), activePlan.substitutions, available, ITEMS)}
            backToName={nameOf(engineBySlot.get(activePlan.slot.id) ?? activePlan.slot.exerciseId)}
            gym={gymFor(activePlan)}
            held={held}
            busy={busy}
            error={sessionError}
            timer={timer}
            idleBar={idleBar}
            onLog={(draft, stop) => current && logStep(current, activePlan, draft, stop)}
            onSave={(set, draft) => saveEdit(set, activePlan, draft)}
            onRemove={(set) => void write(() => deleteSet(set.id), () => setEditingId(null))}
            onEdit={(set) => setEditingId(set ? set.id : null)}
            onSwap={(id) => swap(activePlan, id)}
            onPickSide={(side) => pickSide(activePlan.slot.id, side)}
          />
        ) : (
          <>
            <section aria-label="Now" className="flex flex-col gap-2 rounded-md bg-navy-lift p-4">
              <h2 className="font-sans text-h3 font-semibold text-on-dark wrap-anywhere">{finished.heading}</h2>
              <p className="text-body text-on-dark-dim wrap-anywhere">{finished.line}</p>
              {sessionError ? (
                <p role="alert" className="text-body text-on-dark">
                  {sessionError}
                </p>
              ) : null}
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
        notHere={notHere}
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
