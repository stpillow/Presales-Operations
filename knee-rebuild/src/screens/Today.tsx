import { useState } from 'react'
import { navigate } from '../app/router.ts'
import { PROGRAM, availableAt } from '../app/session.ts'
import { useToday } from '../app/today.ts'
import { Button } from '../components/Button.tsx'
import { ReadingWord, readingSentence } from '../components/ReadingWord.tsx'
import { Screen } from '../components/Screen.tsx'
import { useActiveLocation, useHistory, useLocations, useSettings } from '../db/hooks.ts'
import { clearMarkOff, putWorkout, reopenWorkout, setActiveLocation } from '../db/repo.ts'
import { liftGym } from '../rules/gymDay.ts'
import type { EquipmentId, IsoDate, Location, Settings } from '../schema/index.ts'
import {
  NEW_LOCATION_HASH,
  atGymWords,
  gymRows,
  liftMoves,
  markOffLines,
  movesHeading,
  newWorkout,
  newWorkoutId,
  runLabel,
  runSuggestionAtGym,
  runWeekWords,
  startWords,
  todayView,
  type OpenWorkout,
  type TodayBody,
  type TodayView,
  type YesterdayLine,
} from './Today.helpers.ts'

const LABEL = 'font-mono text-small uppercase tracking-[0.22em] text-on-dark-muted'
const SECTION = 'flex flex-col gap-4'
const HEADING = 'font-sans text-h3 font-medium text-on-dark'
const BY_ID = new Map(PROGRAM.exercises.map((e) => [e.id, e]))

type Lift = Extract<TodayBody, { kind: 'lift' }>

/**
 * The one thing he needs this morning: what today is, what it holds, how yesterday read, and a
 * Start button. Every verdict on screen comes from src/rules through todayView; this file renders.
 */
export function Today() {
  const today = useToday()
  const settings = useSettings()
  const history = useHistory()
  const activeLocation = useActiveLocation()
  const locations = useLocations()

  if (settings === undefined || history === undefined || activeLocation === undefined || locations === undefined || (settings !== null && activeLocation === null)) {
    return (
      <Screen title="Today" lead="Opening storage…">
        <p className="text-body text-on-dark-dim">Reading what is logged on this phone.</p>
      </Screen>
    )
  }
  if (settings === null || activeLocation === null) {
    return (
      <Screen title="Today" lead="No settings yet.">
        <p className="text-body text-on-dark-dim">The injured side and the start date are set in Settings.</p>
        <Button wide onClick={() => navigate({ name: 'settings' })}>
          Settings
        </Button>
      </Screen>
    )
  }

  const view = todayView({ today, settings, history, program: PROGRAM })
  if (view.body.kind === 'stop') {
    return (
      <Screen title="Today" lead={view.dateWords}>
        <StopBlock headline={view.body.headline} items={view.body.items} />
      </Screen>
    )
  }

  return (
    <Screen title="Today" lead={view.dateWords}>
      <GymBlock active={activeLocation} locations={locations} />
      <PhaseLine view={view} />
      {view.body.kind === 'before-start' ? (
        <BeforeStartBlock line={view.body.line} />
      ) : view.body.kind === 'lift' ? (
        <LiftBlock body={view.body} settings={settings} active={activeLocation} locations={locations} today={today} takenIds={history.workouts.map((w) => w.id)} />
      ) : view.body.kind === 'run' ? (
        <RunBlock body={view.body} gym={activeLocation} kit={settings.kit} />
      ) : (
        <OffBlock label={view.body.label} />
      )}
      <OpenWorkoutsBlock open={view.open} />
      <YesterdayBlock lines={view.yesterday} />
    </Screen>
  )
}

/** Rule 9: the stop message takes the whole screen; nothing else is offered until it is cleared. */
function StopBlock({ headline, items }: { headline: string; items: string[] }) {
  return (
    <section aria-label="Red flag" className={SECTION}>
      <h2 className={HEADING}>{headline}</h2>
      <ul className="flex list-disc flex-col gap-2 pl-6">
        {items.map((item) => (
          <li key={item} className="text-body text-on-dark-dim">
            {item}
          </li>
        ))}
      </ul>
      <p className="text-body text-on-dark">Progression is suspended until this is cleared in Settings, with a note.</p>
      <Button wide onClick={() => navigate({ name: 'settings' })}>
        Settings
      </Button>
    </section>
  )
}

/**
 * "At Planet Fitness · Change" under the date. Change opens an inline list (no modal): each gym a
 * list offers, "✓ Active" on the active one, a tap on another makes it active, and "New location"
 * at the end opens the editor. The active gym's mark-offs follow, each with "It's back".
 */
function GymBlock({ active, locations }: { active: Location; locations: Location[] }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rows = gymRows(locations, active.id)
  const marks = markOffLines(active, PROGRAM.equipment)

  const use = async (id: string) => {
    if (id === active.id) {
      setOpen(false)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await setActiveLocation(id)
      setOpen(false)
    } catch (e: unknown) {
      setError(`Could not switch gyms (${e instanceof Error ? e.message : String(e)}). Today still plans at ${active.name}.`)
    } finally {
      setBusy(false)
    }
  }

  const back = async (itemId: EquipmentId) => {
    setBusy(true)
    setError(null)
    try {
      await clearMarkOff(active.id, itemId)
    } catch (e: unknown) {
      setError(`Could not clear the mark (${e instanceof Error ? e.message : String(e)}). It still counts as not here.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Where you train" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="text-body text-on-dark">{atGymWords(active)}</span>
        <span aria-hidden="true" className="text-body text-on-dark-muted">
          ·
        </span>
        <Button variant="quiet" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Change'}
        </Button>
      </div>
      {open ? (
        <ul aria-label="Gyms" className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                aria-pressed={row.active}
                disabled={busy}
                onClick={() => void use(row.id)}
                className={`tap flex w-full items-center justify-between gap-4 rounded-sm border px-4 py-3 text-left text-body disabled:opacity-50 ${
                  row.active ? 'border-paper bg-navy-lift text-on-dark' : 'border-on-dark-faint bg-transparent text-on-dark-dim'
                }`}
              >
                <span>{row.name}</span>
                <span className="font-mono text-small uppercase tracking-[0.22em]">{row.mark}</span>
              </button>
            </li>
          ))}
          <li>
            <a href={NEW_LOCATION_HASH} className="tap flex w-full items-center justify-between gap-4 rounded-sm border border-on-dark-faint px-4 py-3 text-body text-on-dark">
              <span>New location</span>
              <span aria-hidden="true" className="font-mono text-small">
                +
              </span>
            </a>
          </li>
        </ul>
      ) : null}
      {marks.map((m) => (
        <div key={m.itemId} className="flex flex-wrap items-center gap-x-2">
          <span className="text-body text-on-dark-dim">{m.words}</span>
          <span aria-hidden="true" className="text-body text-on-dark-muted">
            ·
          </span>
          <Button variant="quiet" disabled={busy} onClick={() => void back(m.itemId)}>
            It’s back
          </Button>
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-body text-on-dark">
          {error}
        </p>
      ) : null}
    </section>
  )
}

function PhaseLine({ view }: { view: TodayView }) {
  return (
    <section aria-label="Phase and week" className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <span className={LABEL}>
          Phase {view.phaseNumber}
          {view.week !== null ? ` · Week ${view.week}` : ''}
        </span>
        {view.deload ? (
          <span className="rounded-sm border border-on-dark-faint px-2 py-1 font-mono text-label uppercase tracking-[0.22em] text-on-dark">Deload week</span>
        ) : null}
      </div>
      <p className="text-body text-on-dark-dim">{view.phaseName}</p>
      {!view.phaseHasSessions ? (
        <p className="text-body text-on-dark-dim">Phase {view.phaseNumber}’s sessions are not written yet; its gate criteria are all the app carries.</p>
      ) : null}
    </section>
  )
}

function BeforeStartBlock({ line }: { line: string }) {
  return (
    <section aria-label="Scheduled session" className={SECTION}>
      <h2 className={HEADING}>{line}</h2>
      <p className="text-body text-on-dark-dim">Nothing is scheduled before then.</p>
      <Button variant="primary" wide disabled>
        Start
      </Button>
    </section>
  )
}

function LiftBlock({
  body,
  settings,
  active,
  locations,
  today,
  takenIds,
}: {
  body: Lift
  settings: Settings
  active: Location
  locations: Location[]
  today: IsoDate
  takenIds: string[]
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { template, workout, label, letter } = body
  // A session already started stays at its own gym; one still to start runs at the active gym.
  const gym = liftGym(workout, active, locations)

  const start = async () => {
    if (!template) return
    if (workout?.status === 'in-progress') {
      navigate({ name: 'session', workoutId: workout.id })
      return
    }
    if (workout?.status === 'abandoned') {
      // One workout per lift day: an attempt ended early today is reopened, its sets kept, never duplicated.
      setBusy(true)
      setError(null)
      try {
        await reopenWorkout(workout.id)
        navigate({ name: 'session', workoutId: workout.id })
      } catch (e: unknown) {
        setError(`Could not reopen today’s session: ${e instanceof Error ? e.message : String(e)}.`)
      } finally {
        setBusy(false)
      }
      return
    }
    setBusy(true)
    setError(null)
    const id = newWorkoutId(today, template.id, takenIds)
    try {
      await putWorkout(
        newWorkout({
          id,
          date: today,
          templateId: template.id,
          phase: settings.currentPhase,
          week: body.week,
          isDeload: body.isDeload,
          startedAt: new Date().toISOString(),
          locationId: active.id,
        }),
      )
      navigate({ name: 'session', workoutId: id })
    } catch (e: unknown) {
      setError(`Could not save today’s session: ${e instanceof Error ? e.message : String(e)}.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Scheduled session" className={SECTION}>
      <h2 className={HEADING}>
        Session <span className="text-green-bright">{letter}</span>
      </h2>
      {!template ? (
        <>
          <p className="text-body text-on-dark-dim">
            No {label} is written for phase {settings.currentPhase}, so there is nothing to start.
          </p>
          <Button variant="primary" wide disabled>
            Start
          </Button>
        </>
      ) : workout?.status === 'finished' ? (
        <FinishedBlock body={body} />
      ) : (
        <>
          {workout?.status === 'in-progress' ? (
            <p className="text-body text-on-dark-dim">{label} is in progress. Pick up where you left off.</p>
          ) : workout?.status === 'abandoned' ? (
            <p className="text-body text-on-dark-dim">{label} was left early today; what was logged is kept. Resume to carry on in the same session.</p>
          ) : null}
          <MovesBlock template={template} phaseWeek={body.phaseWeek} label={label} gym={gym} kit={settings.kit} />
          <Button variant="primary" wide disabled={busy} onClick={() => void start()}>
            {busy ? 'Saving…' : startWords(label, workout, gym, active)}
          </Button>
          {error ? (
            <p role="alert" className="text-body text-on-dark">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}

/** What moves at the session's gym, from `locationCoverage`: each slot that doesn't run its own exercise there, in words. */
function MovesBlock({ template, phaseWeek, label, gym, kit }: { template: NonNullable<Lift['template']>; phaseWeek: number; label: string; gym: Location; kit: readonly EquipmentId[] }) {
  const moves = liftMoves({ template, phaseWeek, byId: BY_ID, available: availableAt({ location: gym, kit }), items: PROGRAM.equipment })
  return (
    <div className="flex flex-col gap-2">
      <p className={moves.length === 0 ? 'text-small text-on-dark-muted' : 'text-body text-on-dark'}>{movesHeading(gym.name, label, moves.length)}</p>
      {moves.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 pl-6">
          {moves.map((move, i) => (
            <li key={`${i}:${move}`} className="text-body text-on-dark-dim">
              {move}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function FinishedBlock({ body }: { body: Lift }) {
  return (
    <>
      <p className="text-body text-on-dark">{body.label} is done for today.</p>
      {body.reading ? (
        <div className="flex flex-col gap-1">
          <ReadingWord result={body.reading.result} />
          <p className="text-small text-on-dark-dim">{readingSentence(body.reading.result)}</p>
        </div>
      ) : null}
      {!body.checkDone ? <p className="text-small text-on-dark-muted">Tomorrow’s morning check completes this reading.</p> : null}
      <Button wide onClick={() => navigate({ name: 'morning' })}>
        Morning check
      </Button>
    </>
  )
}

function RunBlock({ body, gym, kit }: { body: Extract<TodayBody, { kind: 'run' }>; gym: Location; kit: readonly EquipmentId[] }) {
  // A swap is done at the active gym: a hold morning names the first machine there, and with neither, nothing is suggested (Shawn's Nov 1 answer 7).
  const s = body.suggestion ? runSuggestionAtGym(body.suggestion, { available: availableAt({ location: gym, kit }), gymName: gym.name, morning: body.morning }) : null
  return (
    <section aria-label="Scheduled session" className={SECTION}>
      <h2 className={HEADING}>{body.label}</h2>
      {body.note ? <p className="text-body text-on-dark-dim">{body.note}</p> : null}
      {body.loggedToday.length > 0 ? (
        <p className="text-body text-on-dark">
          ✓ Logged today: {body.loggedToday.map((r) => `${runLabel(r.type)}${r.miles > 0 ? `, ${r.miles} mi` : ''}`).join('; ')}.
        </p>
      ) : s ? (
        <div className="flex flex-col gap-1">
          <p className="text-body text-on-dark">{s.headline}</p>
          {s.reasons.map((r) => (
            <p key={r} className="text-small text-on-dark-dim">
              {r}
            </p>
          ))}
        </div>
      ) : null}
      <p className="text-small text-on-dark-dim">{runWeekWords(body)}</p>
      <Button variant={body.loggedToday.length > 0 ? 'secondary' : 'primary'} wide onClick={() => navigate({ name: 'run' })}>
        {body.loggedToday.length > 0 ? 'Log another run' : 'Log the run'}
      </Button>
    </section>
  )
}

function OffBlock({ label }: { label: string }) {
  return (
    <section aria-label="Scheduled session" className={SECTION}>
      <h2 className={HEADING}>{label}</h2>
      <p className="text-body text-on-dark-dim">Nothing to log today.</p>
    </section>
  )
}

/** A session started and never closed cannot be read, whatever day it carries; say so and offer the way back in. */
function OpenWorkoutsBlock({ open }: { open: OpenWorkout[] }) {
  if (open.length === 0) return null
  return (
    <section aria-label="Unfinished sessions" className="flex flex-col gap-3">
      {open.map((w) => (
        <div key={w.workoutId} className="flex items-center justify-between gap-4">
          <p className="text-body text-on-dark-dim">
            {w.label} from {w.dateWords} is still open.
          </p>
          <Button onClick={() => navigate({ name: 'session', workoutId: w.workoutId })}>Open</Button>
        </div>
      ))}
    </section>
  )
}

function YesterdayBlock({ lines }: { lines: YesterdayLine[] }) {
  const checkPending = lines.some((line) => !line.checkDone)
  return (
    <section aria-label="Yesterday" className="flex flex-col gap-3 border-t border-on-dark-faint pt-4">
      <span className={LABEL}>Yesterday</span>
      {lines.length === 0 ? (
        <p className="text-body text-on-dark-dim">No session yesterday.</p>
      ) : (
        lines.map((line, i) => (
          <div key={`${line.label}:${i}`} className="flex items-center justify-between gap-4">
            <span className="text-body text-on-dark">{line.label}</span>
            <ReadingWord result={line.result} />
          </div>
        ))
      )}
      {checkPending ? (
        <>
          <p className="text-small text-on-dark-muted">The morning check for it is not done yet.</p>
          <Button variant="quiet" onClick={() => navigate({ name: 'morning' })}>
            Morning check
          </Button>
        </>
      ) : null}
    </section>
  )
}
