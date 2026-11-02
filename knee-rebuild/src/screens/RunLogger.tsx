import { useId, useState, type ReactNode } from 'react'
import { navigate } from '../app/router.ts'
import { PROGRAM } from '../app/session.ts'
import { useToday } from '../app/today.ts'
import { Button } from '../components/Button.tsx'
import { PAIN_SCALE, ScalePicker } from '../components/ScalePicker.tsx'
import { Screen } from '../components/Screen.tsx'
import { Stepper } from '../components/Stepper.tsx'
import { Tap } from '../components/Tap.tsx'
import { useHistory, useSettings } from '../db/hooks.ts'
import { addRun, deleteRun, type History } from '../db/repo.ts'
import type { IsoDate, Run, RunType, Settings } from '../schema/index.ts'
import { runLabel } from './Today.helpers.ts'
import {
  EFFORTS,
  MILES_MAX,
  MILES_STEP,
  MINUTES_MAX,
  MINUTES_STEP,
  RUN_TYPES,
  SWAP_TYPES,
  dayChoiceWords,
  dayChoicesNote,
  effortWords,
  emptyForm,
  errorWords,
  isSwapType,
  leadWords,
  loggedWords,
  loggerView,
  newRunId,
  noSuggestionWords,
  reasonSentence,
  resolveForm,
  runPlanWords,
  runRow,
  stravaProblem,
  suggestionHead,
  takeSwapWords,
  toRun,
  weekLine,
  type LoggerView,
  type RunForm,
} from './RunLogger.helpers.ts'

const TITLE = 'Log a run'
const LABEL = 'font-mono text-small font-normal uppercase tracking-[0.22em] text-on-dark-muted'
const HEADING = 'font-sans text-h3 font-medium text-on-dark'

type FormView = Extract<LoggerView, { kind: 'form' }>

/**
 * One run, one hand, under ten seconds: the type preselected from the day's session, the engine's
 * suggestion in words (a swap is offered, never switched to), miles, minutes, effort, max pain, the
 * strides and tempo toggles, a Strava link and a note, with the week's miles against its target
 * updating as you type. Every decision comes from src/rules through loggerView; this file renders.
 */
export function RunLogger() {
  const today = useToday()
  const settings = useSettings()
  const history = useHistory()

  if (settings === undefined || history === undefined) {
    return (
      <Screen title={TITLE} lead="Opening storage…">
        <p className="text-body text-on-dark-dim">This week’s runs and the mileage plan load from the phone.</p>
      </Screen>
    )
  }
  if (settings === null) {
    return (
      <Screen title={TITLE} lead="No settings yet.">
        <p className="text-body text-on-dark-dim">Open the app from Today once so it can seed its settings, then come back.</p>
      </Screen>
    )
  }
  return <Logger today={today} settings={settings} history={history} />
}

function Logger({ today, settings, history }: { today: IsoDate; settings: Settings; history: History }) {
  const [form, setForm] = useState<RunForm>(emptyForm)
  const [saved, setSaved] = useState<Run | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const view = loggerView({ today, picked: { date: form.date, type: form.type }, settings, history, program: PROGRAM })
  if (view.kind === 'before-start') {
    return (
      <Screen title={TITLE} lead={view.line}>
        <p className="text-body text-on-dark-dim">Runs log from the first day of the program.</p>
        <Button wide onClick={() => navigate({ name: 'today' })}>
          Today
        </Button>
      </Screen>
    )
  }

  // Removing the run just logged goes back to the form as it was typed, so it can be corrected and saved again.
  const onRemoved = (id: string) => {
    if (saved?.id === id) setSaved(null)
  }

  if (saved) {
    return (
      <Screen title={TITLE} lead={loggedWords(saved, today, history.morningChecks)}>
        <p role="status" className="text-body text-on-dark">
          {weekLine(view.summary, null)}
        </p>
        <div className="flex flex-col gap-3">
          <Button variant="primary" wide onClick={() => navigate({ name: 'today' })}>
            Today
          </Button>
          <Button wide onClick={() => navigate({ name: 'week' })}>
            Week
          </Button>
          <Button
            variant="quiet"
            wide
            onClick={() => {
              setForm(emptyForm())
              setError(null)
              setSaved(null)
            }}
          >
            Log another run
          </Button>
        </div>
        <WeekRuns runs={view.weekRuns} onRemoved={onRemoved} />
      </Screen>
    )
  }

  const resolved = resolveForm(form, view)
  const draft = toRun(resolved, newRunId(resolved.date, history.runs.map((r) => r.id)))
  const set = (patch: Partial<RunForm>) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    if (!draft.ok) return
    setSaving(true)
    setError(null)
    try {
      await addRun(draft.run)
    } catch (e) {
      setError(`The run did not save (${errorWords(e)}). Nothing was written; tap Save again.`)
      setSaving(false)
      return
    }
    setSaving(false)
    setSaved(draft.run)
  }

  return (
    <Screen title={TITLE} lead={leadWords(view)}>
      {view.stop ? <StopBlock headline={view.stop.headline} items={view.stop.items} /> : null}

      {view.dates.length > 1 ? (
        <Section label="Day">
          <div role="radiogroup" aria-label="Day" className="grid grid-cols-4 gap-2">
            {view.dates.map((date) => (
              <Choice key={date} compact label={dayChoiceWords(date, today)} selected={view.date === date} onSelect={() => set({ date })} />
            ))}
          </div>
          <Note>{dayChoicesNote(today, settings.startDate)}</Note>
        </Section>
      ) : null}

      <Section label="Type">
        <div role="radiogroup" aria-label="Type" className="flex flex-col gap-2">
          {RUN_TYPES.map((type) => (
            <Choice key={type} label={runLabel(type)} detail={type === view.preselected ? 'scheduled' : undefined} selected={view.type === type} onSelect={() => set({ type })} />
          ))}
        </div>
      </Section>

      <SuggestionBlock view={view} today={today} onTake={(type) => set({ type })} />

      <Section label="Distance and time">
        {resolved.swap ? (
          <p className="text-body text-on-dark-dim">A swap is logged as 0 miles: it counts as the session and adds no miles. Its minutes are what it measures, so set them to save.</p>
        ) : (
          <Stepper label="Distance" unit="miles" decimal step={MILES_STEP} min={0} max={MILES_MAX} value={resolved.miles} onChange={(miles) => set({ miles })} />
        )}
        <p role="status" aria-live="polite" className="text-body text-on-dark">
          {weekLine(view.summary, { type: resolved.type, miles: resolved.miles })}
        </p>
        <Stepper label="Time" unit="minutes" step={MINUTES_STEP} min={0} max={MINUTES_MAX} value={resolved.minutes} onChange={(minutes) => set({ minutes })} />
      </Section>

      <Section label="Effort">
        <div role="radiogroup" aria-label="Effort" className="grid grid-cols-3 gap-2">
          {EFFORTS.map((effort) => (
            <Choice key={effort} compact label={effortWords(effort)} selected={resolved.effort === effort} onSelect={() => set({ effort })} />
          ))}
        </div>
      </Section>

      <Section label="Pain">
        <ScalePicker label="Max pain during the run" value={resolved.maxPain} options={PAIN_SCALE} onChange={(maxPain) => set({ maxPain })} />
        <Note>Required: an unrated run is unknown, and unknown is not clean.</Note>
      </Section>

      {resolved.swap ? null : (
        <Section label="Strides and tempo">
          <Tap label="Strides" value={resolved.strides} onChange={(strides) => set({ strides })} />
          <Tap label="Tempo segment" value={resolved.tempo} onChange={(tempo) => set({ tempo })} />
          {view.suggestion && (view.suggestion.strides || view.suggestion.tempo) ? <Note>Preset from the suggestion; tap to change.</Note> : null}
        </Section>
      )}

      <StravaField value={resolved.stravaUrl} onChange={(stravaUrl) => set({ stravaUrl })} />

      <NoteField value={resolved.notes} onChange={(notes) => set({ notes })} />

      {error ? (
        <p role="alert" className="text-body text-on-dark">
          {error}
        </p>
      ) : null}
      <Button variant="primary" wide disabled={!draft.ok || saving} onClick={() => void save()}>
        {saving ? 'Saving…' : draft.ok ? 'Save run' : draft.blocker}
      </Button>

      <WeekRuns runs={view.weekRuns} onRemoved={onRemoved} />
    </Screen>
  )
}

/** A short mono label over a group. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-3">
      <h2 className={LABEL}>{label}</h2>
      {children}
    </section>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-small text-on-dark-muted">{children}</p>
}

/** One of several choices: the chosen one says so with a mark and a word, never by color alone. */
function Choice({ label, selected, onSelect, detail, compact = false }: { label: string; selected: boolean; onSelect: () => void; detail?: string | undefined; compact?: boolean }) {
  const mark = <span className="font-mono text-small uppercase tracking-[0.22em]">{selected ? (compact ? '✓' : '✓ Chosen') : '○'}</span>
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`tap flex w-full items-center rounded-sm border py-3 text-body ${compact ? 'justify-center gap-1 px-2' : 'justify-between gap-4 px-4 text-left'} ${
        selected ? 'border-paper bg-navy-lift text-on-dark' : 'border-on-dark-faint bg-transparent text-on-dark-dim'
      }`}
    >
      {compact ? (
        <>
          {mark}
          <span>{label}</span>
        </>
      ) : (
        <>
          <span>
            {label}
            {detail ? <span className="text-small text-on-dark-muted"> · {detail}</span> : null}
          </span>
          {mark}
        </>
      )}
    </button>
  )
}

/** Rule 9: the stop message leads; a run that happened still logs, and nothing is suggested. */
function StopBlock({ headline, items }: { headline: string; items: string[] }) {
  return (
    <section aria-label="Red flag" className="flex flex-col gap-3">
      <h2 className={HEADING}>{headline}</h2>
      <ul className="flex list-disc flex-col gap-1 pl-6">
        {items.map((item) => (
          <li key={item} className="text-body text-on-dark-dim">
            {item}
          </li>
        ))}
      </ul>
      <p className="text-body text-on-dark">Progression is suspended until this is cleared in Settings, with a note. A run you did still logs here.</p>
    </section>
  )
}

/** suggestRun's miles and reasons in words; a suggested swap is one tap away and never taken for you. */
function SuggestionBlock({ view, today, onTake }: { view: FormView; today: IsoDate; onTake: (type: RunType) => void }) {
  const { suggestion } = view
  if (!suggestion) {
    return (
      <Section label="Suggested">
        <p className="text-body text-on-dark-dim">{noSuggestionWords(view, today)}</p>
      </Section>
    )
  }
  const swapTaken = isSwapType(view.type)
  return (
    <Section label="Suggested">
      <p className="text-lead text-on-dark">{suggestionHead(suggestion)}</p>
      {suggestion.swapSuggested ? <p className="text-body text-on-dark-dim">If you run it anyway: {runPlanWords(suggestion)}.</p> : null}
      {suggestion.miles === null ? <p className="text-body text-on-dark-dim">No miles are suggested: {view.summary.target.reason}.</p> : null}
      {suggestion.reasons.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {suggestion.reasons.map((reason) => (
            <li key={reason} className="text-body text-on-dark-dim">
              {reasonSentence(reason)}
            </li>
          ))}
        </ul>
      ) : null}
      {suggestion.swapSuggested ? (
        swapTaken ? (
          <p className="text-body text-on-dark">Swap taken. It counts as the session and adds no miles.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-body text-on-dark">{runLabel(view.type ?? suggestion.type)} stays chosen unless you take a swap.</p>
            {SWAP_TYPES.map((type) => (
              <Button key={type} wide onClick={() => onTake(type)}>
                {takeSwapWords(type)}
              </Button>
            ))}
          </div>
        )
      ) : null}
    </Section>
  )
}

/** Optional; the schema decides what is a Strava link, and its refusal is said in words. */
function StravaField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId()
  const problem = stravaProblem(value)
  return (
    <Section label="Strava link">
      <label htmlFor={id} className="text-body text-on-dark-dim">
        Optional. The activity’s strava.com address.
      </label>
      <input
        id={id}
        type="url"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="https://www.strava.com/activities/…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tap w-full rounded-sm bg-ink px-3 text-body text-on-dark placeholder:text-on-dark-faint"
      />
      {problem ? (
        <p role="alert" className="text-body text-on-dark">
          {problem}
        </p>
      ) : null}
    </Section>
  )
}

function NoteField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <Section label="Note">
      <label htmlFor={id} className="text-body text-on-dark-dim">
        Optional. Route, footing, anything the numbers miss.
      </label>
      <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} className="tap w-full rounded-sm bg-ink p-3 text-body text-on-dark" />
    </Section>
  )
}

/** This program week's runs, each with a Remove that asks once, inline. */
function WeekRuns({ runs, onRemoved }: { runs: Run[]; onRemoved: (id: string) => void }) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null)

  async function remove(id: string) {
    setRemoving(true)
    setProblem(null)
    try {
      await deleteRun(id)
    } catch (e) {
      setProblem({ id, text: `The run was not removed (${errorWords(e)}). Tap Yes, remove to try again.` })
      setRemoving(false)
      return
    }
    setRemoving(false)
    setConfirming(null)
    onRemoved(id)
  }

  return (
    <section aria-label="This week’s runs" className="flex flex-col gap-3 border-t border-on-dark-faint pt-4">
      <h2 className={HEADING}>This week’s runs</h2>
      {runs.length === 0 ? (
        <p className="text-body text-on-dark-dim">Nothing logged this week yet.</p>
      ) : (
        <ul className="flex flex-col">
          {runs.map((run) => {
            const row = runRow(run)
            const asking = confirming === run.id
            return (
              <li key={run.id} className="flex flex-col gap-2 border-t border-on-dark-faint py-3 first:border-t-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-body text-on-dark">
                      {row.when} · {row.what}
                    </span>
                    <span className="text-small text-on-dark-dim">
                      {row.miles} · {row.pain}
                    </span>
                  </div>
                  {asking ? null : (
                    <Button
                      variant="quiet"
                      onClick={() => {
                        setProblem(null)
                        setConfirming(run.id)
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                {asking ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-body text-on-dark">Remove this run?</span>
                    <Button disabled={removing} onClick={() => void remove(run.id)}>
                      {removing ? 'Removing…' : 'Yes, remove'}
                    </Button>
                    <Button variant="quiet" disabled={removing} onClick={() => setConfirming(null)}>
                      Keep it
                    </Button>
                  </div>
                ) : null}
                {problem?.id === run.id ? (
                  <p role="alert" className="text-body text-on-dark">
                    {problem.text}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
