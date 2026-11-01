import { useState } from 'react'
import { navigate } from '../app/router.ts'
import { PROGRAM } from '../app/session.ts'
import { useToday } from '../app/today.ts'
import { Button } from '../components/Button.tsx'
import { ReadingWord, readingSentence } from '../components/ReadingWord.tsx'
import { Screen } from '../components/Screen.tsx'
import { useHistory, useSettings } from '../db/hooks.ts'
import { putWorkout } from '../db/repo.ts'
import type { IsoDate, Settings } from '../schema/index.ts'
import { newWorkoutId, todayView, type OpenWorkout, type TodayBody, type TodayView, type YesterdayLine } from './Today.helpers.ts'

const LABEL = 'font-mono text-small uppercase tracking-[0.22em] text-on-dark-muted'
const SECTION = 'flex flex-col gap-4'
const HEADING = 'font-sans text-h3 font-medium text-on-dark'

type Lift = Extract<TodayBody, { kind: 'lift' }>

/**
 * The one thing he needs this morning: what today is, what it holds, how yesterday read, and a
 * Start button. Every verdict on screen comes from src/rules through todayView; this file renders.
 */
export function Today() {
  const today = useToday()
  const settings = useSettings()
  const history = useHistory()

  if (settings === undefined || history === undefined) {
    return (
      <Screen title="Today" lead="Opening storage…">
        <p className="text-body text-on-dark-dim">Reading what is logged on this phone.</p>
      </Screen>
    )
  }
  if (settings === null) {
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
      <PhaseLine view={view} />
      {view.body.kind === 'before-start' ? (
        <BeforeStartBlock line={view.body.line} />
      ) : view.body.kind === 'lift' ? (
        <LiftBlock body={view.body} settings={settings} today={today} takenIds={history.workouts.map((w) => w.id)} />
      ) : view.body.kind === 'run' ? (
        <RunBlock label={view.body.label} note={view.body.note} />
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

function LiftBlock({ body, settings, today, takenIds }: { body: Lift; settings: Settings; today: IsoDate; takenIds: string[] }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { template, workout, label, letter } = body

  const start = async () => {
    if (!template) return
    if (workout?.status === 'in-progress') {
      navigate({ name: 'session', workoutId: workout.id })
      return
    }
    setBusy(true)
    setError(null)
    const id = newWorkoutId(today, template.id, takenIds)
    try {
      await putWorkout({
        id,
        date: today,
        templateId: template.id,
        phase: settings.currentPhase,
        week: body.week,
        isDeload: body.isDeload,
        startedAt: new Date().toISOString(),
        status: 'in-progress',
      })
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
            <p className="text-body text-on-dark-dim">{label} was left early today; what was logged is kept and counts. Start again when ready.</p>
          ) : null}
          <Button variant="primary" wide disabled={busy} onClick={() => void start()}>
            {busy ? 'Saving…' : workout?.status === 'in-progress' ? `Resume ${label}` : `Start ${label}`}
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

function RunBlock({ label, note }: { label: string; note: string | null }) {
  return (
    <section aria-label="Scheduled session" className={SECTION}>
      <h2 className={HEADING}>{label}</h2>
      {note ? <p className="text-body text-on-dark-dim">{note}</p> : null}
      <Button variant="primary" wide onClick={() => navigate({ name: 'run' })}>
        Log the run
      </Button>
      <p className="text-small text-on-dark-muted">The run logger arrives in M4.</p>
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
